import {
  getApiConfig,
  resolveJimengExecutionMode,
  type JimengExecutionMode,
} from "@/lib/api-config";
import { dreaminaCliGetStatus } from "@/lib/dreamina-cli";

export type HomeAgentLaunchActionId =
  | "open_settings"
  | "switch_to_api"
  | "switch_to_cli"
  | "continue_script_only";

export type HomeAgentLaunchNotice = {
  level: "warning" | "critical";
  title: string;
  description: string;
  actions: Array<{
    id: HomeAgentLaunchActionId;
    label: string;
  }>;
};

export type HomeAgentLaunchReadiness = {
  checkedAt: string;
  textReady: boolean;
  textMessage: string;
  video: {
    mode: JimengExecutionMode;
    ready: boolean;
    label: string;
    detail: string;
    tone: "neutral" | "ready" | "warning";
  };
  notice: HomeAgentLaunchNotice | null;
};

function hasUsableTextModelKey(): boolean {
  const config = getApiConfig();
  return Boolean(config.claudeKey?.trim() || config.geminiKey?.trim() || config.gptKey?.trim());
}

function hasUsableSeedanceApiKey(): boolean {
  const config = getApiConfig();
  return Boolean(config.jimengKey?.trim() || config.geminiKey?.trim());
}

async function buildVideoState(mode: JimengExecutionMode): Promise<HomeAgentLaunchReadiness["video"]> {
  if (mode === "api") {
    if (hasUsableSeedanceApiKey()) {
      return {
        mode,
        ready: true,
        label: "当前实际走 API",
        detail: "Seedance API",
        tone: "neutral",
      };
    }

    return {
      mode,
      ready: false,
      label: "当前默认走 API",
      detail: "缺少 Seedance / Gemini 可用 Key",
      tone: "warning",
    };
  }

  if (!window.electronAPI?.dreaminaCli?.exec) {
    return {
      mode,
      ready: false,
      label: "当前选择 CLI",
      detail: "当前环境不支持 Dreamina CLI",
      tone: "warning",
    };
  }

  try {
    const status = await dreaminaCliGetStatus();
    if (status.loggedIn) {
      return {
        mode,
        ready: true,
        label: "当前实际走 CLI",
        detail: "Dreamina CLI / Seedance 2.0",
        tone: "ready",
      };
    }

    return {
      mode,
      ready: false,
      label: "当前选择 CLI",
      detail: status.installed ? "Dreamina CLI 尚未登录" : "Dreamina CLI 未安装",
      tone: "warning",
    };
  } catch (error) {
    return {
      mode,
      ready: false,
      label: "当前选择 CLI",
      detail: error instanceof Error ? error.message : "Dreamina CLI 状态检查失败",
      tone: "warning",
    };
  }
}

function buildNotice(params: {
  textReady: boolean;
  video: HomeAgentLaunchReadiness["video"];
}): HomeAgentLaunchNotice | null {
  const { textReady, video } = params;

  if (!textReady) {
    return {
      level: "critical",
      title: "主对话模型尚未就绪",
      description: "当前首页还没有可用的文本模型 Key，先去设置补齐内置 API 配置，再开始真实会话最稳妥。",
      actions: [{ id: "open_settings", label: "去设置补齐" }],
    };
  }

  if (video.ready) {
    return null;
  }

  if (video.mode === "cli") {
    return {
      level: "warning",
      title: "视频默认走 CLI，但当前还不能直接出片",
      description: "你可以先去设置完成 Dreamina 登录，也可以切回 API 继续视频工作流；如果暂时只做剧本和改编，也可以直接继续。",
      actions: [
        { id: "open_settings", label: "去设置检查" },
        { id: "switch_to_api", label: "切到 API" },
        { id: "continue_script_only", label: "先做剧本/改编" },
      ],
    };
  }

  return {
    level: "warning",
    title: "视频默认走 API，但当前还不能直接出片",
    description: "当前缺少 Seedance / Gemini 可用 Key。你可以去设置补齐，或切到已登录的 CLI；如果只是先做剧本和改编，也可以直接继续。",
    actions: [
      { id: "open_settings", label: "去设置补齐" },
      { id: "switch_to_cli", label: "尝试切到 CLI" },
      { id: "continue_script_only", label: "先做剧本/改编" },
    ],
  };
}

export async function readHomeAgentLaunchReadiness(): Promise<HomeAgentLaunchReadiness> {
  const config = getApiConfig();
  const textReady = hasUsableTextModelKey();
  const textMessage = textReady
    ? "主对话模型已就绪"
    : "当前没有可用的文本模型 Key，请先在设置中补齐内置 API 配置。";
  const mode = resolveJimengExecutionMode(config, {
    dreaminaCliAccessible: Boolean(window.electronAPI?.dreaminaCli?.exec),
  });
  const video = await buildVideoState(mode);

  return {
    checkedAt: new Date().toISOString(),
    textReady,
    textMessage,
    video,
    notice: buildNotice({ textReady, video }),
  };
}
