// 短剧创作各阶段 Prompt 模板
// 从 short-drama 仓库提取并优化

import type { DramaSetup, EpisodeEntry } from "@/types/drama";

/** 创作方案 Prompt */
export function buildCreativePlanPrompt(setup: DramaSetup): string {
  const genreStr = setup.genres.join(" + ");
  return `你是一位专业的微短剧编剧，精通短视频平台的爆款短剧创作方法论。

## 当前项目配置
- 题材组合：${genreStr}
- 目标受众：${setup.audience}
- 故事基调：${setup.tone}
- 结局类型：${setup.ending}
- 总集数：${setup.totalEpisodes}集
${setup.customTopic ? `- 用户补充描述：${setup.customTopic}` : ""}

## 参考知识：节奏曲线
微短剧节奏公式：紧张蓄力 → 爽点释放 → 短暂喘息 → 新一轮蓄力
四段式结构：
- 起势段（前15%集数）：建立世界观和人物关系，制造第一个爽点
- 攀升段（15-45%）：冲突升级，多条线并行推进
- 风暴段（45-80%）：高潮迭起，反转频出
- 决战段（最后20%）：终极对决，结局收束

## 参考知识：付费卡点设计
三大设计原则：情绪峰值原则、悬念未解原则、沉没成本原则
黄金卡点位置：
- 首个卡点：第8-12集（最强悬念）
- 第二卡点：第18-25集（身份揭露/反转）
- 第三卡点：第35-45集（感情线高潮）
- 终极卡点：倒数3-5集（终极对决前）
付费卡点总占比 10-15%

## 参考知识：爽点矩阵
5大爽点类型：身份碾压、逆袭打脸、甜宠撒糖、虐心催泪、悬疑反转
爽点本质：压抑 → 释放。压抑越深，释放越爽。

## 你的任务
请生成完整的创作方案，包含以下 8 个板块：

1. **剧名备选**（3个），每个附一句话说明
2. **时空背景**：时代、地点、社会环境、阶层关系
3. **一句话故事线** + **核心冲突**
4. **三幕结构拆解**：
   - 第一幕（建置）：集数范围、核心事件、人物关系建立
   - 第二幕（对抗）：集数范围、冲突升级、转折点
   - 第三幕（高潮/结局）：集数范围、终极对决、结局处理
5. **全剧节奏波形描述**：标注高潮点、低谷点位置
6. **付费卡点规划**：具体集数 + 卡点类型 + 悬念设计
7. **爽感矩阵**：规划全剧各类爽点分布和配比
8. **结局设计**：主线结局 + 感情线结局 + 伏笔回收

用 Markdown 格式输出，清晰分区。`;
}

/** 角色开发 Prompt */
export function buildCharactersPrompt(setup: DramaSetup, creativePlan: string): string {
  const genreStr = setup.genres.join(" + ");
  return `你是一位专业的微短剧编剧。

## 当前项目
- 题材：${genreStr}
- 受众：${setup.audience}
- 基调：${setup.tone}
- 总集数：${setup.totalEpisodes}集

## 已有创作方案
${creativePlan}

## 参考知识：四层反派体系
反派设计三原则：可恨原则、可信原则、递进原则
- 第一层·小反派（前15%集数）：身份不高的小人物，嚣张但无实力，被打脸后迅速退场
- 第二层·中反派（前2/3集数）：有一定权势的对手，能给主角造成真正威胁
- 第三层·大反派（中后期）：终极Boss，实力和资源远超主角
- 第四层·隐藏反派（后1/3揭露）：身边最信任的人，反转冲击力最大

## 你的任务
生成完整角色体系，包含：

1. **主要角色档案**（每个角色包含）：
   - 姓名、年龄、外貌特征（2-3句）
   - 性格关键词（3-5个）
   - 公开身份 vs 真实身份
   - 核心动机
   - 爽点功能（承担什么爽点）
   - 口头禅或语言特征
   - 人物弧光（从开始到结局的变化轨迹）

2. **角色关系图**（用文字描述关系网络）

3. **感情线弧线**：男女主关系发展的关键节点（标注集数）

4. **四层反派体系**：
   - 每层反派的身份、动机、行为模式、击败/揭露过程

5. **关键互动场景预设**：
   - 第一次冲突场景
   - 身份揭露场景
   - 感情转折场景
   - 终极对决场景

用 Markdown 格式输出。`;
}

