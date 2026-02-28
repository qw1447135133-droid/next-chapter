import { useState, useRef, useEffect } from "react";
import { Scene, CharacterSetting } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Image, RefreshCw, Loader2, ArrowRight, History, ChevronDown, RectangleHorizontal, RectangleVertical, Square } from "lucide-react";
import ImageThumbnail from "./ImageThumbnail";

export type StoryboardAspectRatio = "16:9" | "9:16" | "3:2" | "2:3";
export type StoryboardModel = "gemini-3-pro-image-preview" | "doubao-seedream-5-0-260128";

const STORYBOARD_MODEL_OPTIONS: { value: StoryboardModel; label: string }[] = [
  { value: "gemini-3-pro-image-preview", label: "Nano Banana Pro" },
  { value: "doubao-seedream-5-0-260128", label: "Seedream 5.0" },
];

const ASPECT_RATIO_OPTIONS: { value: StoryboardAspectRatio; label: string; icon: typeof RectangleHorizontal; cssAspect: string }[] = [
  { value: "16:9", label: "16:9 横屏", icon: RectangleHorizontal, cssAspect: "aspect-video" },
  { value: "9:16", label: "9:16 竖屏", icon: RectangleVertical, cssAspect: "aspect-[9/16]" },
  { value: "3:2", label: "3:2 横屏", icon: RectangleHorizontal, cssAspect: "aspect-[3/2]" },
  { value: "2:3", label: "2:3 竖屏", icon: RectangleVertical, cssAspect: "aspect-[2/3]" },
];

interface StoryboardPreviewProps {
  scenes: Scene[];
  characters: CharacterSetting[];
  onGenerateScene: (sceneId: string, aspectRatio: StoryboardAspectRatio, model: StoryboardModel) => void;
  onGenerateAll: (aspectRatio: StoryboardAspectRatio, model: StoryboardModel) => void;
  onStopAll: () => void;
  onScenesChange: (scenes: Scene[]) => void;
  generatingScenes: Set<string>;
  isGeneratingAll: boolean;
  isAborting: boolean;
  onNext: () => void;
}

