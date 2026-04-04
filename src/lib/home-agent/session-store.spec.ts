import { beforeEach, describe, expect, it } from "vitest";
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
      request: {
        id: "ask-1",
        allowCustomInput: true,
        submissionMode: "confirm",
        questions: [
          {
            header: "题材",
            question: "继续选择题材",
            multiSelect: false,
            options: [{ label: "都市" }],
          },
        ],
      },
      currentIndex: 0,
      answers: {},
      displayAnswers: {},
    },
    selectedValues: ["都市"],
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
});
