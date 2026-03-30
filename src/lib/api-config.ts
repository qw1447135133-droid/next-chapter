export interface ApiConfig {
  geminiEndpoint: string;
  geminiKey: string;
  jimengEndpoint: string;
  jimengKey: string;
  viduEndpoint: string;
  viduKey: string;
  klingEndpoint: string;
  klingKey: string;
  autoJimengApiBase: string;
  firstFrameMaxDim: number;
  firstFrameMaxKB: number;
  retryCount: number;
  retryDelayMs: number;
  storagePath?: string;
  reverseDownloadPath?: string;
}

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
  reverseDownloadPath: "",
};

export function getApiConfig(): ApiConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      const merged = { ...DEFAULT_API_CONFIG, ...parsed } as ApiConfig;

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

      const jimengEndpoint =
        typeof merged.jimengEndpoint === "string"
          ? merged.jimengEndpoint.trim()
          : "";
      if (jimengEndpoint && /localhost|127\.0\.0\.1|:8000/i.test(jimengEndpoint)) {
        merged.autoJimengApiBase = jimengEndpoint;
        merged.jimengEndpoint = "";
      }

      for (const key of SENSITIVE_KEYS) {
        const value = merged[key];
        if (typeof value === "string" && value) {
          (merged as Record<string, unknown>)[key] = deobfuscate(value);
        }
      }
      return merged;
    }
  } catch {
    // ignore malformed local config and fall back to defaults
  }

  return DEFAULT_API_CONFIG;
}

export function saveApiConfig(config: Partial<ApiConfig>): void {
  const current = getApiConfig();
  const updated = { ...current, ...config };
  const toStore = { ...updated } as Record<string, unknown>;
  for (const key of SENSITIVE_KEYS) {
    const value = toStore[key];
    if (typeof value === "string" && value) {
      toStore[key] = obfuscate(value);
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
}
