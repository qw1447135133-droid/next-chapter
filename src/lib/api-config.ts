export type ApiMode = "builtin";

export interface BuiltinApiBundle {
  geminiEndpoint?: string;
  geminiKey?: string;
  gptEndpoint?: string;
  gptKey?: string;
  claudeEndpoint?: string;
  claudeKey?: string;
  grokEndpoint?: string;
  grokKey?: string;
  seedreamEndpoint?: string;
  seedreamKey?: string;
  jimengEndpoint?: string;
  jimengKey?: string;
  tuziEndpoint?: string;
  tuziKey?: string;
  modelMappings?: Record<string, string>;
}

export interface SupportedModelMapping {
  key: string;
  label: string;
  provider: "gemini" | "gpt" | "claude" | "grok" | "seedream" | "jimeng" | "tuzi";
  category: "text" | "image" | "video";
  defaultModelName: string;
}

export interface ApiConfig {
  apiMode: ApiMode;
  geminiEndpoint: string;
  geminiKey: string;
  gptEndpoint: string;
  gptKey: string;
  claudeEndpoint: string;
  claudeKey: string;
  grokEndpoint: string;
  grokKey: string;
  seedreamEndpoint: string;
  seedreamKey: string;
  jimengEndpoint: string;
  jimengKey: string;
  tuziEndpoint: string;
  tuziKey: string;
  modelMappings: Record<string, string>;
  firstFrameMaxDim: number;
  firstFrameMaxKB: number;
  retryCount: number;
  retryDelayMs: number;
  storagePath?: string;
}

export const SUPPORTED_MODEL_MAPPINGS: SupportedModelMapping[] = [
  {
    key: "gemini-3-pro",
    label: "Gemini 3 Pro",
    provider: "gemini",
    category: "text",
    defaultModelName: "gemini-3-pro",
  },
  {
    key: "gemini-3-pro-preview",
    label: "Gemini 3 Pro Preview",
    provider: "gemini",
    category: "text",
    defaultModelName: "gemini-3-pro-preview",
  },
  {
    key: "gemini-3-pro-thinking",
    label: "Gemini 3 Pro Thinking",
    provider: "gemini",
    category: "text",
    defaultModelName: "gemini-3-pro-thinking",
  },
  {
    key: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    provider: "gemini",
    category: "text",
    defaultModelName: "gemini-3-flash-preview",
  },
  {
    key: "gpt-5.4",
    label: "GPT-5.4",
    provider: "gpt",
    category: "text",
    defaultModelName: "gpt-5.4",
  },
  {
    key: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    provider: "gpt",
    category: "text",
    defaultModelName: "gpt-5.4-mini",
  },
  {
    key: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "claude",
    category: "text",
    defaultModelName: "claude-sonnet-4-6",
  },
  {
    key: "claude-sonnet-4-6-thinking",
    label: "Claude Sonnet 4.6 Thinking",
    provider: "claude",
    category: "text",
    defaultModelName: "claude-sonnet-4-6-thinking",
  },
  {
    key: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    provider: "claude",
    category: "text",
    defaultModelName: "claude-opus-4-6",
  },
  {
    key: "grok-4.1",
    label: "Grok 4.1",
    provider: "grok",
    category: "text",
    defaultModelName: "grok-4.1",
  },
  {
    key: "gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image Preview",
    provider: "gemini",
    category: "image",
    defaultModelName: "gemini-3-pro-image-preview",
  },
  {
    key: "gemini-3.1-flash-image-preview",
    label: "Gemini 3.1 Flash Image Preview",
    provider: "gemini",
    category: "image",
    defaultModelName: "gemini-3.1-flash-image-preview",
  },
  {
    key: "doubao-seedream-5-0-260128",
    label: "Seedream 5.0",
    provider: "seedream",
    category: "image",
    defaultModelName: "doubao-seedream-5-0-260128",
  },
  {
    key: "doubao-seedance-1-5-pro_720p",
    label: "Seedance 1.5 Pro 720P",
    provider: "jimeng",
    category: "video",
    defaultModelName: "doubao-seedance-1-5-pro_720p",
  },
  {
    key: "doubao-seedance-1-5-pro_1080p",
    label: "Seedance 1.5 Pro 1080P",
    provider: "jimeng",
    category: "video",
    defaultModelName: "doubao-seedance-1-5-pro_1080p",
  },
  {
    key: "sora-2",
    label: "Sora 2 (720p)",
    provider: "tuzi",
    category: "video",
    defaultModelName: "sora-2",
  },
  {
    key: "sora-2-pro",
    label: "Sora 2 Pro (1080p)",
    provider: "tuzi",
    category: "video",
    defaultModelName: "sora-2-pro",
  },
];