/** 分集目录 Prompt */
export function buildDirectoryPrompt(setup: DramaSetup, creativePlan: string, characters: string): string {
  return `你是一位专业的微短剧编剧。

## 已有创作方案
${creativePlan}

## 已有角色档案
${characters}

## 参考知识：钩子设计
5种钩子类型：
- 悬念钩（20-30%）：抛出关键疑问，答案留到下集
- 反转钩（5-15%）：在观众以为知道答案时，突然推翻
- 情绪钩（30-40%）：把情绪推到顶点然后截断
- 信息钩（10-20%）：释放一个关键信息，但只给一半
- 危机钩（10-20%）：主角陷入即时危险

## 参考知识：节奏曲线
四段式结构（${setup.totalEpisodes}集）：
- 起势段（约前${Math.round(setup.totalEpisodes * 0.15)}集）
- 攀升段（约${Math.round(setup.totalEpisodes * 0.15) + 1}-${Math.round(setup.totalEpisodes * 0.45)}集）
- 风暴段（约${Math.round(setup.totalEpisodes * 0.45) + 1}-${Math.round(setup.totalEpisodes * 0.8)}集）
- 决战段（约${Math.round(setup.totalEpisodes * 0.8) + 1}-${setup.totalEpisodes}集）

## 你的任务
生成完整的 ${setup.totalEpisodes} 集分集目录。

每集一行，格式：
第{N}集：{集标题} —— {核心冲突或爽点一句话描述} [钩子类型] {标记}

标记说明：
- 🔥 关键剧情集（重大转折、揭秘），占比 25-35%
- ⚡ 高潮卡点集（情绪最高峰、终极对决、命运转折等全剧最震撼的高潮时刻），占比 10-15%
- 一集可以同时标 🔥⚡
- 无标记 = 常规推进集

要求：
- 必须覆盖全部 ${setup.totalEpisodes} 集
- 前 10 集必须包含至少 3 个 🔥
- ⚡ 高潮卡点建议分布在以下位置：
  · 第8-12集（首个高潮）
  · 第18-25集（身份揭露/重大反转）
  · 第35-45集（感情线高潮）
  · 倒数3-5集（终极对决）
- 目录必须体现三幕结构的节奏变化
- 每集标注钩子类型（悬念钩/反转钩/情绪钩/信息钩/危机钩）
- 按段落分组显示（起势段/攀升段/风暴段/决战段）

末尾附统计信息：🔥数量、⚡数量、各钩子类型占比。`;
}

