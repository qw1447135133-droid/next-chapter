import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Sparkles, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SetupMode } from "@/pages/ScriptCreator";
import {
  DramaProject,
  DramaSetup,
  GENRES,
  AUDIENCES,
  TONES,
  ENDINGS,
  TARGET_MARKETS,
  EPISODE_COUNTS,
} from "@/types/drama";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  project: DramaProject;
  onUpdate: (partial: Partial<DramaProject>) => void;
  onNext: () => void;
  setupMode: SetupMode;
  onSetupModeChange: (mode: SetupMode) => void;
  creativeInput: string;
  onCreativeInputChange: (v: string) => void;
  creativeFile: string;
  onCreativeFileChange: (v: string) => void;
}

const StepSetup = ({
  project,
  onUpdate,
  onNext,
  setupMode,
  onSetupModeChange,
  creativeInput,
  onCreativeInputChange,
  creativeFile,
  onCreativeFileChange,
}: Props) => {
  const setup: DramaSetup = project.setup ?? {
    genres: [],
    audience: "",
    tone: "",
    ending: "",
    totalEpisodes: 60,
    targetMarket: "cn",
    customTopic: "",
  };

  const [customEpCount, setCustomEpCount] = useState<number | "">(
    EPISODE_COUNTS.find((e) => e.value === setup.totalEpisodes) ? "" : setup.totalEpisodes
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateSetup = (partial: Partial<DramaSetup>) => {
    onUpdate({ setup: { ...setup, ...partial } });
  };

  const toggleGenre = (g: string) => {
    const genres = setup.genres.includes(g)
      ? setup.genres.filter((x) => x !== g)
      : setup.genres.length < 2
      ? [...setup.genres, g]
      : setup.genres;
    updateSetup({ genres });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await supabase.functions.invoke("parse-document", { body: formData });
      if (data?.text) {
        onCreativeFileChange(data.text);
        toast({ title: "文件解析成功", description: `提取了 ${data.text.length} 个字符` });
      }
    } catch {
      toast({ title: "解析失败", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const canProceed =
    setupMode === "creative"
      ? (creativeInput.trim().length > 10 || creativeFile.length > 0)
      : (setup.genres.length > 0 && setup.audience && setup.tone && setup.ending && setup.totalEpisodes > 0 && setup.targetMarket);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Mode Toggle */}
      <div className="flex justify-center">
        <div className="relative flex items-center bg-muted rounded-full p-1">
          <button
            onClick={() => onSetupModeChange("topic")}
            className={cn(
              "relative z-10 flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-colors",
              setupMode === "topic" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BookOpen className="h-4 w-4" />
            选题创作
          </button>
          <button
            onClick={() => onSetupModeChange("creative")}
            className={cn(
              "relative z-10 flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-colors",
              setupMode === "creative" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-4 w-4" />
            创意创作
          </button>
          {/* Sliding highlight */}
          <motion.div
            layoutId="setup-mode-pill"
            className="absolute top-1 bottom-1 rounded-full bg-primary"
            style={{ width: "calc(50% - 4px)" }}
            animate={{ x: setupMode === "topic" ? 0 : "calc(100% + 8px)" }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {setupMode === "topic" ? (
          <motion.div
            key="topic"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {/* Genre */}
            <Section title="题材类型" subtitle="最多选 2 个">
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <Chip
                    key={g.value}
                    label={g.label}
                    desc={g.desc}
                    selected={setup.genres.includes(g.value)}
                    onClick={() => toggleGenre(g.value)}
                  />
                ))}
              </div>
            </Section>

            {/* Audience */}
            <Section title="目标受众">
              <div className="flex flex-wrap gap-2">
                {AUDIENCES.map((a) => (
                  <Chip
                    key={a.value}
                    label={a.label}
                    selected={setup.audience === a.value}
                    onClick={() => updateSetup({ audience: a.value })}
                  />
                ))}
              </div>
            </Section>

            {/* Tone */}
            <Section title="故事基调">
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <Chip
                    key={t.value}
                    label={t.label}
                    selected={setup.tone === t.value}
                    onClick={() => updateSetup({ tone: t.value })}
                  />
                ))}
              </div>
            </Section>

            {/* Ending */}
            <Section title="结局类型">
              <div className="flex flex-wrap gap-2">
                {ENDINGS.map((e) => (
                  <Chip
                    key={e.value}
                    label={e.label}
                    selected={setup.ending === e.value}
                    onClick={() => updateSetup({ ending: e.value })}
                  />
                ))}
              </div>
            </Section>

            {/* Target Market */}
            <Section title="目标市场">
              <div className="flex flex-wrap gap-2">
                {TARGET_MARKETS.map((m) => (
                  <Chip
                    key={m.value}
                    label={m.label}
                    desc={m.desc}
                    selected={setup.targetMarket === m.value}
                    onClick={() => updateSetup({ targetMarket: m.value })}
                  />
                ))}
              </div>
            </Section>

            {/* Episode Count */}
            <Section title="总集数">
              <div className="flex flex-wrap gap-2 items-center">
                {EPISODE_COUNTS.map((e) => (
                  <Chip
                    key={e.value}
                    label={e.label}
                    selected={
                      e.value === -1
                        ? !EPISODE_COUNTS.slice(0, -1).some((ep) => ep.value === setup.totalEpisodes)
                        : setup.totalEpisodes === e.value
                    }
                    onClick={() => {
                      if (e.value === -1) {
                        updateSetup({ totalEpisodes: typeof customEpCount === "number" ? customEpCount : 50 });
                      } else {
                        updateSetup({ totalEpisodes: e.value });
                        setCustomEpCount("");
                      }
                    }}
                  />
                ))}
                {!EPISODE_COUNTS.slice(0, -1).some((ep) => ep.value === setup.totalEpisodes) && (
                  <input
                    type="number"
                    min={10}
                    max={200}
                    value={setup.totalEpisodes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (v >= 10 && v <= 200) {
                        updateSetup({ totalEpisodes: v });
                        setCustomEpCount(v);
                      }
                    }}
                    className="w-20 h-9 rounded-md border border-input bg-background px-2 text-sm text-center"
                  />
                )}
              </div>
            </Section>

            {/* Custom Topic */}
            <Section title="补充描述" subtitle="可选">
              <Textarea
                placeholder="可以补充你对剧情、人物或风格的任何想法…"
                value={setup.customTopic || ""}
                onChange={(e) => updateSetup({ customTopic: e.target.value })}
                className="min-h-[80px] resize-y"
              />
            </Section>
          </motion.div>
        ) : (
          <motion.div
            key="creative"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="text-center space-y-2 mb-6">
              <h2 className="text-xl font-semibold font-[Space_Grotesk]">输入你的创意</h2>
              <p className="text-sm text-muted-foreground">
                描述你的创意灵感、故事概念或核心冲突，AI 将基于你的创意生成完整的创作方案
              </p>
            </div>

            <Textarea
              placeholder="在这里输入你的创意想法…&#10;&#10;例如：&#10;• 一个关于人工智能觉醒的故事，AI 开始拥有情感，在虚拟与现实之间做出抉择&#10;• 双胞胎姐妹身份互换，一个在豪门一个在贫民窟，某天发现了真相&#10;• 快递员意外获得读心术，开始利用这个能力改变命运"
              value={creativeInput}
              onChange={(e) => onCreativeInputChange(e.target.value)}
              className="min-h-[200px] resize-y text-base leading-relaxed"
            />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">或者</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                "hover:border-primary/50 hover:bg-primary/5",
                creativeFile ? "border-primary/30 bg-primary/5" : "border-border"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.docx,.doc"
                onChange={handleFileUpload}
                className="hidden"
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <span className="text-sm text-muted-foreground">解析中…</span>
                </div>
              ) : creativeFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-primary" />
                  <span className="text-sm text-foreground font-medium">
                    文档已上传（{creativeFile.length} 字）
                  </span>
                  <span className="text-xs text-muted-foreground">点击重新上传</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    上传创意文档（支持 TXT / PDF / DOCX）
                  </span>
                </div>
              )}
            </div>

            {/* Minimal settings for creative mode */}
            <div className="grid grid-cols-2 gap-6 pt-4">
              <Section title="目标市场">
                <div className="flex flex-wrap gap-2">
                  {TARGET_MARKETS.map((m) => (
                    <Chip
                      key={m.value}
                      label={m.label}
                      selected={setup.targetMarket === m.value}
                      onClick={() => updateSetup({ targetMarket: m.value })}
                    />
                  ))}
                </div>
              </Section>
              <Section title="总集数">
                <div className="flex flex-wrap gap-2 items-center">
                  {EPISODE_COUNTS.slice(0, -1).map((e) => (
                    <Chip
                      key={e.value}
                      label={e.label}
                      selected={setup.totalEpisodes === e.value}
                      onClick={() => updateSetup({ totalEpisodes: e.value })}
                    />
                  ))}
                </div>
              </Section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next */}
      <div className="flex justify-end pt-4">
        <Button onClick={onNext} disabled={!canProceed} size="lg" className="px-8">
          下一步：创作方案
        </Button>
      </div>
    </div>
  );
};

/* ─── Helpers ─── */

const Section = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <div className="flex items-baseline gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
    {children}
  </div>
);

const Chip = ({
  label,
  desc,
  selected,
  onClick,
}: {
  label: string;
  desc?: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    title={desc}
    className={cn(
      "px-3 py-1.5 rounded-full text-sm border transition-all",
      selected
        ? "bg-primary text-primary-foreground border-primary shadow-sm"
        : "bg-background border-border text-foreground hover:border-primary/50 hover:bg-primary/5"
    )}
  >
    {label}
  </button>
);

export default StepSetup;
