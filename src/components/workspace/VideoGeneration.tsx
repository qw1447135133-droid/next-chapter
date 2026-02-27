import { useState, useRef, useEffect } from "react";
import { Scene, VideoModel, VIDEO_MODEL_LABELS, VideoHistoryEntry } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, RefreshCw, Loader2, ArrowRight, CheckCircle, XCircle, ChevronDown, History, RotateCcw, Clock, RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StoryboardAspectRatio } from "./StoryboardPreview";

const ASPECT_RATIO_OPTIONS: { value: StoryboardAspectRatio; label: string; icon: typeof RectangleHorizontal }[] = [
  { value: "16:9", label: "16:9 横屏", icon: RectangleHorizontal },
  { value: "9:16", label: "9:16 竖屏", icon: RectangleVertical },
  { value: "3:2", label: "3:2 横屏", icon: RectangleHorizontal },
  { value: "2:3", label: "2:3 竖屏", icon: RectangleVertical },
];

interface VideoGenerationProps {
  scenes: Scene[];
  videoModel: VideoModel;
  onVideoModelChange: (model: VideoModel) => void;
  onGenerateAll: () => void;
  onStopAll: () => void;
  onRegenerateScene: (sceneId: string) => void;
  isGenerating: boolean;
  isAborting: boolean;
  onNext: () => void;
  onScenesChange?: (scenes: Scene[]) => void;
  useImg2Video?: boolean;
}

const statusLabel: Record<string, { text: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  preparing: { text: "准备中", variant: "secondary" },
  queued: { text: "排队中", variant: "secondary" },
  processing: { text: "生成中", variant: "default" },
  completed: { text: "已完成", variant: "outline" },
  succeeded: { text: "已完成", variant: "outline" },
  failed: { text: "失败", variant: "destructive" },
};

