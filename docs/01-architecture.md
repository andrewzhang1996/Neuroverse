# 01 — System Architecture & Module Specification

This document specifies every backend, CLI, server, and data-flow contract for **Neuroverse MVP**. Implementers should follow these exact file paths, function signatures, and behaviors without inventing incompatible alternatives.

---

## 1. Complete Target Directory Tree

```text
Neuroverse/
├── AGENTS.md
├── SKILL.md
├── README.md
├── LICENSE
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── references/
│   ├── default-definitions.json     # Already created (canonical seed definitions)
│   └── schema.md                    # Already created (protocol documentation)
├── docs/
│   ├── 01-architecture.md           # This file
│   ├── 02-visual-and-aesthetic-spec.md
│   └── 03-mvp-implementation-plan.md
├── scripts/                         # Pure Node.js v20+ ESM (ZERO npm dependencies)
│   ├── state-store.mjs              # State dir init, atomic read/write, graph aggregation
│   ├── neuroverse.mjs                      # Agent & user CLI entry point
│   ├── server.mjs                   # Local HTTP + SSE watcher + static dist server
│   └── demo-simulation.mjs          # Choreographed multi-harness neural cosmos simulator
├── src/                             # Vite + React 18 + Three.js frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   └── tokens.css               # Design tokens, glass surfaces, typography, animations
│   ├── types/
│   │   └── flow.ts                  # Already created (shared TypeScript contracts)
│   ├── hooks/
│   │   └── useFlowSnapshot.ts       # Initial fetch + SSE live subscription + demo trigger
│   ├── scene/
│   │   ├── NeuralCosmosEngine.ts    # Imperative Three.js scene controller (60fps loop)
│   │   ├── layoutEngine.ts          # 3D Keplerian orbital + dendritic coordinate solver
│   │   ├── shaders.ts               # Verbatim GLSL shaders (soma, corona, pulses, starfield)
│   │   └── cameraRig.ts             # Smooth fly-to interpolation & object tethering
│   └── components/
│       ├── TopTelemetryBar.tsx      # Brand mark, live sync pill, active neuron counters
│       ├── HierarchyNavigator.tsx   # Left collapsible Harness → Session → Subagent tree
│       ├── ScreenSpaceOverlay.tsx   # 60fps DOM-projected reticles & crisp node labels
│       ├── NodeInspectorDrawer.tsx  # Right-side declarative telemetry & tool trail drawer
│       └── SimulationControlBar.tsx # Bottom Universe Sandbox time/orbit/grid/demo bar
└── tests/
    ├── state-store.test.mjs         # Node built-in test runner suite for store & CLI
    └── server-api.test.mjs          # HTTP snapshot + SSE broadcast integration tests
```

---

## 2. State Store Engine (`scripts/state-store.mjs`)

### 2.1 State Directory Resolution
```js
export function resolveStateDir(explicitDir) {
  if (explicitDir) return path.resolve(explicitDir);
  if (process.env.NEUROVERSE_STATE_DIR) return path.resolve(process.env.NEUROVERSE_STATE_DIR);
  return path.join(os.homedir(), ".neuroverse", "state");
}
```

### 2.2 Initialization (`ensureStateDir(stateDir)`)
1. Creates `<stateDir>` and `<stateDir>/nodes` (`fs.mkdirSync(..., { recursive: true })`).
2. Checks if `<stateDir>/definitions.json` exists. If missing, copies `<repoRoot>/references/default-definitions.json` atomically to `<stateDir>/definitions.json`.

### 2.3 Safe Node ID Sanitization (`sanitizeNodeId(id)`)
- Valid pattern: `/^[a-zA-Z0-9._-]+$/`, length `1..128`.
- Reject anything containing `/`, `\`, or `..` with an explicit `Error("Invalid node id")`.

### 2.4 Atomic Write (`writeJsonAtomic(filePath, data)`)
1. Serialize `JSON.stringify(data, null, 2) + "\n"`.
2. Write to `${filePath}.tmp.${process.pid}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.
3. `fs.renameSync(tmpPath, filePath)`.

