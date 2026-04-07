import type { SDKMessage } from "@/lib/agent/types";
import type { AutoResearchPlan } from "@/lib/home-agent/auto-research";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import type { ConversationProjectSnapshot, HomeAgentMessage, StudioRuntimeState, StudioSessionState } from "@/lib/home-agent/types";

type PushMessage = (role: HomeAgentMessage["role"], content: string) => void;
type ConversationMemoryModuleLike = typeof import("@/lib/home-agent/conversation-memory");
type ProjectStoreModuleLike = typeof import("@/lib/home-agent/project-store");
type StructuredQuestionParserModuleLike = typeof import("./structured-question-parser");

type DreaminaCapabilityState = {
  ready: boolean;
  available: boolean;
  message?: string;
};

export function beginSendFlow(params: {
  prompt: string;
  shown?: string;
  push: PushMessage;
  setPopoverOverride: (question: null) => void;
  setSuggested: (question: null) => void;
  setMode: (mode: "active") => void;
  resetComposerDraft: (value?: string) => void;
  /** When true, history already ends with the user turn (e.g. regenerate assistant). */
  skipUserBubble?: boolean;
}): string | null {
  const {
    prompt,
    shown,
    push,
    setPopoverOverride,
    setSuggested,
    setMode,
    resetComposerDraft,
    skipUserBubble,
  } = params;
  const cleaned = prompt.trim();
  if (!cleaned) return null;

  if (!skipUserBubble) {
    push("user", shown || cleaned);
  }
  setPopoverOverride(null);
  setSuggested(null);
  setMode("active");
  resetComposerDraft("");
  return cleaned;
}

export async function applyAutoResearchOverlay(params: {
  cleaned: string;
  launchAutoResearchTasks: (prompt: string) => Promise<{ plan: AutoResearchPlan; taskIds: string[] } | null>;
  push: PushMessage;
  buildResearchPromptOverlay: (plan: AutoResearchPlan, taskIds: string[]) => string;
}): Promise<string> {
  const { cleaned, launchAutoResearchTasks, push, buildResearchPromptOverlay } = params;

  try {
    const research = await launchAutoResearchTasks(cleaned);
    if (!research) return cleaned;
    push("assistant", research.plan.kickoff);
    return `${cleaned}\n\n${buildResearchPromptOverlay(research.plan, research.taskIds)}`;
  } catch {
    return cleaned;
  }
}

export async function applyConversationMemoryOverlay(params: {
  cleaned: string;
  promptForEngine: string;
  runtime: StudioRuntimeState;
  loadConversationMemoryModule: () => Promise<ConversationMemoryModuleLike>;
  loadProjectStore: () => Promise<ProjectStoreModuleLike>;
  readProjectSession: (projectId: string) => StudioSessionState | null;
  flashMaintenanceHint: (message: string, duration?: number) => void;
}): Promise<string> {
  const {
    cleaned,
    promptForEngine,
    runtime,
    loadConversationMemoryModule,
    loadProjectStore,
    readProjectSession,
    flashMaintenanceHint,
  } = params;

  try {
    const memoryModule = await loadConversationMemoryModule();
    let memoryRuntime = runtime;
    if (!memoryRuntime.recentProjects.length) {
      try {
        const store = await loadProjectStore();
        const snapshots = await store.listRecentConversationSnapshots(8);
        memoryRuntime = {
          ...memoryRuntime,
          recentProjects: snapshots,
        };
      } catch {
        memoryRuntime = runtime;
      }
    }

    const recentProjectSessions = memoryRuntime.recentProjects
      .map((snapshot) => readProjectSession(snapshot.projectId))
      .filter((session): session is StudioSessionState => Boolean(session));
    const memoryCorpus = memoryModule.buildConversationMemoryCorpus({
      ...memoryRuntime,
      recentProjectSessions,
    });
    const preferCurrentProject = memoryModule.isProjectInternalMemoryQuery(cleaned);
    const memoryHits = memoryModule.searchConversationMemory(
      cleaned,
      memoryCorpus,
      runtime.currentProjectSnapshot?.projectId,
      { preferCurrentProject },
    ).filter((document) =>
      preferCurrentProject ? true : document.projectId !== runtime.currentProjectSnapshot?.projectId,
    );
    const memoryPrompt = memoryModule.buildConversationMemoryPrompt(memoryHits);
    if (!memoryPrompt) return promptForEngine;

    flashMaintenanceHint(memoryModule.buildConversationMemoryHint(memoryHits) ?? "已参考历史经验", 1800);
    return `${promptForEngine}\n\n${memoryPrompt}`;
  } catch {
    return promptForEngine;
  }
}

export async function applyDreaminaContextOverlay(params: {
  cleaned: string;
  promptForEngine: string;
  currentProjectSnapshot: ConversationProjectSnapshot | null;
  dreaminaCapability: DreaminaCapabilityState;
  resolveDreaminaCapability: () => Promise<DreaminaCapabilityState>;
  isVideoIntentPrompt: (prompt: string, snapshot?: ConversationProjectSnapshot | null) => boolean;
  buildDreaminaCapabilityOverlay: (message?: string) => string;
  flashMaintenanceHint: (message: string, duration?: number) => void;
  hasSurfacedHint: boolean;
}): Promise<{ promptForEngine: string; surfacedHint: boolean }> {
  const {
    cleaned,
    promptForEngine,
    currentProjectSnapshot,
    dreaminaCapability,
    resolveDreaminaCapability,
    isVideoIntentPrompt,
    buildDreaminaCapabilityOverlay,
    flashMaintenanceHint,
    hasSurfacedHint,
  } = params;

  const shouldUseDreaminaContext = isVideoIntentPrompt(cleaned, currentProjectSnapshot);
  const currentDreaminaCapability = shouldUseDreaminaContext ? await resolveDreaminaCapability() : dreaminaCapability;

  if (!currentDreaminaCapability.available || !shouldUseDreaminaContext) {
    return {
      promptForEngine,
      surfacedHint: hasSurfacedHint,
    };
  }

  if (!hasSurfacedHint) {
    flashMaintenanceHint("已接入 Dreamina CLI，可直接使用 Seedance 2.0", 2200);
  }

  return {
    promptForEngine: `${promptForEngine}\n\n${buildDreaminaCapabilityOverlay(currentDreaminaCapability.message)}`,
    surfacedHint: true,
  };
}

export async function handleSendEngineEvent(params: {
  event: SDKMessage;
  loadStructuredQuestionParser: () => Promise<StructuredQuestionParserModuleLike>;
  textOf: (content: unknown) => string;
  push: PushMessage;
  appendStreamingDelta: (delta: string) => void;
  setQuestionRequest: (request: AskUserQuestionRequest) => void;
}): Promise<void> {
  const { event, loadStructuredQuestionParser, textOf, push, appendStreamingDelta, setQuestionRequest } = params;

  if (event.type === 'text_delta') {
    appendStreamingDelta((event as { type: 'text_delta'; delta: string }).delta);
    return;
  }

  if (event.type === "assistant") {
    const parser = await loadStructuredQuestionParser();
    const parsed = parser.extractStructuredQuestion(textOf(event.message.message.content));
    if (parsed.cleanedText.trim()) push("assistant", parsed.cleanedText.trim());
    if (parsed.request) setQuestionRequest(parsed.request);
    return;
  }

  if (event.type === "result" && event.isError && event.result) {
    push("assistant", event.result);
  }
}
