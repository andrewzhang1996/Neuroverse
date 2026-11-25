import React, { useCallback, useEffect, useRef, useState } from "react";
import { HierarchyNavigator } from "./components/HierarchyNavigator";
import { NodeInspectorDrawer } from "./components/NodeInspectorDrawer";
import {
  ScreenSpaceOverlay,
  type LabelMode,
} from "./components/ScreenSpaceOverlay";
import { SimulationControlBar } from "./components/SimulationControlBar";
import { TopTelemetryBar } from "./components/TopTelemetryBar";
import { useFlowSnapshot } from "./hooks/useFlowSnapshot";
import type { TopologyMode } from "./scene/layoutEngine";
import {
  NeuralCosmosEngine,
  type ProjectedNodeAnchor,
} from "./scene/NeuralCosmosEngine";
import { shortenPath } from "./utils/formatters";

export const App: React.FC = () => {
  const {
    snapshot,
    connectionState,
    streamRunning,
    toggleLiveStream,
    seedShowcase,
    seedMassive,
    clearAllNodes,
  } = useFlowSnapshot();

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<NeuralCosmosEngine | null>(null);
  const projectorRef = useRef<(anchors: ProjectedNodeAnchor[]) => void>(
    () => {}
  );

  const [navOpen, setNavOpen] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const [topologyMode, setTopologyMode] = useState<TopologyMode>("neural");
  const [paused, setPaused] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [showOrbits, setShowOrbits] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [labelMode, setLabelMode] = useState<LabelMode>("smart");

  const registerProjector = useCallback(
    (fn: (anchors: ProjectedNodeAnchor[]) => void) => {
      projectorRef.current = fn;
    },
    []
  );

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    engineRef.current?.focusNode(nodeId);
  }, []);

  const handleResetCamera = useCallback(() => {
    setSelectedNodeId(null);
    engineRef.current?.resetOverview();
  }, []);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const engine = new NeuralCosmosEngine(container, {
      onSelectNode: (id) => setSelectedNodeId(id),
      onHoverNode: (id) => setHoveredNodeId(id),
      onFrameProject: (anchors) => projectorRef.current(anchors),
    });
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!snapshot || !engineRef.current) return;
    engineRef.current.syncSnapshot(snapshot);
    if (
      selectedNodeId &&
      !snapshot.nodes.some((n) => n.id === selectedNodeId)
    ) {
      setSelectedNodeId(null);
    }
  }, [snapshot, selectedNodeId]);

  useEffect(() => {
    engineRef.current?.setTopologyMode(topologyMode);
  }, [topologyMode]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    engineRef.current?.setSpeedMultiplier(speedMultiplier);
  }, [speedMultiplier]);

  useEffect(() => {
    engineRef.current?.setShowOrbits(showOrbits);
  }, [showOrbits]);

  useEffect(() => {
    engineRef.current?.setShowGrid(showGrid);
  }, [showGrid]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        handleResetCamera();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleResetCamera]);

  const cycleLabelMode = useCallback(() => {
    setLabelMode((prev) =>
      prev === "smart" ? "all" : prev === "all" ? "off" : "smart"
    );
  }, []);

  const isEmptyCosmos = snapshot !== null && snapshot.nodes.length === 0;

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "var(--nv-bg-void)",
      }}
    >
      <div
        ref={canvasContainerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />

      <ScreenSpaceOverlay
        nodes={snapshot?.nodes ?? []}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        labelMode={labelMode}
        onSelectNode={handleSelectNode}
        registerProjector={registerProjector}
      />

      <TopTelemetryBar
        snapshot={snapshot}
        connectionState={connectionState}
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((v) => !v)}
      />

      <HierarchyNavigator
        snapshot={snapshot}
        open={navOpen}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        onSelectNode={handleSelectNode}
      />

      <NodeInspectorDrawer
        snapshot={snapshot}
        selectedNodeId={selectedNodeId}
        onSelectNode={handleSelectNode}
        onClose={handleResetCamera}
      />

      {isEmptyCosmos && (
        <div
          className="nv-glass-elevated"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(440px, calc(100vw - 32px))",
            padding: 24,
            borderRadius: "var(--nv-radius-md)",
            zIndex: 15,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            textAlign: "center",
          }}
        >
          <span className="nv-eyebrow">Awaiting Synaptic Telemetry</span>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: "var(--nv-text-primary)",
            }}
          >
            Neural cortex is quiet
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--nv-text-secondary)",
            }}
          >
            Agents emit semantic node files into{" "}
            <code className="nv-mono" style={{ color: "var(--nv-text-code)" }}>
              {shortenPath(snapshot.stateDir)}/nodes
            </code>
            . Trigger a live bio-electric cascade or seed a multi-harness
            connectome to explore.
          </p>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="nv-btn nv-btn-primary"
              onClick={() => void toggleLiveStream()}
              style={{ height: 32, padding: "0 14px" }}
            >
              {streamRunning ? "⏹ Stop Live Stream" : "✦ Start Dynamic Live Stream"}
            </button>
            <button
              type="button"
              className="nv-btn"
              onClick={() => void seedMassive()}
              style={{
                height: 32,
                padding: "0 14px",
                borderColor: "rgba(92, 184, 255, 0.42)",
                color: "#cfe8ff",
              }}
            >
              ✦ Seed Massive (168)
            </button>
            <button
              type="button"
              className="nv-btn"
              onClick={() => void seedShowcase()}
              style={{ height: 32, padding: "0 12px" }}
            >
              Seed Compact (13)
            </button>
          </div>
        </div>
      )}

      <SimulationControlBar
        topologyMode={topologyMode}
        paused={paused}
        speedMultiplier={speedMultiplier}
        showOrbits={showOrbits}
        showGrid={showGrid}
        labelMode={labelMode}
        isTethered={selectedNodeId !== null}
        streamRunning={streamRunning}
        onChangeTopologyMode={setTopologyMode}
        onTogglePaused={() => setPaused((p) => !p)}
        onChangeSpeed={setSpeedMultiplier}
        onToggleOrbits={() => setShowOrbits((o) => !o)}
        onToggleGrid={() => setShowGrid((g) => !g)}
        onCycleLabelMode={cycleLabelMode}
        onResetCamera={handleResetCamera}
        onToggleStream={() => void toggleLiveStream()}
        onSeedMassive={() => void seedMassive()}
        onClearNodes={() => {
          setSelectedNodeId(null);
          void clearAllNodes();
        }}
      />
    </div>
  );
};
