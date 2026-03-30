import { useMemo, useState } from "react";
import { Scene, CharacterSetting, SceneSetting } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Trash2,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  FileSpreadsheet,
} from "lucide-react";
import { exportScenesToXlsx } from "@/lib/export-xlsx";
import {
  getSegmentCharacterDisplayNames,
  getSegmentSceneDisplayName,
  normalizeBracketWrappedLabel,
  normalizeCharacterName,
  normalizeSceneName,
} from "@/lib/workspace-labels";

interface SceneListProps {
  scenes: Scene[];
  onScenesChange: (scenes: Scene[]) => void;
  onNext: () => void;
  characters?: CharacterSetting[];
  sceneSettings?: SceneSetting[];
}

interface Segment {
  key: string;
  label: string;
  sceneName: string;
  scenes: Scene[];
  totalDuration: number;
}

interface EpisodeGroup {
  episodeKey: string;
  episodeLabel: string;
  segments: Segment[];
  totalScenes: number;
}

const SceneList = ({
  scenes,
  onScenesChange,
  onNext,
  characters = [],
  sceneSettings = [],
}: SceneListProps) => {
  const [collapsedSegments, setCollapsedSegments] = useState<Set<string>>(new Set());
  const [editingTagSegmentKey, setEditingTagSegmentKey] = useState<string | null>(null);

  const segments: Segment[] = useMemo(() => {
    if (scenes.length === 0) return [];

    const groupMap = new Map<string, Scene[]>();
    const groupOrder: string[] = [];

    for (const scene of scenes) {
      const label = scene.segmentLabel || "未分组";
      if (!groupMap.has(label)) {
        groupMap.set(label, []);
        groupOrder.push(label);
      }
      groupMap.get(label)!.push(scene);
    }

    return groupOrder.map((label, index) => {
      const groupScenes = groupMap.get(label)!;
      return {
        key: `seg-${index}`,
        label: `片段 ${label}`,
        sceneName: getSegmentSceneDisplayName(groupScenes, sceneSettings) || label,
        scenes: groupScenes,
        totalDuration: groupScenes[0]?.duration || 15,
      };
    });
  }, [scenes, sceneSettings]);

  const episodeGroups: EpisodeGroup[] = useMemo(() => {
    if (segments.length === 0) return [];

    const hasEpisodePrefix = segments.some((segment) => {
      const raw = segment.label.replace("片段 ", "");
      return /^\d+-\d+$/.test(raw);
    });

    if (!hasEpisodePrefix) {
      return [
        {
          episodeKey: "all",
          episodeLabel: "",
          segments,
          totalScenes: segments.reduce((sum, segment) => sum + segment.scenes.length, 0),
        },
      ];
    }

    const groupMap = new Map<string, Segment[]>();
    const groupOrder: string[] = [];

    for (const segment of segments) {
      const raw = segment.label.replace("片段 ", "");
      const episodeNumber = raw.split("-")[0] || "1";
      if (!groupMap.has(episodeNumber)) {
        groupMap.set(episodeNumber, []);
        groupOrder.push(episodeNumber);
      }
      groupMap.get(episodeNumber)!.push(segment);
    }

    return groupOrder.map((episodeNumber) => {
      const episodeSegments = groupMap.get(episodeNumber)!;
      return {
        episodeKey: `ep-${episodeNumber}`,
        episodeLabel: `第 ${episodeNumber} 集`,
        segments: episodeSegments,
        totalScenes: episodeSegments.reduce((sum, segment) => sum + segment.scenes.length, 0),
      };
    });
  }, [segments]);

  const updateScene = (id: string, updates: Partial<Scene>) => {
    onScenesChange(scenes.map((scene) => (scene.id === id ? { ...scene, ...updates } : scene)));
  };

  const removeScene = (id: string) => {
    onScenesChange(scenes.filter((scene) => scene.id !== id));
  };

  const updateSegmentScenes = (segmentScenes: Scene[], updater: (scene: Scene) => Scene) => {
    const segmentIds = new Set(segmentScenes.map((scene) => scene.id));
    onScenesChange(
      scenes.map((scene) => (segmentIds.has(scene.id) ? updater(scene) : scene)),
    );
  };

  const updateSegmentSceneName = (segmentScenes: Scene[], value: string) => {
    const nextSceneName = normalizeSceneName(value);
    updateSegmentScenes(segmentScenes, (scene) => ({
      ...scene,
      sceneName: nextSceneName,
    }));
  };

  const updateSegmentCharacters = (segmentScenes: Scene[], value: string) => {
    const nextCharacters = Array.from(
      new Set(
        value
          .split(/[，,、]/u)
          .map((item) => normalizeCharacterName(item))
          .filter(Boolean),
      ),
    );

    updateSegmentScenes(segmentScenes, (scene) => ({
      ...scene,
      characters: nextCharacters,
    }));
  };

  const toggleCollapse = (key: string) => {
    setCollapsedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (scenes.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p>还没有分镜数据，请先在上一步输入剧本并进行 AI 拆解。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="mb-1 font-[Space_Grotesk] text-xl font-semibold">片段列表</h2>
          <p className="text-sm text-muted-foreground">
            {episodeGroups.length > 1 ? `共 ${episodeGroups.length} 集，` : ""}
            共 {segments.length} 个片段，{scenes.length} 个分镜，可编辑调整。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => {
              exportScenesToXlsx(scenes, undefined, characters, sceneSettings);
            }}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            导出分镜
          </Button>
          <Button size="sm" onClick={onNext} className="gap-1">
            下一步
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {episodeGroups.map((episodeGroup) => {
          const showEpisodeHeader = episodeGroup.episodeLabel !== "";
          const isEpisodeCollapsed = collapsedSegments.has(episodeGroup.episodeKey);

          return (
            <div
              key={episodeGroup.episodeKey}
              id={`episode-group-${episodeGroup.episodeKey}`}
              className="space-y-3"
            >
              {showEpisodeHeader && (
                <div
                  className="group flex cursor-pointer select-none items-center gap-3"
                  onClick={() => toggleCollapse(episodeGroup.episodeKey)}
                >
                  {isEpisodeCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-primary" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-primary" />
                  )}
                  <h3 className="text-base font-bold text-foreground">{episodeGroup.episodeLabel}</h3>
                  <span className="text-xs text-muted-foreground">
                    {episodeGroup.segments.length} 个片段 · {episodeGroup.totalScenes} 个分镜
                  </span>
                  <div className="flex-1 border-t border-border/40" />
                </div>
              )}

              {(!showEpisodeHeader || !isEpisodeCollapsed) && (
                <div className="space-y-3">
                  {episodeGroup.segments.map((segment) => {
                    const isCollapsed = collapsedSegments.has(segment.key);
                    const editableCharacterTags = getSegmentCharacterDisplayNames(segment.scenes, characters);

                    return (
                      <Card key={segment.key} className="border-border/60">
                        <CardHeader
                          className="cursor-pointer select-none p-4 pb-2"
                          onClick={() => toggleCollapse(segment.key)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="text-sm font-semibold">{segment.label}</span>
                              <span className="text-xs text-muted-foreground">
                                (时长: {segment.totalDuration}s)
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {segment.scenes.length} 个分镜
                            </span>
                          </div>

                          {editingTagSegmentKey === segment.key ? (
                            <div
                              className="mt-2 grid gap-2 rounded-md border border-border/50 bg-muted/20 p-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <div className="flex items-center gap-2">
                                <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                                  场景/人物标签：
                                </span>
                                <Input
                                  value={segment.sceneName}
                                  onChange={(event) =>
                                    updateSegmentSceneName(segment.scenes, event.target.value)
                                  }
                                  placeholder="场景标签"
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editableCharacterTags.join(", ")}
                                  onChange={(event) =>
                                    updateSegmentCharacters(segment.scenes, event.target.value)
                                  }
                                  placeholder="人物标签，多个用逗号分隔"
                                  className="h-7 text-xs"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setEditingTagSegmentKey(null)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="mt-2 flex flex-wrap items-start gap-1 rounded-md border border-transparent px-1 py-1 hover:border-border/50 hover:bg-muted/20"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingTagSegmentKey(segment.key);
                              }}
                            >
                              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                                场景/人物标签：
                              </span>
                              {segment.sceneName && (
                                <span className="text-xs font-medium text-primary">
                                  【{normalizeBracketWrappedLabel(segment.sceneName)}】
                                </span>
                              )}
                              {editableCharacterTags.map((tag, index) => (
                                <span key={`${tag}-${index}`} className="text-xs font-medium text-primary">
                                  【{normalizeBracketWrappedLabel(tag)}】
                                </span>
                              ))}
                            </div>
                          )}
                        </CardHeader>

                        {!isCollapsed && (
                          <CardContent className="space-y-2 p-4 pt-0">
                            <div className="mt-2 space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">分镜脚本：</p>
                              <ul className="ml-2 space-y-2">
                                {segment.scenes.map((scene, index) => {
                                  const hasDialogue = scene.dialogue?.trim();
                                  return (
                                    <li key={scene.id} className="group">
                                      <div className="flex items-start gap-2">
                                        <div className="flex-1 space-y-1.5">
                                          <div className="flex items-start gap-1">
                                            <span className="mt-0.5 whitespace-nowrap text-xs font-bold text-foreground/70">
                                              分镜 {index + 1}：
                                            </span>
                                            <Textarea
                                              value={scene.description}
                                              onChange={(e) =>
                                                updateScene(scene.id, { description: e.target.value })
                                              }
                                              placeholder="分镜描述"
                                              className="min-h-[32px] resize-none border-transparent bg-transparent px-2 py-1 text-sm hover:border-border focus:border-border"
                                              rows={1}
                                            />
                                            {scene.characters.length > 0 && (
                                              <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-muted-foreground">
                                                <Link2 className="h-3 w-3" />
                                                <span className="text-[10px]">+{scene.characters.length}</span>
                                              </span>
                                            )}
                                          </div>
                                          {hasDialogue && (
                                            <div className="ml-10">
                                              <Textarea
                                                value={scene.dialogue}
                                                onChange={(e) =>
                                                  updateScene(scene.id, { dialogue: e.target.value })
                                                }
                                                placeholder="对白"
                                                className="min-h-[28px] resize-none border-transparent bg-transparent px-2 py-1 text-xs italic text-muted-foreground hover:border-border focus:border-border"
                                                rows={1}
                                              />
                                            </div>
                                          )}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                                          onClick={() => removeScene(scene.id)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                            <div className="mt-3 border-t border-border/40 pt-2">
                              <p className="text-xs text-muted-foreground">
                                通用后缀：无字幕、无水印、无背景音
                              </p>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SceneList;
