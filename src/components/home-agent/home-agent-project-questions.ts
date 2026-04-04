import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type { ComposerQuestion, ConversationProjectSnapshot } from "@/lib/home-agent/types";
import type { Scene, VideoReviewItem } from "@/types/project";
import { buildRecoveryActionRationale, summarizeRecoveryArtifacts } from "./home-agent-session-utils";
import { truncateCopy } from "./home-agent-task-utils";

export function listActionableReviewItems(snapshot: ConversationProjectSnapshot): VideoReviewItem[] {
  return snapshot.memory?.reviewQueue?.filter((item) => item.status === "pending" || item.status === "redo") ?? [];
}

export function listPendingApprovalReviewItems(snapshot: ConversationProjectSnapshot): VideoReviewItem[] {
  return snapshot.memory?.reviewQueue?.filter((item) => item.status === "pending") ?? [];
}

export function listRedoReviewItems(snapshot: ConversationProjectSnapshot): VideoReviewItem[] {
  return snapshot.memory?.reviewQueue?.filter((item) => item.status === "redo") ?? [];
}

export function findReviewItem(snapshot: ConversationProjectSnapshot, reviewId: string): VideoReviewItem | null {
  return listActionableReviewItems(snapshot).find((item) => item.id === reviewId) ?? null;
}

export function collectReviewTargetIds(snapshot: ConversationProjectSnapshot, mode: "stable" | "risk"): string[] {
  return (mode === "stable" ? listPendingApprovalReviewItems(snapshot) : listRedoReviewItems(snapshot)).flatMap(
    (item) => (item.targetIds.length ? item.targetIds : [item.id]),
  );
}

export function buildReviewQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const reviewQueue = listPendingApprovalReviewItems(snapshot);
  if (!reviewQueue.length) return null;
  return {
    id: `review-${snapshot.projectId}`,
    title: `我已恢复《${snapshot.title}》的待审阅素材，先怎么处理？`,
    description: `当前有 ${reviewQueue.length} 条待审阅项，仍然可以直接输入自定义要求。`,
    options: [
      { id: `${snapshot.projectId}-review-open`, label: "整理待审阅项", value: "review:queue", rationale: "先同步待审阅状态，再决定具体通过还是重做。" },
      { id: `${snapshot.projectId}-review-pass`, label: "通过稳定项", value: "review:approve-stable", rationale: "先收口已经稳定的素材，减少后续反复。" },
      { id: `${snapshot.projectId}-review-redo`, label: "只重做风险项", value: "review:redo-risk", rationale: "先把风险镜头统一退回重做。" },
      { id: `${snapshot.projectId}-review-list`, label: "逐条审阅", value: "review:list", rationale: "展开逐条处理入口，再决定每条素材的去留。" },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "review-recovery",
  };
}

export function buildVideoRepairQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const redoItems = listRedoReviewItems(snapshot);
  if (!redoItems.length) return null;
  return {
    id: `video-repair-${snapshot.projectId}`,
    title: `《${snapshot.title}》已有 ${redoItems.length} 条镜头被退回重做，先怎么修复？`,
    description: "可以整批回发，也可以只挑当前最关键的镜头先重做。",
    options: [
      { id: `${snapshot.projectId}-video-repair-all`, label: redoItems.length === 1 ? "直接重做这条镜头" : "重做全部退回镜头", value: "video:repair:all", rationale: "先把已明确需要返工的镜头统一送回重做。" },
      { id: `${snapshot.projectId}-video-repair-list`, label: "指定镜头重做", value: "video:repair:list", rationale: "只挑当前最关键的镜头先返工，保持修复节奏可控。" },
      { id: `${snapshot.projectId}-video-repair-review`, label: "先复核重做原因", value: "video:repair:review", rationale: "先看清每条镜头为什么被退回，再决定是否整批重做。" },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "video-repair",
  };
}

export function buildVideoRepairListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const redoItems = listRedoReviewItems(snapshot);
  if (!redoItems.length) return null;
  return {
    id: `video-repair-list-${snapshot.projectId}`,
    title: `先重做《${snapshot.title}》里的哪条镜头？`,
    description: "只会回发你选中的镜头，后续仍然在首页里继续看结果。",
    options: redoItems.slice(0, 5).map((item) => ({
      id: item.id,
      label: item.title,
      value: `video:repair:item:${item.id}`,
      rationale: item.reason || item.summary,
    })),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "video-repair-list",
  };
}

