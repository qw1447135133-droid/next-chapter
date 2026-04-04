import type { Task as RuntimeTask } from "@/lib/agent/tools/task-tools";

export function truncateCopy(value: string, max = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export function parseTaskHeading(prompt: string): string | null {
  const matched =
    prompt.match(/^并行研究\s+([^:：]+)[:：]/) ??
    prompt.match(/^并行研究[:：]\s*(.+)$/);
  return matched?.[1]?.trim() ?? null;
}

export function parseTaskPreview(prompt: string): string {
  const heading = parseTaskHeading(prompt);
  if (!heading) return truncateCopy(prompt, 84);
  const stripped = prompt
    .replace(/^并行研究\s+[^:：]+[:：]\s*/, "")
    .replace(/^并行研究[:：]\s*.+$/, "")
    .trim();
  return truncateCopy(stripped, 96);
}

export function taskStatusLabel(status: RuntimeTask["status"]): string {
  switch (status) {
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已停止";
    default:
      return "待处理";
  }
}

export function taskStatusClass(status: RuntimeTask["status"]): string {
  switch (status) {
    case "running":
      return "border-[#8aa0ff]/24 bg-[#8aa0ff]/10 text-[#dfe5ff]";
    case "completed":
      return "border-emerald-400/18 bg-emerald-400/10 text-emerald-100";
    case "failed":
      return "border-rose-400/18 bg-rose-400/10 text-rose-100";
    case "cancelled":
      return "border-white/[0.08] bg-white/[0.05] text-white/58";
    default:
      return "border-white/[0.08] bg-white/[0.05] text-white/72";
  }
}

export function isTerminalTask(task: RuntimeTask): boolean {
  return task.status === "completed" || task.status === "failed" || task.status === "cancelled";
}

export function formatTaskDockTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildTaskResultMessage(task: RuntimeTask): string {
  const heading = parseTaskHeading(task.prompt);
  const summary = heading ? `并行研究 ${heading}` : truncateCopy(task.prompt, 84);
  const output = truncateCopy((task.output ?? "").trim(), 240);

  if (task.status === "completed") {
    return output
      ? `后台研究已完成：${summary}\n\n${output}`
      : `后台研究已完成：${summary}`;
  }

  if (task.status === "failed") {
    return output
      ? `后台任务执行失败：${summary}\n\n${output}`
      : `后台任务执行失败：${summary}`;
  }

  return "";
}

export function isTaskVisibleForSession(task: RuntimeTask, sessionId: string): boolean {
  return task.sessionId === sessionId;
}

export function areTaskListsEquivalent(nextTasks: RuntimeTask[], prevTasks: RuntimeTask[]): boolean {
  if (nextTasks === prevTasks) return true;
  if (nextTasks.length !== prevTasks.length) return false;

  return nextTasks.every((task, index) => {
    const previous = prevTasks[index];
    return (
      previous &&
      task.id === previous.id &&
      task.status === previous.status &&
      task.sessionId === previous.sessionId &&
      task.projectId === previous.projectId &&
      task.prompt === previous.prompt &&
      task.output === previous.output &&
      task.updatedAt === previous.updatedAt
    );
  });
}
