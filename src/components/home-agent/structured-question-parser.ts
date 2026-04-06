import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";

interface StructuredQuestionExtraction {
  cleanedText: string;
  request: AskUserQuestionRequest | null;
  workflowCall?: Record<string, unknown> | null;
}

const QUESTION_HEADER_PATTERN =
  /^(?:问题|question)\s*(\d+)(?:\s*\/\s*(\d+))?(?:\s*[—\-:：]\s*(.+))?$/i;
const BULLET_PATTERN = /^\s*(?:[-*•]|(?:\d+|[A-Za-z])[.)、])\s+(.+)$/;

function collapseSpacing(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function stripMarkdownDecorators(value: string): string {
  let result = value.trim();
  result = result.replace(/^#{1,6}\s*/, "").replace(/^>\s*/, "").trim();

  const wrappers = [
    [/^\*\*([\s\S]+)\*\*$/u, "$1"],
    [/^__([\s\S]+)__$/u, "$1"],
    [/^~~([\s\S]+)~~$/u, "$1"],
    [/^`([\s\S]+)`$/u, "$1"],
    [/^\*([\s\S]+)\*$/u, "$1"],
    [/^_([\s\S]+)_$/u, "$1"],
  ] as const;

  let changed = true;
  while (changed) {
    changed = false;
    for (const [pattern, replacement] of wrappers) {
      if (pattern.test(result)) {
        result = result.replace(pattern, replacement).trim();
        changed = true;
      }
    }
  }

  return result.replace(/^\[(.+?)\]\(.+?\)$/u, "$1").trim();
}

function deriveQuestionHeader(id: string | undefined, question: string): string {
  const trimmedId = String(id || "").trim();
  if (trimmedId) {
    return trimmedId.replace(/^q\d+_?/i, "").slice(0, 12) || trimmedId.slice(0, 12);
  }
  return question.trim().slice(0, 12);
}

function deriveHeaderFromQuestion(question: string): string {
  const normalized = stripMarkdownDecorators(question)
    .replace(/[?？]\s*$/u, "")
    .trim();
  const candidate = normalized.split(/[，,:：]/u)[0]?.trim();
  return deriveQuestionHeader(undefined, candidate || normalized || "继续确认");
}

function normalizeOptionLabel(value: string): string {
  return stripMarkdownDecorators(value)
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]+\s*/gu, "")
    .replace(/^(?:选项\s*)?(?:[A-Za-z]|\d+)[.)、]\s*/u, "")
    .trim();
}

function buildToolRequest(
  parsed:
    | Array<Record<string, unknown>>
    | {
        title?: string;
        description?: string;
        allowCustomInput?: boolean;
        submissionMode?: "immediate" | "confirm";
        questions?: Array<Record<string, unknown>>;
      },
): AskUserQuestionRequest | null {
  const rawQuestions = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return null;
  }

  const request: AskUserQuestionRequest = {
    id: crypto.randomUUID(),
    title: Array.isArray(parsed) ? undefined : parsed.title,
    description: Array.isArray(parsed) ? undefined : parsed.description,
    allowCustomInput: Array.isArray(parsed)
      ? rawQuestions.every((question) => question.allowCustomInput !== false)
      : parsed.allowCustomInput !== false,
    submissionMode:
      (Array.isArray(parsed)
        ? rawQuestions.some((question) => question.submissionMode === "confirm")
        : parsed.submissionMode === "confirm")
        ? "confirm"
        : "immediate",
    questions: rawQuestions.map((question, index) => {
      const prompt = String(question.question || "").trim();
      return {
        question: prompt,
        header: String(
          question.header || deriveQuestionHeader(String(question.id || index), prompt),
        ).trim(),
        multiSelect: Boolean(question.multiSelect),
        options: Array.isArray(question.options)
          ? question.options
              .map((option) => ({
                label: String(option?.label || "").trim(),
                value:
                  typeof option?.value === "string" && option.value.trim()
                    ? option.value.trim()
                    : String(option?.label || "").trim(),
                description:
                  typeof option?.description === "string"
                    ? option.description.trim()
                    : undefined,
                rationale:
                  typeof option?.rationale === "string"
                    ? option.rationale.trim()
                    : undefined,
              }))
              .filter((option) => option.label)
          : [],
      };
    }),
  };

  return request.questions.every(
    (question) => question.question && question.options.length > 0,
  )
    ? request
    : null;
}