export function normalizeVideoSceneStatus(status: string | undefined): string {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return "";
  if (/(queued|pending|submitted)/.test(value)) return "queued";
  if (/(completed|success|succeeded|done)/.test(value)) return "completed";
  if (/(failed|error|cancel)/.test(value)) return "failed";
  return "processing";
}

export function compareSceneOrder(a: Scene, b: Scene): number {
  const segmentA = a.segmentLabel ?? "";
  const segmentB = b.segmentLabel ?? "";
  return a.sceneNumber - b.sceneNumber || segmentA.localeCompare(segmentB, "zh-CN");
}

export function formatSceneOptionLabel(scene: Scene): string {
  return `镜头 ${scene.sceneNumber}${scene.segmentLabel ? ` / ${scene.segmentLabel}` : ""} · ${scene.sceneName}`;
}

export function summarizeSceneOption(scene: Scene): string {
  const fragments = [scene.description, scene.cameraDirection, scene.dialogue].map((value) => value?.trim()).filter(Boolean);
  return truncateCopy(fragments[0] ?? "使用当前镜头设定继续推进出片。", 88);
}

export function listGeneratableVideoScenes(project: PersistedVideoProject | null | undefined): Scene[] {
  if (!project) return [];
  return [...project.scenes].filter((scene) => {
    const status = normalizeVideoSceneStatus(scene.videoStatus);
    if (status === "queued" || status === "processing") return false;
    return !scene.videoUrl;
  }).sort(compareSceneOrder);
}

export function listFailedVideoScenes(project: PersistedVideoProject | null | undefined): Scene[] {
  if (!project) return [];
  return [...project.scenes].filter((scene) => normalizeVideoSceneStatus(scene.videoStatus) === "failed").sort(compareSceneOrder);
}

export function listRunningVideoScenes(project: PersistedVideoProject | null | undefined): Scene[] {
  if (!project) return [];
  return [...project.scenes].filter((scene) => {
    const status = normalizeVideoSceneStatus(scene.videoStatus);
    return !!scene.videoTaskId && (status === "queued" || status === "processing");
  }).sort(compareSceneOrder);
}

export function listCompletedVideoScenes(project: PersistedVideoProject | null | undefined): Scene[] {
  if (!project) return [];
  return [...project.scenes].filter((scene) => !!scene.videoUrl).sort(compareSceneOrder);
}

export function countStoryboardedScenes(project: PersistedVideoProject | null | undefined): number {
  if (!project) return 0;
  return project.scenes.filter((scene) => !!scene.storyboardUrl).length;
}

export function countShotPackets(project: PersistedVideoProject | null | undefined): number {
  return project?.shotPackets?.length ?? 0;
}

