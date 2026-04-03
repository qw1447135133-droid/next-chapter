import { describe, expect, it } from "vitest";
import { extractStructuredQuestion } from "./structured-question-parser";

describe("extractStructuredQuestion", () => {
  it("extracts AskUserQuestion payloads embedded in assistant text", () => {
    const result = extractStructuredQuestion(`
先确认方向。

\`\`\`json
AskUserQuestion({
  "title": "创作方向",
  "questions": [
    {
      "header": "平台",
      "question": "你想先发到哪里？",
      "multiSelect": false,
      "options": [
        { "label": "抖音" },
        { "label": "小红书" }
      ]
    }
  ]
})
\`\`\`
`);

    expect(result.cleanedText).toBe("先确认方向。");
    expect(result.request?.title).toBe("创作方向");
    expect(result.request?.questions).toHaveLength(1);
    expect(result.request?.questions[0]?.header).toBe("平台");
    expect(result.request?.questions[0]?.options.map((option) => option.label)).toEqual([
      "抖音",
      "小红书",
    ]);
  });

  it("extracts AskUserQuestion payloads when the tool name is followed by a raw object", () => {
    const result = extractStructuredQuestion(`
继续确认关键参数。

\`\`\`
AskUserQuestion {
  "questions": [
    {
      "header": "平台",
      "question": "目标发布平台是哪里？",
      "multiSelect": false,
      "options": [
        { "label": "抖音 / TikTok", "value": "douyin_tiktok" },
        { "label": "B站", "value": "bilibili" }
      ]
    }
  ]
}
\`\`\`
`);

    expect(result.cleanedText).toBe("继续确认关键参数。");
    expect(result.request?.questions).toHaveLength(1);
    expect(result.request?.questions[0]?.options).toEqual([
      { label: "抖音 / TikTok", value: "douyin_tiktok" },
      { label: "B站", value: "bilibili" },
    ]);
  });

  it("extracts markdown question blocks into a composer request", () => {
    const result = extractStructuredQuestion(`
我先帮你拆成几个关键判断，接下来会在首页会话里一步步推进。

**问题 1 / 3 — 目标平台**
- 抖音 / TikTok：追求高完播、强钩子、快节奏
- 小红书：强调审美、情绪共鸣、可分享感
- B站：适合剧情完整、信息量更高的表达
- 自定义输入也可以

**问题 2 / 3 — 镜头风格**
你更想要哪一种镜头气质？
- 写实纪实
- 高级广告感
- 电影化情绪镜头
`);

    expect(result.cleanedText).toBe(
      "我先帮你拆成几个关键判断，接下来会在首页会话里一步步推进。",
    );
    expect(result.request?.allowCustomInput).toBe(true);
    expect(result.request?.questions).toHaveLength(2);
    expect(result.request?.questions[0]).toMatchObject({
      header: "目标平台",
      question: "请先确认目标平台",
      multiSelect: false,
    });
    expect(result.request?.questions[0]?.options).toEqual([
      {
        label: "抖音 / TikTok",
        value: "抖音 / TikTok",
        rationale: "追求高完播、强钩子、快节奏",
      },
      {
        label: "小红书",
        value: "小红书",
        rationale: "强调审美、情绪共鸣、可分享感",
      },
      {
        label: "B站",
        value: "B站",
        rationale: "适合剧情完整、信息量更高的表达",
      },
    ]);
    expect(result.request?.questions[1]?.question).toBe("你更想要哪一种镜头气质？");
  });

  it("extracts inline follow-up questions with bullet options", () => {
    const result = extractStructuredQuestion(`
## 收到：目标平台 → 多平台同步发布
多平台意味着需要同时输出竖版（9:16）+ 横版（16:9）+ 方版（1:1）三套切割方案。

继续锁定剩余两个参数👇 **镜头风格，你倾向哪种？**
- 🎬 纪录片感（手持、自然光、真实感）
- ✨ 高级广告感（固定机位、精致布光、品牌调性）
- 🔥 快节奏混剪（多素材拼接、节拍卡点、强冲击）
- 其他，请直接描述
`);

    expect(result.cleanedText).toBe(
      "## 收到：目标平台 → 多平台同步发布\n多平台意味着需要同时输出竖版（9:16）+ 横版（16:9）+ 方版（1:1）三套切割方案。\n\n继续锁定剩余两个参数👇",
    );
    expect(result.request?.questions).toHaveLength(1);
    expect(result.request?.questions[0]).toMatchObject({
      header: "镜头风格",
      question: "镜头风格，你倾向哪种？",
      multiSelect: false,
    });
    expect(result.request?.questions[0]?.options).toEqual([
      {
        label: "纪录片感",
        value: "纪录片感",
        rationale: "手持、自然光、真实感",
      },
      {
        label: "高级广告感",
        value: "高级广告感",
        rationale: "固定机位、精致布光、品牌调性",
      },
      {
        label: "快节奏混剪",
        value: "快节奏混剪",
        rationale: "多素材拼接、节拍卡点、强冲击",
      },
    ]);
  });

  it("extracts embedded HomeStudioWorkflow payloads from assistant text", () => {
    const result = extractStructuredQuestion(`
我已经判断上下文足够，准备直接继续项目。

\`\`\`json
{
  "tool": "HomeStudioWorkflow",
  "action": "continue_project",
  "projectKind": "script",
  "title": "契约婚姻反转录"
}
\`\`\`

接下来我会继续推进创作。
`);

    expect(result.cleanedText).toBe("我已经判断上下文足够，准备直接继续项目。\n\n接下来我会继续推进创作。");
    expect(result.request).toBeNull();
    expect(result.workflowCall).toEqual({
      action: "continue_project",
      projectKind: "script",
      title: "契约婚姻反转录",
    });
  });
});
