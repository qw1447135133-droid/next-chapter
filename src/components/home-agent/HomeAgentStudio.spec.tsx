import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import type { StudioSessionState } from "@/lib/home-agent/types";

const STUDIO_SESSION_KEY = "storyforge-home-agent-session-v1";
const STUDIO_PROJECT_SESSIONS_KEY = "storyforge-home-agent-project-sessions-v1";
const DRAMA_PROJECTS_KEY = "storyforge_drama_projects";
const VIDEO_PROJECTS_KEY = "storyforge_projects";
const DESKTOP_SIDEBAR_COLLAPSE_KEY = "storyforge-home-agent-desktop-sidebar-collapsed-v1";

let assistantReply = "好的，我们开始。";

const resolveAskUserQuestion = vi.fn(() => true);
const rejectAskUserQuestion = vi.fn(() => true);
const runWorkflowAction = vi.fn(
  async (action: string, _input: Record<string, unknown>, runtime: { currentProjectSnapshot?: unknown }) => ({
    summary: `workflow:${action}`,
    projectSnapshot: runtime.currentProjectSnapshot ?? null,
    data: {
      projectSnapshot: runtime.currentProjectSnapshot ?? null,
    },
  }),
);

vi.mock("framer-motion", () => {
  const motion = new Proxy(
    {},
    {
      get: (_target, key) => {
        const tag = typeof key === "string" ? key : "div";

        return ({ children, ...props }: Record<string, unknown>) => {
          const {
            animate,
            exit,
            initial,
            layout,
            layoutId,
            transition,
            variants,
            whileHover,
            whileInView,
            whileTap,
            ...rest
          } = props;

          void animate;
          void exit;
          void initial;
          void layout;
          void layoutId;
          void transition;
          void variants;
          void whileHover;
          void whileInView;
          void whileTap;

          return createElement(tag, rest, children);
        };
      },
    },
  );

  return {
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children}</>,
    LayoutGroup: ({ children }: { children?: unknown }) => <>{children}</>,
    motion,
    useReducedMotion: () => true,
  };
});

vi.mock("@/pages/Settings", () => ({
  default: ({ onClose }: { onClose?: () => void }) => (
    <div>
      <div>settings-panel</div>
      <button type="button" onClick={onClose}>
        close-settings
      </button>
    </div>
  ),
}));

vi.mock("@/components/BrandMark", () => ({
  default: () => <div>brand-mark</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children?: unknown; open?: boolean }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children}</div>,
  SheetDescription: ({ children }: { children?: unknown }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children?: unknown }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children?: unknown }) => <div>{children}</div>,
}));

vi.mock("./ComposerChoicePopover", () => ({
  default: ({
    question,
    onSelect,
    onConfirm,
    canConfirm,
  }: {
    question: {
      title?: string;
      options?: Array<{ id: string; label: string; value: string }>;
      submissionMode?: string;
      multiSelect?: boolean;
    } | null;
    onSelect: (value: string, label: string) => void;
    onConfirm?: () => void;
    canConfirm?: boolean;
  }) =>
    question ? (
      <div>
        <div>{question.title}</div>
        {question.options?.map((option) => (
          <button key={option.id} type="button" onClick={() => onSelect(option.value, option.label)}>
            {option.label}
          </button>
        ))}
        {(question.submissionMode === "confirm" || question.multiSelect) && onConfirm ? (
          <button type="button" onClick={onConfirm} disabled={!canConfirm}>
            继续
          </button>
        ) : null}
      </div>
    ) : null,
}));

vi.mock("@/lib/agent/query-engine", () => ({
  QueryEngine: class MockQueryEngine {
    interrupt() {}

    async *submitMessage() {
      yield {
        type: "assistant",
        message: {
          message: {
            content: [{ type: "text", text: assistantReply }],
          },
        },
      };
    }
  },
}));

vi.mock("@/lib/agent/tools", () => ({
  createDefaultTools: () => [{ name: "AskUserQuestion" }, { name: "HomeStudioWorkflow" }],
}));

vi.mock("@/lib/api-config", () => ({
  getApiConfig: () => ({
    claudeKey: "test-key",
    claudeEndpoint: "https://example.test",
    geminiKey: "",
    geminiEndpoint: "",
    gptKey: "",
    gptEndpoint: "",
  }),
  resolveConfiguredModelName: () => "claude-sonnet-4-6",
}));

vi.mock("@/lib/agent/tools/ask-user-question", () => ({
  resolveAskUserQuestion,
  rejectAskUserQuestion,
}));