### 2.5 Node Upsert & Patch Semantics (`upsertNode(stateDir, patch)`)
Reads existing `<stateDir>/nodes/<id>.json` if present, otherwise starts a fresh `neuroverse/v1` node object:
- `schemaVersion`: always `"neuroverse/v1"`
- `id`: required
- `type`: `patch.type ?? existing?.type ?? "session"`
- `parentId`: if `patch.parentId !== undefined`, set `patch.parentId`; else preserve `existing?.parentId ?? null`
- `label`: `patch.label ?? existing?.label ?? patch.id`
- `status`: `patch.status ?? existing?.status ?? "running"`
- `updatedAt`: `new Date().toISOString()`
- `config`: shallow-merge `{ ...(existing?.config ?? {}), ...(patch.config ?? {}) }`:
  - Special helper `startedAt`: if creating a node for the first time and `status` is `"running"` or `"tool_calling"` and `config.startedAt` is unset, auto-populate `startedAt = updatedAt`.
  - Special helper `addTools` (`string[]`): deduplicate and append to `config.toolsUsed` array while preserving chronological order.
  - If `status` transitions to `"completed"` or `"error"`, auto-populate `config.endedAt = updatedAt` (unless explicitly provided) and clear `config.activeTool = null`.
- `links`: if `patch.links` is provided, replace; if `patch.upsertLink` is provided (`{ target, type, status, label }`), update matching link `(target, type)` in-place or append.
- `metadata`: shallow-merge `{ ...(existing?.metadata ?? {}), ...(patch.metadata ?? {}) }`.

### 2.6 Graph Aggregation (`loadAggregatedSnapshot(stateDir)`)
Returns `AggregatedFlowSnapshot` (matching `src/types/flow.ts`):
1. Read `<stateDir>/definitions.json` (fallback to `references/default-definitions.json` if malformed).
2. Read all `*.json` files inside `<stateDir>/nodes/` (ignore `*.tmp.*` and skip malformed files gracefully with `console.warn` rather than crashing).
3. Sort `nodes` deterministically by `(orbitTier, startedAt || updatedAt, id)`.
4. **Derive `edges: ResolvedSynapseEdge[]`**:
   - Create a `nodeById = new Map(nodes.map(n => [n.id, n]))`.
   - **Auto-Hierarchy Edges**: For each `node` with `node.parentId` where `nodeById.has(node.parentId)`:
     - Derive `edgeStatus`:
       - If `node.status === "running" || node.status === "tool_calling"` → `"active"`
       - Else if `node.status === "error"` → `"error"`
       - Else if `node.status === "completed"` → `"completed"`
       - Else → `"default"`
     - Emit `{ id: `hier:${node.parentId}->${node.id}`, source: node.parentId, target: node.id, type: "hierarchy", status: edgeStatus, label: `${node.parentId} → ${node.id}` }`.
   - **Explicit Synaptic Links**: For each `link` in `node.links ?? []` where `nodeById.has(link.target)`:
     - Emit `{ id: link.id ?? `link:${node.id}->${link.target}:${link.type ?? "collaborates"}`, source: node.id, target: link.target, type: link.type ?? "collaborates", status: link.status ?? "active", label: link.label ?? "synapse" }`.
5. **Parent Liveness Promotion**:
   - If a `harness` node has status `"idle"` or `"completed"`, check if any child `session` has status `"running"` or `"tool_calling"`. If so, expose `effectiveStatus` (or normalize its snapshot `status` to `"running"` only in memory if `metadata.autoStatus !== false`) so active child sessions naturally illuminate their host star! (Keep disk JSON untouched; apply in `loadAggregatedSnapshot` when `node.type === "harness"` and `node.status === "idle"`).

---

## 3. CLI Specification (`scripts/neuroverse.mjs`)

