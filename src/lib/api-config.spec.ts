import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_API_CONFIG,
  getStoredApiConfig,
  resolveApiConfigForRuntime,
  saveApiConfig,
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

  it("normalizes legacy custom mode config back to builtin", () => {
    localStorage.setItem(
      "storyforge_api_config",
      JSON.stringify({
        apiMode: "custom",
        geminiEndpoint: "https://custom.example.com",
        geminiKey: "custom-key",
        modelMappings: {
          "gemini-3-flash-preview": "custom-model",
        },
      }),
    );

    const config = getStoredApiConfig();

    expect(config.apiMode).toBe("builtin");
    expect(config.geminiEndpoint).toBe("");
    expect(config.geminiKey).toBe("");
    expect(config.modelMappings).toEqual({});
  });

  it("scrubs legacy custom api fields when saving other settings", () => {
    localStorage.setItem(
      "storyforge_api_config",
      JSON.stringify({
        apiMode: "custom",
        geminiEndpoint: "https://custom.example.com",
        geminiKey: "custom-key",
        retryCount: 5,
      }),
    );

    saveApiConfig({ storagePath: "C:\\workspace" });

    expect(JSON.parse(localStorage.getItem("storyforge_api_config") || "{}")).toEqual(
      expect.objectContaining({
        apiMode: "builtin",
        geminiEndpoint: "",
        geminiKey: "",
        storagePath: "C:\\workspace",
        retryCount: 5,
      }),
    );
  });
});
