import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, "..");
export const DEFAULT_DEFINITIONS_PATH = path.join(
  REPO_ROOT,
  "references",
  "default-definitions.json"
);

export const SCHEMA_VERSION = "neuroverse/v1";

const NODE_ID_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * Resolve the Neuroverse state directory path.
 */
export function resolveStateDir(explicitDir) {
  if (explicitDir) return path.resolve(explicitDir);
  if (process.env.NEUROVERSE_STATE_DIR) return path.resolve(process.env.NEUROVERSE_STATE_DIR);
  return path.join(os.homedir(), ".neuroverse", "state");
}

/**
 * Validate and return a safe node identifier.
 */
export function sanitizeNodeId(id) {
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id.length > 128 ||
    id === "." ||
    id === ".." ||
    id.includes("..") ||
    id.includes("/") ||
    id.includes("\\") ||
    !NODE_ID_RE.test(id)
  ) {
    throw new Error(`Invalid node id: ${String(id)}`);
  }
  return id;
}

/**
 * Atomically write JSON data via a temp sibling file and renameSync.
 */
export function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const nonce = `${process.pid}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpPath = `${filePath}.tmp.${nonce}`;
  const payload = JSON.stringify(data, null, 2) + "\n";
  try {
    fs.writeFileSync(tmpPath, payload, "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

/**
 * Read default definitions shipped in references/default-definitions.json.
 */
export function readDefaultDefinitions() {
  const raw = fs.readFileSync(DEFAULT_DEFINITIONS_PATH, "utf8");
  return JSON.parse(raw);
}

/**
 * Ensure state directory, nodes subdirectory, and definitions.json exist.
 */
export function ensureStateDir(explicitDir) {
  const stateDir = resolveStateDir(explicitDir);
  const nodesDir = path.join(stateDir, "nodes");
  fs.mkdirSync(nodesDir, { recursive: true });

  const defsPath = path.join(stateDir, "definitions.json");
  if (!fs.existsSync(defsPath)) {
    const defaults = readDefaultDefinitions();
    writeJsonAtomic(defsPath, defaults);
  } else {
    try {
      const existingDefs = JSON.parse(fs.readFileSync(defsPath, "utf8"));
      if (
        existingDefs?.schemaVersion &&
        existingDefs.schemaVersion !== "neuroverse.definitions/v6" &&
        String(existingDefs.schemaVersion).startsWith("neuroverse.definitions/v")
      ) {
        writeJsonAtomic(defsPath, readDefaultDefinitions());
      }
    } catch {
      // loadDefinitionsSafe will handle fallback if malformed
    }
  }

  return stateDir;
}

function readNodeFileSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    console.warn(`[neuroverse] Skipping malformed node file ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Create or partially update a node JSON file atomically.
 */
export function upsertNode(explicitDir, patch) {
  if (!patch || typeof patch !== "object") {
    throw new Error("Node patch object is required");
  }
  const stateDir = ensureStateDir(explicitDir);
  const id = sanitizeNodeId(patch.id);
  const filePath = path.join(stateDir, "nodes", `${id}.json`);
  const existing = readNodeFileSafe(filePath);
  const now = new Date().toISOString();

  const status = patch.status ?? existing?.status ?? "running";
  const type = patch.type ?? existing?.type ?? "session";
  const parentId =
    patch.parentId !== undefined
      ? patch.parentId === null
        ? null
        : sanitizeNodeId(patch.parentId)
      : existing?.parentId ?? null;
  const label = patch.label ?? existing?.label ?? id;

  const mergedConfig = {
    ...(existing?.config && typeof existing.config === "object" ? existing.config : {}),
    ...(patch.config && typeof patch.config === "object" ? patch.config : {}),
  };

  if ((status === "running" || status === "tool_calling") && !mergedConfig.startedAt) {
    mergedConfig.startedAt = now;
  }

  if (Array.isArray(patch.addTools) && patch.addTools.length > 0) {
    const existingTools = Array.isArray(mergedConfig.toolsUsed)
      ? [...mergedConfig.toolsUsed]
      : [];
    const seen = new Set(existingTools);
    for (const tool of patch.addTools) {
      if (typeof tool === "string" && tool.length > 0 && !seen.has(tool)) {
        seen.add(tool);
        existingTools.push(tool);
      }
    }
    mergedConfig.toolsUsed = existingTools;
  }

  if (status === "completed" || status === "error") {
    if (patch.config?.endedAt === undefined) {
      mergedConfig.endedAt =
        existing?.status === status && existing?.config?.endedAt
          ? existing.config.endedAt
          : now;
    }
    if (patch.config?.activeTool === undefined) {
      mergedConfig.activeTool = null;
    }
  }

  let links = Array.isArray(existing?.links) ? existing.links.map((l) => ({ ...l })) : [];
  if (Array.isArray(patch.links)) {
    links = patch.links.map((l) => ({ ...l }));
  }
  if (patch.upsertLink && typeof patch.upsertLink === "object") {
    const target = sanitizeNodeId(patch.upsertLink.target);
    const linkType = patch.upsertLink.type ?? "collaborates";
    const linkStatus = patch.upsertLink.status ?? "active";
    const idx = links.findIndex(
      (l) => l.target === target && (l.type ?? "collaborates") === linkType
    );
    const nextLink = {
      ...(idx >= 0 ? links[idx] : {}),
      ...(patch.upsertLink.id !== undefined ? { id: patch.upsertLink.id } : {}),
      target,
      type: linkType,
      status: linkStatus,
      ...(patch.upsertLink.label !== undefined ? { label: patch.upsertLink.label } : {}),
    };
    if (idx >= 0) {
      links[idx] = nextLink;
    } else {
      links.push(nextLink);
    }
  }

  const metadata = {
    ...(existing?.metadata && typeof existing.metadata === "object"
      ? existing.metadata
      : {}),
    ...(patch.metadata && typeof patch.metadata === "object" ? patch.metadata : {}),
  };

  const node = {
    schemaVersion: SCHEMA_VERSION,
    id,
    type,
    parentId,
    label,
    status,
    updatedAt: now,
    config: mergedConfig,
    links,
    metadata,
  };

  writeJsonAtomic(filePath, node);
  return { node, path: filePath };
}

