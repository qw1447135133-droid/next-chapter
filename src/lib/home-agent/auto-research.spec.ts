import { describe, expect, it } from "vitest";
import { buildResearchFollowupQuestion } from "./auto-research";
import type { ConversationProjectSnapshot } from "./types";

function createSnapshot(projectKind: ConversationProjectSnapshot["projectKind"]): ConversationProjectSnapshot {
  return {
    projectId: `${projectKind}-1`,
    projectKind,
    title: `${projectKind}-project`,
    currentObjective: "推进下一步",
    derivedStage: "research",
    agentSummary: "已有阶段摘要",
    recommendedActions: [],
    artifacts: [],
  };
}

describe("buildResearchFollowupQuestion", () => {
  it("returns script-specific follow-up actions by default", () => {
    const question = buildResearchFollowupQuestion(
      createSnapshot("script"),
      ["目标市场", "风格路线"],
      ["task-a", "task-b"],
    );

    expect(question?.options.map((option) => option.label)).toEqual([
      "先汇总结论",
      "整理立项方案",
      "推进角色设计",
    ]);
  });

  it("returns adaptation-specific follow-up actions", () => {
    const question = buildResearchFollowupQuestion(
      createSnapshot("adaptation"),
      ["改编路线", "角色重塑"],
      ["task-a", "task-b"],
    );

    expect(question?.options.map((option) => option.label)).toEqual([
      "先汇总结论",
      "锁定改编路线",
      "重塑人物关系",
    ]);
  });

  it("returns video-specific follow-up actions", () => {
    const question = buildResearchFollowupQuestion(
      createSnapshot("video"),
      ["平台包装", "视觉方向"],
      ["task-a", "task-b"],
    );

    expect(question?.options.map((option) => option.label)).toEqual([
      "先汇总结论",
      "锁定包装方向",
      "直接准备出片",
    ]);
  });
});
