import type { StudioSessionState } from "./types";

const STUDIO_SESSION_KEY = "storyforge-home-agent-session-v1";
const STUDIO_PROJECT_SESSIONS_KEY = "storyforge-home-agent-project-sessions-v1";
const STORAGE_LEVELS = ["standard", "compact", "minimal"] as const;
const PROJECT_SESSION_ENTRY_LIMITS = {
  standard: 6,
  compact: 3,
  minimal: 1,
} as const;

type StorageLevel = (typeof STORAGE_LEVELS)[number];

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return true;
  localStorage.setItem(key, JSON.stringify(value));
  return true;
}

function truncateText(value: string | undefined, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, Math.max(0, max - 1))}…` : normalized;
}

function trimStringArray(values: string[] | undefined, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .slice(0, maxItems)
    .map((value) => truncateText(value, maxChars))
    .filter(Boolean);
}

function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014;
  }
  return false;
}

function messageLimit(level: StorageLevel): { count: number; chars: number } {
  switch (level) {
    case "compact":
      return { count: 16, chars: 720 };
    case "minimal":
      return { count: 8, chars: 320 };
    default:
      return { count: 28, chars: 1600 };
  }
}

function artifactLimit(level: StorageLevel): { count: number; summaryChars: number; contentChars: number } {
  switch (level) {
    case "compact":
      return { count: 6, summaryChars: 180, contentChars: 0 };
    case "minimal":
      return { count: 4, summaryChars: 120, contentChars: 0 };
    default:
      return { count: 10, summaryChars: 260, contentChars: 480 };
  }
}

function compactQuestionStateForStorage(
  qState: StudioSessionState["qState"],
  level: StorageLevel,
): StudioSessionState["qState"] {
  const normalized = normalizeQuestionState(qState);
  if (!normalized) return null;

  const questionLimit = level === "minimal" ? 4 : 8;
  const optionLimit = level === "minimal" ? 4 : 6;
  const textLimit = level === "minimal" ? 120 : level === "compact" ? 180 : 260;
  const answerLimit = level === "minimal" ? 140 : 260;
  const questionStart = Math.max(0, normalized.currentIndex - questionLimit + 1);
  const questionSlice = normalized.request.questions.slice(questionStart, questionStart + questionLimit);
  const nextCurrentIndex = Math.max(0, normalized.currentIndex - questionStart);

  return {
    source: normalized.source,
    currentIndex: nextCurrentIndex,
    request: {
      id: normalized.request.id,
      description: truncateText(normalized.request.description, textLimit),
      allowCustomInput: normalized.request.allowCustomInput !== false,
      submissionMode: normalized.request.submissionMode === "confirm" ? "confirm" : "immediate",
      questions: questionSlice.map((question) => ({
        header: truncateText(question.header, 48) || "问题",
        question: truncateText(question.question, textLimit),
        multiSelect: !!question.multiSelect,
        options: question.options.slice(0, optionLimit).map((option) => ({
          label: truncateText(option.label, 64) || "选项",
          value: truncateText(option.value || option.label, 120) || truncateText(option.label, 64) || "选项",
          description: truncateText(option.description, textLimit),
          rationale: truncateText(option.rationale, textLimit),
        })),
      })),
    },
    answers: Object.fromEntries(
      Object.entries(normalized.answers).map(([key, value]) => [truncateText(key, 64), truncateText(value, answerLimit)]),
    ),
    displayAnswers: Object.fromEntries(
      Object.entries(normalized.displayAnswers).map(([key, value]) => [
        truncateText(key, 64),
        truncateText(value, answerLimit),
      ]),
    ),
  };
}

function compactProjectSnapshotForStorage(
  snapshot: StudioSessionState["currentProjectSnapshot"],
  level: StorageLevel,
): StudioSessionState["currentProjectSnapshot"] {
  if (!snapshot) return null;

  const limits = artifactLimit(level);

  return {
    projectId: snapshot.projectId,
    projectKind: snapshot.projectKind,
    title: truncateText(snapshot.title, level === "minimal" ? 40 : 80) || "未命名项目",
    currentObjective: truncateText(snapshot.currentObjective, level === "minimal" ? 120 : 220),
    derivedStage: truncateText(snapshot.derivedStage, 40) || "继续创作",
    agentSummary: truncateText(snapshot.agentSummary, level === "minimal" ? 180 : 320),
    recommendedActions: trimStringArray(snapshot.recommendedActions, level === "minimal" ? 3 : 6, 120),
    artifacts: snapshot.artifacts.slice(0, limits.count).map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      label: truncateText(artifact.label, 80) || "产物",
      summary: truncateText(artifact.summary, limits.summaryChars),
      content: limits.contentChars > 0 ? truncateText(artifact.content, limits.contentChars) : undefined,
      updatedAt: artifact.updatedAt,
    })),
    updatedAt: snapshot.updatedAt,
  };
}

function compactSessionForStorage(session: StudioSessionState, level: StorageLevel): StudioSessionState {
  const limits = messageLimit(level);

  return {
    sessionId: session.sessionId,
    compactedMessageCount:
      typeof session.compactedMessageCount === "number" && Number.isFinite(session.compactedMessageCount)
        ? Math.max(0, session.compactedMessageCount)
        : 0,
    mode: session.mode,
    messages: session.messages.slice(-limits.count).map((message) => ({
      ...message,
      content: truncateText(message.content, limits.chars),
    })),
    currentProjectSnapshot: compactProjectSnapshotForStorage(session.currentProjectSnapshot, level),
    recentMessageSummary: truncateText(
      session.recentMessageSummary,
      level === "minimal" ? 1000 : level === "compact" ? 1800 : 3200,
    ),
    projectId: session.projectId,
    ...(typeof session.selectedTextModelKey === "string" && session.selectedTextModelKey.trim()
      ? { selectedTextModelKey: truncateText(session.selectedTextModelKey, 80) }
      : {}),
    draft: truncateText(session.draft, level === "minimal" ? 400 : level === "compact" ? 1000 : 2400),
    qState: compactQuestionStateForStorage(session.qState, level),
    selectedValues: trimStringArray(session.selectedValues, level === "minimal" ? 6 : 12, 120),
    surfacedTaskIds: trimStringArray(session.surfacedTaskIds, 40, 120),
    surfacedTaskFollowupKeys: trimStringArray(session.surfacedTaskFollowupKeys, 40, 120),
    surfacedProjectSuggestionKeys: trimStringArray(session.surfacedProjectSuggestionKeys, 40, 160),
  };
}

function tryWriteJson(key: string, buildValue: (level: StorageLevel) => unknown): boolean {
  if (typeof window === "undefined") return false;

  for (const level of STORAGE_LEVELS) {
    try {
      if (safeWriteJson(key, buildValue(level))) {
        return true;
      }
    } catch (error) {
      if (!isQuotaExceededError(error) || level === STORAGE_LEVELS[STORAGE_LEVELS.length - 1]) {
        break;
      }
    }
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore cleanup failures.
  }
  return false;
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
    ...(typeof session.selectedTextModelKey === "string" && session.selectedTextModelKey.trim()
      ? { selectedTextModelKey: session.selectedTextModelKey.trim() }
      : {}),
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

function orderProjectSessions(
  sessions: Record<string, StudioSessionState>,
  activeProjectId: string,
): Array<[string, StudioSessionState]> {
  const entries = Object.entries(sessions).filter((entry) => entry[1]);
  const active = entries.find(([projectId]) => projectId === activeProjectId);
  const remaining = entries.filter(([projectId]) => projectId !== activeProjectId);
  return active ? [active, ...remaining] : entries;
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

  tryWriteJson(STUDIO_SESSION_KEY, (level) => compactSessionForStorage(normalized, level));

  if (!normalized.projectId) return;

  const sessions = readProjectSessionMap();
  sessions[normalized.projectId] = normalized;
  const orderedSessions = orderProjectSessions(sessions, normalized.projectId);

  tryWriteJson(STUDIO_PROJECT_SESSIONS_KEY, (level) =>
    Object.fromEntries(
      orderedSessions
        .slice(0, PROJECT_SESSION_ENTRY_LIMITS[level])
        .map(([projectId, projectSession]) => [projectId, compactSessionForStorage(projectSession, level)]),
    ),
  );
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
