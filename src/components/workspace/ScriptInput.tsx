import { useRef, useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Upload, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type DecomposeModel = "gemini-3.1-pro-preview" | "gemini-3-pro-preview" | "gemini-3-pro-preview-thinking" | "gemini-3-flash-preview";

const DECOMPOSE_MODEL_OPTIONS: { value: DecomposeModel; label: string }[] = [
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "gemini-3-pro-preview-thinking", label: "Gemini 3 Pro Thinking" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
];

interface ScriptInputProps {
  script: string;
  onScriptChange: (script: string) => void;
  onAnalyze: () => void;
  onCancelAnalyze?: () => void;
  isAnalyzing: boolean;
  decomposeModel: DecomposeModel;
  onDecomposeModelChange: (model: DecomposeModel) => void;
}

const ACCEPTED_TYPES = ".txt,.pdf,.doc,.docx";

const ScriptInput = ({ script, onScriptChange, onAnalyze, onCancelAnalyze, isAnalyzing, decomposeModel, onDecomposeModelChange }: ScriptInputProps) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isUploading = useRef(false);
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

  const currentModel = DECOMPOSE_MODEL_OPTIONS.find((o) => o.value === decomposeModel)!;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isUploading.current) return;
    isUploading.current = true;

    const name = file.name.toLowerCase();
    if (![".txt", ".pdf", ".doc", ".docx"].some((ext) => name.endsWith(ext))) {
      toast({ title: "不支持的格式", description: "请上传 TXT、PDF 或 Word 文档", variant: "destructive" });
      isUploading.current = false;
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "文件过大", description: "文件大小不能超过 10MB", variant: "destructive" });
      isUploading.current = false;
      return;
    }

    if (name.endsWith(".txt")) {
      try {
        const text = await file.text();
        onScriptChange(text);
        toast({ title: "导入成功", description: `已导入 ${file.name}` });
      } catch {
        toast({ title: "读取失败", variant: "destructive" });
      }
      isUploading.current = false;
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    toast({ title: "正在解析文档...", description: "PDF/Word 解析可能需要几秒钟" });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-document`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "解析失败");

      onScriptChange(data.text);
      toast({ title: "导入成功", description: `已导入 ${file.name}` });
    } catch (err: any) {
      console.error("Document parse error:", err);
      toast({ title: "解析失败", description: err.message || "请重试", variant: "destructive" });
    }

    isUploading.current = false;
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-semibold font-[Space_Grotesk]">输入剧本</h2>
            {/* Model Selector — pill style matching CharacterSettings */}
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => setModelOpen((v) => !v)}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {currentModel.label}
                <ChevronDown className={`h-3 w-3 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
              </button>
              {modelOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-popover shadow-lg py-1">
                  {DECOMPOSE_MODEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { onDecomposeModelChange(opt.value); setModelOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-accent ${
                        opt.value === decomposeModel ? "text-primary font-semibold" : "text-popover-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            粘贴文本或上传文档（TXT / PDF / Word），AI 将自动拆解为分镜列表
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            上传文档
          </Button>
        </div>
      </div>

      <Textarea
        value={script}
        onChange={(e) => onScriptChange(e.target.value)}
        placeholder="在这里输入或粘贴你的剧本内容...&#10;&#10;例如：&#10;场景一：清晨的咖啡馆&#10;小明推门走进咖啡馆，环顾四周，找到靠窗的位置坐下。&#10;服务员走过来递上菜单。&#10;小明：「请给我一杯美式咖啡。」"
        className="min-h-[300px] resize-y text-sm leading-relaxed"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {script.length} 字
        </span>
        {isAnalyzing && onCancelAnalyze ? (
          <Button
            variant="destructive"
            onClick={onCancelAnalyze}
            className="gap-2"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            中止生成
          </Button>
        ) : (
          <Button
            onClick={onAnalyze}
            disabled={!script.trim()}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            AI 拆解分镜
          </Button>
        )}
      </div>
    </div>
  );
};

export default ScriptInput;
