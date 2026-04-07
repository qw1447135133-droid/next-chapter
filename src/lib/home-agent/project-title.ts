function stripTitleDecorators(value: string): string {
  return value
    .trim()
    .replace(/^[-*•\d.)、\s]+/u, "")
    .replace(/^#{1,6}\s*/u, "")
    .replace(/^\*\*(.+)\*\*$/u, "$1")
    .replace(/^__(.+)__$/u, "$1")
    .replace(/^《(.+)》$/u, "$1")
    .replace(/^<(.+)>$/u, "$1")
    .replace(/^「(.+)」$/u, "$1")
    .replace(/^『(.+)』$/u, "$1")
    .replace(/^“(.+)”$/u, "$1")
    .replace(/^"(.+)"$/u, "$1")
    .trim();
}

function normalizeTitleCandidate(value: string): string | null {
  const cleaned = stripTitleDecorators(value)
    .replace(/[。！？.!?：:；;，,]+$/u, "")
    .trim();

  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  if (/^(未命名|当前项目|该项目|这个项目|项目名称|暂定项目名称)$/u.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function pickWrappedTitle(value: string): string | null {
  const wrappedMatch =
    value.match(/[《<「『“"]\s*([^》>」』”"\n]{2,60})\s*[》>」』”"]/u) ??
    value.match(/`([^`\n]{2,60})`/u);
  if (!wrappedMatch?.[1]) return null;
  return normalizeTitleCandidate(wrappedMatch[1]);
}

const TITLE_MARKER =
  /(暂定项目名称|项目暂定名|建议项目名称|建议项目名|项目名称暂定|暂定剧名|建议剧名|暂定片名|建议片名|项目名更新为|项目名称更新为|项目名改为|项目名称改为|定名为|命名为)\s*[:：]?\s*(.+)?/iu;

export function extractAssistantProjectTitle(text: string): string | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) continue;

    const markerMatch = line.match(TITLE_MARKER);
    if (!markerMatch) continue;

    const sameLineCandidate = markerMatch[2]?.trim() || "";
    const wrappedSameLine = pickWrappedTitle(sameLineCandidate);
    if (wrappedSameLine) return wrappedSameLine;

    const normalizedSameLine = normalizeTitleCandidate(sameLineCandidate);
    if (normalizedSameLine) return normalizedSameLine;

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex]?.trim();
      if (!nextLine) continue;
      const wrappedNextLine = pickWrappedTitle(nextLine);
      if (wrappedNextLine) return wrappedNextLine;

      const normalizedNextLine = normalizeTitleCandidate(nextLine);
      if (normalizedNextLine) return normalizedNextLine;
      break;
    }
  }

  const inlineRename =
    text.match(/(?:项目名|项目名称|剧名|片名)(?:更新为|改为|定为|命名为)\s*[《<「『“"]?\s*([^》>」』”"\n]{2,60})\s*[》>」』”"]?/iu) ??
    text.match(/(?:暂定|建议)(?:项目名称|项目名|剧名|片名)\s*[《<「『“"]?\s*([^》>」』”"\n]{2,60})\s*[》>」』”"]?/iu);

  if (inlineRename?.[1]) {
    return normalizeTitleCandidate(inlineRename[1]);
  }

  return null;
}
