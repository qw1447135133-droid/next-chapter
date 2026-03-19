import { useMemo } from "react";
import { Scene, CharacterSetting } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Trash2, Plus, ArrowRight, ChevronDown, ChevronRight, Link2, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { exportScenesToXlsx } from "@/lib/export-xlsx";

/** Find the best matching costume label for a character in a given scene */
function matchCostumeLabel(character: CharacterSetting, scene: Scene): { label: string; source: 'ai' | 'manual' | 'auto' } | null {
  if (!character.costumes || character.costumes.length <= 1) return null;

  // Check scene-level assignment (could be AI-assigned or manual)
  const costumeId = scene.characterCostumes?.[character.name];
  if (costumeId) {
    const costume = character.costumes.find(cos => cos.id === costumeId);
    if (costume) {
      // If the scene has _manualCostumes tracking, it's manual; otherwise it's AI-assigned
      const isManual = (scene as any)._manualCostumes?.[character.name];
      return { label: costume.label, source: isManual ? 'manual' : 'ai' };
    }
  }

  // Auto-match by scene text (fallback)
  const sceneText = `${scene.description} ${scene.dialogue}`.toLowerCase();
  let bestLabel: string | null = null;
  let bestScore = 0;
  for (const cos of character.costumes) {
    if (!cos.label) continue;
    const label = cos.label.toLowerCase();
    if (sceneText.includes(label)) {
      const score = label.length + 100;
      if (score > bestScore) { bestScore = score; bestLabel = cos.label; }
      continue;
    }
    const parts = label.split(/[·・]/).map(p => p.trim()).filter(Boolean);
    let componentScore = 0;
    let matchedParts = 0;
    for (const part of parts) {
      if (part && sceneText.includes(part)) {
        componentScore += part.length;
        matchedParts++;
      }
    }
    if (matchedParts > 0) {
      const score = componentScore + matchedParts * 10;
      if (score > bestScore) { bestScore = score; bestLabel = cos.label; }
    }
  }
  return bestLabel ? { label: bestLabel, source: 'auto' } : null;
}

