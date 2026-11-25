# 03 — Step-by-Step MVP Implementation Runbook

This runbook breaks **Neuroverse MVP** into **7 sequential, test-gated milestones (`M1` → `M7`)**.
Execute them strictly in order. Do not skip verification gates, and do not deviate from [01-architecture.md](./01-architecture.md) or [02-visual-and-aesthetic-spec.md](./02-visual-and-aesthetic-spec.md).

---

## Milestone 1: Zero-Dependency State Store & Graph Aggregator

### Files to Create
- `scripts/state-store.mjs`
- `tests/state-store.test.mjs`

### Implementation Checklist
1. Implement `resolveStateDir(explicitDir)` (`explicitDir` → `process.env.NEUROVERSE_STATE_DIR` → `~/.neuroverse/state`).
2. Implement `ensureStateDir(stateDir)` creating `nodes/` and seeding `definitions.json` from `references/default-definitions.json` if missing.
3. Implement `sanitizeNodeId(id)` enforcing `/^[a-zA-Z0-9._-]+$/` (`1..128` chars, no path traversal).
4. Implement `writeJsonAtomic(filePath, data)` via temp sibling file + `fs.renameSync`.
5. Implement `upsertNode(stateDir, patch)`:
   - Preserves existing `config`, `links`, `metadata`, `parentId`, `type`, and `label` when omitted in partial updates.
   - Auto-sets `config.startedAt` when first entering `running` / `tool_calling` if unset.
   - Appends deduplicated items from `patch.addTools` into `config.toolsUsed`.
   - Auto-sets `config.endedAt` and clears `config.activeTool = null` when transitioning to `completed` or `error`.
6. Implement `upsertNodeLink(stateDir, { from, to, type, status, label })`, `completeNode(stateDir, { id, status, summary })`, and `cleanNodes(stateDir)`.
7. Implement `loadAggregatedSnapshot(stateDir)`:
   - Ignores `.tmp.` files and warns (never crashes) on malformed JSON files.
   - Promotes `harness` status from `"idle"` to `"running"` in the returned snapshot when at least one child `session` is `"running"` or `"tool_calling"`.
   - Derives `hierarchy` edges from `parentId` and `collaborates` (or custom type) edges from `node.links[]` whenever both endpoints exist.

### Verification Gate
```bash
node --test tests/state-store.test.mjs
```
All unit tests must pass (covering atomic upsert, partial merge, tool trail deduplication, edge derivation, harness auto-illumination, invalid ID rejection, and corrupted file tolerance).

---

## Milestone 2: Agent CLI (`neuroverse.mjs`) & Multi-Harness Simulator

### Files to Create / Update
- `scripts/neuroverse.mjs` (mark executable `chmod +x scripts/neuroverse.mjs`)
- `scripts/demo-simulation.mjs`
- Extend `tests/state-store.test.mjs` with CLI subprocess tests (`node:child_process` `execFileSync`).

### Implementation Checklist
1. **Flexible Argument Parser in `scripts/neuroverse.mjs`**:
   - Support all commands in `SKILL.md` and `docs/01-architecture.md`: `init`, `upsert`, `link`, `complete`, `list`, `clean`, `serve`, `status`.
   - **CRITICAL `--set` Parsing Rule**: `SKILL.md` instructs agents to run commands like:
     ```bash
     node scripts/neuroverse.mjs upsert --id "h1" --set vendor="Anthropic" surface="CLI" workspace="/tmp"
     ```
     Therefore, write a clean custom `argv` token loop (rather than brittle single-token `parseArgs` for `--set` / `--add-tool`): when seeing `--set`, consume **all subsequent `key=value` tokens** until the next `--flag`! Similarly, when seeing `--add-tool`, consume one or more non-flag tokens until the next `--flag`.
   - Value coercion for `key=value`: `"null"` → `null`, `"true"` → `true`, `"false"` → `false`, otherwise keep `string`.
2. **Simulator (`scripts/demo-simulation.mjs`)**:
   - Export `seedStaticShowcase(stateDir)` (instantly writes 3 harnesses: `Claude Code`, `Codex CLI`, `Antigravity IDE`, 5 sessions across active/completed states, 5 subagents, and 2 cross-node `collaborates` links).
   - Export `runDemoScenario({ stateDir, speedMultiplier = 1 })` executing an ~18s choreographed sequence of spawns, `tool_calling` bursts, peer `collaborates` pulses, and completions (guard against overlapping concurrent runs with a module-level lock).
   - Allow CLI execution: `node scripts/demo-simulation.mjs [--instant] [--state-dir <dir>]`.

### Verification Gate
```bash
node --test tests/state-store.test.mjs && \
NEUROVERSE_STATE_DIR=/tmp/neuroverse-verify-cli node scripts/demo-simulation.mjs --instant && \
NEUROVERSE_STATE_DIR=/tmp/neuroverse-verify-cli node scripts/neuroverse.mjs list
```

