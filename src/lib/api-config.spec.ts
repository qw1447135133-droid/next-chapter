import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_API_CONFIG,
  resolveApiConfigForRuntime,
  type ApiConfig,
} from "./api-config";

describe("api-config builtin mode", () => {
  beforeEach(() => {
    window.electronAPI = {
      runtime: {
        builtinApiBundle: {
          geminiEndpoint: "https://api.tu-zi.com/v1beta",
          geminiKey: "",
          jimengEndpoint: "",
          jimengKey: "",
          viduEndpoint: "",
          viduKey: "",
          klingEndpoint: "",
          klingKey: "",
          modelMappings: {
            "gemini-3-flash-preview": "gemini-3-pro",
          },
        },
        builtinApiBundlePath: "C:\\mock\\builtin-api.json",
        verifyBuiltinApiAdminPassword: async () => true,
      },
    } as typeof window.electronAPI;
    localStorage.clear();
  });

  it("does not fall back to custom keys when builtin keys are empty", () => {
    const config: ApiConfig = {
      ...DEFAULT_API_CONFIG,
      apiMode: "builtin",
      geminiKey: "stale-custom-key",
      jimengKey: "stale-jimeng-key",
      modelMappings: {
        "gemini-3-flash-preview": "custom-model",
      },
    };

    const runtime = resolveApiConfigForRuntime(config);

    expect(runtime.geminiKey).toBe("");
    expect(runtime.jimengKey).toBe("");
    expect(runtime.modelMappings["gemini-3-flash-preview"]).toBe("gemini-3-pro");
  });
});
