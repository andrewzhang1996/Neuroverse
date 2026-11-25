import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  REPO_ROOT,
  cleanNodes,
  ensureStateDir,
  loadAggregatedSnapshot,
  pruneExpiredSubagents,
} from "./state-store.mjs";
import {
  getDemoMode,
  isDemoRunning,
  runDemoScenario,
  seedMassiveConnectome,
  seedStaticShowcase,
  startContinuousDemo,
  stopContinuousDemo,
} from "./demo-simulation.mjs";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function computeStateFingerprint(stateDir) {
  const nodesDir = path.join(stateDir, "nodes");
  let count = 0;
  let maxMtime = 0;
  try {
    for (const entry of fs.readdirSync(nodesDir)) {
      if (!entry.endsWith(".json") || entry.includes(".tmp.")) continue;
      count += 1;
      try {
        const stat = fs.statSync(path.join(nodesDir, entry));
        if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
      } catch {
        // file may have been removed mid-scan
      }
    }
  } catch {
    // ignore missing dir
  }

  let defsMtime = 0;
  try {
    defsMtime = fs.statSync(path.join(stateDir, "definitions.json")).mtimeMs;
  } catch {
    // ignore
  }

  return `${count}:${maxMtime}:${defsMtime}`;
}

/**
 * Watch <stateDir> and <stateDir>/nodes and broadcast debounced SSE snapshots.
 */