const STORAGE_KEY = "storyforge_api_config";
const OBF_PREFIX = "obf:";
let builtinApiBundleCache: BuiltinApiBundle | null | undefined;

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
  "gptKey",
  "claudeKey",
  "grokKey",
  "seedreamKey",
  "jimengKey",
  "tuziKey",
];

export const DEFAULT_API_CONFIG: ApiConfig = {
  apiMode: "builtin",
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
  firstFrameMaxDim: 2048,
  firstFrameMaxKB: 1024,
  retryCount: 2,
  retryDelayMs: 3000,
  storagePath: "",
};

function readEnvString(name: string): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

function getEnvDefaultApiConfig(): Partial<ApiConfig> {
  const unifiedKey = readEnvString("VITE_DEFAULT_UNIFIED_API_KEY");
  const textEndpoint = readEnvString("VITE_DEFAULT_TEXT_ENDPOINT");
  const imageEndpoint = readEnvString("VITE_DEFAULT_IMAGE_ENDPOINT") || textEndpoint;
  const videoEndpoint = readEnvString("VITE_DEFAULT_VIDEO_ENDPOINT") || imageEndpoint || textEndpoint;

  return {
    geminiEndpoint: readEnvString("VITE_DEFAULT_GEMINI_ENDPOINT") || imageEndpoint,
    geminiKey: readEnvString("VITE_DEFAULT_GEMINI_KEY") || unifiedKey,
    gptEndpoint: readEnvString("VITE_DEFAULT_GPT_ENDPOINT") || textEndpoint,
    gptKey: readEnvString("VITE_DEFAULT_GPT_KEY") || unifiedKey,
    claudeEndpoint: readEnvString("VITE_DEFAULT_CLAUDE_ENDPOINT") || textEndpoint,
    claudeKey: readEnvString("VITE_DEFAULT_CLAUDE_KEY") || unifiedKey,
    grokEndpoint: readEnvString("VITE_DEFAULT_GROK_ENDPOINT") || textEndpoint,
    grokKey: readEnvString("VITE_DEFAULT_GROK_KEY") || unifiedKey,
    seedreamEndpoint: readEnvString("VITE_DEFAULT_SEEDREAM_ENDPOINT") || imageEndpoint,
    seedreamKey: readEnvString("VITE_DEFAULT_SEEDREAM_KEY") || unifiedKey,
    jimengEndpoint: readEnvString("VITE_DEFAULT_JIMENG_ENDPOINT") || videoEndpoint,
    jimengKey: readEnvString("VITE_DEFAULT_JIMENG_KEY") || unifiedKey,
    tuziEndpoint: readEnvString("VITE_DEFAULT_TUZI_ENDPOINT") || textEndpoint,
    tuziKey: readEnvString("VITE_DEFAULT_TUZI_KEY") || unifiedKey,
  };
}

function normalizeStoredConfig(config: Partial<ApiConfig>): ApiConfig {
  return {
    ...DEFAULT_API_CONFIG,
    ...config,
    apiMode: "builtin",
    geminiEndpoint:
      typeof config.geminiEndpoint === "string" ? config.geminiEndpoint.trim() : "",
    geminiKey: typeof config.geminiKey === "string" ? config.geminiKey.trim() : "",
    gptEndpoint: typeof config.gptEndpoint === "string" ? config.gptEndpoint.trim() : "",
    gptKey: typeof config.gptKey === "string" ? config.gptKey.trim() : "",
    claudeEndpoint:
      typeof config.claudeEndpoint === "string" ? config.claudeEndpoint.trim() : "",
    claudeKey: typeof config.claudeKey === "string" ? config.claudeKey.trim() : "",
    grokEndpoint: typeof config.grokEndpoint === "string" ? config.grokEndpoint.trim() : "",
    grokKey: typeof config.grokKey === "string" ? config.grokKey.trim() : "",
    seedreamEndpoint:
      typeof config.seedreamEndpoint === "string" ? config.seedreamEndpoint.trim() : "",
    seedreamKey:
      typeof config.seedreamKey === "string" ? config.seedreamKey.trim() : "",
    jimengEndpoint:
      typeof config.jimengEndpoint === "string" ? config.jimengEndpoint.trim() : "",
    jimengKey: typeof config.jimengKey === "string" ? config.jimengKey.trim() : "",
    tuziEndpoint: typeof config.tuziEndpoint === "string" ? config.tuziEndpoint.trim() : "",
    tuziKey: typeof config.tuziKey === "string" ? config.tuziKey.trim() : "",
    modelMappings: normalizeModelMappings(config.modelMappings),
  };
}

