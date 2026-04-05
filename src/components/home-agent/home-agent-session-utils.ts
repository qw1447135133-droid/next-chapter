import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import { readStudioSession } from "@/lib/home-agent/session-store";
import type {
  ComposerQuestion,
  ConversationProjectSnapshot,
  StudioQuestionState,
  StudioRuntimeState,
  StudioSessionState,
} from "@/lib/home-agent/types";

export function createInitialStudioSeed(): {
  session: StudioSessionState | null;
  runtime: StudioRuntimeState;
} {
  const session = readStudioSession();

  return {
    session,
    runtime: {
      sessionId: session?.sessionId ?? crypto.randomUUID(),
      currentProjectSnapshot: session?.currentProjectSnapshot ?? null,
      currentDramaProject: null,
      currentVideoProject: null,
      currentSetupDraft: null,
      skillDrafts: [],
      maintenanceReports: [],
      recentProjects: [],
      recentProjectSessions: [],
      recentMessageSummary: session?.recentMessageSummary ?? "",
    },
  };
}

export function summarizeRecoveryArtifacts(snapshot: ConversationProjectSnapshot): string {
  const labels = snapshot.artifacts
    .slice(0, 3)
    .map((artifact) => artifact.label)
    .filter(Boolean);

  return labels.length
    ? `我已对照当前项目产物做了恢复分析，最近可直接承接的内容是：${labels.join("、")}。`
    : "我已对照当前项目状态做了恢复分析，当前更适合先补齐一份可复用的核心产物。";
}

export function buildRecoveryActionRationale(
  snapshot: ConversationProjectSnapshot,
  action: string,
  index: number,
): string {
  void action;

  const artifact = snapshot.artifacts[index] ?? snapshot.artifacts[0];
  if (artifact) {
    return `优先围绕「${artifact.label}」继续推进，保持在${snapshot.derivedStage}阶段内完成。`;
  }

  if (snapshot.currentObjective.trim()) {
    return `会先围绕当前目标“${snapshot.currentObjective}”推进，不需要跳出首页。`;
  }

  return `继续留在${snapshot.derivedStage}阶段里推进这一步，不需要跳出首页。`;
}

export function hasSavedSessionContent(session: StudioSessionState | null | undefined): boolean {
  return Boolean(
    session?.messages?.length ||
      session?.qState ||
      session?.draft?.trim() ||
      session?.selectedValues?.length,
  );
}

export function areProjectSnapshotsEquivalent(
  nextProjects: ConversationProjectSnapshot[],
  prevProjects: ConversationProjectSnapshot[],
): boolean {
  if (nextProjects === prevProjects) return true;
  if (nextProjects.length !== prevProjects.length) return false;

  return nextProjects.every((project, index) => {
    const prev = prevProjects[index];
    return (
      project.projectId === prev.projectId &&
      project.updatedAt === prev.updatedAt &&
      project.derivedStage === prev.derivedStage &&
      project.currentObjective === prev.currentObjective &&
      project.agentSummary === prev.agentSummary
    );
  });
}

export function areRecentSessionsEquivalent(
  nextSessions: StudioSessionState[] | undefined,
  prevSessions: StudioSessionState[] | undefined,
): boolean {
  if (nextSessions === prevSessions) return true;
  if (!nextSessions?.length && !prevSessions?.length) return true;
  if (!nextSessions || !prevSessions) return false;
  if (nextSessions.length !== prevSessions.length) return false;

  return nextSessions.every((session, index) => {
    const prev = prevSessions[index];
    return (
      session.sessionId === prev.sessionId &&
      session.projectId === prev.projectId &&
      session.selectedTextModelKey === prev.selectedTextModelKey &&
      session.mode === prev.mode &&
      session.compactedMessageCount === prev.compactedMessageCount &&
      session.messages.length === prev.messages.length &&
      session.draft === prev.draft &&
      session.qState?.source === prev.qState?.source &&
      session.qState?.request.id === prev.qState?.request.id &&
      session.qState?.currentIndex === prev.qState?.currentIndex
    );
  });
}

export function mergeRecentProjects(
  currentProjects: ConversationProjectSnapshot[],
  nextProject: ConversationProjectSnapshot,
  limit = 8,
): ConversationProjectSnapshot[] {
  const merged = [nextProject, ...currentProjects.filter((item) => item.projectId !== nextProject.projectId)].slice(0, limit);
  return areProjectSnapshotsEquivalent(merged, currentProjects) ? currentProjects : merged;
}

export function buildProjectSuggestionKey(
  snapshot: ConversationProjectSnapshot | null | undefined,
  question: ComposerQuestion | null | undefined,
): string | null {
  if (!snapshot || !question) return null;
  return [
    snapshot.projectId,
    snapshot.updatedAt || snapshot.derivedStage || snapshot.currentObjective,
    question.id,
  ]
    .filter(Boolean)
    .join(":");
}

export const qStepKey = (
  index: number,
  question: Pick<AskUserQuestionRequest["questions"][number], "header">,
) => `${index}:${question.header}`;

export function qToComposer(state: StudioQuestionState | null): ComposerQuestion | null {
  const activeQuestion = state ? state.request.questions[state.currentIndex] : null;
  if (!state || !activeQuestion) return null;

  return {
    id: `${state.request.id}:${state.currentIndex}`,
    title: activeQuestion.question,
    description: state.request.description,
    options: activeQuestion.options.map((option, index) => ({
      id: `${activeQuestion.header}-${index}`,
      label: option.label,
      value: option.value || option.label,
      rationale: option.rationale || option.description,
    })),
    allowCustomInput: state.request.allowCustomInput !== false,
    submissionMode: state.request.submissionMode === "confirm" ? "confirm" : "immediate",
    multiSelect: activeQuestion.multiSelect,
    stepIndex: state.currentIndex,
    totalSteps: state.request.questions.length,
    answerKey: activeQuestion.header,
  };
}

export function serializeQuestionAnswers(
  request: AskUserQuestionRequest,
  answers: Record<string, string>,
): string {
  const rows = request.questions
    .map((item, index) => {
      const answer = answers[qStepKey(index, item)]?.trim();
      return answer ? `${item.header}: ${answer}` : "";
    })
    .filter(Boolean);

  if (rows.length <= 1) {
    return rows[0]?.replace(/^[^:]+:\s*/, "") ?? "";
  }

  return rows.join("\n");
}
