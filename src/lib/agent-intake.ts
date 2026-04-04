export type AgentRoute = "script-creator";
export type AgentScriptMode = "traditional" | "adaptation";
export type AgentResumeProjectType = "drama" | "video";

export interface AgentHandoff {
  prompt: string;
  route: AgentRoute;
  scriptMode?: AgentScriptMode;
  title: string;
  subtitle: string;
  resumeProjectId?: string;
  resumeProjectType?: AgentResumeProjectType;
  resumeProjectTitle?: string;
  resumeStepLabel?: string;
  source: "home";
  createdAt: string;
}

const AGENT_HANDOFF_KEY = "storyforge-agent-handoff";

const ADAPTATION_PATTERNS = [
  /改编/,
  /同款/,
  /参考/,
  /对标/,
  /仿写/,
  /续写/,
  /根据.+重写/,
  /adapt/i,
  /reference/i,
];

const VIDEO_PATTERNS = [
  /视频/,
  /短片/,
  /镜头/,
  /分镜/,
  /出片/,
  /成片/,
  /storyboard/i,
  /shot list/i,
  /video/i,
];

function detectRoute(
  prompt: string,
): Pick<AgentHandoff, "route" | "scriptMode" | "title" | "subtitle"> {
  if (ADAPTATION_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return {
      route: "script-creator",
      scriptMode: "adaptation",
      title: "Agent 已切入参考改编模式",
      subtitle:
        "我会先接住你的参考内容，分析目标市场、改编方向和结构骨架，然后继续在首页会话里推进。",
    };
  }

  if (VIDEO_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return {
      route: "script-creator",
      scriptMode: "traditional",
      title: "Agent 已切入视频工作流",
      subtitle:
        "我会先整理脚本、镜头意图和出片目标，再继续在首页会话里完成分镜与视频准备。",
    };
  }

  return {
    route: "script-creator",
    scriptMode: "traditional",
    title: "Agent 已切入首页创作模式",
    subtitle:
      "我会先分析你的目标，再一步步追问并推进剧本、改编或视频工作流，不会把你推回旧页面。",
  };
}

export function buildAgentHandoff(
  prompt: string,
  overrides?: Partial<
    Pick<
      AgentHandoff,
      | "route"
      | "scriptMode"
      | "title"
      | "subtitle"
      | "resumeProjectId"
      | "resumeProjectType"
      | "resumeProjectTitle"
      | "resumeStepLabel"
    >
  >,
): AgentHandoff {
  const normalizedPrompt = prompt.trim();
  const detected = detectRoute(normalizedPrompt);

  return {
    prompt: normalizedPrompt,
    route: overrides?.route ?? detected.route,
    scriptMode: overrides?.scriptMode ?? detected.scriptMode,
    title: overrides?.title ?? detected.title,
    subtitle: overrides?.subtitle ?? detected.subtitle,
    resumeProjectId: overrides?.resumeProjectId,
    resumeProjectType: overrides?.resumeProjectType,
    resumeProjectTitle: overrides?.resumeProjectTitle,
    resumeStepLabel: overrides?.resumeStepLabel,
    source: "home",
    createdAt: new Date().toISOString(),
  };
}

export function saveAgentHandoff(handoff: AgentHandoff): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AGENT_HANDOFF_KEY, JSON.stringify(handoff));
}

export function readAgentHandoff(): AgentHandoff | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(AGENT_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AgentHandoff;
  } catch {
    return null;
  }
}

export function consumeAgentHandoff(expectedRoute?: AgentRoute): AgentHandoff | null {
  if (typeof window === "undefined") return null;

  const handoff = readAgentHandoff();
  if (!handoff) return null;
  if (expectedRoute && handoff.route !== expectedRoute) return null;

  sessionStorage.removeItem(AGENT_HANDOFF_KEY);
  return handoff;
}
