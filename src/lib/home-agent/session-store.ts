import type { StudioSessionState } from "./types";

const STUDIO_SESSION_KEY = "storyforge-home-agent-session-v1";
const STUDIO_PROJECT_SESSIONS_KEY = "storyforge-home-agent-project-sessions-v1";

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeQuestionState(
  qState: StudioSessionState["qState"],
  forceRestored = false,
): StudioSessionState["qState"] {
  if (!qState || typeof qState !== "object" || !qState.request) return null;

  return {
    source: forceRestored ? "restored" : qState.source === "live" ? "live" : "restored",
    request: qState.request,
    currentIndex:
      typeof qState.currentIndex === "number" && Number.isFinite(qState.currentIndex)
        ? Math.max(0, qState.currentIndex)
        : 0,
    answers:
      qState.answers && typeof qState.answers === "object"
        ? Object.fromEntries(
            Object.entries(qState.answers).filter(
              (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
            ),
          )
        : {},
    displayAnswers:
      qState.displayAnswers && typeof qState.displayAnswers === "object"
        ? Object.fromEntries(
            Object.entries(qState.displayAnswers).filter(
              (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
            ),
          )
        : {},
  };
}

function normalizeStudioSession(session: StudioSessionState | null): StudioSessionState | null {
  if (!session || typeof session !== "object") return null;

  return {
    sessionId: typeof session.sessionId === "string" ? session.sessionId : undefined,
    compactedMessageCount:
      typeof session.compactedMessageCount === "number" && Number.isFinite(session.compactedMessageCount)
        ? Math.max(0, session.compactedMessageCount)
        : 0,
    mode:
      session.mode === "idle" ||
      session.mode === "active" ||
      session.mode === "recovering" ||
      session.mode === "maintenance-review"
        ? session.mode
        : "idle",
    messages: Array.isArray(session.messages) ? session.messages : [],
    currentProjectSnapshot: session.currentProjectSnapshot ?? null,
    recentMessageSummary:
      typeof session.recentMessageSummary === "string" ? session.recentMessageSummary : "",
    projectId: typeof session.projectId === "string" ? session.projectId : undefined,
    draft: typeof session.draft === "string" ? session.draft : "",
    qState: normalizeQuestionState(session.qState, true),
    selectedValues: Array.isArray(session.selectedValues)
      ? session.selectedValues.filter((value): value is string => typeof value === "string")
      : [],
    surfacedTaskIds: Array.isArray(session.surfacedTaskIds)
      ? session.surfacedTaskIds.filter((value): value is string => typeof value === "string")
      : [],
    surfacedTaskFollowupKeys: Array.isArray(session.surfacedTaskFollowupKeys)
      ? session.surfacedTaskFollowupKeys.filter((value): value is string => typeof value === "string")
      : [],
    surfacedProjectSuggestionKeys: Array.isArray(session.surfacedProjectSuggestionKeys)
      ? session.surfacedProjectSuggestionKeys.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function readProjectSessionMap(): Record<string, StudioSessionState> {
  const raw = safeReadJson<Record<string, StudioSessionState | null>>(
    STUDIO_PROJECT_SESSIONS_KEY,
    {},
  );

  return Object.entries(raw).reduce<Record<string, StudioSessionState>>((accumulator, entry) => {
    const [projectId, session] = entry;
    const normalized = normalizeStudioSession(session);
    if (normalized) accumulator[projectId] = normalized;
    return accumulator;
  }, {});
}

export function readStudioSession(): StudioSessionState | null {
  return normalizeStudioSession(safeReadJson<StudioSessionState | null>(STUDIO_SESSION_KEY, null));
}

export function writeStudioSession(session: StudioSessionState): void {
  const normalized = normalizeStudioSession(session);
  if (!normalized) return;

  safeWriteJson(STUDIO_SESSION_KEY, normalized);

  if (!normalized.projectId) return;

  const sessions = readProjectSessionMap();
  sessions[normalized.projectId] = normalized;
  safeWriteJson(STUDIO_PROJECT_SESSIONS_KEY, sessions);
}

export function clearStudioSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STUDIO_SESSION_KEY);
}

export function readProjectStudioSession(projectId: string): StudioSessionState | null {
  const sessions = readProjectSessionMap();
  return sessions[projectId] ?? null;
}

export { readProjectStudioSession as readStudioProjectSession };
