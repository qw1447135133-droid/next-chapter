import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Key, Save, Database, HardDrive, Cloud, Globe, RotateCcw, Trash2, Wifi, WifiOff, Loader2 } from "lucide-react";
import { proxiedFetch } from "@/lib/gemini-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export type StorageMode = "local" | "cloud";

export interface ApiConfig {
  // 存储模式
  storageMode: StorageMode;
  // 直连模式（绕过 Edge Function 代理）
  directMode: boolean;
  // Supabase 配置
  supabaseUrl: string;
  supabaseKey: string;
  // AI API Keys
  zhanhuKey: string;
  seedance: string;
  viduKey: string;
  // API 端点
  zhanhuEndpoint: string;
  seedanceEndpoint: string;
  viduEndpoint: string;
  // 视频首帧图片压缩参数
  firstFrameMaxDim: number;
  firstFrameMaxKB: number;
}

const STORAGE_KEY = "storyforge_api_config";

// Simple obfuscation for localStorage (not true encryption, but prevents casual reading)
// Use a prefix to detect if a value is obfuscated, preventing snowball re-encoding
const OBF_PREFIX = "obf:";

function obfuscate(value: string): string {
  if (!value) return "";
  // Already obfuscated — don't double-encode
  if (value.startsWith(OBF_PREFIX)) return value;
  try { return OBF_PREFIX + btoa(unescape(encodeURIComponent(value))); } catch { return value; }
}
function deobfuscate(value: string): string {
  if (!value) return "";
  // Not obfuscated — return as-is (prevents snowball)
  if (!value.startsWith(OBF_PREFIX)) return value;
  try { return decodeURIComponent(escape(atob(value.slice(OBF_PREFIX.length)))); } catch { return value; }
}

// Keys that should be obfuscated in storage
const SENSITIVE_KEYS: (keyof ApiConfig)[] = ["zhanhuKey", "seedance", "viduKey", "supabaseKey"];

const DEFAULT_CONFIG: ApiConfig = {
  storageMode: "local",
  directMode: false,
  supabaseUrl: "",
  supabaseKey: "",
  zhanhuKey: "",
  seedance: "",
  viduKey: "",
  zhanhuEndpoint: "http://202.90.21.53:13003/v1",
  seedanceEndpoint: "http://202.90.21.53:13003/v1",
  viduEndpoint: "https://api.vidu.cn/ent/v2",
  firstFrameMaxDim: 720,
  firstFrameMaxKB: 800,
};