---

## Milestone 3: Local HTTP + SSE Server & Vite Dev Bridge

### Files to Create
- `scripts/server.mjs`
- `vite.config.ts`
- `tests/server-api.test.mjs`

### Implementation Checklist
1. In `scripts/server.mjs`, export `createStateWatcherHub(stateDir)` and `createApiMiddleware({ stateDir, hub })` and `startServer({ port, host, stateDir, distDir })`:
   - `GET /api/health` → `{ ok: true, stateDir, timestamp }`
   - `GET /api/snapshot` → `loadAggregatedSnapshot(stateDir)`
   - `GET /api/events` → SSE (`text/event-stream`), pushes initial `event: snapshot\ndata: ...\n\n` immediately, debounces `fs.watch` updates by `60ms`, runs a `2500ms` directory fingerprint fallback poll, and cleans up closed client sockets + watchers on `hub.close()`.
   - `POST /api/demo/start`, `POST /api/demo/seed`, `POST /api/state/clean`.
   - Static asset serving from `dist/` with SPA `index.html` fallback and proper MIME types (`.html`, `.js`, `.css`, `.svg`, `.json`, `.woff2`).
2. Wire `neuroverse.mjs serve` (foreground & `--daemon` detached mode with idempotent health probe) and `neuroverse.mjs status`.
3. Create `vite.config.ts` importing `@vitejs/plugin-react` AND adding a custom plugin `{ name: "neuroverse-local-api", configureServer(server) { ... } }` that mounts `createApiMiddleware` onto `server.middlewares` (closing the watcher hub when Vite server closes).

### Verification Gate
```bash
node --test tests/*.test.mjs
```
`tests/server-api.test.mjs` must spin up `startServer` on an ephemeral port (`port: 0`) with a temp `stateDir`, connect to `/api/events`, receive the initial `snapshot` event, call `upsertNode`, and assert that a live SSE `snapshot` event containing the new node arrives within `<500ms`, then cleanly close the server.

---

## Milestone 4: Frontend Foundation, Tokens & Live SSE Hook

### Files to Create
- `index.html`
- `src/styles/tokens.css`
- `src/hooks/useFlowSnapshot.ts`
- `src/utils/formatters.ts` (duration formatter `formatElapsed(startedAt, endedAt, nowMs)`, timestamp formatter, home-path shortener)

### Implementation Checklist
1. Run `npm install` in `/home/anzzha/dev/Neuroverse/Neuroverse`.
2. Create `index.html` with dark background `#030508` inline on `html, body` so there is zero white flash on load, title `Neuroverse · Neural Cosmos`.
3. Create `src/styles/tokens.css` implementing all CSS custom properties, matte obsidian glass utility classes, subtle scrollbars, and editorial typography rules from `docs/02-visual-and-aesthetic-spec.md`.
4. Implement `useFlowSnapshot()` in `src/hooks/useFlowSnapshot.ts`:
   - Fetches `GET /api/snapshot` on mount and subscribes to `new EventSource("/api/events")` (`addEventListener("snapshot", ...)`).
   - Tracks `connectionState: "connecting" | "live" | "reconnecting"`.
   - Exposes `snapshot`, `connectionState`, `demoRunning`, `startLiveDemo()`, `seedShowcase()`, and `clearAllNodes()`.

### Verification Gate
```bash
npx tsc --noEmit
```

---

## Milestone 5: Three.js 3D Neural Cosmos Engine, Shaders & Camera Rig

### Files to Create
- `src/scene/shaders.ts`
- `src/scene/layoutEngine.ts`
- `src/scene/cameraRig.ts`
- `src/scene/NeuralCosmosEngine.ts`

### Implementation Checklist
1. **`src/scene/shaders.ts`**: Copy the exact tested GLSL shaders (`SOMA_*`, `CORONA_*`, `PULSE_*`) from `docs/02-visual-and-aesthetic-spec.md`.
2. **`src/scene/layoutEngine.ts`**:
   - Implement FNV-1a `hash01(str)`, 3-tier orbital solver (`harness` host stars → `session` inclined orbits → `subagent` 3D dendritic cloud), orbital ring point generator, and exponential smoothing for positions & `StellarNeuronAppearance` values.