vi.mock("@/lib/home-agent/workflow-actions", () => ({
  runWorkflowAction,
}));

const { default: HomeAgentStudio } = await import("./HomeAgentStudio");

function renderStudio(ui: ReactElement = <HomeAgentStudio />) {
  return act(async () => {
    render(ui, { legacyRoot: true });
    await Promise.resolve();
  });
}

async function waitForVisibleText(text: string | RegExp, timeout = 3000) {
  await waitFor(
    () => {
      expect(screen.getByText(text)).toBeInTheDocument();
    },
    { timeout },
  );
}

function findSendButton() {
  return screen
    .getAllByRole("button")
    .find((button) => button.querySelector(".lucide-send,.lucide-loader2"));
}

function seedDramaProject(projectId = "drama-project-1") {
  localStorage.setItem(
    DRAMA_PROJECTS_KEY,
    JSON.stringify([
      {
        id: projectId,
        dramaTitle: "契约婚姻反转录",
        currentStep: "creative-plan",
        updatedAt: "2026-04-02T00:00:00.000Z",
        createdAt: "2026-04-01T00:00:00.000Z",
        setup: {
          genres: ["都市言情"],
          audience: "女频",
          tone: "甜虐",
          ending: "HE",
          totalEpisodes: 40,
          targetMarket: "cn",
          creativeInput: "替父还债的女主和冷面继承人签下契约婚姻。",
        },
      },
    ]),
  );
}

function createQuestionRequest(overrides?: Partial<AskUserQuestionRequest>): AskUserQuestionRequest {
  return {
    id: "ask-1",
    allowCustomInput: true,
    submissionMode: "immediate",
    questions: [
      {
        header: "平台",
        question: "选择目标平台",
        multiSelect: false,
        options: [{ label: "抖音" }, { label: "小红书" }],
      },
    ],
    ...overrides,
  };
}

function createSession(overrides?: Partial<StudioSessionState>): StudioSessionState {
  return {
    mode: "active",
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        content: "继续保留第 2 集的张力。",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    ],
    currentProjectSnapshot: {
      projectId: "drama-project-1",
      projectKind: "script",
      title: "契约婚姻反转录",
      currentObjective: "继续完善创意方案。",
      derivedStage: "创意方案",
      agentSummary: "已进入创意方案阶段。",
      recommendedActions: ["继续推进角色设定", "重写创意方案"],
      artifacts: [],
    },
    recentMessageSummary: "assistant: 继续保留第 2 集的张力。",
    projectId: "drama-project-1",
    draft: "补充反派动机",
    qState: {
      request: createQuestionRequest({
        questions: [
          {
            header: "题材",
            question: "继续选择题材",
            multiSelect: false,
            options: [{ label: "都市" }, { label: "悬疑" }],
          },
        ],
      }),
      currentIndex: 0,
      answers: {},
      displayAnswers: {},
    },
    selectedValues: ["都市"],
    ...overrides,
  };
}