const VideoGeneration = ({
  scenes,
  videoModel,
  onVideoModelChange,
  onGenerateAll,
  onStopAll,
  onRegenerateScene,
  isGenerating,
  isAborting,
  onNext,
  onScenesChange,
  useImg2Video = false,
}: VideoGenerationProps) => {
  const anyProcessing = scenes.some((s) => s.videoStatus === "preparing" || s.videoStatus === "queued" || s.videoStatus === "processing");
  const [modelOpen, setModelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [enlargedVideo, setEnlargedVideo] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Aspect ratio state (shared with StoryboardPreview via localStorage)
  const [aspectRatio, setAspectRatioState] = useState<StoryboardAspectRatio>(() => {
    try { return (localStorage.getItem("storyboard-aspect-ratio") as StoryboardAspectRatio) || "16:9"; } catch { return "16:9"; }
  });
  const setAspectRatio = (v: StoryboardAspectRatio) => {
    setAspectRatioState(v);
    try { localStorage.setItem("storyboard-aspect-ratio", v); } catch {}
  };
  const [arOpen, setArOpen] = useState(false);
  const currentAR = ASPECT_RATIO_OPTIONS.find((o) => o.value === aspectRatio)!;
  const isPortrait = aspectRatio === "9:16" || aspectRatio === "2:3";
  const aspectCssClass = aspectRatio === "9:16" ? "aspect-[9/16]" : aspectRatio === "2:3" ? "aspect-[2/3]" : aspectRatio === "3:2" ? "aspect-[3/2]" : "aspect-video";
  const gridClass = isPortrait ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" : "grid grid-cols-1 md:grid-cols-2 gap-4";

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const restoreFromHistory = (sceneId: string, entry: VideoHistoryEntry) => {
    if (!onScenesChange) return;
    const updated = scenes.map((s) => {
      if (s.id !== sceneId) return s;
      const history = [...(s.videoHistory || [])];
      // Push current video into history
      if (s.videoUrl) {
        const currentEntry: VideoHistoryEntry = {
          videoUrl: s.videoUrl,
          createdAt: new Date().toISOString(),
        };
        if (!history.some((h) => h.videoUrl === s.videoUrl)) {
          history.push(currentEntry);
        }
      }
      // Remove the restored one from history
      const filtered = history.filter((h) => h.videoUrl !== entry.videoUrl);
      return { ...s, videoUrl: entry.videoUrl, videoStatus: "completed", videoHistory: filtered };
    });
    onScenesChange(updated);
    setHistoryOpen(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold font-[Space_Grotesk]">视频生成</h2>
          {/* Model selector dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setModelOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              {VIDEO_MODEL_LABELS[videoModel]}
              <ChevronDown className={`h-3 w-3 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
            </button>
            {modelOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover shadow-lg py-1">
                {(Object.keys(VIDEO_MODEL_LABELS) as VideoModel[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { onVideoModelChange(m); setModelOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-accent ${
                      m === videoModel ? "text-primary font-semibold" : "text-popover-foreground"
                    }`}
                  >
                    {VIDEO_MODEL_LABELS[m]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {/* Aspect Ratio Selector — hidden when img2video is on */}
          {!useImg2Video && (
            <Popover open={arOpen} onOpenChange={setArOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs" disabled={isGenerating || anyProcessing}>
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
          )}

          {isGenerating || anyProcessing ? (
            <Button variant="destructive" onClick={onStopAll} disabled={isAborting} className="gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {isAborting ? "正在中止..." : "中止生成"}
            </Button>
          ) : (
            <Button variant="outline" onClick={onGenerateAll} className="gap-1">
              <Play className="h-3.5 w-3.5" />
              生成全部视频
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
          const isSceneProcessing = scene.videoStatus === "preparing" || scene.videoStatus === "queued" || scene.videoStatus === "processing";
          const status = scene.videoStatus ? statusLabel[scene.videoStatus] : null;
          const videoHistoryCount = (scene.videoHistory || []).length;

          return (
            <Card key={scene.id} className="border-border/60 overflow-hidden">
              {/* Header bar — matches storyboard layout */}
              <div className={`${isPortrait ? "p-2" : "p-3"} border-b border-border/30 flex items-center justify-between`}>
                <div className="min-w-0">
                  <h3 className={`${isPortrait ? "text-xs" : "text-sm"} font-medium text-foreground truncate`}>
                    #{scene.sceneNumber}
                    {scene.segmentLabel && <span className="text-muted-foreground ml-1">({scene.segmentLabel})</span>}
                  </h3>
                  {scene.sceneName && !isPortrait && (
                    <p className="text-xs text-muted-foreground mt-0.5">场景：{scene.sceneName}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {videoHistoryCount > 0 && (
                    <Dialog
                      open={historyOpen === scene.id}
                      onOpenChange={(open) => setHistoryOpen(open ? scene.id : null)}
                    >
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                          <History className="h-3 w-3" />
                          ({videoHistoryCount})
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>视频历史 — 分镜 #{scene.sceneNumber}</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh]">
                          <div className="grid grid-cols-2 gap-2 p-1">
                            {(scene.videoHistory || []).map((entry, idx) => (
                              <div
                                key={idx}
                                className="rounded-md overflow-hidden border border-border/60 hover:border-primary transition-colors"
                              >
                                <video
                                  src={entry.videoUrl}
                                  className="w-full aspect-video object-cover"
                                  muted
                                  preload="metadata"
                                />
                                <div className="p-1.5 flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(entry.createdAt).toLocaleString("zh-CN")}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 text-[10px] gap-0.5 px-1.5"
                                    onClick={() => restoreFromHistory(scene.id, entry)}
                                  >
                                    <RotateCcw className="h-2.5 w-2.5" />
                                    恢复
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 shrink-0 rounded-full h-7 px-3 text-xs font-medium transition-colors cursor-pointer ${
                          scene.isManualDuration
                            ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/25"
                            : "border border-input bg-background hover:bg-accent text-foreground"
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {scene.isManualDuration ? `${scene.recommendedDuration || scene.duration || 5}s` : "自动"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-4" side="top" align="end">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-foreground">
                          {scene.isManualDuration
                            ? `手动：${scene.recommendedDuration || scene.duration || 5}s`
                            : `自动：${scene.recommendedDuration || scene.duration || 5}s`}
                        </p>
                        {scene.isManualDuration && (
                          <button
                            type="button"
                            onClick={() => {
                              if (onScenesChange) {
                                onScenesChange(
                                  scenes.map((s) =>
                                    s.id === scene.id ? { ...s, isManualDuration: false } : s
                                  )
                                );
                              }
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            恢复自动
                          </button>
                        )}
                      </div>
                      {(() => {
                        const maxVal = videoModel.startsWith("vidu") ? 16 : 15;
                        const currentVal = scene.recommendedDuration || scene.duration || 5;
                        return (
                          <>
                            <Slider
                              min={4}
                              max={maxVal}
                              step={1}
                              value={[currentVal]}
                              onValueChange={([val]) => {
                                if (onScenesChange) {
                                  onScenesChange(
                                    scenes.map((s) =>
                                      s.id === scene.id
                                        ? { ...s, recommendedDuration: val, isManualDuration: true }
                                        : s
                                    )
                                  );
                                }
                              }}
                              className="[&_[role=slider]]:bg-emerald-500 [&_[role=slider]]:border-emerald-500 [&_[role=slider]]:w-5 [&_[role=slider]]:h-5 [&_.relative>.absolute]:bg-emerald-500"
                            />
                            <div className="flex justify-between mt-2">
                              {Array.from({ length: maxVal - 3 }, (_, i) => i + 4).map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => {
                                    if (onScenesChange) {
                                      onScenesChange(
                                        scenes.map((s) =>
                                          s.id === scene.id
                                            ? { ...s, recommendedDuration: d, isManualDuration: true }
                                            : s
                                        )
                                      );
                                    }
                                  }}
                                  className={`text-xs w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                                    d === currentVal
                                      ? "bg-emerald-500 text-white font-bold"
                                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                                  }`}
                                >
                                  {d}
                                </button>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => onRegenerateScene(scene.id)}
                    disabled={isSceneProcessing}
                  >
                    {isSceneProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {scene.videoUrl ? "重新生成" : "生成视频"}
                  </Button>
                </div>
              </div>

              {/* Content: video + description */}
              <div className={`${isPortrait ? "p-2 space-y-1" : "p-3 space-y-2"}`}>
                <div className={`${aspectCssClass} bg-muted rounded-md flex items-center justify-center overflow-hidden relative ${scene.videoUrl ? "cursor-pointer" : ""}`}>
                  {status && (
                    <Badge variant={status.variant} className={`absolute top-2 right-2 ${isPortrait ? "text-[10px] px-1.5 py-0.5" : "text-xs"} z-10`}>
                      {scene.videoStatus === "completed" || scene.videoStatus === "succeeded" ? (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      ) : scene.videoStatus === "failed" ? (
                        <XCircle className="h-3 w-3 mr-1" />
                      ) : null}
                      {status.text}
                    </Badge>
                  )}
                  {scene.videoUrl ? (
                    <video
                      src={scene.videoUrl}
                      muted
                      loop
                      playsInline
                      className="h-full w-full object-cover"
                      onClick={() => setEnlargedVideo(scene.videoUrl!)}
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                    />
                  ) : isSceneProcessing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className={`${isPortrait ? "h-5 w-5" : "h-8 w-8"} text-primary animate-spin`} />
                      <span className="text-xs text-muted-foreground">
                        {scene.videoStatus === "preparing" ? "准备中..." : "视频生成中..."}
                      </span>
                    </div>
                  ) : scene.storyboardUrl ? (
                    <img src={scene.storyboardUrl} className="h-full w-full object-cover opacity-50" alt="" />
                  ) : (
                    <div className="text-center text-muted-foreground/40">
                      <Play className={`${isPortrait ? "h-4 w-4" : "h-6 w-6"} mx-auto mb-1`} />
                      <span className="text-xs">点击「生成视频」</span>
                    </div>
                  )}
                </div>
                <p className={`text-xs text-muted-foreground ${isPortrait ? "line-clamp-2" : "line-clamp-3"}`}>{scene.description}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Enlarged video dialog */}
      <Dialog open={!!enlargedVideo} onOpenChange={(open) => !open && setEnlargedVideo(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-1 flex items-center justify-center bg-black/80 border border-border/30">
          {enlargedVideo && (
            <video src={enlargedVideo} controls autoPlay className="max-w-full max-h-[92vh] object-contain rounded-md" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VideoGeneration;
