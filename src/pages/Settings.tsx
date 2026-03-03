import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Key, Eye, EyeOff, Save, Globe, Database, HardDrive, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export type StorageMode = "local" | "cloud";

export interface ApiConfig {
  // 存储模式
  storageMode: StorageMode;
  // Supabase 配置
  supabaseUrl: string;
  supabaseKey: string;
  // AI API Keys
  zhanhuKey: string;
  seedance: string;
}

const STORAGE_KEY = "storyforge_api_config";

const DEFAULT_CONFIG: ApiConfig = {
  storageMode: "local",
  supabaseUrl: "",
  supabaseKey: "",
  zhanhuKey: "",
  seedance: "",
};

export function getApiConfig(): ApiConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

export function saveApiConfig(config: Partial<ApiConfig>): void {
  const current = getApiConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function initSupabase(): void {
  const config = getApiConfig();
  if (config.supabaseUrl && config.supabaseKey) {
    (window as any).__SUPABASE_URL__ = config.supabaseUrl;
    (window as any).__SUPABASE_KEY__ = config.supabaseKey;
  }
}

const Settings = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<ApiConfig>(getApiConfig);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) });
      } catch { /* ignore */ }
    }
  }, []);

  const handleSave = () => {
    saveApiConfig(config);
    toast({ title: "已保存", description: "API 配置已保存到本地" });
  };

  const handleTestSupabase = async () => {
    if (!config.supabaseUrl || !config.supabaseKey) {
      setTestResult({ success: false, message: "请填写 Supabase URL 和 Key" });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const originalUrl = (window as any).__SUPABASE_URL__;
      const originalKey = (window as any).__SUPABASE_KEY__;
      
      (window as any).__SUPABASE_URL__ = config.supabaseUrl;
      (window as any).__SUPABASE_KEY__ = config.supabaseKey;
      
      const { createClient } = await import('@supabase/supabase-js');
      const testClient = createClient(config.supabaseUrl, config.supabaseKey);
      
      const { data, error } = await testClient.from('projects').select('id').limit(1);
      
      if (originalUrl) (window as any).__SUPABASE_URL__ = originalUrl;
      if (originalKey) (window as any).__SUPABASE_KEY__ = originalKey;
      
      if (error) {
        setTestResult({ success: false, message: `连接失败: ${error.message}` });
      } else {
        setTestResult({ success: true, message: "Supabase 连接成功!" });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `连接失败: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  const keyFields = [
    { key: "zhanhuKey", label: "Gemini API Key（站狐）", desc: "用于剧本拆解与分镜图 AI 生成" },
    { key: "seedance", label: "Seedance API Key（站狐）", desc: "用于视频片段生成" },
  ];

  const supabaseFields = [
    { key: "supabaseUrl", label: "Supabase URL", placeholder: "https://xxxxx.supabase.co", desc: "你的 Supabase 项目地址" },
    { key: "supabaseKey", label: "Supabase Anon Key", placeholder: "eyJ...", desc: "Supabase Anon Key (公开)" },
  ];

  const storageMode = config.storageMode || "local";

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold font-[Space_Grotesk]">API 设置</h1>
      </header>

      <main className="max-w-xl mx-auto p-6 space-y-6">
        <p className="text-sm text-muted-foreground">
          配置你的 API 密钥。所有配置仅保存在本地浏览器中。
        </p>

        {/* 存储模式选择 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            数据存储方式
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfig((p) => ({ ...p, storageMode: "local" as StorageMode }))}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                storageMode === "local"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <HardDrive className={`h-6 w-6 ${storageMode === "local" ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-sm font-medium ${storageMode === "local" ? "text-primary" : "text-foreground"}`}>
                本地存储
              </span>
              <span className="text-xs text-muted-foreground text-center">
                数据保存在浏览器中，无需配置
              </span>
            </button>
            <button
              type="button"
              onClick={() => setConfig((p) => ({ ...p, storageMode: "cloud" as StorageMode }))}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                storageMode === "cloud"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <Cloud className={`h-6 w-6 ${storageMode === "cloud" ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-sm font-medium ${storageMode === "cloud" ? "text-primary" : "text-foreground"}`}>
                云端存储
              </span>
              <span className="text-xs text-muted-foreground text-center">
                通过 Supabase 同步到云端
              </span>
            </button>
          </div>
        </div>

        {/* Supabase 配置 - 仅在云端模式下显示 */}
        {storageMode === "cloud" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">数据库配置</CardTitle>
                <CardDescription>连接你的 Supabase 项目以存储项目数据</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {supabaseFields.map((f) => (
                  <div key={f.key}>
                    <Label className="text-sm">{f.label}</Label>
                    <div className="relative mt-1">
                      <Input
                        type={visible[f.key] ? "text" : "password"}
                        value={config[f.key as keyof ApiConfig] || ""}
                        onChange={(e) => setConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setVisible((p) => ({ ...p, [f.key]: !p[f.key] }))}
                      >
                        {visible[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                  </div>
                ))}
                
                <div className="flex gap-2 items-center">
                  <Button 
                    variant="outline" 
                    onClick={handleTestSupabase} 
                    disabled={testing || !config.supabaseUrl || !config.supabaseKey}
                  >
                    {testing ? "测试中..." : "测试连接"}
                  </Button>
                  {testResult && (
                    <span className={`text-sm ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
                      {testResult.message}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI API Keys */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Key className="h-4 w-4" />
            AI API 密钥
          </h2>
          {keyFields.map((f) => (
            <Card key={f.key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{f.label}</CardTitle>
                <CardDescription>{f.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Input
                    type={visible[f.key] ? "text" : "password"}
                    value={config[f.key as keyof ApiConfig] || ""}
                    onChange={(e) => setConfig((p) => ({ ...p, [f.key]: e.target.value }))}
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
        </div>

        {/* 说明 */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-2">配置说明</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>本地存储</strong>: 数据保存在浏览器 localStorage 中，无需额外配置</li>
              <li>• <strong>云端存储</strong>: 通过 Supabase 将项目数据同步到云端，支持多设备访问</li>
              <li>• <strong>站狐 API</strong>: 用于 AI 剧本拆解和分镜图生成</li>
              <li>• <strong>Seedance API</strong>: 用于视频生成</li>
            </ul>
          </CardContent>
        </Card>

        <Button onClick={handleSave} className="w-full gap-2">
          <Save className="h-4 w-4" />
          保存配置
        </Button>
      </main>
    </div>
  );
};

export default Settings;
