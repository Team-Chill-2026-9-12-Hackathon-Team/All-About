import type {
  CleanupState,
  ExecutionKind,
  RunMode,
  ViewerState,
} from "./types.js";

export function executionKindForMode(mode: RunMode): ExecutionKind {
  switch (mode) {
    case "LIVE_WEB":
      return "steel_live_web";
    case "LIVE_FIXTURE":
      return "steel_live_fixture";
    case "LOCAL_FIXTURE":
      return "local_fixture";
    case "REPLAY":
      return "replay";
  }
}

export function viewerStateFor(
  viewerUrl: string | null,
  cleanup: CleanupState | null,
): ViewerState {
  if (viewerUrl !== null) return "ready";
  if (cleanup === "released") return "closed";
  if (cleanup === "release_failed") return "cleanup_failed";
  return "unavailable";
}
