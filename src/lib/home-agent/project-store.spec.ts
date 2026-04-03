import { beforeEach, describe, expect, it } from "vitest";
import {
  listRecentConversationSnapshots,
  listStoredDramaProjects,
} from "./project-store";

const DRAMA_PROJECTS_KEY = "storyforge_drama_projects";

describe("project-store legacy compatibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes legacy drama projects with missing workflow arrays", () => {
    localStorage.setItem(
      DRAMA_PROJECTS_KEY,
      JSON.stringify([
        {
          id: "legacy-drama-1",
          dramaTitle: "契约婚姻反转录",
          currentStep: "creative-plan",
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          setup: {
            genres: ["都市言情"],
            audience: "女频",
            tone: "甜虐",
            ending: "HE",
            totalEpisodes: 40,
            targetMarket: "cn",
          },
        },
      ]),
    );

    const [project] = listStoredDramaProjects();

    expect(project.directory).toEqual([]);
    expect(project.episodes).toEqual([]);
    expect(project.creativePlan).toBe("");
    expect(project.characters).toBe("");
    expect(project.directoryRaw).toBe("");
  });

  it("creates recent conversation snapshots from partial legacy drama projects", async () => {
    localStorage.setItem(
      DRAMA_PROJECTS_KEY,
      JSON.stringify([
        {
          id: "legacy-drama-2",
          dramaTitle: "契约婚姻反转录",
          currentStep: "creative-plan",
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          setup: {
            genres: ["都市言情"],
            audience: "女频",
            tone: "甜虐",
            ending: "HE",
            totalEpisodes: 40,
            targetMarket: "cn",
            creativeInput: "替父还债的女主和冷面继承人签下契约婚姻。",
          },
        },
      ]),
    );

    const snapshots = await listRecentConversationSnapshots();

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.title).toBe("契约婚姻反转录");
    expect(snapshots[0]?.projectKind).toBe("script");
    expect(snapshots[0]?.recommendedActions.length).toBeGreaterThan(0);
    expect(snapshots[0]?.artifacts.length).toBeGreaterThan(0);
  });

  it("derives recovery recommendations from missing setup fields instead of generic stage text", async () => {
    localStorage.setItem(
      DRAMA_PROJECTS_KEY,
      JSON.stringify([
        {
          id: "drama-missing-setup",
          dramaTitle: "未完成立项",
          currentStep: "setup",
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          setup: {
            genres: [],
            audience: "",
            tone: "",
            ending: "HE",
            totalEpisodes: 0,
            targetMarket: "",
          },
        },
      ]),
    );

    const snapshots = await listRecentConversationSnapshots();

    expect(snapshots[0]?.recommendedActions[0]).toContain("补齐");
    expect(snapshots[0]?.recommendedActions.join(" ")).toContain("目标市场");
  });

  it("derives the next episode recommendation from actual completed progress", async () => {
    localStorage.setItem(
      DRAMA_PROJECTS_KEY,
      JSON.stringify([
        {
          id: "drama-episodes-1",
          dramaTitle: "更新中的项目",
          currentStep: "episodes",
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          setup: {
            genres: ["都市言情"],
            audience: "女频",
            tone: "甜虐",
            ending: "HE",
            totalEpisodes: 40,
            targetMarket: "cn",
          },
          directory: [
            { number: 1, title: "第一集", summary: "开场", outline: "已完成细纲" },
            { number: 2, title: "第二集", summary: "升级", outline: "已完成细纲" },
            { number: 3, title: "第三集", summary: "反转", outline: "已完成细纲" },
          ],
          episodes: [
            { number: 1, title: "第一集", content: "正文 1" },
            { number: 2, title: "第二集", content: "正文 2" },
          ],
        },
      ]),
    );

    const snapshots = await listRecentConversationSnapshots();

    expect(snapshots[0]?.recommendedActions[0]).toContain("第 3 集");
    expect(snapshots[0]?.agentSummary).toContain("建议下一步先");
  });
});