export function buildVideoBridgeQuestion(snapshot: ConversationProjectSnapshot, project: PersistedVideoProject | null | undefined): ComposerQuestion | null {
  if (snapshot.projectKind !== "video") return null;
  if (snapshot.derivedStage === "视频提示词" || snapshot.derivedStage === "生成中" || snapshot.derivedStage === "审阅与修复") return null;

  const sceneCount = project?.scenes.length ?? 0;
  const storyboardedSceneCount = countStoryboardedScenes(project);
  const shotPacketCount = countShotPackets(project);

  switch (snapshot.derivedStage) {
    case "脚本拆解":
      return {
        id: `video-bridge-analyze-${snapshot.projectId}`,
        title: `《${snapshot.title}》已经进入视频桥接阶段。`,
        description: sceneCount ? `已整理 ${sceneCount} 个镜头草稿。` : "先把剧本拆成镜头流。",
        options: [
          { id: `${snapshot.projectId}-video-analyze`, label: sceneCount ? "梳理脚本拆解结果" : "先完成第一轮镜头拆解", value: "video:bridge:analyze", rationale: "先把剧本转换成首页可继续推进的镜头序列。" },
          { id: `${snapshot.projectId}-video-entities`, label: "继续提取角色与场景", value: "video:bridge:entities", rationale: "先抽出角色和场景资产，避免后面分镜与出片漂移。" },
          { id: `${snapshot.projectId}-video-platform`, label: "补充平台和镜头偏好", value: "video:bridge:platform", rationale: "先补足平台、风格和目标，有助于后续镜头语言统一。" },
        ],
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "video-bridge-analyze",
      };
    case "角色与场景":
      return {
        id: `video-bridge-entities-${snapshot.projectId}`,
        title: `《${snapshot.title}》的角色与场景资产可以继续收口。`,
        description: sceneCount ? `已拆解 ${sceneCount} 个镜头。` : "先补齐角色与场景资产。",
        options: [
          { id: `${snapshot.projectId}-video-entities-refresh`, label: "先整理角色和场景资产", value: "video:bridge:entities", rationale: "优先收口角色与场景设定，后续分镜更稳。" },
          { id: `${snapshot.projectId}-video-storyboard`, label: storyboardedSceneCount ? "继续整理分镜批次" : "开始整理分镜批次", value: "video:bridge:storyboard", rationale: "把已有镜头推进到分镜层，保持首页单链路生产。" },
        ],
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "video-bridge-entities",
      };
    case "分镜批次":
      return {
        id: `video-bridge-storyboard-${snapshot.projectId}`,
        title: `《${snapshot.title}》的分镜批次可以继续推进。`,
        description: storyboardedSceneCount ? `已有 ${storyboardedSceneCount} 条分镜结果。` : "先继续整理分镜批次。",
        options: [
          { id: `${snapshot.projectId}-video-storyboard-next`, label: storyboardedSceneCount ? "继续补齐剩余分镜批次" : "继续生成分镜批次", value: "video:bridge:storyboard", rationale: "先补齐分镜，让后续提示词和出片建立在完整镜头语言上。" },
          { id: `${snapshot.projectId}-video-shot-packets`, label: shotPacketCount ? "更新镜头指令包" : "编译镜头指令包", value: "video:bridge:shots", rationale: "把分镜压成可复用的 shot packet，方便继续生成提示词。" },
        ],
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "video-bridge-storyboard",
      };
    case "镜头指令包":
      return {
        id: `video-bridge-shots-${snapshot.projectId}`,
        title: `《${snapshot.title}》的镜头指令包已经可用。`,
        description: shotPacketCount ? `已编译 ${shotPacketCount} 个镜头指令包。` : "先编译 shot packet。",
        options: [
          { id: `${snapshot.projectId}-video-shot-review`, label: shotPacketCount ? `复核 ${shotPacketCount} 个镜头指令包` : "编译镜头指令包", value: "video:bridge:shots", rationale: "先把镜头指令包收口，避免后续提示词批次反复返工。" },
          { id: `${snapshot.projectId}-video-prompts`, label: "准备视频提示词批次", value: "video:bridge:prompts", rationale: "直接把镜头指令包推进到提示词批次，准备进入第一轮出片。" },
        ],
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "video-bridge-shots",
      };
    default:
      return null;
  }
}

export function buildVideoGenerationQuestion(snapshot: ConversationProjectSnapshot, project: PersistedVideoProject | null | undefined): ComposerQuestion | null {
  const candidates = listGeneratableVideoScenes(project);
  if (!candidates.length) return null;
  const failedScenes = listFailedVideoScenes(project);
  const firstBatchSize = Math.min(3, candidates.length);
  const options = [
    { id: `${snapshot.projectId}-video-generate-first`, label: candidates.length === 1 ? `直接生成 ${formatSceneOptionLabel(candidates[0])}` : `先生成前 ${firstBatchSize} 条镜头`, value: "video:generate:first", rationale: candidates.length === 1 ? "直接把当前最靠前的镜头送去出片，继续留在首页等待结果。" : `优先验证最靠前的 ${firstBatchSize} 条镜头，保持第一轮出片节奏。` },
    ...(failedScenes.length ? [{ id: `${snapshot.projectId}-video-generate-failed`, label: `补发 ${Math.min(failedScenes.length, 3)} 条失败镜头`, value: "video:generate:failed", rationale: "先把失败镜头回补一轮，避免卡住后续审阅。" }] : []),
    ...(candidates.length > 1 ? [{ id: `${snapshot.projectId}-video-generate-list`, label: "指定镜头出片", value: "video:generate:list", rationale: "先点选具体镜头，再只发这一小批。" }] : []),
  ];
  return { id: `video-generate-${snapshot.projectId}`, title: `《${snapshot.title}》的视频提示词已就绪，先怎么开始出片？`, description: `当前可直接出片 ${candidates.length} 条镜头。`, options, allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "video-generate" };
}

