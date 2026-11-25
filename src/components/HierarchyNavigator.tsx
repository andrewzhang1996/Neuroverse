import React, { useMemo, useState } from "react";
import type { AggregatedFlowSnapshot, FlowNodeInstance } from "../types/flow";
import { getStatusAccentColor } from "../utils/formatters";

export interface HierarchyNavigatorProps {
  snapshot: AggregatedFlowSnapshot | null;
  open: boolean;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

interface TreeBranch {
  node: FlowNodeInstance;
  children: TreeBranch[];
  hasActiveDescendant: boolean;
}

function statusPriority(status: string): number {
  if (status === "tool_calling") return 0;
  if (status === "running") return 1;
  if (status === "error") return 2;
  if (status === "waiting") return 3;
  return 4;
}

function isNodeActive(status: string): boolean {
  return (
    status === "running" ||
    status === "tool_calling" ||
    status === "waiting" ||
    status === "error"
  );
}

export const HierarchyNavigator: React.FC<HierarchyNavigatorProps> = ({
  snapshot,
  open,
  selectedNodeId,
  hoveredNodeId,
  onSelectNode,
}) => {
  const [activeOnly, setActiveOnly] = useState(false);
  const totalNodes = snapshot?.nodes.length ?? 0;

  const { roots, orphans } = useMemo(() => {
    const nodes = snapshot?.nodes ?? [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const childrenByParent = new Map<string, FlowNodeInstance[]>();

    for (const node of nodes) {
      if (node.parentId && byId.has(node.parentId)) {
        const list = childrenByParent.get(node.parentId) ?? [];
        list.push(node);
        childrenByParent.set(node.parentId, list);
      }
    }

    const buildBranch = (node: FlowNodeInstance, depth = 0): TreeBranch => {
      if (depth > 6) {
        return {
          node,
          children: [],
          hasActiveDescendant: isNodeActive(node.status),
        };
      }
      const kids = [...(childrenByParent.get(node.id) ?? [])].sort(
        (a, b) => statusPriority(a.status) - statusPriority(b.status)
      );
      const childBranches = kids.map((k) => buildBranch(k, depth + 1));
      const hasActiveDescendant =
        isNodeActive(node.status) ||
        childBranches.some((c) => c.hasActiveDescendant);
      return {
        node,
        children: childBranches,
        hasActiveDescendant,
      };
    };

    const rootHarnesses = nodes
      .filter((n) => n.type === "harness" || (!n.parentId && n.type !== "subagent"))
      .map((n) => buildBranch(n));

    const coveredIds = new Set<string>();
    const markCovered = (branch: TreeBranch) => {
      coveredIds.add(branch.node.id);
      branch.children.forEach(markCovered);
    };
    rootHarnesses.forEach(markCovered);

    const orphanBranches = nodes
      .filter((n) => !coveredIds.has(n.id))
      .map((n) => buildBranch(n));

    return { roots: rootHarnesses, orphans: orphanBranches };
  }, [snapshot]);

  const renderBranch = (branch: TreeBranch, depth: number) => {
    const { node, children, hasActiveDescendant } = branch;
    const isSelected = selectedNodeId === node.id;

    if (
      activeOnly &&
      depth > 0 &&
      !hasActiveDescendant &&
      !isSelected
    ) {
      return null;
    }

    const isHovered = hoveredNodeId === node.id;
    const accent = getStatusAccentColor(node.status);
    const activeTool =
      typeof node.config?.activeTool === "string" && node.config.activeTool
        ? node.config.activeTool
        : null;

    return (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => onSelectNode(node.id)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: `5px 10px 5px ${10 + depth * 13}px`,
            border: "none",
            borderRadius: "var(--nv-radius-sm)",
            background: isSelected
              ? "rgba(255, 194, 102, 0.12)"
              : isHovered
                ? "var(--nv-surface-hover)"
                : "transparent",
            color: isSelected
              ? "var(--nv-text-primary)"
              : node.status === "completed" || node.status === "idle"
                ? "var(--nv-text-secondary)"
                : "var(--nv-text-primary)",
            textAlign: "left",
            cursor: "pointer",
            transition: "background-color 120ms var(--nv-ease-out)",
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
              style={{
                width: node.type === "harness" ? 8 : 6,
                height: node.type === "harness" ? 8 : 6,
                borderRadius: "50%",
                flexShrink: 0,
                backgroundColor: accent,
                boxShadow:
                  node.status === "running" ||
                  node.status === "tool_calling" ||
                  node.status === "error"
                    ? `0 0 8px ${accent}`
                    : "none",
              }}
            />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: node.type === "harness" ? 12.5 : 11.5,
                fontWeight: node.type === "harness" ? 600 : 500,
              }}
            >
              {node.label}
            </span>
          </span>

          {node.type === "harness" && children.length > 0 ? (
            <span
              className="nv-mono"
              style={{
                flexShrink: 0,
                fontSize: 9.5,
                color: "var(--nv-text-muted)",
              }}
            >
              {children.length}
            </span>
          ) : activeTool ? (
            <span
              className="nv-mono"
              style={{
                flexShrink: 0,
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: "var(--nv-radius-pill)",
                background: "rgba(255, 194, 87, 0.12)",
                border: "1px solid rgba(255, 194, 87, 0.35)",
                color: "#ffd98a",
                maxWidth: 86,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={activeTool}
            >
              ⚡ {activeTool}
            </span>
          ) : null}
        </button>

        {children.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {children.map((child) => renderBranch(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className="nv-glass nv-scroll"
      style={{
        position: "absolute",
        top: 68,
        left: 16,
        bottom: 80,
        width: 268,
        borderRadius: "var(--nv-radius-md)",
        padding: 10,
        zIndex: 18,
        pointerEvents: open ? "auto" : "none",
        transform: open ? "translateX(0)" : "translateX(-292px)",
        opacity: open ? 1 : 0,
        transition:
          "transform 240ms var(--nv-ease-out), opacity 180ms var(--nv-ease-out)",
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
          gap: 6,
          padding: "2px 6px 6px",
          borderBottom: "1px solid var(--nv-border-hairline)",
        }}
      >
        <span className="nv-eyebrow">Neural Connectome</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {totalNodes > 20 && (
            <button
              type="button"
              onClick={() => setActiveOnly((v) => !v)}
              className="nv-mono"
              style={{
                border: "1px solid var(--nv-border-hairline)",
                background: activeOnly
                  ? "rgba(92, 184, 255, 0.16)"
                  : "transparent",
                color: activeOnly
                  ? "var(--nv-text-primary)"
                  : "var(--nv-text-secondary)",
                borderRadius: "var(--nv-radius-pill)",
                fontSize: 9.5,
                padding: "1px 6px",
                cursor: "pointer",
              }}
            >
              {activeOnly ? "Active" : "All"}
            </button>
          )}
          <span
            className="nv-mono"
            style={{ fontSize: 10, color: "var(--nv-text-muted)" }}
          >
            {totalNodes}
          </span>
        </div>
      </div>

      {roots.length === 0 && orphans.length === 0 ? (
        <div
          style={{
            padding: "16px 8px",
            color: "var(--nv-text-muted)",
            fontSize: 12,
          }}
        >
          No active harnesses or neurons in state store.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {roots.map((branch) => renderBranch(branch, 0))}
          {orphans.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div
                className="nv-eyebrow"
                style={{ padding: "4px 8px", fontSize: 9.5 }}
              >
                Unattached
              </div>
              {orphans.map((branch) => renderBranch(branch, 0))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
