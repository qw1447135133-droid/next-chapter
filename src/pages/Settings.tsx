import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Key, Eye, EyeOff, Save, Globe, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface ApiConfig {
  // Supabase 配置
  supabaseUrl: string;
  supabaseKey: string;
  // AI API Keys
  zhanhuKey: string;
  seedance: string;
}

const STORAGE_KEY = "storyforge_api_config";

const DEFAULT_CONFIG: ApiConfig = {
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
    // 动态设置 Supabase 配置
    (window as any).__SUPABASE_URL__ = config.supabaseUrl;
    (window as any).__SUPABASE_KEY__ = config.supabaseKey;
  }
}

const Settings = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<ApiConfig>(getApiConfig);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      // 临时设置 Supabase 配置
      const originalUrl = (window as any).__SUPABASE_URL__;
      const originalKey = (window as any).__SUPABASE_KEY__;
      
      (window as any).__SUPABASE_URL__ = config.supabaseUrl;
      (window as any).__SUPABASE_KEY__ = config.supabaseKey;
      
      // 重新初始化 Supabase 客户端
      const { createClient } = await import('@supabase/supabase-js');
      const testClient = createClient(config.supabaseUrl, config.supabaseKey);
      
      // 测试连接
      const { data, error } = await testClient.from('projects').select('id').limit(1);
      
      // 恢复原始配置
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
    { key: "zhanhuKey", label: "站狐 API Key", desc: "用于剧本拆解与分镜图 AI 生成" },
    { key: "seedance", label: "Seedance API Key", desc: "用于视频片段生成" },
  ];

  const supabaseFields = [
    { key: "supabaseUrl", label: "Supabase URL", placeholder: "https://xxxxx.supabase.co", desc: "你的 Supabase 项目地址" },
    { key: "supabaseKey", label: "SupabaseAnon Key", placeholder: "eyJ...", desc: "Supabase Anon Key (公开)" },
  ];

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

        {/* Supabase 配置 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            Supabase 后端
          </h2>
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
              
              <div className="flex gap-2">
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
              <li>• <strong>Supabase</strong>: 用于存储项目数据（剧本、分镜等）</li>
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
