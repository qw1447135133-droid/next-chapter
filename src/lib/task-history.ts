/**
 * 全局任务历史（localStorage），供合规审核等长任务记录进度与结果。
 */
const STORAGE_KEY = "storyforge_task_history";
/** 合规任务历史最多保留条数 */
export const MAX_COMPLIANCE_TASK_HISTORY = 10;

export type TaskHistoryStatus = "running" | "completed" | "failed" | "cancelled";

export type ComplianceTaskHistoryEntry = {
  id: string;
  kind: "compliance";
  source: "standalone" | "script-creator";
  title: string;
  status: TaskHistoryStatus;
  reviewMode: "text" | "script";
  segmentProgress?: { current: number; total: number } | null;
  detail?: string;
  startedAt: string;
  updatedAt: string;
  projectId?: string;
};

export type TaskHistoryEntry = ComplianceTaskHistoryEntry;

/** 独立合规页从任务历史恢复时使用的本地快照（与任务 id 对应） */
export type ComplianceStandaloneRestoreV1 = {
  v: 1;
  scriptText: string;
  complianceReport: string;
  reviewMode: "text" | "script";
  strictness: "standard" | "strict" | "extreme";
  inputMode: "text" | "table";
  tableData: {
    headers: string[];
    rows: (string | number | null)[][];
    fileName: string;
    sheetName?: string;
    originalData: (string | number | null)[][];
  } | null;
};

const RESTORE_PREFIX = "storyforge_compliance_restore_";

function restoreKey(taskId: string) {
  return `${RESTORE_PREFIX}${taskId}`;
}

export function saveComplianceStandaloneRestore(taskId: string, data: ComplianceStandaloneRestoreV1): void {
  try {
    const json = JSON.stringify(data);
    if (json.length > 4_500_000) return;
    localStorage.setItem(restoreKey(taskId), json);
  } catch {
    /* quota or private mode */
  }
}

export function loadComplianceStandaloneRestore(taskId: string): ComplianceStandaloneRestoreV1 | null {
  try {
    const raw = localStorage.getItem(restoreKey(taskId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComplianceStandaloneRestoreV1;
    return parsed?.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function removeComplianceStandaloneRestore(taskId: string): void {
  try {
    localStorage.removeItem(restoreKey(taskId));
  } catch {
    /* ignore */
  }
}

function dispatchUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("storyforge-task-history-updated"));
  }
}

export function getTaskHistory(): TaskHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TaskHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    const withoutFailed = parsed.filter((e) => e.status !== "failed");
    const trimmed = withoutFailed.slice(0, MAX_COMPLIANCE_TASK_HISTORY);
    if (trimmed.length !== parsed.length) {
      saveTaskHistory(trimmed);
    }
    return trimmed;
  } catch {
    return [];
  }
}

function saveTaskHistory(entries: TaskHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  dispatchUpdated();
}

export function addComplianceTask(entry: Omit<ComplianceTaskHistoryEntry, "id" | "startedAt" | "updatedAt" | "kind">): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row: ComplianceTaskHistoryEntry = {
    ...entry,
    kind: "compliance",
    id,
    startedAt: now,
    updatedAt: now,
  };
  const prev = getTaskHistory();
  const next = [row, ...prev].slice(0, MAX_COMPLIANCE_TASK_HISTORY);
  saveTaskHistory(next);
  return id;
}

export function removeComplianceTask(id: string): void {
  const prev = getTaskHistory();
  const next = prev.filter((e) => e.id !== id);
  if (next.length === prev.length) return;
  removeComplianceStandaloneRestore(id);
  saveTaskHistory(next);
}

export function updateComplianceTask(
  id: string,
  patch: Partial<Pick<ComplianceTaskHistoryEntry, "status" | "segmentProgress" | "detail" | "title">>,
) {
  const prev = getTaskHistory();
  if (patch.status === "failed") {
    removeComplianceStandaloneRestore(id);
    const next = prev.filter((e) => e.id !== id);
    saveTaskHistory(next);
    return;
  }
  const now = new Date().toISOString();
  const next = prev.map((e) => {
    if (e.id !== id || e.kind !== "compliance") return e;
    return { ...e, ...patch, updatedAt: now };
  });
  saveTaskHistory(next);
}
