import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  Download,
  FolderCog,
  FolderOpen,
  Globe,
  Key,
  Loader2,
  Moon,
  Save,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  resolveApiConfigForRuntime,
  resolveConfiguredModelNameFromConfig,
  saveBuiltinApiBundle,
  saveApiConfig,
  SUPPORTED_MODEL_MAPPINGS,
  type BuiltinApiBundle,
  type ApiConfig,
  type ApiMode,
} from "@/lib/api-config";
import { DEFAULT_GEMINI_BASE_URL } from "@/lib/gemini-client";

type ProviderId = "gemini" | "jimeng" | "vidu" | "kling";
type TestStatus = "idle" | "testing" | "success" | "error";
type TestStateMap = Record<string, { status: TestStatus; message?: string }>;

const API_ROWS: Array<{
  id: ProviderId;
  title: string;
  endpointPlaceholder: string;
  endpointHint: string;
  keyHint: string;
}> = [
  {
    id: "gemini",
    title: "Gemini",
    endpointPlaceholder: "https://api.tu-zi.com/v1beta",
    endpointHint: "Gemini 兼容网关的根地址。",
    keyHint: "Gemini 兼容网关对应的 Bearer Token。",
  },
  {
    id: "jimeng",
    title: "即梦 / Seedance",
    endpointPlaceholder: "https://api.tu-zi.com/v1beta",
    endpointHint: "Seedance 视频网关根地址。留空时复用 Gemini 端点。",
    keyHint: "Seedance 视频 API Key。留空时复用 Gemini Key。",
  },
  {
    id: "vidu",
    title: "Vidu",
    endpointPlaceholder: "https://api.vidu.cn/ent/v2",
    endpointHint: "Vidu API 根地址。",
    keyHint: "Vidu API Key。",
  },
  {
    id: "kling",
    title: "Kling",
    endpointPlaceholder: "https://api.klingai.com",
    endpointHint: "Kling API 根地址。",
    keyHint: "Kling API Key。",
  },
];

const ENDPOINT_FIELD_MAP = {
  gemini: "geminiEndpoint",
  jimeng: "jimengEndpoint",
  vidu: "viduEndpoint",
  kling: "klingEndpoint",
} as const;

const KEY_FIELD_MAP = {
  gemini: "geminiKey",
  jimeng: "jimengKey",
  vidu: "viduKey",
  kling: "klingKey",
} as const;