/**
 * Upsert a directed synaptic link on `from` targeting `to`.
 */
export function upsertNodeLink(
  explicitDir,
  { from, to, type = "collaborates", status = "active", label }
) {
  const sourceId = sanitizeNodeId(from);
  const targetId = sanitizeNodeId(to);
  return upsertNode(explicitDir, {
    id: sourceId,
    upsertLink: {
      target: targetId,
      type,
      status,
      ...(label !== undefined ? { label } : {}),
    },
  });
}

/**
 * Mark a node completed or errored cleanly.
 */
export function completeNode(
  explicitDir,
  { id, status = "completed", summary, ttlSeconds }
) {
  const configPatch = {};
  if (summary !== undefined) {
    configPatch.resultSummary = summary;
  }
  if (ttlSeconds !== undefined) {
    configPatch.ttlSeconds = Number(ttlSeconds);
  }
  return upsertNode(explicitDir, {
    id,
    status,
    config: configPatch,
  });
}

/**
 * Remove all node JSON files in <stateDir>/nodes/ while keeping definitions.json.
 */
export function cleanNodes(explicitDir) {
  const stateDir = ensureStateDir(explicitDir);
  const nodesDir = path.join(stateDir, "nodes");
  let removedCount = 0;
  for (const entry of fs.readdirSync(nodesDir)) {
    if (entry.endsWith(".json") || entry.includes(".tmp.")) {
      fs.unlinkSync(path.join(nodesDir, entry));
      if (entry.endsWith(".json") && !entry.includes(".tmp.")) {
        removedCount += 1;
      }
    }
  }
  return { ok: true, stateDir, removedCount };
}

function loadDefinitionsSafe(stateDir) {
  const defsPath = path.join(stateDir, "definitions.json");
  try {
    const raw = fs.readFileSync(defsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.nodeDefinitions) &&
      Array.isArray(parsed.edgeDefinitions)
    ) {
      return parsed;
    }
    console.warn(`[neuroverse] Malformed definitions.json at ${defsPath}; using defaults`);
  } catch (err) {
    console.warn(`[neuroverse] Failed reading definitions.json at ${defsPath}: ${err.message}`);
  }
  return readDefaultDefinitions();
}

function deriveHierarchyEdgeStatus(nodeStatus) {
  if (nodeStatus === "running" || nodeStatus === "tool_calling") return "active";
  if (nodeStatus === "error") return "error";
  if (nodeStatus === "completed") return "completed";
  return "default";
}

function getOrbitTier(definitions, type) {
  const found = definitions.nodeDefinitions.find((d) => d.type === type);
  if (found && typeof found.orbitTier === "number") return found.orbitTier;
  if (type === "harness") return 0;
  if (type === "session") return 1;
  if (type === "subagent") return 2;
  return 3;
}

export const DEFAULT_SUBAGENT_TTL_SECONDS = 30;

function isInactiveSubagentStatus(status) {
  return status === "completed" || status === "idle" || status === "error";
}

/**
 * Compute epoch timestamp (ms) when an inactive subagent expires, or null if it does not expire.
 */
export function computeSubagentExpiresAtMs(node, definitions) {
  if (!node || node.type !== "subagent" || !isInactiveSubagentStatus(node.status)) {
    return null;
  }

  let ttlSec = null;
  const cfgTtl = node.config?.ttlSeconds;
  if (cfgTtl !== undefined && cfgTtl !== null && cfgTtl !== "") {
    const parsed = Number(cfgTtl);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    ttlSec = parsed;
  } else if (process.env.MHF_SUBAGENT_TTL_SEC !== undefined) {
    const parsed = Number(process.env.MHF_SUBAGENT_TTL_SEC);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    ttlSec = parsed;
  } else {
    const subDef = definitions?.nodeDefinitions?.find((d) => d.type === "subagent");
    ttlSec =
      typeof subDef?.ttlSeconds === "number"
        ? subDef.ttlSeconds
        : DEFAULT_SUBAGENT_TTL_SECONDS;
  }

  const refIso = node.config?.endedAt || node.updatedAt;
  const refMs = typeof refIso === "string" ? Date.parse(refIso) : NaN;
  if (!Number.isFinite(refMs)) return null;

  return refMs + ttlSec * 1000;
}