Executable via `node scripts/neuroverse.mjs <command> [flags]`. Parse `process.argv` cleanly using `node:util` `parseArgs` (built into Node 20!).

### Supported Subcommands

1. **`neuroverse init [--state-dir <path>]`**
   - Calls `ensureStateDir`, prints JSON `{ ok: true, stateDir }`.

2. **`neuroverse upsert --id <id> [--type harness|session|subagent] [--parent <parentId>] [--label <text>] [--status <status>] [--set key=value ...] [--add-tool <toolName> ...] [--state-dir <path>]`**
   - Note: `--set` must be repeatable (`multiple: true` in `parseArgs`) or parse positional `key=value` pairs after `--set`! Specifically, support BOTH `--set key1=val1 --set key2=val2` AND multiple `key=val` tokens following `--set` by scanning `argv` cleanly so Agents never fail regardless of quoting style!
   - Parse `"null"` → `null`, `"true"` → `true`, `"false"` → `false`, numeric strings only when appropriate (keep version strings like `"1.0"` as strings unless needed; strings are safe for all Inspector fields).
   - Writes node atomically and prints `{ ok: true, id, status, path }`.

3. **`neuroverse link --from <sourceId> --to <targetId> [--type collaborates] [--status active|completed|error|default] [--label <text>] [--state-dir <path>]`**
   - Upserts a synaptic link on `<sourceId>` pointing to `<targetId>`.

4. **`neuroverse complete --id <id> [--status completed|error] [--summary <text>] [--state-dir <path>]`**
   - Sets `status` (default `"completed"`), sets `config.endedAt = now`, clears `config.activeTool = null`, and if `--summary` is provided sets `config.resultSummary = summary`.

5. **`neuroverse list [--state-dir <path>] [--json]`**
   - Lists current nodes, their `type`, `status`, `parentId`, and `label` (human table by default, raw snapshot with `--json`).

6. **`neuroverse clean [--state-dir <path>]`**
   - Removes all `nodes/*.json` files in `<stateDir>/nodes/` (keeps `definitions.json`).

7. **`neuroverse serve [--port 4399] [--host 127.0.0.1] [--state-dir <path>] [--daemon]`**
   - If `--daemon` is passed: spawns `node scripts/server.mjs` detached (`detached: true`, `stdio: "ignore"`, `.unref()`), writes `<stateDir>/server.json` (`{ pid, host, port, startedAt, url }`), waits up to 1.5s polling `GET /api/health` to confirm startup (if already running on that port and healthy, reuses the existing instance idempotently!), and prints `{ ok: true, url, pid }`.
   - Without `--daemon`: runs `startServer` in the foreground.

8. **`neuroverse status [--port 4399] [--host 127.0.0.1] [--state-dir <path>]`**
   - Checks `<stateDir>/server.json` and probes `http://<host>:<port>/api/health`, printing `{ running: boolean, url, stateDir, nodeCount }`.

---

## 4. Local HTTP + SSE Server (`scripts/server.mjs`)

Design `createApiMiddleware(options)` so it works identically in:
1. **Standalone Production Mode** (`node scripts/server.mjs`, serving static files from `<repoRoot>/dist/` + `/api/*`).
2. **Vite Dev Mode** (`vite.config.ts` `configureServer` plugin mounting `createApiMiddleware` onto `server.middlewares`!).

### HTTP Endpoints