export default function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<ApiConfig>(() => getStoredApiConfig());
  const [defaultStoragePath, setDefaultStoragePath] = useState("");
  const [defaultDownloadPath, setDefaultDownloadPath] = useState("");
  const [providerOpen, setProviderOpen] = useState<Record<ProviderId, boolean>>({
    gemini: true,
    jimeng: false,
    vidu: false,
    kling: false,
  });
  const [testState, setTestState] = useState<TestStateMap>({});
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [adminPasswordDialogOpen, setAdminPasswordDialogOpen] = useState(false);
  const [builtinEditorOpen, setBuiltinEditorOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [builtinDraft, setBuiltinDraft] = useState<BuiltinApiBundle>({
    geminiEndpoint: "",
    geminiKey: "",
    jimengEndpoint: "",
    jimengKey: "",
    viduEndpoint: "",
    viduKey: "",
    klingEndpoint: "",
    klingKey: "",
    modelMappings: {},
  });
  const [builtinSaving, setBuiltinSaving] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

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

  const groupedModelMappings = useMemo(
    () => ({
      text: SUPPORTED_MODEL_MAPPINGS.filter((item) => item.category === "text"),
      image: SUPPORTED_MODEL_MAPPINGS.filter((item) => item.category === "image"),
      video: SUPPORTED_MODEL_MAPPINGS.filter((item) => item.category === "video"),
    }),
    [],
  );

  const selectedModel = useMemo(
    () => SUPPORTED_MODEL_MAPPINGS.find((item) => item.key === selectedModelKey) || null,
    [selectedModelKey],
  );

  const setProviderField = (provider: ProviderId, kind: "endpoint" | "key", value: string) => {
    const field = kind === "endpoint" ? ENDPOINT_FIELD_MAP[provider] : KEY_FIELD_MAP[provider];
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const updateTestState = (key: string, status: TestStatus, message?: string) => {
    setTestState((prev) => ({ ...prev, [key]: { status, message } }));
  };

  const updateModelMapping = (modelKey: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      modelMappings: {
        ...(prev.modelMappings || {}),
        [modelKey]: value,
      },
    }));
  };

  const handleApiModeChange = (mode: ApiMode) => {
    setConfig((prev) => ({ ...prev, apiMode: mode }));
  };

  const handleSave = () => {
    saveApiConfig(config);
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

  const handleExportCustomConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "next-chapter-api-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCustomConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ApiConfig>;
      setConfig((prev) => ({
        ...prev,
        ...parsed,
        apiMode: parsed.apiMode === "builtin" ? "builtin" : "custom",
        modelMappings: {
          ...(prev.modelMappings || {}),
          ...(parsed.modelMappings || {}),
        },
      }));
      toast({ title: "已导入", description: `已读取 ${file.name}` });
    } catch (error) {
      toast({
        title: "导入失败",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };
  const handleTestProvider = async (provider: ProviderId) => {
    const stateKey = `provider:${provider}`;
    updateTestState(stateKey, "testing", "测试中...");
    try {
      const runtimeConfig = resolveApiConfigForRuntime(config);

      if (provider === "gemini") {
        const baseUrl = (runtimeConfig.geminiEndpoint || DEFAULT_GEMINI_BASE_URL)
          .replace(/\/v1beta(\/.*)?$/, "")
          .replace(/\/v1(\/.*)?$/, "");
        const modelName = resolveConfiguredModelNameFromConfig(runtimeConfig, "gemini-3-pro");
        const resp = await fetch(`${baseUrl}/v1beta/models/${modelName}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeConfig.geminiKey}`,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Reply with OK only." }] }],
            generationConfig: { maxOutputTokens: 8, temperature: 0 },
          }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(`${resp.status}: ${text.slice(0, 160)}`);
        }
        updateTestState(stateKey, "success", "Gemini 端点可用。");
        return;
      }

      if (provider === "jimeng") {
        const rawBase = runtimeConfig.jimengEndpoint || runtimeConfig.geminiEndpoint || DEFAULT_GEMINI_BASE_URL;
        const baseUrl = rawBase.replace(/\/v1beta(\/.*)?$/, "").replace(/\/v1(\/.*)?$/, "");
        const resp = await fetch(`${baseUrl}/models`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${runtimeConfig.jimengKey || runtimeConfig.geminiKey}`,
          },
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(`${resp.status}: ${text.slice(0, 160)}`);
        }
        updateTestState(stateKey, "success", "Seedance 端点可用。");
        return;
      }

      if (provider === "vidu") {
        const baseUrl = String(runtimeConfig.viduEndpoint || "https://api.vidu.cn/ent/v2").replace(/\/$/, "");
        const resp = await fetch(`${baseUrl}/tasks/test/creations`, {
          method: "GET",
          headers: { Authorization: `Bearer ${runtimeConfig.viduKey}` },
        });
        if (resp.status === 401 || resp.status === 403) {
          throw new Error(`鉴权失败 (${resp.status})`);
        }
        updateTestState(stateKey, "success", `Vidu 已连通 (${resp.status})。`);
        return;
      }

      const baseUrl = String(runtimeConfig.klingEndpoint || "https://api.klingai.com").replace(/\/$/, "");
      const resp = await fetch(`${baseUrl}/v1/videos/text2video/test`, {
        method: "GET",
        headers: { Authorization: `Bearer ${runtimeConfig.klingKey}` },
      });
      if (resp.status === 401 || resp.status === 403) {
        throw new Error(`鉴权失败 (${resp.status})`);
      }
      updateTestState(stateKey, "success", `Kling 已连通 (${resp.status})。`);
    } catch (error) {
      updateTestState(stateKey, "error", error instanceof Error ? error.message : String(error));
    }
  };

  const handleTestModelMapping = async (
    modelKey: string,
    provider: ProviderId,
    category: "text" | "image" | "video",
  ) => {
    const stateKey = `${provider}:${modelKey}`;
    updateTestState(stateKey, "testing", "测试中...");
    try {
      const runtimeConfig = resolveApiConfigForRuntime(config);
      const mappedModel = resolveConfiguredModelNameFromConfig(runtimeConfig, modelKey);

      if (provider === "gemini" && category === "text") {
        const baseUrl = (runtimeConfig.geminiEndpoint || DEFAULT_GEMINI_BASE_URL)
          .replace(/\/v1beta(\/.*)?$/, "")
          .replace(/\/v1(\/.*)?$/, "");
        const resp = await fetch(`${baseUrl}/v1beta/models/${mappedModel}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeConfig.geminiKey}`,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Reply with OK only." }] }],
            generationConfig: { maxOutputTokens: 8, temperature: 0 },
          }),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(`${resp.status}: ${text.slice(0, 160)}`);
        }
        updateTestState(stateKey, "success", `模型可用：${mappedModel}`);
        return;
      }

      if (provider === "jimeng" && category === "video") {
        const rawBase = runtimeConfig.jimengEndpoint || runtimeConfig.geminiEndpoint || DEFAULT_GEMINI_BASE_URL;
        const baseUrl = rawBase.replace(/\/v1beta(\/.*)?$/, "").replace(/\/v1(\/.*)?$/, "");
        const resp = await fetch(`${baseUrl}/models`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${runtimeConfig.jimengKey || runtimeConfig.geminiKey}`,
          },
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(`${resp.status}: ${text.slice(0, 160)}`);
        }
        const payload = await resp.json().catch(() => ({}));
        if (!JSON.stringify(payload).includes(mappedModel)) {
          throw new Error(`服务商返回结果中未找到模型：${mappedModel}`);
        }
        updateTestState(stateKey, "success", `模型可用：${mappedModel}`);
        return;
      }

      updateTestState(stateKey, "error", "当前仅支持在线测试 Gemini 文本模型和 Seedance 视频模型。");
    } catch (error) {
      updateTestState(stateKey, "error", error instanceof Error ? error.message : String(error));
    }
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
            API 设置
          </h2>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="text-sm font-medium">模式</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  选择内置 API 时隐藏自定义 API 配置；选择自定义 API 时按层级展开服务商和模型详情。
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                <button type="button" onClick={() => handleApiModeChange("builtin")} className={`px-4 py-1.5 rounded-md text-sm transition-colors ${config.apiMode === "builtin" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>内置 API</button>
                <button type="button" onClick={() => handleApiModeChange("custom")} className={`px-4 py-1.5 rounded-md text-sm transition-colors ${config.apiMode === "custom" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>自定义 API</button>
              </div>
              {config.apiMode === "builtin" ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void handleOpenBuiltinAdminDialog()}
                    disabled={!window.electronAPI?.storage?.writeText}
                  >
                    <Key className="h-4 w-4" />
                    修改内置 API
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportCustomConfig} />
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleExportCustomConfig}><Download className="h-4 w-4" />导出自定义配置</Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => importRef.current?.click()}><Upload className="h-4 w-4" />导入自定义配置</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {config.apiMode === "custom" ? (
            <>
              <Card>
                <CardContent className="pt-6 space-y-5">
                  <div>
                    <h3 className="text-sm font-medium">服务商配置</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">点击服务商卡片后展开 URL、Key 和端点测试。</p>
                  </div>
                  {API_ROWS.map((row) => (
                    <Collapsible key={row.id} open={providerOpen[row.id]} onOpenChange={() => setProviderOpen((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}>
                      <div className="rounded-md border border-border/50">
                        <CollapsibleTrigger asChild>
                          <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium">{row.title}</span><Badge variant="outline">{row.id}</Badge></div>
                              <p className="text-xs text-muted-foreground truncate">{String(config[ENDPOINT_FIELD_MAP[row.id]] || row.endpointPlaceholder)}</p>
                            </div>
                            <div className="text-xs text-muted-foreground">{providerOpen[row.id] ? "收起" : "展开"}</div>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border-t border-border/40 px-4 py-4 space-y-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => handleTestProvider(row.id)} disabled={testState[`provider:${row.id}`]?.status === "testing"}>{testState[`provider:${row.id}`]?.status === "testing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}测试端点</Button>
                            {testState[`provider:${row.id}`]?.message ? <span className={`text-xs ${testState[`provider:${row.id}`]?.status === "success" ? "text-emerald-600" : "text-red-600"}`}>{testState[`provider:${row.id}`]?.message}</span> : null}
                          </div>
                          <div className="space-y-1.5"><Label className="text-sm font-medium">API 地址</Label><Input value={String(config[ENDPOINT_FIELD_MAP[row.id]] ?? "")} onChange={(e) => setProviderField(row.id, "endpoint", e.target.value)} placeholder={row.endpointPlaceholder} className="font-mono text-sm" /><p className="text-xs text-muted-foreground">{row.endpointHint}</p></div>
                          <div className="space-y-1.5"><Label className="text-sm font-medium">API Key</Label><Input type="password" value={String(config[KEY_FIELD_MAP[row.id]] ?? "")} onChange={(e) => setProviderField(row.id, "key", e.target.value)} placeholder="请输入 API Key" className="font-mono text-sm" /><p className="text-xs text-muted-foreground">{row.keyHint}</p></div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-5">
                  <div>
                    <h3 className="text-sm font-medium">模型映射</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">点击某一项，例如“文本模型 &gt; Gemini 3 Pro”，即可在弹窗中编辑这一项模型映射。</p>
                    <p className="text-xs text-muted-foreground mt-1">当前在线测试支持 Gemini 文本模型和 Seedance 视频模型。</p>
                  </div>
                  {(["text", "image", "video"] as const).map((category) => {
                    const items = groupedModelMappings[category];
                    const categoryLabel = category === "text" ? "文本模型" : category === "image" ? "图片模型" : "视频模型";
                    return (
                      <div key={category} className="space-y-3 pb-5 border-b border-border/40 last:border-0 last:pb-0">
                        <Label className="text-sm font-medium">{categoryLabel}</Label>
                        <div className="space-y-2">
                          {items.map((item) => {
                            const currentValue = config.modelMappings?.[item.key] || item.defaultModelName;
                            return (
                              <button key={item.key} type="button" onClick={() => { setSelectedModelKey(item.key); setModelDialogOpen(true); }} className="flex w-full items-center justify-between rounded-md border border-border/50 px-4 py-3 text-left hover:bg-accent/40 transition-colors">
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium">{item.label}</span><Badge variant="outline">{item.provider}</Badge></div>
                                  <p className="text-xs text-muted-foreground truncate">{currentValue}</p>
                                </div>
                                <div className="text-xs text-muted-foreground">进入</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        <Dialog open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedModel?.label || "模型映射"}</DialogTitle>
              <DialogDescription>{selectedModel ? `内部模型 ID：${selectedModel.key}` : "请选择一个模型进行编辑。"}</DialogDescription>
            </DialogHeader>
            {selectedModel ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap"><Badge variant="outline">{selectedModel.provider}</Badge><Badge variant="secondary">{selectedModel.category}</Badge><Badge variant="outline">{selectedModel.key}</Badge></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">真实模型名</Label><Input value={config.modelMappings?.[selectedModel.key] ?? ""} onChange={(e) => updateModelMapping(selectedModel.key, e.target.value)} placeholder={selectedModel.defaultModelName} className="font-mono text-sm" /></div>
                <div className="flex items-center gap-2 flex-wrap"><Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={testState[`${selectedModel.provider}:${selectedModel.key}`]?.status === "testing"} onClick={() => handleTestModelMapping(selectedModel.key, selectedModel.provider, selectedModel.category)}>{testState[`${selectedModel.provider}:${selectedModel.key}`]?.status === "testing" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}测试该模型</Button>{testState[`${selectedModel.provider}:${selectedModel.key}`]?.message ? <span className={`text-xs ${testState[`${selectedModel.provider}:${selectedModel.key}`]?.status === "success" ? "text-emerald-600" : "text-red-600"}`}>{testState[`${selectedModel.provider}:${selectedModel.key}`]?.message}</span> : null}</div>
              </div>
            ) : null}
            <DialogFooter><Button type="button" onClick={() => setModelDialogOpen(false)}>完成</Button></DialogFooter>
          </DialogContent>
        </Dialog>

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
              <DialogDescription>保存后会直接写入内置配置文件，不需要再手动编辑 JSON。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {API_ROWS.map((row) => {
                const endpointField = ENDPOINT_FIELD_MAP[row.id];
                const keyField = KEY_FIELD_MAP[row.id];
                return (
                  <div key={row.id} className="rounded-md border border-border/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{row.title}</span>
                      <Badge variant="outline">{row.id}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">API 地址</Label>
                      <Input
                        value={String(builtinDraft[endpointField] ?? "")}
                        onChange={(e) => setBuiltinField(endpointField, e.target.value)}
                        placeholder={row.endpointPlaceholder}
                        className="font-mono text-sm"
                      />
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

        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">{theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}外观设置</h2>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div className="space-y-1"><Label className="text-sm font-medium">深色模式</Label><p className="text-xs text-muted-foreground">切换亮色 / 深色界面主题。</p></div><Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} /></div></CardContent></Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2"><FolderOpen className="h-4 w-4" />存储位置</h2>
          <Card><CardContent className="pt-6 space-y-4">
            <div><Label className="text-sm">缓存存储路径</Label><div className="flex gap-2 mt-1.5"><Input value={config.storagePath || defaultStoragePath || (window.electronAPI?.storage ? "正在获取路径..." : "仅桌面端可显示本地路径")} readOnly className="font-mono text-sm flex-1" /><Button variant="outline" className="shrink-0 gap-1.5" onClick={handleSelectStoragePath} disabled={!window.electronAPI?.storage?.selectFolder}><FolderCog className="h-4 w-4" />设置路径</Button></div>{config.storagePath ? <Button variant="ghost" size="sm" className="mt-2 text-xs text-muted-foreground" onClick={handleResetStoragePath}>恢复默认</Button> : null}</div>
            <div><Label className="text-sm">逆向下载路径</Label><div className="flex gap-2 mt-1.5"><Input value={config.reverseDownloadPath || defaultDownloadPath || (window.electronAPI?.storage ? "正在获取路径..." : "仅桌面端可显示本地路径")} readOnly className="font-mono text-sm flex-1" /><Button variant="outline" className="shrink-0 gap-1.5" onClick={handleSelectReverseDownloadPath} disabled={!window.electronAPI?.storage?.selectFolder}><FolderCog className="h-4 w-4" />设置路径</Button></div>{config.reverseDownloadPath ? <Button variant="ghost" size="sm" className="mt-2 text-xs text-muted-foreground" onClick={handleResetReverseDownloadPath}>恢复默认</Button> : null}</div>
          </CardContent></Card>
        </div>

        <div className="space-y-4"><h2 className="text-sm font-medium">首帧图片压缩</h2><Card><CardContent className="pt-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><Label className="text-sm">最大尺寸</Label><Input type="number" min={256} max={2048} step={64} value={config.firstFrameMaxDim ?? 2048} onChange={(e) => setConfig((prev) => ({ ...prev, firstFrameMaxDim: Number(e.target.value) || 2048 }))} className="font-mono text-sm mt-1" /></div><div><Label className="text-sm">最大文件大小（KB）</Label><Input type="number" min={100} max={5000} step={100} value={config.firstFrameMaxKB ?? 1024} onChange={(e) => setConfig((prev) => ({ ...prev, firstFrameMaxKB: Number(e.target.value) || 1024 }))} className="font-mono text-sm mt-1" /></div></div></CardContent></Card></div>

        <div className="space-y-4"><h2 className="text-sm font-medium">网络重试</h2><Card><CardContent className="pt-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><Label className="text-sm">最大重试次数</Label><Input type="number" min={0} max={5} step={1} value={config.retryCount ?? 2} onChange={(e) => setConfig((prev) => ({ ...prev, retryCount: Number(e.target.value) || 0 }))} className="font-mono text-sm mt-1" /></div><div><Label className="text-sm">重试间隔（毫秒）</Label><Input type="number" min={500} max={30000} step={500} value={config.retryDelayMs ?? 3000} onChange={(e) => setConfig((prev) => ({ ...prev, retryDelayMs: Number(e.target.value) || 3000 }))} className="font-mono text-sm mt-1" /></div></div></CardContent></Card></div>

        <Card className="bg-muted/50"><CardContent className="pt-6"><h3 className="font-medium mb-2">说明</h3><ul className="text-sm text-muted-foreground space-y-1"><li>内置 API 模式下会隐藏所有自定义 URL、Key 和模型映射编辑项。</li><li>自定义模式下建议先测试服务商端点，再测试具体模型映射。</li><li>即梦 / Seedance 默认可复用 Gemini 网关与 Key。</li></ul></CardContent></Card>

        <div className="flex gap-3"><Button onClick={handleSave} className="flex-1 gap-2"><Save className="h-4 w-4" />保存设置</Button><Button variant="destructive" className="gap-2" onClick={handleClear}><Trash2 className="h-4 w-4" />清除本地缓存</Button></div>
      </main>
    </div>
  );
}
