import React, { useEffect, useMemo, useState } from "react";
import { getNodeDefinition } from "../scene/layoutEngine";
import type {
  AggregatedFlowSnapshot,
  FlowNodeInstance,
  InspectorFieldDefinition,
  ResolvedSynapseEdge,
} from "../types/flow";
import {
  formatElapsed,
  formatTimestamp,
  getStatusAccentColor,
  getStatusLabel,
} from "../utils/formatters";

export interface NodeInspectorDrawerProps {
  snapshot: AggregatedFlowSnapshot | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

export const NodeInspectorDrawer: React.FC<NodeInspectorDrawerProps> = ({
  snapshot,
  selectedNodeId,
  onSelectNode,
  onClose,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const node = useMemo<FlowNodeInstance | null>(() => {
    if (!snapshot || !selectedNodeId) return null;
    return snapshot.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [snapshot, selectedNodeId]);

  const isOpen = node !== null;

  useEffect(() => {
    if (!isOpen) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, selectedNodeId]);

  const definition = useMemo(() => {
    if (!node || !snapshot) return undefined;
    return getNodeDefinition(node.type, snapshot.definitions);
  }, [node, snapshot]);

  const parentNode = useMemo(() => {
    if (!node?.parentId || !snapshot) return null;
    return snapshot.nodes.find((n) => n.id === node.parentId) ?? null;
  }, [node, snapshot]);

  const connectedSynapses = useMemo(() => {
    if (!node || !snapshot) return [];
    const nodeById = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const items: Array<{
      edge: ResolvedSynapseEdge;
      direction: "incoming" | "outgoing";
      peer: FlowNodeInstance;
    }> = [];

    for (const edge of snapshot.edges) {
      if (edge.source === node.id) {
        const peer = nodeById.get(edge.target);
        if (peer) items.push({ edge, direction: "outgoing", peer });
      } else if (edge.target === node.id) {
        const peer = nodeById.get(edge.source);
        if (peer) items.push({ edge, direction: "incoming", peer });
      }
    }
    return items;
  }, [node, snapshot]);

  const renderFieldValue = (
    field: InspectorFieldDefinition,
    rawVal: unknown
  ): React.ReactNode => {
    if (rawVal === undefined || rawVal === null || rawVal === "") {
      return null;
    }

    if (field.kind === "tags") {
      if (!Array.isArray(rawVal) || rawVal.length === 0) return null;
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {rawVal.map((item, idx) => (
            <span
              key={`${String(item)}-${idx}`}
              className="nv-mono"
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: "var(--nv-radius-pill)",
                background: "var(--nv-surface-subtle)",
                border: "1px solid var(--nv-border-hairline)",
                color: "var(--nv-text-code)",
              }}
            >
              {String(item)}
            </span>
          ))}
        </div>
      );
    }

    if (field.kind === "badge") {
      return (
        <span
          className="nv-mono"
          style={{
            display: "inline-block",
            fontSize: 11.5,
            padding: "2px 8px",
            borderRadius: "var(--nv-radius-sm)",
            background: "rgba(255, 248, 235, 0.06)",
            border: "1px solid var(--nv-border-hairline)",
            color: "var(--nv-text-primary)",
          }}
        >
          {String(rawVal)}
        </span>
      );
    }

    if (field.kind === "code") {
      return (
        <code
          className="nv-mono"
          style={{
            display: "block",
            fontSize: 11.5,
            padding: "6px 8px",
            borderRadius: "var(--nv-radius-sm)",
            background: "rgba(3, 5, 8, 0.55)",
            border: "1px solid var(--nv-border-hairline)",
            color: "var(--nv-text-code)",
            wordBreak: "break-all",
            userSelect: "text",
          }}
        >
          {String(rawVal)}
        </code>
      );
    }

    if (field.kind === "timestamp") {
      return (
        <span className="nv-mono" style={{ fontSize: 11.5, color: "var(--nv-text-primary)" }}>
          {formatTimestamp(rawVal)}
        </span>
      );
    }

    if (field.kind === "multiline") {
      return (
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--nv-text-primary)",
            whiteSpace: "pre-wrap",
            userSelect: "text",
          }}
        >
          {String(rawVal)}
        </p>
      );
    }

    return (
      <span style={{ fontSize: 12.5, color: "var(--nv-text-primary)", userSelect: "text" }}>
        {String(rawVal)}
      </span>
    );
  };

  const accent = node ? getStatusAccentColor(node.status) : "var(--nv-text-secondary)";
  const mergedConfig = {
    ...(definition?.defaultConfig ?? {}),
    ...(node?.config ?? {}),
  };

  return (
    <aside
      className="nv-glass-elevated nv-scroll"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        bottom: 80,
        width: 360,
        borderRadius: "var(--nv-radius-md)",
        padding: 18,
        zIndex: 22,
        pointerEvents: isOpen ? "auto" : "none",
        transform: isOpen ? "translateX(0)" : "translateX(392px)",
        opacity: isOpen ? 1 : 0,
        transition:
          "transform 260ms var(--nv-ease-out), opacity 180ms var(--nv-ease-out)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {node && (
        <>
          {/* Header */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span className="nv-eyebrow">
                {definition?.typeLabel ?? node.type.toUpperCase()}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className="nv-mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 10.5,
                    padding: "2px 9px",
                    borderRadius: "var(--nv-radius-pill)",
                    border: `1px solid ${accent}`,
                    background: "rgba(3, 5, 8, 0.55)",
                    color: "var(--nv-text-primary)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: accent,
                    }}
                  />
                  {getStatusLabel(node.status)}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  title="Close Inspector (Esc)"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "1px solid var(--nv-border-hairline)",
                    background: "var(--nv-surface-subtle)",
                    color: "var(--nv-text-secondary)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.3,
                color: "var(--nv-text-primary)",
              }}
            >
              {node.label}
            </h2>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span
                className="nv-mono"
                style={{ fontSize: 11, color: "var(--nv-text-muted)", userSelect: "text" }}
              >
                {node.id}
              </span>
              {parentNode && (
                <>
                  <span style={{ color: "var(--nv-text-muted)" }}>·</span>
                  <button
                    type="button"
                    onClick={() => onSelectNode(parentNode.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      color: "var(--nv-text-code)",
                      fontSize: 11.5,
                      cursor: "pointer",
                      textDecoration: "underline",
                      textDecorationColor: "var(--nv-border-strong)",
                      textUnderlineOffset: 3,
                    }}
                  >
                    ↑ {parentNode.label}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Live Vitals Strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
              padding: 10,
              borderRadius: "var(--nv-radius-sm)",
              background: "var(--nv-surface-subtle)",
              border: "1px solid var(--nv-border-hairline)",
            }}
          >
            <div>
              <div className="nv-eyebrow" style={{ fontSize: 9 }}>
                Status
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  fontWeight: 500,
                  color: accent,
                }}
              >
                {getStatusLabel(node.status)}
              </div>
            </div>
            <div>
              <div className="nv-eyebrow" style={{ fontSize: 9 }}>
                Elapsed
              </div>
              <div
                className="nv-mono"
                style={{ marginTop: 2, fontSize: 12, color: "var(--nv-text-primary)" }}
              >
                {formatElapsed(mergedConfig.startedAt, mergedConfig.endedAt, nowMs)}
              </div>
            </div>
            <div>
              <div className="nv-eyebrow" style={{ fontSize: 9 }}>
                Updated
              </div>
              <div
                className="nv-mono"
                style={{ marginTop: 2, fontSize: 11, color: "var(--nv-text-secondary)" }}
              >
                {formatTimestamp(node.updatedAt).slice(11)}
              </div>
            </div>
          </div>

          {node.expiresAt && (
            <div
              className="nv-mono"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                borderRadius: "var(--nv-radius-sm)",
                background: "rgba(255, 202, 117, 0.08)",
                border: "1px solid rgba(255, 202, 117, 0.25)",
                fontSize: 11,
                color: "#ffe3ab",
              }}
            >
              <span>✦ Farewell afterglow</span>
              <span>
                {Math.max(
                  0,
                  Math.ceil((Date.parse(node.expiresAt) - nowMs) / 1000)
                )}
                s
              </span>
            </div>
          )}

          {/* Declarative Telemetry Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(definition?.fields ?? []).map((field) => {
              const rendered = renderFieldValue(field, mergedConfig[field.key]);
              if (rendered === null) return null;
              return (
                <div
                  key={field.key}
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <span className="nv-eyebrow" style={{ fontSize: 9.5 }}>
                    {field.label}
                  </span>
                  {rendered}
                </div>
              );
            })}
          </div>

          {/* Connected Synapses */}
          <div
            style={{
              borderTop: "1px solid var(--nv-border-hairline)",
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span className="nv-eyebrow">Connected Synapses</span>
              <span
                className="nv-mono"
                style={{ fontSize: 10.5, color: "var(--nv-text-muted)" }}
              >
                {connectedSynapses.length}
              </span>
            </div>

            {connectedSynapses.length === 0 ? (
              <span style={{ fontSize: 12, color: "var(--nv-text-muted)" }}>
                Isolated neuron (no active synaptic edges).
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {connectedSynapses.map(({ edge, direction, peer }) => {
                  const peerAccent = getStatusAccentColor(peer.status);
                  return (
                    <button
                      key={`${edge.id}-${direction}`}
                      type="button"
                      onClick={() => onSelectNode(peer.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "7px 9px",
                        borderRadius: "var(--nv-radius-sm)",
                        border: "1px solid var(--nv-border-hairline)",
                        background: "var(--nv-surface-subtle)",
                        color: "var(--nv-text-primary)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          className="nv-mono"
                          style={{ fontSize: 11, color: "var(--nv-text-muted)" }}
                        >
                          {direction === "outgoing" ? "→" : "←"}
                        </span>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: peerAccent,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: 12,
                          }}
                        >
                          {peer.label}
                        </span>
                      </span>
                      <span
                        className="nv-mono"
                        style={{
                          fontSize: 10,
                          color: "var(--nv-text-secondary)",
                          flexShrink: 0,
                        }}
                      >
                        {edge.type}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
};
