import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const NEUROVERSE_CLI = path.join(REPO_ROOT, "scripts", "neuroverse.mjs");
const DEMO_CLI = path.join(REPO_ROOT, "scripts", "demo-simulation.mjs");

import {
  cleanNodes,
  completeNode,
  ensureStateDir,
  loadAggregatedSnapshot,
  resolveStateDir,
  sanitizeNodeId,
  upsertNode,
  upsertNodeLink,
} from "../scripts/state-store.mjs";

function makeTempStateDir(prefix = "neuroverse-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("resolveStateDir prioritizes explicit arg > env > homedir", () => {
  const prev = process.env.NEUROVERSE_STATE_DIR;
  try {
    process.env.NEUROVERSE_STATE_DIR = "/tmp/neuroverse-env-dir";
    assert.equal(resolveStateDir("/tmp/neuroverse-explicit"), path.resolve("/tmp/neuroverse-explicit"));
    assert.equal(resolveStateDir(), path.resolve("/tmp/neuroverse-env-dir"));
    delete process.env.NEUROVERSE_STATE_DIR;
    assert.equal(resolveStateDir(), path.join(os.homedir(), ".neuroverse", "state"));
  } finally {
    if (prev !== undefined) process.env.NEUROVERSE_STATE_DIR = prev;
    else delete process.env.NEUROVERSE_STATE_DIR;
  }
});

test("sanitizeNodeId rejects path traversal and invalid characters", () => {
  assert.equal(sanitizeNodeId("sess-main_01.alpha"), "sess-main_01.alpha");
  for (const bad of ["", ".", "..", "../etc", "a/b", "a\\b", "a..b", "bad id", "a".repeat(129)]) {
    assert.throws(() => sanitizeNodeId(bad), /Invalid node id/);
  }
});

