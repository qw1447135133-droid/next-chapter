import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  FolderCog,
  FolderOpen,
  Globe,
  Key,
  Loader2,
  Moon,
  Save,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  clearApiConfig,
  DEFAULT_API_CONFIG,
  getStoredApiConfig,
  loadBuiltinApiBundleFromDisk,
  saveBuiltinApiBundle,
  saveApiConfig,
  type BuiltinApiBundle,
  type ApiConfig,
} from "@/lib/api-config";
import { cn } from "@/lib/utils";

type ProviderId = "gemini" | "gpt" | "claude" | "grok" | "seedream" | "jimeng" | "tuzi";

const API_ROWS: Array<{
  id: ProviderId;
  title: string;
  endpointPlaceholder: string;
  endpointHint: string;
  keyHint: string;
  models: string;
}> = [
  {
    id: "gemini",
    title: "Gemini API",
    endpointPlaceholder: "https://api.tu-zi.com/v1beta",
    endpointHint: "Gemini 模型的 API 根地址。留空使用默认值（仅限内置 API）。其他模型留空时会回退到此地址。",
    keyHint: "Gemini API Key。其他模型留空时会回退到此 Key。",
    models: "gemini-3-pro, gemini-3-pro-thinking, gemini-3-flash-preview, gemini-3-pro-image-preview",
  },
  {
    id: "gpt",
    title: "GPT API",
    endpointPlaceholder: "https://api.tu-zi.com/v1",
    endpointHint: "GPT 模型的 API 根地址。留空时复用 Gemini API 端点。",
    keyHint: "GPT API Key。留空时复用 Gemini API Key。",
    models: "gpt-5.4, gpt-5.4-mini",
  },
  {
    id: "claude",
    title: "Claude API",
    endpointPlaceholder: "https://api.tu-zi.com/v1",
    endpointHint: "Claude 模型的 API 根地址。留空时复用 Gemini API 端点。",
    keyHint: "Claude API Key。留空时复用 Gemini API Key。",
    models: "claude-sonnet-4-6, claude-sonnet-4-6-thinking, claude-opus-4-6",
  },
  {
    id: "grok",
    title: "Grok API",
    endpointPlaceholder: "https://api.tu-zi.com/v1",
    endpointHint: "Grok 模型的 API 根地址。留空时复用 Gemini API 端点。",
    keyHint: "Grok API Key。留空时复用 Gemini API Key。",
    models: "grok-4.1",
  },
  {
    id: "seedream",
    title: "Seedream API",
    endpointPlaceholder: "https://api.tu-zi.com/v1beta",
    endpointHint: "Seedream 图片生成 API 根地址。留空时复用 Gemini API 端点。",
    keyHint: "Seedream API Key。留空时复用 Gemini API Key。",
    models: "doubao-seedream-5-0-260128",
  },
  {
    id: "jimeng",
    title: "Seedance API",
    endpointPlaceholder: "https://api.tu-zi.com/v1beta",
    endpointHint: "Seedance 视频生成 API 根地址。留空时复用 Gemini API 端点。",
    keyHint: "Seedance API Key。留空时复用 Gemini API Key。",
    models: "doubao-seedance-1-5-pro_720p, doubao-seedance-1-5-pro_1080p",
  },
  {
    id: "tuzi",
    title: "Sora API",
    endpointPlaceholder: "https://api.tuziapi.com",
    endpointHint: "Sora 视频生成 API 根地址。留空使用默认值（仅限内置 API）。",
    keyHint: "Sora API Key。",
    models: "sora-2, sora-2-pro",
  },
];

const ENDPOINT_FIELD_MAP = {
  gemini: "geminiEndpoint",
  gpt: "gptEndpoint",
  claude: "claudeEndpoint",
  grok: "grokEndpoint",
  seedream: "seedreamEndpoint",
  jimeng: "jimengEndpoint",
  tuzi: "tuziEndpoint",
} as const;

