import React from "react";
import type { SseConnectionState } from "../hooks/useFlowSnapshot";
import type { AggregatedFlowSnapshot } from "../types/flow";
import { shortenPath } from "../utils/formatters";

export interface TopTelemetryBarProps {
  snapshot: AggregatedFlowSnapshot | null;
  connectionState: SseConnectionState;
  navOpen: boolean;
  onToggleNav: () => void;
}

export const TopTelemetryBar: React.FC<TopTelemetryBarProps> = ({
  snapshot,
  connectionState,
  navOpen,
  onToggleNav,
}) => {
  const nodes = snapshot?.nodes ?? [];
  const edges = snapshot?.edges ?? [];

  const harnessCount = nodes.filter((n) => n.type === "harness").length;
  const activeNeurons = nodes.filter(
    (n) => n.status === "running" || n.status === "tool_calling"
  ).length;
  const firingSynapses = edges.filter(
    (e) => e.status === "active" || e.status === "error"
  ).length;

  const isLive = connectionState === "live";
  const dotColor = isLive ? "#4be3c8" : "#e09b46";
  const statePathLabel = snapshot?.stateDir
    ? shortenPath(snapshot.stateDir)
    : "~/.neuroverse/state";

  return (
    <header
      className="nv-glass"
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        height: 40,
        padding: "0 14px 0 8px",
        borderRadius: "var(--nv-radius-pill)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 20,
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        onClick={onToggleNav}
        title={navOpen ? "Collapse Hierarchy Navigator" : "Expand Hierarchy Navigator"}
        style={{
          width: 26,
          height: 26,
          borderRadius: "999px",
          border: "1px solid var(--nv-border-hairline)",
          background: navOpen
            ? "rgba(255, 244, 224, 0.1)"
            : "var(--nv-surface-subtle)",
          color: "var(--nv-text-primary)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        {navOpen ? "◧" : "☰"}
      </button>

      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.16em",
          color: "var(--nv-text-primary)",
        }}
      >
        NEUROVERSE
      </span>

      <span
        style={{
          width: 1,
          height: 14,
          background: "var(--nv-border-hairline)",
        }}
      />

      <span
        className="nv-mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--nv-text-secondary)",
        }}
        title={`SSE: ${connectionState} · ${snapshot?.stateDir ?? ""}`}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            backgroundColor: dotColor,
            boxShadow: `0 0 8px ${dotColor}`,
            animation: isLive ? "none" : "nv-pulse-opacity 1.4s ease-in-out infinite",
          }}
        />
        <span>{isLive ? "LIVE" : connectionState.toUpperCase()}</span>
        <span style={{ color: "var(--nv-text-muted)" }}>{statePathLabel}</span>
      </span>

      <span
        style={{
          width: 1,
          height: 14,
          background: "var(--nv-border-hairline)",
        }}
      />

      <div
        className="nv-mono"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 11,
          color: "var(--nv-text-secondary)",
        }}
      >
        <span>
          <strong style={{ color: "var(--nv-text-primary)", fontWeight: 600 }}>
            {harnessCount}
          </strong>{" "}
          Harnesses
        </span>
        <span style={{ color: "var(--nv-text-muted)" }}>·</span>
        <span>
          <strong style={{ color: "var(--nv-status-running)", fontWeight: 600 }}>
            {activeNeurons}
          </strong>{" "}
          Active Neurons
        </span>
        <span style={{ color: "var(--nv-text-muted)" }}>·</span>
        <span>
          <strong style={{ color: "var(--nv-status-tool)", fontWeight: 600 }}>
            {firingSynapses}
          </strong>{" "}
          Firing Synapses
        </span>
      </div>
    </header>
  );
};
