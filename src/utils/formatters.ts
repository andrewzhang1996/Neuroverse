import type { NodeStatus } from "../types/flow";

/**
 * Format elapsed duration between startedAt and endedAt (or nowMs) as "00m 14s" or "1h 04m 12s".
 */
export function formatElapsed(
  startedAt: unknown,
  endedAt: unknown,
  nowMs: number = Date.now()
): string {
  if (typeof startedAt !== "string" || !startedAt) return "—";
  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs)) return "—";

  let endMs = nowMs;
  if (typeof endedAt === "string" && endedAt) {
    const parsedEnd = Date.parse(endedAt);
    if (!Number.isNaN(parsedEnd)) endMs = parsedEnd;
  }

  const totalSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) {
    return `${hours}h ${pad(mins)}m ${pad(secs)}s`;
  }
  return `${pad(mins)}m ${pad(secs)}s`;
}

/**
 * Format an ISO-8601 timestamp into concise local wall-clock time.
 */
export function formatTimestamp(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return String(value);
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Shorten absolute home directory paths for compact HUD telemetry display.
 */
export function shortenPath(fullPath: string): string {
  if (!fullPath) return "";
  const homeMatch = fullPath.match(/^\/(?:home|Users)\/[^/]+(\/.*)?$/);
  if (homeMatch) {
    return `~${homeMatch[1] ?? ""}`;
  }
  return fullPath;
}

/**
 * Resolve semantic CSS color accent for a given node status.
 */
export function getStatusAccentColor(status: NodeStatus): string {
  switch (status) {
    case "running":
      return "var(--nv-status-running)";
    case "tool_calling":
      return "var(--nv-status-tool)";
    case "waiting":
      return "var(--nv-status-waiting)";
    case "completed":
      return "var(--nv-status-completed)";
    case "idle":
      return "var(--nv-status-idle)";
    case "error":
      return "var(--nv-status-error)";
    default:
      return "var(--nv-text-secondary)";
  }
}

/**
 * Resolve human-readable badge label for a node status.
 */
export function getStatusLabel(status: NodeStatus): string {
  switch (status) {
    case "tool_calling":
      return "Tool Calling";
    case "running":
      return "Running";
    case "waiting":
      return "Waiting";
    case "completed":
      return "Completed";
    case "idle":
      return "Idle";
    case "error":
      return "Error";
    default:
      return String(status);
  }
}
