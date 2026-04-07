import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AssistantMessage } from "@/lib/agent/types";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("hides internal thinking blocks while keeping visible text", () => {
    const message: AssistantMessage = {
      type: "assistant",
      uuid: "assistant-1",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Initiating Plan Generation" },
          { type: "text", text: "可见结论" },
        ],
      },
    };

    render(<MessageBubble message={message} />);

    expect(screen.getByText("可见结论")).toBeInTheDocument();
    expect(screen.queryByText("Initiating Plan Generation")).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
  });
});
