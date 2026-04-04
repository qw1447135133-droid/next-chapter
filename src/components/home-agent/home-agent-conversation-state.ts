import type {
  ComposerQuestion,
  ConversationProjectSnapshot,
  HomeAgentMessage,
  StudioQuestionState,
  StudioRuntimeState,
  StudioSessionState,
} from "@/lib/home-agent/types";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";

export function buildResetRuntimeState(previous: StudioRuntimeState): StudioRuntimeState {
  return {
    ...previous,
    sessionId: crypto.randomUUID(),
    currentProjectSnapshot: null,
    currentDramaProject: null,
    currentVideoProject: null,
    currentSetupDraft: null,
    skillDrafts: [],
    maintenanceReports: [],
    recentMessageSummary: "",
  };
}

export function buildOpenProjectSessionState(params: {
  savedSession: StudioSessionState | null;
  snapshot: ConversationProjectSnapshot;
  videoProject: PersistedVideoProject | null;
  buildBrief: (snapshot: ConversationProjectSnapshot) => string;
  createAssistantMessage: (content: string) => HomeAgentMessage;
  getSuggestedQuestion: (
    snapshot: ConversationProjectSnapshot,
    videoProject: PersistedVideoProject | null,
  ) => ComposerQuestion | null;
}) {
  const { savedSession, snapshot, videoProject, buildBrief, createAssistantMessage, getSuggestedQuestion } = params;

  if (savedSession) {
    return {
      qState: savedSession.qState ?? null,
      popoverOverride: null,
      suggested: null,
      selectedValues: savedSession.selectedValues ?? [],
      mode:
        savedSession.mode === "recovering" || savedSession.mode === "maintenance-review"
          ? savedSession.mode
          : ("active" as const),
      messages: savedSession.messages.length ? savedSession.messages : [createAssistantMessage(buildBrief(snapshot))],
      draft: savedSession.draft ?? "",
      compactedMessageCount: savedSession.compactedMessageCount ?? 0,
      previousQuestionStep: savedSession.qState
        ? `${savedSession.qState.request.id}:${savedSession.qState.currentIndex}`
        : null,
      sessionId: savedSession.sessionId ?? crypto.randomUUID(),
    };
  }

  return {
    qState: null,
    popoverOverride: null,
    suggested: getSuggestedQuestion(snapshot, videoProject),
    selectedValues: [],
    mode: "active" as const,
    messages: [createAssistantMessage(buildBrief(snapshot))],
    draft: "",
    compactedMessageCount: 0,
    previousQuestionStep: null,
    sessionId: crypto.randomUUID(),
  };
}

export function advanceStructuredAnswer(params: {
  qState: StudioQuestionState;
  value: string;
  label?: string;
  qStepKey: (index: number, question: { header?: string }) => string;
}) {
  const { qState, value, label, qStepKey } = params;
  const activeQuestion = qState.request.questions[qState.currentIndex];
  if (!activeQuestion) return null;

  const submittedValue = value.trim();
  const displayValue = (label || value).trim();
  if (!submittedValue) return null;

  const stepKey = qStepKey(qState.currentIndex, activeQuestion);
  const nextAnswers = {
    ...qState.answers,
    [stepKey]: submittedValue,
  };
  const nextDisplayAnswers = {
    ...qState.displayAnswers,
    [stepKey]: displayValue || submittedValue,
  };
  const userBubble = activeQuestion.header
    ? `${activeQuestion.header}：${nextDisplayAnswers[stepKey]}`
    : nextDisplayAnswers[stepKey];
  const isLastStep = qState.currentIndex >= qState.request.questions.length - 1;

  return {
    activeQuestion,
    submittedValue,
    displayValue,
    nextAnswers,
    nextDisplayAnswers,
    userBubble,
    isLastStep,
    nextQState: isLastStep
      ? null
      : {
          request: qState.request,
          currentIndex: qState.currentIndex + 1,
          answers: nextAnswers,
          displayAnswers: nextDisplayAnswers,
        },
  };
}
