import { useState } from "react";
import { ImageHistoryEntry } from "@/types/project";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, History, RotateCcw, X } from "lucide-react";

interface ImageHistoryDialogProps {
  history: ImageHistoryEntry[];
  label: string;
  onRestore?: (entry: ImageHistoryEntry) => void;
}

const ImageHistoryDialog = ({ history, label, onRestore }: ImageHistoryDialogProps) => {
  const [selectedEntry, setSelectedEntry] = useState<ImageHistoryEntry | null>(null);
  const [open, setOpen] = useState(false);

  const handleDownload = async (entry: ImageHistoryEntry) => {
    try {
      const resp = await fetch(entry.imageUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const ext = entry.imageUrl.includes(".png") ? "png" : "jpg";
      link.download = `${label}-${new Date(entry.createdAt).getTime()}.${ext}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(entry.imageUrl, "_blank");
    }
  };

  if (history.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
          <History className="h-3 w-3" />
          历史 ({history.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base">{label} - 生成历史</DialogTitle>
        </DialogHeader>

        {selectedEntry ? (
          <div className="flex flex-col h-full max-h-[calc(85vh-60px)]">
            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-xs text-muted-foreground">
                {new Date(selectedEntry.createdAt).toLocaleString("zh-CN")}
              </span>
              <div className="flex gap-2">
                 <Button
                   variant="outline"
                   size="sm"
                   className="gap-1 text-xs"
                   onClick={() => handleDownload(selectedEntry)}
                 >
                   <Download className="h-3 w-3" />
                   下载
                 </Button>
                 {onRestore && (
                   <Button
                     size="sm"
                     className="gap-1 text-xs"
                     onClick={() => {
                       onRestore(selectedEntry);
                       setSelectedEntry(null);
                       setOpen(false);
                     }}
                   >
                     <RotateCcw className="h-3 w-3" />
                     恢复为主图
                   </Button>
                 )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => setSelectedEntry(null)}
                >
                  <X className="h-3 w-3" />
                  返回
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-4 pb-4">
              <img
                src={selectedEntry.imageUrl}
                alt={label}
                className="w-full rounded-lg border border-border/40"
              />
              {selectedEntry.description && (
                <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border/40">
                  <p className="text-xs font-medium text-muted-foreground mb-1">提示词：</p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {selectedEntry.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(85vh-60px)]">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 pt-0">
              {history.map((entry, idx) => (
                <div
                  key={idx}
                  className="group cursor-pointer rounded-lg border border-border/40 overflow-hidden hover:border-primary/50 transition-colors"
                  onClick={() => setSelectedEntry(entry)}
                >
                  <div className="aspect-square overflow-hidden bg-muted/30">
                    <img
                      src={entry.imageUrl}
                      alt={`${label} 历史 ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImageHistoryDialog;