const KEY_FIELD_MAP = {
  gemini: "geminiKey",
  gpt: "gptKey",
  claude: "claudeKey",
  grok: "grokKey",
  seedream: "seedreamKey",
  jimeng: "jimengKey",
  tuzi: "tuziKey",
} as const;

type SettingsProps = {
  embedded?: boolean;
  onClose?: () => void;
};

export default function Settings({ embedded = false, onClose }: SettingsProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<ApiConfig>(() => getStoredApiConfig());
  const [defaultStoragePath, setDefaultStoragePath] = useState("");
  const [defaultDownloadPath, setDefaultDownloadPath] = useState("");
  const [adminPasswordDialogOpen, setAdminPasswordDialogOpen] = useState(false);
  const [builtinEditorOpen, setBuiltinEditorOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [builtinDraft, setBuiltinDraft] = useState<BuiltinApiBundle>({
    geminiEndpoint: "",
    geminiKey: "",
    gptEndpoint: "",
    gptKey: "",
    claudeEndpoint: "",
    claudeKey: "",
    grokEndpoint: "",
    grokKey: "",
    seedreamEndpoint: "",
    seedreamKey: "",
    jimengEndpoint: "",
    jimengKey: "",
    tuziEndpoint: "",
    tuziKey: "",
    modelMappings: {},
  });
  const [builtinSaving, setBuiltinSaving] = useState(false);

  useEffect(() => {
    const loadDefaultPath = async () => {
      if (!window.electronAPI?.storage?.getDefaultPath) return;
      try {
        const paths = await window.electronAPI.storage.getDefaultPath();
        setDefaultStoragePath(paths.files);
        setDefaultDownloadPath(paths.files);
      } catch (error) {
        console.error("加载默认路径失败:", error);
      }
    };
    void loadDefaultPath();
  }, []);

  const handleSave = () => {
    saveApiConfig(config);
    setConfig(getStoredApiConfig());
    toast({ title: "已保存", description: "设置已保存到本地。" });
  };

  const handleOpenBuiltinAdminDialog = async () => {
    try {
      const latest = await loadBuiltinApiBundleFromDisk();
      if (latest) {
        setBuiltinDraft(latest);
      }
      setAdminPassword("");
      setAdminPasswordDialogOpen(true);
    } catch (error) {
      toast({
        title: "读取失败",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const handleVerifyBuiltinAdminPassword = async () => {
    const verify = window.electronAPI?.runtime?.verifyBuiltinApiAdminPassword;
    if (!verify) {
      toast({
        title: "当前环境不支持",
        description: "仅桌面端可验证管理员密码。",
        variant: "destructive",
      });
      return;
    }
    const isValid = await verify(adminPassword);
    if (!isValid) {
      toast({
        title: "管理员密码错误",
        description: "请输入正确的管理员密码后再修改内置 API。",
        variant: "destructive",
      });
      return;
    }
    setAdminPassword("");
    setAdminPasswordDialogOpen(false);
    setBuiltinEditorOpen(true);
  };

  const setBuiltinField = (
    field: Exclude<keyof BuiltinApiBundle, "modelMappings">,
    value: string,
  ) => {
    setBuiltinDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveBuiltinApi = async () => {
    setBuiltinSaving(true);
    try {
      await saveBuiltinApiBundle({
        ...builtinDraft,
        modelMappings: builtinDraft.modelMappings || {},
      });
      setBuiltinEditorOpen(false);
      toast({
        title: "内置 API 已更新",
        description: "新的 API Key 已写入内置配置，当前运行可立即生效。",
      });
    } catch (error) {
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBuiltinSaving(false);
    }
  };

  const handleClear = () => {
    clearApiConfig();
    setConfig({ ...DEFAULT_API_CONFIG });
    toast({ title: "已清除", description: "所有设置已恢复默认值。" });
  };

  const handleSelectStoragePath = async () => {
    if (!window.electronAPI?.storage?.selectFolder) return;
    try {
      const folderPath = await window.electronAPI.storage.selectFolder();
      if (!folderPath) return;
      saveApiConfig({ storagePath: folderPath });
      setConfig((prev) => ({ ...prev, storagePath: folderPath }));
      toast({ title: "已保存", description: `存储路径：${folderPath}` });
    } catch (error) {
      toast({ title: "选择失败", description: String(error), variant: "destructive" });
    }
  };

  const handleResetStoragePath = () => {
    saveApiConfig({ storagePath: "" });
    setConfig((prev) => ({ ...prev, storagePath: "" }));
    toast({ title: "已重置", description: "存储路径已恢复默认值。" });
  };

  const handleSelectReverseDownloadPath = async () => {
    if (!window.electronAPI?.storage?.selectFolder) return;
    try {
      const folderPath = await window.electronAPI.storage.selectFolder();
      if (!folderPath) return;
      saveApiConfig({ reverseDownloadPath: folderPath });
      setConfig((prev) => ({ ...prev, reverseDownloadPath: folderPath }));
      toast({ title: "已保存", description: `下载路径：${folderPath}` });
    } catch (error) {
      toast({ title: "选择失败", description: String(error), variant: "destructive" });
    }
  };

  const handleResetReverseDownloadPath = () => {
    saveApiConfig({ reverseDownloadPath: "" });
    setConfig((prev) => ({ ...prev, reverseDownloadPath: "" }));
    toast({ title: "已重置", description: "逆向下载目录已恢复默认值。" });
  };

  const sectionTitleClass = embedded ? "text-[12px] font-medium flex items-center gap-2 text-slate-700" : "text-sm font-medium flex items-center gap-2";
  const cardClass = embedded ? "border-white/80 bg-white/72 shadow-[0_10px_24px_rgba(148,163,184,0.08)]" : "";
  const cardContentClass = embedded ? "pt-5 space-y-3.5" : "pt-6 space-y-4";
  const compactInputClass = embedded ? "font-mono text-[12.5px] h-10" : "font-mono text-sm";
  const gridClass = embedded ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 md:grid-cols-2 gap-6";

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col bg-transparent" : "min-h-screen bg-background"}>
      {!embedded && (
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold font-[Space_Grotesk]">设置</h1>
        </header>
      )}

      {embedded && (
        <div className="flex items-center justify-between border-b border-[#ddd5c9] px-5 py-4">
          <div>
            <h1 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-slate-900">设置</h1>
            <p className="mt-1 text-[12.5px] text-slate-500">在首页内调整模型、路径与界面行为。</p>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full border border-[#e5ddd2] bg-white/78 text-slate-700 hover:bg-white"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <main className={embedded ? "flex-1 overflow-y-auto px-5 py-5 space-y-5" : "max-w-3xl mx-auto px-6 py-6 space-y-6"}>
        <div className="space-y-3">
          <h2 className={sectionTitleClass}>
            <Globe className="h-4 w-4" />
            API 设置
          </h2>

          <Card className={cardClass}>
            <CardContent className={cardContentClass}>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-medium">内置 API</h3>
                  <Badge variant="secondary">唯一模式</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  当前版本已移除自定义 API 选项，程序运行时始终使用内置 API 配置。旧的本地自定义配置会自动忽略。
                </p>
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={embedded ? "h-9 gap-1.5 rounded-full border-[#ddd5c9] bg-white/80 px-3 text-[12.5px] hover:bg-white" : "gap-1.5"}
                  onClick={() => void handleOpenBuiltinAdminDialog()}
                  disabled={!window.electronAPI?.storage?.writeText}
                >
                  <Key className="h-4 w-4" />
                  修改内置 API
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={adminPasswordDialogOpen} onOpenChange={setAdminPasswordDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>输入管理员密码</DialogTitle>
              <DialogDescription>验证通过后，才可以直接在程序内修改内置 API Key。</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">管理员密码</Label>
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleVerifyBuiltinAdminPassword();
                  }
                }}
                placeholder="请输入管理员密码"
                className="font-mono text-sm"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdminPasswordDialogOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={() => void handleVerifyBuiltinAdminPassword()}>
                验证
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={builtinEditorOpen} onOpenChange={setBuiltinEditorOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>修改内置 API</DialogTitle>
              <DialogDescription>
                保存后会直接写入内置配置文件。API 地址留空将使用默认值。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {API_ROWS.map((row) => {
                const endpointField = ENDPOINT_FIELD_MAP[row.id];
                const keyField = KEY_FIELD_MAP[row.id];
                return (
                  <div key={row.id} className="rounded-md border border-border/50 p-4 space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{row.title}</span>
                        <Badge variant="outline">{row.id}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">支持的模型：</span>{row.models}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">API 地址</Label>
                      <Input
                        value={String(builtinDraft[endpointField] ?? "")}
                        onChange={(e) => setBuiltinField(endpointField, e.target.value)}
                        placeholder={row.endpointPlaceholder}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">{row.endpointHint}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">API Key</Label>
                      <Input
                        type="password"
                        value={String(builtinDraft[keyField] ?? "")}
                        onChange={(e) => setBuiltinField(keyField, e.target.value)}
                        placeholder="请输入 API Key"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">{row.keyHint}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBuiltinEditorOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={() => void handleSaveBuiltinApi()} disabled={builtinSaving}>
                {builtinSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                保存内置 API
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="space-y-3">
          <h2 className={sectionTitleClass}>
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            外观设置
          </h2>
          <Card className={cardClass}>
            <CardContent className={embedded ? "pt-5" : "pt-6"}>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">深色模式</Label>
                  <p className="text-xs text-muted-foreground">切换亮色 / 深色界面主题。</p>
                </div>
                <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className={sectionTitleClass}>
            <FolderOpen className="h-4 w-4" />
            存储位置
          </h2>
          <Card className={cardClass}>
            <CardContent className={cardContentClass}>
              <div>
                <Label className="text-sm">缓存存储路径</Label>
                <div className={embedded ? "mt-1.5 space-y-2" : "mt-1.5 flex gap-2"}>
                  <Input
                    value={
                      config.storagePath ||
                      defaultStoragePath ||
                      (window.electronAPI?.storage ? "正在获取路径..." : "仅桌面端可显示本地路径")
                    }
                    readOnly
                    className={cn(compactInputClass, !embedded && "flex-1")}
                  />
                  <Button
                    variant="outline"
                    className={cn(
                      embedded
                        ? "h-9 w-full justify-center gap-1.5 rounded-full border-[#ddd5c9] bg-white/80 px-3 text-[12.5px] hover:bg-white"
                        : "shrink-0 gap-1.5",
                    )}
                    onClick={handleSelectStoragePath}
                    disabled={!window.electronAPI?.storage?.selectFolder}
                  >
                    <FolderCog className="h-4 w-4" />
                    设置路径
                  </Button>
                </div>
                {config.storagePath ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("mt-2 text-xs text-muted-foreground", embedded && "px-0 hover:bg-transparent")}
                    onClick={handleResetStoragePath}
                  >
                    恢复默认
                  </Button>
                ) : null}
              </div>
              <div>
                <Label className="text-sm">逆向下载路径</Label>
                <div className={embedded ? "mt-1.5 space-y-2" : "mt-1.5 flex gap-2"}>
                  <Input
                    value={
                      config.reverseDownloadPath ||
                      defaultDownloadPath ||
                      (window.electronAPI?.storage ? "正在获取路径..." : "仅桌面端可显示本地路径")
                    }
                    readOnly
                    className={cn(compactInputClass, !embedded && "flex-1")}
                  />
                  <Button
                    variant="outline"
                    className={cn(
                      embedded
                        ? "h-9 w-full justify-center gap-1.5 rounded-full border-[#ddd5c9] bg-white/80 px-3 text-[12.5px] hover:bg-white"
                        : "shrink-0 gap-1.5",
                    )}
                    onClick={handleSelectReverseDownloadPath}
                    disabled={!window.electronAPI?.storage?.selectFolder}
                  >
                    <FolderCog className="h-4 w-4" />
                    设置路径
                  </Button>
                </div>
                {config.reverseDownloadPath ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("mt-2 text-xs text-muted-foreground", embedded && "px-0 hover:bg-transparent")}
                    onClick={handleResetReverseDownloadPath}
                  >
                    恢复默认
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className={sectionTitleClass}>首帧图片压缩</h2>
          <Card className={cardClass}>
            <CardContent className={embedded ? "pt-5" : "pt-6"}>
              <div className={gridClass}>
                <div>
                  <Label className="text-sm">最大尺寸</Label>
                  <Input
                    type="number"
                    min={256}
                    max={2048}
                    step={64}
                    value={config.firstFrameMaxDim ?? 2048}
                    onChange={(e) => setConfig((prev) => ({ ...prev, firstFrameMaxDim: Number(e.target.value) || 2048 }))}
                    className={cn(compactInputClass, "mt-1")}
                  />
                </div>
                <div>
                  <Label className="text-sm">最大文件大小（KB）</Label>
                  <Input
                    type="number"
                    min={100}
                    max={5000}
                    step={100}
                    value={config.firstFrameMaxKB ?? 1024}
                    onChange={(e) => setConfig((prev) => ({ ...prev, firstFrameMaxKB: Number(e.target.value) || 1024 }))}
                    className={cn(compactInputClass, "mt-1")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className={sectionTitleClass}>网络重试</h2>
          <Card className={cardClass}>
            <CardContent className={embedded ? "pt-5" : "pt-6"}>
              <div className={gridClass}>
                <div>
                  <Label className="text-sm">最大重试次数</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={1}
                    value={config.retryCount ?? 2}
                    onChange={(e) => setConfig((prev) => ({ ...prev, retryCount: Number(e.target.value) || 0 }))}
                    className={cn(compactInputClass, "mt-1")}
                  />
                </div>
                <div>
                  <Label className="text-sm">重试间隔（毫秒）</Label>
                  <Input
                    type="number"
                    min={500}
                    max={30000}
                    step={500}
                    value={config.retryDelayMs ?? 3000}
                    onChange={(e) => setConfig((prev) => ({ ...prev, retryDelayMs: Number(e.target.value) || 3000 }))}
                    className={cn(compactInputClass, "mt-1")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className={cn("bg-muted/50", embedded && "border-white/70 bg-white/52")}>
          <CardContent className={embedded ? "pt-5" : "pt-6"}>
            <h3 className="font-medium mb-2">说明</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>设置页已移除自定义 API 选项，程序始终使用内置 API。</li>
              <li>历史版本遗留的自定义 API 本地配置会在读取和保存时自动清理。</li>
              <li>即梦 / Seedance 默认可复用 Gemini 网关与 Key。</li>
            </ul>
          </CardContent>
        </Card>

        <div
          className={cn(
            embedded
              ? "sticky bottom-0 -mx-5 border-t border-[#ddd5c9] bg-[#f4f1ea]/95 px-5 pb-5 pt-4 backdrop-blur"
              : "",
          )}
        >
          <div className={cn(embedded ? "flex flex-col gap-2" : "flex gap-3")}>
          <Button onClick={handleSave} className={cn("gap-2", embedded ? "h-10 w-full rounded-full bg-slate-950 text-white hover:bg-slate-900" : "flex-1")}>
            <Save className="h-4 w-4" />
            保存设置
          </Button>
          <Button
            variant="destructive"
            className={cn("gap-2", embedded && "h-10 w-full rounded-full")}
            onClick={handleClear}
          >
            <Trash2 className="h-4 w-4" />
            清除本地缓存
          </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
