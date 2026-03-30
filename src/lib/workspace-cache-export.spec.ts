// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairWorkspaceTextCachesFromIndex } from "./workspace-cache-export";

vi.mock("@/lib/file-cache", () => ({
  getProjectRootPath: vi.fn(async (projectId: string) => `C:\\cache\\projects\\${projectId}`),
  getProjectsFilePath: vi.fn(async () => "C:\\cache\\projects\\projects.json"),
  readJsonFile: vi.fn(async () => [
    {
      id: "project-1",
      title: "Test Project",
      script: "Script body",
      scenes: [
        {
          id: "scene-1",
          sceneNumber: 1,
          segmentLabel: "1-1-1",
          sceneName: "废弃医疗舱",
          description: "Ava 醒来。",
          characters: ["[Ava]"],
          dialogue: "",
          cameraDirection: "",
          duration: 15,
        },
      ],
      characters: [
        {
          id: "char-1",
          name: "Ava",
          description: "女主角",
          isAIGenerated: true,
          source: "auto",
        },
      ],
      sceneSettings: [
        {
          id: "setting-1",
          name: "废弃医疗舱",
          description: "冷色调医疗舱",
          isAIGenerated: true,
          source: "auto",
        },
      ],
    },
  ]),
}));

describe("workspace-cache-export repair", () => {
  const writeText = vi.fn(async () => ({ ok: true }));

  beforeEach(() => {
    writeText.mockClear();
    (window as any).electronAPI = {
      storage: {
        writeText,
      },
      jimeng: {
        writeFile: vi.fn(async () => ({ ok: true })),
      },
    };
  });

  it("repairs text caches and writes segment prompt files from project index", async () => {
    const repaired = await repairWorkspaceTextCachesFromIndex();

    expect(repaired).toBe(1);
    expect(writeText).toHaveBeenCalled();

    const writtenPaths = writeText.mock.calls.map((call) => call[0]);
    expect(
      writtenPaths.some((path: string) =>
        path.includes("texts\\segments\\1-1-1.txt"),
      ),
    ).toBe(true);
    expect(
      writtenPaths.some((path: string) => path.includes("texts\\scene-breakdown.txt")),
    ).toBe(true);

    const segmentWrite = writeText.mock.calls.find((call) =>
      String(call[0]).includes("texts\\segments\\1-1-1.txt"),
    );
    expect(segmentWrite?.[1]).toContain("【Ava@（对应的设定图）】");
    expect(segmentWrite?.[1]).not.toContain("【[Ava]@（对应的设定图）】");
  });
});
