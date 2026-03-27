import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  Save,
  Trash2,
  Moon,
  Sun,
  FolderOpen,
  FolderCog,
  Key,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

export interface ApiConfig {
  geminiEndpoint: string;
  geminiKey: string;
  /** 即梦 / 豆包 Seedance 视频等（与 Gemini 网关可不同） */
  jimengEndpoint: string;
  jimengKey: string;
  viduEndpoint: string;
  viduKey: string;
  klingEndpoint: string;
  klingKey: string;
  /** 本地即梦自动化 Python 服务（Electron / 网页手动启动） */
  autoJimengApiBase: string;
  // 视频首帧图片压缩参数
  firstFrameMaxDim: number;
  firstFrameMaxKB: number;
  // 网络重试参数
  retryCount: number;
  retryDelayMs: number;
  // 存储路径（为空时使用默认路径）
  storagePath?: string;
}

const STORAGE_KEY = "storyforge_api_config";

// Simple obfuscation for localStorage (not true encryption, but prevents casual reading)
const OBF_PREFIX = "obf:";

function obfuscate(value: string): string {
  if (!value) return "";
  if (value.startsWith(OBF_PREFIX)) return value;
  try {
    return OBF_PREFIX + btoa(unescape(encodeURIComponent(value)));
  } catch {
    return value;
  }
}
function deobfuscate(value: string): string {
  if (!value) return "";
  if (!value.startsWith(OBF_PREFIX)) return value;
  try {
    return decodeURIComponent(escape(atob(value.slice(OBF_PREFIX.length))));
  } catch {
    return value;
  }
}

const SENSITIVE_KEYS: (keyof ApiConfig)[] = [
  "geminiKey",
  "jimengKey",
  "viduKey",
  "klingKey",
];

const DEFAULT_CONFIG: ApiConfig = {
  geminiEndpoint: "",
  geminiKey: "",
  jimengEndpoint: "",
  jimengKey: "",
  viduEndpoint: "",
  viduKey: "",
  klingEndpoint: "",
  klingKey: "",
  autoJimengApiBase: "http://localhost:8000",
  firstFrameMaxDim: 2048,
  firstFrameMaxKB: 1024,
  retryCount: 2,
  retryDelayMs: 3000,
  storagePath: "",
};

export function getApiConfig(): ApiConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      const merged = { ...DEFAULT_CONFIG, ...parsed } as ApiConfig;

      if (
        typeof parsed.apiEndpoint === "string" &&
        parsed.apiEndpoint &&
        !merged.geminiEndpoint
      ) {
        merged.geminiEndpoint = parsed.apiEndpoint;
      }
      if (typeof parsed.apiKey === "string" && parsed.apiKey && !merged.geminiKey) {
        merged.geminiKey = parsed.apiKey;
      }

      const je =
        typeof merged.jimengEndpoint === "string"
          ? merged.jimengEndpoint.trim()
          : "";
      if (je && /localhost|127\.0\.0\.1|:8000/i.test(je)) {
        merged.autoJimengApiBase = je;
        merged.jimengEndpoint = "";
      }

      for (const key of SENSITIVE_KEYS) {
        const v = merged[key];
        if (typeof v === "string" && v) (merged as any)[key] = deobfuscate(v);
      }
      return merged;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CONFIG;
}

