import { useCallback, useEffect, useRef, useState } from "react";
import type { AggregatedFlowSnapshot } from "../types/flow";

export type SseConnectionState = "connecting" | "live" | "reconnecting";

export interface UseFlowSnapshotResult {
  snapshot: AggregatedFlowSnapshot | null;
  connectionState: SseConnectionState;
  demoRunning: boolean;
  streamRunning: boolean;
  toggleLiveStream: () => Promise<void>;
  startLiveDemo: () => Promise<void>;
  seedShowcase: () => Promise<void>;
  seedMassive: () => Promise<void>;
  clearAllNodes: () => Promise<void>;
}

/**
 * Subscribe to the local Neuroverse HTTP snapshot + live SSE stream.
 */
export function useFlowSnapshot(): UseFlowSnapshotResult {
  const [snapshot, setSnapshot] = useState<AggregatedFlowSnapshot | null>(null);
  const [connectionState, setConnectionState] =
    useState<SseConnectionState>("connecting");
  const [demoRunning, setDemoRunning] = useState(false);
  const [streamRunning, setStreamRunning] = useState(false);
  const demoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/health", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((health: { demoMode?: string } | null) => {
        if (active && health?.demoMode === "stream") {
          setStreamRunning(true);
        }
      })
      .catch(() => {});

    fetch("/api/snapshot", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AggregatedFlowSnapshot | null) => {
        if (active && data) {
          setSnapshot(data);
        }
      })
      .catch(() => {
        // EventSource below will handle reconnects
      });

    const source = new EventSource("/api/events");

    source.onopen = () => {
      if (active) setConnectionState("live");
    };

    const handleSnapshot = (ev: MessageEvent<string>) => {
      if (!active) return;
      try {
        const parsed = JSON.parse(ev.data) as AggregatedFlowSnapshot;
        setSnapshot(parsed);
        setConnectionState("live");
      } catch {
        // ignore malformed SSE chunk
      }
    };

    source.addEventListener("snapshot", handleSnapshot as EventListener);

    source.onerror = () => {
      if (active) setConnectionState("reconnecting");
    };

    return () => {
      active = false;
      source.removeEventListener("snapshot", handleSnapshot as EventListener);
      source.close();
      if (demoTimerRef.current !== null) {
        window.clearTimeout(demoTimerRef.current);
      }
    };
  }, []);

  const toggleLiveStream = useCallback(async () => {
    if (streamRunning) {
      await fetch("/api/demo/stream/stop", { method: "POST" });
      setStreamRunning(false);
    } else {
      await fetch("/api/demo/stream/start", { method: "POST" });
      setStreamRunning(true);
    }
  }, [streamRunning]);

  const startLiveDemo = useCallback(async () => {
    setDemoRunning(true);
    if (demoTimerRef.current !== null) {
      window.clearTimeout(demoTimerRef.current);
    }
    try {
      await fetch("/api/demo/start", { method: "POST" });
    } finally {
      demoTimerRef.current = window.setTimeout(() => {
        setDemoRunning(false);
        demoTimerRef.current = null;
      }, 19000);
    }
  }, []);

  const seedShowcase = useCallback(async () => {
    await fetch("/api/demo/seed", { method: "POST" });
  }, []);

  const seedMassive = useCallback(async () => {
    await fetch("/api/demo/massive", { method: "POST" });
  }, []);

  const clearAllNodes = useCallback(async () => {
    if (demoTimerRef.current !== null) {
      window.clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    setDemoRunning(false);
    setStreamRunning(false);
    await fetch("/api/state/clean", { method: "POST" });
  }, []);

  return {
    snapshot,
    connectionState,
    demoRunning,
    streamRunning,
    toggleLiveStream,
    startLiveDemo,
    seedShowcase,
    seedMassive,
    clearAllNodes,
  };
}
