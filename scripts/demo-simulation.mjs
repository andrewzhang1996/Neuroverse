import { pathToFileURL } from "node:url";

import {
  cleanNodes,
  completeNode,
  loadAggregatedSnapshot,
  resolveStateDir,
  upsertNode,
  upsertNodeLink,
} from "./state-store.mjs";

let activeDemoPromise = null;
let continuousStopFn = null;

export function isDemoRunning() {
  return activeDemoPromise !== null || continuousStopFn !== null;
}

export function getDemoMode() {
  if (continuousStopFn !== null) return "stream";
  if (activeDemoPromise !== null) return "scenario";
  return "none";
}

export function stopContinuousDemo() {
  if (continuousStopFn) {
    continuousStopFn();
    continuousStopFn = null;
    return true;
  }
  return false;
}

function delay(ms, speedMultiplier = 1) {
  const scaled = Math.max(20, Math.round(ms / Math.max(speedMultiplier, 0.1)));
  return new Promise((resolve) => setTimeout(resolve, scaled));
}

/**
 * Instantly populate a rich multi-harness neural constellation for showcase/testing.
 */
export function seedStaticShowcase(explicitDir) {
  const stateDir = resolveStateDir(explicitDir);
  cleanNodes(stateDir);

  // 1. Claude Code (Anthropic · CLI)
  upsertNode(stateDir, {
    id: "harness-claude-code",
    type: "harness",
    label: "Claude Code",
    status: "running",
    config: {
      vendor: "Anthropic",
      surface: "CLI",
      workspace: "~/dev/auth-gateway",
      version: "2.1.4",
    },
  });

  upsertNode(stateDir, {
    id: "sess-refactor-auth",
    type: "session",
    parentId: "harness-claude-code",
    label: "Refactor OAuth2 PKCE & rotation",
    status: "running",
    config: {
      model: "claude-opus-4.6",
      workspace: "~/dev/auth-gateway",
      task: "Refactor OAuth2 PKCE & session rotation across edge middleware",
      progress: "Coordinating security audit & token rotation patches",
      activeTool: "invoke_subagent",
    },
    addTools: ["read_file", "grep_search", "invoke_subagent"],
  });

  upsertNode(stateDir, {
    id: "sub-sec-audit",
    type: "subagent",
    parentId: "sess-refactor-auth",
    label: "Security Auditor",
    status: "tool_calling",
    config: {
      role: "Security Auditor",
      model: "claude-sonnet-4.5",
      task: "Trace refresh-token replay vectors in OAuth callback handler",
      progress: "Scanning PKCE code_verifier bindings",
      activeTool: "grep_search",
    },
    addTools: ["grep_search", "read_file"],
  });

  upsertNode(stateDir, {
    id: "sub-token-impl",
    type: "subagent",
    parentId: "sess-refactor-auth",
    label: "Auth Engineer",
    status: "tool_calling",
    config: {
      role: "Auth Engineer",
      model: "claude-sonnet-4.5",
      task: "Implement atomic refresh-token family invalidation",
      progress: "Updating session store rotation hook",
      activeTool: "edit_file",
    },
    addTools: ["read_file", "edit_file", "run_command"],
  });

  upsertNode(stateDir, {
    id: "sub-test-runner",
    type: "subagent",
    parentId: "sess-refactor-auth",
    label: "Verification Runner",
    status: "waiting",
    config: {
      role: "Verification Runner",
      model: "claude-haiku-4.5",
      task: "Run integration suite after Auth Engineer lands rotation patch",
      progress: "Awaiting sub-token-impl patch",
    },
    addTools: ["read_file"],
  });

  upsertNodeLink(stateDir, {
    from: "sub-sec-audit",
    to: "sub-token-impl",
    type: "collaborates",
    status: "active",
    label: "Report refresh-token replay edge case",
  });

  // 2. Codex CLI (OpenAI · Terminal)
  upsertNode(stateDir, {
    id: "harness-codex",
    type: "harness",
    label: "Codex CLI",
    status: "running",
    config: {
      vendor: "OpenAI",
      surface: "Terminal",
      workspace: "~/dev/cosmos-kernel",
      version: "0.9.8",
    },
  });

  upsertNode(stateDir, {
    id: "sess-kernel-bench",
    type: "session",
    parentId: "harness-codex",
    label: "Optimize WebGL buffer allocator",
    status: "tool_calling",
    config: {
      model: "gpt-5-codex",
      workspace: "~/dev/cosmos-kernel",
      task: "Optimize WebGL instanced buffer allocator for 10k synaptic pulses",
      progress: "Benchmarking zero-copy Float32Array ring buffer",
      activeTool: "cargo bench",
    },
    addTools: ["read_file", "edit_file", "cargo bench"],
  });

  upsertNode(stateDir, {
    id: "sess-docs-sync",
    type: "session",
    parentId: "harness-codex",
    label: "Sync OpenAPI schema docs",
    status: "completed",
    config: {
      model: "gpt-5-mini",
      workspace: "~/dev/cosmos-kernel",
      task: "Verify reference schema examples match runtime types",
      progress: "Completed",
    },
    addTools: ["read_file", "run_command"],
  });
  completeNode(stateDir, {
    id: "sess-docs-sync",
    status: "completed",
    summary: "All schema docs verified against neuroverse/v1.",
  });

  // 3. Antigravity IDE (Google DeepMind · Agentic IDE)
  upsertNode(stateDir, {
    id: "harness-antigravity",
    type: "harness",
    label: "Antigravity IDE",
    status: "running",
    config: {
      vendor: "Google DeepMind",
      surface: "Agentic IDE",
      workspace: "~/dev/Neuroverse",
      version: "2.0.0",
    },
  });

  upsertNode(stateDir, {
    id: "sess-cosmos-arch",
    type: "session",
    parentId: "harness-antigravity",
    label: "Architect 3D Neural Engine",
    status: "running",
    config: {
      model: "gemini-4",
      workspace: "~/dev/Neuroverse",
      task: "Architect 3D Neural Observability Engine with HDR bloom",
      progress: "Synthesizing shader uniforms & orbital mechanics",
      activeTool: "write_file",
    },
    addTools: ["read_file", "write_file"],
  });

  upsertNode(stateDir, {
    id: "sub-shader-lab",
    type: "subagent",
    parentId: "sess-cosmos-arch",
    label: "GLSL Shader Lab",
    status: "tool_calling",
    config: {
      role: "Shader Specialist",
      model: "gemini-4",
      task: "Tune solar plasma granulation FBM and diffraction corona",
      progress: "Calibrating UnrealBloomPass threshold",
      activeTool: "write_file",
    },
    addTools: ["read_file", "write_file"],
  });

  upsertNode(stateDir, {
    id: "sub-schema-design",
    type: "subagent",
    parentId: "sess-cosmos-arch",
    label: "Protocol Architect",
    status: "completed",
    config: {
      role: "Protocol Architect",
      model: "gemini-4",
      task: "Define sharded atomic state protocol and edge derivation",
    },
    addTools: ["read_file", "write_file"],
  });
  completeNode(stateDir, {
    id: "sub-schema-design",
    status: "completed",
    ttlSeconds: 6,
    summary: "Locked neuroverse/v1 atomic JSON schema.",
  });

  upsertNode(stateDir, {
    id: "sess-eval-suite",
    type: "session",
    parentId: "harness-antigravity",
    label: "SSE latency telemetry check",
    status: "idle",
    config: {
      model: "gemini-4-flash",
      workspace: "~/dev/Neuroverse",
      task: "Standby verification suite for 60ms SSE debounce",
      progress: "Standing by",
    },
  });

  // Cross-cluster synaptic collaboration bridge
  upsertNodeLink(stateDir, {
    from: "sub-shader-lab",
    to: "sess-kernel-bench",
    type: "collaborates",
    status: "active",
    label: "Sync instanced pulse buffer layout",
  });

  return { ok: true, stateDir };
}