function getBuiltinApiBundle(): BuiltinApiBundle | null {
  if (builtinApiBundleCache !== undefined) {
    return builtinApiBundleCache;
  }
  try {
    builtinApiBundleCache = window.electronAPI?.runtime?.builtinApiBundle || null;
  } catch {
    builtinApiBundleCache = null;
  }
  return builtinApiBundleCache;
}

function sanitizeBuiltinApiBundle(input: Partial<BuiltinApiBundle>): BuiltinApiBundle {
  return {
    geminiEndpoint: typeof input.geminiEndpoint === "string" ? input.geminiEndpoint.trim() : "",
    geminiKey: typeof input.geminiKey === "string" ? input.geminiKey.trim() : "",
    gptEndpoint: typeof input.gptEndpoint === "string" ? input.gptEndpoint.trim() : "",
    gptKey: typeof input.gptKey === "string" ? input.gptKey.trim() : "",
    claudeEndpoint: typeof input.claudeEndpoint === "string" ? input.claudeEndpoint.trim() : "",
    claudeKey: typeof input.claudeKey === "string" ? input.claudeKey.trim() : "",
    grokEndpoint: typeof input.grokEndpoint === "string" ? input.grokEndpoint.trim() : "",
    grokKey: typeof input.grokKey === "string" ? input.grokKey.trim() : "",
    seedreamEndpoint: typeof input.seedreamEndpoint === "string" ? input.seedreamEndpoint.trim() : "",
    seedreamKey: typeof input.seedreamKey === "string" ? input.seedreamKey.trim() : "",
    jimengEndpoint: typeof input.jimengEndpoint === "string" ? input.jimengEndpoint.trim() : "",
    jimengKey: typeof input.jimengKey === "string" ? input.jimengKey.trim() : "",
    tuziEndpoint: typeof input.tuziEndpoint === "string" ? input.tuziEndpoint.trim() : "",
    tuziKey: typeof input.tuziKey === "string" ? input.tuziKey.trim() : "",
    modelMappings: normalizeModelMappings(input.modelMappings),
  };
}

export function getBuiltinApiBundleMeta() {
  return {
    path: window.electronAPI?.runtime?.builtinApiBundlePath || "",
    loaded: !!getBuiltinApiBundle(),
  };
}

export async function loadBuiltinApiBundleFromDisk(): Promise<BuiltinApiBundle | null> {
  const filePath = getBuiltinApiBundleMeta().path;
  if (!filePath || !window.electronAPI?.storage?.readText) {
    builtinApiBundleCache = getBuiltinApiBundle();
    return builtinApiBundleCache;
  }
  const result = await window.electronAPI.storage.readText(filePath);
  if (!result.ok) {
    throw new Error(result.error || "读取内置 API 配置失败");
  }
  if (!result.exists || !result.content?.trim()) {
    builtinApiBundleCache = null;
    return builtinApiBundleCache;
  }
  const parsed = JSON.parse(result.content) as Partial<BuiltinApiBundle>;
  builtinApiBundleCache = sanitizeBuiltinApiBundle(parsed);
  return builtinApiBundleCache;
}

export async function saveBuiltinApiBundle(
  bundle: Partial<BuiltinApiBundle>,
): Promise<BuiltinApiBundle> {
  const filePath = getBuiltinApiBundleMeta().path;
  if (!filePath || !window.electronAPI?.storage?.writeText) {
    throw new Error("当前环境不支持写入内置 API 配置");
  }
  const nextBundle = sanitizeBuiltinApiBundle(bundle);
  const result = await window.electronAPI.storage.writeText(
    filePath,
    JSON.stringify(nextBundle, null, 2),
  );
  if (!result.ok) {
    throw new Error(result.error || "写入内置 API 配置失败");
  }
  builtinApiBundleCache = nextBundle;
  return nextBundle;
}

