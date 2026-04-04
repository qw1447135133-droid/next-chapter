import { clearStudioSession } from "@/lib/home-agent/session-store";
import { advanceStructuredAnswer, buildResetRuntimeState } from "./home-agent-conversation-state";
import { serializeQuestionAnswers } from "./home-agent-session-utils";
import type {
  ComposerQuestion,
  ConversationProjectSnapshot,
  HomeAgentMessage,
  StudioQuestionState,
  StudioRuntimeState,
} from "@/lib/home-agent/types";

type PushMessage = (role: HomeAgentMessage["role"], content: string) => void;

export function resetHomeAgentConversation(params: {
  qState: StudioQuestionState | null;
  rejectQuestion: (requestId: string) => void;
  interruptEngine: () => void;
  clearSurfacedTasks: () => void;
  setQState: (value: StudioQuestionState | null) => void;
  setPopoverOverride: (value: ComposerQuestion | null) => void;
  setSuggested: (value: ComposerQuestion | null) => void;
  setSelectedValues: (value: string[]) => void;
  setMode: (value: "idle") => void;
  setMessages: (value: HomeAgentMessage[]) => void;
  resetComposerDraft: (value?: string) => void;
  setCompactedMessageCount: (value: number) => void;
  setActiveProjectId: (value: string | undefined) => void;
  resetRuntime: () => void;
  setMetaReady: (value: boolean) => void;
}) {
  const {
    qState,
    rejectQuestion,
    interruptEngine,
    clearSurfacedTasks,
    setQState,
    setPopoverOverride,
    setSuggested,
    setSelectedValues,
    setMode,
    setMessages,
    resetComposerDraft,
    setCompactedMessageCount,
    setActiveProjectId,
    resetRuntime,
    setMetaReady,
  } = params;

  if (qState) {
    rejectQuestion(qState.request.id);
  }

  interruptEngine();
  clearSurfacedTasks();
  setQState(null);
  setPopoverOverride(null);
  setSuggested(null);
  setSelectedValues([]);
  setMode("idle");
  setMessages([]);
  resetComposerDraft("");
  setCompactedMessageCount(0);
  setActiveProjectId(undefined);
  resetRuntime();
  setMetaReady(false);
  clearStudioSession();
}

export function answerHomeAgentQuestion(params: {
  qState: StudioQuestionState | null;
  value: string;
  label?: string;
  qStepKey: (index: number, question: { header?: string }) => string;
  setSuggested: (value: ComposerQuestion | null) => void;
  send: (value: string, shown?: string) => Promise<void>;
  push: PushMessage;
  resolveQuestion: (requestId: string, output: string) => void;
  setQState: (value: StudioQuestionState | null) => void;
  setSelectedValues: (value: string[]) => void;
  resetComposerDraft: (value?: string) => void;
}) {
  const {
    qState,
    value,
    label,
    qStepKey,
    setSuggested,
    send,
    push,
    resolveQuestion,
    setQState,
    setSelectedValues,
    resetComposerDraft,
  } = params;

  if (!qState) {
    setSuggested(null);
    void send(value, label);
    return;
  }

  const activeQuestion = qState.request.questions[qState.currentIndex];
  if (!activeQuestion) {
    setQState(null);
    setSelectedValues([]);
    resetComposerDraft("");
    return;
  }

  const transition = advanceStructuredAnswer({
    qState,
    value,
    label,
    qStepKey,
  });
  if (!transition) return;

  push("user", transition.userBubble);

  if (transition.isLastStep) {
    resolveQuestion(qState.request.id, serializeQuestionAnswers(qState.request, transition.nextAnswers));
    setQState(null);
  } else {
    setQState(transition.nextQState);
  }

  setSelectedValues([]);
  resetComposerDraft("");
}

