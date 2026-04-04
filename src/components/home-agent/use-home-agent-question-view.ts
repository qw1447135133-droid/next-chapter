import { useMemo } from "react";
import type { ComposerQuestion, ConversationProjectSnapshot, StudioQuestionState, StudioRuntimeState } from "@/lib/home-agent/types";
import { qToComposer } from "./home-agent-session-utils";

export function useHomeAgentQuestionView(params: {
  runtime: StudioRuntimeState;
  qState: StudioQuestionState | null;
  popoverOverride: ComposerQuestion | null;
  suggested: ComposerQuestion | null;
  selectedValues: string[];
}) {
  const { runtime, qState, popoverOverride, suggested, selectedValues } = params;

  const currentProject = runtime.currentProjectSnapshot;

  const baseQuestion = useMemo(
    () => qToComposer(qState) || popoverOverride || suggested,
    [popoverOverride, qState, suggested],
  );

  const question = useMemo<ComposerQuestion | null>(
    () =>
      baseQuestion
        ? {
            ...baseQuestion,
            options: baseQuestion.options.map((option) => ({
              ...option,
              selected: selectedValues.includes(option.value),
            })),
          }
        : null,
    [baseQuestion, selectedValues],
  );

  return {
    currentProject: currentProject as ConversationProjectSnapshot | null,
    question,
  };
}
