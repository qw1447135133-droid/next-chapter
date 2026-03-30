import { describe, expect, it } from "vitest";
import {
  getCharacterDisplayName,
  getSegmentCharacterDisplayNames,
  normalizeBracketWrappedLabel,
  normalizeCharacterName,
  normalizeSceneName,
} from "./workspace-labels";
import type { CharacterSetting, Scene } from "@/types/project";

describe("workspace-labels", () => {
  it("normalizes bracket-wrapped character names", () => {
    expect(normalizeCharacterName("Ava")).toBe("Ava");
    expect(normalizeCharacterName("[Ava]")).toBe("Ava");
    expect(normalizeCharacterName("【Ava】")).toBe("Ava");
    expect(normalizeCharacterName("（Ava）")).toBe("Ava");
  });

  it("normalizes generic bracket-wrapped labels for UI display", () => {
    expect(normalizeBracketWrappedLabel("[深夜豪宅]")).toBe("深夜豪宅");
    expect(normalizeBracketWrappedLabel("【Ava】")).toBe("Ava");
  });

  it("normalizes inline bracketed names inside scene names", () => {
    expect(normalizeSceneName("【liam】的工作室")).toBe("liam的工作室");
    expect(normalizeSceneName("[Ava]的卧室")).toBe("Ava的卧室");
  });

  it("returns normalized display names for scenes and segments", () => {
    const characters: CharacterSetting[] = [
      {
        id: "c1",
        name: "Ava",
        description: "hero",
        isAIGenerated: true,
        source: "auto",
        costumes: [
          {
            id: "costume-1",
            label: "战术风衣",
            description: "",
            isAIGenerated: true,
          },
          {
            id: "costume-2",
            label: "礼服",
            description: "",
            isAIGenerated: true,
          },
        ],
      },
    ];

    const scene: Scene = {
      id: "s1",
      sceneNumber: 1,
      sceneName: "废弃医疗舱",
      description: "Ava 穿着战术风衣醒来",
      characters: ["[Ava]"],
      dialogue: "",
      cameraDirection: "",
      duration: 15,
      characterCostumes: { Ava: "costume-1" },
    };

    expect(getCharacterDisplayName("[Ava]", scene, characters)).toBe("Ava 战术风衣");
    expect(getSegmentCharacterDisplayNames([scene], characters)).toEqual(["Ava 战术风衣"]);
  });
});
