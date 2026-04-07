import { describe, expect, it, vi } from "vitest";
import { createScriptProjectChoiceHandler } from "./home-agent-script-choice-handlers";
import type { ConversationProjectSnapshot } from "@/lib/home-agent/types";

function createSnapshot(
  overrides: Partial<ConversationProjectSnapshot> = {},
): ConversationProjectSnapshot {
  return {
    projectId: "script-project-1",
    projectKind: "script",
    title: "测试项目",
    currentObjective: "继续推进",
    derivedStage: "创意方案",
    agentSummary: "测试摘要",
    recommendedActions: ["生成创作方案"],
    artifacts: [],
    ...overrides,
  };
}

describe("createScriptProjectChoiceHandler", () => {
  it("routes generic creative-plan recovery action into the workflow shortcut", () => {
    const runWorkflowActionShortcut = vi.fn();
    const send = vi.fn();
    const showChoicePopover = vi.fn();

    const handler = createScriptProjectChoiceHandler({
      runWorkflowActionShortcut,
      send,
      showChoicePopover,
      listUnlockedCharacterCards: () => [],
      buildCharacterCardListQuestion: () => null,
      findCharacterCard: () => undefined,
      buildCharacterCardDecisionQuestion: () => null,
      listPendingCompliancePackets: () => [],
      buildComplianceListQuestion: () => null,
      findCompliancePacket: () => undefined,
      buildComplianceDecisionQuestion: () => null,
      listUnlockedBeatPackets: () => [],
      buildBeatPacketListQuestion: () => null,
      findBeatPacket: () => undefined,
      buildBeatPacketDecisionQuestion: () => null,
    });

    const handled = handler(createSnapshot(), "生成创作方案", "生成创作方案");

    expect(handled).toBe(true);
    expect(runWorkflowActionShortcut).toHaveBeenCalledWith(
      "generate_creative_plan",
      { projectId: "script-project-1" },
      "生成创作方案",
    );
    expect(send).not.toHaveBeenCalled();
    expect(showChoicePopover).not.toHaveBeenCalled();
  });

  it("routes role-development recovery actions into the correct workflow per project kind", () => {
    const runWorkflowActionShortcut = vi.fn();

    const handler = createScriptProjectChoiceHandler({
      runWorkflowActionShortcut,
      send: vi.fn(),
      showChoicePopover: vi.fn(),
      listUnlockedCharacterCards: () => [],
      buildCharacterCardListQuestion: () => null,
      findCharacterCard: () => undefined,
      buildCharacterCardDecisionQuestion: () => null,
      listPendingCompliancePackets: () => [],
      buildComplianceListQuestion: () => null,
      findCompliancePacket: () => undefined,
      buildComplianceDecisionQuestion: () => null,
      listUnlockedBeatPackets: () => [],
      buildBeatPacketListQuestion: () => null,
      findBeatPacket: () => undefined,
      buildBeatPacketDecisionQuestion: () => null,
    });

    handler(createSnapshot({ projectKind: "script" }), "进入角色开发", "进入角色开发");
    handler(
      createSnapshot({ projectId: "adaptation-project", projectKind: "adaptation" }),
      "补充人物冲突",
      "补充人物冲突",
    );

    expect(runWorkflowActionShortcut).toHaveBeenNthCalledWith(
      1,
      "generate_characters",
      { projectId: "script-project-1" },
      "进入角色开发",
    );
    expect(runWorkflowActionShortcut).toHaveBeenNthCalledWith(
      2,
      "generate_character_transform",
      { projectId: "adaptation-project" },
      "补充人物冲突",
    );
  });
});
