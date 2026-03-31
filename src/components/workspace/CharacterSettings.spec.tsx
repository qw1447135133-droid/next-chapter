import { render, screen } from "@testing-library/react";
import CharacterSettings from "./CharacterSettings";
import type { CharacterSetting, Scene, SceneSetting } from "@/types/project";

describe("CharacterSettings", () => {
  it("renders role and scene settings with dirty names, costumes and time variants", () => {
    const scenes: Scene[] = [
      {
        id: "scene-1",
        sceneNumber: 1,
        segmentLabel: "1-1-1",
        sceneName: "废弃医疗舱",
        description: "Ava 醒来",
        characters: ["[Ava]"],
        dialogue: "",
        cameraDirection: "",
        duration: 15,
      },
    ];

    const characters: CharacterSetting[] = [
      {
        id: "char-1",
        name: "Ava",
        description: "主角",
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
        activeCostumeId: "costume-1",
      },
    ];

    const sceneSettings: SceneSetting[] = [
      {
        id: "setting-1",
        name: "废弃医疗舱",
        description: "冷色调医疗舱",
        isAIGenerated: true,
        source: "auto",
        timeVariants: [
          {
            id: "time-1",
            label: "深夜",
            description: "",
            isAIGenerated: true,
          },
          {
            id: "time-2",
            label: "清晨",
            description: "",
            isAIGenerated: true,
          },
        ],
        activeTimeVariantId: "time-1",
      },
    ];

    render(
      <CharacterSettings
        scenes={scenes}
        characters={characters}
        sceneSettings={sceneSettings}
        artStyle="live-action"
        onArtStyleChange={() => {}}
        onCharactersChange={() => {}}
        onSceneSettingsChange={() => {}}
        onScenesChange={() => {}}
        onNext={() => {}}
        script="测试剧本"
        decomposeModel="gemini-3-pro"
        isAutoDetectingAll={false}
        setIsAutoDetectingAll={() => {}}
        isAbortingAutoDetect={false}
        setIsAbortingAutoDetect={() => {}}
        autoDetectAbortRef={{ current: false }}
      />,
    );

    expect(screen.getByText("角色设定")).toBeInTheDocument();
    expect(screen.getByText("场景设定")).toBeInTheDocument();
    expect(screen.getByText("服装变体")).toBeInTheDocument();
    expect(screen.getByText("时间变体")).toBeInTheDocument();
    expect(screen.getByText("战术风衣")).toBeInTheDocument();
    expect(screen.getByText("礼服")).toBeInTheDocument();
    expect(screen.getByText("深夜")).toBeInTheDocument();
    expect(screen.getByText("清晨")).toBeInTheDocument();
  });
});