export function buildVideoGenerationSceneListQuestion(snapshot: ConversationProjectSnapshot, project: PersistedVideoProject | null | undefined): ComposerQuestion | null {
  const candidates = listGeneratableVideoScenes(project);
  if (!candidates.length) return null;
  return { id: `video-generate-list-${snapshot.projectId}`, title: `先发《${snapshot.title}》里的哪条镜头？`, description: "只提交你选中的镜头。", options: candidates.slice(0, 5).map((scene) => ({ id: scene.id, label: formatSceneOptionLabel(scene), value: `video:generate:scene:${scene.id}`, rationale: summarizeSceneOption(scene) })), allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "video-generate-list" };
}

export function buildVideoRefreshQuestion(snapshot: ConversationProjectSnapshot, project: PersistedVideoProject | null | undefined): ComposerQuestion | null {
  const runningScenes = listRunningVideoScenes(project);
  if (!runningScenes.length) return null;
  const completedScenes = listCompletedVideoScenes(project);
  const options = [
    { id: `${snapshot.projectId}-video-refresh-all`, label: runningScenes.length === 1 ? `刷新 ${formatSceneOptionLabel(runningScenes[0])}` : "刷新全部进行中镜头", value: "video:refresh:all", rationale: runningScenes.length === 1 ? "回收这一条镜头的最新状态，看是否已经能进入审阅。" : `当前有 ${runningScenes.length} 条镜头在后台处理中，先统一刷新结果。` },
    ...(runningScenes.length > 1 ? [{ id: `${snapshot.projectId}-video-refresh-list`, label: "指定镜头查看结果", value: "video:refresh:list", rationale: "只查看某一条镜头的最新结果，减少打断。" }] : []),
    ...(completedScenes.length ? [{ id: `${snapshot.projectId}-video-review-generated`, label: `检查已生成的 ${completedScenes.length} 条视频资产`, value: "video:review:generated", rationale: "直接切到首页内的审阅动作，不再跳去别的工作区。" }] : []),
  ];
  return { id: `video-refresh-${snapshot.projectId}`, title: `《${snapshot.title}》已有镜头在生成中，下一步怎么查结果？`, description: `后台处理中 ${runningScenes.length} 条。`, options, allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "video-refresh" };
}

export function buildVideoRefreshSceneListQuestion(snapshot: ConversationProjectSnapshot, project: PersistedVideoProject | null | undefined): ComposerQuestion | null {
  const runningScenes = listRunningVideoScenes(project);
  if (!runningScenes.length) return null;
  return { id: `video-refresh-list-${snapshot.projectId}`, title: `先看《${snapshot.title}》里的哪条镜头结果？`, description: "只轮询你选中的镜头。", options: runningScenes.slice(0, 5).map((scene) => ({ id: scene.id, label: formatSceneOptionLabel(scene), value: `video:refresh:scene:${scene.id}`, rationale: summarizeSceneOption(scene) })), allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "video-refresh-list" };
}

export function buildVideoContinuationQuestion(snapshot: ConversationProjectSnapshot, project: PersistedVideoProject | null | undefined): ComposerQuestion | null {
  if (snapshot.projectKind !== "video") return null;
  const bridgeQuestion = buildVideoBridgeQuestion(snapshot, project);
  if (bridgeQuestion) return bridgeQuestion;
  if (snapshot.derivedStage === "视频提示词") return buildVideoGenerationQuestion(snapshot, project);
  if (snapshot.derivedStage === "生成中") return buildVideoRefreshQuestion(snapshot, project);
  return null;
}

