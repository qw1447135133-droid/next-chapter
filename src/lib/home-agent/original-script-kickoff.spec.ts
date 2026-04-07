import { describe, expect, it } from "vitest";
import type { HomeAgentMessage } from "@/lib/home-agent/types";
import { rewindOriginalScriptKickoffMessages } from "./original-script-kickoff";

function message(role: HomeAgentMessage["role"], content: string): HomeAgentMessage {
  return {
    id: `${role}-${content}`,
    role,
    content,
    createdAt: "2026-04-07T00:00:00.000Z",
    status: "complete",
  };
}

describe("rewindOriginalScriptKickoffMessages", () => {
  it("removes the previous kickoff answer bubble and the trailing assistant prompt together", () => {
    const messages: HomeAgentMessage[] = [
      message("assistant", "我们先按传统创作面板把原创剧本立项定下来。"),
      message("user", "创作方式：选题创作"),
      message("assistant", "这次原创剧本主要想打哪个目标市场？"),
      message("user", "目标市场：国内（中文）"),
      message("assistant", "先选 1 到 2 个更接近你这次方向的题材。"),
    ];

    expect(rewindOriginalScriptKickoffMessages(messages)).toEqual([
      messages[0],
      messages[1],
      messages[2],
    ]);
  });

  it("falls back to removing only the trailing assistant prompt when no preceding user answer is found", () => {
    const messages: HomeAgentMessage[] = [
      message("assistant", "我们先按传统创作面板把原创剧本立项定下来。"),
      message("assistant", "这次原创剧本主要想打哪个目标市场？"),
    ];

    expect(rewindOriginalScriptKickoffMessages(messages)).toEqual([messages[0]]);
  });
});
