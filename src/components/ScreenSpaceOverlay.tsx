import React, { useCallback, useEffect, useRef } from "react";
import type { ProjectedNodeAnchor } from "../scene/NeuralCosmosEngine";
import type { FlowNodeInstance } from "../types/flow";
import { getStatusAccentColor } from "../utils/formatters";

export type LabelMode = "smart" | "all" | "off";

export interface ScreenSpaceOverlayProps {
  nodes: FlowNodeInstance[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  labelMode: LabelMode;
  onSelectNode: (nodeId: string) => void;
  registerProjector: (fn: (anchors: ProjectedNodeAnchor[]) => void) => void;
}

export const ScreenSpaceOverlay: React.FC<ScreenSpaceOverlayProps> = ({
  nodes,
  selectedNodeId,
  hoveredNodeId,
  labelMode,
  onSelectNode,
  registerProjector,
}) => {
  const anchorRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const reticleRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setAnchorRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) anchorRefs.current.set(id, el);
      else anchorRefs.current.delete(id);
    },
    []
  );

  const setReticleRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) reticleRefs.current.set(id, el);
      else reticleRefs.current.delete(id);
    },
    []
  );

  useEffect(() => {
    registerProjector((anchors) => {
      for (const a of anchors) {
        const el = anchorRefs.current.get(a.id);
        if (!el) continue;

        if (a.visibleBehindCamera) {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
          continue;
        }

        el.style.opacity = "1";
        el.style.pointerEvents = "auto";
        el.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(
          1
        )}px, 0)`;

        const reticle = reticleRefs.current.get(a.id);
        if (reticle) {
          const diameter = Math.max(28, Math.min(120, a.screenRadius * 2.5));
          reticle.style.width = `${diameter.toFixed(1)}px`;
          reticle.style.height = `${diameter.toFixed(1)}px`;
        }
      }
    });
  }, [registerProjector]);

  const shouldShowLabel = (node: FlowNodeInstance): boolean => {
    if (labelMode === "off") return false;
    if (labelMode === "all") return true;
    if (node.id === selectedNodeId || node.id === hoveredNodeId) return true;
    if (node.type === "harness") return true;
    return (
      node.status === "running" ||
      node.status === "tool_calling" ||
      node.status === "waiting" ||
      node.status === "error"
    );
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      {nodes.map((node) => {
        const isSelected = node.id === selectedNodeId;
        const isHovered = node.id === hoveredNodeId;
        const showReticle = isSelected || isHovered;
        const showLabel = shouldShowLabel(node);
        const accent = getStatusAccentColor(node.status);
        const activeTool =
          typeof node.config?.activeTool === "string" && node.config.activeTool
            ? node.config.activeTool
            : null;

        return (
          <div
            key={node.id}
            ref={setAnchorRef(node.id)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 0,
              height: 0,
              opacity: 0,
              willChange: "transform",
            }}
          >
            {showReticle && (
              <div
                ref={setReticleRef(node.id)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 44,
                  height: 44,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                }}
              >
                {/* Thin circular outer ring */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    border: `1px solid ${
                      isSelected
                        ? "rgba(255, 194, 102, 0.78)"
                        : "rgba(242, 239, 233, 0.42)"
                    }`,
                  }}
                />
                {/* Softly rotating dashed inner ring when selected */}
                {isSelected && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 5,
                      borderRadius: "50%",
                      border: "1px dashed rgba(255, 224, 166, 0.45)",
                      animation: "nv-reticle-spin 18s linear infinite",
                    }}
                  />
                )}
                {/* 4 corner architectural ticks */}
                {[
                  { top: -3, left: -3, borderTop: true, borderLeft: true },
                  { top: -3, right: -3, borderTop: true, borderRight: true },
                  { bottom: -3, left: -3, borderBottom: true, borderLeft: true },
                  { bottom: -3, right: -3, borderBottom: true, borderRight: true },
                ].map((c, idx) => (
                  <span
                    key={idx}
                    style={{
                      position: "absolute",
                      width: 6,
                      height: 6,
                      top: c.top,
                      bottom: c.bottom,
                      left: c.left,
                      right: c.right,
                      borderTop: c.borderTop
                        ? `1px solid ${isSelected ? "#ffc257" : "#f2efe9"}`
                        : "none",
                      borderBottom: c.borderBottom
                        ? `1px solid ${isSelected ? "#ffc257" : "#f2efe9"}`
                        : "none",
                      borderLeft: c.borderLeft
                        ? `1px solid ${isSelected ? "#ffc257" : "#f2efe9"}`
                        : "none",
                      borderRight: c.borderRight
                        ? `1px solid ${isSelected ? "#ffc257" : "#f2efe9"}`
                        : "none",
                    }}
                  />
                ))}
              </div>
            )}

            {showLabel && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id);
                }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: "translate(16px, -50%)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  borderRadius: "var(--nv-radius-sm)",
                  background: isSelected
                    ? "rgba(14, 19, 28, 0.9)"
                    : "rgba(9, 12, 18, 0.72)",
                  border: `1px solid ${
                    isSelected
                      ? "var(--nv-border-focus)"
                      : "var(--nv-border-hairline)"
                  }`,
                  color: "var(--nv-text-primary)",
                  fontFamily: "var(--nv-font-sans)",
                  fontSize: node.type === "harness" ? 11.5 : 11,
                  fontWeight: node.type === "harness" ? 600 : 500,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  pointerEvents: "auto",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: accent,
                    flexShrink: 0,
                  }}
                />
                <span>{node.label}</span>
                {activeTool && (
                  <span
                    className="nv-mono"
                    style={{
                      fontSize: 9.5,
                      color: "#ffd98a",
                      opacity: 0.9,
                    }}
                  >
                    {activeTool}
                  </span>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
