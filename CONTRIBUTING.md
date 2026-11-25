# Contributing to Neuroverse

Thank you for your interest in contributing to **Neuroverse**!

## Development Setup

**Prerequisites**: Node.js `>= 20` and `npm`.

```bash
git clone https://github.com/andrewzhang1996/Neuroverse.git
cd Neuroverse
npm install
```

### Useful Commands

```bash
npm run dev      # Start Vite dev server with live local API middleware
npm run build    # Type-check with tsc and build production assets to dist/
npm test         # Run the Node.js test suite (tests/*.test.mjs)
npm start        # Serve built dist/ + SSE API on http://127.0.0.1:4399
npm run demo     # Seed a live multi-harness neural simulation
```

## Architectural Rules

Please keep these core principles in mind when submitting changes:

1. **Zero Runtime Dependencies in `scripts/`**:
   Everything under `scripts/` (`neuroverse.mjs`, `server.mjs`, `state-store.mjs`, `demo-simulation.mjs`) must use **only** Node.js built-in modules (`node:fs`, `node:path`, `node:http`, etc.). Do not import third-party npm packages in `scripts/`.
2. **State & Rendering Decoupling**:
   Agent state files (`~/.neuroverse/state/nodes/<id>.json`) remain purely semantic (`neuroverse/v1`). Visual coordinates, shaders, and styling belong strictly in `src/` and `references/default-definitions.json`.
3. **Keep `SKILL.md` Concise**:
   Changes to `SKILL.md` should preserve its low-token footprint for AI agents.

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Make your changes and add or update tests in `tests/` where applicable.
3. Ensure both `npm run build` and `npm test` pass with zero errors.
4. Open a pull request describing the motivation, changes, and verification steps.
