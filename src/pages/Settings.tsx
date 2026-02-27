import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Key, Eye, EyeOff, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

interface ApiKeys {
  zhanhuKey: string;
  seedance: string;
}

const STORAGE_KEY = "storyforge_api_keys";

const Settings = () => {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKeys>({ zhanhuKey: "", seedance: "" });
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setKeys(JSON.parse(saved)); } catch {}
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    toast({ title: "已保存", description: "API Key 已保存到本地" });
  };

  const fields: { key: keyof ApiKeys; label: string; desc: string }[] = [
    { key: "zhanhuKey", label: "站狐 API Key (Gemini Pro / Banana Pro)", desc: "用于剧本拆解与分镜图 AI 生成" },
    { key: "seedance", label: "Seedance 2.0 API Key", desc: "用于视频片段生成（即梦/字节跳动）" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold font-[Space_Grotesk]">API 设置</h1>
      </header>

      <main className="max-w-xl mx-auto p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          配置你的 API Key，所有密钥仅保存在本地浏览器中。后续将通过后端安全存储。
        </p>

        {fields.map((f) => (
          <Card key={f.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4 text-primary" />
                {f.label}
              </CardTitle>
              <CardDescription>{f.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Input
                  type={visible[f.key] ? "text" : "password"}
                  value={keys[f.key]}
                  onChange={(e) => setKeys((p) => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={`输入 ${f.label}`}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setVisible((p) => ({ ...p, [f.key]: !p[f.key] }))}
                >
                  {visible[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button onClick={handleSave} className="w-full gap-2">
          <Save className="h-4 w-4" />
          保存设置
        </Button>
      </main>
    </div>
  );
};

export default Settings;
