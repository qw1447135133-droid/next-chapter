import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TARGET_MARKETS, EPISODE_COUNTS, AUDIENCES, TONES, ENDINGS } from "@/types/drama";
import type { DramaSetup } from "@/types/drama";

interface StepReferenceScriptProps {
  referenceScript: string;
  setup: DramaSetup | null;
  onComplete: (referenceScript: string, setup: DramaSetup) => void;
}

const StepReferenceScript = ({ referenceScript, setup, onComplete }: StepReferenceScriptProps) => {
  const [script, setScript] = useState(referenceScript || "");
  const [targetMarket, setTargetMarket] = useState(setup?.targetMarket || "cn");
  const [totalEpisodes, setTotalEpisodes] = useState(setup?.totalEpisodes || 60);
  const [episodeSelect, setEpisodeSelect] = useState(
    EPISODE_COUNTS.some((e) => e.value === (setup?.totalEpisodes || 60))
      ? String(setup?.totalEpisodes || 60)
      : "-1"
  );
  const [customEpisodes, setCustomEpisodes] = useState("");
  const [audience, setAudience] = useState(setup?.audience || "全龄");
  const [tone, setTone] = useState(setup?.tone || "爽");
  const [ending, setEnding] = useState(setup?.ending || "HE");

  const handleEpisodeChange = (val: string) => {
    setEpisodeSelect(val);
    if (val !== "-1") setTotalEpisodes(Number(val));
  };

  const handleSubmit = () => {
    if (!script.trim()) {
      toast({ title: "请输入参考剧本", variant: "destructive" });
      return;
    }
    if (script.trim().length < 100) {
      toast({ title: "参考剧本内容过短，请输入更完整的剧本", variant: "destructive" });
      return;
    }
    const finalEpisodes = episodeSelect === "-1" ? (Number(customEpisodes) || 60) : totalEpisodes;
    const dramaSetup: DramaSetup = {
      genres: [],
      audience,
      tone,
      ending,
      totalEpisodes: finalEpisodes,
      targetMarket,
    };
    onComplete(script, dramaSetup);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            参考剧本
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">
              粘贴或输入你想要改编的参考剧本原文，AI 将基于此进行风格转换
            </Label>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="在此粘贴参考剧本原文……&#10;&#10;可以是完整剧本、小说节选、故事大纲等任何叙事文本"
              rows={16}
              className="font-mono text-sm"
            />
            {script && (
              <p className="text-xs text-muted-foreground mt-1">
                共 {script.length} 字
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">目标市场</Label>
              <Select value={targetMarket} onValueChange={setTargetMarket}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_MARKETS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">目标集数</Label>
              <Select value={episodeSelect} onValueChange={handleEpisodeChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EPISODE_COUNTS.map((e) => (
                    <SelectItem key={e.value} value={String(e.value)} className="text-xs">
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {episodeSelect === "-1" && (
                <Input
                  type="number"
                  min={10}
                  max={200}
                  value={customEpisodes}
                  onChange={(e) => setCustomEpisodes(e.target.value)}
                  placeholder="10-200"
                  className="h-8 text-xs mt-1"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">受众</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value} className="text-xs">
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">基调</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">结局</Label>
              <Select value={ending} onValueChange={setEnding}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENDINGS.map((e) => (
                    <SelectItem key={e.value} value={e.value} className="text-xs">
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} className="gap-2" disabled={!script.trim()}>
          确认参考剧本，进入结构转换
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default StepReferenceScript;
