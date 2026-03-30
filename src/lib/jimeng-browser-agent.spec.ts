// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  classifyJimengNegativePattern,
  suggestJimengNegativeExample,
  summarizeJimengNegativeControls,
} from "./jimeng-agent-negative-memory";
import {
  buildActionPrompt,
  decideHeuristicAction,
  type JimengAgentObservation,
  type JimengAgentTargets,
} from "./jimeng-browser-agent";

const targets: JimengAgentTargets = {
  model: "Seedance 2.0 Fast",
  duration: "14s",
  aspectRatio: "16:9",
};

function createObservation(overrides?: Partial<JimengAgentObservation>): JimengAgentObservation {
  return {
    url: "https://jimeng.jianying.com/ai-tool/home?type=video",
    title: "test",
    bodyTextSnippet: "",
    screenshotBase64: "",
    screenshotMimeType: "image/png",
    matchedSignals: ["video-entry", "seedance-model", "16:9", "14s"],
    targetMatched: false,
    controls: [],
    ...overrides,
  };
}

describe("decideHeuristicAction", () => {
  it("prefers the combobox trigger over a plain text label for reference mode", () => {
    const observation = createObservation({
      controls: [
        {
          id: 199,
          text: "首尾帧",
          tag: "span",
          role: "",
          ariaLabel: "",
          placeholder: "",
          className: "",
          x: 570,
          y: 114,
          width: 106,
          height: 36,
        },
        {
          id: 200,
          text: "首尾帧",
          tag: "div",
          role: "combobox",
          ariaLabel: "",
          placeholder: "",
          className: "reference-select-trigger",
          x: 568,
          y: 112,
          width: 110,
          height: 40,
        },
      ],
    });

    const action = decideHeuristicAction(observation, targets);

    expect(action).toEqual({
      action: "click_control",
      controlId: 200,
      reason: "先展开参考模式下拉",
    });
  });

  it("falls back to the label when no dropdown-like trigger exists", () => {
    const observation = createObservation({
      controls: [
        {
          id: 199,
          text: "首尾帧",
          tag: "span",
          role: "",
          ariaLabel: "",
          placeholder: "",
          className: "",
          x: 570,
          y: 114,
          width: 106,
          height: 36,
        },
      ],
    });

    const action = decideHeuristicAction(observation, targets);

    expect(action).toEqual({
      action: "click_control",
      controlId: 199,
      reason: "先展开参考模式下拉",
    });
  });

  it("prefers the compact model combobox over summary text blocks", () => {
    const observation = createObservation({
      matchedSignals: ["video-entry", "seedance-reference", "reference-content", "16:9", "14s"],
      controls: [
        {
          id: 78,
          text: "Seedance 2.0 15s 详细信息",
          tag: "div",
          role: "",
          ariaLabel: "",
          placeholder: "",
          className: "",
          x: 699,
          y: 286,
          width: 219,
          height: 24,
        },
        {
          id: 164,
          text: "Seedance 2.0 Fast",
          tag: "div",
          role: "combobox",
          ariaLabel: "",
          placeholder: "",
          className: "toolbar-select-trigger",
          x: 408,
          y: 662,
          width: 158,
          height: 36,
        },
      ],
    });

    const action = decideHeuristicAction(
      observation,
      { model: "Seedance 2.0", duration: "14s", aspectRatio: "16:9" },
    );

    expect(action).toEqual({
      action: "click_control",
      controlId: 164,
      reason: "切换模型到 Seedance 2.0",
    });
  });

  it("injects jimeng-specific skill guidance into the prompt", () => {
    const prompt = buildActionPrompt(createObservation(), targets);

    expect(prompt).toContain("specialized Jimeng automation agent");
    expect(prompt).toContain("Infinite Canvas");
    expect(prompt).toContain("Seedance 2.0 15s details");
    expect(prompt).toContain("页面正文摘要");
    expect(prompt).toContain("历史失败负样本");
  });

  it("adds stage guidance for the model phase", () => {
    const prompt = buildActionPrompt(
      createObservation({
        matchedSignals: ["video-entry", "seedance-reference", "reference-content", "16:9", "14s"],
        controls: [
          {
            id: 78,
            text: "Seedance 2.0 15s 详细信息",
            tag: "div",
            role: "",
            ariaLabel: "",
            placeholder: "",
            className: "",
            x: 699,
            y: 286,
            width: 219,
            height: 24,
          },
          {
            id: 164,
            text: "Seedance 2.0 Fast",
            tag: "div",
            role: "combobox",
            ariaLabel: "",
            placeholder: "",
            className: "toolbar-select-trigger",
            x: 408,
            y: 662,
            width: 158,
            height: 36,
          },
        ],
      }),
      { model: "Seedance 2.0", duration: "14s", aspectRatio: "16:9" },
    );

    expect(prompt).toContain("当前阶段: model");
    expect(prompt).toContain("只允许处理模型控件和模型弹层选项");
    expect(prompt).toContain("当前阶段优先候选");
    expect(prompt).toContain("#164:Seedance 2.0 Fast");
    expect(prompt).toContain("当前阶段禁点候选");
    expect(prompt).toContain("#78:Seedance 2.0 15s 详细信息");
    expect(prompt).toContain("当前阶段允许的次级动作");
    expect(prompt).toContain("重新展开模型下拉");
    expect(prompt).toContain("当前阶段 few-shot");
    expect(prompt).toContain("禁止点击 Seedance 2.0 / 15s / 详细信息");
    expect(prompt).not.toContain("Infinite Canvas =>");
  });

  it("compresses similar failed-control texts into stable negative-memory ids", () => {
    expect(classifyJimengNegativePattern("Seedance 2.0 15s 详细信息")).toBe("model-details-summary");
    expect(classifyJimengNegativePattern("再次生成")).toBe("history-regenerate-action");
    expect(classifyJimengNegativePattern("Infinite Canvas 灵感无界")).toBe("home-infinite-canvas-card");
  });

  it("suggests existing negative-memory entries for similar future failures", () => {
    expect(suggestJimengNegativeExample("Seedance 2.0 Fast 15s 详细信息", "model")?.id).toBe(
      "model-details-summary",
    );
    expect(suggestJimengNegativeExample("去查看", "global")?.id).toBe("view-action");
  });

  it("summarizes repeated failures into a compact negative-memory report", () => {
    const summary = summarizeJimengNegativeControls(
      [
        "Seedance 2.0 15s 详细信息",
        "去查看",
        "去查看",
        "再次生成",
      ],
      "model",
    );

    expect(summary).toEqual([
      expect.stringContaining("Seedance 2.0 15s"),
      expect.stringContaining("去查看"),
      expect.stringContaining("再次生成"),
    ]);
  });
});
