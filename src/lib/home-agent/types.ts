import type {
  CharacterStateCard,
  ComplianceRevisionPacket,
  DramaProject,
  DramaSetup,
  StoryBeatPacket,
} from "@/types/drama";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import type {
  ProductionAssetManifest,
  VideoReviewItem,
  VideoShotPacket,
  VideoStyleLock,
  VideoWorldModel,
} from "@/types/project";

export type AgentConversationMode = "idle" | "active" | "recovering" | "maintenance-review";
export type ConversationProjectKind = "script" | "adaptation" | "video";
export type ArtifactKind =
  | "setup"
  | "reference"
  | "plan"
  | "characters"
  | "scene-settings"
  | "directory"
  | "outline"
  | "episode"
  | "compliance"
  | "export"
  | "video-brief"
  | "storyboard-plan"
  | "video-prompt-batch"
  | "world-model"
  | "style-lock"
  | "character-card"
  | "beat-packet"
  | "compliance-revision"
  | "asset-manifest"
  | "shot-packet"
  | "review"
  | "report";

export interface ComposerQuestionOption {
  id: string;
  label: string;
  value: string;
  rationale?: string;
  selected?: boolean;
}

export interface ComposerQuestion {
  id: string;
  title: string;
  description?: string;
  options: ComposerQuestionOption[];
  allowCustomInput: boolean;
  submissionMode: "immediate" | "confirm";
  multiSelect: boolean;
  stepIndex: number;
  totalSteps: number;
  answerKey: string;
}

export interface ConversationArtifact {
  id: string;
  kind: ArtifactKind;
  label: string;
  summary: string;
  content?: string;
  updatedAt: string;
}

export type ConversationMemoryKind =
  | "project-summary"
  | "conversation-summary"
  | "artifact"
  | "maintenance-report"
  | "skill-draft";

export interface ConversationMemoryDocument {
  id: string;
  projectId?: string;
  projectKind?: ConversationProjectKind;
  title: string;
  kind: ConversationMemoryKind;
  text: string;
  summary: string;
  updatedAt: string;
  tags: string[];
}

export interface ConversationProjectSnapshot {
  projectId: string;
  projectKind: ConversationProjectKind;
  title: string;
  currentObjective: string;
  derivedStage: string;
  agentSummary: string;
  recommendedActions: string[];
  artifacts: ConversationArtifact[];
  updatedAt?: string;
  memory?: {
    styleLock?: VideoStyleLock | null;
    worldModel?: VideoWorldModel | null;
    assetManifest?: ProductionAssetManifest | null;
    shotPackets?: VideoShotPacket[];
    reviewQueue?: VideoReviewItem[];
    characterStateCards?: CharacterStateCard[];
    storyBeatPackets?: StoryBeatPacket[];
    complianceRevisionPackets?: ComplianceRevisionPacket[];
  };
}

export interface SkillDraft {
  id: string;
  sourceConversationIds: string[];
  proposedSkillName: string;
  proposedContent: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  createdAt: string;
}

export interface MaintenanceReport {
  id: string;
  createdAt: string;
  summary: string;
  compressedConversationCount: number;
  archivedProjectCount: number;
  clearedCacheKeys: string[];
  mergedDraftCount: number;
  notes: string[];
}

export interface HomeAgentMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  createdAt: string;
  status?: "pending" | "complete";
}

export interface StudioQuestionState {
  source?: "live" | "restored";
  request: AskUserQuestionRequest;
  currentIndex: number;
  answers: Record<string, string>;
  displayAnswers: Record<string, string>;
}

export interface WorkflowActionResult {
  summary: string;
  artifact?: ConversationArtifact;
  projectSnapshot?: ConversationProjectSnapshot;
  recommendedActions?: string[];
  data?: WorkflowRuntimeDelta;
}

export interface WorkflowAction {
  id: string;
  kind: string;
  run: (input: Record<string, unknown>, context: StudioRuntimeState) => Promise<WorkflowActionResult>;
}

export interface WorkflowRuntimeDelta {
  dramaProject?: DramaProject | null;
  videoProject?: PersistedVideoProject | null;
  projectSnapshot?: ConversationProjectSnapshot | null;
  skillDrafts?: SkillDraft[];
  maintenanceReports?: MaintenanceReport[];
  recentMessageSummary?: string;
}

export interface AgentConversationShellState {
  mode: AgentConversationMode;
  composerState: {
    draft: string;
    isStreaming: boolean;
    placeholder: string;
  };
  popoverQuestion: ComposerQuestion | null;
  messages: HomeAgentMessage[];
  currentProjectSnapshot: ConversationProjectSnapshot | null;
  rightRailState: {
    recentProjects: ConversationProjectSnapshot[];
    skillDrafts: SkillDraft[];
    maintenanceReports: MaintenanceReport[];
  };
}

export interface StudioSessionState {
  sessionId?: string;
  compactedMessageCount?: number;
  mode: AgentConversationMode;
  messages: HomeAgentMessage[];
  currentProjectSnapshot: ConversationProjectSnapshot | null;
  recentMessageSummary: string;
  projectId?: string;
  draft?: string;
  qState?: StudioQuestionState | null;
  selectedValues?: string[];
  surfacedTaskIds?: string[];
  surfacedTaskFollowupKeys?: string[];
  surfacedProjectSuggestionKeys?: string[];
}

export interface StudioRuntimeState {
  sessionId: string;
  currentProjectSnapshot: ConversationProjectSnapshot | null;
  currentDramaProject: DramaProject | null;
  currentVideoProject: PersistedVideoProject | null;
  currentSetupDraft: DramaSetup | null;
  skillDrafts: SkillDraft[];
  maintenanceReports: MaintenanceReport[];
  recentProjects: ConversationProjectSnapshot[];
  recentProjectSessions?: StudioSessionState[];
  recentMessageSummary: string;
}