3. **`src/scene/cameraRig.ts`**:
   - Wrap `OrbitControls` (`enableDamping = true`, `dampingFactor = 0.055`, `minDistance = 4`, `maxDistance = 260`).
   - Implement smooth camera fly-to and **Universe Sandbox object tethering** (adding target node's frame-to-frame `deltaPos` to both `controls.target` and `camera.position` while tethered, cancelling fly-to zoom animation gracefully if user manually wheels, and releasing tether on `resetOverview()`).
4. **`src/scene/NeuralCosmosEngine.ts`**:
   - Setup `WebGLRenderer`, `EffectComposer`, `RenderPass`, `UnrealBloomPass(res, 1.08, 0.65, 0.24)`, `OutputPass`.
   - Build background `Starfield` (2,800 blackbody-tinted stars), `CosmicDust` (900 slowly swirling disc particles), and toggleable polar `ReferenceGrid`.
   - Manage dynamic node lifecycle (`syncSnapshot(snapshot)`): create/update/dispose Soma `Mesh`, billboard Corona `Mesh`, invisible `1.8×` padded raycast hit-sphere, and `LineLoop` orbital ring.
   - Manage dynamic synapse curves (`QuadraticBezierCurve3` `Line`s) and a single batched `THREE.Points` action-potential pulse system across all active edges.
   - Handle pointer hover & click raycasting (distinguishing click `< 5px` pointer travel from OrbitControls drag!).
   - Invoke an imperative `onFrameProject(projectedNodes)` callback every animation frame with `{ id, x, y, screenRadius, visibleBehindCamera, distance }` so `ScreenSpaceOverlay` moves DOM nodes directly at 60fps without React state churn.
   - Cleanly handle `ResizeObserver` and full WebGL resource disposal on `destroy()`.

### Verification Gate
```bash
npx tsc --noEmit
```

---

## Milestone 6: Universe Sandbox × Anthropic HUD & Inspector Components

### Files to Create
- `src/components/TopTelemetryBar.tsx`
- `src/components/HierarchyNavigator.tsx`
- `src/components/ScreenSpaceOverlay.tsx`
- `src/components/NodeInspectorDrawer.tsx`
- `src/components/SimulationControlBar.tsx`
- `src/App.tsx`
- `src/main.tsx`

### Implementation Checklist
1. **`TopTelemetryBar.tsx`**: Wordmark, live SSE indicator + shortened `stateDir`, and live counts (`Harnesses`, `Active Neurons`, `Firing Synapses`), plus toggle button for left `HierarchyNavigator`.
2. **`HierarchyNavigator.tsx`**: Collapsible left tree grouped by `Harness → Session → Subagent` (plus an `Unattached` group if orphan nodes exist), status dot, active tool badge, click to select & tether camera.
3. **`ScreenSpaceOverlay.tsx`**:
   - Registers an imperative updater ref with `NeuralCosmosEngine` to position node anchors via `translate3d(x, y, 0)`.
   - Renders crisp Universe Sandbox circular/corner targeting reticles on `hovered` and `selected` nodes.
   - Applies smart label filtering (`smart` | `all` | `off`), clicking a label selects & tethers the node.
4. **`NodeInspectorDrawer.tsx`**:
   - Right-side `360px` obsidian glass drawer when `selectedNodeId` resolves a node.
   - 1-second interval hook exclusively inside the drawer for live elapsed task timer (`00m 14s`).
   - Declarative field renderer driven by `nodeDefinition.fields` (`badge`, `code`, `multiline`, `timestamp`, `tags`).
   - Connected Synapses list (parent, children, peer `links`) allowing 1-click camera jump across the neural network.
5. **`SimulationControlBar.tsx`**:
   - Bottom centered floating bar: Orbit `Play/Pause`, Speed (`0.5×`, `1×`, `2×`), `Orbits` toggle, `Grid` toggle, `Labels` cycle (`Smart`/`All`/`Off`), `Overview` (`Esc`), `✦ Run Neural Demo`, `Clear`.
6. **Empty State Onboarding (`App.tsx`)**:
   - When `snapshot.nodes.length === 0`, display a restrained centered floating glass card over the living starfield explaining the state path (`~/.neuroverse/state`) with two actions: **`✦ Run Live Neural Demo`** and **`Seed Static Constellation`**.
   - Bind `Escape` key to clear selection / untether camera.

### Verification Gate
```bash
npm run build
```
Must compile TypeScript (`tsc`) and bundle production assets into `dist/` with zero errors.

---

## Milestone 7: End-to-End Integration, README & Final QA

### Files to Update / Verify
- `README.md` (verify all CLI commands and ports match implementation)
- End-to-end verification run

### Verification Checklist
1. Run the full automated test suite and production build:
   ```bash
   npm test && npm run build
   ```
2. Start the production server against a clean temporary state directory, run `neuroverse.mjs` lifecycle commands (`upsert` harness → `upsert` session → `upsert` subagent → `link` → `complete`), fetch `/api/snapshot` and `/index.html`, and verify node/edge states match 100%, then stop the test server cleanly.
3. (If browser tool is available) Open the local server URL, click **`✦ Run Live Neural Demo`**, verify zero WebGL/shader/console errors, verify HDR stellar bloom contrast between active and completed nodes, click a node to confirm smooth camera tethering and Inspector drawer rendering.
