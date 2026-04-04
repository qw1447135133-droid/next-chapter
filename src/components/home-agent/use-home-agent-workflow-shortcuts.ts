import { startTransition, useCallback } from "react";
import type { ComposerQuestion, ConversationProjectSnapshot, HomeAgentMessage, StudioRuntimeState } from "@/lib/home-agent/types";
import { runWorkflowShortcut, runWorkflowShortcutChain } from "@/lib/home-agent/workflow-shortcut-runner";
import { createWorkflowShortcutUiBridge } from "./home-agent-workflow-ui";
import { recQuestion } from "./home-agent-project-questions";

type PushMessage = (role: HomeAgentMessage["role"], content: string) => void;

export function useHomeAgentWorkflowShortcuts(params: {
  runtimeRef: React.MutableRefObject<StudioRuntimeState>;
  loadWorkflowActionsModule: () => Promise<{
    runWorkflowAction: (
      action: string,
      input: Record<string, unknown>,
      runtime: StudioRuntimeState,
    ) => Promise<{ summary: string; projectSnapshot?: ConversationProjectSnapshot | null; data?: unknown }>;
  }>;
  push: PushMessage;
  setPopoverOverride: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
  setSuggested: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
  setMode: React.Dispatch<React.SetStateAction<"idle" | "active" | "recovering" | "maintenance-review">>;
  resetComposerDraft: (value?: string) => void;
  setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setRuntime: React.Dispatch<React.SetStateAction<StudioRuntimeState>>;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
}) {
  const {
    runtimeRef,
    loadWorkflowActionsModule,
    push,
    setPopoverOverride,
    setSuggested,
    setMode,
    resetComposerDraft,
    setStreaming,
    setRuntime,
    setActiveProjectId,
  } = params;

  const clearChoiceUi = useCallback(() => {
    setPopoverOverride(null);
    setSuggested(null);
  }, [setPopoverOverride, setSuggested]);

  const activateConversation = useCallback(() => {
    setMode("active");
  }, [setMode]);

  const commitWorkflowRuntime = useCallback(
    (nextRuntime: StudioRuntimeState, nextProjectId?: string) => {
      startTransition(() => {
        setRuntime(nextRuntime);
        if (nextProjectId) {
          setActiveProjectId(nextProjectId);
        }
      });
    },
    [setActiveProjectId, setRuntime],
  );

  const getSuggestedQuestion = useCallback(
    (snapshot: ConversationProjectSnapshot | null, runtime: StudioRuntimeState) =>
      snapshot ? recQuestion(snapshot, runtime.currentVideoProject) : null,
    [],
  );

  const runWorkflowActionShortcut = useCallback(
    async (action: string, input: Record<string, unknown>, userBubble: string) => {
      const workflow = await loadWorkflowActionsModule();
      const ui = createWorkflowShortcutUiBridge({
        activateConversation,
        clearChoiceUi,
        commitRuntime: commitWorkflowRuntime,
        getSuggestedQuestion,
        push,
        resetComposerDraft,
        setStreaming,
        setSuggested,
      });

      await runWorkflowShortcut({
        action,
        input,
        runtime: runtimeRef.current,
        runAction: (nextAction, nextInput, nextRuntime) =>
          workflow.runWorkflowAction(nextAction, nextInput, nextRuntime),
        ui,
        userBubble,
      });
    },
    [
      activateConversation,
      clearChoiceUi,
      commitWorkflowRuntime,
      getSuggestedQuestion,
      loadWorkflowActionsModule,
      push,
      resetComposerDraft,
      runtimeRef,
      setStreaming,
      setSuggested,
    ],
  );

  const runWorkflowActionShortcutChain = useCallback(
    async (steps: Array<{ action: string; input: Record<string, unknown> }>, userBubble: string) => {
      const workflow = await loadWorkflowActionsModule();
      const ui = createWorkflowShortcutUiBridge({
        activateConversation,
        clearChoiceUi,
        commitRuntime: commitWorkflowRuntime,
        getSuggestedQuestion,
        push,
        resetComposerDraft,
        setStreaming,
        setSuggested,
      });

      await runWorkflowShortcutChain({
        runtime: runtimeRef.current,
        runAction: (nextAction, nextInput, nextRuntime) =>
          workflow.runWorkflowAction(nextAction, nextInput, nextRuntime),
        steps,
        ui,
        userBubble,
      });
    },
    [
      activateConversation,
      clearChoiceUi,
      commitWorkflowRuntime,
      getSuggestedQuestion,
      loadWorkflowActionsModule,
      push,
      resetComposerDraft,
      runtimeRef,
      setStreaming,
      setSuggested,
    ],
  );

  return {
    runWorkflowActionShortcut,
    runWorkflowActionShortcutChain,
  };
}