export function buildConfirmedStructuredAnswer(params: {
  qState: StudioQuestionState | null;
  question: ComposerQuestion | null;
  selectedValues: string[];
  draft: string;
}): { submittedValue: string; displayValue: string } | null {
  const { qState, question, selectedValues, draft } = params;
  if (!qState || !question) return null;

  const selectedLabels = question.options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);
  const custom = draft.trim();
  const hasSelection = selectedValues.length > 0;
  const submittedValue = [
    hasSelection ? selectedValues.join(" / ") : "",
    custom ? (hasSelection ? `补充：${custom}` : custom) : "",
  ]
    .filter(Boolean)
    .join("\n");
  const displayValue = [
    hasSelection ? selectedLabels.join(" / ") : "",
    custom ? (hasSelection ? `补充：${custom}` : custom) : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!submittedValue.trim()) return null;
  return { submittedValue, displayValue };
}

export function launchTemplateConversation(params: {
  prompt: string;
  title: string;
  dreaminaAvailable: boolean;
  flashMaintenanceHint: (message: string, duration?: number) => void;
  markDreaminaSurfaced: () => void;
  send: (prompt: string, shown?: string) => Promise<void>;
}) {
  const { prompt, title, dreaminaAvailable, flashMaintenanceHint, markDreaminaSurfaced, send } = params;

  if (dreaminaAvailable && title.includes("视频")) {
    flashMaintenanceHint("已接入 Dreamina CLI，可直接使用 Seedance 2.0", 2400);
    markDreaminaSurfaced();
  }
  void send(prompt, title);
}

export function resetRuntimeState(setRuntime: React.Dispatch<React.SetStateAction<StudioRuntimeState>>) {
  setRuntime((prev) => buildResetRuntimeState(prev));
}

export function handleHomeAgentChoiceSelection(params: {
  snapshot: ConversationProjectSnapshot | null;
  value: string;
  label: string;
  question: ComposerQuestion | null;
  qState: StudioQuestionState | null;
  answer: (value: string, label?: string) => void;
  setSelectedValues: React.Dispatch<React.SetStateAction<string[]>>;
  videoProjectChoiceHandler: (snapshot: ConversationProjectSnapshot, value: string, label: string) => boolean;
  videoReviewChoiceHandler: (snapshot: ConversationProjectSnapshot, value: string, label: string) => boolean;
  videoAssetChoiceHandler: (snapshot: ConversationProjectSnapshot, value: string, label: string) => boolean;
  scriptProjectChoiceHandler: (snapshot: ConversationProjectSnapshot, value: string, label: string) => boolean;
}) {
  const {
    snapshot,
    value,
    label,
    question,
    qState,
    answer,
    setSelectedValues,
    videoProjectChoiceHandler,
    videoReviewChoiceHandler,
    videoAssetChoiceHandler,
    scriptProjectChoiceHandler,
  } = params;

  if (snapshot?.projectKind === "video" && videoProjectChoiceHandler(snapshot, value, label)) {
    return;
  }

  if (snapshot?.projectKind === "video" && question?.id.startsWith("review-")) {
    if (videoReviewChoiceHandler(snapshot, value, label)) {
      return;
    }
  }

  if (snapshot?.projectKind === "video" && videoAssetChoiceHandler(snapshot, value, label)) {
    return;
  }

  if (
    (snapshot?.projectKind === "script" || snapshot?.projectKind === "adaptation") &&
    question?.id.startsWith("script-") &&
    scriptProjectChoiceHandler(snapshot, value, label)
  ) {
    return;
  }

  if (!qState || (!question?.multiSelect && question?.submissionMode !== "confirm")) {
    answer(value, label);
    return;
  }

  setSelectedValues((prev) => {
    if (question.multiSelect) {
      return prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value];
    }
    return [value];
  });
}

export function submitHomeAgentComposer(params: {
  qState: StudioQuestionState | null;
  question: ComposerQuestion | null;
  draft: string;
  confirmStructuredAnswer: () => void;
  answer: (value: string, label?: string) => void;
  send: (value: string, shown?: string) => Promise<void>;
}) {
  const { qState, question, draft, confirmStructuredAnswer, answer, send } = params;

  if (qState && (question?.submissionMode === "confirm" || question?.multiSelect)) {
    confirmStructuredAnswer();
    return;
  }

  if (qState) {
    answer(draft);
    return;
  }

  void send(draft);
}