export function getStoredApiConfig(): ApiConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as Record<string, unknown>) : {};
    const envDefaults = getEnvDefaultApiConfig();
    let merged = {
      ...DEFAULT_API_CONFIG,
      ...envDefaults,
      ...parsed,
      modelMappings: normalizeModelMappings(parsed.modelMappings),
    } as ApiConfig;
    merged = applyLegacyCompatibility(parsed, merged);
    merged = decodeSensitiveFields(merged);
    return normalizeStoredConfig(merged);
  } catch {
    return normalizeStoredConfig({
      ...DEFAULT_API_CONFIG,
      ...getEnvDefaultApiConfig(),
    });
  }
}

function normalizeModelMappings(
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, mapped]) => [key, typeof mapped === "string" ? mapped.trim() : ""] as const)
    .filter(([, mapped]) => !!mapped);
  return Object.fromEntries(entries);
}

function applyLegacyCompatibility(
  parsed: Record<string, unknown>,
  merged: ApiConfig,
): ApiConfig {
  if (
    typeof parsed.apiEndpoint === "string" &&
    parsed.apiEndpoint &&
    !merged.geminiEndpoint
  ) {
    merged.geminiEndpoint = parsed.apiEndpoint;
  }
  if (
    typeof parsed.apiKey === "string" &&
    parsed.apiKey &&
    !merged.geminiKey
  ) {
    merged.geminiKey = parsed.apiKey;
  }
  return merged;
}

function decodeSensitiveFields(config: ApiConfig): ApiConfig {
  const next = { ...config };
  for (const key of SENSITIVE_KEYS) {
    const value = next[key];
    if (typeof value === "string" && value) {
      (next as Record<string, unknown>)[key] = deobfuscate(value);
    }
  }
  return next;
}

function applyBuiltinOverlay(config: ApiConfig): ApiConfig {
  const normalizedConfig = normalizeStoredConfig(config);
  const builtin = getBuiltinApiBundle();
  if (!builtin) return normalizedConfig;
  const builtinMappings = normalizeModelMappings(builtin.modelMappings);

  const g = (field: keyof BuiltinApiBundle) =>
    typeof builtin[field] === "string" ? (builtin[field] as string).trim() : "";

  const geminiEndpoint = g("geminiEndpoint");
  const geminiKey = g("geminiKey");

  return {
    ...normalizedConfig,
    geminiEndpoint,
    geminiKey,
    gptEndpoint: g("gptEndpoint") || geminiEndpoint,
    gptKey: g("gptKey") || geminiKey,
    claudeEndpoint: g("claudeEndpoint") || geminiEndpoint,
    claudeKey: g("claudeKey") || geminiKey,
    grokEndpoint: g("grokEndpoint") || geminiEndpoint,
    grokKey: g("grokKey") || geminiKey,
    seedreamEndpoint: g("seedreamEndpoint") || geminiEndpoint,
    seedreamKey: g("seedreamKey") || geminiKey,
    jimengEndpoint: g("jimengEndpoint") || geminiEndpoint,
    jimengKey: g("jimengKey") || geminiKey,
    tuziEndpoint: g("tuziEndpoint"),
    tuziKey: g("tuziKey"),
    modelMappings: builtinMappings,
  };
}

export function resolveApiConfigForRuntime(config: ApiConfig): ApiConfig {
  return applyBuiltinOverlay(config);
}

export function getApiConfig(): ApiConfig {
  try {
    return resolveApiConfigForRuntime(getStoredApiConfig());
  } catch {
    return applyBuiltinOverlay(DEFAULT_API_CONFIG);
  }
}

export function saveApiConfig(config: Partial<ApiConfig>): void {
  const current = getStoredApiConfig();
  const updated = normalizeStoredConfig({
    ...current,
    ...config,
  });
  const toStore = { ...updated } as Record<string, unknown>;
  for (const key of SENSITIVE_KEYS) {
    const value = toStore[key];
    if (typeof value === "string" && value) {
      toStore[key] = obfuscate(value);
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
}

export function clearApiConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function resolveConfiguredModelName(model: string): string {
  const trimmed = String(model || "").trim();
  if (!trimmed) return trimmed;
  const config = getApiConfig();
  return config.modelMappings[trimmed]?.trim() || trimmed;
}

export function resolveConfiguredModelNameFromConfig(
  config: ApiConfig,
  model: string,
): string {
  const trimmed = String(model || "").trim();
  if (!trimmed) return trimmed;
  return config.modelMappings[trimmed]?.trim() || trimmed;
}
