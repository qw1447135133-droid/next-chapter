import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { ArrowLeft, Key, Save, Database, HardDrive, FolderOpen, Globe, Server, RotateCcw, Trash2, Wifi, WifiOff, Loader2, Moon, Sun } from "lucide-react";
import { proxiedFetch } from "@/lib/gemini-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

export type ProxyMode = "supabase" | "fc";

export interface ApiConfig {
  // 存储路径（本地文件存储）
  localPath: string;
  // 代理模式：supabase(默认)、fc(阿里云FC)
  proxyMode: ProxyMode;
  // 阿里云FC代理地址（当 proxyMode 为 fc 时使用）
  fcProxyUrl: string;
  // Supabase 配置
  supabaseUrl: string;
  supabaseKey: string;
  // AI API Keys
  zhanhuKey: string;
  jimeng: string;
  viduKey: string;
  klingKey: string;
  // API 端点
  zhanhuEndpoint: string;
  jimengEndpoint: string;
  viduEndpoint: string;
  klingEndpoint: string;
  // 即梦逆向自动化 API 端点（auto_jimeng Python 服务）
  autoJimengEndpoint: string;
  // 视频首帧图片压缩参数
  firstFrameMaxDim: number;
  firstFrameMaxKB: number;
  // 网络重试参数
  retryCount: number;
  retryDelayMs: number;
}

const STORAGE_KEY = "storyforge_api_config";

// Simple obfuscation for localStorage (not true encryption, but prevents casual reading)
// Use a prefix to detect if a value is obfuscated, preventing snowball re-encoding
const OBF_PREFIX = "obf:";

function obfuscate(value: string): string {
  if (!value) return "";
  // Already obfuscated — don't double-encode
  if (value.startsWith(OBF_PREFIX)) return value;
  try {return OBF_PREFIX + btoa(unescape(encodeURIComponent(value)));} catch {return value;}
}
function deobfuscate(value: string): string {
  if (!value) return "";
  // Not obfuscated — return as-is (prevents snowball)
  if (!value.startsWith(OBF_PREFIX)) return value;
  try {return decodeURIComponent(escape(atob(value.slice(OBF_PREFIX.length))));} catch {return value;}
}

// Keys that should be obfuscated in storage
const SENSITIVE_KEYS: (keyof ApiConfig)[] = ["zhanhuKey", "jimeng", "viduKey", "klingKey", "supabaseKey"];

