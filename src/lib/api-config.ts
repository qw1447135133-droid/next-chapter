export type ApiMode = "builtin" | "custom";

export interface BuiltinApiBundle {
  geminiEndpoint?: string;
  geminiKey?: string;
  jimengEndpoint?: string;
  jimengKey?: string;
  viduEndpoint?: string;
  viduKey?: string;
  klingEndpoint?: string;
  klingKey?: string;
  modelMappings?: Record<string, string>;
}

export interface SupportedModelMapping {
  key: string;
  label: string;
  provider: "gemini" | "jimeng" | "vidu" | "kling";
  category: "text" | "image" | "video";
  defaultModelName: string;
}

export interface ApiConfig {
  apiMode: ApiMode;
  geminiEndpoint: string;
  geminiKey: string;
  jimengEndpoint: string;
  jimengKey: string;
  viduEndpoint: string;
  viduKey: string;
  klingEndpoint: string;
  klingKey: string;
  modelMappings: Record<string, string>;
  autoJimengApiBase: string;
  firstFrameMaxDim: number;
  firstFrameMaxKB: number;
  retryCount: number;
  retryDelayMs: number;
  storagePath?: string;
  reverseDownloadPath?: string;
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
    provider: "gemini",
    category: "text",
    defaultModelName: "gpt-5.4",
  },
  {
    key: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    provider: "gemini",
    category: "text",
    defaultModelName: "gpt-5.4-mini",
  },
  {
    key: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "gemini",
    category: "text",
    defaultModelName: "claude-sonnet-4-6",
  },
  {
    key: "claude-sonnet-4-6-thinking",
    label: "Claude Sonnet 4.6 Thinking",
    provider: "gemini",
    category: "text",
    defaultModelName: "claude-sonnet-4-6-thinking",
  },
  {
    key: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    provider: "gemini",
    category: "text",
    defaultModelName: "claude-opus-4-6",
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
    provider: "gemini",
    category: "image",
    defaultModelName: "doubao-seedream-5-0-260128",
  },
  {
    key: "doubao-seedance-1-5-pro_1080p",
    label: "Seedance 1.5 Pro 1080P",
    provider: "jimeng",
    category: "video",
    defaultModelName: "doubao-seedance-1-5-pro_1080p",
  },
  {
    key: "viduq3-pro",
    label: "Vidu Q3",
    provider: "vidu",
    category: "video",
    defaultModelName: "viduq3-pro",
  },
  {
    key: "kling-v3",
    label: "Kling V3",
    provider: "kling",
    category: "video",
    defaultModelName: "kling-v3",
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
  "jimengKey",
  "viduKey",
  "klingKey",
];

export const DEFAULT_API_CONFIG: ApiConfig = {
  apiMode: "builtin",
  geminiEndpoint: "",
  geminiKey: "",
  jimengEndpoint: "",
  jimengKey: "",
  viduEndpoint: "",
  viduKey: "",
  klingEndpoint: "",
  klingKey: "",
  modelMappings: {},
  autoJimengApiBase: "http://localhost:8000",
  firstFrameMaxDim: 2048,
  firstFrameMaxKB: 1024,
  retryCount: 2,
  retryDelayMs: 3000,
  storagePath: "",
  reverseDownloadPath: "",
};

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
    jimengEndpoint: typeof input.jimengEndpoint === "string" ? input.jimengEndpoint.trim() : "",
    jimengKey: typeof input.jimengKey === "string" ? input.jimengKey.trim() : "",
    viduEndpoint: typeof input.viduEndpoint === "string" ? input.viduEndpoint.trim() : "",
    viduKey: typeof input.viduKey === "string" ? input.viduKey.trim() : "",
    klingEndpoint: typeof input.klingEndpoint === "string" ? input.klingEndpoint.trim() : "",
    klingKey: typeof input.klingKey === "string" ? input.klingKey.trim() : "",
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
    let merged = {
      ...DEFAULT_API_CONFIG,
      ...parsed,
      modelMappings: normalizeModelMappings(parsed.modelMappings),
    } as ApiConfig;
    merged = applyLegacyCompatibility(parsed, merged);
    merged = decodeSensitiveFields(merged);
    return merged;
  } catch {
    return DEFAULT_API_CONFIG;
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
  if (config.apiMode !== "builtin") return config;
  const builtin = getBuiltinApiBundle();
  if (!builtin) return config;
  const builtinMappings = normalizeModelMappings(builtin.modelMappings);
  const geminiEndpoint =
    typeof builtin.geminiEndpoint === "string" ? builtin.geminiEndpoint.trim() : "";
  const geminiKey =
    typeof builtin.geminiKey === "string" ? builtin.geminiKey.trim() : "";
  const jimengEndpointRaw =
    typeof builtin.jimengEndpoint === "string" ? builtin.jimengEndpoint.trim() : "";
  const jimengKeyRaw =
    typeof builtin.jimengKey === "string" ? builtin.jimengKey.trim() : "";
  const viduEndpoint =
    typeof builtin.viduEndpoint === "string" ? builtin.viduEndpoint.trim() : "";
  const viduKey =
    typeof builtin.viduKey === "string" ? builtin.viduKey.trim() : "";
  const klingEndpoint =
    typeof builtin.klingEndpoint === "string" ? builtin.klingEndpoint.trim() : "";
  const klingKey =
    typeof builtin.klingKey === "string" ? builtin.klingKey.trim() : "";

  return {
    ...config,
    geminiEndpoint,
    geminiKey,
    jimengEndpoint: jimengEndpointRaw || geminiEndpoint,
    jimengKey: jimengKeyRaw || geminiKey,
    viduEndpoint,
    viduKey,
    klingEndpoint,
    klingKey,
    modelMappings: builtinMappings,
  };
}

export function resolveApiConfigForRuntime(config: ApiConfig): ApiConfig {
  let merged = { ...config };
  const jimengEndpoint =
    typeof merged.jimengEndpoint === "string"
      ? merged.jimengEndpoint.trim()
      : "";
  if (jimengEndpoint && /localhost|127\.0\.0\.1|:8000/i.test(jimengEndpoint)) {
    merged.autoJimengApiBase = jimengEndpoint;
    merged.jimengEndpoint = "";
  }
  return applyBuiltinOverlay(merged);
}

export function getApiConfig(): ApiConfig {
  try {
    return resolveApiConfigForRuntime(getStoredApiConfig());
  } catch {
    return applyBuiltinOverlay(DEFAULT_API_CONFIG);
  }
}

export function saveApiConfig(config: Partial<ApiConfig>): void {
  const saved = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();

  const currentRaw = decodeSensitiveFields({
    ...DEFAULT_API_CONFIG,
    ...saved,
    modelMappings: normalizeModelMappings(saved.modelMappings),
  } as ApiConfig);
  const updated = {
    ...currentRaw,
    ...config,
    modelMappings: {
      ...currentRaw.modelMappings,
      ...normalizeModelMappings(config.modelMappings),
    },
  };
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