export function getApiConfig(): ApiConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      // Deobfuscate sensitive fields
      for (const key of SENSITIVE_KEYS) {
        if (parsed[key]) parsed[key] = deobfuscate(parsed[key]);
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

export function saveApiConfig(config: Partial<ApiConfig>): void {
  const current = getApiConfig();
  const updated = { ...current, ...config };
  // Obfuscate sensitive fields before storing
  const toStore = { ...updated } as any;
  for (const key of SENSITIVE_KEYS) {
    if (toStore[key] && typeof toStore[key] === "string") toStore[key] = obfuscate(toStore[key]);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // API connectivity test state
  const [endpointTesting, setEndpointTesting] = useState<Record<string, boolean>>({});
  const [endpointResults, setEndpointResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // For sensitive fields, we track whether user is actively editing (show real value) or not (show mask)
  const [editingField, setEditingField] = useState<string | null>(null);

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

  const handleTestEndpoint = async (name: string, endpoint: string, apiKey: string) => {
    setEndpointTesting((p) => ({ ...p, [name]: true }));
    setEndpointResults((p) => {
      const next = { ...p };
      delete next[name];
      return next;
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      let testUrl: string;
      let headers: Record<string, string> = {};

      // Only test connectivity — hit the base URL. Any response (even 4xx) means the server is reachable.
      if (name === "gemini") {
        testUrl = endpoint || DEFAULT_CONFIG.zhanhuEndpoint;
      } else if (name === "seedance") {
        testUrl = endpoint || DEFAULT_CONFIG.seedanceEndpoint;
      } else {
        testUrl = endpoint || DEFAULT_CONFIG.viduEndpoint;
      }

      const resp = await proxiedFetch(testUrl, headers, undefined, controller.signal);
      clearTimeout(timeout);

      // Any HTTP response means the server is reachable
      const status = resp.status;
      if (status >= 200 && status < 500) {
        setEndpointResults((p) => ({ ...p, [name]: { success: true, message: `连接成功 ✓（${status}）` } }));
      } else {
        setEndpointResults((p) => ({ ...p, [name]: { success: false, message: `服务器返回 ${status}` } }));
      }
    } catch (e: any) {
      clearTimeout(timeout);
      const msg = e.name === "AbortError" ? "连接超时（15s）" : `连接失败: ${e.message?.slice(0, 60)}`;
      setEndpointResults((p) => ({ ...p, [name]: { success: false, message: msg } }));
    } finally {
      setEndpointTesting((p) => ({ ...p, [name]: false }));
    }
  };

  const keyFields = [
    { key: "zhanhuKey", label: "Gemini API Key", desc: "用于剧本拆解与分镜图 AI 生成" },
    { key: "seedance", label: "Seedance API Key", desc: "用于视频片段生成" },
    { key: "viduKey", label: "Vidu API Key", desc: "用于 Vidu 视频生成" },
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
                {supabaseFields.map((f) => {
                  const isSensitive = SENSITIVE_KEYS.includes(f.key as keyof ApiConfig);
                  const hasValue = !!(config[f.key as keyof ApiConfig]);
                  const isEditing = editingField === f.key;
                  return (
                    <div key={f.key}>
                      <Label className="text-sm">{f.label}</Label>
                      <div className="relative mt-1">
                        <Input
                          type="password"
                          value={isEditing || !isSensitive ? (String(config[f.key as keyof ApiConfig] || "")) : (hasValue ? "••••••••" : "")}
                          onChange={(e) => setConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                          onFocus={() => { if (isSensitive) { setEditingField(f.key); setConfig((p) => ({ ...p, [f.key]: "" })); } }}
                          onBlur={() => setEditingField(null)}
                          placeholder={hasValue && isSensitive ? "已配置，点击可重新输入" : f.placeholder}
                          className="font-mono text-sm"
                          autoComplete="off"
                          onCopy={(e) => e.preventDefault()}
                          onCut={(e) => e.preventDefault()}
                          onDrag={(e) => e.preventDefault()}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                    </div>
                  );
                })}
                
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

        {/* 直连模式 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            网络模式
          </h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">直连模式</Label>
                  <p className="text-xs text-muted-foreground">
                    绕过 Edge Function 代理，从浏览器直接调用 API。适用于端点为 HTTPS 且支持 CORS 的情况，或使用内网 HTTP 端点时。
                  </p>
                </div>
                <Switch
                  checked={config.directMode ?? false}
                  onCheckedChange={(checked) => setConfig((p) => ({ ...p, directMode: checked }))}
                />
              </div>
              {config.directMode && (
                <div className="mt-3 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    ⚠️ 直连模式下，浏览器直接调用 API 端点。请确保端点支持 CORS 且网络可达。HTTP 端点仅在本地开发时可用（HTTPS 页面会阻止混合内容）。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* API 端点配置 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            API 端点配置
          </h2>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">自定义端点</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfig((p) => ({
                    ...p,
                    zhanhuEndpoint: DEFAULT_CONFIG.zhanhuEndpoint,
                    seedanceEndpoint: DEFAULT_CONFIG.seedanceEndpoint,
                    viduEndpoint: DEFAULT_CONFIG.viduEndpoint,
                  }))}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  恢复默认值
                </Button>
              </div>
              <CardDescription>可自定义 API 端点地址（高级选项）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { name: "gemini", label: "Gemini API 端点", configKey: "zhanhuEndpoint" as const, apiKeyField: "zhanhuKey" as const, placeholder: "http://202.90.21.53:13003/v1", hint: "只需填写 Base URL，路径会自动拼接" },
                { name: "seedance", label: "Seedance API 端点", configKey: "seedanceEndpoint" as const, apiKeyField: "seedance" as const, placeholder: "http://202.90.21.53:13003/v1", hint: "只需填写 Base URL，如 {base}/videos 会自动拼接" },
                { name: "vidu", label: "Vidu API 端点", configKey: "viduEndpoint" as const, apiKeyField: "viduKey" as const, placeholder: "https://api.vidu.cn/ent/v2", hint: "只需填写 Base URL，路径会自动拼接" },
              ].map((ep) => {
                const isTesting = endpointTesting[ep.name];
                const result = endpointResults[ep.name];
                return (
                  <div key={ep.name}>
                    <Label className="text-sm">{ep.label}</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={config[ep.configKey] || ""}
                        onChange={(e) => setConfig((p) => ({ ...p, [ep.configKey]: e.target.value }))}
                        placeholder={ep.placeholder}
                        className="font-mono text-sm flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5 h-9"
                        disabled={isTesting}
                        onClick={() => handleTestEndpoint(ep.name, config[ep.configKey], config[ep.apiKeyField])}
                      >
                        {isTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : result?.success ? (
                          <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                        ) : result ? (
                          <WifiOff className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Wifi className="h-3.5 w-3.5" />
                        )}
                        {isTesting ? "测试中" : "测试"}
                      </Button>
                    </div>
                    {result && (
                      <p className={`text-xs mt-1 ${result.success ? "text-emerald-500" : "text-destructive"}`}>
                        {result.message}
                      </p>
                    )}
                    {!result && <p className="text-xs text-muted-foreground mt-1">{ep.hint}</p>}
                  </div>
                );
              })}
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
                {(() => {
                  const hasValue = !!(config[f.key as keyof ApiConfig]);
                  const isEditing = editingField === f.key;
                  return (
                    <Input
                      type="password"
                      value={isEditing ? String(config[f.key as keyof ApiConfig] || "") : (hasValue ? "••••••••" : "")}
                      onChange={(e) => setConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                      onFocus={() => { setEditingField(f.key); setConfig((p) => ({ ...p, [f.key]: "" })); }}
                      onBlur={() => setEditingField(null)}
                      placeholder={hasValue ? "已配置，点击可重新输入" : `输入 ${f.label}`}
                      autoComplete="off"
                      onCopy={(e) => e.preventDefault()}
                      onCut={(e) => e.preventDefault()}
                      onDrag={(e) => e.preventDefault()}
                    />
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 视频首帧压缩参数 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            视频首帧图片压缩
          </h2>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">压缩参数</CardTitle>
              <CardDescription>控制发送给视频生成 API 的首帧图片质量与大小</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm">最大分辨率（像素）</Label>
                <Input
                  type="number"
                  min={256}
                  max={2048}
                  step={64}
                  value={config.firstFrameMaxDim ?? 720}
                  onChange={(e) => setConfig((p) => ({ ...p, firstFrameMaxDim: Number(e.target.value) || 720 }))}
                  className="mt-1 w-40 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">图片最长边不超过此值，范围 256–2048</p>
              </div>
              <div>
                <Label className="text-sm">最大文件大小（KB）</Label>
                <Input
                  type="number"
                  min={100}
                  max={5000}
                  step={100}
                  value={config.firstFrameMaxKB ?? 800}
                  onChange={(e) => setConfig((p) => ({ ...p, firstFrameMaxKB: Number(e.target.value) || 800 }))}
                  className="mt-1 w-40 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">压缩后图片不超过此大小，范围 100–5000 KB</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 说明 */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-2">配置说明</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>本地存储</strong>: 数据保存在浏览器 localStorage 中，无需额外配置</li>
              <li>• <strong>云端存储</strong>: 通过 Supabase 将项目数据同步到云端，支持多设备访问</li>
              <li>• <strong>站狐 API (Gemini)</strong>: 用于 AI 剧本拆解和分镜图生成</li>
              <li>• <strong>站狐 API (Seedance)</strong>: 用于视频生成</li>
              <li>• <strong>Vidu API</strong>: 独立的视频生成 API（需单独配置）</li>
            </ul>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} className="flex-1 gap-2">
            <Save className="h-4 w-4" />
            保存配置
          </Button>
          <Button
            variant="destructive"
            className="gap-2"
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              setConfig({ ...DEFAULT_CONFIG });
              toast({ title: "已清除", description: "所有 API 配置已清除，请重新输入" });
            }}
          >
            <Trash2 className="h-4 w-4" />
            清除缓存
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Settings;
