import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { startServer } from "../scripts/server.mjs";
import { upsertNode } from "../scripts/state-store.mjs";

function makeTempStateDir(prefix = "neuroverse-srv-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function connectSse(url) {
  return new Promise((resolve, reject) => {
    const events = [];
    const waiters = [];
    let buffer = "";

    const req = http.get(url, (res) => {
      assert.equal(res.statusCode, 200);
      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        buffer += chunk;
        let sepIdx;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          if (!frame || frame.startsWith(":")) continue;

          let eventName = "message";
          const dataLines = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) {
              eventName = line.slice("event:".length).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice("data:".length).trimStart());
            }
          }
          if (dataLines.length > 0) {
            const parsed = {
              event: eventName,
              data: JSON.parse(dataLines.join("\n")),
              receivedAt: Date.now(),
            };
            events.push(parsed);
            while (waiters.length > 0) {
              const waiter = waiters.shift();
              waiter(parsed);
            }
          }
        }
      });

      resolve({
        events,
        nextEvent(predicate, timeoutMs = 1000) {
          const existing = events.find(predicate);
          if (existing) return Promise.resolve(existing);
          return new Promise((resWait, rejWait) => {
            const timer = setTimeout(() => {
              rejWait(new Error(`Timed out after ${timeoutMs}ms waiting for SSE event`));
            }, timeoutMs);
            const check = (ev) => {
              if (predicate(ev)) {
                clearTimeout(timer);
                resWait(ev);
              } else {
                waiters.push(check);
              }
            };
            waiters.push(check);
          });
        },
        close() {
          req.destroy();
        },
      });
    });

    req.on("error", reject);
  });
}

test("server exposes /api/health, /api/snapshot, /api/events SSE push <500ms, and seed/clean endpoints", async () => {
  const dir = makeTempStateDir();
  const distDir = makeTempStateDir("neuroverse-dist-");
  fs.writeFileSync(path.join(distDir, "index.html"), "<!doctype html><html></html>");

  const srv = await startServer({
    port: 0,
    host: "127.0.0.1",
    stateDir: dir,
    distDir,
  });

  const sse = await connectSse(`${srv.url}/api/events`);

  try {
    const healthRes = await fetch(`${srv.url}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.stateDir, dir);

    const initialEv = await sse.nextEvent((ev) => ev.event === "snapshot", 500);
    assert.equal(initialEv.data.nodes.length, 0);

    const writeStart = Date.now();
    upsertNode(dir, {
      id: "sess-live-sse",
      type: "session",
      label: "Live SSE Test",
      status: "running",
    });

    const liveEv = await sse.nextEvent(
      (ev) => ev.data.nodes.some((n) => n.id === "sess-live-sse"),
      500
    );
    const elapsed = liveEv.receivedAt - writeStart;
    assert.ok(elapsed < 500, `Expected SSE push <500ms, got ${elapsed}ms`);

    const seedRes = await fetch(`${srv.url}/api/demo/seed`, { method: "POST" });
    assert.equal(seedRes.status, 200);
    const seedEv = await sse.nextEvent(
      (ev) => ev.data.nodes.some((n) => n.id === "harness-claude-code"),
      500
    );
    assert.ok(seedEv.data.nodes.length >= 13);

    const snapRes = await fetch(`${srv.url}/api/snapshot`);
    assert.equal(snapRes.status, 200);
    const snapJson = await snapRes.json();
    assert.equal(snapJson.nodes.length, seedEv.data.nodes.length);

    const cleanRes = await fetch(`${srv.url}/api/state/clean`, { method: "POST" });
    assert.equal(cleanRes.status, 200);
    await sse.nextEvent((ev) => ev.data.nodes.length === 0, 500);

    // Verify continuous dynamic stream start & stop endpoints
    const streamStartRes = await fetch(`${srv.url}/api/demo/stream/start`, {
      method: "POST",
    });
    assert.equal(streamStartRes.status, 200);
    const streamEv = await sse.nextEvent(
      (ev) => ev.data.nodes.length >= 20,
      1200
    );
    assert.ok(streamEv.data.nodes.length >= 20);

    const streamStopRes = await fetch(`${srv.url}/api/demo/stream/stop`, {
      method: "POST",
    });
    assert.equal(streamStopRes.status, 200);
    const stopJson = await streamStopRes.json();
    assert.equal(stopJson.stopped, true);

    const htmlRes = await fetch(`${srv.url}/index.html`);
    assert.equal(htmlRes.status, 200);
  } finally {
    sse.close();
    await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(distDir, { recursive: true, force: true });
  }
});