/**
 * Unlink any inactive subagent node files whose TTL has elapsed.
 */
export function pruneExpiredSubagents(explicitDir, nowMs = Date.now()) {
  const stateDir = ensureStateDir(explicitDir);
  const definitions = loadDefinitionsSafe(stateDir);
  const nodesDir = path.join(stateDir, "nodes");
  const prunedIds = [];

  for (const entry of fs.readdirSync(nodesDir)) {
    if (!entry.endsWith(".json") || entry.includes(".tmp.")) continue;
    const fullPath = path.join(nodesDir, entry);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const expiresAtMs = computeSubagentExpiresAtMs(parsed, definitions);
      if (expiresAtMs !== null && nowMs >= expiresAtMs) {
        fs.unlinkSync(fullPath);
        if (typeof parsed.id === "string") {
          prunedIds.push(parsed.id);
        }
      }
    } catch {
      // ignore transient or malformed files during sweep
    }
  }

  return { prunedIds, stateDir };
}

/**
 * Load definitions, nodes, parent liveness promotion, and derived edges.
 */
export function loadAggregatedSnapshot(explicitDir, { nowMs = Date.now() } = {}) {
  const stateDir = ensureStateDir(explicitDir);
  pruneExpiredSubagents(stateDir, nowMs);
  const definitions = loadDefinitionsSafe(stateDir);
  const nodesDir = path.join(stateDir, "nodes");

  const rawNodes = [];
  for (const entry of fs.readdirSync(nodesDir)) {
    if (!entry.endsWith(".json") || entry.includes(".tmp.")) continue;
    const fullPath = path.join(nodesDir, entry);
    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") {
        console.warn(`[neuroverse] Ignoring invalid node object in ${fullPath}`);
        continue;
      }
      rawNodes.push(parsed);
    } catch (err) {
      console.warn(`[neuroverse] Ignoring malformed JSON in ${fullPath}: ${err.message}`);
    }
  }

  // Clone nodes in memory so parent liveness promotion never mutates caller refs
  const nodes = rawNodes.map((n) => {
    const expiresAtMs = computeSubagentExpiresAtMs(n, definitions);
    return {
      ...n,
      expiresAt:
        expiresAtMs !== null ? new Date(expiresAtMs).toISOString() : null,
      config: n.config ? { ...n.config } : {},
      links: Array.isArray(n.links) ? n.links.map((l) => ({ ...l })) : [],
      metadata: n.metadata ? { ...n.metadata } : {},
    };
  });

  // Parent Liveness Promotion: illuminate idle/completed harnesses that have active child sessions
  const activeHarnessIds = new Set();
  for (const node of nodes) {
    if (
      node.type === "session" &&
      node.parentId &&
      (node.status === "running" || node.status === "tool_calling")
    ) {
      activeHarnessIds.add(node.parentId);
    }
  }
  for (const node of nodes) {
    if (
      node.type === "harness" &&
      (node.status === "idle" || node.status === "completed") &&
      node.metadata?.autoStatus !== false &&
      activeHarnessIds.has(node.id)
    ) {
      node.status = "running";
    }
  }

  nodes.sort((a, b) => {
    const tierDiff = getOrbitTier(definitions, a.type) - getOrbitTier(definitions, b.type);
    if (tierDiff !== 0) return tierDiff;
    const timeA = String(a.config?.startedAt || a.updatedAt || "");
    const timeB = String(b.config?.startedAt || b.updatedAt || "");
    const timeDiff = timeA.localeCompare(timeB);
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];

  for (const node of nodes) {
    if (node.parentId && nodeById.has(node.parentId)) {
      edges.push({
        id: `hier:${node.parentId}->${node.id}`,
        source: node.parentId,
        target: node.id,
        type: "hierarchy",
        status: deriveHierarchyEdgeStatus(node.status),
        label: `${node.parentId} → ${node.id}`,
      });
    }

    if (Array.isArray(node.links)) {
      for (const link of node.links) {
        if (!link || typeof link.target !== "string" || !nodeById.has(link.target)) {
          continue;
        }
        const linkType = link.type ?? "collaborates";
        edges.push({
          id: link.id ?? `link:${node.id}->${link.target}:${linkType}`,
          source: node.id,
          target: link.target,
          type: linkType,
          status: link.status ?? "active",
          label: link.label ?? "synapse",
        });
      }
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    stateDir,
    generatedAt: new Date().toISOString(),
    definitions,
    nodes,
    edges,
  };
}