const StoryboardPreview = ({
  scenes,
  characters,
  onGenerateScene,
  onGenerateAll,
  onStopAll,
  onScenesChange,
  generatingScenes,
  isGeneratingAll,
  isAborting,
  onNext,
}: StoryboardPreviewProps) => {
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [aspectRatio, setAspectRatioState] = useState<StoryboardAspectRatio>(() => {
    try { return (localStorage.getItem("storyboard-aspect-ratio") as StoryboardAspectRatio) || "16:9"; } catch { return "16:9"; }
  });
  const setAspectRatio = (v: StoryboardAspectRatio) => {
    setAspectRatioState(v);
    try { localStorage.setItem("storyboard-aspect-ratio", v); } catch {}
  };
  const [arOpen, setArOpen] = useState(false);
  const [storyboardModel, setStoryboardModelState] = useState<StoryboardModel>(() => {
    try { return (localStorage.getItem("storyboard-model") as StoryboardModel) || "gemini-3-pro-image-preview"; } catch { return "gemini-3-pro-image-preview"; }
  });
  const setStoryboardModel = (v: StoryboardModel) => {
    setStoryboardModelState(v);
    try { localStorage.setItem("storyboard-model", v); } catch {}
  };
  const [modelOpen, setModelOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    if (modelOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modelOpen]);

  const isAnyGenerating = (generatingScenes?.size ?? 0) > 0;
  const currentModel = STORYBOARD_MODEL_OPTIONS.find((o) => o.value === storyboardModel)!;
  const currentAR = ASPECT_RATIO_OPTIONS.find((o) => o.value === aspectRatio)!;

  const restoreFromHistory = (sceneId: string, url: string) => {
    const updated = scenes.map((s) => {
      if (s.id !== sceneId) return s;
      const history = [...(s.storyboardHistory || [])];
      if (s.storyboardUrl && !history.includes(s.storyboardUrl)) {
        history.push(s.storyboardUrl);
      }
      const filtered = history.filter((h) => h !== url);
      return { ...s, storyboardUrl: url, storyboardHistory: filtered };
    });
    onScenesChange(updated);
    setHistoryOpen(null);
  };

  // Portrait ratios use more columns and smaller cards
  const isPortrait = aspectRatio === "9:16" || aspectRatio === "2:3";
  const containerAspectClass = currentAR.cssAspect;
  const gridClass = isPortrait ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" : "grid grid-cols-1 md:grid-cols-2 gap-4";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-xl font-semibold font-[Space_Grotesk] mb-1">分镜图生成</h2>
            <p className="text-sm text-muted-foreground">为每个分镜生成对应的画面图像</p>
          </div>
          {/* Model Selector — pill style matching VideoGeneration */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              type="button"
              onClick={() => setModelOpen((v) => !v)}
              disabled={isAnyGenerating}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {currentModel.label}
              <ChevronDown className={`h-3 w-3 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
            </button>
            {modelOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover shadow-lg py-1">
                {STORYBOARD_MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setStoryboardModel(opt.value); setModelOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-accent ${
                      opt.value === storyboardModel ? "text-primary font-semibold" : "text-popover-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Popover open={arOpen} onOpenChange={setArOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs" disabled={isAnyGenerating}>
                <currentAR.icon className="h-3.5 w-3.5" />
                {currentAR.value}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              {ASPECT_RATIO_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-xs transition-colors ${
                    aspectRatio === opt.value
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted text-foreground"
                  }`}
                  onClick={() => { setAspectRatio(opt.value); setArOpen(false); }}
                >
                  <opt.icon className="h-3.5 w-3.5 shrink-0" />
                  {opt.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {isGeneratingAll ? (
            <Button variant="destructive" onClick={onStopAll} disabled={isAborting} className="gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {isAborting ? "正在中止..." : "中止生成"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onGenerateAll(aspectRatio, storyboardModel)} disabled={isAnyGenerating} className="gap-1">
              <Image className="h-3.5 w-3.5" />
              生成全部
            </Button>
          )}
          <Button size="sm" onClick={onNext} className="gap-1">
            下一步
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className={gridClass}>
        {scenes.map((scene) => {
          const isGen = generatingScenes?.has(scene.id) ?? false;
          const historyCount = (scene.storyboardHistory || []).length;

          return (
            <Card key={scene.id} className="border-border/60 overflow-hidden">
              <div className={`${isPortrait ? "p-2" : "p-3"} border-b border-border/30 flex items-center justify-between`}>
                <div className="min-w-0">
                  <h3 className={`${isPortrait ? "text-xs" : "text-sm"} font-medium text-foreground truncate`}>
                    #{scene.sceneNumber}
                    {scene.segmentLabel && <span className="text-muted-foreground ml-1">({scene.segmentLabel})</span>}
                  </h3>
                  {scene.sceneName && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">场景：{scene.sceneName}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => onGenerateScene(scene.id, aspectRatio, storyboardModel)}
                    disabled={isGen}
                  >
                    {isGen ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {scene.storyboardUrl ? "重新生成" : "生成"}
                  </Button>

                  {historyCount > 0 && (
                    <Dialog
                      open={historyOpen === scene.id}
                      onOpenChange={(open) => setHistoryOpen(open ? scene.id : null)}
                    >
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          <History className="h-3 w-3" />
                          ({historyCount})
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>分镜图历史 — #{scene.sceneNumber}</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh]">
                          <div className="grid grid-cols-2 gap-2 p-1">
                            {(scene.storyboardHistory || []).map((url, idx) => (
                              <button
                                key={idx}
                                className="rounded-md overflow-hidden border border-border/60 hover:border-primary transition-colors"
                                onClick={() => restoreFromHistory(scene.id, url)}
                              >
                                <ImageThumbnail src={url} alt={`历史版本 ${idx + 1}`} className="w-full aspect-video object-cover" maxDim={500} />
                                <span className="block text-[10px] text-muted-foreground py-1">
                                  版本 {idx + 1} — 点击恢复
                                </span>
                              </button>
                            ))}
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className={`${isPortrait ? "p-2 space-y-1" : "p-3 space-y-2"}`}>
                {/* Storyboard image */}
                <div className={`${containerAspectClass} bg-muted rounded-md flex items-center justify-center overflow-hidden`}>
                  {isGen ? (
                    <Loader2 className={`${isPortrait ? "h-5 w-5" : "h-8 w-8"} text-muted-foreground/50 animate-spin`} />
                  ) : scene.storyboardUrl ? (
                    <ImageThumbnail
                      src={scene.storyboardUrl}
                      alt={`分镜 #${scene.sceneNumber}`}
                      className="h-full w-full object-cover"
                      maxDim={isPortrait ? 600 : 1000}
                    />
                  ) : (
                    <div className="text-center text-muted-foreground/40">
                      <Image className={`${isPortrait ? "h-4 w-4" : "h-6 w-6"} mx-auto mb-1`} />
                      <span className="text-xs">点击「生成」</span>
                    </div>
                  )}
                </div>

                {/* Scene description */}
                <p className={`text-xs text-muted-foreground ${isPortrait ? "line-clamp-2" : "line-clamp-3"}`}>{scene.description}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default StoryboardPreview;