function extractToolInvocation(text: string): StructuredQuestionExtraction | null {
  const trimmed = text.trim();
  if (!trimmed.includes("AskUserQuestion(")) {
    if (!trimmed.includes("AskUserQuestion")) {
      return null;
    }
  }

  const codeBlockMatch = trimmed.match(
    /```(?:json)?\s*AskUserQuestion\s*\(?\s*([\s\S]*?)\s*\)?\s*```/i,
  );
  const inlineMatch =
    codeBlockMatch ??
    trimmed.match(/AskUserQuestion\s*\(?\s*([\s\S]*?)\s*\)?\s*$/i);
  const payload = inlineMatch?.[1]?.trim();

  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as
      | Array<Record<string, unknown>>
      | {
          title?: string;
          description?: string;
          allowCustomInput?: boolean;
          submissionMode?: "immediate" | "confirm";
          questions?: Array<Record<string, unknown>>;
        };

    const request = buildToolRequest(parsed);
    if (!request) {
      return null;
    }

    return {
      cleanedText: collapseSpacing(
        text.replace(codeBlockMatch?.[0] || inlineMatch?.[0] || "", ""),
      ),
      request,
      workflowCall: null,
    };
  } catch {
    return null;
  }
}

function extractWorkflowInvocation(text: string): StructuredQuestionExtraction | null {
  const trimmed = text.trim();
  if (!trimmed.includes("HomeStudioWorkflow")) {
    return null;
  }

  const codeBlockMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const toolPayload = codeBlockMatches
    .map((match) => match[1]?.trim() || "")
    .find((payload) => /HomeStudioWorkflow|\"tool\"\s*:\s*\"HomeStudioWorkflow\"/i.test(payload));

  const invocationMatch =
    (toolPayload &&
      (toolPayload.match(/HomeStudioWorkflow\s*\(\s*([\s\S]*?)\s*\)\s*$/i) ||
        toolPayload.match(/(\{[\s\S]*\"tool\"\s*:\s*\"HomeStudioWorkflow\"[\s\S]*\})/i))) ||
    trimmed.match(/HomeStudioWorkflow\s*\(\s*([\s\S]*?)\s*\)\s*$/i);

  const payload = invocationMatch?.[1]?.trim() || invocationMatch?.[0]?.trim();
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const workflowCall =
      parsed.tool === "HomeStudioWorkflow"
        ? Object.fromEntries(
            Object.entries(parsed).filter(([key]) => key !== "tool"),
          )
        : parsed;

    if (typeof workflowCall.action !== "string" || !workflowCall.action.trim()) {
      return null;
    }

    const matchedBlock = codeBlockMatches.find((match) =>
      (match[1] || "").includes(payload),
    )?.[0];

    return {
      cleanedText: collapseSpacing(
        text.replace(matchedBlock || invocationMatch?.[0] || "", ""),
      ),
      request: null,
      workflowCall,
    };
  } catch {
    return null;
  }
}

function parseQuestionHeader(line: string): { index: number; total?: number; title?: string } | null {
  const normalized = stripMarkdownDecorators(line);
  const match = normalized.match(QUESTION_HEADER_PATTERN);
  if (!match) return null;

  return {
    index: Number.parseInt(match[1], 10),
    total: match[2] ? Number.parseInt(match[2], 10) : undefined,
    title: normalizeOptionLabel(match[3] || "") || undefined,
  };
}

function parseOptionLine(line: string): {
  label: string;
  rationale?: string;
  isCustomInputHint: boolean;
} | null {
  const match = line.match(BULLET_PATTERN);
  if (!match) return null;

  const normalized = normalizeOptionLabel(match[1] || "");
  if (!normalized) return null;

  if (
    /自定义|custom/i.test(normalized) &&
    /(输入|回答|补充|说明|custom|input)/i.test(normalized)
  ) {
    return {
      label: "",
      isCustomInputHint: true,
    };
  }

  if (/^其他(?:\s|[，,:：-]|$)/u.test(normalized) && /(描述|说明|补充|自定)/u.test(normalized)) {
    return {
      label: "",
      isCustomInputHint: true,
    };
  }

  const colonMatch = normalized.match(/^(.+?)[：:]\s*(.+)$/u);
  if (colonMatch) {
    return {
      label: normalizeOptionLabel(colonMatch[1]),
      rationale: stripMarkdownDecorators(colonMatch[2]).trim(),
      isCustomInputHint: false,
    };
  }

  const parentheticalMatch = normalized.match(/^(.+?)[（(]\s*(.+?)\s*[）)]$/u);
  if (parentheticalMatch) {
    return {
      label: normalizeOptionLabel(parentheticalMatch[1]),
      rationale: stripMarkdownDecorators(parentheticalMatch[2]).trim(),
      isCustomInputHint: false,
    };
  }

  return {
    label: normalized,
    isCustomInputHint: false,
  };
}

function buildMarkdownRequest(text: string): StructuredQuestionExtraction | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const keptLines: string[] = [];
  const questions: AskUserQuestionRequest["questions"] = [];
  let inferredTotal: number | undefined;

  for (let index = 0; index < lines.length; ) {
    const header = parseQuestionHeader(lines[index]);

    if (!header) {
      keptLines.push(lines[index]);
      index += 1;
      continue;
    }

    const blockLines = [lines[index]];
    const questionPromptLines: string[] = [];
    const options: AskUserQuestionRequest["questions"][number]["options"] = [];
    let blockIndex = index + 1;

    while (blockIndex < lines.length && !parseQuestionHeader(lines[blockIndex])) {
      blockLines.push(lines[blockIndex]);
      const trimmedLine = lines[blockIndex].trim();
      if (!trimmedLine) {
        blockIndex += 1;
        continue;
      }

      const option = parseOptionLine(trimmedLine);
      if (option) {
        if (!option.isCustomInputHint && option.label) {
          options.push({
            label: option.label,
            value: option.label,
            rationale: option.rationale,
          });
        }
        blockIndex += 1;
        continue;
      }

      questionPromptLines.push(stripMarkdownDecorators(trimmedLine));
      blockIndex += 1;
    }

    if (options.length > 0) {
      const prompt = questionPromptLines.join(" ").trim();
      const headerText = header.title || deriveQuestionHeader(undefined, prompt || `问题${header.index}`);
      const questionText = prompt || `请先确认${headerText}`;
      questions.push({
        question: questionText,
        header: headerText,
        multiSelect: /多选|可多选|任选|1\s*[-~至到]\s*\d+/u.test(prompt),
        options,
      });
      inferredTotal = header.total ?? inferredTotal;
    } else {
      keptLines.push(...blockLines);
    }

    index = blockIndex;
  }

  if (questions.length === 0) {
    return null;
  }

  return {
    cleanedText: collapseSpacing(keptLines.join("\n")),
    request: {
      id: crypto.randomUUID(),
      title: inferredTotal && inferredTotal > 1 ? `先确认 ${questions.length} 个关键问题` : undefined,
      allowCustomInput: true,
      submissionMode: "immediate",
      questions,
    },
    workflowCall: null,
  };
}

function extractQuestionPromptFromLine(line: string): {
  question: string;
  remainder: string;
} | null {
  const boldQuestionMatches = [...line.matchAll(/(?:\*\*|__)(.+?[?？])(?:\*\*|__)/gu)];
  const boldQuestion = boldQuestionMatches.at(-1);

  if (boldQuestion?.[1]) {
    return {
      question: stripMarkdownDecorators(boldQuestion[1]).trim(),
      remainder: stripMarkdownDecorators(line.replace(boldQuestion[0], "")).trim(),
    };
  }

  const normalized = stripMarkdownDecorators(line);
  if (/[?？]\s*$/u.test(normalized)) {
    return {
      question: normalized.trim(),
      remainder: "",
    };
  }

  return null;
}

function extractDeclarativeSelectionPromptFromLine(line: string): {
  question: string;
  remainder: string;
} | null {
  const normalized = stripMarkdownDecorators(line).trim();
  if (!normalized) return null;

  const looksLikeSelectionLead =
    /(常见|通常|一般).*(目标|方向|类型|路径).*(有|分为|包括|共|类)/u.test(normalized) ||
    /(?:先|请先|接下来)?(?:选择|确认|锁定).*(目标|方向|类型|路径)/u.test(normalized);

  if (!looksLikeSelectionLead) return null;

  return {
    question: "请选择一个方向",
    remainder: "",
  };
}

function buildInlinePromptRequest(text: string): StructuredQuestionExtraction | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let promptIndex = -1;
  let promptQuestion = "";
  let promptRemainder = "";
  let optionStart = -1;
  let optionEnd = -1;
  let options: AskUserQuestionRequest["questions"][number]["options"] = [];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const maybeOption = parseOptionLine(lines[index].trim());
    if (!maybeOption) {
      continue;
    }

    const clusterOptions: AskUserQuestionRequest["questions"][number]["options"] = [];
    let clusterStart = index;
    let clusterEnd = index;

    while (clusterStart >= 0) {
      const current = lines[clusterStart].trim();
      if (!current) {
        clusterStart -= 1;
        continue;
      }

      const parsed = parseOptionLine(current);
      if (!parsed) break;
      if (!parsed.isCustomInputHint && parsed.label) {
        clusterOptions.unshift({
          label: parsed.label,
          value: parsed.label,
          rationale: parsed.rationale,
        });
      }
      clusterStart -= 1;
    }

    if (clusterOptions.length < 2) {
      index = clusterStart;
      continue;
    }

    let candidatePromptIndex = clusterStart;
    while (candidatePromptIndex >= 0) {
      const current = lines[candidatePromptIndex].trim();
      if (!current || /^[-*_]{3,}$/u.test(current)) {
        candidatePromptIndex -= 1;
        continue;
      }

      const prompt = extractQuestionPromptFromLine(lines[candidatePromptIndex]);
      const inferredPrompt = prompt ?? extractDeclarativeSelectionPromptFromLine(lines[candidatePromptIndex]);
      if (inferredPrompt) {
        promptIndex = candidatePromptIndex;
        promptQuestion = inferredPrompt.question;
        promptRemainder = inferredPrompt.remainder;
        optionStart = clusterStart + 1;
        optionEnd = clusterEnd;
        options = clusterOptions;
      }
      break;
    }

    if (promptIndex >= 0) {
      break;
    }

    index = clusterStart;
  }

  if (promptIndex < 0 || optionStart < 0 || optionEnd < optionStart || options.length < 2) {
    return null;
  }

  const keptLines = lines.flatMap((line, index) => {
    if (index === promptIndex) {
      return promptRemainder ? [promptRemainder] : [];
    }
    if (index >= optionStart && index <= optionEnd) {
      return [];
    }
    return [line];
  });

  return {
    cleanedText: collapseSpacing(keptLines.join("\n")),
    request: {
      id: crypto.randomUUID(),
      allowCustomInput: true,
      submissionMode: "immediate",
      questions: [
        {
          question: promptQuestion,
          header: deriveHeaderFromQuestion(promptQuestion),
          multiSelect: /多选|可多选/u.test(promptQuestion),
          options,
        },
      ],
    },
    workflowCall: null,
  };
}

export function extractStructuredQuestion(text: string): StructuredQuestionExtraction {
  return (
    extractToolInvocation(text) ??
    extractWorkflowInvocation(text) ??
    buildMarkdownRequest(text) ??
    buildInlinePromptRequest(text) ?? {
      cleanedText: text,
      request: null,
      workflowCall: null,
    }
  );
}
