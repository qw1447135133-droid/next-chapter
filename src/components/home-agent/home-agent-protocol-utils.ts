import type { Message as QueryMessage } from "@/lib/agent/types";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import type { HomeAgentMessage, StudioQuestionState } from "@/lib/home-agent/types";

export function stripHiddenThoughtBlocks(text: string): string {
  return String(text || "")
    .replace(/<think>\s*[\s\S]*?\s*<\/think>/gi, "")
    .replace(/^\s*<\/?think>\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textOf(content: unknown): string {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((block): block is { type: string; text?: string } => !!block && typeof block === "object" && "type" in block)
            .filter((block) => block.type === "text" && typeof block.text === "string")
            .map((block) => block.text?.trim() ?? "")
            .filter(Boolean)
            .join("\n\n")
        : "";
  return stripHiddenThoughtBlocks(text);
}

export function toQuery(messages: HomeAgentMessage[]): QueryMessage[] {
  return messages.flatMap((message) =>
    message.role === "system"
      ? []
      : [
          {
            type: message.role,
            uuid: message.id,
            message: { role: message.role, content: message.content },
          } as QueryMessage,
        ],
  );
}

export function createQuestionState(
  request: AskUserQuestionRequest,
  source: StudioQuestionState["source"] = "live",
): StudioQuestionState {
  return {
    source,
    request,
    currentIndex: 0,
    answers: {},
    displayAnswers: {},
  };
}
