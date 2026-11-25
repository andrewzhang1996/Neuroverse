<div align="center">

# Neuroverse

**A local-first 3D neural-cosmos observability dashboard & universal Agent SKILL for AI Harnesses.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Zero Runtime Deps](https://img.shields.io/badge/Server%20Deps-Zero-brightgreen)](#architecture-highlights)

**English** | [简体中文](./README.zh-CN.md)

</div>

---

**Neuroverse** turns your local AI agent workflows into a living, interactive 3D neural cosmos — inspired by *Interstellar*, *Universe Sandbox*, biological synapses, and restrained editorial typography.

Whether you use **Claude Code**, **Codex**, **Antigravity**, **DeepSeek Harness**, **Doubao Work**, or your own custom agent, simply connect the lightweight [`SKILL.md`](./SKILL.md). Agents maintain tiny semantic JSON state files at ultra-low token cost, while Neuroverse renders them in real time via `fs.watch` + SSE.

---

## Core Features

- **Universal Agent SKILL Protocol**: SDK-agnostic. Any agent capable of running a local CLI command or writing a JSON file can drive the 3D cosmos.
- **State & Rendering Decoupled (Ultra-Low Token Cost)**:
  - **Agent side**: Writes only small per-node semantic JSON files (`~/.neuroverse/state/nodes/<id>.json`) for status (`running`, `tool_calling`, `waiting`, `completed`, `idle`, `error`), model, task, tool chain, and summary — zero concurrent write conflicts and zero UI/coordinate boilerplate.
  - **Frontend side**: Declarative `definitions.json` drives 3D glow, pulse, and inspector fields, synchronized in milliseconds over local `fs.watch` + Server-Sent Events (SSE).
- **Universe Sandbox × 3D Neural Network**:
  - Three-tier celestial/neural topology: **`Harness (Host Star) → Session (Orbiting Neuron) → Subagent (Dendrite Satellite)`** plus cross-node **`Collaborates (Synaptic Bridges)`**.
  - Custom GLSL stellar plasma & atmospheric corona shaders with ACES Filmic HDR bloom (`UnrealBloomPass`): active nodes pulse with incandescent energy and synaptic photon streams; completed nodes naturally cool into quiet white dwarfs.
  - Click any node for smooth **Camera Tethering**, a screen-space precision targeting reticle, and a high-contrast **Node Inspector** drawer.

---

## Quick Start

> **Prerequisite**: Node.js `>= 20`

```bash
# 1. Install frontend build dependencies and build static assets
npm install
npm run build

# 2. Start the local observability server (default: http://127.0.0.1:4399, zero runtime deps)
npm start

# 3. (Optional) Run the multi-harness neural simulation in another terminal
npm run demo
```

Development mode (Vite HMR + live local API):

```bash
npm run dev
```

---

## Install as an Agent SKILL

Clone this repository and symlink it into your agent's `skills` directory:

```bash
# Claude Code
ln -s /path/to/Neuroverse ~/.claude/skills/neuroverse

# Codex
ln -s /path/to/Neuroverse ~/.codex/skills/neuroverse

# Antigravity (global or project-level .agents/skills/)
ln -s /path/to/Neuroverse ~/.gemini/config/skills/neuroverse
```

---

## CLI Quick Reference

```bash
# Start dashboard in background
node scripts/neuroverse.mjs serve --daemon

# Check server status
node scripts/neuroverse.mjs status

# Run built-in simulation presets
npm run demo           # Multi-harness lifecycle demo
npm run demo:stream    # Continuous streaming simulation
npm run demo:massive   # 160+ node stress-test constellation
```

---

## Documentation

- [SKILL.md](./SKILL.md) — Minimal reporting protocol and CLI manual for AI agents
- [references/schema.md](./references/schema.md) — `neuroverse/v1` atomic JSON state schema
- [references/default-definitions.json](./references/default-definitions.json) — Built-in node/synapse visual presets
- [docs/01-architecture.md](./docs/01-architecture.md) — Directory layout, zero-dependency state store, CLI & SSE server spec
- [docs/02-visual-and-aesthetic-spec.md](./docs/02-visual-and-aesthetic-spec.md) — Visual design system, GLSL shaders, orbital math & HUD spec
- [docs/03-mvp-implementation-plan.md](./docs/03-mvp-implementation-plan.md) — Milestone plan & test acceptance runbook (`M1`–`M7`)

---

## Contributing & License

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md) before opening a pull request.

Licensed under the [MIT License](./LICENSE).