interface SceneListProps {
  scenes: Scene[];
  onScenesChange: (scenes: Scene[]) => void;
  onNext: () => void;
  characters?: CharacterSetting[];
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

/** Strip any bracket wrappers (【】[]（）) from a string */
function stripBrackets(s: string): string {
  return s.replace(/^[【\[（(]+/, '').replace(/[】\]）)]+$/, '').trim();
}

const SceneList = ({ scenes, onScenesChange, onNext, characters = [] }: SceneListProps) => {
  const [collapsedSegments, setCollapsedSegments] = useState<Set<string>>(new Set());

  // Group scenes by segmentLabel (e.g. "1-1", "1-2")
  const segments: Segment[] = useMemo(() => {
    if (scenes.length === 0) return [];

    const groupMap = new Map<string, Scene[]>();
    const groupOrder: string[] = [];

    for (const scene of scenes) {
      const label = scene.segmentLabel || `未分组`;
      if (!groupMap.has(label)) {
        groupMap.set(label, []);
        groupOrder.push(label);
      }
      groupMap.get(label)!.push(scene);
    }

    return groupOrder.map((label, i) => {
      const groupScenes = groupMap.get(label)!;
      const sceneNames = [...new Set(groupScenes.map(s => s.sceneName?.trim()).filter(Boolean))];
      return {
        key: `seg-${i}`,
        label: `片段 ${label}`,
        sceneName: sceneNames.join('、') || label,
        scenes: groupScenes,
        totalDuration: groupScenes[0]?.duration || 15,
      };
    });
  }, [scenes]);

  // Group segments by episode (prefix before "-")
  const episodeGroups: EpisodeGroup[] = useMemo(() => {
    if (segments.length === 0) return [];

    // Check if segmentLabels follow "N-M" pattern (episode-segment)
    const hasEpisodePrefix = segments.some(seg => {
      const raw = seg.label.replace('片段 ', '');
      return /^\d+-\d+$/.test(raw);
    });

    if (!hasEpisodePrefix) {
      // Single group, no episode headers needed
      return [{
        episodeKey: 'all',
        episodeLabel: '',
        segments,
        totalScenes: segments.reduce((sum, s) => sum + s.scenes.length, 0),
      }];
    }

    const groupMap = new Map<string, Segment[]>();
    const groupOrder: string[] = [];

    for (const seg of segments) {
      const raw = seg.label.replace('片段 ', '');
      const epNum = raw.split('-')[0] || '1';
      if (!groupMap.has(epNum)) {
        groupMap.set(epNum, []);
        groupOrder.push(epNum);
      }
      groupMap.get(epNum)!.push(seg);
    }

    return groupOrder.map(epNum => {
      const epSegments = groupMap.get(epNum)!;
      return {
        episodeKey: `ep-${epNum}`,
        episodeLabel: `第 ${epNum} 集`,
        segments: epSegments,
        totalScenes: epSegments.reduce((sum, s) => sum + s.scenes.length, 0),
      };
    });
  }, [segments]);

  const updateScene = (id: string, updates: Partial<Scene>) => {
    onScenesChange(scenes.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const removeScene = (id: string) => {
    onScenesChange(scenes.filter((s) => s.id !== id));
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
      <div className="text-center py-12 text-muted-foreground">
        <p>还没有分镜数据，请先在上一步输入剧本并进行 AI 拆解</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold font-[Space_Grotesk] mb-1">片段列表</h2>
          <p className="text-sm text-muted-foreground">
            {episodeGroups.length > 1 ? `共 ${episodeGroups.length} 集，` : ''}共 {segments.length} 个片段，{scenes.length} 个分镜，可编辑调整
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onNext} className="gap-1">
            下一步
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {episodeGroups.map((epGroup) => {
          const showEpisodeHeader = epGroup.episodeLabel !== '';
          const isEpisodeCollapsed = collapsedSegments.has(epGroup.episodeKey);

          return (
            <div key={epGroup.episodeKey} id={`episode-group-${epGroup.episodeKey}`} className="space-y-3">
              {/* Episode header */}
              {showEpisodeHeader && (
                <div
                  className="flex items-center gap-3 cursor-pointer select-none group"
                  onClick={() => toggleCollapse(epGroup.episodeKey)}
                >
                  {isEpisodeCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-primary" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-primary" />
                  )}
                  <h3 className="text-base font-bold text-foreground">{epGroup.episodeLabel}</h3>
                  <span className="text-xs text-muted-foreground">
                    {epGroup.segments.length} 个片段 · {epGroup.totalScenes} 个分镜
                  </span>
                  <div className="flex-1 border-t border-border/40" />
                </div>
              )}

              {/* Segments within episode */}
              {(!showEpisodeHeader || !isEpisodeCollapsed) && (
                <div className="space-y-3">
                  {epGroup.segments.map((segment) => {
                    const isCollapsed = collapsedSegments.has(segment.key);
                    const charTagMap = new Map<string, Set<string>>();
                    segment.scenes.forEach((s) => s.characters.forEach((c) => {
                      const name = typeof c === 'string' ? c : (c as any)?.name || '';
                      if (!name) return;
                      if (!charTagMap.has(name)) charTagMap.set(name, new Set());
                      const charSetting = characters.find(ch => ch.name === name);
                      if (charSetting && charSetting.costumes && charSetting.costumes.length > 1) {
                        const match = matchCostumeLabel(charSetting, s);
                        if (match) charTagMap.get(name)!.add(match.label);
                      }
                    }));
                    const charTags: { name: string; display: string }[] = [];
                    for (const [name, costumeLabels] of charTagMap) {
                      if (costumeLabels.size > 0) {
                        for (const label of costumeLabels) {
                          charTags.push({ name, display: `${name}·${label}` });
                        }
                      } else {
                        charTags.push({ name, display: name });
                      }
                    }

                    return (
                      <Card key={segment.key} className="border-border/60">
                        <CardHeader
                          className="p-4 pb-2 cursor-pointer select-none"
                          onClick={() => toggleCollapse(segment.key)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-semibold text-sm">
                                {segment.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                (时长: {segment.totalDuration}s)
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {segment.scenes.length} 个分镜
                            </span>
                          </div>

                          {charTags.length > 0 && (
                            <div className="flex items-start gap-1 mt-2 flex-wrap">
                              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">场景/人物标签：</span>
                              <span className="text-xs text-primary font-medium">【{stripBrackets(segment.sceneName)}】</span>
                              {charTags.map((tag, i) => (
                                <span key={`${tag.display}-${i}`} className="text-xs text-primary font-medium">【{stripBrackets(tag.display)}】</span>
                              ))}
                            </div>
                          )}
                        </CardHeader>

                        {!isCollapsed && (
                          <CardContent className="p-4 pt-0 space-y-2">
                            <div className="space-y-2 mt-2">
                              <p className="text-xs font-medium text-muted-foreground">分镜脚本：</p>
                              <ul className="space-y-2 ml-2">
                                {segment.scenes.map((scene, idx) => {
                                  const hasDialogue = scene.dialogue?.trim();
                                  return (
                                    <li key={scene.id} className="group">
                                      <div className="flex items-start gap-2">
                                        <div className="flex-1 space-y-1.5">
                                          <div className="flex items-start gap-1">
                                            <span className="text-xs font-bold text-foreground/70 whitespace-nowrap mt-0.5">
                                              分镜{idx + 1}：
                                            </span>
                                            <Textarea
                                              value={scene.description}
                                              onChange={(e) => updateScene(scene.id, { description: e.target.value })}
                                              placeholder="分镜描述"
                                              className="min-h-[32px] text-sm py-1 px-2 resize-none border-transparent hover:border-border focus:border-border bg-transparent"
                                              rows={1}
                                            />
                                            {scene.characters.length > 0 && (
                                              <span className="inline-flex items-center gap-0.5 mt-0.5 shrink-0 text-muted-foreground">
                                                <Link2 className="h-3 w-3" />
                                                <span className="text-[10px]">+{scene.characters.length}</span>
                                              </span>
                                            )}
                                          </div>
                                          {hasDialogue && (
                                            <div className="ml-10">
                                              <Textarea
                                                value={scene.dialogue}
                                                onChange={(e) => updateScene(scene.id, { dialogue: e.target.value })}
                                                placeholder="对白"
                                                className="min-h-[28px] text-xs py-1 px-2 resize-none border-transparent hover:border-border focus:border-border bg-transparent italic text-muted-foreground"
                                                rows={1}
                                              />
                                            </div>
                                          )}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
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
                            <div className="mt-3 pt-2 border-t border-border/40">
                              <p className="text-xs text-muted-foreground">通用后缀：无字幕、无水印、无背景音</p>
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
