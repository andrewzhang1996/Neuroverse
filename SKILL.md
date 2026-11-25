---
name: neuroverse
description: >-
  Real-time local 3D neural-cosmos status visualization for AI agents and multi-agent harnesses.
  Use this skill whenever starting, updating, delegating (subagents), or completing tasks when
  Neuroverse status tracking is enabled, or when the user asks to launch, inspect, or update
  the Neuroverse dashboard.
---

# Neuroverse Skill

Neuroverse renders your runtime state and multi-agent topology as a local 3D neural cosmos (`Harness → Session → Subagent`).

Agents **never** write UI code, coordinates, or colors. You only update tiny semantic JSON node files in `~/.neuroverse/state/nodes/` (preferring the zero-dependency CLI helper [scripts/neuroverse.mjs](./scripts/neuroverse.mjs)).

---

## 1. Launching the Dashboard (When Requested or Not Running)

Start the local dashboard server in the background (defaults to `http://127.0.0.1:4399`):

```bash
node <skill-dir>/scripts/neuroverse.mjs serve --daemon
```

Check server health or get the active URL:

```bash
node <skill-dir>/scripts/neuroverse.mjs status
```

---

## 2. Lifecycle Reporting Protocol (Low-Token Rules)

Keep updates **coarse-grained and meaningful** (4–6 updates per task, never on every micro-thought):

### Step A — Register Host Harness & Session at Task Start
Ensure your host harness (`claude-code`, `codex`, `antigravity`, `deepseek-harness`, `doubao-work`, etc.) and current session exist:

```bash
node <skill-dir>/scripts/neuroverse.mjs upsert \
  --id "harness-claude-code" \
  --type harness \
  --label "Claude Code" \
  --status running \
  --set vendor="Anthropic" surface="CLI" workspace="$PWD"

node <skill-dir>/scripts/neuroverse.mjs upsert \
  --id "sess-<session-id>" \
  --type session \
  --parent "harness-claude-code" \
  --label "<short 3-6 word task title>" \
  --status running \
  --set model="<model-name>" workspace="$PWD" task="<concise user goal>" progress="Analyzing codebase"
```

### Step B — Update Major Tool / Phase Transitions
When entering a distinct phase or invoking a major tool:

```bash
node <skill-dir>/scripts/neuroverse.mjs upsert \
  --id "sess-<session-id>" \
  --status tool_calling \
  --set progress="Running integration test suite" activeTool="run_command" \
  --add-tool "run_command"
```

### Step C — Register Subagents & Collaboration Links
Whenever spawning a subagent, create a child node with `--parent "sess-<session-id>"`:

```bash
node <skill-dir>/scripts/neuroverse.mjs upsert \
  --id "sub-<subagent-id>" \
  --type subagent \
  --parent "sess-<session-id>" \
  --label "<short role/goal>" \
  --status running \
  --set role="<role>" model="<model>" task="<delegated prompt summary>"
```

If two subagents or sessions exchange findings directly, add a synaptic link:

```bash
node <skill-dir>/scripts/neuroverse.mjs link \
  --from "sub-<id-a>" \
  --to "sub-<id-b>" \
  --type collaborates \
  --status active \
  --label "Sync schema contract"
```

### Step D — Complete or Fail Cleanly
Always transition `running` / `tool_calling` nodes to `completed` (or `error`) when done so inactive neurons cool down in the 3D cosmos (inactive `subagent` nodes automatically dissolve with a farewell afterglow once their TTL elapses, default `30s`, customizable via `--ttl <seconds>`):

```bash
node <skill-dir>/scripts/neuroverse.mjs complete \
  --id "sess-<session-id>" \
  --status completed \
  --summary "<1-2 sentence outcome summary>"
```

---

## 3. Direct JSON Fallback (Without CLI)

If shell execution is restricted, write or update `~/.neuroverse/state/nodes/<id>.json` directly using your file tool.
Read [references/schema.md](./references/schema.md) for the exact `neuroverse/v1` JSON schema and valid `status` values (`running`, `tool_calling`, `waiting`, `completed`, `idle`, `error`).
