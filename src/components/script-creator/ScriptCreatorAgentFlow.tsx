import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  MessageSquareText,
  PanelsTopLeft,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AUDIENCES,
  DRAMA_STEP_LABELS,
  ENDINGS,
  EPISODE_COUNTS,
  GENRES,
  TARGET_MARKETS,
  TONES,
  type DramaMode,
  type DramaProject,
  type DramaSetup,
  type DramaStep,
  type SetupMode,
} from "@/types/drama";
import type { AgentHandoff } from "@/lib/agent-intake";
import { cn } from "@/lib/utils";

type QuestionKey =
  | "mode"
  | "targetMarket"
  | "setupMode"
  | "genres"
  | "creativeInput"
  | "audience"
  | "tone"
  | "ending"
  | "episodes"
  | "referenceScript";

type DraftState = {
  targetMarket: string;
  setupMode?: SetupMode;
  genres: string[];
  creativeInput: string;
  audience: string;
  tone: string;
  ending: string;
  totalEpisodes?: number;
  referenceScript: string;
};

type OptionItem = {
  label: string;
  value: string;
  description?: string;
};

type Props = {
  agentHandoff?: AgentHandoff | null;
  showModeSelector: boolean;
  project: DramaProject;
  setupMode: SetupMode;
  steps: DramaStep[];
  currentStep: DramaStep;
  onSetupModeChange: (mode: SetupMode) => void;
  onModeSelect: (mode: DramaMode) => void;
  onSetupReady: (setup: DramaSetup) => void;
  onReferenceScriptSeed: (script: string) => void;
  goToStep: (step: DramaStep) => void;
  canAdvanceTo: (step: DramaStep) => boolean;
  renderWorkbench: () => ReactNode;
  immersive?: boolean;
  composerValue?: string;
  onComposerValueChange?: (value: string) => void;
  hideInternalComposer?: boolean;
  onExternalComposerStateChange?: (state: ExternalComposerState | null) => void;
  onExternalComposerActionsChange?: (actions: ExternalComposerActions | null) => void;
};

export type ExternalComposerState = {
  visible: boolean;
  title: string;
  placeholder: string;
  multiline: boolean;
  options: OptionItem[];
  canSubmit: boolean;
  selectedGenres: string[];
  showModeSelector: boolean;
  modeOptions: OptionItem[];
};

export type ExternalComposerActions = {
  submit: () => void;
  selectOption: (value: string) => void;
  openDialog: () => void;
};

const setupModeOptions: OptionItem[] = [
  { label: "选题创作", value: "topic", description: "先确定题材、人群和风格，再生成完整创作方案" },
  { label: "创意创作", value: "creative", description: "直接从你的灵感或一句话设定开始展开" },
];

const modeOptions: OptionItem[] = [
  { label: "传统创作", value: "traditional", description: "从零开始做原创项目" },
  { label: "同款改编", value: "adaptation", description: "基于参考内容做结构和人物改写" },
];

function createDraft(project: DramaProject, agentHandoff?: AgentHandoff | null): DraftState {
  const hasSetup = !!project.setup;
  const seededPrompt = agentHandoff?.prompt?.trim() || "";
  const seededCreativeInput =
    hasSetup ? project.setup?.creativeInput || "" : project.mode === "traditional" ? seededPrompt : "";
  const seededReferenceScript =
    project.referenceScript || (!hasSetup && project.mode === "adaptation" ? seededPrompt : "");

  return {
    targetMarket: hasSetup ? project.setup?.targetMarket || "" : "",
    setupMode: hasSetup ? project.setup?.setupMode : undefined,
    genres: project.setup?.genres || [],
    creativeInput: seededCreativeInput,
    audience: hasSetup ? project.setup?.audience || "" : "",
    tone: hasSetup ? project.setup?.tone || "" : "",
    ending: hasSetup ? project.setup?.ending || "" : "",
    totalEpisodes: hasSetup ? project.setup?.totalEpisodes : undefined,
    referenceScript: seededReferenceScript,
  };
}

function answerLabel(question: QuestionKey, draft: DraftState): string {
  switch (question) {
    case "targetMarket":
      return TARGET_MARKETS.find((item) => item.value === draft.targetMarket)?.label || draft.targetMarket;
    case "setupMode":
      return draft.setupMode === "creative" ? "创意创作" : "选题创作";
    case "genres":
      return draft.genres.join(" / ");
    case "creativeInput":
      return draft.creativeInput;
    case "audience":
      return draft.audience;
    case "tone":
      return draft.tone;
    case "ending":
      return draft.ending;
    case "episodes":
      return `${draft.totalEpisodes} 集`;
    case "referenceScript":
      return draft.referenceScript;
    default:
      return "";
  }
}