| Method & Path | Response | Behavior |
| :--- | :--- | :--- |
| `GET /api/health` | `200 application/json` | `{ ok: true, stateDir, timestamp }` |
| `GET /api/snapshot` | `200 application/json` | Full `AggregatedFlowSnapshot` from `loadAggregatedSnapshot(stateDir)`. |
| `GET /api/events` | `200 text/event-stream` | SSE stream (`Cache-Control: no-cache`, `Connection: keep-alive`). Immediately sends `event: snapshot\ndata: <JSON>\n\n` on connect, sends `: heartbeat\n\n` every 15s, and broadcasts `event: snapshot\ndata: <JSON>\n\n` (debounced at `60ms`) whenever `<stateDir>` or `<stateDir>/nodes` changes! |
| `POST /api/demo/start` | `200 application/json` | Triggers `runDemoScenario({ stateDir, mode: "live" })` in-process (if not already running) so the user can click **"Run Neural Demo"** directly in the browser UI! Returns `{ ok: true, running: true }`. |
| `POST /api/demo/seed` | `200 application/json` | Instantly seeds a rich static multi-harness constellation (`seedStaticShowcase(stateDir)`) so an empty state directory can be populated in 1ms. |
| `POST /api/state/clean` | `200 application/json` | Clears `nodes/*.json` and broadcasts the empty snapshot. |

### Reliable File Watching Strategy
Linux `fs.watch` on `<stateDir>/nodes` plus `<stateDir>` (for `definitions.json`):
- Debounce rapid bursts within `60ms` into a single `loadAggregatedSnapshot` read + SSE broadcast.
- Ignore filenames containing `.tmp.`.
- Also run a lightweight fallback check every `2500ms` comparing max `mtimeMs` + file count of `nodes/*.json` so even network/container filesystems never miss an update.

---

## 5. Multi-Agent Demo Simulator (`scripts/demo-simulation.mjs`)

Must export `seedStaticShowcase(stateDir)` AND `runDemoScenario({ stateDir, speedMultiplier = 1 })`, and also be runnable standalone via `npm run demo` (`node scripts/demo-simulation.mjs [--instant] [--state-dir <path>]`).

### Choreographed Storyline (~18 seconds at `1×`, looping or settling cleanly)
Simulates **3 distinct AI Harnesses** coexisting in one neural cosmos:
1. **`harness-claude-code` ("Claude Code")** — `Anthropic · CLI`:
   - Spawns `sess-refactor-auth` (`claude-opus-4.6`, `"Refactor OAuth2 PKCE & session rotation"`).
   - `sess-refactor-auth` spawns **3 parallel subagents**:
     - `sub-sec-audit` (`Security Auditor`, `claude-sonnet-4.5`) → `tool_calling` (`grep_search`, `read_file`)
     - `sub-token-impl` (`Auth Engineer`, `claude-sonnet-4.5`) → `tool_calling` (`edit_file`, `run_command`)
     - `sub-test-runner` (`Verification Runner`, `claude-haiku-4.5`) → `waiting` then `running`
   - `sub-sec-audit` fires an active **`collaborates` synapse** to `sub-token-impl` (`"Report refresh-token replay edge case"`).
2. **`harness-codex` ("Codex CLI")** — `OpenAI · Terminal`:
   - Spawns `sess-kernel-bench` (`gpt-5-codex`, `"Optimize WebGL instanced buffer allocator"`), cycling through `running` → `tool_calling` (`cargo bench`) → `completed`, plus a dormant completed session `sess-docs-sync` (`completed`) to demonstrate contrast between **incandescent active neurons** and **cooled quiescent stars**!
3. **`harness-antigravity` ("Antigravity IDE")** — `Google DeepMind · Agentic IDE`:
   - Spawns `sess-cosmos-arch` (`gemini-4`, `"Architect 3D Neural Observability Engine"`), spawning 2 subagents (`sub-shader-lab` and `sub-schema-design`), with a cross-session `collaborates` link demonstrating cross-region synaptic signaling!

When `seedStaticShowcase(stateDir)` is called (or on first launch if `<stateDir>/nodes/` has 0 files? **Important UX rule**: if `<stateDir>/nodes/` is completely empty when the UI loads, show a subtle empty-cosmos prompt button **"Seed Demo Constellation"** / **"Run Live Neural Demo"** in the HUD rather than polluting `~/.neuroverse/state/` silently—only write demo nodes when the user clicks the button or runs `npm run demo`!).