const DEFAULT_CONFIG: ApiConfig = {
  localPath: "",
  proxyMode: "supabase",
  fcProxyUrl: "",
  supabaseUrl: "",
  supabaseKey: "",
  zhanhuKey: "",
  jimeng: "",
  viduKey: "",
  klingKey: "",
  zhanhuEndpoint: "http://202.90.21.53:13003/v1beta",
  jimengEndpoint: "http://202.90.21.53:13003/v1",
  viduEndpoint: "https://api.vidu.cn/ent/v2",
  klingEndpoint: "",
  autoJimengEndpoint: "http://localhost:8000",
  firstFrameMaxDim: 2048,
  firstFrameMaxKB: 1024,
  retryCount: 2,
  retryDelayMs: 3000
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
  } catch {/* ignore */}
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
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<ApiConfig>(getApiConfig);
  const [defaultPath, setDefaultPath] = useState<string>("");

  // API connectivity test state
  const [endpointTesting, setEndpointTesting] = useState<Record<string, boolean>>({});
  const [endpointResults, setEndpointResults] = useState<Record<string, {success: boolean;message: string;}>>({});

  // For sensitive fields, we track whether user is actively editing (show real value) or not (show mask)
  const [editingField, setEditingField] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) });
      } catch {/* ignore */}
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.storage) {
      window.electronAPI.storage.getDefaultPath().then((paths) => {
        setDefaultPath(paths.files);
        if (!config.localPath) {
          setConfig((p) => ({ ...p, localPath: paths.files }));
        }
      });
    }
  }, []);

  const handleSave = () => {
    saveApiConfig(config);
    toast({ title: "已保存", description: "API 配置已保存到本地" });
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
      } else if (name === "jimeng") {
        testUrl = endpoint || DEFAULT_CONFIG.jimengEndpoint;
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
  { key: "zhanhuKey", label: "Google API Key", desc: "用于剧本拆解与分镜图 AI 生成" },
  { key: "jimeng", label: "即梦 API Key", desc: "用于视频片段生成" },
  { key: "viduKey", label: "Vidu API Key", desc: "用于 Vidu 视频生成" },
  { key: "klingKey", label: "可灵 API Key", desc: "用于可灵视频生成" }];

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold font-[Space_Grotesk]">设置</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* 外观设置 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            外观设置
          </h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">暗色模式</Label>
                  <p className="text-xs text-muted-foreground">
                    切换明亮/暗色界面主题
                  </p>
                </div>
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="text-sm text-muted-foreground">
          配置你的 API 密钥。所有配置仅保存在本地浏览器中。
        </p>

        {/* 数据存储位置 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            数据存储位置
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-sm">本地存储路径</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={config.localPath || defaultPath || ""}
                    onChange={(e) => setConfig((p) => ({ ...p, localPath: e.target.value }))}
                    placeholder={defaultPath || "选择或输入存储文件夹路径"}
                    className="font-mono text-sm flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (window.electronAPI?.storage) {
                        const folder = await window.electronAPI.storage.selectFolder();
                        if (folder) setConfig((p) => ({ ...p, localPath: folder }));
                      }
                    }}>
                    <FolderOpen className="h-4 w-4 mr-1" />
                    选择
                  </Button>
                  {(config.localPath || defaultPath) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.electronAPI?.storage?.openFolder(config.localPath || defaultPath)}>
                      打开
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  默认：应用文件夹下的 files 文件夹
                  {defaultPath && !config.localPath && `（${defaultPath}）`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 网络模式选择 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            网络模式
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfig((p) => ({ ...p, proxyMode: "supabase" as ProxyMode }))}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${
              config.proxyMode === "supabase" ?
              "border-primary bg-primary/5 shadow-sm" :
              "border-border hover:border-muted-foreground/30"}`
              }>
              <Server className={`h-5 w-5 ${config.proxyMode === "supabase" ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-xs font-medium ${config.proxyMode === "supabase" ? "text-primary" : "text-foreground"}`}>
                Supabase
              </span>
              <span className="text-[10px] text-muted-foreground text-center">
                Edge Function 代理
              </span>
            </button>
            <button
              type="button"
              onClick={() => setConfig((p) => ({ ...p, proxyMode: "fc" as ProxyMode }))}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${
              config.proxyMode === "fc" ?
              "border-primary bg-primary/5 shadow-sm" :
              "border-border hover:border-muted-foreground/30"}`
              }>
              <Server className={`h-5 w-5 ${config.proxyMode === "fc" ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-xs font-medium ${config.proxyMode === "fc" ? "text-primary" : "text-foreground"}`}>
                阿里云 FC
              </span>
              <span className="text-[10px] text-muted-foreground text-center">
                轻量代理
              </span>
            </button>
          </div>

        </div>

        {/* API 端点配置 - 仅在非 FC 模式下显示 */}
        {config.proxyMode !== "fc" && (
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
                    jimengEndpoint: DEFAULT_CONFIG.jimengEndpoint,
                    autoJimengEndpoint: DEFAULT_CONFIG.autoJimengEndpoint,
                  }))}>
                  
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  恢复默认值
                </Button>
              </div>
              <CardDescription>可自定义 API 端点地址（高级选项）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
              { name: "gemini", label: "Google API 端点", configKey: "zhanhuEndpoint" as const, apiKeyField: "zhanhuKey" as const, placeholder: "http://202.90.21.53:13003/v1beta", hint: "只需填写 Base URL，路径会自动拼接" },
              { name: "jimeng", label: "即梦 API 端点", configKey: "jimengEndpoint" as const, apiKeyField: "jimeng" as const, placeholder: "http://202.90.21.53:13003/v1", hint: "只需填写 Base URL，如 {base}/videos 会自动拼接" },
              { name: "vidu", label: "Vidu API 端点", configKey: "viduEndpoint" as const, apiKeyField: "viduKey" as const, placeholder: "https://api.vidu.cn/ent/v2", hint: "只需填写 Base URL，路径会自动拼接" },
              { name: "kling", label: "可灵 API 端点", configKey: "klingEndpoint" as const, apiKeyField: "klingKey" as const, placeholder: "https://api.klingai.com", hint: "只需填写 Base URL，路径会自动拼接" },
              { name: "autoJimeng", label: "即梦逆向自动化端点", configKey: "autoJimengEndpoint" as const, apiKeyField: "" as const, placeholder: "http://localhost:8000", hint: "auto_jimeng Python 服务的地址，需先启动服务" }].
              map((ep) => {
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
                        className="font-mono text-sm flex-1" />
                      
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5 h-9"
                        disabled={isTesting}
                        onClick={() => handleTestEndpoint(ep.name, config[ep.configKey], config[ep.apiKeyField])}>
                        
                        {isTesting ?
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                        result?.success ?
                        <Wifi className="h-3.5 w-3.5 text-emerald-500" /> :
                        result ?
                        <WifiOff className="h-3.5 w-3.5 text-destructive" /> :

                        <Wifi className="h-3.5 w-3.5" />
                        }
                        {isTesting ? "测试中" : "测试"}
                      </Button>
                    </div>
                    {result &&
                    <p className={`text-xs mt-1 ${result.success ? "text-emerald-500" : "text-destructive"}`}>
                        {result.message}
                      </p>
                    }
                    {!result && <p className="text-xs text-muted-foreground mt-1">{ep.hint}</p>}
                  </div>);

              })}
            </CardContent>
          </Card>
        </div>
        )}

        {/* AI API 密钥 — FC 模式下完全隐藏（端点与密钥由 FC 环境变量管理） */}
        {config.proxyMode !== "fc" && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Key className="h-4 w-4" />
            AI API 密钥
          </h2>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">API 密钥配置</CardTitle>
              <CardDescription>配置各 AI 服务的 API 密钥</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {keyFields.map((f) => {
                const hasValue = !!config[f.key as keyof ApiConfig];
                const isEditing = editingField === f.key;
                return (
                  <div key={f.key}>
                    <Label className="text-sm">{f.label}</Label>
                    <Input
                      type="password"
                      value={isEditing ? String(config[f.key as keyof ApiConfig] || "") : hasValue ? "••••••••" : ""}
                      onChange={(e) => setConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                      onFocus={() => {setEditingField(f.key);setConfig((p) => ({ ...p, [f.key]: "" }));}}
                      onBlur={() => setEditingField(null)}
                      placeholder={hasValue ? "已配置，点击可重新输入" : `输入 ${f.label}`}
                      className="font-mono text-sm mt-1"
                      autoComplete="off"
                      onCopy={(e) => e.preventDefault()}
                      onCut={(e) => e.preventDefault()}
                      onDrag={(e) => e.preventDefault()} />

                    <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                  </div>);
              })}
            </CardContent>
          </Card>
        </div>
        )}

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
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div className="min-w-0 space-y-1">
                <Label className="text-sm">最大分辨率（像素）</Label>
                <Input
                  type="number"
                  min={256}
                  max={2048}
                  step={64}
                  value={config.firstFrameMaxDim ?? 2048}
                  onChange={(e) => setConfig((p) => ({ ...p, firstFrameMaxDim: Number(e.target.value) || 2048 }))}
                  className="font-mono text-sm w-full max-w-[200px]" />
                <p className="text-xs text-muted-foreground">图片最长边不超过此值，范围 256–2048</p>
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="text-sm">最大文件大小（KB）</Label>
                <Input
                  type="number"
                  min={100}
                  max={5000}
                  step={100}
                  value={config.firstFrameMaxKB ?? 1024}
                  onChange={(e) => setConfig((p) => ({ ...p, firstFrameMaxKB: Number(e.target.value) || 1024 }))}
                  className="font-mono text-sm w-full max-w-[200px]" />
                <p className="text-xs text-muted-foreground">压缩后图片不超过此大小，范围 100–5000 KB</p>
              </div>
            </CardContent>
          </Card>

          {/* 网络重试 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">网络重试</CardTitle>
              <CardDescription>代理请求失败时的自动重试策略</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div className="min-w-0 space-y-1">
                <Label className="text-sm">最大重试次数</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  step={1}
                  value={config.retryCount ?? 2}
                  onChange={(e) => setConfig((p) => ({ ...p, retryCount: Number(e.target.value) || 0 }))}
                  className="font-mono text-sm w-full max-w-[200px]" />
                <p className="text-xs text-muted-foreground">0 表示不重试，最大 5 次</p>
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="text-sm">重试间隔（毫秒）</Label>
                <Input
                  type="number"
                  min={500}
                  max={30000}
                  step={500}
                  value={config.retryDelayMs ?? 3000}
                  onChange={(e) => setConfig((p) => ({ ...p, retryDelayMs: Number(e.target.value) || 3000 }))}
                  className="font-mono text-sm w-full max-w-[200px]" />
                <p className="text-xs text-muted-foreground">每次重试前等待的时间，范围 500–30000ms</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 说明 */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-2">配置说明</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>本地存储</strong>: 项目文件保存在本地指定路径，默认位于应用文件夹的 files 文件夹</li>
              <li>• <strong>Supabase</strong>: 通过 Edge Function 代理转发 API 请求</li>
              <li>• <strong>阿里云 FC</strong>: 通过函数计算代理转发 API 请求，适合生产环境部署</li>
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
            }}>
            
            <Trash2 className="h-4 w-4" />
            清除缓存
          </Button>
        </div>
      </main>
    </div>);

};

export default Settings;