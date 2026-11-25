#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  cleanNodes,
  completeNode,
  ensureStateDir,
  loadAggregatedSnapshot,
  resolveStateDir,
  upsertNode,
  upsertNodeLink,
  writeJsonAtomic,
} from "./state-store.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsage() {
  console.log(`Neuroverse CLI (neuroverse)

Usage:
  node scripts/neuroverse.mjs <command> [options]

Commands:
  init      [--state-dir <path>]
  upsert    --id <id> [--type harness|session|subagent] [--parent <parentId>]
            [--label <text>] [--status <status>] [--set k=v ...] [--add-tool <name> ...]
  link      --from <id> --to <id> [--type collaborates] [--status active] [--label <text>]
  complete  --id <id> [--status completed|error] [--summary <text>]
  list      [--state-dir <path>] [--json]
  clean     [--state-dir <path>]
  serve     [--port 4399] [--host 127.0.0.1] [--state-dir <path>] [--daemon]
  status    [--port 4399] [--host 127.0.0.1] [--state-dir <path>]
`);
}

function coerceConfigValue(raw) {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

function parseCommandArgs(argv) {
  const positionals = [];
  const flags = {};
  const setPairs = [];
  const addTools = [];

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positionals.push(token);
      i += 1;
      continue;
    }

    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (token === "--set") {
      i += 1;
      while (i < argv.length && !argv[i].startsWith("--")) {
        setPairs.push(argv[i]);
        i += 1;
      }
      continue;
    }

    if (token.startsWith("--set=")) {
      setPairs.push(token.slice("--set=".length));
      i += 1;
      continue;
    }

    if (token === "--add-tool") {
      i += 1;
      while (i < argv.length && !argv[i].startsWith("--")) {
        addTools.push(argv[i]);
        i += 1;
      }
      continue;
    }

    if (token.startsWith("--add-tool=")) {
      addTools.push(token.slice("--add-tool=".length));
      i += 1;
      continue;
    }

    const eqIdx = token.indexOf("=");
    if (eqIdx > 2) {
      const key = token.slice(2, eqIdx);
      const val = token.slice(eqIdx + 1);
      flags[key] = val;
      i += 1;
      continue;
    }

    const key = token.slice(2);
    if (key === "json" || key === "daemon" || key === "help") {
      flags[key] = true;
      i += 1;
      continue;
    }

    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      flags[key] = argv[i + 1];
      i += 2;
    } else {
      flags[key] = true;
      i += 1;
    }
  }

  return { positionals, flags, setPairs, addTools };
}

function parseSetPairs(pairs) {
  const config = {};
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx <= 0) {
      throw new Error(`Invalid --set entry "${pair}". Expected key=value.`);
    }
    const key = pair.slice(0, eqIdx).trim();
    const rawVal = pair.slice(eqIdx + 1);
    config[key] = coerceConfigValue(rawVal);
  }
  return config;
}

function probeHealth(host, port, timeoutMs = 450) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: host,
        port: Number(port),
        path: "/api/health",
        timeout: timeoutMs,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              resolve({ ok: true, data: JSON.parse(body) });
              return;
            } catch {
              resolve({ ok: true, data: null });
              return;
            }
          }
          resolve({ ok: false });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false });
    });
    req.on("error", () => resolve({ ok: false }));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTable(nodes) {
  if (nodes.length === 0) {
    return "No nodes found.";
  }
  const cols = [
    ["ID", (n) => n.id],
    ["TYPE", (n) => n.type],
    ["STATUS", (n) => n.status],
    ["PARENT", (n) => n.parentId ?? "-"],
    ["LABEL", (n) => n.label],
  ];
  const widths = cols.map(([header, getter]) =>
    Math.max(header.length, ...nodes.map((n) => String(getter(n)).length))
  );
  const renderRow = (values) =>
    values.map((v, idx) => String(v).padEnd(widths[idx])).join("  ");
  const lines = [
    renderRow(cols.map(([h]) => h)),
    renderRow(widths.map((w) => "-".repeat(w))),
    ...nodes.map((n) => renderRow(cols.map(([, g]) => g(n)))),
  ];
  return lines.join("\n");
}

