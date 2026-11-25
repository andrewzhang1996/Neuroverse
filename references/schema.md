# Neuroverse State & Definition Protocol (`neuroverse/v1`)

Neuroverse decouples **Agent runtime state** from **3D neural-cosmos rendering** through small, atomic JSON files on local disk.

## 1. Storage Layout

By default, state lives in `~/.neuroverse/state/` (override via `NEUROVERSE_STATE_DIR`):

```text
~/.neuroverse/state/
├── definitions.json          # Type contracts, status-keyed 3D appearances, inspector field schemas
└── nodes/
    ├── harness-claude.json   # Host AI Harness node (tier 0 star)
    ├── sess-alpha.json       # Conversation Session node (tier 1 neuron)
    └── sub-alpha-1.json      # Spawned Subagent node (tier 2 satellite)
```

Why one file per node?
1. **Zero multi-agent write collisions**: Concurrent sessions and parallel subagents update only their own `nodes/<id>.json`.
2. **Minimal token overhead**: Each file is ~15–25 lines of pure semantic data. Agents never write coordinates, colors, shaders, or UI markup.

---

## 2. Node Instance File (`nodes/<id>.json`)

```json
{
  "schemaVersion": "neuroverse/v1",
  "id": "sub-research-01",
  "type": "subagent",
  "parentId": "sess-20261125-main",
  "label": "Audit auth flow",
  "status": "running",
  "updatedAt": "2026-11-25T14:35:00.000Z",
  "config": {
    "role": "Security Researcher",
    "model": "claude-sonnet-4.5",
    "task": "Inspect OAuth refresh token rotation and session expiry",
    "progress": "Checking token middleware",
    "activeTool": "read_file",
    "toolsUsed": ["find", "read_file"],
    "startedAt": "2026-11-25T14:34:12.000Z",
    "endedAt": null,
    "resultSummary": null
  },
  "links": [
    {
      "target": "sub-test-02",
      "type": "collaborates",
      "status": "active",
      "label": "Send edge-case findings"
    }
  ],
  "metadata": {}
}
```

### Core Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `schemaVersion` | `"neuroverse/v1"` | Yes | Protocol version string. |
| `id` | `string` | Yes | URL/filename-safe unique identifier (`[a-zA-Z0-9._-]+`). Matches `<id>.json`. |
| `type` | `"harness" \| "session" \| "subagent"` | Yes | Resolves `nodeDefinitions[].type` in `definitions.json` (extensible for future `tool`/`mcp`/`skill` nodes). |
| `parentId` | `string \| null` | No | Parent node ID (`session` → `harness`, `subagent` → `session` or parent `subagent`). Automatically creates a `hierarchy` synapse edge. |
| `label` | `string` | Yes | Short human-readable title rendered on the HUD reticle and Inspector header. |
| `status` | `string` | Yes | Semantic runtime state: `"running"`, `"tool_calling"`, `"waiting"`, `"completed"`, `"idle"`, or `"error"`. Selects `appearance[status]` from `definitions.json`. |
| `updatedAt` | `string` (ISO-8601) | Yes | Last update timestamp. |
| `config` | `object` | No | Domain telemetry fields matching `nodeDefinitions[].fields` (shallow-merged over `defaultConfig`). |
| `links` | `NodeLink[]` | No | Additional directed neural synapses (`{ id?, target, type, status?, label? }`) for peer collaboration or cross-cluster signaling. |
| `metadata` | `object` | No | Arbitrary JSON-safe key-value extension bag. |

---

## 3. Standard Statuses

- **`running`**: Active reasoning or generation. High-luminosity stellar bloom, breathing corona, active axonal pulse stream.
- **`tool_calling`**: Executing an external tool/command (`config.activeTool`). Rapid high-energy synaptic flare.
- **`waiting`**: Paused awaiting user input, approval, or child subagent completion. Slow amber breathing halo.
- **`completed`**: Finished cleanly. Cools down into a calm, dim quiescent star while preserving structural topology.
- **`idle`**: Standing by with no active task (common for dormant `harness` or paused sessions).
- **`error`**: Failed or blocked with an error. Crimson warning oscillation.

---

## 4. Definition Registry (`definitions.json`)

Modeled after declarative flow definitions:
- **Instances carry only semantics** (`type`, `status`, `config`).
- **Definitions own presentation and inspector structure** (`appearance[status]`, `defaultConfig`, `fields`).
- MVP ships with built-in definitions (`references/default-definitions.json`) automatically copied to `~/.neuroverse/state/definitions.json` on first run. Future versions allow Agents or themes to register new node types (such as `tool`, `mcp`, `skill`) without changing frontend code.