function createScriptMemorySession(overrides?: Partial<StudioSessionState>): StudioSessionState {
  return {
    mode: "active",
    messages: [
      {
        id: "assistant-script-1",
        role: "assistant",
        content: "我已经把当前剧本的关键中间层整理好了。",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    ],
    currentProjectSnapshot: {
      projectId: "script-project-current",
      projectKind: "script",
      title: "契约婚姻反转录",
      currentObjective: "先处理合规修订并锁定剧情 beat。",
      derivedStage: "合规审查",
      agentSummary: "当前有待处理修订包和未锁定剧情 beat。",
      recommendedActions: ["先处理修订包", "锁定剧情 beat"],
      artifacts: [],
      memory: {
        styleLock: null,
        worldModel: null,
        assetManifest: null,
        shotPackets: [],
        reviewQueue: [],
        characterStateCards: [
          {
            id: "script-project-current-character-card-0",
            name: "沈昭",
            role: "女主",
            coreConflict: "在自保与信任之间摇摆。",
            desire: "查清旧案。",
            riskNote: "一旦失手会失去全部筹码。",
            relationshipAxis: ["顾承砚：先婚后爱"],
            stageFocus: "继续强化人物拉扯",
            status: "locked",
          },
        ],
        storyBeatPackets: [
          {
            id: "script-project-current-beat-1",
            episodeNumber: 1,
            title: "签下契约",
            beatSummary: "女主被迫签下婚姻契约。",
            hook: "契约签订",
            payoff: "男主暴露隐藏目的。",
            status: "drafted",
          },
        ],
        complianceRevisionPackets: [
          {
            id: "script-project-current-compliance-1",
            issueTitle: "契约胁迫感过重",
            riskLevel: "high",
            recommendation: "改成双方交换条件，弱化单向控制。",
            status: "pending",
          },
        ],
      },
    },
    recentMessageSummary: "assistant: 我已经把当前剧本的关键中间层整理好了。",
    projectId: "script-project-current",
    draft: "",
    qState: null,
    selectedValues: [],
    ...overrides,
  };
}

function seedVideoProject(projectId = "video-project-1") {
  localStorage.setItem(
    VIDEO_PROJECTS_KEY,
    JSON.stringify([
      {
        id: projectId,
        title: "夜雨追击预告片",
        script: "女主在雨夜奔跑，回头看见追兵。",
        targetPlatform: "抖音",
        shotStyle: "电影感近景",
        outputGoal: "预告片",
        productionNotes: "保留主角红衣和夜雨气氛。",
        scenes: [
          {
            id: "scene-1",
            sceneNumber: 1,
            sceneName: "雨夜追击",
            description: "女主在雨夜奔跑，回头看见追兵。",
            characters: ["沈昭"],
            dialogue: "",
            cameraDirection: "中景，跟拍",
            duration: 5,
            storyboardUrl: "https://example.com/storyboard-1.jpg",
            videoUrl: "https://example.com/video-1.mp4",
            videoStatus: "completed",
          },
        ],
        characters: [
          {
            id: "char-1",
            name: "沈昭",
            description: "红衣、清冷、警觉",
            imageUrl: "https://example.com/char-1.jpg",
            isAIGenerated: false,
            source: "auto",
          },
        ],
        sceneSettings: [
          {
            id: "setting-1",
            name: "雨夜长街",
            description: "冷色夜雨中的长街",
            imageUrl: "https://example.com/scene-1.jpg",
            isAIGenerated: false,
            source: "auto",
          },
        ],
        artStyle: "live-action",
        currentStep: 4,
        systemPrompt: "",
        analysisSummary: "已编译镜头指令包，等待审阅。",
        storyboardPlan: "镜头 1：雨夜追击",
        videoPromptBatch: "镜头 1 提示词",
        sourceProjectId: "drama-1",
        createdAt: "2026-04-03T00:00:00.000Z",
        updatedAt: "2026-04-03T00:30:00.000Z",
        styleLock: null,
        worldModel: null,
        assetManifest: null,
        shotPackets: [
          {
            id: "packet:video-project-1:scene-1",
            sceneId: "scene-1",
            sceneNumber: 1,
            title: "雨夜追击",
            durationSec: 5,
            camera: {
              shotSize: "标准镜头",
              movement: "中景，跟拍",
            },
            characterRefs: [],
            sourceAssetIds: [],
            promptSeed: "女主在雨夜奔跑，回头看见追兵。",
            forbiddenChanges: ["不要改变主角色的识别特征和服装连续性"],
            renderMode: "img2video",
            reviewStatus: "pending",
          },
        ],
        reviewQueue: [
          {
            id: "review:packet:video-project-1:scene-1",
            title: "审阅镜头 1 · 雨夜追击",
            summary: "镜头已有可审阅素材，确认是否通过或需要重做。",
            targetIds: ["packet:video-project-1:scene-1"],
            status: "pending",
            createdAt: "2026-04-03T00:30:00.000Z",
            updatedAt: "2026-04-03T00:30:00.000Z",
          },
        ],
      },
    ]),
  );
}

describe("HomeAgentStudio", () => {
  beforeEach(() => {
    vi.useRealTimers();
    assistantReply = "好的，我们开始。";
    localStorage.clear();
    resolveAskUserQuestion.mockClear();
    rejectAskUserQuestion.mockClear();
    runWorkflowAction.mockClear();
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
    window.open = vi.fn();
  });

  it("moves from the centered idle composer into the active homepage chat on first send", async () => {
    await renderStudio();

    const textarea = (await screen.findByPlaceholderText(/和 Agent 说出你的目标/)) as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute("rows", "5");

    fireEvent.change(textarea, { target: { value: "我想做一个新项目" } });
    const sendButton = findSendButton();
    expect(sendButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(sendButton!);
      await Promise.resolve();
    });

    await waitForVisibleText("我想做一个新项目");
    expect(window.location.pathname).toBe("/");
  });

  it("supports a Gemini-style collapsible desktop sidebar and persists its state", async () => {
    await renderStudio();

    const collapseButton = screen.getByRole("button", { name: "收起侧栏" });
    await act(async () => {
      fireEvent.click(collapseButton);
      await Promise.resolve();
    });

    expect(localStorage.getItem(DESKTOP_SIDEBAR_COLLAPSE_KEY)).toBe("true");
    expect(screen.getByRole("button", { name: "展开侧栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始新项目" })).toBeInTheDocument();

    cleanup();
    await renderStudio();
    expect(screen.getByRole("button", { name: "展开侧栏" })).toBeInTheDocument();
  });

  it("resolves multi-step ask-user-question only on the final step", async () => {
    await renderStudio();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("agent:ask-user-question", {
          detail: createQuestionRequest({
            id: "ask-multi",
            questions: [
              {
                header: "平台",
                question: "选择目标平台",
                multiSelect: false,
                options: [{ label: "抖音" }, { label: "小红书" }],
              },
              {
                header: "风格",
                question: "选择镜头风格",
                multiSelect: false,
                options: [{ label: "纪录片感" }, { label: "高级广告感" }],
              },
            ],
          }),
        }),
      );
    });

    await screen.findByText("选择目标平台");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "抖音" }));
      await Promise.resolve();
    });

    expect(resolveAskUserQuestion).not.toHaveBeenCalled();
    await screen.findByText("选择镜头风格");

    const textarea = screen.getByPlaceholderText(/也可以跳过上方建议/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "电影感" } });
    const sendButton = findSendButton();
    expect(sendButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(sendButton!);
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(resolveAskUserQuestion).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );
    expect(resolveAskUserQuestion).toHaveBeenCalledWith("ask-multi", "平台: 抖音\n风格: 电影感");
  });

  it("aggregates multi-select answers with custom input in confirm mode", async () => {
    await renderStudio();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("agent:ask-user-question", {
          detail: createQuestionRequest({
            id: "ask-confirm",
            submissionMode: "confirm",
            questions: [
              {
                header: "元素",
                question: "保留哪些元素？",
                multiSelect: true,
                options: [{ label: "反转" }, { label: "情绪" }, { label: "悬念" }],
              },
            ],
          }),
        }),
      );
    });

    await screen.findByText("保留哪些元素？");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "反转" }));
      fireEvent.click(screen.getByRole("button", { name: "情绪" }));
      await Promise.resolve();
    });

    const textarea = screen.getByPlaceholderText(/也可以跳过上方建议/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "结尾要更克制" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "继续" }));
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(resolveAskUserQuestion).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );
    expect(resolveAskUserQuestion).toHaveBeenCalledWith("ask-confirm", "反转 / 情绪\n补充：结尾要更克制");
  });

  it("restores a saved project conversation from history without leaving the homepage", async () => {
    seedDramaProject();
    localStorage.setItem(
      STUDIO_PROJECT_SESSIONS_KEY,
      JSON.stringify({
        "drama-project-1": createSession(),
      }),
    );

    await renderStudio();

    const historySection = (await screen.findAllByText("对话历史"))[0]?.closest("section") ?? document.body;
    let historyButton: HTMLElement | null = null;
    await waitFor(
      () => {
        historyButton = within(historySection).getByRole("button", {
          name: /契约婚姻反转录/,
        });
      },
      { timeout: 3000 },
    );
    await act(async () => {
      fireEvent.click(historyButton!);
      await Promise.resolve();
    });

    expect(window.location.pathname).toBe("/");
    await waitForVisibleText("继续保留第 2 集的张力。");
    expect(screen.getByDisplayValue("补充反派动机")).toBeInTheDocument();
    expect(screen.getByText("继续选择题材")).toBeInTheDocument();
  });

  it("uses project artifacts and stage analysis when opening history without a saved homepage session", async () => {
    seedDramaProject("drama-project-2");

    await renderStudio();

    const historySection = (await screen.findAllByText("对话历史"))[0]?.closest("section") ?? document.body;
    let historyButton: HTMLElement | null = null;
    await waitFor(
      () => {
        historyButton = within(historySection).getByRole("button", {
          name: /契约婚姻反转录/,
        });
      },
      { timeout: 3000 },
    );

    await act(async () => {
      fireEvent.click(historyButton!);
      await Promise.resolve();
    });

    await waitForVisibleText(/我已对照当前项目产物做了恢复分析/);
    expect(screen.getByText(/我已分析《契约婚姻反转录》的当前状态/)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("restores the current homepage session on refresh and keeps it stable while opening settings", async () => {
    seedDramaProject();
    localStorage.setItem(STUDIO_SESSION_KEY, JSON.stringify(createSession()));

    await renderStudio();

    await waitForVisibleText("继续保留第 2 集的张力。");
    expect(screen.getByDisplayValue("补充反派动机")).toBeInTheDocument();
    expect(screen.getByText("继续选择题材")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /设置/ })[0]!);

    await waitFor(
      () => {
        expect(screen.getAllByText("settings-panel").length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
    expect(screen.getByDisplayValue("补充反派动机")).toBeInTheDocument();
    expect(screen.getByText("继续选择题材")).toBeInTheDocument();
  });

  it("shows review-focused recovery suggestions for video projects with pending review items", async () => {
    seedVideoProject();

    await renderStudio();

    const historySection = (await screen.findAllByText("对话历史"))[0]?.closest("section") ?? document.body;
    let historyButton: HTMLElement | null = null;
    await waitFor(
      () => {
        historyButton = within(historySection).getByRole("button", {
          name: /夜雨追击预告片/,
        });
      },
      { timeout: 3000 },
    );

    await act(async () => {
      fireEvent.click(historyButton!);
      await Promise.resolve();
    });

    await waitForVisibleText(/待审阅素材/);
    expect(screen.getByText("整理待审阅项")).toBeInTheDocument();
    expect(screen.getByText("通过稳定项")).toBeInTheDocument();
    expect(screen.getByText("逐条审阅")).toBeInTheDocument();
  });

  it("auto-surfaces review guidance for the current homepage session when the restored project has pending review items", async () => {
    localStorage.setItem(
      STUDIO_SESSION_KEY,
      JSON.stringify({
        mode: "active",
        messages: [
          {
            id: "assistant-review-1",
            role: "assistant",
            content: "我已经把镜头指令包整理好了。",
            createdAt: "2026-04-03T00:00:00.000Z",
          },
        ],
        currentProjectSnapshot: {
          projectId: "video-project-current",
          projectKind: "video",
          title: "雨夜追击预告片",
          currentObjective: "先审阅已有素材。",
          derivedStage: "审阅与修复",
          agentSummary: "当前有待审阅项。",
          recommendedActions: ["继续审阅"],
          artifacts: [],
          memory: {
            styleLock: null,
            worldModel: null,
            assetManifest: null,
            shotPackets: [],
            reviewQueue: [
              {
                id: "review:packet:video-project-current:scene-1",
                title: "审阅镜头 1 · 雨夜追击",
                summary: "镜头已有可审阅素材，确认是否通过或需要重做。",
                targetIds: ["packet:video-project-current:scene-1"],
                status: "pending",
                createdAt: "2026-04-03T00:00:00.000Z",
                updatedAt: "2026-04-03T00:00:00.000Z",
              },
            ],
          },
        },
        recentMessageSummary: "assistant: 我已经把镜头指令包整理好了。",
        projectId: "video-project-current",
        draft: "",
        qState: null,
        selectedValues: [],
      }),
    );

    await renderStudio();

    await waitForVisibleText(/待审阅素材/);
    expect(screen.getByText("整理待审阅项")).toBeInTheDocument();
    expect(screen.getByText("通过稳定项")).toBeInTheDocument();
  });

  it("maps review shortcut options to direct workflow actions on the homepage", async () => {
    seedVideoProject("video-project-direct");

    await renderStudio();

    const historySection = (await screen.findAllByText("对话历史"))[0]?.closest("section") ?? document.body;
    let historyButton: HTMLElement | null = null;
    await waitFor(
      () => {
        historyButton = within(historySection).getByRole("button", {
          name: /夜雨追击预告片/,
        });
      },
      { timeout: 3000 },
    );

    await act(async () => {
      fireEvent.click(historyButton!);
      await Promise.resolve();
    });

    await waitForVisibleText(/待审阅素材/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "通过稳定项" }));
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(runWorkflowAction).toHaveBeenCalledWith(
          "approve_video_assets",
          expect.objectContaining({
            projectId: "video-project-direct",
            targetIds: ["packet:video-project-1:scene-1"],
          }),
          expect.anything(),
        );
      },
      { timeout: 3000 },
    );
    expect(screen.getByText("workflow:approve_video_assets")).toBeInTheDocument();
  });

  it("supports nested per-item review decisions without leaving the homepage", async () => {
    seedVideoProject("video-project-item");

    await renderStudio();

    const historySection = (await screen.findAllByText("对话历史"))[0]?.closest("section") ?? document.body;
    let historyButton: HTMLElement | null = null;
    await waitFor(
      () => {
        historyButton = within(historySection).getByRole("button", {
          name: /夜雨追击预告片/,
        });
      },
      { timeout: 3000 },
    );

    await act(async () => {
      fireEvent.click(historyButton!);
      await Promise.resolve();
    });

    await waitForVisibleText(/待审阅素材/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "逐条审阅" }));
      await Promise.resolve();
    });

    await waitForVisibleText(/先处理《夜雨追击预告片》里的哪条待审阅项/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "审阅镜头 1 · 雨夜追击" }));
      await Promise.resolve();
    });

    await waitForVisibleText(/这条素材怎么处理/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "通过这条素材" }));
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(runWorkflowAction).toHaveBeenCalledWith(
          "approve_video_assets",
          expect.objectContaining({
            projectId: "video-project-item",
            targetIds: ["packet:video-project-1:scene-1"],
          }),
          expect.anything(),
        );
      },
      { timeout: 3000 },
    );
  });

  it("surfaces script compliance packet shortcuts and resolves them via workflow actions", async () => {
    localStorage.setItem(STUDIO_SESSION_KEY, JSON.stringify(createScriptMemorySession()));

    await renderStudio();

    await waitForVisibleText(/合规修订包待处理/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "先处理高风险项" }));
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(runWorkflowAction).toHaveBeenCalledWith(
          "resolve_compliance_revisions",
          expect.objectContaining({
            projectId: "script-project-current",
            targetIds: ["script-project-current-compliance-1"],
          }),
          expect.anything(),
        );
      },
      { timeout: 3000 },
    );
  });

  it("supports nested script beat decisions and can continue writing an episode from the homepage", async () => {
    localStorage.setItem(
      STUDIO_SESSION_KEY,
      JSON.stringify(
        createScriptMemorySession({
          currentProjectSnapshot: {
            ...createScriptMemorySession().currentProjectSnapshot!,
            derivedStage: "单集细纲",
            currentObjective: "先锁定剧情 beat。",
            memory: {
              ...createScriptMemorySession().currentProjectSnapshot!.memory!,
              complianceRevisionPackets: [],
            },
          },
        }),
      ),
    );

    await renderStudio();

    await waitForVisibleText(/剧情 beat 可以继续收口/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "逐条检查剧情 beat" }));
      await Promise.resolve();
    });

    await waitForVisibleText(/先处理《契约婚姻反转录》里的哪条剧情 beat/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "第 1 集 · 签下契约" }));
      await Promise.resolve();
    });

    await waitForVisibleText(/这条 beat 怎么处理/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "继续写第 1 集" }));
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(runWorkflowAction).toHaveBeenCalledWith(
          "generate_episode",
          expect.objectContaining({
            projectId: "script-project-current",
            episodeNumber: 1,
          }),
          expect.anything(),
        );
      },
      { timeout: 3000 },
    );
  });

  it("surfaces script character-card shortcuts and locks them via workflow actions", async () => {
    localStorage.setItem(
      STUDIO_SESSION_KEY,
      JSON.stringify(
        createScriptMemorySession({
          currentProjectSnapshot: {
            ...createScriptMemorySession().currentProjectSnapshot!,
            derivedStage: "角色设定",
            currentObjective: "先锁定角色状态卡。",
            memory: {
              ...createScriptMemorySession().currentProjectSnapshot!.memory!,
              complianceRevisionPackets: [],
              storyBeatPackets: [],
              characterStateCards: [
                {
                  id: "script-project-current-character-card-0",
                  name: "沈昭",
                  role: "女主",
                  coreConflict: "在自保与信任之间摇摆。",
                  desire: "查清旧案。",
                  riskNote: "一旦失手会失去全部筹码。",
                  relationshipAxis: ["顾承砚：先婚后爱"],
                  stageFocus: "继续强化人物拉扯",
                  status: "pending",
                },
              ],
            },
          },
        }),
      ),
    );

    await renderStudio();

    await waitForVisibleText(/角色状态卡待收口/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "锁定 沈昭" }));
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(runWorkflowAction).toHaveBeenCalledWith(
          "lock_character_cards",
          expect.objectContaining({
            projectId: "script-project-current",
            targetIds: ["script-project-current-character-card-0"],
          }),
          expect.anything(),
        );
      },
      { timeout: 3000 },
    );
  });
});
