import { Scene } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Download, Film } from "lucide-react";

interface VideoPreviewProps {
  scenes: Scene[];
}

const VideoPreview = ({ scenes }: VideoPreviewProps) => {
  const videosReady = scenes.filter((s) => s.videoUrl);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold font-[Space_Grotesk] mb-1">预览与导出</h2>
          <p className="text-sm text-muted-foreground">
            {videosReady.length}/{scenes.length} 个视频片段已就绪
          </p>
        </div>
        <Button disabled={videosReady.length === 0} className="gap-2">
          <Download className="h-4 w-4" />
          导出视频
        </Button>
      </div>

      {videosReady.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Film className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">请先在上一步生成视频片段</p>
        </div>
      ) : (
        <div className="space-y-3">
          {videosReady.map((scene) => (
            <div key={scene.id} className="rounded-xl overflow-hidden border border-border/60">
              <video src={scene.videoUrl} controls className="w-full" />
              <div className="px-4 py-2 bg-card text-xs text-muted-foreground">
                分镜 #{scene.sceneNumber} · {scene.duration}s
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoPreview;