export function buildReviewListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const reviewQueue = listActionableReviewItems(snapshot);
  if (!reviewQueue.length) return null;
  return { id: `review-list-${snapshot.projectId}`, title: `先处理《${snapshot.title}》里的哪条待审阅项？`, description: "选中后我会继续给出通过或重做动作，也可以直接输入自定义修订要求。", options: reviewQueue.slice(0, 5).map((item) => ({ id: item.id, label: item.title, value: `review:item:${item.id}`, rationale: item.summary })), allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "review-item-list" };
}

export function buildReviewDecisionQuestion(snapshot: ConversationProjectSnapshot, reviewId: string): ComposerQuestion | null {
  const item = findReviewItem(snapshot, reviewId);
  if (!item) return null;
  return { id: `review-item-${snapshot.projectId}-${reviewId}`, title: `《${item.title}》这条素材怎么处理？`, description: item.summary, options: [{ id: `${reviewId}-approve`, label: "通过这条素材", value: `review:item-approve:${reviewId}`, rationale: "确认这条素材已经可用，直接保留下来。" }, { id: `${reviewId}-redo`, label: "标记这条重做", value: `review:item-redo:${reviewId}`, rationale: "保留当前判断，但把这条镜头退回重做。" }], allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "review-item-decision" };
}

export function listUnlockedCharacterCards(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.characterStateCards?.filter((card) => card.status !== "locked") ?? [];
}

export function findCharacterCard(snapshot: ConversationProjectSnapshot, cardId: string) {
  return snapshot.memory?.characterStateCards?.find((card) => card.id === cardId) ?? null;
}

export function buildCharacterCardQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const cards = listUnlockedCharacterCards(snapshot);
  if (!cards.length) return null;
  const nextCard = cards[0];
  return { id: `script-character-${snapshot.projectId}`, title: `《${snapshot.title}》还有 ${cards.length} 张角色状态卡待收口。`, description: nextCard ? `建议先锁定 ${nextCard.name}。` : "也可以直接输入要求。", options: [{ id: `${snapshot.projectId}-character-next`, label: nextCard ? `锁定 ${nextCard.name}` : "锁定下一张角色卡", value: "script:character-lock-next", rationale: "先锁定最关键的角色状态卡，保持人物关系稳定。" }, { id: `${snapshot.projectId}-character-list`, label: "逐张检查角色卡", value: "script:character-list", rationale: "展开逐张入口，再决定锁定或继续完善。" }], allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-character" };
}

export function buildCharacterCardListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const cards = listUnlockedCharacterCards(snapshot);
  if (!cards.length) return null;
  return { id: `script-character-list-${snapshot.projectId}`, title: `先处理《${snapshot.title}》里的哪张角色状态卡？`, description: "选中后可直接锁定或继续深化。", options: cards.slice(0, 5).map((card) => ({ id: card.id, label: card.name, value: `script:character-item:${card.id}`, rationale: `${card.role} · ${card.coreConflict}` })), allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-character-list" };
}

