import { describe, expect, it } from "vitest";
import { runWorkflowAction } from "./workflow-actions";
import type { StudioRuntimeState } from "./types";

function createRuntime(): StudioRuntimeState {
  return {
    sessionId: "session-1",
    currentProjectSnapshot: {
      projectId: "project-1",
      projectKind: "script",
      title: "契约婚姻反转录",
      currentObjective: "继续完善创意方案。",
      derivedStage: "创意方案",
      agentSummary: "已整理创意方案和角色设定，建议优先进入分集目录。",
      recommendedActions: ["生成分集目录", "强化角色冲突", "补充人物口吻要求"],
      artifacts: [
        {
          id: "artifact-1",
          kind: "plan",
          label: "创意方案",
          summary: "女主与继承人的契约婚姻进入反转阶段。",
          updatedAt: "2026-04-03T00:00:00.000Z",
        },
      ],
    },
    currentDramaProject: null,
    currentVideoProject: null,
    currentSetupDraft: null,
    skillDrafts: [],
    maintenanceReports: [],
    recentProjects: [],
    recentMessageSummary: "assistant: 继续保留第 2 集的张力。",
  };
}

describe("workflow-actions get_context", () => {
  it("returns an agent-readable structured summary instead of raw JSON", async () => {
    const result = await runWorkflowAction("get_context", {}, createRuntime());

    expect(result.summary).toContain("当前项目：契约婚姻反转录 / script / 创意方案");
    expect(result.summary).toContain("推荐动作：");
    expect(result.summary).toContain("创意方案: 女主与继承人的契约婚姻进入反转阶段。");
    expect(result.summary).toContain("最近会话摘要：assistant: 继续保留第 2 集的张力。");
  });
});
