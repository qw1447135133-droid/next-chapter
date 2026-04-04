import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioRuntimeState } from "@/lib/home-agent/types";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";

const createStoredVideoProject = vi.fn();
const loadStoredVideoProjectById = vi.fn();
const upsertStoredVideoProject = vi.fn(async (project: PersistedVideoProject) => ({
  ...project,
  updatedAt: "2026-04-03T01:00:00.000Z",
}));
const invokeFunction = vi.fn();

vi.mock("@/hooks/use-local-persistence", () => ({
  createStoredVideoProject,
  loadStoredVideoProjectById,
  upsertStoredVideoProject,
}));

vi.mock("@/lib/invoke-with-key", () => ({
  invokeFunction,
}));

const {
  generateVideoAssetsAction,
  refreshVideoAssetsAction,
} = await import("./video-workflow-service");

function createVideoProject(
  overrides: Partial<PersistedVideoProject> = {},
): PersistedVideoProject {
  return {
    id: "video-project-1",
    title: "夜雨追击预告片",
    script: "女主在雨夜回头看见追兵。",
    targetPlatform: "抖音",
    shotStyle: "电影感近景",
    outputGoal: "预告片",
    productionNotes: "",
    scenes: [
      {
        id: "scene-1",
        sceneNumber: 1,
        sceneName: "雨夜追击",
        description: "女主在雨夜回头看见追兵。",
        characters: ["沈昭"],
        dialogue: "",
        cameraDirection: "中景跟拍",
        duration: 5,
        storyboardUrl: "https://example.com/storyboard-1.jpg",
      },
    ],
    characters: [
      {
        id: "char-1",
        name: "沈昭",
        description: "红衣、清冷、警觉",
        imageUrl: "https://example.com/char-1.jpg",
        isAIGenerated: false,
        source: "auto",
      },
    ],
    sceneSettings: [
      {
        id: "setting-1",
        name: "雨夜长街",
        description: "冷色夜雨中的长街",
        imageUrl: "https://example.com/scene-1.jpg",
        isAIGenerated: false,
        source: "auto",
      },
    ],
    artStyle: "live-action",
    currentStep: 4,
    systemPrompt: "",
    analysisSummary: "视频提示词已经整理完成。",
    storyboardPlan: "镜头 1：雨夜追击",
    videoPromptBatch: "批次 1：雨夜追击",
    sourceProjectId: "drama-1",
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:30:00.000Z",
    styleLock: null,
    worldModel: null,
    assetManifest: null,
    shotPackets: [],
    reviewQueue: [],
    ...overrides,
  };
}

function createRuntime(
  project: PersistedVideoProject,
): StudioRuntimeState {
  return {
    sessionId: "session-video-1",
    currentProjectSnapshot: null,
    currentDramaProject: null,
    currentVideoProject: project,
    currentSetupDraft: null,
    skillDrafts: [],
    maintenanceReports: [],
    recentProjects: [],
    recentMessageSummary: "",
  };
}

describe("video-workflow-service execution", () => {
  beforeEach(() => {
    invokeFunction.mockReset();
    createStoredVideoProject.mockReset();
    loadStoredVideoProjectById.mockReset();
    upsertStoredVideoProject.mockClear();
    window.electronAPI = undefined;
  });

  it("submits homepage video generation through Dreamina-aware workflow action", async () => {
    window.electronAPI = {
      dreaminaCli: {
        exec: vi.fn(),
      },
    } as unknown as Window["electronAPI"];

    invokeFunction.mockImplementation(async (name: string) => {
      if (name === "enhance-video-prompt") {
        return {
          data: { enhanced: "增强后的视频提示词", duration: 6 },
          error: null,
        };
      }

      if (name === "generate-video") {
        return {
          data: { task_id: "task-1", status: "processing", provider: "dreamina-cli" },
          error: null,
        };
      }

      throw new Error(`unexpected function: ${name}`);
    });

    const runtime = createRuntime(createVideoProject());
    const result = await generateVideoAssetsAction({}, runtime);
    const scene = result.data?.videoProject?.scenes[0];

    expect(invokeFunction).toHaveBeenCalledWith(
      "generate-video",
      expect.objectContaining({
        provider: "dreamina-cli",
        imageUrl: "https://example.com/storyboard-1.jpg",
        duration: 6,
      }),
    );
    expect(scene?.videoTaskId).toBe("task-1");
    expect(scene?.videoProvider).toBe("dreamina-cli");
    expect(scene?.videoStatus).toBe("processing");
    expect(result.summary).toContain("已提交 1 条镜头出片任务");
  });

  it("refreshes generated video results back into the homepage project state", async () => {
    invokeFunction.mockResolvedValue({
      data: {
        status: "succeeded",
        video_url: "https://example.com/video-new.mp4",
      },
      error: null,
    });

    const runtime = createRuntime(
      createVideoProject({
        scenes: [
          {
            id: "scene-1",
            sceneNumber: 1,
            sceneName: "雨夜追击",
            description: "女主在雨夜回头看见追兵。",
            characters: ["沈昭"],
            dialogue: "",
            cameraDirection: "中景跟拍",
            duration: 5,
            storyboardUrl: "https://example.com/storyboard-1.jpg",
            videoUrl: "https://example.com/video-old.mp4",
            videoTaskId: "task-1",
            videoProvider: "dreamina-cli",
            videoStatus: "processing",
          },
        ],
      }),
    );

    const result = await refreshVideoAssetsAction({}, runtime);
    const scene = result.data?.videoProject?.scenes[0];

    expect(invokeFunction).toHaveBeenCalledWith(
      "generate-video",
      expect.objectContaining({
        action: "status",
        taskId: "task-1",
        provider: "dreamina-cli",
      }),
    );
    expect(scene?.videoUrl).toBe("https://example.com/video-new.mp4");
    expect(scene?.videoStatus).toBe("completed");
    expect(scene?.videoHistory?.[0]?.videoUrl).toBe("https://example.com/video-old.mp4");
    expect(result.summary).toContain("已完成 1 条镜头出片");
  });
});