function getQuestionTitle(question: QuestionKey, mode?: DramaMode): string {
  switch (question) {
    case "mode":
      return "这次想走哪种剧本生产路径？";
    case "targetMarket":
      return "目标市场先定一下，我会按对应平台和用户习惯来组织后续生成。";
    case "setupMode":
      return "你更希望我怎么带你开始？";
    case "genres":
      return "先选题材方向吧，最多可以先定两个主题。";
    case "creativeInput":
      return "把你的核心灵感告诉我，我会据此带你继续往下拆。";
    case "audience":
      return "这个项目主要打给谁看？";
    case "tone":
      return "整体情绪和风格更偏哪种？";
    case "ending":
      return "结局希望落在哪种观感？";
    case "episodes":
      return "总集数希望控制在多少？";
    case "referenceScript":
      return mode === "adaptation"
        ? "把参考稿贴给我，我会把它带进改编工作区继续处理。"
        : "";
    default:
      return "";
  }
}

function getPendingQuestion(showModeSelector: boolean, mode: DramaMode, draft: DraftState): QuestionKey | null {
  if (showModeSelector) return "mode";
  if (!draft.targetMarket.trim()) return "targetMarket";
  if (mode === "traditional" && !draft.setupMode) return "setupMode";
  if (mode === "traditional" && draft.setupMode === "topic" && draft.genres.length === 0) return "genres";
  if (mode === "traditional" && draft.setupMode === "creative" && !draft.creativeInput.trim()) return "creativeInput";
  if (!draft.audience.trim()) return "audience";
  if (!draft.tone.trim()) return "tone";
  if (!draft.ending.trim()) return "ending";
  if (!draft.totalEpisodes) return "episodes";
  if (mode === "adaptation" && !draft.referenceScript.trim()) return "referenceScript";
  return null;
}

function buildSetup(mode: DramaMode, draft: DraftState): DramaSetup {
  return {
    genres: mode === "traditional" && draft.setupMode === "topic" ? draft.genres : [],
    audience: draft.audience,
    tone: draft.tone,
    ending: draft.ending,
    totalEpisodes: draft.totalEpisodes || 60,
    targetMarket: draft.targetMarket,
    setupMode: mode === "traditional" ? draft.setupMode : undefined,
    creativeInput:
      mode === "traditional" && draft.setupMode === "creative" ? draft.creativeInput.trim() : undefined,
  };
}

function questionOptions(question: QuestionKey, draft: DraftState): OptionItem[] {
  switch (question) {
    case "mode":
      return modeOptions;
    case "targetMarket":
      return TARGET_MARKETS.map((item) => ({
        label: item.label,
        value: item.value,
        description: item.desc,
      }));
    case "setupMode":
      return setupModeOptions;
    case "audience":
      return AUDIENCES.map((item) => ({ label: item.label, value: item.value }));
    case "tone":
      return TONES.map((item) => ({ label: item.label, value: item.value }));
    case "ending":
      return ENDINGS.map((item) => ({ label: item.label, value: item.value }));
    case "episodes":
      return EPISODE_COUNTS.filter((item) => item.value > 0).map((item) => ({
        label: item.label,
        value: String(item.value),
      }));
    case "genres":
      return GENRES.filter((genre) => !genre.markets || genre.markets.includes(draft.targetMarket)).map((genre) => ({
        label: genre.label,
        value: genre.value,
        description: genre.desc,
      }));
    default:
      return [];
  }
}

function getStageSummary(project: DramaProject): { title: string; description: string } {
  if (project.mode === "adaptation") {
    if (!project.setup) {
      return { title: "先完成改编设定", description: "我会先问清市场、受众、风格和集数，再把参考稿送进改编分析。" };
    }
    if (!project.referenceStructure) {
      return { title: "正在等待参考结构分析", description: "右侧是参考稿工作台，完成后我会继续引导结构转换。" };
    }
    if (!project.structureTransform) {
      return { title: "下一步做结构转换", description: "建议先确认新框架和节奏，再进入角色转换。" };
    }
    if (!project.characterTransform) {
      return { title: "下一步做角色转换", description: "人物关系改完后，就可以开始分集目录和大纲生产。" };
    }
  } else {
    if (!project.setup) {
      return { title: "先完成项目设定", description: "我会像制作人一样把前置问题问完，再带你进入创作方案生成。" };
    }
    if (!project.creativePlan) {
      return { title: "下一步生成创作方案", description: "右侧已经切到创作方案面板，生成后我会继续推进角色和分集内容。" };
    }
    if (!project.characters) {
      return { title: "下一步生成角色设定", description: "方案已具备，可以继续打磨角色小传和关系线。" };
    }
  }

  if (!project.directoryRaw) {
    return { title: "准备进入分集规划", description: "建议继续生成分集目录或单集大纲，保持节奏连续。" };
  }
  if (project.episodes.length === 0) {
    return { title: "准备进入分集剧本", description: "目录和大纲已经到位，可以开始批量写单集剧本了。" };
  }
  if (!project.complianceReport) {
    return { title: "可以做合规审核了", description: "剧本内容已经有产出，建议审核一轮再导出。" };
  }

  return { title: "项目已进入导出阶段", description: "现在可以导出成品，或者回到任一步继续微调。" };
}