/**
 * Populate a massive ~168-node accumulated multi-day neural connectome across 5 AI Harnesses
 * (5 Harnesses + 48 Sessions + 115 Subagents + 28 Cross-Lobe Synaptic Bridges) to test & showcase
 * realistic long-term local JSON state growth!
 */
export function seedMassiveConnectome(explicitDir) {
  const stateDir = resolveStateDir(explicitDir);
  cleanNodes(stateDir);

  const harnesses = [
    {
      id: "harness-claude-code",
      label: "Claude Code",
      vendor: "Anthropic",
      surface: "CLI",
      workspace: "~/dev/platform-monorepo",
      version: "2.1.4",
      models: ["claude-opus-4.6", "claude-sonnet-4.5", "claude-haiku-4.5"],
    },
    {
      id: "harness-codex",
      label: "Codex CLI",
      vendor: "OpenAI",
      surface: "Terminal",
      workspace: "~/dev/rust-storage-engine",
      version: "0.9.8",
      models: ["gpt-5-codex", "gpt-5", "gpt-5-mini"],
    },
    {
      id: "harness-antigravity",
      label: "Antigravity IDE",
      vendor: "Google DeepMind",
      surface: "Agentic IDE",
      workspace: "~/dev/Neuroverse",
      version: "2.0.0",
      models: ["gemini-4", "gemini-4-flash"],
    },
    {
      id: "harness-deepseek",
      label: "DeepSeek Harness",
      vendor: "DeepSeek",
      surface: "Autonomous CLI",
      workspace: "~/dev/distributed-inference",
      version: "1.4.2",
      models: ["deepseek-r2", "deepseek-v3.2"],
    },
    {
      id: "harness-doubao",
      label: "Doubao Work",
      vendor: "ByteDance",
      surface: "Desktop Workspace",
      workspace: "~/dev/data-pipeline-hub",
      version: "3.1.0",
      models: ["doubao-seed-2.0", "doubao-pro"],
    },
  ];

  const sessionTemplates = [
    "Refactor OAuth2 PKCE rotation",
    "Optimize WebGL instanced drawbuffers",
    "Migrate Postgres WAL replication",
    "Audit Kubernetes RBAC policies",
    "Implement zero-copy Arrow Flight stream",
    "Fix race condition in SSE watcher",
    "Design 3D pyramidal neuron shader",
    "Benchmark SIMD vector quantization",
    "Synthesize e2e Playwright regression suite",
    "Profile V8 heap snapshot retention",
    "Build CRDT collaborative state sync",
    "Harden gRPC mTLS certificate rotation",
  ];

  const subRoles = [
    ["Codebase Explorer", "grep_search"],
    ["Architecture Planner", "read_file"],
    ["Kernel Implementer", "edit_file"],
    ["Test Verifier", "run_command"],
    ["Security Reviewer", "grep_search"],
    ["Perf Profiler", "cargo bench"],
    ["Schema Validator", "write_file"],
  ];

  for (const h of harnesses) {
    upsertNode(stateDir, {
      id: h.id,
      type: "harness",
      label: h.label,
      status: "idle",
      config: {
        vendor: h.vendor,
        surface: h.surface,
        workspace: h.workspace,
        version: h.version,
      },
    });
  }

  const allSessions = [];
  const allSubagents = [];
  const activeSubagents = [];
  let sessionCounter = 0;
  let subCounter = 0;

  // 48 Sessions across 5 Harnesses (10, 10, 10, 9, 9)
  harnesses.forEach((h, hIdx) => {
    const sessCount = hIdx < 3 ? 10 : 9;
    for (let s = 0; s < sessCount; s += 1) {
      sessionCounter += 1;
      const sessId = `sess-${hIdx + 1}-${String(s + 1).padStart(2, "0")}`;
      const title =
        sessionTemplates[(sessionCounter - 1) % sessionTemplates.length];

      // Realistic distribution: ~15% currently active, ~4% waiting, ~2% error, ~79% historical completed/idle
      let sessStatus = "completed";
      if (s === 0) {
        sessStatus = hIdx % 2 === 0 ? "running" : "tool_calling";
      } else if (s === 1 && hIdx < 2) {
        sessStatus = "running";
      } else if (s === 2 && hIdx === 2) {
        sessStatus = "waiting";
      } else if (s === 3 && hIdx === 3) {
        sessStatus = "error";
      } else if (s === sessCount - 1 && hIdx >= 3) {
        sessStatus = "idle";
      }

      const model = h.models[s % h.models.length];
      const activeTool =
        sessStatus === "tool_calling"
          ? subRoles[(s + hIdx) % subRoles.length][1]
          : sessStatus === "running"
          ? "invoke_subagent"
          : null;

      upsertNode(stateDir, {
        id: sessId,
        type: "session",
        parentId: h.id,
        label: `${title} #${sessionCounter}`,
        status: sessStatus,
        config: {
          model,
          workspace: h.workspace,
          task: `${title} in ${h.workspace}`,
          progress:
            sessStatus === "completed"
              ? "Merged & verified"
              : sessStatus === "error"
              ? "Blocked on integration timeout"
              : `Executing stage ${(s % 4) + 1}/4`,
          activeTool,
          resultSummary:
            sessStatus === "completed"
              ? `Completed ${title.toLowerCase()} with all checks green.`
              : sessStatus === "error"
              ? "Integration test timed out after 30s on port lock."
              : null,
        },
        addTools: ["read_file", "grep_search", "edit_file"],
      });

      allSessions.push({ id: sessId, hIdx, status: sessStatus });

      // Spawn 1..4 subagents per session (~115 subagents total)
      const subCount = (sessionCounter % 3) + 1 + (s === 0 ? 2 : 0); // active primary sessions have 3..4 subagents
      for (let k = 0; k < subCount; k += 1) {
        subCounter += 1;
        const subId = `sub-${hIdx + 1}-${String(s + 1).padStart(2, "0")}-${k + 1}`;
        const [roleName, toolName] = subRoles[(subCounter - 1) % subRoles.length];

        let subStatus = "completed";
        if (sessStatus === "running" || sessStatus === "tool_calling") {
          if (k === 0) subStatus = "tool_calling";
          else if (k === 1) subStatus = "running";
          else if (k === 2) subStatus = "waiting";
          else subStatus = "completed";
        } else if (sessStatus === "error" && k === 0) {
          subStatus = "error";
        }

        upsertNode(stateDir, {
          id: subId,
          type: "subagent",
          parentId: sessId,
          label: `${roleName} ${s + 1}.${k + 1}`,
          status: subStatus,
          config: {
            role: roleName,
            model: h.models[(k + 1) % h.models.length],
            task: `${roleName} subtask for ${title}`,
            progress:
              subStatus === "completed"
                ? "Delivered findings"
                : `Running ${toolName}`,
            activeTool: subStatus === "tool_calling" ? toolName : null,
            resultSummary:
              subStatus === "completed"
                ? "Verified module invariants and emitted structured report."
                : null,
            ttlSeconds:
              subStatus === "completed"
                ? 4 + (subCounter % 32)
                : 12,
          },
          addTools: ["read_file", toolName],
        });

        const subInfo = { id: subId, hIdx, sessId, status: subStatus };
        allSubagents.push(subInfo);
        if (subStatus === "running" || subStatus === "tool_calling") {
          activeSubagents.push(subInfo);
        }
      }
    }
  });

  // Add 10 active cross-lobe & intra-lobe synaptic bridges among firing subagents
  for (let i = 0; i < Math.min(10, activeSubagents.length - 1); i += 1) {
    const src = activeSubagents[i];
    const dst = activeSubagents[(i + 3) % activeSubagents.length];
    if (src.id !== dst.id) {
      upsertNodeLink(stateDir, {
        from: src.id,
        to: dst.id,
        type: "collaborates",
        status: "active",
        label: "Cross-agent telemetry & contract sync",
      });
    }
  }

  // Add 18 historical completed long-range associative white-matter tracts across lobes
  for (let i = 0; i < 18; i += 1) {
    const idxA = (i * 6) % allSubagents.length;
    const idxB = (idxA + 23) % allSubagents.length;
    if (idxA !== idxB) {
      upsertNodeLink(stateDir, {
        from: allSubagents[idxA].id,
        to: allSubagents[idxB].id,
        type: "collaborates",
        status: "completed",
        label: "Archived cross-session reference",
      });
    }
  }

  return {
    ok: true,
    stateDir,
    counts: {
      harnesses: harnesses.length,
      sessions: allSessions.length,
      subagents: allSubagents.length,
      totalNodes: harnesses.length + allSessions.length + allSubagents.length,
    },
  };
}

