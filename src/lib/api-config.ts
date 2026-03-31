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
    label: "Gemini 3.1 Pro",
    provider: "gemini",
    category: "text",
    defaultModelName: "gemini-3-pro",
  },
  {
    key: "gemini-3-pro-preview",
    label: "Gemini 3.0 Pro",
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
    label: "Gemini 3.0 Flash",
    provider: "gemini",
    category: "text",
    defaultModelName: "gemini-3-flash-preview",
  },
  {
    key: "gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    provider: "gemini",
    category: "image",
    defaultModelName: "gemini-3-pro-image-preview",
  },
  {
    key: "gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
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
  try {
    return window.electronAPI?.runtime?.builtinApiBundle || null;
  } catch {
    return null;
  }
}

export function getBuiltinApiBundleMeta() {
  return {
    path: window.electronAPI?.runtime?.builtinApiBundlePath || "",
    loaded: !!window.electronAPI?.runtime?.builtinApiBundle,
  };
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
  return {
    ...config,
    geminiEndpoint: builtin.geminiEndpoint || config.geminiEndpoint,
    geminiKey: builtin.geminiKey || config.geminiKey,
    jimengEndpoint: builtin.jimengEndpoint || builtin.geminiEndpoint || config.jimengEndpoint,
    jimengKey: builtin.jimengKey || builtin.geminiKey || config.jimengKey,
    viduEndpoint: builtin.viduEndpoint || config.viduEndpoint,
    viduKey: builtin.viduKey || config.viduKey,
    klingEndpoint: builtin.klingEndpoint || config.klingEndpoint,
    klingKey: builtin.klingKey || config.klingKey,
    modelMappings: {
      ...config.modelMappings,
      ...normalizeModelMappings(builtin.modelMappings),
    },
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