function getSuggestedActions(project: DramaProject): Array<{ label: string; step: DramaStep }> {
  if (project.mode === "adaptation") {
    if (!project.setup) return [];
    if (!project.referenceStructure) return [{ label: "处理参考稿", step: "reference-script" }];
    if (!project.structureTransform) return [{ label: "生成结构转换", step: "structure-transform" }];
    if (!project.characterTransform) return [{ label: "生成角色转换", step: "character-transform" }];
  } else {
    if (!project.setup) return [];
    if (!project.creativePlan) return [{ label: "生成创作方案", step: "creative-plan" }];
    if (!project.characters) return [{ label: "进入角色开发", step: "characters" }];
  }

  if (!project.directoryRaw) return [{ label: "进入分集目录", step: "directory" }];
  if (project.episodes.length === 0) return [{ label: "进入分集剧本", step: "episodes" }];
  if (!project.complianceReport) return [{ label: "进入合规审核", step: "compliance" }];
  return [{ label: "进入导出", step: "export" }];
}

function getResumeBanner(project: DramaProject, currentStep: DramaStep, agentHandoff?: AgentHandoff | null) {
  if (agentHandoff?.resumeProjectType === "video") {
    const sourceStep = agentHandoff.resumeStepLabel || "视频流程";
    return {
      eyebrow: "已恢复历史项目",
      title: agentHandoff.resumeProjectTitle || project.dramaTitle || "当前项目",
      description: `已把这个视频项目从 ${sourceStep} 收口回首页会话，你可以继续在同一条对话里整理脚本、分镜和后续出片动作。`,
    };
  }
  const modeLabel = project.mode === "adaptation" ? "改编模式" : "原创模式";
  return {
    eyebrow: "已恢复历史项目",
    title: project.dramaTitle || "当前项目",
    description: `当前已回到 ${modeLabel} 的「${DRAMA_STEP_LABELS[currentStep]}」阶段，可以直接继续处理这一环。`,
  };
}

