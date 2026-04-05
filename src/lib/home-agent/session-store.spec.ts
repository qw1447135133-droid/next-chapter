import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioSessionState } from "./types";
import {
  clearStudioSession,
  readStudioProjectSession,
  readStudioSession,
  writeStudioSession,
} from "./session-store";

const STUDIO_SESSION_KEY = "storyforge-home-agent-session-v1";
const STUDIO_PROJECT_SESSIONS_KEY = "storyforge-home-agent-project-sessions-v1";

function createSession(overrides?: Partial<StudioSessionState>): StudioSessionState {
  return {
    sessionId: "session-1",
    compactedMessageCount: 0,
    mode: "active",
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        content: "继续推进创意方案。",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    ],
    currentProjectSnapshot: {
      projectId: "project-1",
      projectKind: "script",
      title: "契约婚姻反转录",
      currentObjective: "补全创意方案",
      derivedStage: "创意方案",
      agentSummary: "已进入创意方案阶段。",
      recommendedActions: ["继续推进角色设定"],
      artifacts: [],
    },
    recentMessageSummary: "assistant: 继续推进创意方案。",
    projectId: "project-1",
    draft: "补充反派动机",
    qState: {
      source: "restored",
      request: {
        id: "ask-1",
        description: "",
        allowCustomInput: true,
        submissionMode: "confirm",
        questions: [
          {
            header: "题材",
            question: "继续选择题材",
            multiSelect: false,
            options: [{ label: "都市", value: "都市", description: "", rationale: "" }],
          },
        ],
      },
      currentIndex: 0,
      answers: {},
      displayAnswers: {},
    },
    selectedValues: ["都市"],
    surfacedTaskIds: ["task-1"],
    surfacedTaskFollowupKeys: ["task-1,task-2"],
    surfacedProjectSuggestionKeys: ["project-1:creative-plan:script-project-1"],
    ...overrides,
  };
}

describe("session-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes the homepage session to both global and project-scoped storage", () => {
    const session = createSession();

    writeStudioSession(session);

    expect(readStudioSession()).toEqual(session);
    expect(readStudioProjectSession("project-1")).toEqual(session);
  });

  it("normalizes malformed stored data on read", () => {
    localStorage.setItem(
      STUDIO_SESSION_KEY,
      JSON.stringify({
        mode: "broken",
        messages: "bad",
        recentMessageSummary: 123,
        selectedValues: ["ok", 1, null],
      }),
    );

    expect(readStudioSession()).toEqual({
      sessionId: undefined,
      compactedMessageCount: 0,
      mode: "idle",
      messages: [],
      currentProjectSnapshot: null,
      recentMessageSummary: "",
      projectId: undefined,
      draft: "",
      qState: null,
      selectedValues: ["ok"],
      surfacedTaskIds: [],
      surfacedTaskFollowupKeys: [],
      surfacedProjectSuggestionKeys: [],
    });
  });

  it("keeps project-scoped sessions available when clearing only the active homepage session", () => {
    const session = createSession();
    writeStudioSession(session);

    clearStudioSession();

    expect(readStudioSession()).toBeNull();
    expect(readStudioProjectSession("project-1")).toEqual(session);
  });

  it("ignores invalid project-scoped session entries while preserving valid ones", () => {
    localStorage.setItem(
      STUDIO_PROJECT_SESSIONS_KEY,
      JSON.stringify({
        valid: createSession({ projectId: "valid" }),
        invalid: "bad",
      }),
    );

    expect(readStudioProjectSession("valid")?.projectId).toBe("valid");
    expect(readStudioProjectSession("invalid")).toBeNull();
  });

  it("compacts oversized sessions before persisting them", () => {
    const largeText = "超长内容".repeat(1600);
    const session = createSession({
      messages: Array.from({ length: 40 }, (_, index) => ({
        id: `assistant-${index}`,
        role: "assistant" as const,
        content: `${index}-${largeText}`,
        createdAt: "2026-04-03T00:00:00.000Z",
      })),
      currentProjectSnapshot: {
        ...createSession().currentProjectSnapshot,
        artifacts: Array.from({ length: 14 }, (_, index) => ({
          id: `artifact-${index}`,
          kind: "plan" as const,
          label: `产物 ${index}`,
          summary: largeText,
          content: largeText,
          updatedAt: "2026-04-03T00:00:00.000Z",
        })),
        memory: {
          assetManifest: {
            version: "1",
            items: Array.from({ length: 40 }, (_, index) => ({
              id: `asset-${index}`,
              kind: "character-sheet" as const,
              label: `角色 ${index}`,
              url: `file:///C:/tmp/asset-${index}.jpg`,
              meta: largeText,
              reusable: true,
              status: "ready" as const,
            })),
          },
        },
      },
      recentMessageSummary: largeText,
      draft: largeText,
    });

    writeStudioSession(session);

    const restored = readStudioSession();
    expect(restored).not.toBeNull();
    expect(restored?.messages.length).toBeLessThanOrEqual(28);
    expect(restored?.messages.at(-1)?.content.length ?? 0).toBeLessThanOrEqual(1600);
    expect(restored?.currentProjectSnapshot?.artifacts.length).toBeLessThanOrEqual(10);
    expect(restored?.currentProjectSnapshot?.memory).toBeUndefined();
    expect(restored?.draft?.length ?? 0).toBeLessThanOrEqual(2400);
  });

  it("retries with a smaller payload when storage quota is exceeded", () => {
    const originalSetItem = Storage.prototype.setItem;
    const quotaError = new DOMException("quota", "QuotaExceededError");
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (key === STUDIO_SESSION_KEY && value.length > 7000) {
          throw quotaError;
        }
        return originalSetItem.call(this, key, value);
      });

    const hugeSession = createSession({
      messages: Array.from({ length: 18 }, (_, index) => ({
        id: `message-${index}`,
        role: "assistant" as const,
        content: "扩容内容".repeat(900),
        createdAt: "2026-04-03T00:00:00.000Z",
      })),
      recentMessageSummary: "摘要".repeat(4000),
      draft: "草稿".repeat(2400),
    });

    expect(() => writeStudioSession(hugeSession)).not.toThrow();

    const restored = readStudioSession();
    expect(restored).not.toBeNull();
    expect(restored?.messages.length).toBeGreaterThan(0);
    expect(restored?.draft).not.toBe("");
    expect(spy).toHaveBeenCalled();
  });
});