const STREAM_HARNESSES = [
  {
    id: "harness-claude-code",
    label: "Claude Code",
    vendor: "Anthropic",
    surface: "CLI",
    workspace: "~/dev/auth-gateway",
    version: "2.1.4",
    models: ["claude-opus-4.6", "claude-sonnet-4.5", "claude-haiku-4.5"],
  },
  {
    id: "harness-codex",
    label: "Codex CLI",
    vendor: "OpenAI",
    surface: "Terminal",
    workspace: "~/dev/rust-storage-engine",
    version: "0.9.8",
    models: ["gpt-5-codex", "gpt-5", "gpt-5-mini"],
  },
  {
    id: "harness-antigravity",
    label: "Antigravity IDE",
    vendor: "Google DeepMind",
    surface: "Agentic IDE",
    workspace: "~/dev/Neuroverse",
    version: "2.0.0",
    models: ["gemini-4", "gemini-4-flash"],
  },
  {
    id: "harness-deepseek",
    label: "DeepSeek Harness",
    vendor: "DeepSeek",
    surface: "Autonomous CLI",
    workspace: "~/dev/distributed-inference",
    version: "1.4.2",
    models: ["deepseek-r2", "deepseek-v3.2"],
  },
];

const STREAM_SESSION_TOPICS = [
  "Refactor OAuth2 PKCE rotation",
  "Optimize WebGL buffer allocator",
  "Migrate Postgres logical WAL",
  "Audit Kubernetes RBAC policies",
  "Stream Arrow Flight columnar batches",
  "Harden gRPC mTLS cert rotation",
  "Profile V8 heap retention leak",
  "Build CRDT state reconciler",
  "Synthesize Playwright e2e suite",
  "Tune SIMD quantization kernel",
];

