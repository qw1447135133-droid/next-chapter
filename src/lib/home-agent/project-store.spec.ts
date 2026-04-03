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
});
