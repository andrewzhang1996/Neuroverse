# AGENTS.md — Neuroverse Repository Constitution

Read this file completely before modifying or adding any code in this repository.

## 1. Project Identity & Core Architecture

**Neuroverse** is an open-source **Agent SKILL + Local 3D Neural-Cosmos Observability Frontend**.
- **State Layer (`~/.neuroverse/state/` or `process.env.NEUROVERSE_STATE_DIR`)**:
  - Sharded one-file-per-node JSON (`nodes/<id>.json`) + declarative `definitions.json` (seeded from `references/default-definitions.json`).
  - Agents write **only** semantic status & telemetry fields (`id`, `type`, `parentId`, `label`, `status`, `config`, `links`, `metadata`). Agents **never** write 3D coordinates, CSS, colors, or shader parameters.
- **Runtime CLI & Server (`scripts/*.mjs`)**:
  - **STRICT ZERO-DEPENDENCY RULE**: Everything under `scripts/` (`neuroverse.mjs`, `server.mjs`, `state-store.mjs`, `demo-simulation.mjs`) MUST use **only** Node.js v20+ built-in modules (`node:fs`, `node:path`, `node:os`, `node:http`, `node:url`, `node:child_process`, `node:crypto`). Do NOT import npm packages in `scripts/`.
- **3D Frontend (`src/`)**:
  - Built with **Vite + TypeScript + Three.js (`0.170.x`) + React 18**.
  - Three.js renders the 3D cosmic neural network canvas (`EffectComposer` + `UnrealBloomPass` + custom GLSL shaders).
  - React renders crisp 2D screen-space targeting reticles, labels, telemetry inspector drawer, hierarchy navigator, and bottom simulation bar.

---

## 2. Mandatory Design & Reference Documents

Before implementing any module, consult the authoritative specs in order:

1. [references/schema.md](./references/schema.md) & [references/default-definitions.json](./references/default-definitions.json) — JSON protocol & status-keyed visual presets.
2. [src/types/flow.ts](./src/types/flow.ts) — Canonical TypeScript interfaces (do not break existing exported names).
3. [docs/01-architecture.md](./docs/01-architecture.md) — Exact specifications for `state-store.mjs`, `neuroverse.mjs` CLI flags, HTTP/SSE server endpoints, Vite dev middleware integration, and `demo-simulation.mjs`.
4. [docs/02-visual-and-aesthetic-spec.md](./docs/02-visual-and-aesthetic-spec.md) — Mandatory art direction (*Universe Sandbox × Interstellar × 2001: A Space Odyssey × Biological Synapses × Anthropic*), verbatim GLSL shaders, 3D orbital layout math, camera tethering math, and HUD CSS tokens.
5. [docs/03-mvp-implementation-plan.md](./docs/03-mvp-implementation-plan.md) — Sequential milestone checklist (`M1` through `M7`) with required test/build verification gates.

---

## 3. Non-Negotiable Visual & Engineering Guardrails

1. **NO Cyberpunk Neon Clichés**:
   - Never use `#00ffff`, `#ff00ff`, `#7c3aed` purple gradients, glowing neon boxes, scanline overlays, or sci-fi "hacker" green text.
   - Follow the exact deep-space obsidian (`#030508`), incandescent stellar white-gold/cyan-blue physical bloom, and warm Anthropic ivory (`#f2efe9`) editorial HUD tokens in `docs/02-visual-and-aesthetic-spec.md`.
2. **NO 3D Text Meshes or Canvas Texture Text**:
   - Never use `TextGeometry` or blurry `CanvasTexture` sprites for labels. Project 3D world positions to 2D screen coordinates (`vector.project(camera)`) and move crisp HTML elements via `transform: translate3d(x, y, 0)`.
3. **Atomic Disk Writes Only**:
   - Every JSON write to `nodes/<id>.json` or `definitions.json` MUST write to a temporary sibling file (`<file>.tmp.<pid>.<nonce>`) and `fs.renameSync` onto the target path so `fs.watch` readers never encounter partial JSON.
4. **No Memory Leaks in Three.js**:
   - Reuse shared `SphereGeometry` and `PlaneGeometry` instances where possible; explicitly `.dispose()` geometries, materials, and render targets when nodes/edges are removed or when the canvas unmounts.
5. **Verify Every Milestone**:
   - Run `npm test` and `npm run build` as specified in `docs/03-mvp-implementation-plan.md`. Fix all TypeScript (`tsc --noEmit`) and test errors before marking a milestone complete.