export function saveApiConfig(config: Partial<ApiConfig>): void {
  const current = getApiConfig();
  const updated = { ...current, ...config };
  const toStore = { ...updated } as Record<string, unknown>;
  for (const key of SENSITIVE_KEYS) {
    const v = toStore[key];
    if (typeof v === "string" && v)
      toStore[key] = obfuscate(v as string);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
}

const API_ROWS: {
  id: "gemini" | "jimeng" | "vidu" | "kling";
  title: string;
  endpointPlaceholder: string;
  endpointHint: string;
  keyHint: string;
}[] = [
  {
    id: "gemini",
    title: "Gemini（文本 / 图像 / 分镜等）",
    endpointPlaceholder: "https://api.example.com/v1beta",
    endpointHint:
      "Gemini 兼容网关根地址，留空则使用内置默认地址；需与下方密钥配套。",
    keyHint: "用于上述 Gemini 网关的 Bearer Token。",
  },
  {
    id: "jimeng",
    title: "即梦视频 / Seedance（豆包视频）",
    endpointPlaceholder: "https://api.example.com/v1beta",
    endpointHint:
      "即梦及豆包 Seedance 视频接口所在根地址，可与 Gemini 相同或不同；留空时可复用 Gemini 端点。若 OneAPI 路由分组不正确导致 503，请检查 OneAPI 中该 API Key 对应的分组是否包含 doubao-seedance 模型。",
    keyHint: "即梦视频线路密钥；留空且已填 Gemini Key 时将尝试复用。",
  },
  {
    id: "vidu",
    title: "Vidu",
    endpointPlaceholder: "https://api.vidu.cn/ent/v2",
    endpointHint: "留空则使用 Vidu 官方地址。",
    keyHint: "Vidu API Key。",
  },
  {
    id: "kling",
    title: "可灵 Kling",
    endpointPlaceholder: "https://api.klingai.com",
    endpointHint: "留空则使用可灵官方地址。",
    keyHint: "Kling API Key。",
  },
];

const Settings = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<ApiConfig>(() => getApiConfig());
  const [defaultStoragePath, setDefaultStoragePath] = useState<string>("");

  useEffect(() => {
    const loadDefaultPath = async () => {
      if (window.electronAPI?.storage?.getDefaultPath) {
        try {
          const paths = await window.electronAPI.storage.getDefaultPath();
          setDefaultStoragePath(paths.files);
        } catch (e) {
          console.error("获取默认存储路径失败:", e);
        }
      }
    };
    loadDefaultPath();
  }, []);

  useEffect(() => {
    setConfig(getApiConfig());
  }, []);

  const handleSave = () => {
    saveApiConfig(config);
    toast({ title: "已保存", description: "配置已保存到本地" });
  };

  const handleSelectStoragePath = async () => {
    if (window.electronAPI?.storage?.selectFolder) {
      try {
        const folderPath = await window.electronAPI.storage.selectFolder();
        if (folderPath) {
          saveApiConfig({ storagePath: folderPath });
          setConfig((p) => ({ ...p, storagePath: folderPath }));
          toast({ title: "已保存", description: `存储路径: ${folderPath}` });
        }
      } catch (e) {
        toast({
          title: "选择失败",
          description: String(e),
          variant: "destructive",
        });
      }
    }
  };

  const handleResetStoragePath = () => {
    saveApiConfig({ storagePath: "" });
    setConfig((p) => ({ ...p, storagePath: "" }));
    toast({ title: "已重置", description: "存储路径已恢复为默认位置" });
  };

  const endpointField = (
    id: (typeof API_ROWS)[number]["id"],
  ): keyof ApiConfig => {
    const map = {
      gemini: "geminiEndpoint",
      jimeng: "jimengEndpoint",
      vidu: "viduEndpoint",
      kling: "klingEndpoint",
    } as const;
    return map[id];
  };

  const keyField = (id: (typeof API_ROWS)[number]["id"]): keyof ApiConfig => {
    const map = {
      gemini: "geminiKey",
      jimeng: "jimengKey",
      vidu: "viduKey",
      kling: "klingKey",
    } as const;
    return map[id];
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold font-[Space_Grotesk]">设置</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            API 配置
          </h2>

          {/* 窗口一：端点 */}
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div>
                <h3 className="text-sm font-medium">API 端点</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  按服务商分别填写基础地址；留空项在调用时使用各服务默认官方地址（Gemini
                  线路使用内置默认网关）。
                </p>
              </div>
              {API_ROWS.map((row) => (
                <div
                  key={row.id}
                  className="space-y-1.5 pb-5 border-b border-border/40 last:border-0 last:pb-0"
                >
                  <Label className="text-sm font-medium">{row.title}</Label>
                  <Input
                    value={String(config[endpointField(row.id)] ?? "")}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        [endpointField(row.id)]: e.target.value,
                      }))
                    }
                    placeholder={row.endpointPlaceholder}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {row.endpointHint}
                  </p>
                </div>
              ))}
              <div className="space-y-1.5 pt-1">
                <Label className="text-sm font-medium">
                  即梦自动化（本地服务）
                </Label>
                <Input
                  value={config.autoJimengApiBase || ""}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      autoJimengApiBase: e.target.value,
                    }))
                  }
                  placeholder="http://localhost:8000"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  桌面版 / 网页连接本地 Python 即梦自动化 API 时使用，与上方视频网关无关。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 窗口二：密钥 */}
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div>
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  API 密钥
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  密钥仅保存在本机浏览器存储中（简单混淆，非加密）。
                </p>
              </div>
              {API_ROWS.map((row) => (
                <div
                  key={row.id}
                  className="space-y-1.5 pb-5 border-b border-border/40 last:border-0 last:pb-0"
                >
                  <Label className="text-sm font-medium">{row.title}</Label>
                  <Input
                    type="password"
                    value={String(config[keyField(row.id)] ?? "")}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        [keyField(row.id)]: e.target.value,
                      }))
                    }
                    placeholder="请输入 API Key"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">{row.keyHint}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* 外观设置 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            {theme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
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
                  onCheckedChange={(checked) =>
                    setTheme(checked ? "dark" : "light")
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 存储位置设置 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            存储位置
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-sm">缓存文件存储位置</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    value={
                      config.storagePath ||
                      defaultStoragePath ||
                      (window.electronAPI?.storage
                        ? "正在获取路径…"
                        : "（仅 Electron 桌面版显示本地路径）")
                    }
                    readOnly
                    className="font-mono text-sm flex-1"
                  />
                  <Button
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    onClick={handleSelectStoragePath}
                    disabled={!window.electronAPI?.storage?.selectFolder}
                  >
                    <FolderCog className="h-4 w-4" />
                    设置存储位置
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  默认位置为程序目录下的{" "}
                  <code className="text-[11px]">files</code> 文件夹
                  {defaultStoragePath ? `：${defaultStoragePath}` : ""}
                </p>
                {config.storagePath && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs text-muted-foreground"
                    onClick={handleResetStoragePath}
                  >
                    恢复默认位置
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 视频首帧压缩参数 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium">视频首帧图片压缩</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-sm">最大分辨率（像素）</Label>
                  <Input
                    type="number"
                    min={256}
                    max={2048}
                    step={64}
                    value={config.firstFrameMaxDim ?? 2048}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        firstFrameMaxDim: Number(e.target.value) || 2048,
                      }))
                    }
                    className="font-mono text-sm mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    图片最长边不超过此值，范围 256–2048
                  </p>
                </div>
                <div>
                  <Label className="text-sm">最大文件大小（KB）</Label>
                  <Input
                    type="number"
                    min={100}
                    max={5000}
                    step={100}
                    value={config.firstFrameMaxKB ?? 1024}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        firstFrameMaxKB: Number(e.target.value) || 1024,
                      }))
                    }
                    className="font-mono text-sm mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    压缩后图片不超过此大小，范围 100–5000 KB
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 网络重试 */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium">网络重试</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-sm">最大重试次数</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={1}
                    value={config.retryCount ?? 2}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        retryCount: Number(e.target.value) || 0,
                      }))
                    }
                    className="font-mono text-sm mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    0 表示不重试，最大 5 次
                  </p>
                </div>
                <div>
                  <Label className="text-sm">重试间隔（毫秒）</Label>
                  <Input
                    type="number"
                    min={500}
                    max={30000}
                    step={500}
                    value={config.retryDelayMs ?? 3000}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        retryDelayMs: Number(e.target.value) || 3000,
                      }))
                    }
                    className="font-mono text-sm mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    每次重试前等待的时间，范围 500–30000ms
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-2">配置说明</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>
                • 所有服务均直接调用配置的 API，无需阿里云 FC。
              </li>
              <li>
                • Gemini 与即梦视频可共用同一网关；若只配一份 Key，即梦视频在未单独填写
                Key 时会尝试使用 Gemini Key。
              </li>
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
              toast({ title: "已清除", description: "所有配置已清除" });
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
