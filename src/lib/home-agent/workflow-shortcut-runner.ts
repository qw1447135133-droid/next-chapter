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
  setPopoverQuestion: (question: ComposerQuestion | null) => void;
  setStreaming: (streaming: boolean) => void;
  setSuggested: (question: ComposerQuestion | null) => void;
};

type WorkflowShortcutStep = {
  action: string;
  input: Record<string, unknown>;
};

function shouldAutoOpenFollowupPopover(action: string, nextSuggestion: ComposerQuestion | null): boolean {
  if (!nextSuggestion) return false;
  return action === "advance_video_workflow_round";
}

function normalizeWorkflowShortcutError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/文本模型 API Key|可用的文本模型/i.test(message)) {
    return `${message}\n\n下一步建议：打开设置补齐内置 API 配置后，再回到首页继续当前会话。`;
  }

  if (/Dreamina CLI 尚未登录/i.test(message)) {
    return `${message}\n\n下一步建议：去设置完成 Dreamina 登录，或把侧栏视频通道切回 API 后继续出片。`;
  }

  if (/Dreamina CLI 未安装|Dreamina CLI 未检测到|当前环境不支持/i.test(message)) {
    return `${message}\n\n下一步建议：去设置检查本机 CLI 状态，或把侧栏视频通道切回 API。`;
  }

  if (/缺少 .*API Key|缺少 Seedance \/ Gemini 可用 Key|缺少可用 API Key/i.test(message)) {
    return `${message}\n\n下一步建议：去设置补齐 Key，或切换到另一条已可用的视频通道后继续。`;
  }

  if (/恢复失败|打开目录/i.test(message)) {
    return `${message}\n\n下一步建议：先留在首页继续查看摘要或重试，不需要离开当前会话。`;
  }

  return message;
}

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

    if (shouldAutoOpenFollowupPopover(action, nextSuggestion)) {
      ui.setPopoverQuestion(nextSuggestion);
      ui.setSuggested(null);
    } else {
      ui.setSuggested(nextSuggestion);
    }

    if (result.summary.trim()) {
      ui.pushAssistant(result.summary.trim());
    }
  } catch (error) {
    const nextSuggestion = runtime.currentProjectSnapshot
      ? ui.getSuggestedQuestion(runtime.currentProjectSnapshot, runtime)
      : null;
    if (nextSuggestion) {
      ui.setSuggested(nextSuggestion);
    }
    ui.pushAssistant(normalizeWorkflowShortcutError(error));
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
    const nextSuggestion = runtime.currentProjectSnapshot
      ? ui.getSuggestedQuestion(runtime.currentProjectSnapshot, runtime)
      : null;
    if (nextSuggestion) {
      ui.setSuggested(nextSuggestion);
    }
    ui.pushAssistant(normalizeWorkflowShortcutError(error));
  } finally {
    ui.setStreaming(false);
  }
}