test("ensureStateDir creates nodes dir and seeds definitions.json", () => {
  const dir = makeTempStateDir();
  try {
    const resolved = ensureStateDir(dir);
    assert.equal(resolved, dir);
    assert.equal(fs.existsSync(path.join(dir, "nodes")), true);
    const defs = JSON.parse(fs.readFileSync(path.join(dir, "definitions.json"), "utf8"));
    assert.equal(defs.schemaVersion, "neuroverse.definitions/v6");
    assert.ok(defs.nodeDefinitions.length >= 3);

    // Verify legacy definitions.json upgrades automatically to v6
    fs.writeFileSync(
      path.join(dir, "definitions.json"),
      JSON.stringify({ schemaVersion: "neuroverse.definitions/v1", nodeDefinitions: [], edgeDefinitions: [] }),
      "utf8"
    );
    ensureStateDir(dir);
    const upgraded = JSON.parse(fs.readFileSync(path.join(dir, "definitions.json"), "utf8"));
    assert.equal(upgraded.schemaVersion, "neuroverse.definitions/v6");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("upsertNode preserves existing fields, auto-populates timestamps, deduplicates toolsUsed", () => {
  const dir = makeTempStateDir();
  try {
    const created = upsertNode(dir, {
      id: "sess-alpha",
      type: "session",
      parentId: "harness-claude",
      label: "Refactor auth",
      status: "running",
      config: { model: "claude-opus-4.6", task: "Harden PKCE" },
      addTools: ["read_file", "grep_search"],
    });

    assert.equal(created.node.schemaVersion, "neuroverse/v1");
    assert.ok(created.node.config.startedAt);
    assert.deepEqual(created.node.config.toolsUsed, ["read_file", "grep_search"]);

    const updated = upsertNode(dir, {
      id: "sess-alpha",
      status: "tool_calling",
      config: { activeTool: "edit_file", progress: "Patching token rotation" },
      addTools: ["grep_search", "edit_file"],
    });

    assert.equal(updated.node.type, "session");
    assert.equal(updated.node.parentId, "harness-claude");
    assert.equal(updated.node.label, "Refactor auth");
    assert.equal(updated.node.config.model, "claude-opus-4.6");
    assert.equal(updated.node.config.startedAt, created.node.config.startedAt);
    assert.equal(updated.node.config.activeTool, "edit_file");
    assert.deepEqual(updated.node.config.toolsUsed, [
      "read_file",
      "grep_search",
      "edit_file",
    ]);

    const completed = completeNode(dir, {
      id: "sess-alpha",
      status: "completed",
      summary: "All auth tests pass",
    });

    assert.equal(completed.node.status, "completed");
    assert.ok(completed.node.config.endedAt);
    assert.equal(completed.node.config.activeTool, null);
    assert.equal(completed.node.config.resultSummary, "All auth tests pass");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadAggregatedSnapshot derives edges, promotes idle harness, tolerates malformed/tmp files", () => {
  const dir = makeTempStateDir();
  try {
    upsertNode(dir, {
      id: "harness-claude",
      type: "harness",
      label: "Claude Code",
      status: "idle",
    });
    upsertNode(dir, {
      id: "sess-01",
      type: "session",
      parentId: "harness-claude",
      label: "Build engine",
      status: "running",
    });
    upsertNode(dir, {
      id: "sub-01",
      type: "subagent",
      parentId: "sess-01",
      label: "Shader lab",
      status: "tool_calling",
    });
    upsertNode(dir, {
      id: "sub-02",
      type: "subagent",
      parentId: "sess-01",
      label: "Test runner",
      status: "completed",
    });
    upsertNodeLink(dir, {
      from: "sub-01",
      to: "sub-02",
      type: "collaborates",
      status: "active",
      label: "Share uniforms",
    });

    // Write a .tmp. file and a malformed JSON file to ensure tolerance
    fs.writeFileSync(path.join(dir, "nodes", "ignore.json.tmp.1234"), "{broken");
    fs.writeFileSync(path.join(dir, "nodes", "corrupt.json"), "{not valid json");

    const origWarn = console.warn;
    console.warn = () => {};
    let snapshot;
    try {
      snapshot = loadAggregatedSnapshot(dir);
    } finally {
      console.warn = origWarn;
    }

    assert.equal(snapshot.nodes.length, 4);
    assert.deepEqual(
      snapshot.nodes.map((n) => n.id),
      ["harness-claude", "sess-01", "sub-01", "sub-02"]
    );

    // Harness promoted in memory while disk stays idle
    assert.equal(snapshot.nodes[0].status, "running");
    const diskHarness = JSON.parse(
      fs.readFileSync(path.join(dir, "nodes", "harness-claude.json"), "utf8")
    );
    assert.equal(diskHarness.status, "idle");

    // 3 hierarchy edges + 1 collaborates edge
    assert.equal(snapshot.edges.length, 4);
    const hier1 = snapshot.edges.find((e) => e.id === "hier:harness-claude->sess-01");
    assert.equal(hier1?.status, "active");
    const hier2 = snapshot.edges.find((e) => e.id === "hier:sess-01->sub-02");
    assert.equal(hier2?.status, "completed");
    const collab = snapshot.edges.find((e) => e.id === "link:sub-01->sub-02:collaborates");
    assert.equal(collab?.status, "active");
    assert.equal(collab?.label, "Share uniforms");

    const cleanRes = cleanNodes(dir);
    assert.equal(cleanRes.removedCount, 5); // 4 valid + 1 corrupt .json
    assert.equal(fs.existsSync(path.join(dir, "definitions.json")), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI neuroverse.mjs supports multi-token --set, --add-tool, link, complete, list, and clean", () => {
  const dir = makeTempStateDir("neuroverse-cli-");
  try {
    const runMhf = (args) =>
      execFileSync(process.execPath, [NEUROVERSE_CLI, ...args, "--state-dir", dir], {
        encoding: "utf8",
      });

    const initOut = JSON.parse(runMhf(["init"]));
    assert.equal(initOut.ok, true);

    const hOut = JSON.parse(
      runMhf([
        "upsert",
        "--id",
        "harness-claude",
        "--type",
        "harness",
        "--label",
        "Claude Code",
        "--status",
        "running",
        "--set",
        "vendor=Anthropic",
        "surface=CLI",
        "workspace=/tmp/repo",
      ])
    );
    assert.equal(hOut.id, "harness-claude");

    runMhf([
      "upsert",
      "--id",
      "sess-main",
      "--type",
      "session",
      "--parent",
      "harness-claude",
      "--label",
      "Fix auth",
      "--status",
      "tool_calling",
      "--set",
      "model=claude-opus-4.6",
      "activeTool=read_file",
      "--add-tool",
      "read_file",
      "grep_search",
    ]);

    runMhf([
      "upsert",
      "--id",
      "sub-01",
      "--type",
      "subagent",
      "--parent",
      "sess-main",
      "--label",
      "Audit tokens",
      "--status",
      "running",
    ]);

    const linkOut = JSON.parse(
      runMhf([
        "link",
        "--from",
        "sub-01",
        "--to",
        "sess-main",
        "--type",
        "collaborates",
        "--status",
        "active",
        "--label",
        "Report finding",
      ])
    );
    assert.equal(linkOut.ok, true);

    const completeOut = JSON.parse(
      runMhf([
        "complete",
        "--id",
        "sub-01",
        "--status",
        "completed",
        "--summary",
        "No issues found",
      ])
    );
    assert.equal(completeOut.status, "completed");

    const listJson = JSON.parse(runMhf(["list", "--json"]));
    assert.equal(listJson.nodes.length, 3);
    const harness = listJson.nodes.find((n) => n.id === "harness-claude");
    assert.equal(harness.config.vendor, "Anthropic");
    assert.equal(harness.config.surface, "CLI");
    assert.equal(harness.config.workspace, "/tmp/repo");

    const sess = listJson.nodes.find((n) => n.id === "sess-main");
    assert.deepEqual(sess.config.toolsUsed, ["read_file", "grep_search"]);

    const sub = listJson.nodes.find((n) => n.id === "sub-01");
    assert.equal(sub.status, "completed");
    assert.equal(sub.config.resultSummary, "No issues found");

    const cleanOut = JSON.parse(runMhf(["clean"]));
    assert.equal(cleanOut.removedCount, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("demo-simulation.mjs --instant seeds 3 harnesses, 5 sessions, 5 subagents, and collaborates links", () => {
  const dir = makeTempStateDir("neuroverse-demo-");
  try {
    const out = execFileSync(
      process.execPath,
      [DEMO_CLI, "--instant", "--state-dir", dir],
      { encoding: "utf8" }
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.mode, "instant");

    const snapshot = loadAggregatedSnapshot(dir);
    const harnesses = snapshot.nodes.filter((n) => n.type === "harness");
    const sessions = snapshot.nodes.filter((n) => n.type === "session");
    const subagents = snapshot.nodes.filter((n) => n.type === "subagent");
    const collabEdges = snapshot.edges.filter((e) => e.type === "collaborates");

    assert.equal(harnesses.length, 3);
    assert.equal(sessions.length, 5);
    assert.equal(subagents.length, 5);
    assert.ok(collabEdges.length >= 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("demo-simulation.mjs --massive seeds 160+ nodes across 5 harnesses with historical and active contrast", () => {
  const dir = makeTempStateDir("neuroverse-massive-");
  try {
    const out = execFileSync(
      process.execPath,
      [DEMO_CLI, "--massive", "--state-dir", dir],
      { encoding: "utf8" }
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.mode, "massive");
    assert.ok(parsed.counts.totalNodes >= 150);

    const snapshot = loadAggregatedSnapshot(dir);
    assert.equal(snapshot.nodes.length, parsed.counts.totalNodes);
    assert.ok(snapshot.edges.length >= 160);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("inactive subagent expires after TTL while active subagent and completed session persist", () => {
  const dir = makeTempStateDir("neuroverse-ttl-");
  try {
    upsertNode(dir, {
      id: "sess-keep",
      type: "session",
      label: "Completed Session",
      status: "completed",
      config: { endedAt: "2026-11-25T00:00:00.000Z" },
    });
    upsertNode(dir, {
      id: "sub-active",
      type: "subagent",
      parentId: "sess-keep",
      label: "Active Worker",
      status: "running",
      config: { ttlSeconds: 1 },
    });
    upsertNode(dir, {
      id: "sub-expired",
      type: "subagent",
      parentId: "sess-keep",
      label: "Finished Worker",
      status: "completed",
      config: {
        endedAt: "2026-11-25T00:00:00.000Z",
        ttlSeconds: 5,
      },
    });
    upsertNode(dir, {
      id: "sub-fresh",
      type: "subagent",
      parentId: "sess-keep",
      label: "Freshly Finished Worker",
      status: "completed",
      config: {
        endedAt: "2026-11-25T00:00:08.000Z",
        ttlSeconds: 10,
      },
    });

    const evalNow = Date.parse("2026-11-25T00:00:10.000Z");
    const snapshot = loadAggregatedSnapshot(dir, { nowMs: evalNow });
    const ids = snapshot.nodes.map((n) => n.id);

    assert.equal(ids.includes("sess-keep"), true);
    assert.equal(ids.includes("sub-active"), true);
    assert.equal(ids.includes("sub-fresh"), true);
    assert.equal(ids.includes("sub-expired"), false);
    assert.equal(fs.existsSync(path.join(dir, "nodes", "sub-expired.json")), false);

    const freshNode = snapshot.nodes.find((n) => n.id === "sub-fresh");
    assert.equal(freshNode.expiresAt, "2026-11-25T00:00:18.000Z");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