export function buildCharacterCardDecisionQuestion(snapshot: ConversationProjectSnapshot, cardId: string): ComposerQuestion | null {
  const card = findCharacterCard(snapshot, cardId);
  if (!card) return null;
  return { id: `script-character-item-${snapshot.projectId}-${cardId}`, title: `《${card.name}》这张角色状态卡怎么处理？`, description: `${card.coreConflict} / 目标：${card.desire}`, options: [{ id: `${cardId}-lock`, label: "锁定这张角色卡", value: `script:character-lock:${cardId}`, rationale: "确认这张角色卡已经稳定，后续剧情按它推进。" }, { id: `${cardId}-refine`, label: "继续深化这个角色", value: `script:character-refine:${cardId}`, rationale: "继续围绕这张角色卡补充人物动机、冲突和关系。" }], allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-character-decision" };
}

export function listPendingCompliancePackets(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.complianceRevisionPackets?.filter((item) => item.status !== "resolved") ?? [];
}

export function listUnlockedBeatPackets(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.storyBeatPackets?.filter((item) => item.status !== "locked") ?? [];
}

export function findCompliancePacket(snapshot: ConversationProjectSnapshot, packetId: string) {
  return snapshot.memory?.complianceRevisionPackets?.find((item) => item.id === packetId) ?? null;
}

export function findBeatPacket(snapshot: ConversationProjectSnapshot, packetId: string) {
  return snapshot.memory?.storyBeatPackets?.find((item) => item.id === packetId) ?? null;
}

export function findRecommendedAction(snapshot: ConversationProjectSnapshot, predicate: (action: string) => boolean) {
  return snapshot.recommendedActions.find((action) => predicate(action)) ?? null;
}

export function extractEpisodeNumberFromAction(action: string | null | undefined): number | null {
  if (!action) return null;
  const match = action.match(/第\s*(\d+)\s*集/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildComplianceQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const packets = listPendingCompliancePackets(snapshot);
  if (!packets.length) return null;
  const highRiskCount = packets.filter((packet) => packet.riskLevel === "high").length;
  return { id: `script-compliance-${snapshot.projectId}`, title: `《${snapshot.title}》还有 ${packets.length} 条合规修订包待处理。`, description: highRiskCount ? `其中 ${highRiskCount} 条为高风险。` : "也可以直接输入修订要求。", options: [{ id: `${snapshot.projectId}-compliance-high`, label: highRiskCount ? "先处理高风险项" : "逐条处理修订包", value: highRiskCount ? "script:compliance-resolve-high" : "script:compliance-list", rationale: highRiskCount ? "先把高风险项收口，再继续后续导出。" : "先展开待处理修订包，再逐条确认。" }, { id: `${snapshot.projectId}-compliance-list`, label: "逐条处理修订包", value: "script:compliance-list", rationale: "展开逐条处理入口，保留首页单会话体验。" }, { id: `${snapshot.projectId}-compliance-rerun`, label: "重新跑合规审查", value: "script:compliance-rerun", rationale: "用当前最新正文重新生成一轮审查意见。" }], allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-compliance" };
}

export function buildComplianceListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const packets = listPendingCompliancePackets(snapshot);
  if (!packets.length) return null;
  return { id: `script-compliance-list-${snapshot.projectId}`, title: `先处理《${snapshot.title}》里的哪条修订包？`, description: "选中后可直接处理或继续改写。", options: packets.slice(0, 5).map((packet) => ({ id: packet.id, label: packet.issueTitle, value: `script:compliance-item:${packet.id}`, rationale: `风险：${packet.riskLevel} · ${packet.recommendation}` })), allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-compliance-list" };
}

export function buildComplianceDecisionQuestion(snapshot: ConversationProjectSnapshot, packetId: string): ComposerQuestion | null {
  const packet = findCompliancePacket(snapshot, packetId);
  if (!packet) return null;
  return { id: `script-compliance-item-${snapshot.projectId}-${packetId}`, title: `《${packet.issueTitle}》这条修订包怎么处理？`, description: packet.recommendation, options: [{ id: `${packetId}-resolve`, label: "标记已处理", value: `script:compliance-resolve:${packetId}`, rationale: "确认这条修订已经落地，不再反复提示。" }, { id: `${packetId}-rewrite`, label: "继续按这条改写", value: `script:compliance-rewrite:${packetId}`, rationale: "让 Agent 继续围绕这条修订推进文本改写。" }], allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-compliance-decision" };
}

export function buildBeatPacketQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const packets = listUnlockedBeatPackets(snapshot);
  if (!packets.length) return null;
  const nextPacket = packets[0];
  return { id: `script-beat-${snapshot.projectId}`, title: `《${snapshot.title}》还有 ${packets.length} 条剧情 beat 可以继续收口。`, description: nextPacket ? `建议先处理第 ${nextPacket.episodeNumber} 集。` : "也可以直接输入推进要求。", options: [{ id: `${snapshot.projectId}-beat-next`, label: nextPacket ? `锁定第 ${nextPacket.episodeNumber} 集 beat` : "锁定下一条 beat", value: "script:beat-lock-next", rationale: "先把最靠前的一条剧情 beat 收口，保持节奏连续。" }, { id: `${snapshot.projectId}-beat-drafted`, label: "批量锁定已成型 beat", value: "script:beat-lock-drafted", rationale: "把已有细纲支撑的 beat 先锁住，减少反复。" }, { id: `${snapshot.projectId}-beat-list`, label: "逐条检查剧情 beat", value: "script:beat-list", rationale: "展开逐条入口，再决定锁定或继续扩写。" }], allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-beat" };
}

export function buildBeatPacketListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const packets = listUnlockedBeatPackets(snapshot);
  if (!packets.length) return null;
  return { id: `script-beat-list-${snapshot.projectId}`, title: `先处理《${snapshot.title}》里的哪条剧情 beat？`, description: "选中后可直接锁定或继续写。", options: packets.slice(0, 5).map((packet) => ({ id: packet.id, label: `第 ${packet.episodeNumber} 集 · ${packet.title}`, value: `script:beat-item:${packet.id}`, rationale: packet.beatSummary })), allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-beat-list" };
}

export function buildBeatPacketDecisionQuestion(snapshot: ConversationProjectSnapshot, packetId: string): ComposerQuestion | null {
  const packet = findBeatPacket(snapshot, packetId);
  if (!packet) return null;
  return { id: `script-beat-item-${snapshot.projectId}-${packetId}`, title: `第 ${packet.episodeNumber} 集 · ${packet.title} 这条 beat 怎么处理？`, description: packet.beatSummary, options: [{ id: `${packetId}-lock`, label: "锁定这条 beat", value: `script:beat-lock:${packetId}`, rationale: "确认这条剧情节点已经成型，后续按它推进。" }, { id: `${packetId}-write`, label: `继续写第 ${packet.episodeNumber} 集`, value: `script:beat-write:${packet.episodeNumber}`, rationale: "直接用当前 beat 去推进这一集正文。" }], allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-beat-decision" };
}

export function buildEpisodeWorkflowQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  if (snapshot.projectKind === "video" || snapshot.derivedStage !== "剧本撰写") return null;
  const nextEpisodeAction = findRecommendedAction(snapshot, (action) => /^继续(?:生成|写)第\s*\d+\s*集$/.test(action) || action === "继续生成下一集");
  const reviewAction = findRecommendedAction(snapshot, (action) => action.includes("批量质检"));
  const complianceAction = findRecommendedAction(snapshot, (action) => action.includes("合规审查"));
  if (!nextEpisodeAction && !reviewAction && !complianceAction) return null;
  const nextEpisodeNumber = extractEpisodeNumberFromAction(nextEpisodeAction);
  return { id: `script-episode-${snapshot.projectId}`, title: `《${snapshot.title}》已经进入正文推进阶段。`, description: nextEpisodeNumber ? `建议先接上第 ${nextEpisodeNumber} 集。` : "可继续写下一集、先质检，或直接合规审查。", options: [nextEpisodeAction ? { id: `${snapshot.projectId}-episode-next`, label: nextEpisodeAction, value: `script:episode-generate:${nextEpisodeNumber ?? "auto"}`, rationale: nextEpisodeNumber ? `继续补齐第 ${nextEpisodeNumber} 集正文，让首页会话保持单链路推进。` : "继续沿着当前目录补写下一集正文。" } : null, reviewAction ? { id: `${snapshot.projectId}-episode-review`, label: reviewAction, value: "script:episode-review", rationale: "先做一轮批量质检，把连续性、节奏和角色口吻风险集中找出来。" } : null, complianceAction ? { id: `${snapshot.projectId}-episode-compliance`, label: complianceAction, value: "script:episode-compliance", rationale: "直接把当前正文送入合规审查，收口风险点并准备导出。" } : null].filter((option): option is NonNullable<typeof option> => Boolean(option)), allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-episode" };
}

export function buildExportWorkflowQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  if (snapshot.projectKind === "video" || snapshot.derivedStage !== "导出与出片") return null;
  const exportAction = findRecommendedAction(snapshot, (action) => action.includes("导出整合文档") || action.includes("修改导出稿"));
  const videoAction = findRecommendedAction(snapshot, (action) => action.includes("视频工作流"));
  const patchAction = findRecommendedAction(snapshot, (action) => action.includes("补写"));
  if (!exportAction && !videoAction && !patchAction) return null;
  const hasExportArtifact = snapshot.artifacts.some((artifact) => artifact.kind === "export");
  return { id: `script-export-${snapshot.projectId}`, title: `《${snapshot.title}》已经进入导出与出片阶段。`, description: hasExportArtifact ? "导出稿已在当前会话里。" : "可先导出，再接视频工作流。", options: [exportAction ? { id: `${snapshot.projectId}-export-document`, label: exportAction, value: exportAction.includes("修改导出稿") ? "script:export-refine" : "script:export-document", rationale: exportAction.includes("修改导出稿") ? "继续围绕当前导出稿润色结构、语气和交付格式。" : "先整理一份完整导出稿，方便后续交付和出片。" } : null, videoAction ? { id: `${snapshot.projectId}-export-video`, label: videoAction, value: "script:export-video", rationale: "把当前剧本直接桥接到首页视频工作流，不再跳出当前会话。" } : null, patchAction ? { id: `${snapshot.projectId}-export-patch`, label: patchAction, value: "script:export-patch", rationale: "先定位缺失章节或集数，再决定补写哪一块。" } : null].filter((option): option is NonNullable<typeof option> => Boolean(option)), allowCustomInput: true, submissionMode: "immediate", multiSelect: false, stepIndex: 0, totalSteps: 1, answerKey: "script-export" };
}

export function buildScriptPacketQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  return buildComplianceQuestion(snapshot) ?? buildCharacterCardQuestion(snapshot) ?? buildBeatPacketQuestion(snapshot) ?? buildEpisodeWorkflowQuestion(snapshot) ?? buildExportWorkflowQuestion(snapshot);
}

export const brief = (snapshot: ConversationProjectSnapshot) =>
  [
    `已恢复项目《${snapshot.title}》。`,
    `当前阶段：${snapshot.derivedStage}`,
    `当前目标：${snapshot.currentObjective}`,
    summarizeRecoveryArtifacts(snapshot),
    snapshot.agentSummary,
    snapshot.recommendedActions.length ? `建议下一步：\n${snapshot.recommendedActions.slice(0, 3).map((action) => `- ${action}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

export const recQuestion = (snapshot: ConversationProjectSnapshot, videoProject?: PersistedVideoProject | null): ComposerQuestion | null =>
  buildReviewQuestion(snapshot) ??
  buildVideoRepairQuestion(snapshot) ??
  buildVideoContinuationQuestion(snapshot, videoProject) ??
  buildScriptPacketQuestion(snapshot) ??
  (snapshot.recommendedActions.length
    ? {
        id: `r-${snapshot.projectId}`,
        title: `我已分析《${snapshot.title}》的当前状态，下一步先推进哪一块？`,
        description: `${summarizeRecoveryArtifacts(snapshot)} 你也可以直接输入自定义指令。`,
        options: snapshot.recommendedActions.slice(0, 3).map((action, index) => ({
          id: `${snapshot.projectId}-${index}`,
          label: action,
          value: action,
          rationale: buildRecoveryActionRationale(snapshot, action, index),
        })),
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "recovery",
      }
    : null);

export function isVideoIntentPrompt(prompt: string, snapshot?: ConversationProjectSnapshot | null): boolean {
  if (snapshot?.projectKind === "video") return true;
  const lowered = prompt.trim().toLowerCase();
  if (!lowered) return false;
  return ["视频", "分镜", "镜头", "出片", "提示词批次", "seedance", "dreamina", "即梦", "text2video", "image2video"].some((keyword) => lowered.includes(keyword));
}

export function buildDreaminaCapabilityOverlay(message?: string): string {
  const capabilitySummary = message?.trim() || "已检测到本机 Dreamina CLI 登录态";
  return [
    "当前运行环境附加能力：",
    `${capabilitySummary}，可直接使用官方 Dreamina CLI 继续 Seedance 2.0 / Seedance 2.0 Fast 视频生成。`,
    "当用户进入视频工作流、镜头出片、提示词批次或资产续接时，你应把这项能力纳入分析，并优先给出基于当前本机能力可直接执行的建议。",
  ].join("\n");
}