async function main() {
  const { positionals, flags, setPairs, addTools } = parseCommandArgs(
    process.argv.slice(2)
  );
  const command = positionals[0];

  if (!command || command === "help" || flags.help) {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  const explicitStateDir =
    typeof flags["state-dir"] === "string" ? flags["state-dir"] : undefined;

  switch (command) {
    case "init": {
      const stateDir = ensureStateDir(explicitStateDir);
      console.log(JSON.stringify({ ok: true, stateDir }));
      return;
    }

    case "upsert": {
      const id = typeof flags.id === "string" ? flags.id : undefined;
      if (!id) {
        throw new Error("upsert requires --id <id>");
      }
      const patch = { id };
      if (typeof flags.type === "string") patch.type = flags.type;
      if (flags.parent !== undefined) {
        patch.parentId = flags.parent === "null" ? null : String(flags.parent);
      }
      if (typeof flags.label === "string") patch.label = flags.label;
      if (typeof flags.status === "string") patch.status = flags.status;
      if (setPairs.length > 0) patch.config = parseSetPairs(setPairs);
      if (flags.ttl !== undefined) {
        patch.config = { ...(patch.config ?? {}), ttlSeconds: Number(flags.ttl) };
      }
      if (addTools.length > 0) patch.addTools = addTools;

      const { node, path: nodePath } = upsertNode(explicitStateDir, patch);
      console.log(
        JSON.stringify({
          ok: true,
          id: node.id,
          status: node.status,
          path: nodePath,
        })
      );
      return;
    }

    case "link": {
      const from = typeof flags.from === "string" ? flags.from : undefined;
      const to = typeof flags.to === "string" ? flags.to : undefined;
      if (!from || !to) {
        throw new Error("link requires --from <sourceId> and --to <targetId>");
      }
      const type = typeof flags.type === "string" ? flags.type : "collaborates";
      const status = typeof flags.status === "string" ? flags.status : "active";
      const label = typeof flags.label === "string" ? flags.label : undefined;

      const { path: nodePath } = upsertNodeLink(explicitStateDir, {
        from,
        to,
        type,
        status,
        label,
      });
      console.log(
        JSON.stringify({
          ok: true,
          from,
          to,
          type,
          status,
          path: nodePath,
        })
      );
      return;
    }

    case "complete": {
      const id = typeof flags.id === "string" ? flags.id : undefined;
      if (!id) {
        throw new Error("complete requires --id <id>");
      }
      const status = typeof flags.status === "string" ? flags.status : "completed";
      const summary = typeof flags.summary === "string" ? flags.summary : undefined;
      const ttlSeconds = flags.ttl !== undefined ? Number(flags.ttl) : undefined;
      const { node, path: nodePath } = completeNode(explicitStateDir, {
        id,
        status,
        summary,
        ttlSeconds,
      });
      console.log(
        JSON.stringify({
          ok: true,
          id: node.id,
          status: node.status,
          path: nodePath,
        })
      );
      return;
    }

    case "list": {
      const snapshot = loadAggregatedSnapshot(explicitStateDir);
      if (flags.json) {
        console.log(JSON.stringify(snapshot, null, 2));
      } else {
        console.log(formatTable(snapshot.nodes));
      }
      return;
    }

    case "clean": {
      const res = cleanNodes(explicitStateDir);
      console.log(JSON.stringify(res));
      return;
    }

    case "serve": {
      const host = typeof flags.host === "string" ? flags.host : "127.0.0.1";
      const port = Number(flags.port ?? 4399);
      const stateDir = ensureStateDir(explicitStateDir);
      const url = `http://${host}:${port}`;

      if (flags.daemon) {
        const existingHealth = await probeHealth(host, port);
        if (existingHealth.ok) {
          let existingPid = null;
          const serverMetaPath = path.join(stateDir, "server.json");
          if (fs.existsSync(serverMetaPath)) {
            try {
              existingPid = JSON.parse(fs.readFileSync(serverMetaPath, "utf8")).pid ?? null;
            } catch {
              // ignore
            }
          }
          console.log(
            JSON.stringify({
              ok: true,
              url,
              pid: existingPid,
              alreadyRunning: true,
            })
          );
          return;
        }

        const serverScript = path.join(__dirname, "server.mjs");
        const child = spawn(
          process.execPath,
          [
            serverScript,
            "--host",
            host,
            "--port",
            String(port),
            "--state-dir",
            stateDir,
          ],
          {
            detached: true,
            stdio: "ignore",
          }
        );
        child.unref();

        const serverMeta = {
          pid: child.pid,
          host,
          port,
          startedAt: new Date().toISOString(),
          url,
        };
        writeJsonAtomic(path.join(stateDir, "server.json"), serverMeta);

        let healthy = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await sleep(75);
          const check = await probeHealth(host, port, 300);
          if (check.ok) {
            healthy = true;
            break;
          }
        }

        if (!healthy) {
          throw new Error(`Daemon failed to respond at ${url}/api/health within 1.5s`);
        }

        console.log(
          JSON.stringify({
            ok: true,
            url,
            pid: child.pid,
          })
        );
        return;
      }

      const { startServer } = await import("./server.mjs");
      const started = await startServer({ port, host, stateDir });
      writeJsonAtomic(path.join(stateDir, "server.json"), {
        pid: process.pid,
        host: started.host,
        port: started.port,
        startedAt: new Date().toISOString(),
        url: started.url,
      });
      console.log(
        `[neuroverse] Neuroverse server listening at ${started.url} (stateDir: ${stateDir})`
      );
      return;
    }

    case "status": {
      const stateDir = resolveStateDir(explicitStateDir);
      let host = typeof flags.host === "string" ? flags.host : "127.0.0.1";
      let port = flags.port !== undefined ? Number(flags.port) : 4399;
      let pid = null;

      const serverMetaPath = path.join(stateDir, "server.json");
      if (fs.existsSync(serverMetaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(serverMetaPath, "utf8"));
          if (flags.host === undefined && meta.host) host = meta.host;
          if (flags.port === undefined && meta.port) port = Number(meta.port);
          pid = meta.pid ?? null;
        } catch {
          // ignore corrupt server.json
        }
      }

      const url = `http://${host}:${port}`;
      const probe = await probeHealth(host, port);
      const snapshot = loadAggregatedSnapshot(stateDir);
      console.log(
        JSON.stringify({
          running: probe.ok,
          url,
          stateDir,
          nodeCount: snapshot.nodes.length,
          ...(pid !== null ? { pid } : {}),
        })
      );
      return;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((err) => {
  console.error(`[neuroverse] Error: ${err.message}`);
  process.exit(1);
});
