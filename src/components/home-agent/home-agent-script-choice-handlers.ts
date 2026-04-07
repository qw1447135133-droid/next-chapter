import type { ComposerQuestion, ConversationProjectSnapshot } from "@/lib/home-agent/types";

type WorkflowShortcutRunner = (
  action: string,
  input: Record<string, unknown>,
  label: string,
) => void | Promise<void>;

type ShowChoicePopover = (
  label: string,
  assistantMessage: string,
  nextQuestion: ComposerQuestion,
) => void;

type CharacterCard = {
  id: string;
  name: string;
  role: string;
  coreConflict: string;
  desire: string;
  riskNote: string;
  relationshipAxis: string[];
};

type CompliancePacket = {
  id: string;
  issueTitle: string;
  riskLevel: string;
  recommendation: string;
};

type BeatPacket = {
  id: string;
  title: string;
  episodeNumber: number;
  status: string;
};

type ScriptChoiceHandler = (
  snapshot: ConversationProjectSnapshot,
  value: string,
  label: string,
) => boolean;

type ScriptChoiceHandlerDeps = {
  runWorkflowActionShortcut: WorkflowShortcutRunner;
  send: (prompt: string, label: string) => void | Promise<void>;
  showChoicePopover: ShowChoicePopover;
  listUnlockedCharacterCards: (snapshot: ConversationProjectSnapshot) => CharacterCard[];
  buildCharacterCardListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  findCharacterCard: (snapshot: ConversationProjectSnapshot, cardId: string) => CharacterCard | undefined;
  buildCharacterCardDecisionQuestion: (
    snapshot: ConversationProjectSnapshot,
    cardId: string,
  ) => ComposerQuestion | null;
  listPendingCompliancePackets: (snapshot: ConversationProjectSnapshot) => CompliancePacket[];
  buildComplianceListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  findCompliancePacket: (
    snapshot: ConversationProjectSnapshot,
    packetId: string,
  ) => CompliancePacket | undefined;
  buildComplianceDecisionQuestion: (
    snapshot: ConversationProjectSnapshot,
    packetId: string,
  ) => ComposerQuestion | null;
  listUnlockedBeatPackets: (snapshot: ConversationProjectSnapshot) => BeatPacket[];
  buildBeatPacketListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  findBeatPacket: (snapshot: ConversationProjectSnapshot, packetId: string) => BeatPacket | undefined;
  buildBeatPacketDecisionQuestion: (
    snapshot: ConversationProjectSnapshot,
    packetId: string,
  ) => ComposerQuestion | null;
};