function AssistantBubble({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
          immersive ? "bg-slate-900/[0.06] text-slate-800" : "bg-primary/12 text-primary",
        )}
      >
        <Bot className="h-4 w-4" />
      </div>
      <div
        className={cn(
          "max-w-[92%] rounded-[24px] rounded-tl-md border px-4 py-3 text-sm leading-6",
          immersive
            ? "border-white/86 bg-[linear-gradient(180deg,rgba(255,255,255,0.90),rgba(247,250,253,0.82))] text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
            : "border-border/60 bg-card text-foreground/88",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[88%] rounded-[24px] rounded-br-md px-4 py-3 text-sm leading-6 shadow-sm",
          immersive ? "bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))] text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]" : "bg-primary text-primary-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default function ScriptCreatorAgentFlow({
  agentHandoff,
  showModeSelector,
  project,
  setupMode,
  steps,
  currentStep,
  onSetupModeChange,
  onModeSelect,
  onSetupReady,
  onReferenceScriptSeed,
  goToStep,
  canAdvanceTo,
  renderWorkbench,
  immersive = false,
  composerValue,
  onComposerValueChange,
  hideInternalComposer = false,
  onExternalComposerStateChange,
  onExternalComposerActionsChange,
}: Props) {
  const [draft, setDraft] = useState<DraftState>(() => createDraft(project, agentHandoff));
  const [dialogQuestion, setDialogQuestion] = useState<QuestionKey | null>(null);
  const [internalComposerValue, setInternalComposerValue] = useState("");
  const [genreSelection, setGenreSelection] = useState<string[]>(() => createDraft(project, agentHandoff).genres);
  const isExternalComposer = typeof composerValue === "string" && typeof onComposerValueChange === "function";
  const customValue = isExternalComposer ? composerValue : internalComposerValue;
  const setCustomValue = isExternalComposer ? onComposerValueChange! : setInternalComposerValue;

  useEffect(() => {
    setDraft(createDraft(project, agentHandoff));
    setGenreSelection(project.setup?.genres || []);
  }, [project.id, project.mode, project.setup, project.referenceScript, agentHandoff]);

  const pendingQuestion = useMemo(
    () => getPendingQuestion(showModeSelector, project.mode, draft),
    [showModeSelector, project.mode, draft],
  );
  const currentOptions = pendingQuestion ? questionOptions(pendingQuestion, draft) : [];
  const stageSummary = getStageSummary(project);
  const suggestedActions = getSuggestedActions(project);
  const showInputComposer = !!pendingQuestion && pendingQuestion !== "mode";
  const composerPlaceholder =
    pendingQuestion === "referenceScript"
      ? "把参考稿直接贴在这里"
      : pendingQuestion === "creativeInput"
        ? "直接描述你的创意设定、世界观、人物关系或核心冲突"
        : pendingQuestion === "episodes"
          ? "输入自定义集数，例如 72"
          : pendingQuestion === "genres"
            ? "输入自定义题材，多个可用逗号分隔"
            : "也可以直接输入自定义答案";
  const composerMultiline = pendingQuestion === "creativeInput" || pendingQuestion === "referenceScript";

  const applyValue = useCallback((question: QuestionKey, value: string) => {
    switch (question) {
      case "mode":
        onModeSelect(value as DramaMode);
        return;
      case "targetMarket":
        setDraft((prev) => ({ ...prev, targetMarket: value, genres: [] }));
        return;
      case "setupMode":
        onSetupModeChange(value as SetupMode);
        setDraft((prev) => ({
          ...prev,
          setupMode: value as SetupMode,
          genres: value === "topic" ? prev.genres : [],
          creativeInput: value === "creative" ? prev.creativeInput : "",
        }));
        return;
      case "audience":
        setDraft((prev) => ({ ...prev, audience: value }));
        return;
      case "tone":
        setDraft((prev) => ({ ...prev, tone: value }));
        return;
      case "ending":
        setDraft((prev) => ({ ...prev, ending: value }));
        return;
      case "episodes": {
        const numeric = Number.parseInt(value, 10);
        if (Number.isFinite(numeric) && numeric > 0) {
          setDraft((prev) => ({ ...prev, totalEpisodes: numeric }));
        }
        return;
      }
      case "creativeInput":
        setDraft((prev) => ({ ...prev, creativeInput: value }));
        return;
      case "referenceScript":
        setDraft((prev) => ({ ...prev, referenceScript: value }));
        onReferenceScriptSeed(value);
        return;
      default:
        return;
    }
  }, [onModeSelect, onReferenceScriptSeed, onSetupModeChange]);

  const submitCustomValue = useCallback(() => {
    if (!pendingQuestion) return;
    const value = customValue.trim();
    if (!value) return;

    if (pendingQuestion === "genres") {
      const topics = value
        .split(/[,，、/\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 2);
      setDraft((prev) => ({ ...prev, genres: topics }));
      setGenreSelection(topics);
    } else if (pendingQuestion === "episodes") {
      const numeric = Number.parseInt(value, 10);
      if (Number.isFinite(numeric) && numeric > 0) {
        setDraft((prev) => ({ ...prev, totalEpisodes: numeric }));
      }
    } else {
      applyValue(pendingQuestion, value);
    }

    setCustomValue("");
  }, [applyValue, customValue, pendingQuestion, setCustomValue]);

  const confirmGenres = useCallback(() => {
    setDraft((prev) => ({ ...prev, genres: genreSelection.slice(0, 2) }));
    setDialogQuestion(null);
  }, [genreSelection]);

  const confirmSetup = () => {
    const nextSetup = buildSetup(project.mode, draft);
    if (project.mode === "adaptation" && draft.referenceScript.trim()) {
      onReferenceScriptSeed(draft.referenceScript.trim());
    }
    onSetupReady(nextSetup);
  };

  const selectComposerOption = useCallback((value: string) => {
    if (!pendingQuestion) return;
    if (pendingQuestion === "genres") {
      setGenreSelection([value]);
      setDraft((prev) => ({ ...prev, genres: [value] }));
      return;
    }
    applyValue(pendingQuestion, value);
  }, [applyValue, pendingQuestion]);

  const openComposerDialog = useCallback(() => {
    if (!pendingQuestion || currentOptions.length === 0) return;
    setDialogQuestion(pendingQuestion);
    setCustomValue("");
  }, [currentOptions.length, pendingQuestion, setCustomValue]);

  useEffect(() => {
    if (!onExternalComposerStateChange) return;
    onExternalComposerStateChange({
      visible: showInputComposer || showModeSelector,
      title: showModeSelector ? getQuestionTitle("mode") : pendingQuestion ? getQuestionTitle(pendingQuestion, project.mode) : "",
      placeholder: composerPlaceholder,
      multiline: composerMultiline,
      options: showModeSelector ? modeOptions : currentOptions.slice(0, pendingQuestion === "targetMarket" ? 4 : 5),
      canSubmit: customValue.trim().length > 0 && showInputComposer,
      selectedGenres: draft.genres,
      showModeSelector,
      modeOptions,
    });
  }, [
    composerMultiline,
    composerPlaceholder,
    currentOptions,
    customValue,
    draft.genres,
    onExternalComposerStateChange,
    pendingQuestion,
    project.mode,
    showInputComposer,
    showModeSelector,
  ]);

  useEffect(() => {
    if (!onExternalComposerActionsChange) return;
    onExternalComposerActionsChange({
      submit: submitCustomValue,
      selectOption: selectComposerOption,
      openDialog: openComposerDialog,
    });
    return () => onExternalComposerActionsChange(null);
  }, [onExternalComposerActionsChange, openComposerDialog, selectComposerOption, submitCustomValue]);

  const renderComposer = (floating: boolean) => {
    if (hideInternalComposer || !pendingQuestion || pendingQuestion === "mode") return null;

    return (
      <div
        className={cn(
          "space-y-3",
          floating
            ? "rounded-[30px] border border-white/84 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,250,253,0.84))] p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)]"
            : "rounded-[24px] border border-dashed border-border/70 bg-muted/30 p-4",
        )}
      >
        {floating && (
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-slate-900/[0.06] px-2.5 py-1 text-[11px] text-slate-600">当前引导</div>
            <p className="text-sm text-slate-700">{getQuestionTitle(pendingQuestion, project.mode)}</p>
          </div>
        )}

        {pendingQuestion === "genres" && draft.genres.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {draft.genres.map((genre) => (
              <Badge key={genre} variant="secondary" className="rounded-full">
                {genre}
              </Badge>
            ))}
          </div>
        )}

        {pendingQuestion === "creativeInput" || pendingQuestion === "referenceScript" ? (
          <Textarea
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            rows={pendingQuestion === "referenceScript" ? 6 : 4}
            className={cn(floating ? "rounded-[22px] border-slate-200 bg-white/90" : "")}
            placeholder={
              pendingQuestion === "referenceScript"
                ? "把参考稿直接贴在这里"
                : "直接描述你的创意设定、世界观、人物关系或核心冲突"
            }
          />
        ) : (
          <Input
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            className={cn(floating ? "h-12 rounded-full border-slate-200 bg-white/90 px-4" : "")}
            placeholder={
              pendingQuestion === "episodes"
                ? "输入自定义集数，例如 72"
                : pendingQuestion === "genres"
                  ? "输入自定义题材，多个可用逗号分隔"
                  : "也可以直接输入自定义答案"
            }
          />
        )}

        <div className="flex flex-wrap gap-2">
          {currentOptions.slice(0, pendingQuestion === "targetMarket" ? 4 : 5).map((option) => (
            <Button
              key={option.value}
              variant="outline"
              className={cn("rounded-full", floating ? "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50" : "")}
              onClick={() => {
                if (pendingQuestion === "genres") {
                  setGenreSelection([option.value]);
                  setDraft((prev) => ({ ...prev, genres: [option.value] }));
                  return;
                }
                selectComposerOption(option.value);
              }}
            >
              {option.label}
            </Button>
          ))}
          {currentOptions.length > 0 && (
            <Button
              variant="secondary"
              className={cn("rounded-full", floating ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "")}
              onClick={() => {
                openComposerDialog();
              }}
            >
              打开预设选项
            </Button>
          )}
          <Button
            className={cn("rounded-full", floating ? "bg-slate-900 text-white hover:bg-slate-800" : "")}
            onClick={submitCustomValue}
            disabled={!customValue.trim()}
          >
            提交回答
          </Button>
        </div>
      </div>
    );
  };

  const answeredQuestions: QuestionKey[] = [];
  if (!showModeSelector) answeredQuestions.push("targetMarket");
  if (project.mode === "traditional" && draft.setupMode) answeredQuestions.push("setupMode");
  if (project.mode === "traditional" && draft.setupMode === "topic" && draft.genres.length > 0) answeredQuestions.push("genres");
  if (project.mode === "traditional" && draft.setupMode === "creative" && draft.creativeInput.trim()) answeredQuestions.push("creativeInput");
  if (draft.audience.trim()) answeredQuestions.push("audience");
  if (draft.tone.trim()) answeredQuestions.push("tone");
  if (draft.ending.trim()) answeredQuestions.push("ending");
  if (draft.totalEpisodes) answeredQuestions.push("episodes");
  if (project.mode === "adaptation" && draft.referenceScript.trim()) answeredQuestions.push("referenceScript");
  const isResumedProject = Boolean(agentHandoff?.resumeProjectId);
  const resumeBanner = isResumedProject ? getResumeBanner(project, currentStep, agentHandoff) : null;

  return (
    <div className={cn("grid gap-5", immersive ? "h-full xl:grid-cols-[0.9fr_1.1fr]" : "xl:grid-cols-[0.92fr_1.08fr]")}>
      <section
        className={cn(
          "overflow-hidden rounded-[32px] border shadow-sm",
          immersive
            ? "flex min-h-0 flex-col border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(243,247,252,0.66))] shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-[30px]"
            : "border-border/60 bg-card",
        )}
      >
        <div className={cn("flex items-center justify-between px-5 py-4", immersive ? "border-b border-white/70 bg-white/32" : "border-b border-border/60")}>
          <div className="flex items-center gap-3">
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", immersive ? "bg-slate-900/[0.05] text-slate-800" : "bg-primary/10 text-primary")}>
              <MessageSquareText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Agent 导演台</h2>
              <p className="text-sm text-muted-foreground">由 Agent 提问、确认答案，再把工作推到右侧生产面板。</p>
            </div>
          </div>
          <Badge variant="outline" className={cn("rounded-full px-3 py-1", immersive ? "border-white/70 bg-white/70 text-slate-700" : "")}>
            Agent 主导
          </Badge>
        </div>

        <div className={cn("min-h-0", immersive ? "flex flex-1 flex-col" : "")}>
          <ScrollArea className={cn(immersive ? "min-h-0 flex-1" : "h-[calc(100vh-220px)] min-h-[680px]")}>
            <div className={cn("space-y-4 px-5 py-5", immersive ? "pb-8" : "")}>
            <AssistantBubble immersive={immersive}>
              <div className="space-y-2">
                <p className="font-medium text-foreground">我会接管前置梳理和流程推进。</p>
                <p>
                  你只需要按问题回答，我会在合适的地方给你预设选项，也允许你直接自定义输入。右侧永远是当前最该处理的生产面板。
                </p>
              </div>
            </AssistantBubble>

            {agentHandoff?.prompt && (
              <>
                <AssistantBubble immersive={immersive}>{agentHandoff.title}</AssistantBubble>
                <UserBubble immersive={immersive}>{agentHandoff.prompt}</UserBubble>
              </>
            )}

            {resumeBanner && (
              <div className={cn("ml-12 overflow-hidden rounded-[28px]", immersive ? "border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(247,250,253,0.72))] shadow-[0_16px_40px_rgba(15,23,42,0.07)]" : "border border-border/60 bg-muted/20")}>
                <div className="flex items-start gap-3 px-4 py-4 md:px-5">
                  <div className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", immersive ? "bg-slate-900/[0.05] text-slate-800" : "bg-primary/10 text-primary")}>
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{resumeBanner.eyebrow}</div>
                    <div className="mt-1 text-base font-semibold text-slate-900">{resumeBanner.title}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{resumeBanner.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 hover:bg-slate-50">
                        当前阶段：{DRAMA_STEP_LABELS[currentStep]}
                      </Badge>
                      {suggestedActions.slice(0, 1).map((action) => (
                        <Button key={action.step} variant="outline" className="rounded-full border-slate-200 bg-white/90 text-slate-700 hover:bg-white" onClick={() => goToStep(action.step)}>
                          继续到 {action.label}
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showModeSelector && (
              <>
                <AssistantBubble immersive={immersive}>{getQuestionTitle("mode")}</AssistantBubble>
                <div className="ml-12 flex flex-wrap gap-2">
                  {modeOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant="outline"
                      className="rounded-full"
                      onClick={() => applyValue("mode", option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </>
            )}

            {!showModeSelector &&
              answeredQuestions.map((question) => (
                <div key={question} className="space-y-3">
                  <AssistantBubble immersive={immersive}>{getQuestionTitle(question, project.mode)}</AssistantBubble>
                  <UserBubble immersive={immersive}>{answerLabel(question, draft)}</UserBubble>
                </div>
              ))}

            {!immersive && pendingQuestion && pendingQuestion !== "mode" && (
              <>
                <AssistantBubble>{getQuestionTitle(pendingQuestion, project.mode)}</AssistantBubble>
                <div className="ml-12 space-y-3 rounded-[24px] border border-dashed border-border/70 bg-muted/30 p-4">
                  {pendingQuestion === "genres" && draft.genres.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {draft.genres.map((genre) => (
                        <Badge key={genre} variant="secondary" className="rounded-full">
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {pendingQuestion === "creativeInput" || pendingQuestion === "referenceScript" ? (
                    <Textarea
                      value={customValue}
                      onChange={(event) => setCustomValue(event.target.value)}
                      rows={pendingQuestion === "referenceScript" ? 8 : 5}
                      placeholder={pendingQuestion === "referenceScript" ? "把参考稿直接贴在这里…" : "直接描述你的创意设定、世界观、人物关系或核心冲突…"}
                    />
                  ) : (
                    <Input
                      value={customValue}
                      onChange={(event) => setCustomValue(event.target.value)}
                      placeholder={
                        pendingQuestion === "episodes"
                          ? "输入自定义集数，例如 72"
                          : pendingQuestion === "genres"
                            ? "输入自定义题材，多个可用逗号分隔"
                            : "也可以直接输入自定义答案"
                      }
                    />
                  )}

                  <div className="flex flex-wrap gap-2">
                    {currentOptions.slice(0, pendingQuestion === "targetMarket" ? 4 : 5).map((option) => (
                      <Button
                        key={option.value}
                        variant="outline"
                        className="rounded-full"
                        onClick={() => {
                          if (pendingQuestion === "genres") {
                            setGenreSelection([option.value]);
                            setDraft((prev) => ({ ...prev, genres: [option.value] }));
                            return;
                          }
                          applyValue(pendingQuestion, option.value);
                        }}
                      >
                        {option.label}
                      </Button>
                    ))}
                    {currentOptions.length > 0 && (
                      <Button
                        variant="secondary"
                        className="rounded-full"
                        onClick={() => {
                          setDialogQuestion(pendingQuestion);
                          setCustomValue("");
                        }}
                      >
                        选择预设项
                      </Button>
                    )}
                    <Button className="rounded-full" onClick={submitCustomValue} disabled={!customValue.trim()}>
                      提交回答
                    </Button>
                  </div>
                </div>
              </>
            )}

            {!pendingQuestion && !project.setup && (
              <>
                <AssistantBubble immersive={immersive}>
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">前置信息收齐了，我先帮你确认一次。</p>
                    <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                      <div>目标市场：{answerLabel("targetMarket", draft)}</div>
                      {project.mode === "traditional" && draft.setupMode && (
                        <div>启动方式：{answerLabel("setupMode", draft)}</div>
                      )}
                      {project.mode === "traditional" && draft.setupMode === "topic" && (
                        <div>题材方向：{answerLabel("genres", draft)}</div>
                      )}
                      <div>目标人群：{answerLabel("audience", draft)}</div>
                      <div>整体风格：{answerLabel("tone", draft)}</div>
                      <div>结局倾向：{answerLabel("ending", draft)}</div>
                      <div>总集数：{answerLabel("episodes", draft)}</div>
                    </div>
                  </div>
                </AssistantBubble>
                <div className="ml-12 flex flex-wrap gap-2">
                  <Button className="rounded-full" onClick={confirmSetup}>
                    确认并进入下一步
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {project.setup && (
              <>
                <AssistantBubble immersive={immersive}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <p className="font-medium text-foreground">{stageSummary.title}</p>
                    </div>
                    <p>{stageSummary.description}</p>
                  </div>
                </AssistantBubble>

                <div className={cn("ml-12 space-y-3 rounded-[26px] p-4", immersive ? "border border-white/78 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(247,250,253,0.64))] shadow-[0_14px_36px_rgba(15,23,42,0.06)]" : "border border-border/60 bg-muted/20")}>
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <PanelsTopLeft className="h-4 w-4 text-primary" />
                    流程导航
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {steps.map((step) => {
                      const isCurrent = step === currentStep;
                      const clickable = canAdvanceTo(step) || step === currentStep;
                      return (
                        <button
                          key={step}
                          type="button"
                          disabled={!clickable}
                          onClick={() => clickable && goToStep(step)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs transition",
                            isCurrent
                              ? "border-primary bg-primary text-primary-foreground"
                              : clickable
                                ? "border-border bg-background hover:border-primary/40 hover:text-foreground"
                                : "border-border/60 bg-background/50 text-muted-foreground",
                          )}
                        >
                          {DRAMA_STEP_LABELS[step]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedActions.map((action) => (
                      <Button key={action.step} variant="outline" className="rounded-full" onClick={() => goToStep(action.step)}>
                        {action.label}
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}
            </div>
          </ScrollArea>
          {immersive && renderComposer(true) && (
            <div className="border-t border-white/72 bg-white/48 px-5 py-4 backdrop-blur-[30px]">
              {renderComposer(true)}
            </div>
          )}
        </div>
      </section>

      <section
        className={cn(
          "overflow-hidden rounded-[32px] border shadow-sm",
          immersive
            ? "flex min-h-0 flex-col border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(241,246,252,0.70))] shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-[30px]"
            : "border-border/60 bg-card",
        )}
      >
        <div className={cn("flex items-center justify-between px-5 py-4", immersive ? "border-b border-white/70 bg-white/34" : "border-b border-border/60")}>
          <div className="flex items-center gap-3">
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", immersive ? "bg-slate-900/[0.05] text-slate-800" : "bg-accent/12 text-accent")}>
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">当前生产面板</h2>
              <p className="text-sm text-muted-foreground">
                {project.setup ? `当前步骤：${DRAMA_STEP_LABELS[currentStep]}` : "先在左侧完成 Agent 提问，再进入生产。"}
              </p>
            </div>
          </div>
        </div>

        <div className={cn("overflow-auto px-5 py-5", immersive ? "min-h-0 flex-1" : "h-[calc(100vh-220px)] min-h-[680px]")}>
          {project.setup ? (
            renderWorkbench()
          ) : (
            <div className={cn("flex h-full min-h-[520px] flex-col items-center justify-center rounded-[30px] px-8 text-center", immersive ? "border border-white/78 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(247,250,253,0.68))] shadow-[0_16px_40px_rgba(15,23,42,0.07)]" : "border border-dashed border-border/70 bg-muted/20")}>
              <div className={cn("mb-4 flex h-14 w-14 items-center justify-center rounded-[20px]", immersive ? "bg-slate-900/[0.05] text-slate-800" : "bg-primary/10 text-primary")}>
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">Agent 正在搭建项目前置条件</h3>
              <p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">
                左侧回答完关键问题后，这里会自动切换到最适合当前阶段的生产面板，比如创作方案、角色开发、分集目录或参考稿分析。
              </p>
            </div>
          )}
        </div>
      </section>

      <Dialog open={!!dialogQuestion} onOpenChange={(open) => !open && setDialogQuestion(null)}>
        <DialogContent className="max-w-3xl border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,246,252,0.96))] shadow-[0_30px_90px_rgba(15,23,42,0.16)] sm:rounded-[30px]">
          <DialogHeader>
            <DialogTitle>选择预设项</DialogTitle>
            <DialogDescription>
              {dialogQuestion ? getQuestionTitle(dialogQuestion, project.mode) : ""}
            </DialogDescription>
          </DialogHeader>

          {dialogQuestion === "genres" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {genreSelection.map((genre) => (
                  <Badge key={genre} variant="secondary" className="rounded-full">
                    {genre}
                  </Badge>
                ))}
              </div>
              <div className="grid max-h-[420px] gap-2 overflow-auto md:grid-cols-2">
                {currentOptions.map((option) => {
                  const selected = genreSelection.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setGenreSelection((prev) => {
                          if (selected) return prev.filter((item) => item !== option.value);
                          if (prev.length >= 2) return prev;
                          return [...prev, option.value];
                        })
                      }
                      className={cn(
                        "rounded-2xl border p-3 text-left transition",
                        selected
                          ? "border-primary bg-primary/8"
                          : "border-border hover:border-primary/35 hover:bg-muted/40",
                      )}
                    >
                      <div className="font-medium text-foreground">{option.label}</div>
                      {option.description && <div className="mt-1 text-sm text-muted-foreground">{option.description}</div>}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogQuestion(null)}>
                  取消
                </Button>
                <Button onClick={confirmGenres} disabled={genreSelection.length === 0}>
                  确认选择
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid max-h-[420px] gap-2 overflow-auto md:grid-cols-2">
              {currentOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    applyValue(dialogQuestion!, option.value);
                    setDialogQuestion(null);
                  }}
                  className="rounded-2xl border border-border p-3 text-left transition hover:border-primary/35 hover:bg-muted/40"
                >
                  <div className="font-medium text-foreground">{option.label}</div>
                  {option.description && <div className="mt-1 text-sm text-muted-foreground">{option.description}</div>}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