export function createStateWatcherHub(explicitDir) {
  const stateDir = ensureStateDir(explicitDir);
  const nodesDir = path.join(stateDir, "nodes");
  const clients = new Set();

  let debounceTimer = null;
  let closed = false;
  let lastFingerprint = computeStateFingerprint(stateDir);

  function sendSseSnapshot(res, snapshotJson) {
    try {
      res.write(`event: snapshot\ndata: ${snapshotJson}\n\n`);
    } catch {
      clients.delete(res);
    }
  }

  function broadcastNow() {
    if (closed) return;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    lastFingerprint = computeStateFingerprint(stateDir);
    if (clients.size === 0) return;

    const snapshot = loadAggregatedSnapshot(stateDir);
    const json = JSON.stringify(snapshot);
    for (const client of clients) {
      sendSseSnapshot(client, json);
    }
  }

  function scheduleBroadcast() {
    if (closed) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      broadcastNow();
    }, 60);
    debounceTimer.unref?.();
  }

  const watchers = [];
  const handleFsEvent = (_eventType, filename) => {
    if (typeof filename === "string") {
      if (filename.includes(".tmp.") || filename === "server.json") return;
    }
    scheduleBroadcast();
  };

  try {
    watchers.push(fs.watch(nodesDir, handleFsEvent));
  } catch (err) {
    console.warn(`[neuroverse-server] Unable to watch ${nodesDir}: ${err.message}`);
  }
  try {
    watchers.push(fs.watch(stateDir, handleFsEvent));
  } catch (err) {
    console.warn(`[neuroverse-server] Unable to watch ${stateDir}: ${err.message}`);
  }

  const ttlSweep = setInterval(() => {
    if (closed) return;
    const { prunedIds } = pruneExpiredSubagents(stateDir);
    if (prunedIds.length > 0) {
      broadcastNow();
    }
  }, 1000);
  ttlSweep.unref?.();

  const fallbackPoll = setInterval(() => {
    if (closed) return;
    const nextFp = computeStateFingerprint(stateDir);
    if (nextFp !== lastFingerprint) {
      lastFingerprint = nextFp;
      broadcastNow();
    }
  }, 2500);
  fallbackPoll.unref?.();

  const heartbeat = setInterval(() => {
    if (closed || clients.size === 0) return;
    for (const client of clients) {
      try {
        client.write(": heartbeat\n\n");
      } catch {
        clients.delete(client);
      }
    }
  }, 15000);
  heartbeat.unref?.();

  function subscribe(req, res) {
    if (closed) {
      res.writeHead(503);
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    clients.add(res);
    const snapshot = loadAggregatedSnapshot(stateDir);
    sendSseSnapshot(res, JSON.stringify(snapshot));

    const cleanup = () => {
      clients.delete(res);
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
  }

  function close() {
    if (closed) return;
    closed = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    clearInterval(ttlSweep);
    clearInterval(fallbackPoll);
    clearInterval(heartbeat);
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        // ignore
      }
    }
    watchers.length = 0;
    for (const client of clients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    clients.clear();
  }

  return {
    stateDir,
    subscribe,
    broadcastNow,
    close,
  };
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

/**
 * Reusable HTTP middleware for both standalone server and Vite dev server.
 */
export function createApiMiddleware({ stateDir: explicitDir, hub }) {
  const stateDir = ensureStateDir(explicitDir);

  return function mhfApiMiddleware(req, res, next) {
    const reqUrl = req.url ?? "/";
    let pathname = "/";
    try {
      pathname = new URL(reqUrl, "http://127.0.0.1").pathname;
    } catch {
      pathname = reqUrl.split("?")[0];
    }

    if (!pathname.startsWith("/api/")) {
      if (typeof next === "function") next();
      return false;
    }

    const method = (req.method ?? "GET").toUpperCase();

    if (method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        stateDir,
        demoMode: getDemoMode(),
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    if (method === "GET" && pathname === "/api/snapshot") {
      const snapshot = loadAggregatedSnapshot(stateDir);
      sendJson(res, 200, snapshot);
      return true;
    }

    if (method === "GET" && pathname === "/api/events") {
      hub.subscribe(req, res);
      return true;
    }

    if (method === "POST" && pathname === "/api/demo/start") {
      if (!isDemoRunning()) {
        runDemoScenario({ stateDir, speedMultiplier: 1 }).catch((err) => {
          console.error(`[neuroverse-server] Demo scenario error: ${err.message}`);
        });
      }
      sendJson(res, 200, { ok: true, running: true });
      return true;
    }

    if (method === "POST" && pathname === "/api/demo/seed") {
      seedStaticShowcase(stateDir);
      hub.broadcastNow();
      sendJson(res, 200, { ok: true, stateDir });
      return true;
    }

    if (method === "POST" && pathname === "/api/demo/massive") {
      const result = seedMassiveConnectome(stateDir);
      hub.broadcastNow();
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && pathname === "/api/demo/stream/start") {
      const result = startContinuousDemo({ stateDir });
      hub.broadcastNow();
      sendJson(res, 200, result);
      return true;
    }

    if (method === "POST" && pathname === "/api/demo/stream/stop") {
      const stopped = stopContinuousDemo();
      sendJson(res, 200, { ok: true, stopped, demoMode: getDemoMode() });
      return true;
    }

    if (method === "POST" && pathname === "/api/state/clean") {
      stopContinuousDemo();
      const result = cleanNodes(stateDir);
      hub.broadcastNow();
      sendJson(res, 200, result);
      return true;
    }

    sendJson(res, 404, { ok: false, error: `Not found: ${method} ${pathname}` });
    return true;
  };
}

function serveStaticAsset(req, res, distDir) {
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  const resolvedDist = path.resolve(distDir);
  if (!fs.existsSync(resolvedDist)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Frontend dist/ not built yet. Run `npm run build` or `npm run dev`.");
    return;
  }

  const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let targetPath = path.resolve(resolvedDist, relPath);

  if (targetPath !== resolvedDist && !targetPath.startsWith(resolvedDist + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
    const spaFallback = path.join(resolvedDist, "index.html");
    if (fs.existsSync(spaFallback) && !path.extname(relPath)) {
      targetPath = spaFallback;
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
  }

  const ext = path.extname(targetPath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const body = fs.readFileSync(targetPath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length,
  });
  if (method === "HEAD") {
    res.end();
  } else {
    res.end(body);
  }
}

/**
 * Start the standalone Neuroverse HTTP + SSE + static server.
 */
export function startServer({
  port = 4399,
  host = "127.0.0.1",
  stateDir: explicitDir,
  distDir = path.join(REPO_ROOT, "dist"),
} = {}) {
  const stateDir = ensureStateDir(explicitDir);
  const hub = createStateWatcherHub(stateDir);
  const apiMiddleware = createApiMiddleware({ stateDir, hub });

  const server = http.createServer((req, res) => {
    apiMiddleware(req, res, () => serveStaticAsset(req, res, distDir));
  });

  return new Promise((resolve, reject) => {
    server.once("error", (err) => {
      hub.close();
      reject(err);
    });

    server.listen(port, host, () => {
      const address = server.address();
      const actualPort =
        address && typeof address === "object" ? address.port : Number(port);
      const url = `http://${host}:${actualPort}`;

      const close = () =>
        new Promise((resolveClose) => {
          stopContinuousDemo();
          hub.close();
          server.close(() => resolveClose());
        });

      resolve({
        server,
        hub,
        host,
        port: actualPort,
        stateDir,
        url,
        close,
      });
    });
  });
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  let host = "127.0.0.1";
  let port = 4399;
  let stateDir;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--host" && args[i + 1]) {
      host = args[i + 1];
      i += 1;
    } else if (args[i] === "--port" && args[i + 1]) {
      port = Number(args[i + 1]);
      i += 1;
    } else if (args[i] === "--state-dir" && args[i + 1]) {
      stateDir = args[i + 1];
      i += 1;
    }
  }

  startServer({ host, port, stateDir })
    .then((started) => {
      const shutdown = async () => {
        await started.close();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      console.error(`[neuroverse-server] Failed to start: ${err.message}`);
      process.exit(1);
    });
}