export function createScriptProjectChoiceHandler(deps: ScriptChoiceHandlerDeps): ScriptChoiceHandler {
  return (snapshot, value, label) => {
    if (snapshot.projectKind !== "script" && snapshot.projectKind !== "adaptation") {
      return false;
    }

    if (value === "生成创作方案") {
      void deps.runWorkflowActionShortcut(
        "generate_creative_plan",
        { projectId: snapshot.projectId },
        label,
      );
      return true;
    }

    if (value === "进入角色开发" || value === "继续角色设定" || value === "补充人物冲突") {
      void deps.runWorkflowActionShortcut(
        snapshot.projectKind === "adaptation" ? "generate_character_transform" : "generate_characters",
        { projectId: snapshot.projectId },
        label,
      );
      return true;
    }

    if (value.includes("分集目录")) {
      void deps.runWorkflowActionShortcut(
        "generate_directory",
        { projectId: snapshot.projectId },
        label,
      );
      return true;
    }

    if (value.includes("细纲")) {
      void deps.runWorkflowActionShortcut(
        "generate_outlines",
        { projectId: snapshot.projectId },
        label,
      );
      return true;
    }

    if (value.includes("合规审查")) {
      void deps.runWorkflowActionShortcut(
        "run_compliance_review",
        { projectId: snapshot.projectId },
        label,
      );
      return true;
    }

    if (value.includes("导出")) {
      void deps.runWorkflowActionShortcut(
        "export_project",
        { projectId: snapshot.projectId },
        label,
      );
      return true;
    }

    const episodeMatch = value.match(/第\s*(\d+)\s*集/);
    if (value.includes("正文") || value.includes("撰写") || episodeMatch) {
      const episodeNumber = episodeMatch ? Number(episodeMatch[1]) : undefined;
      void deps.runWorkflowActionShortcut(
        "generate_episode",
        {
          projectId: snapshot.projectId,
          ...(Number.isFinite(episodeNumber) ? { episodeNumber } : {}),
        },
        label,
      );
      return true;
    }

    if (value === "script:character-lock-next") {
      const nextCard = deps.listUnlockedCharacterCards(snapshot)[0];
      if (!nextCard) return true;

      void deps.runWorkflowActionShortcut(
        "lock_character_cards",
        { projectId: snapshot.projectId, targetIds: [nextCard.id] },
        label,
      );
      return true;
    }

    if (value === "script:character-list") {
      const nextQuestion = deps.buildCharacterCardListQuestion(snapshot);
      if (nextQuestion) {
        deps.showChoicePopover(label, "先选一张角色卡。", nextQuestion);
      }
      return true;
    }

    if (value.startsWith("script:character-item:")) {
      const cardId = value.replace("script:character-item:", "");
      const card = deps.findCharacterCard(snapshot, cardId);
      const nextQuestion = deps.buildCharacterCardDecisionQuestion(snapshot, cardId);
      if (!card || !nextQuestion) return true;

      deps.showChoicePopover(label, `已定位角色卡「${card.name}」，现在要锁定还是继续深化？`, nextQuestion);
      return true;
    }

    if (value.startsWith("script:character-lock:")) {
      const cardId = value.replace("script:character-lock:", "");
      void deps.runWorkflowActionShortcut(
        "lock_character_cards",
        { projectId: snapshot.projectId, targetIds: [cardId] },
        label,
      );
      return true;
    }

    if (value.startsWith("script:character-refine:")) {
      const cardId = value.replace("script:character-refine:", "");
      const card = deps.findCharacterCard(snapshot, cardId);
      if (!card) return true;

      void deps.send(
        `请继续深化角色「${card.name}」的状态卡。角色定位：${card.role}。核心冲突：${card.coreConflict}。目标：${card.desire}。风险：${card.riskNote}。关系轴：${card.relationshipAxis.join("、") || "待补充"}。`,
        label,
      );
      return true;
    }

    if (value === "script:compliance-resolve-high") {
      const targetIds = deps
        .listPendingCompliancePackets(snapshot)
        .filter((packet) => packet.riskLevel === "high")
        .map((packet) => packet.id);

      if (!targetIds.length) {
        const nextQuestion = deps.buildComplianceListQuestion(snapshot);
        if (nextQuestion) {
          deps.showChoicePopover(label, "当前没有高风险项，先看修订列表。", nextQuestion);
        }
        return true;
      }

      void deps.runWorkflowActionShortcut(
        "resolve_compliance_revisions",
        { projectId: snapshot.projectId, targetIds },
        label,
      );
      return true;
    }

    if (value === "script:compliance-list") {
      const nextQuestion = deps.buildComplianceListQuestion(snapshot);
      if (nextQuestion) {
        deps.showChoicePopover(label, "先选一条修订包。", nextQuestion);
      }
      return true;
    }

    if (value === "script:compliance-rerun") {
      void deps.runWorkflowActionShortcut("run_compliance_review", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value.startsWith("script:compliance-item:")) {
      const packetId = value.replace("script:compliance-item:", "");
      const packet = deps.findCompliancePacket(snapshot, packetId);
      const nextQuestion = deps.buildComplianceDecisionQuestion(snapshot, packetId);
      if (!packet || !nextQuestion) return true;

      deps.showChoicePopover(label, `已定位修订包「${packet.issueTitle}」，现在标记已处理还是继续改写？`, nextQuestion);
      return true;
    }

    if (value.startsWith("script:compliance-resolve:")) {
      const packetId = value.replace("script:compliance-resolve:", "");
      void deps.runWorkflowActionShortcut(
        "resolve_compliance_revisions",
        { projectId: snapshot.projectId, targetIds: [packetId] },
        label,
      );
      return true;
    }

    if (value.startsWith("script:compliance-rewrite:")) {
      const packetId = value.replace("script:compliance-rewrite:", "");
      const packet = deps.findCompliancePacket(snapshot, packetId);
      if (!packet) return true;

      void deps.send(
        `请根据这条合规修订继续改写当前项目：${packet.issueTitle}。风险等级：${packet.riskLevel}。建议：${packet.recommendation}`,
        label,
      );
      return true;
    }

    if (value === "script:beat-lock-next") {
      const nextPacket = deps.listUnlockedBeatPackets(snapshot)[0];
      if (!nextPacket) return true;

      void deps.runWorkflowActionShortcut(
        "lock_story_beats",
        { projectId: snapshot.projectId, targetIds: [nextPacket.id] },
        label,
      );
      return true;
    }

    if (value === "script:beat-lock-drafted") {
      const targetIds = deps
        .listUnlockedBeatPackets(snapshot)
        .filter((packet) => packet.status === "drafted")
        .map((packet) => packet.id);

      if (!targetIds.length) {
        const nextQuestion = deps.buildBeatPacketListQuestion(snapshot);
        if (nextQuestion) {
          deps.showChoicePopover(label, "当前没有已起草的情节 beat，先看剧情列表。", nextQuestion);
        }
        return true;
      }

      void deps.runWorkflowActionShortcut(
        "lock_story_beats",
        { projectId: snapshot.projectId, targetIds },
        label,
      );
      return true;
    }

    if (value === "script:beat-list") {
      const nextQuestion = deps.buildBeatPacketListQuestion(snapshot);
      if (nextQuestion) {
        deps.showChoicePopover(label, "先选一条剧情 beat。", nextQuestion);
      }
      return true;
    }

    if (value.startsWith("script:beat-item:")) {
      const packetId = value.replace("script:beat-item:", "");
      const packet = deps.findBeatPacket(snapshot, packetId);
      const nextQuestion = deps.buildBeatPacketDecisionQuestion(snapshot, packetId);
      if (!packet || !nextQuestion) return true;

      deps.showChoicePopover(
        label,
        `已定位第 ${packet.episodeNumber} 集 ${packet.title}，现在锁定还是继续写？`,
        nextQuestion,
      );
      return true;
    }

    if (value.startsWith("script:beat-lock:")) {
      const packetId = value.replace("script:beat-lock:", "");
      void deps.runWorkflowActionShortcut(
        "lock_story_beats",
        { projectId: snapshot.projectId, targetIds: [packetId] },
        label,
      );
      return true;
    }

    if (value.startsWith("script:beat-write:")) {
      const episodeNumber = Number(value.replace("script:beat-write:", ""));
      if (!Number.isFinite(episodeNumber)) return true;

      void deps.runWorkflowActionShortcut(
        "generate_episode",
        { projectId: snapshot.projectId, episodeNumber },
        label,
      );
      return true;
    }

    if (value.startsWith("script:episode-generate:")) {
      const rawEpisodeNumber = value.replace("script:episode-generate:", "");
      const episodeNumber = Number(rawEpisodeNumber);

      void deps.runWorkflowActionShortcut(
        "generate_episode",
        {
          projectId: snapshot.projectId,
          ...(Number.isFinite(episodeNumber) ? { episodeNumber } : {}),
        },
        label,
      );
      return true;
    }

    if (value === "script:episode-review") {
      void deps.send(
        `请基于《${snapshot.title}》当前已完成的分集正文做一轮批量质检，重点检查连续性、节奏、角色口吻和钩子强度，并给我一个可直接继续修改的清单。`,
        label,
      );
      return true;
    }

    if (value === "script:episode-compliance") {
      void deps.runWorkflowActionShortcut("run_compliance_review", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "script:export-document") {
      void deps.runWorkflowActionShortcut("export_project", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "script:export-refine") {
      void deps.send(
        `请继续润色《${snapshot.title}》当前导出稿，帮我统一格式、增强可读性，并保留后续可直接衔接视频出片的结构。`,
        label,
      );
      return true;
    }

    if (value === "script:export-video") {
      void deps.runWorkflowActionShortcut("prepare_video_generation", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "script:export-patch") {
      void deps.send(
        `请检查《${snapshot.title}》当前项目里的缺失章节或集数，并直接给我一个优先补写顺序和下一步建议。`,
        label,
      );
      return true;
    }

    return false;
  };
}
