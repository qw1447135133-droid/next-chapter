import { useMemo } from "react";
import { Scene } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Trash2, Plus, ArrowRight, ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { useState } from "react";

interface SceneListProps {
  scenes: Scene[];
  onScenesChange: (scenes: Scene[]) => void;
  onNext: () => void;
}

interface Segment {
  key: string;
  label: string;
  sceneName: string;
  scenes: Scene[];
  totalDuration: number;
}

const SceneList = ({ scenes, onScenesChange, onNext }: SceneListProps) => {
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
        totalDuration: groupScenes[0]?.duration || 15, // segment duration is fixed (not summed)
      };
    });
  }, [scenes]);

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
            共 {segments.length} 个片段，{scenes.length} 个分镜，可编辑调整
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onNext} className="gap-1">
            下一步
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {segments.map((segment) => {
          const isCollapsed = collapsedSegments.has(segment.key);
          // Collect all unique characters and scene tags
          const allChars = new Set<string>();
          segment.scenes.forEach((s) => s.characters.forEach((c) => {
            const name = typeof c === 'string' ? c : (c as any)?.name || '';
            if (name) allChars.add(name);
          }));
          const charTags = Array.from(allChars);

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

                {/* Scene/Character tags */}
                {charTags.length > 0 && (
                  <div className="flex items-start gap-1 mt-2 flex-wrap">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">场景/人物标签：</span>
                    <span className="text-xs text-primary font-medium">[{segment.sceneName}]</span>
                    {charTags.map((c) => (
                      <span key={c} className="text-xs text-primary font-medium">[{c}]</span>
                    ))}
                  </div>
                )}
              </CardHeader>

              {!isCollapsed && (
                <CardContent className="p-4 pt-0 space-y-2">
                  {/* Shots list */}
                  <div className="space-y-2 mt-2">
                    <p className="text-xs font-medium text-muted-foreground">分镜脚本：</p>
                    <ul className="space-y-2 ml-2">
                      {segment.scenes.map((scene, idx) => {
                        // Collect dialogues
                        const hasDialogue = scene.dialogue?.trim();
                        return (
                          <li key={scene.id} className="group">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 space-y-1.5">
                                {/* Shot description - editable */}
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
                                  {/* Character link badges */}
                                  {scene.characters.length > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-muted-foreground mt-0.5 shrink-0">
                                      <Link2 className="h-3 w-3" />
                                      <span className="text-[10px]">+{scene.characters.length}</span>
                                    </span>
                                  )}
                                </div>

                                {/* Dialogue if present */}
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

                  {/* Common suffix info */}
                  <div className="mt-3 pt-2 border-t border-border/40">
                    <p className="text-xs text-muted-foreground">通用后缀：无字幕、无水印、无背景音</p>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SceneList;