/** 分集撰写 Prompt */
export function buildEpisodePrompt(
  setup: DramaSetup,
  characters: string,
  directory: EpisodeEntry[],
  episodeNumber: number,
  previousEpisodes: string,
  customInstruction?: string,
): string {
  const ep = directory.find((e) => e.number === episodeNumber);
  const prevEp = directory.find((e) => e.number === episodeNumber - 1);
  const nextEp = directory.find((e) => e.number === episodeNumber + 1);
  const isFirstEp = episodeNumber === 1;

  return `你是一位专业的微短剧编剧。

## 项目配置
- 题材：${setup.genres.join(" + ")}
- 基调：${setup.tone}
- 总集数：${setup.totalEpisodes}

## 角色档案（摘要）
${characters.slice(0, 3000)}

## 当前集信息
- 第 ${episodeNumber} 集：${ep?.title || ""}
- 梗概：${ep?.summary || ""}
- 钩子类型：${ep?.hookType || ""}
- ${ep?.isKey ? "🔥 关键剧情集" : ""}${ep?.isClimax ? " ⚡ 高潮卡点集" : ""}
${prevEp ? `- 上一集：第${prevEp.number}集 ${prevEp.title} —— ${prevEp.summary}` : ""}
${nextEp ? `- 下一集：第${nextEp.number}集 ${nextEp.title} —— ${nextEp.summary}` : ""}

${previousEpisodes ? `## 前集回顾\n${previousEpisodes.slice(-2000)}` : ""}

${isFirstEp ? `## 重要：开篇黄金法则
- 第1秒：画面冲击或悬念抛出
- 第3秒：核心冲突或身份反差建立
- 第5秒：观众必须产生"接下来会怎样"的好奇心
- 前30秒必须完成：建立核心冲突、展示主角处境、抛出第一个钩子
- 禁止：大段旁白、慢节奏空镜、流水账、平铺直叙` : ""}

## 剧本格式要求（国内模式）

\`\`\`
# 第${episodeNumber}集：{集标题}

> 本集关键词：{3个关键词}
> 本集爽点：{爽点类型}
> 前情提要：{上集结尾悬念，1-2句}

---

## 场次一

**场景：** 内景/外景 · {地点} · 日/夜
**出场人物：** {人物列表}

△ （全景）{场景描写}
△ （中景）{人物动作描写}

**{角色名}**（{语气/动作指示}）："{台词}"

△ （特写）{关键细节描写}

♪ 音乐提示：{音乐氛围描述}

---

> 🎣 本集钩子：{悬念描述}
> 📺 下集预告：{下集核心看点}
\`\`\`

## 质量要求
- 每集 3-5 个场次
- 每集至少 800 字
- 景别提示：全景、中景、近景、特写（至少使用3种）
- 台词带语气或动作指示
- 结尾必须有悬念钩子（${ep?.hookType || "悬念钩"}）

- 确保角色行为与档案一致
- 确保剧情推进与分集目录一致

${customInstruction ? `\n## 用户重写指令\n${customInstruction}\n请在撰写时重点体现以上指令要求。\n` : ""}
请直接输出完整的第 ${episodeNumber} 集剧本。`;
}

/** 单场次重写 Prompt */
export function buildSceneRegenPrompt(
  setup: DramaSetup,
  characters: string,
  episodeNumber: number,
  episodeContent: string,
  sceneIndex: number,
  sceneContent: string,
  customInstruction?: string,
): string {
  const instructionBlock = customInstruction
    ? `\n\n## 用户重写指令\n${customInstruction}\n请在重写时重点体现以上指令要求，但不得违反下方"连贯性铁律"。`
    : "";

  // --- Extract adjacent scenes as anchors ---
  const sceneRegex = /^(##\s*场次.*)$/gm;
  const matches = [...episodeContent.matchAll(sceneRegex)];
  const extractScene = (idx: number): string | null => {
    if (idx < 0 || idx >= matches.length) return null;
    const start = matches[idx].index!;
    const end = idx + 1 < matches.length ? matches[idx + 1].index! : episodeContent.length;
    return episodeContent.slice(start, end).trim();
  };

  const prevScene = extractScene(sceneIndex - 1);
  const nextScene = extractScene(sceneIndex + 1);

  const anchorBlock = [
    prevScene
      ? `### 前一场次（场次${sceneIndex}）— 剧情锚点\n${prevScene}\n\n**衔接约束**：重写后的场次开头必须自然承接上述场次的结尾状态（角色位置、情绪、已知信息）。`
      : `（本场次为该集首场，需承接集标题/前情提要中的状态。）`,
    nextScene
      ? `### 后一场次（场次${sceneIndex + 2}）— 剧情锚点\n${nextScene}\n\n**衔接约束**：重写后的场次结尾必须保证后续场次的开头仍然成立（角色去向、情绪转折、信息揭示均不可断裂）。`
      : `（本场次为该集末场，结尾需保留原有的悬念/钩子设计。）`,
  ].join("\n\n");

  return `你是一位专业的微短剧编剧，擅长在不改变核心剧情的前提下提升场次的表现力。

## 项目配置
- 题材：${setup.genres.join(" + ")}
- 基调：${setup.tone}

## 角色档案（摘要）
${characters.slice(0, 2000)}

## 当前集完整内容
${episodeContent}

---

## 前后场次剧情锚点
${anchorBlock}
${instructionBlock}

---

## 连贯性铁律（最高优先级）

1. **核心剧情不可变更**：本场次的关键事件（信息揭示、角色决策、冲突升级/降级）必须与原场次完全一致。禁止新增、删除或替换任何影响后续剧情的事件。
2. **角色情感弧线约束**：
   - 场次开头的角色情绪状态必须匹配前一场次（或集开头）的结束状态；
   - 场次结尾的角色情绪状态必须能自然过渡到后一场次（或集结尾悬念）的起始状态；
   - 角色在本场次中的情绪变化轨迹（如：隐忍→爆发、怀疑→确认）必须保持原有方向，仅允许在表达强度上调整。
3. **结尾状态衔接检查**：重写完成后，自检以下三项，若任一项不满足则必须修正：
   - ✅ 角色的物理位置与后续场次一致
   - ✅ 已揭示/未揭示的信息与后续场次一致
   - ✅ 角色间关系状态（敌对/信任/误解等）与后续场次一致
4. **禁止跨场次副作用**：不得引入新角色、新道具、新地点，除非原场次中已存在。

---

## 你的任务
请重新撰写上述第 ${episodeNumber} 集中的 **场次${sceneIndex + 1}** 部分。

原场次内容：
${sceneContent}

**允许优化的维度**：
- 台词的表现力与潜台词层次
- 镜头语言（△ 景别切换、运镜节奏）
- 场景氛围描写与感官细节
- 节奏感（停顿、沉默、反应镜头的运用）
- ♪ 音效/音乐提示的精准度

**输出格式要求**：
- 使用与原文相同的格式（场景描述、△ 镜头、角色台词、♪ 音乐等）
- 仅输出该场次的内容，不要输出其他场次
- 不要输出自检过程，仅输出最终场次内容

请直接输出重写后的场次内容。`;
}

/** 导出整合 Prompt */
export function buildExportPrompt(
  setup: DramaSetup,
  dramaTitle: string,
  creativePlan: string,
  characters: string,
  episodes: { number: number; title: string; content: string }[],
): string {
  return `你是一位专业编辑。请将以下创作内容整合为一份完整、排版规范的剧本文档。

## 元信息
- 剧名：${dramaTitle}
- 题材：${setup.genres.join(" + ")}
- 总集数：${setup.totalEpisodes}集
- 已完成：${episodes.length}集
- 目标受众：${setup.audience}
- 故事基调：${setup.tone}

## 创作方案摘要
${creativePlan.slice(0, 1500)}

## 角色表摘要
${characters.slice(0, 1500)}

## 分集剧本
${episodes.map((ep) => `### 第${ep.number}集：${ep.title}\n${ep.content}`).join("\n\n---\n\n")}

请输出整合后的完整剧本文档，格式规范，包含封面信息、角色表、分集剧本。`;
}

/** 质量自检 Prompt */
export function buildReviewPrompt(
  setup: DramaSetup,
  characters: string,
  directory: EpisodeEntry[],
  episodeNumber: number,
  episodeContent: string,
  prevEpisodeContent?: string,
  nextEpisodeContent?: string,
): string {
  const genreStr = setup.genres.join(" + ");
  const epEntry = directory.find((d) => d.number === episodeNumber);

  return `你是一位资深短剧质检编辑，精通微短剧的创作标准和行业规范。

## 任务
对以下第 ${episodeNumber} 集剧本进行五维度质量评分和审查。

## 项目信息
- 题材：${genreStr}
- 受众：${setup.audience}
- 基调：${setup.tone}
- 结局：${setup.ending}
- 总集数：${setup.totalEpisodes}
${epEntry ? `- 本集标题：${epEntry.title}\n- 本集概要：${epEntry.summary}\n- 钩子类型：${epEntry.hookType}${epEntry.isKey ? "\n- 🔥 关键集" : ""}${epEntry.isClimax ? "\n- ⚡ 高潮卡点" : ""}` : ""}

## 角色档案（摘要）
${characters.slice(0, 2000)}

${prevEpisodeContent ? `## 上一集内容（末尾片段）\n${prevEpisodeContent.slice(-600)}\n` : ""}
${nextEpisodeContent ? `## 下一集内容（开头片段）\n${nextEpisodeContent.slice(0, 600)}\n` : ""}

## 待审查剧本
${episodeContent}

---

## 评分要求

请严格按照以下五个维度评分（每项 1-10 分），并输出 **严格的 JSON 格式**：

\`\`\`json
{
  "scores": {
    "rhythm": { "score": 8, "comment": "评价说明" },
    "satisfaction": { "score": 7, "comment": "评价说明" },
    "dialogue": { "score": 9, "comment": "评价说明" },
    "format": { "score": 9, "comment": "评价说明" },
    "continuity": { "score": 9, "comment": "评价说明" }
  },
  "total": 42,
  "grade": "优良",
  "highlights": ["亮点1", "亮点2", "亮点3"],
  "issues": [
    { "level": "⛔", "description": "阻断性问题描述" },
    { "level": "⚠️", "description": "建议修改描述" },
    { "level": "ℹ️", "description": "微调建议描述" }
  ],
  "suggestions": ["修订建议1", "修订建议2"]
}
\`\`\`

### 维度说明
| 维度 | 评价标准 |
|------|----------|
| rhythm（节奏） | 场景切换节奏、信息密度、前30秒入戏、末尾钩子 |
| satisfaction（爽点） | 爽感要素密度、情绪高潮设计、观众满足感 |
| dialogue（台词） | 人物语言个性化、金句设计、画外音使用 |
| format（格式） | 镜头语言规范（△全景/中景/特写）、配乐提示♪、场景头标注、角色标注 |
| continuity（连贯性） | 与角色档案一致、与前后集衔接、伏笔回收 |

### 评级标准
| 总分 | 评级 |
|------|------|
| 45-50 | 卓越 |
| 38-44 | 优良 |
| 30-37 | 合格 |
| 25-29 | 需改进 |
| <25 | 需重写 |

**只输出 JSON，不要输出其他任何内容。**`;
}
