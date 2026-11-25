import React, { useEffect, useState } from "react";
import type { TopologyMode } from "../scene/layoutEngine";
import type { LabelMode } from "./ScreenSpaceOverlay";

export interface SimulationControlBarProps {
  topologyMode: TopologyMode;
  paused: boolean;
  speedMultiplier: number;
  showOrbits: boolean;
  showGrid: boolean;
  labelMode: LabelMode;
  isTethered: boolean;
  streamRunning: boolean;
  onChangeTopologyMode: (mode: TopologyMode) => void;
  onTogglePaused: () => void;
  onChangeSpeed: (speed: number) => void;
  onToggleOrbits: () => void;
  onToggleGrid: () => void;
  onCycleLabelMode: () => void;
  onResetCamera: () => void;
  onToggleStream: () => void;
  onSeedMassive: () => void;
  onClearNodes: () => void;
}

const SPEED_OPTIONS = [0.5, 1, 2];

export const SimulationControlBar: React.FC<SimulationControlBarProps> = ({
  topologyMode,
  paused,
  speedMultiplier,
  showOrbits,
  showGrid,
  labelMode,
  isTethered,
  streamRunning,
  onChangeTopologyMode,
  onTogglePaused,
  onChangeSpeed,
  onToggleOrbits,
  onToggleGrid,
  onCycleLabelMode,
  onResetCamera,
  onToggleStream,
  onSeedMassive,
  onClearNodes,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!confirmClear) return;
    const t = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmClear]);

  const handleClearClick = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    onClearNodes();
  };

  const labelText =
    labelMode === "smart" ? "Smart" : labelMode === "all" ? "All" : "Off";
  const isNeural = topologyMode === "neural";

  return (
    <div
      className="nv-glass"
      style={{
        position: "absolute",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "5px 8px",
        borderRadius: "var(--nv-radius-pill)",
        display: "flex",
        alignItems: "center",
        gap: 5,
        zIndex: 20,
        pointerEvents: "auto",
        maxWidth: "calc(100vw - 32px)",
        overflowX: "auto",
        whiteSpace: "nowrap",
      }}
    >
      {/* Topology Mode Switch: Neural Connectome (default) vs Orbital */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          borderRadius: "var(--nv-radius-pill)",
          border: "1px solid var(--nv-border-hairline)",
          overflow: "hidden",
        }}
        title="Switch 3D spatial topology"
      >
        {(["neural", "orbital"] as const).map((mode) => {
          const active = topologyMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeTopologyMode(mode)}
              style={{
                height: 26,
                padding: "0 9px",
                border: "none",
                background: active
                  ? "rgba(92, 184, 255, 0.18)"
                  : "transparent",
                color: active
                  ? "var(--nv-text-primary)"
                  : "var(--nv-text-secondary)",
                fontFamily: "var(--nv-font-sans)",
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {mode === "neural" ? "Neural" : "Orbital"}
            </button>
          );
        })}
      </div>

      <span
        style={{
          width: 1,
          height: 16,
          background: "var(--nv-border-hairline)",
          margin: "0 2px",
        }}
      />

      <button
        type="button"
        className={`nv-btn ${!paused ? "nv-btn-active" : ""}`}
        onClick={onTogglePaused}
        style={{ borderRadius: "var(--nv-radius-pill)" }}
      >
        {paused ? "▶ Flow" : "⏸ Pause"}
      </button>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          borderRadius: "var(--nv-radius-pill)",
          border: "1px solid var(--nv-border-hairline)",
          overflow: "hidden",
        }}
      >
        {SPEED_OPTIONS.map((spd) => {
          const active = speedMultiplier === spd;
          return (
            <button
              key={spd}
              type="button"
              onClick={() => onChangeSpeed(spd)}
              className="nv-mono"
              style={{
                height: 26,
                padding: "0 8px",
                border: "none",
                background: active
                  ? "rgba(255, 244, 224, 0.14)"
                  : "transparent",
                color: active
                  ? "var(--nv-text-primary)"
                  : "var(--nv-text-secondary)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {spd}×
            </button>
          );
        })}
      </div>

      <span
        style={{
          width: 1,
          height: 16,
          background: "var(--nv-border-hairline)",
          margin: "0 2px",
        }}
      />

      <button
        type="button"
        className={`nv-btn ${showOrbits ? "nv-btn-active" : ""}`}
        onClick={onToggleOrbits}
        style={{ borderRadius: "var(--nv-radius-pill)" }}
        title={
          isNeural
            ? "Toggle dendritic spines & collateral neural plexus"
            : "Toggle orbital rings"
        }
      >
        {isNeural ? "Plexus" : "Orbits"}
      </button>

      <button
        type="button"
        className={`nv-btn ${showGrid ? "nv-btn-active" : ""}`}
        onClick={onToggleGrid}
        style={{ borderRadius: "var(--nv-radius-pill)" }}
        title={
          isNeural
            ? "Toggle deep-space background connectome scaffold"
            : "Toggle polar reference grid"
        }
      >
        {isNeural ? "Cortex" : "Grid"}
      </button>

      <button
        type="button"
        className="nv-btn"
        onClick={onCycleLabelMode}
        style={{ borderRadius: "var(--nv-radius-pill)" }}
      >
        Labels: {labelText}
      </button>

      <button
        type="button"
        className={`nv-btn ${isTethered ? "nv-btn-active" : ""}`}
        onClick={onResetCamera}
        style={{ borderRadius: "var(--nv-radius-pill)" }}
        title="Untether camera and frame full connectome (Esc)"
      >
        {isTethered ? "Untether" : "Overview"}
      </button>

      <span
        style={{
          width: 1,
          height: 16,
          background: "var(--nv-border-hairline)",
          margin: "0 2px",
        }}
      />

      <button
        type="button"
        className="nv-btn nv-btn-primary"
        onClick={onToggleStream}
        title="Start or stop continuous real-time status & subagent evolution"
        style={{
          borderRadius: "var(--nv-radius-pill)",
          ...(streamRunning
            ? {
                background: "rgba(75, 227, 200, 0.16)",
                borderColor: "rgba(75, 227, 200, 0.55)",
                color: "#b8fff0",
              }
            : {}),
        }}
      >
        {streamRunning ? "⏹ Stop Live Stream" : "✦ Live Stream"}
      </button>

      <button
        type="button"
        className="nv-btn"
        onClick={onSeedMassive}
        title="Populate ~168 accumulated multi-harness conversations & subagents"
        style={{
          borderRadius: "var(--nv-radius-pill)",
          borderColor: "rgba(92, 184, 255, 0.38)",
          color: "#cfe8ff",
        }}
      >
        ✦ Massive (168)
      </button>

      <button
        type="button"
        className="nv-btn"
        onClick={handleClearClick}
        style={{
          borderRadius: "var(--nv-radius-pill)",
          color: confirmClear ? "#ff948a" : "var(--nv-text-secondary)",
          borderColor: confirmClear
            ? "rgba(255, 77, 61, 0.55)"
            : "var(--nv-border-hairline)",
        }}
      >
        {confirmClear ? "Confirm Clear?" : "Clear"}
      </button>
    </div>
  );
};
