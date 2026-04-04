import type {
  ComposerQuestion,
  ConversationProjectSnapshot,
  StudioRuntimeState,
  WorkflowActionResult,
  WorkflowRuntimeDelta,
} from "./types";

function upsertRecentProject(
  recentProjects: ConversationProjectSnapshot[],
  snapshot: ConversationProjectSnapshot,
): ConversationProjectSnapshot[] {
  return [snapshot, ...recentProjects.filter((item) => item.projectId !== snapshot.projectId)].slice(0, 8);
}

export function mergeRuntimeWithWorkflowDelta(
  previous: StudioRuntimeState,
  delta?: WorkflowRuntimeDelta,
): StudioRuntimeState {
  if (!delta) return previous;

  const nextProjectSnapshot = delta.projectSnapshot ?? previous.currentProjectSnapshot;
  return {
    ...previous,
    currentDramaProject: delta.dramaProject === undefined ? previous.currentDramaProject : delta.dramaProject,
    currentVideoProject: delta.videoProject === undefined ? previous.currentVideoProject : delta.videoProject,
    currentProjectSnapshot: nextProjectSnapshot,
    skillDrafts: delta.skillDrafts ?? previous.skillDrafts,
    maintenanceReports: delta.maintenanceReports ?? previous.maintenanceReports,
    recentProjects: nextProjectSnapshot
      ? upsertRecentProject(previous.recentProjects, nextProjectSnapshot)
      : previous.recentProjects,
    recentMessageSummary:
      delta.recentMessageSummary === undefined ? previous.recentMessageSummary : delta.recentMessageSummary,
  };
}

type WorkflowActionRunner = (
  action: string,
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
) => Promise<WorkflowActionResult>;

type WorkflowShortcutUiBridge = {
  activateConversation: () => void;
  clearChoiceUi: () => void;
  commitRuntime: (runtime: StudioRuntimeState, projectId?: string) => void;
  getSuggestedQuestion: (
    snapshot: ConversationProjectSnapshot | null,
    runtime: StudioRuntimeState,
  ) => ComposerQuestion | null;
  pushAssistant: (content: string) => void;
  pushUser: (content: string) => void;
  resetComposerDraft: () => void;
  setStreaming: (streaming: boolean) => void;
  setSuggested: (question: ComposerQuestion | null) => void;
};

type WorkflowShortcutStep = {
  action: string;
  input: Record<string, unknown>;
};

export async function runWorkflowShortcut(params: {
  action: string;
  input: Record<string, unknown>;
  runtime: StudioRuntimeState;
  runAction: WorkflowActionRunner;
  ui: WorkflowShortcutUiBridge;
  userBubble: string;
}): Promise<void> {
  const { action, input, runtime, runAction, ui, userBubble } = params;

  ui.pushUser(userBubble);
  ui.clearChoiceUi();
  ui.activateConversation();
  ui.resetComposerDraft();
  ui.setStreaming(true);

  try {
    const result = await runAction(action, input, runtime);
    const nextProjectSnapshot = result.projectSnapshot ?? result.data?.projectSnapshot ?? null;
    const nextRuntime = result.data ? mergeRuntimeWithWorkflowDelta(runtime, result.data) : runtime;
    const nextSuggestion = nextProjectSnapshot ? ui.getSuggestedQuestion(nextProjectSnapshot, nextRuntime) : null;

    if (result.data) {
      ui.commitRuntime(nextRuntime, nextProjectSnapshot?.projectId);
    }

    ui.setSuggested(nextSuggestion);

    if (result.summary.trim()) {
      ui.pushAssistant(result.summary.trim());
    }
  } catch (error) {
    ui.pushAssistant(error instanceof Error ? error.message : String(error));
  } finally {
    ui.setStreaming(false);
  }
}

export async function runWorkflowShortcutChain(params: {
  runtime: StudioRuntimeState;
  runAction: WorkflowActionRunner;
  steps: WorkflowShortcutStep[];
  ui: WorkflowShortcutUiBridge;
  userBubble: string;
}): Promise<void> {
  const { runtime, runAction, steps, ui, userBubble } = params;

  ui.pushUser(userBubble);
  ui.clearChoiceUi();
  ui.activateConversation();
  ui.resetComposerDraft();
  ui.setStreaming(true);

  try {
    let nextRuntime = runtime;
    let nextProjectId = runtime.currentProjectSnapshot?.projectId;
    let nextSuggestion: ComposerQuestion | null = null;
    const summaries: string[] = [];

    for (const step of steps) {
      const result = await runAction(step.action, step.input, nextRuntime);
      const stepSnapshot = result.projectSnapshot ?? result.data?.projectSnapshot ?? null;

      if (result.data) {
        nextRuntime = mergeRuntimeWithWorkflowDelta(nextRuntime, result.data);
        nextProjectId = stepSnapshot?.projectId ?? nextProjectId;
      }

      nextSuggestion = stepSnapshot ? ui.getSuggestedQuestion(stepSnapshot, nextRuntime) : nextSuggestion;

      if (result.summary.trim()) {
        summaries.push(result.summary.trim());
      }
    }

    ui.commitRuntime(nextRuntime, nextProjectId);
    ui.setSuggested(nextSuggestion);

    if (summaries.length) {
      ui.pushAssistant(summaries.join("\n\n"));
    }
  } catch (error) {
    ui.pushAssistant(error instanceof Error ? error.message : String(error));
  } finally {
    ui.setStreaming(false);
  }
}
