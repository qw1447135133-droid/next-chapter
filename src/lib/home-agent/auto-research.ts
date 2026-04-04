import type { ComposerQuestion, ConversationProjectSnapshot } from "./types";

export interface AutoResearchTaskSpec {
  id: string;
  title: string;
  prompt: string;
}

export interface AutoResearchPlan {
  reason: string;
  kickoff: string;
  tasks: AutoResearchTaskSpec[];
}

function normalizeInput(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function buildProjectPrefix(snapshot: ConversationProjectSnapshot | null): string {
  if (!snapshot) return "当前是一个新需求。";
  return `当前项目《${snapshot.title}》，阶段为 ${snapshot.derivedStage}，当前目标是：${snapshot.currentObjective || snapshot.agentSummary}。`;
}

function buildKickoff(titles: string[]): string {
  return `我先并行研究 ${titles.length} 个方向：${titles.join("、")}。你可以继续补充要求，结果会自动回流到当前会话。`;
}

function buildScriptResearchPlan(
  prompt: string,
  snapshot: ConversationProjectSnapshot | null,
): AutoResearchPlan {
  const prefix = buildProjectPrefix(snapshot);
  const tasks: AutoResearchTaskSpec[] = [
    {
      id: "market-fit",
      title: "目标市场",
      prompt: `${prefix}请只研究这个需求最匹配的目标市场、受众和平台分发方向。用户原始要求：${prompt}`,
    },
    {
      id: "style-route",
      title: "风格路线",
      prompt: `${prefix}请只研究这个需求最适合的风格路线、叙事调性和钩子表达方式。用户原始要求：${prompt}`,
    },
    {
      id: "hook-structure",
      title: "卖点结构",
      prompt: `${prefix}请只研究这个项目最值得优先放大的卖点、人物关系和开篇结构。用户原始要求：${prompt}`,
    },
  ];

  return {
    reason: "script-research",
    kickoff: buildKickoff(tasks.map((task) => task.title)),
    tasks,
  };
}

function buildAdaptationResearchPlan(
  prompt: string,
  snapshot: ConversationProjectSnapshot | null,
): AutoResearchPlan {
  const prefix = buildProjectPrefix(snapshot);
  const tasks: AutoResearchTaskSpec[] = [
    {
      id: "adaptation-route",
      title: "改编路线",
      prompt: `${prefix}请只研究这个参考改编需求最可行的改编路线，包括保留什么、重做什么。用户原始要求：${prompt}`,
    },
    {
      id: "audience-fit",
      title: "受众适配",
      prompt: `${prefix}请只研究这个改编需求对目标受众和市场的适配策略。用户原始要求：${prompt}`,
    },
    {
      id: "character-shift",
      title: "角色重塑",
      prompt: `${prefix}请只研究这个改编需求最值得重塑的人物关系和角色卖点。用户原始要求：${prompt}`,
    },
  ];

  return {
    reason: "adaptation-research",
    kickoff: buildKickoff(tasks.map((task) => task.title)),
    tasks,
  };
}

function buildVideoResearchPlan(
  prompt: string,
  snapshot: ConversationProjectSnapshot | null,
): AutoResearchPlan {
  const prefix = buildProjectPrefix(snapshot);
  const tasks: AutoResearchTaskSpec[] = [
    {
      id: "platform-packaging",
      title: "平台包装",
      prompt: `${prefix}请只研究这个视频需求在不同平台上的包装方式、节奏和首屏抓力。用户原始要求：${prompt}`,
    },
    {
      id: "visual-direction",
      title: "视觉方向",
      prompt: `${prefix}请只研究这个视频需求最适合的视觉语言、镜头风格和氛围策略。用户原始要求：${prompt}`,
    },
    {
      id: "production-path",
      title: "出片策略",
      prompt: `${prefix}请只研究这个视频需求最稳妥的出片路径、资产准备和批量推进方式。用户原始要求：${prompt}`,
    },
  ];

  return {
    reason: "video-research",
    kickoff: buildKickoff(tasks.map((task) => task.title)),
    tasks,
  };
}

export function buildAutoResearchPlan(
  rawPrompt: string,
  snapshot: ConversationProjectSnapshot | null,
): AutoResearchPlan | null {
  const prompt = normalizeInput(rawPrompt);
  if (!prompt) return null;

  const hasResearchIntent = containsAny(prompt, [
    "分析",
    "研究",
    "比较",
    "对比",
    "定位",
    "方向",
    "策略",
    "适合",
    "怎么做更好",
  ]);

  if (!hasResearchIntent) return null;

  const lowerKind = snapshot?.projectKind;
  const isVideo =
    lowerKind === "video" || containsAny(prompt, ["视频", "分镜", "出片", "预告片", "提示词", "平台包装"]);
  const isAdaptation =
    lowerKind === "adaptation" || containsAny(prompt, ["改编", "参考", "转译", "重塑"]);

  if (isVideo) return buildVideoResearchPlan(prompt, snapshot);
  if (isAdaptation) return buildAdaptationResearchPlan(prompt, snapshot);
  return buildScriptResearchPlan(prompt, snapshot);
}

export function buildResearchPromptOverlay(plan: AutoResearchPlan, taskIds: string[]): string {
  const lines = plan.tasks.map((task, index) => {
    const taskId = taskIds[index] ?? "unknown";
    return `- ${task.title}（后台任务 ${taskId}）`;
  });

  return [
    "系统提示：我已自动启动并行研究，请不要重复创建同类研究任务。",
    "后台研究方向：",
    ...lines,
    "请在前台会话里继续推进主线，等后台结果回流后再整合。",
  ].join("\n");
}

function buildScriptFollowupQuestion(headings: string[], taskIds: string[]): ComposerQuestion {
  return {
    id: `research-followup:${taskIds.join(",")}`,
    title: "后台研究已返回，下一步怎么推进？",
    description: `已完成：${headings.join("、")}`,
    options: [
      {
        id: "research-followup-script-summary",
        label: "先汇总结论",
        value: `请先汇总刚完成的研究结论，重点整理 ${headings.join("、")} ，并给我一个清晰的创作判断。`,
      },
      {
        id: "research-followup-script-plan",
        label: "整理立项方案",
        value: `请结合刚完成的研究，直接整理成可执行的原创剧本立项方案，明确目标受众、风格方向、核心卖点和开篇抓手。`,
      },
      {
        id: "research-followup-script-characters",
        label: "推进角色设计",
        value: `请把刚完成的研究转成角色设计建议，先给我主角关系、人物卖点和冲突结构。`,
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "research-followup",
  };
}

function buildAdaptationFollowupQuestion(headings: string[], taskIds: string[]): ComposerQuestion {
  return {
    id: `research-followup:${taskIds.join(",")}`,
    title: "后台研究已返回，下一步怎么推进？",
    description: `已完成：${headings.join("、")}`,
    options: [
      {
        id: "research-followup-adaptation-summary",
        label: "先汇总结论",
        value: `请先汇总刚完成的改编研究结论，重点整理 ${headings.join("、")} ，并给我一个最值得采用的改编判断。`,
      },
      {
        id: "research-followup-adaptation-route",
        label: "锁定改编路线",
        value: "请基于刚完成的研究，直接给我一版最可行的改编路线，明确哪些原内容保留、哪些需要重做、哪些要本地化转译。",
      },
      {
        id: "research-followup-adaptation-characters",
        label: "重塑人物关系",
        value: "请把刚完成的研究转成人物关系重塑方案，先给我角色卖点、关系张力和新版冲突结构。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "research-followup",
  };
}

function buildVideoFollowupQuestion(headings: string[], taskIds: string[]): ComposerQuestion {
  return {
    id: `research-followup:${taskIds.join(",")}`,
    title: "后台研究已返回，下一步怎么推进？",
    description: `已完成：${headings.join("、")}`,
    options: [
      {
        id: "research-followup-video-summary",
        label: "先汇总结论",
        value: `请先汇总刚完成的视频研究结论，重点整理 ${headings.join("、")} ，并给我一个最稳妥的视频推进判断。`,
      },
      {
        id: "research-followup-video-package",
        label: "锁定包装方向",
        value: "请把刚完成的研究整合成视频包装方向，明确平台节奏、视觉调性、镜头语言和首屏抓力。",
      },
      {
        id: "research-followup-video-production",
        label: "直接准备出片",
        value: "请把刚完成的研究结论直接转成出片准备方案，告诉我下一步该先做脚本拆解、镜头包、提示词批次还是资产准备。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "research-followup",
  };
}

export function buildResearchFollowupQuestion(
  snapshot: ConversationProjectSnapshot | null,
  headings: string[],
  taskIds: string[],
): ComposerQuestion | null {
  if (!headings.length || !taskIds.length) return null;

  if (snapshot?.projectKind === "video") {
    return buildVideoFollowupQuestion(headings, taskIds);
  }

  if (snapshot?.projectKind === "adaptation") {
    return buildAdaptationFollowupQuestion(headings, taskIds);
  }

  return buildScriptFollowupQuestion(headings, taskIds);
}
