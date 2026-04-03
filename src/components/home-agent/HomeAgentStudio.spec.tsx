import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import type { StudioSessionState } from "@/lib/home-agent/types";

const STUDIO_SESSION_KEY = "storyforge-home-agent-session-v1";
const STUDIO_PROJECT_SESSIONS_KEY = "storyforge-home-agent-project-sessions-v1";
const DRAMA_PROJECTS_KEY = "storyforge_drama_projects";

let assistantReply = "好的，我们开始。";

const resolveAskUserQuestion = vi.fn(() => true);
const rejectAskUserQuestion = vi.fn(() => true);

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

describe("HomeAgentStudio", () => {
  beforeEach(() => {
    vi.useRealTimers();
    assistantReply = "好的，我们开始。";
    localStorage.clear();
    resolveAskUserQuestion.mockClear();
    rejectAskUserQuestion.mockClear();
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
});
