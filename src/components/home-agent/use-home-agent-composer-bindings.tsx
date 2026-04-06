import { useCallback, useMemo } from "react";
import type { ComposerQuestion, ConversationProjectSnapshot, StudioQuestionState, StudioRuntimeState } from "@/lib/home-agent/types";
import type { HomeAgentTextModelGroup } from "@/lib/home-agent/text-models";
import { cn } from "@/lib/utils";
import {
  HomeComposer,
  type HomeComposerLaunchNotice,
  type HomeComposerProps,
  type HomeComposerVideoTransportHint,
} from "./home-agent-shell";
import { buildConfirmedStructuredAnswer, handleHomeAgentChoiceSelection, submitHomeAgentComposer } from "./home-agent-session-actions";

type ChoiceHandler = (snapshot: ConversationProjectSnapshot, value: string, label: string) => boolean;
type MaintenanceChoiceHandler = (value: string, label: string) => boolean;
type AutoResearchChoiceHandler = (value: string, label: string) => boolean | Promise<boolean>;

export function useHomeAgentComposerBindings(params: {
  idle: boolean;
  currentProject: ConversationProjectSnapshot | null;
  maintenanceHint?: string | null;
  videoTransportHint?: HomeComposerVideoTransportHint | null;
  launchNotice?: HomeComposerLaunchNotice | null;
  draftInitialValue: string;
  draftResetVersion: number;
  draftPresence: boolean;
  syncComposerDraft: (value: string) => void;
  placeholder: string;
  runtimeRef: React.MutableRefObject<StudioRuntimeState>;
  question: ComposerQuestion | null;
  qState: StudioQuestionState | null;
  selectedValues: string[];
  streaming: boolean;
  reduceMotion: boolean;
  composerShellClass: string;
  activeTheme: boolean;
  selectedTextModelKey: string;
  selectedTextModelLabel: string;
  textModelGroups: HomeAgentTextModelGroup[];
  onSelectTextModel: (key: string) => void;
  draftRef: React.MutableRefObject<string>;
  engineRef: React.MutableRefObject<{ interrupt: () => void } | null>;
  setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  answer: (value: string, label?: string) => void;
  send: (value: string, shown?: string) => Promise<void>;
  setSelectedValues: React.Dispatch<React.SetStateAction<string[]>>;
  maintenanceChoiceHandler: MaintenanceChoiceHandler;
  videoProjectChoiceHandler: ChoiceHandler;
  videoReviewChoiceHandler: ChoiceHandler;
  videoAssetChoiceHandler: ChoiceHandler;
  scriptProjectChoiceHandler: ChoiceHandler;
  autoResearchChoiceHandler: AutoResearchChoiceHandler;
  onLaunchAction?: (actionId: string) => void;
  activeTrackClassName: string;
  idleTrackClassName: string;
}) {
  const {
    idle,
    currentProject,
    maintenanceHint,
    videoTransportHint,
    launchNotice,
    draftInitialValue,
    draftResetVersion,
    draftPresence,
    syncComposerDraft,
    placeholder,
    runtimeRef,
    question,
    qState,
    selectedValues,
    streaming,
    reduceMotion,
    composerShellClass,
    activeTheme,
    selectedTextModelKey,
    selectedTextModelLabel,
    textModelGroups,
    onSelectTextModel,
    draftRef,
    engineRef,
    setStreaming,
    answer,
    send,
    setSelectedValues,
    maintenanceChoiceHandler,
    videoProjectChoiceHandler,
    videoReviewChoiceHandler,
    videoAssetChoiceHandler,
    scriptProjectChoiceHandler,
    autoResearchChoiceHandler,
    onLaunchAction,
    activeTrackClassName,
    idleTrackClassName,
  } = params;

  const handleChoiceSelect = useCallback(
    (value: string, label: string) => {
      handleHomeAgentChoiceSelection({
        snapshot: runtimeRef.current.currentProjectSnapshot,
        value,
        label,
        question,
        qState,
        answer,
        setSelectedValues,
        maintenanceChoiceHandler,
        videoProjectChoiceHandler,
        videoReviewChoiceHandler,
        videoAssetChoiceHandler,
        scriptProjectChoiceHandler,
        autoResearchChoiceHandler,
      });
    },
    [
      answer,
      qState,
      question,
      runtimeRef,
      maintenanceChoiceHandler,
      scriptProjectChoiceHandler,
      setSelectedValues,
      videoAssetChoiceHandler,
      videoProjectChoiceHandler,
      videoReviewChoiceHandler,
      autoResearchChoiceHandler,
    ],
  );

  const confirmStructuredAnswer = useCallback(() => {
    const nextAnswer = buildConfirmedStructuredAnswer({
      qState,
      question,
      selectedValues,
      draft: draftRef.current,
    });
    if (!nextAnswer) return;
    answer(nextAnswer.submittedValue, nextAnswer.displayValue || nextAnswer.submittedValue);
  }, [answer, draftRef, qState, question, selectedValues]);

  const submitComposer = useCallback(() => {
    submitHomeAgentComposer({
      qState,
      question,
      draft: draftRef.current,
      confirmStructuredAnswer,
      answer,
      send,
    });
  }, [answer, confirmStructuredAnswer, draftRef, qState, question, send]);

  const handleInterrupt = useCallback(() => {
    engineRef.current?.interrupt();
    setStreaming(false);
  }, [engineRef, setStreaming]);

  const composerProps = useMemo<HomeComposerProps>(
    () => ({
      idle,
      currentProjectTitle: currentProject?.title,
      currentProjectStage: currentProject?.derivedStage,
      maintenanceHint,
      videoTransportHint,
      launchNotice,
      initialDraft: draftInitialValue,
      draftResetVersion,
      draftPresence,
      onDraftChange: syncComposerDraft,
      placeholder,
      question,
      qState,
      selectedValues,
      streaming,
      reduceMotion,
      composerShellClass,
      activeTheme,
      selectedTextModelKey,
      selectedTextModelLabel,
      textModelGroups,
      onSelectTextModel,
      onSelectChoice: handleChoiceSelect,
      onConfirmQuestion: qState ? confirmStructuredAnswer : undefined,
      onLaunchAction,
      onSubmit: submitComposer,
      onInterrupt: handleInterrupt,
    }),
    [
      activeTheme,
      composerShellClass,
      confirmStructuredAnswer,
      currentProject,
      draftInitialValue,
      draftPresence,
      draftResetVersion,
      handleChoiceSelect,
      handleInterrupt,
      idle,
      maintenanceHint,
      launchNotice,
      placeholder,
      qState,
      question,
      reduceMotion,
      selectedTextModelKey,
      selectedTextModelLabel,
      selectedValues,
      streaming,
      submitComposer,
      syncComposerDraft,
      textModelGroups,
      videoTransportHint,
      onSelectTextModel,
      onLaunchAction,
    ],
  );

  const idleComposer = useMemo(
    () => (
      <div className={cn("mx-auto w-full", idleTrackClassName)}>
        <HomeComposer {...composerProps} />
      </div>
    ),
    [composerProps, idleTrackClassName],
  );

  const activeComposer = useMemo(
    () => (
      <div className={cn("mx-auto w-full", activeTrackClassName)}>
        <HomeComposer {...composerProps} />
      </div>
    ),
    [activeTrackClassName, composerProps],
  );

  return {
    composerProps,
    handleChoiceSelect,
    confirmStructuredAnswer,
    submitComposer,
    idleComposer,
    activeComposer,
  };
}