const STREAM_TOOLS = [
  "read_file",
  "grep_search",
  "edit_file",
  "write_file",
  "run_command",
  "cargo test",
  "search_web",
  "pytest",
];

const STREAM_ROLES = [
  "Codebase Explorer",
  "Security Auditor",
  "Kernel Engineer",
  "Test Verifier",
  "Perf Profiler",
  "Schema Architect",
];

const STREAM_SYNAPSE_LABELS = [
  "Sync schema contract",
  "Share AST trace",
  "Report race condition",
  "Forward benchmark metrics",
  "Verify token rotation",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Start an indefinite, self-balancing live ecosystem stream where harnesses, sessions,
 * subagents, tools, collaboration synapses, errors, recoveries, and TTL farewells
 * continuously evolve every ~800ms until stopContinuousDemo() is called!
 */
export function startContinuousDemo({
  stateDir: explicitDir,
  tickMs = 800,
} = {}) {
  if (continuousStopFn) {
    return { ok: true, alreadyRunning: true, mode: "stream" };
  }

  const stateDir = resolveStateDir(explicitDir);
  let stopped = false;
  let timer = null;
  let seq = Date.now() % 10000;

  // Bootstrap ecosystem if fewer than 10 nodes exist; otherwise animate existing graph in-place!
  const initialSnap = loadAggregatedSnapshot(stateDir);
  if (initialSnap.nodes.length < 10) {
    for (const h of STREAM_HARNESSES) {
      upsertNode(stateDir, {
        id: h.id,
        type: "harness",
        label: h.label,
        status: "idle",
        config: {
          vendor: h.vendor,
          surface: h.surface,
          workspace: h.workspace,
          version: h.version,
        },
      });

      for (let s = 0; s < 4; s += 1) {
        seq += 1;
        const topic = STREAM_SESSION_TOPICS[(seq + s) % STREAM_SESSION_TOPICS.length];
        const initStatuses = ["running", "tool_calling", "waiting", "completed"];
        const st = initStatuses[(s + seq) % initStatuses.length];
        const sessId = `sess-${h.id.replace("harness-", "")}-${s + 1}`;
        const tool = st === "tool_calling" ? pickRandom(STREAM_TOOLS) : null;

        upsertNode(stateDir, {
          id: sessId,
          type: "session",
          parentId: h.id,
          label: topic,
          status: st,
          config: {
            model: pickRandom(h.models),
            workspace: h.workspace,
            task: `${topic} (${h.label})`,
            progress: st === "completed" ? "Verified & merged" : `Running step ${(s % 3) + 1}`,
            activeTool: tool,
          },
          addTools: tool ? ["read_file", tool] : ["read_file"],
        });

        if (st === "running" || st === "tool_calling") {
          for (let k = 0; k < 2; k += 1) {
            seq += 1;
            const role = pickRandom(STREAM_ROLES);
            const subTool = k === 0 ? pickRandom(STREAM_TOOLS) : null;
            upsertNode(stateDir, {
              id: `sub-${seq}`,
              type: "subagent",
              parentId: sessId,
              label: role,
              status: k === 0 ? "tool_calling" : "running",
              config: {
                role,
                model: pickRandom(h.models),
                task: `${role} for ${topic}`,
                progress: subTool ? `Invoking ${subTool}` : "Synthesizing context",
                activeTool: subTool,
                ttlSeconds: 5,
              },
              addTools: subTool ? [subTool] : ["read_file"],
            });
          }
        }
      }
    }
  }

  const runTick = () => {
    if (stopped) return;
    try {
      const snap = loadAggregatedSnapshot(stateDir);
      const harnesses = snap.nodes.filter((n) => n.type === "harness");
      const sessions = snap.nodes.filter((n) => n.type === "session");
      const subagents = snap.nodes.filter((n) => n.type === "subagent");

      // Ensure at least STREAM_HARNESSES exist if store was emptied
      if (harnesses.length === 0) {
        for (const h of STREAM_HARNESSES) {
          upsertNode(stateDir, {
            id: h.id,
            type: "harness",
            label: h.label,
            status: "idle",
            config: {
              vendor: h.vendor,
              surface: h.surface,
              workspace: h.workspace,
              version: h.version,
            },
          });
        }
      }

      const activeSessions = sessions.filter(
        (s) => s.status === "running" || s.status === "tool_calling"
      );

      // 1. Mutate 1..2 session states across the full status spectrum
      const sessionMutations = 1 + (Math.random() < 0.55 ? 1 : 0);
      for (let m = 0; m < sessionMutations && sessions.length > 0; m += 1) {
        const sess = pickRandom(sessions);
        const cur = sess.status;

        if (cur === "completed" || cur === "idle") {
          // Wake dormant session if active count is reasonable
          if (activeSessions.length < 10) {
            upsertNode(stateDir, {
              id: sess.id,
              status: "running",
              config: {
                progress: "Resuming iterative refinement",
                activeTool: null,
                endedAt: null,
              },
            });
          }
        } else if (cur === "error") {
          // Self-heal erroring sessions with a live patch!
          const fixTool = "edit_file";
          upsertNode(stateDir, {
            id: sess.id,
            status: "tool_calling",
            config: {
              progress: "Applying recovery fix after failed check",
              activeTool: fixTool,
              endedAt: null,
            },
            addTools: [fixTool],
          });
        } else if (cur === "waiting") {
          const tool = pickRandom(STREAM_TOOLS);
          upsertNode(stateDir, {
            id: sess.id,
            status: "tool_calling",
            config: {
              progress: `Unblocked — running ${tool}`,
              activeTool: tool,
            },
            addTools: [tool],
          });
        } else if (cur === "running") {
          const r = Math.random();
          if (r < 0.52) {
            const tool = pickRandom(STREAM_TOOLS);
            upsertNode(stateDir, {
              id: sess.id,
              status: "tool_calling",
              config: {
                progress: `Executing ${tool}`,
                activeTool: tool,
              },
              addTools: [tool],
            });
          } else if (r < 0.68) {
            upsertNode(stateDir, {
              id: sess.id,
              status: "waiting",
              config: {
                progress: "Awaiting subagent consensus",
                activeTool: null,
              },
            });
          } else if (r < 0.8 && activeSessions.length > 3) {
            completeNode(stateDir, {
              id: sess.id,
              status: "completed",
              summary: "All verification gates passed cleanly.",
            });
          } else if (r >= 0.92) {
            upsertNode(stateDir, {
              id: sess.id,
              status: "error",
              config: {
                progress: "Assertion failed in integration check",
                activeTool: null,
              },
            });
          }
        } else if (cur === "tool_calling") {
          const r = Math.random();
          if (r < 0.55) {
            upsertNode(stateDir, {
              id: sess.id,
              status: "running",
              config: {
                progress: "Synthesizing tool output",
                activeTool: null,
              },
            });
          } else if (r < 0.8) {
            const nextTool = pickRandom(STREAM_TOOLS);
            upsertNode(stateDir, {
              id: sess.id,
              status: "tool_calling",
              config: {
                progress: `Chaining ${nextTool}`,
                activeTool: nextTool,
              },
              addTools: [nextTool],
            });
          } else if (activeSessions.length > 3) {
            completeNode(stateDir, {
              id: sess.id,
              status: "completed",
              summary: "Task completed and changes verified.",
            });
          }
        }
      }

      // Occasionally spawn a brand-new session if total sessions < 28
      if (sessions.length < 28 && harnesses.length > 0 && Math.random() < 0.16) {
        seq += 1;
        const host = pickRandom(harnesses);
        const topic = pickRandom(STREAM_SESSION_TOPICS);
        upsertNode(stateDir, {
          id: `sess-live-${seq}`,
          type: "session",
          parentId: host.id,
          label: `${topic}`,
          status: "running",
          config: {
            model: "claude-sonnet-4.5",
            workspace: host.config?.workspace ?? "~/dev/workspace",
            task: topic,
            progress: "Initializing task plan",
          },
          addTools: ["read_file"],
        });
      }

      // 2. Spawn new subagents on active sessions (keeps fresh births flowing!)
      const liveSubs = subagents.filter(
        (sub) =>
          sub.status === "running" ||
          sub.status === "tool_calling" ||
          sub.status === "waiting"
      );

      if (activeSessions.length > 0 && liveSubs.length < 22 && Math.random() < 0.72) {
        const parentSess = pickRandom(activeSessions);
        const kidsOfParent = liveSubs.filter((s) => s.parentId === parentSess.id);
        if (kidsOfParent.length < 4) {
          seq += 1;
          const role = pickRandom(STREAM_ROLES);
          const tool = Math.random() < 0.5 ? pickRandom(STREAM_TOOLS) : null;
          upsertNode(stateDir, {
            id: `sub-live-${seq}`,
            type: "subagent",
            parentId: parentSess.id,
            label: `${role}`,
            status: tool ? "tool_calling" : "running",
            config: {
              role,
              model: parentSess.config?.model ?? "gemini-4-flash",
              task: `Delegated ${role.toLowerCase()} workflow`,
              progress: tool ? `Running ${tool}` : "Analyzing module graph",
              activeTool: tool,
              ttlSeconds: 4 + Math.floor(Math.random() * 4),
            },
            addTools: tool ? [tool] : ["read_file"],
          });
        }
      }

      // 3. Advance 1..3 live subagents (tool flares, waiting, occasional error, and completions -> Farewell Afterglow!)
      const subSteps = Math.min(liveSubs.length, 1 + Math.floor(Math.random() * 3));
      for (let i = 0; i < subSteps; i += 1) {
        const sub = pickRandom(liveSubs);
        const r = Math.random();
        if (r < 0.36) {
          const tool = pickRandom(STREAM_TOOLS);
          upsertNode(stateDir, {
            id: sub.id,
            status: "tool_calling",
            config: {
              progress: `Executing ${tool}`,
              activeTool: tool,
            },
            addTools: [tool],
          });
        } else if (r < 0.58) {
          upsertNode(stateDir, {
            id: sub.id,
            status: "running",
            config: {
              progress: "Distilling intermediate findings",
              activeTool: null,
            },
          });
        } else if (r < 0.68) {
          upsertNode(stateDir, {
            id: sub.id,
            status: "waiting",
            config: {
              progress: "Syncing with peer worker",
              activeTool: null,
            },
          });
        } else if (r < 0.94) {
          // Complete with short 3.5..6s TTL so user sees frequent poetic Farewell Afterglows!
          completeNode(stateDir, {
            id: sub.id,
            status: "completed",
            ttlSeconds: 3.5 + Math.round(Math.random() * 25) / 10,
            summary: "Delivered verified subagent findings to parent session.",
          });
        } else {
          completeNode(stateDir, {
            id: sub.id,
            status: "error",
            ttlSeconds: 5,
            summary: "Subtask hit sandbox timeout; parent session notified.",
          });
        }
      }

      // 4. Forge or retire cross-node `collaborates` synaptic bridges
      const firingPool = [...activeSessions, ...liveSubs];
      if (firingPool.length >= 2 && Math.random() < 0.45) {
        const a = pickRandom(firingPool);
        const b = pickRandom(firingPool);
        if (a.id !== b.id && a.parentId !== b.id && b.parentId !== a.id) {
          const existingLinks = Array.isArray(a.links) ? a.links : [];
          if (existingLinks.length < 2) {
            upsertNodeLink(stateDir, {
              from: a.id,
              to: b.id,
              type: "collaborates",
              status: "active",
              label: pickRandom(STREAM_SYNAPSE_LABELS),
            });
          } else {
            const old = pickRandom(existingLinks);
            upsertNodeLink(stateDir, {
              from: a.id,
              to: old.target,
              type: "collaborates",
              status: "completed",
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[neuroverse-stream] Tick warning: ${err.message}`);
    }

    if (!stopped) {
      const jittered = Math.round(tickMs * (0.8 + Math.random() * 0.45));
      timer = setTimeout(runTick, jittered);
    }
  };

  timer = setTimeout(runTick, 350);

  continuousStopFn = () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { ok: true, running: true, mode: "stream", stateDir };
}

/**
 * Execute an ~18s choreographed multi-harness live simulation.
 */
export async function runDemoScenario({
  stateDir: explicitDir,
  speedMultiplier = 1,
} = {}) {
  if (activeDemoPromise) {
    return { ok: true, alreadyRunning: true };
  }

  const stateDir = resolveStateDir(explicitDir);

  activeDemoPromise = (async () => {
    cleanNodes(stateDir);

    // T+0.0s: Host Harnesses ignite
    upsertNode(stateDir, {
      id: "harness-claude-code",
      type: "harness",
      label: "Claude Code",
      status: "idle",
      config: {
        vendor: "Anthropic",
        surface: "CLI",
        workspace: "~/dev/auth-gateway",
        version: "2.1.4",
      },
    });
    upsertNode(stateDir, {
      id: "harness-codex",
      type: "harness",
      label: "Codex CLI",
      status: "idle",
      config: {
        vendor: "OpenAI",
        surface: "Terminal",
        workspace: "~/dev/cosmos-kernel",
        version: "0.9.8",
      },
    });
    upsertNode(stateDir, {
      id: "harness-antigravity",
      type: "harness",
      label: "Antigravity IDE",
      status: "running",
      config: {
        vendor: "Google DeepMind",
        surface: "Agentic IDE",
        workspace: "~/dev/Neuroverse",
        version: "2.0.0",
      },
    });

    // Historical cooled session for luminance contrast
    upsertNode(stateDir, {
      id: "sess-docs-sync",
      type: "session",
      parentId: "harness-codex",
      label: "Sync OpenAPI schema docs",
      status: "completed",
      config: {
        model: "gpt-5-mini",
        workspace: "~/dev/cosmos-kernel",
        task: "Verify schema documentation alignment",
        resultSummary: "Verified zero schema drift across 4 specs.",
      },
      addTools: ["read_file"],
    });

    await delay(1200, speedMultiplier);

    // T+1.2s: Primary sessions spin up (auto-illuminating idle harnesses)
    upsertNode(stateDir, {
      id: "sess-refactor-auth",
      type: "session",
      parentId: "harness-claude-code",
      label: "Refactor OAuth2 PKCE & rotation",
      status: "running",
      config: {
        model: "claude-opus-4.6",
        workspace: "~/dev/auth-gateway",
        task: "Refactor OAuth2 PKCE & session rotation",
        progress: "Mapping token refresh middleware",
      },
      addTools: ["read_file"],
    });

    upsertNode(stateDir, {
      id: "sess-cosmos-arch",
      type: "session",
      parentId: "harness-antigravity",
      label: "Architect 3D Neural Engine",
      status: "running",
      config: {
        model: "gemini-4",
        workspace: "~/dev/Neuroverse",
        task: "Architect 3D Neural Observability Engine",
        progress: "Designing GLSL shaders and orbital mechanics",
      },
      addTools: ["read_file"],
    });

    await delay(1800, speedMultiplier);

    // T+3.0s: Subagent constellation spawns in parallel
    upsertNode(stateDir, {
      id: "sub-sec-audit",
      type: "subagent",
      parentId: "sess-refactor-auth",
      label: "Security Auditor",
      status: "tool_calling",
      config: {
        role: "Security Auditor",
        model: "claude-sonnet-4.5",
        task: "Audit OAuth refresh token replay vectors",
        progress: "Grepping token verification paths",
        activeTool: "grep_search",
      },
      addTools: ["grep_search"],
    });

    upsertNode(stateDir, {
      id: "sub-token-impl",
      type: "subagent",
      parentId: "sess-refactor-auth",
      label: "Auth Engineer",
      status: "running",
      config: {
        role: "Auth Engineer",
        model: "claude-sonnet-4.5",
        task: "Implement atomic refresh-token family rotation",
        progress: "Preparing session store patch",
      },
      addTools: ["read_file"],
    });

    upsertNode(stateDir, {
      id: "sub-test-runner",
      type: "subagent",
      parentId: "sess-refactor-auth",
      label: "Verification Runner",
      status: "waiting",
      config: {
        role: "Verification Runner",
        model: "claude-haiku-4.5",
        task: "Run auth integration tests once rotation patch lands",
        progress: "Waiting for Auth Engineer",
      },
    });

    upsertNode(stateDir, {
      id: "sub-shader-lab",
      type: "subagent",
      parentId: "sess-cosmos-arch",
      label: "GLSL Shader Lab",
      status: "tool_calling",
      config: {
        role: "Shader Specialist",
        model: "gemini-4",
        task: "Craft soma FBM plasma and corona diffraction shaders",
        progress: "Writing GLSL fragment kernels",
        activeTool: "write_file",
      },
      addTools: ["write_file"],
    });

    upsertNode(stateDir, {
      id: "sub-schema-design",
      type: "subagent",
      parentId: "sess-cosmos-arch",
      label: "Protocol Architect",
      status: "running",
      config: {
        role: "Protocol Architect",
        model: "gemini-4",
        task: "Finalize neuroverse/v1 definitions schema",
        progress: "Validating status visual presets",
      },
      addTools: ["read_file"],
    });

    await delay(2400, speedMultiplier);

    // T+5.4s: Codex starts benchmark session & peer synapses fire
    upsertNode(stateDir, {
      id: "sess-kernel-bench",
      type: "session",
      parentId: "harness-codex",
      label: "Optimize WebGL buffer allocator",
      status: "tool_calling",
      config: {
        model: "gpt-5-codex",
        workspace: "~/dev/cosmos-kernel",
        task: "Optimize WebGL instanced buffer allocator",
        progress: "Running microbenchmarks",
        activeTool: "cargo bench",
      },
      addTools: ["read_file", "cargo bench"],
    });

    upsertNodeLink(stateDir, {
      from: "sub-sec-audit",
      to: "sub-token-impl",
      type: "collaborates",
      status: "active",
      label: "Report refresh-token replay edge case",
    });

    upsertNodeLink(stateDir, {
      from: "sub-shader-lab",
      to: "sess-kernel-bench",
      type: "collaborates",
      status: "active",
      label: "Align instanced pulse attribute stride",
    });

    await delay(2600, speedMultiplier);

    // T+8.0s: Tool calling flare on Auth Engineer & Schema Architect completes
    upsertNode(stateDir, {
      id: "sub-token-impl",
      status: "tool_calling",
      config: {
        progress: "Patching atomic rotation lock",
        activeTool: "edit_file",
      },
      addTools: ["edit_file"],
    });

    upsertNode(stateDir, {
      id: "sub-sec-audit",
      status: "tool_calling",
      config: {
        progress: "Inspecting PKCE state entropy",
        activeTool: "read_file",
      },
      addTools: ["read_file"],
    });

    completeNode(stateDir, {
      id: "sub-schema-design",
      status: "completed",
      ttlSeconds: 4.5,
      summary: "Schema contract locked with 6 stellar status presets.",
    });

    await delay(2800, speedMultiplier);

    // T+10.8s: Verification runner wakes up; Codex finishes bench
    upsertNode(stateDir, {
      id: "sub-token-impl",
      status: "tool_calling",
      config: {
        progress: "Running unit checks",
        activeTool: "run_command",
      },
      addTools: ["run_command"],
    });

    upsertNode(stateDir, {
      id: "sub-test-runner",
      status: "tool_calling",
      config: {
        progress: "Executing PKCE & replay integration suite",
        activeTool: "run_command",
      },
      addTools: ["run_command"],
    });

    completeNode(stateDir, {
      id: "sess-kernel-bench",
      status: "completed",
      summary: "Reduced instanced pulse buffer upload overhead by 64%.",
    });

    upsertNodeLink(stateDir, {
      from: "sub-shader-lab",
      to: "sess-kernel-bench",
      type: "collaborates",
      status: "completed",
      label: "Attribute layout verified",
    });

    await delay(2800, speedMultiplier);

    // T+13.6s: Auth subagents wrap up cleanly; Shader lab runs verification
    completeNode(stateDir, {
      id: "sub-sec-audit",
      status: "completed",
      ttlSeconds: 4.5,
      summary: "Zero remaining replay vectors after rotation lock.",
    });
    upsertNodeLink(stateDir, {
      from: "sub-sec-audit",
      to: "sub-token-impl",
      type: "collaborates",
      status: "completed",
      label: "Edge case resolved",
    });

    completeNode(stateDir, {
      id: "sub-token-impl",
      status: "completed",
      ttlSeconds: 5.5,
      summary: "Implemented atomic refresh-token family rotation.",
    });

    upsertNode(stateDir, {
      id: "sub-test-runner",
      status: "running",
      config: {
        progress: "Finalizing coverage report (42/42 passing)",
        activeTool: null,
      },
    });

    upsertNode(stateDir, {
      id: "sess-cosmos-arch",
      status: "tool_calling",
      config: {
        progress: "Bundling Three.js HDR composer pipeline",
        activeTool: "run_command",
      },
      addTools: ["run_command"],
    });

    await delay(2400, speedMultiplier);

    // T+16.0s: Final completions; leave Antigravity active so cosmos displays bright vs cooled contrast
    completeNode(stateDir, {
      id: "sub-test-runner",
      status: "completed",
      ttlSeconds: 5,
      summary: "42/42 auth & rotation integration tests passed.",
    });
    completeNode(stateDir, {
      id: "sess-refactor-auth",
      status: "completed",
      summary: "OAuth2 PKCE hardening & token rotation shipped cleanly.",
    });
    completeNode(stateDir, {
      id: "sub-shader-lab",
      status: "completed",
      ttlSeconds: 6.5,
      summary: "GLSL soma, corona, and action-potential shaders verified.",
    });

    upsertNode(stateDir, {
      id: "sess-cosmos-arch",
      status: "running",
      config: {
        progress: "Streaming live 3D telemetry at 60fps",
        activeTool: null,
      },
    });

    return { ok: true, stateDir };
  })();

  try {
    return await activeDemoPromise;
  } finally {
    activeDemoPromise = null;
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const instant = args.includes("--instant");
  const massive = args.includes("--massive");
  const stream = args.includes("--stream");
  let explicitStateDir;
  const dirIdx = args.indexOf("--state-dir");
  if (dirIdx >= 0 && args[dirIdx + 1]) {
    explicitStateDir = args[dirIdx + 1];
  }

  if (stream) {
    const res = startContinuousDemo({ stateDir: explicitStateDir });
    console.log(JSON.stringify(res));
    const shutdown = () => {
      stopContinuousDemo();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } else if (massive) {
    const res = seedMassiveConnectome(explicitStateDir);
    console.log(JSON.stringify({ ...res, mode: "massive" }));
  } else if (instant) {
    const res = seedStaticShowcase(explicitStateDir);
    console.log(JSON.stringify({ ...res, mode: "instant" }));
  } else {
    runDemoScenario({ stateDir: explicitStateDir })
      .then((res) => {
        console.log(JSON.stringify({ ...res, mode: "live" }));
      })
      .catch((err) => {
        console.error(`[neuroverse-demo] Error: ${err.message}`);
        process.exit(1);
      });
  }
}
