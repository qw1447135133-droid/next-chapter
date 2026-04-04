import type { Message as QueryMessage } from "@/lib/agent/types";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import type { HomeAgentMessage, StudioQuestionState } from "@/lib/home-agent/types";

export function textOf(content: unknown): string {
  return Array.isArray(content)
    ? content
        .filter((block): block is { type: string; text?: string } => !!block && typeof block === "object" && "type" in block)
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text?.trim() ?? "")
        .filter(Boolean)
        .join("\n\n")
    : "";
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

export function createQuestionState(request: AskUserQuestionRequest): StudioQuestionState {
  return {
    request,
    currentIndex: 0,
    answers: {},
    displayAnswers: {},
  };
}
