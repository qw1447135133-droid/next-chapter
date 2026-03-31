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
  getBuiltinApiBundleMeta,
  getStoredApiConfig,
  resolveApiConfigForRuntime,
  resolveConfiguredModelNameFromConfig,
  saveApiConfig,
  SUPPORTED_MODEL_MAPPINGS,
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
    endpointHint: "Gemini-compatible gateway base URL.",
    keyHint: "Bearer token for the Gemini-compatible gateway.",
  },
  {
    id: "jimeng",
    title: "Jimeng / Seedance",
    endpointPlaceholder: "https://api.tu-zi.com/v1beta",
    endpointHint: "Seedance video gateway base URL. Leave blank to reuse the Gemini endpoint.",
    keyHint: "API key for Seedance video. If blank, Gemini key will be reused.",
  },
  {
    id: "vidu",
    title: "Vidu",
    endpointPlaceholder: "https://api.vidu.cn/ent/v2",
    endpointHint: "Vidu API base URL.",
    keyHint: "Vidu API key.",
  },
  {
    id: "kling",
    title: "Kling",
    endpointPlaceholder: "https://api.klingai.com",
    endpointHint: "Kling API base URL.",
    keyHint: "Kling API key.",
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
  const importRef = useRef<HTMLInputElement | null>(null);
  const builtinMeta = getBuiltinApiBundleMeta();

  useEffect(() => {
    const loadDefaultPath = async () => {
      if (!window.electronAPI?.storage?.getDefaultPath) return;
      try {
        const paths = await window.electronAPI.storage.getDefaultPath();
        setDefaultStoragePath(paths.files);
        setDefaultDownloadPath(paths.files);
      } catch (error) {
        console.error("Failed to load default paths:", error);
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
    toast({ title: "Saved", description: "Settings have been saved locally." });
  };

  const handleClear = () => {
    clearApiConfig();
    setConfig({ ...DEFAULT_API_CONFIG });
    toast({ title: "Cleared", description: "All settings were reset to defaults." });
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
      toast({ title: "Imported", description: `Loaded ${file.name}` });
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };
  const handleTestProvider = async (provider: ProviderId) => {
    const stateKey = `provider:${provider}`;
    updateTestState(stateKey, "testing", "Testing...");
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
        updateTestState(stateKey, "success", "Gemini endpoint is reachable.");
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
        updateTestState(stateKey, "success", "Seedance endpoint is reachable.");
        return;
      }

      if (provider === "vidu") {
        const baseUrl = String(runtimeConfig.viduEndpoint || "https://api.vidu.cn/ent/v2").replace(/\/$/, "");
        const resp = await fetch(`${baseUrl}/tasks/test/creations`, {
          method: "GET",
          headers: { Authorization: `Bearer ${runtimeConfig.viduKey}` },
        });
        if (resp.status === 401 || resp.status === 403) {
          throw new Error(`Auth failed (${resp.status})`);
        }
        updateTestState(stateKey, "success", `Vidu responded (${resp.status}).`);
        return;
      }

      const baseUrl = String(runtimeConfig.klingEndpoint || "https://api.klingai.com").replace(/\/$/, "");
      const resp = await fetch(`${baseUrl}/v1/videos/text2video/test`, {
        method: "GET",
        headers: { Authorization: `Bearer ${runtimeConfig.klingKey}` },
      });
      if (resp.status === 401 || resp.status === 403) {
        throw new Error(`Auth failed (${resp.status})`);
      }
      updateTestState(stateKey, "success", `Kling responded (${resp.status}).`);
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
    updateTestState(stateKey, "testing", "Testing...");
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
        updateTestState(stateKey, "success", `Model OK: ${mappedModel}`);
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
          throw new Error(`Model not found in provider response: ${mappedModel}`);
        }
        updateTestState(stateKey, "success", `Model OK: ${mappedModel}`);
        return;
      }

      updateTestState(stateKey, "error", "Only Gemini text and Seedance video models support online testing right now.");
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
      toast({ title: "Saved", description: `Storage path: ${folderPath}` });
    } catch (error) {
      toast({ title: "Select failed", description: String(error), variant: "destructive" });
    }
  };

  const handleResetStoragePath = () => {
    saveApiConfig({ storagePath: "" });
    setConfig((prev) => ({ ...prev, storagePath: "" }));
    toast({ title: "Reset", description: "Storage path restored to default." });
  };

  const handleSelectReverseDownloadPath = async () => {
    if (!window.electronAPI?.storage?.selectFolder) return;
    try {
      const folderPath = await window.electronAPI.storage.selectFolder();
      if (!folderPath) return;
      saveApiConfig({ reverseDownloadPath: folderPath });
      setConfig((prev) => ({ ...prev, reverseDownloadPath: folderPath }));
      toast({ title: "Saved", description: `Download path: ${folderPath}` });
    } catch (error) {
      toast({ title: "Select failed", description: String(error), variant: "destructive" });
    }
  };

  const handleResetReverseDownloadPath = () => {
    saveApiConfig({ reverseDownloadPath: "" });
    setConfig((prev) => ({ ...prev, reverseDownloadPath: "" }));
    toast({ title: "Reset", description: "Reverse download path restored to default." });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold font-[Space_Grotesk]">Settings</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            API Settings
          </h2>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="text-sm font-medium">Mode</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Built-in API mode hides all custom API controls. Custom mode reveals provider and model details step by step.
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                <button type="button" onClick={() => handleApiModeChange("builtin")} className={`px-4 py-1.5 rounded-md text-sm transition-colors ${config.apiMode === "builtin" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>Built-in API</button>
                <button type="button" onClick={() => handleApiModeChange("custom")} className={`px-4 py-1.5 rounded-md text-sm transition-colors ${config.apiMode === "custom" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>Custom API</button>
              </div>
              {config.apiMode === "builtin" ? (
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1">
                  <p className="text-sm font-medium">Built-in config file</p>
                  <p className="text-xs text-muted-foreground break-all">{builtinMeta.path || "Built-in config path not detected."}</p>
                  <p className="text-xs text-muted-foreground">Status: {builtinMeta.loaded ? "Loaded" : "Not loaded"}</p>
                  <p className="text-xs text-muted-foreground">This is the packaged JSON file used by built-in mode.</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportCustomConfig} />
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleExportCustomConfig}><Download className="h-4 w-4" />Export custom config</Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => importRef.current?.click()}><Upload className="h-4 w-4" />Import custom config</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {config.apiMode === "custom" ? (
            <>
              <Card>
                <CardContent className="pt-6 space-y-5">
                  <div>
                    <h3 className="text-sm font-medium">Providers</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Click a provider card to expand URL, key, and endpoint tests.</p>
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
                            <div className="text-xs text-muted-foreground">{providerOpen[row.id] ? "Collapse" : "Expand"}</div>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border-t border-border/40 px-4 py-4 space-y-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => handleTestProvider(row.id)} disabled={testState[`provider:${row.id}`]?.status === "testing"}>{testState[`provider:${row.id}`]?.status === "testing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Test endpoint</Button>
                            {testState[`provider:${row.id}`]?.message ? <span className={`text-xs ${testState[`provider:${row.id}`]?.status === "success" ? "text-emerald-600" : "text-red-600"}`}>{testState[`provider:${row.id}`]?.message}</span> : null}
                          </div>
                          <div className="space-y-1.5"><Label className="text-sm font-medium">API URL</Label><Input value={String(config[ENDPOINT_FIELD_MAP[row.id]] ?? "")} onChange={(e) => setProviderField(row.id, "endpoint", e.target.value)} placeholder={row.endpointPlaceholder} className="font-mono text-sm" /><p className="text-xs text-muted-foreground">{row.endpointHint}</p></div>
                          <div className="space-y-1.5"><Label className="text-sm font-medium">API Key</Label><Input type="password" value={String(config[KEY_FIELD_MAP[row.id]] ?? "")} onChange={(e) => setProviderField(row.id, "key", e.target.value)} placeholder="Enter API key" className="font-mono text-sm" /><p className="text-xs text-muted-foreground">{row.keyHint}</p></div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                  <div className="space-y-1.5"><Label className="text-sm font-medium">Jimeng local automation service</Label><Input value={config.autoJimengApiBase || ""} onChange={(e) => setConfig((prev) => ({ ...prev, autoJimengApiBase: e.target.value }))} placeholder="http://localhost:8000" className="font-mono text-sm" /><p className="text-xs text-muted-foreground">Used by the local Python automation service, independent from the remote API gateway.</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-5">
                  <div>
                    <h3 className="text-sm font-medium">Model mapping</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Click an item such as Text Models &gt; Gemini 3.1 Pro to edit one model in a focused dialog.</p>
                    <p className="text-xs text-muted-foreground mt-1">Online model testing currently supports Gemini text models and Seedance video models.</p>
                  </div>
                  {(["text", "image", "video"] as const).map((category) => {
                    const items = groupedModelMappings[category];
                    const categoryLabel = category === "text" ? "Text Models" : category === "image" ? "Image Models" : "Video Models";
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
                                <div className="text-xs text-muted-foreground">Open</div>
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
              <DialogTitle>{selectedModel?.label || "Model Mapping"}</DialogTitle>
              <DialogDescription>{selectedModel ? `Internal model ID: ${selectedModel.key}` : "Select a model to edit its mapping."}</DialogDescription>
            </DialogHeader>
            {selectedModel ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap"><Badge variant="outline">{selectedModel.provider}</Badge><Badge variant="secondary">{selectedModel.category}</Badge><Badge variant="outline">{selectedModel.key}</Badge></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">Real model name</Label><Input value={config.modelMappings?.[selectedModel.key] ?? ""} onChange={(e) => updateModelMapping(selectedModel.key, e.target.value)} placeholder={selectedModel.defaultModelName} className="font-mono text-sm" /></div>
                <div className="flex items-center gap-2 flex-wrap"><Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={testState[`${selectedModel.provider}:${selectedModel.key}`]?.status === "testing"} onClick={() => handleTestModelMapping(selectedModel.key, selectedModel.provider, selectedModel.category)}>{testState[`${selectedModel.provider}:${selectedModel.key}`]?.status === "testing" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Test model</Button>{testState[`${selectedModel.provider}:${selectedModel.key}`]?.message ? <span className={`text-xs ${testState[`${selectedModel.provider}:${selectedModel.key}`]?.status === "success" ? "text-emerald-600" : "text-red-600"}`}>{testState[`${selectedModel.provider}:${selectedModel.key}`]?.message}</span> : null}</div>
              </div>
            ) : null}
            <DialogFooter><Button type="button" onClick={() => setModelDialogOpen(false)}>Done</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2">{theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}Appearance</h2>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div className="space-y-1"><Label className="text-sm font-medium">Dark mode</Label><p className="text-xs text-muted-foreground">Switch between light and dark UI themes.</p></div><Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} /></div></CardContent></Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-medium flex items-center gap-2"><FolderOpen className="h-4 w-4" />Storage</h2>
          <Card><CardContent className="pt-6 space-y-4">
            <div><Label className="text-sm">Cache storage path</Label><div className="flex gap-2 mt-1.5"><Input value={config.storagePath || defaultStoragePath || (window.electronAPI?.storage ? "Loading path..." : "Desktop-only path")} readOnly className="font-mono text-sm flex-1" /><Button variant="outline" className="shrink-0 gap-1.5" onClick={handleSelectStoragePath} disabled={!window.electronAPI?.storage?.selectFolder}><FolderCog className="h-4 w-4" />Set path</Button></div>{config.storagePath ? <Button variant="ghost" size="sm" className="mt-2 text-xs text-muted-foreground" onClick={handleResetStoragePath}>Reset to default</Button> : null}</div>
            <div><Label className="text-sm">Reverse download path</Label><div className="flex gap-2 mt-1.5"><Input value={config.reverseDownloadPath || defaultDownloadPath || (window.electronAPI?.storage ? "Loading path..." : "Desktop-only path")} readOnly className="font-mono text-sm flex-1" /><Button variant="outline" className="shrink-0 gap-1.5" onClick={handleSelectReverseDownloadPath} disabled={!window.electronAPI?.storage?.selectFolder}><FolderCog className="h-4 w-4" />Set path</Button></div>{config.reverseDownloadPath ? <Button variant="ghost" size="sm" className="mt-2 text-xs text-muted-foreground" onClick={handleResetReverseDownloadPath}>Reset to default</Button> : null}</div>
          </CardContent></Card>
        </div>

        <div className="space-y-4"><h2 className="text-sm font-medium">First-frame compression</h2><Card><CardContent className="pt-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><Label className="text-sm">Max dimension</Label><Input type="number" min={256} max={2048} step={64} value={config.firstFrameMaxDim ?? 2048} onChange={(e) => setConfig((prev) => ({ ...prev, firstFrameMaxDim: Number(e.target.value) || 2048 }))} className="font-mono text-sm mt-1" /></div><div><Label className="text-sm">Max file size (KB)</Label><Input type="number" min={100} max={5000} step={100} value={config.firstFrameMaxKB ?? 1024} onChange={(e) => setConfig((prev) => ({ ...prev, firstFrameMaxKB: Number(e.target.value) || 1024 }))} className="font-mono text-sm mt-1" /></div></div></CardContent></Card></div>

        <div className="space-y-4"><h2 className="text-sm font-medium">Network retry</h2><Card><CardContent className="pt-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><Label className="text-sm">Max retries</Label><Input type="number" min={0} max={5} step={1} value={config.retryCount ?? 2} onChange={(e) => setConfig((prev) => ({ ...prev, retryCount: Number(e.target.value) || 0 }))} className="font-mono text-sm mt-1" /></div><div><Label className="text-sm">Retry delay (ms)</Label><Input type="number" min={500} max={30000} step={500} value={config.retryDelayMs ?? 3000} onChange={(e) => setConfig((prev) => ({ ...prev, retryDelayMs: Number(e.target.value) || 3000 }))} className="font-mono text-sm mt-1" /></div></div></CardContent></Card></div>

        <Card className="bg-muted/50"><CardContent className="pt-6"><h3 className="font-medium mb-2">Notes</h3><ul className="text-sm text-muted-foreground space-y-1"><li>Built-in API mode hides all custom URL, key, and model mapping controls.</li><li>Custom mode works best when you test the provider first, then test a specific model mapping.</li><li>Jimeng / Seedance can reuse the Gemini gateway and key by default.</li></ul></CardContent></Card>

        <div className="flex gap-3"><Button onClick={handleSave} className="flex-1 gap-2"><Save className="h-4 w-4" />Save settings</Button><Button variant="destructive" className="gap-2" onClick={handleClear}><Trash2 className="h-4 w-4" />Clear local cache</Button></div>
      </main>
    </div>
  );
}
