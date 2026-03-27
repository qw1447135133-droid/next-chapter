/**
 * 即梦逆向自动化 API 客户端
 *
 * 与 auto_jimeng Python FastAPI 服务通信。
 *
 * 启动方式（优先级）：
 *  1. Electron 环境 → 通过 preload IPC 调用主进程自动启动 Python 服务
 *  2. Web 环境 → 使用配置的 API 地址（需用户手动启动 Python 服务）
 *
 * 核心流程：
 *  1. 健康检查              → GET /api/health
 *  2. 启动/检查 Python 服务（Electron only）
 *  3. 提交视频生成任务      → POST /api/generate
 *  4. 轮询任务状态        → GET /api/task/{task_id}
 *  5. 触发视频下载         → POST /api/download
 */

import { getApiConfig } from "@/pages/Settings";
import { getResolvedFilesStoragePath } from "@/lib/storage-path";

export type JimengTaskStatus = "pending" | "running" | "success" | "failed";
export type JimengTaskType = "generate" | "download" | "setup";

export interface JimengTask {
  task_id: string;
  task_type: JimengTaskType;
  status: JimengTaskStatus;
  progress: number;
  total: number;
  logs: string[];
  result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface JimengHealth {
  status: "ok";
  mode: string;
  version: string;
  task_count: number;
}

export interface GenerateParams {
  /** 工作目录路径（如 D:/projects/test_ep1），需包含 test/ 子目录 */
  workDir: string;
  /** 可选：指定集数文件夹名 */
  episodeDir?: string;
  /** 可选：指定 xlsx 文件名（仅当 episodeDir 已指定时有效） */
  xlsxFile?: string;
  /** 视频比例，默认 9:16 */
  aspectRatio?: string;
  /** 视频时长（如 "15s"，范围 4s-15s），默认 15s */
  duration?: string;
  /** 是否跳过已存在的视频，默认 true */
  skipExisting?: boolean;
  /** 每个任务之间的等待秒数，默认 45 */
  waitBetween?: number;
  /** 每 N 个任务后休息一次，默认 5 */
  restAfterTasks?: number;
  /** 休息时长（秒），默认 3000 */
  restDuration?: number;
}

// =========================== Electron IPC 桥接 ===========================

interface JimengElectronAPI {
  start: () => Promise<{
    ok: boolean;
    status: string;
    apiBase?: string;
    logs: string[];
  }>;
  stop: () => Promise<{ ok: boolean }>;
  status: () => Promise<{
    status: string;
    apiBase?: string;
    message?: string;
    logs?: string[];
  }>;
  getApiBase: () => Promise<string | null>;
  openSetup: () => Promise<{ ok: boolean }>;
  openBrowserData: () => Promise<void>;
  onStatusChange: (
    callback: (status: {
      status: string;
      apiBase?: string;
      message?: string;
      logs?: string[];
    }) => void,
  ) => () => void;
}

interface StorageAPI {
  getDefaultPath: () => Promise<{ files: string; db: string }>;
  selectFolder: () => Promise<string | null>;
  openFolder: (folderPath: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: {
      jimeng: JimengElectronAPI;
      storage: StorageAPI;
    };
  }
}

function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.jimeng;
}

// =========================== HTTP 请求层 ===========================

function getWebBaseUrl(): string {
  const config = getApiConfig();
  return (config.autoJimengApiBase || "http://localhost:8000").replace(
    /\/$/,
    "",
  );
}

async function request<T>(
  base: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${base}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "Unknown error");
    throw new Error(`即梦 API 请求失败 (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<T>;
}

// =========================== Electron 模式 ===========================

async function electronStartServer(): Promise<string> {
  if (!window.electronAPI?.jimeng) throw new Error("Electron API 不可用");
  const result = await window.electronAPI.jimeng.start();
  if (!result.ok) throw new Error(result.status || "服务启动失败");
  if (!result.apiBase) throw new Error("未返回 API 地址");
  return result.apiBase;
}

async function electronGetApiBase(): Promise<string | null> {
  if (!window.electronAPI?.jimeng) return null;
  return window.electronAPI.jimeng.getApiBase();
}

// =========================== 公开 API（自动选择模式）===========================

/** 健康检查 */
export async function jimengHealth(): Promise<JimengHealth> {
  let base: string;

  if (isElectron()) {
    const url = await electronGetApiBase();
    if (!url) throw new Error("即梦服务尚未启动，请先启动服务");
    base = url;
  } else {
    base = getWebBaseUrl();
  }

  return request<JimengHealth>(base, "/api/health");
}

/**
 * 启动即梦 Python 服务（Electron 模式：调用主进程自动启动）
 * 返回 API 基础地址
 */
export async function jimengEnsureStarted(): Promise<string> {
  if (!isElectron()) {
    // Web 模式：尝试直接 ping 健康检查，若失败则报错
    const base = getWebBaseUrl();
    try {
      await request<JimengHealth>(base, "/api/health");
      return base;
    } catch {
      throw new Error(
        `无法连接到即梦服务 (${base})，请确保 Python 服务已启动：\nuv run python start_api.py`,
      );
    }
  }

  // Electron 模式：自动启动服务
  return electronStartServer();
}

/** 提交视频生成任务 */
export async function jimengSubmitGenerate(
  params: GenerateParams,
): Promise<{ task_id: string; status: string; message: string }> {
  const base = await jimengEnsureStarted();
  return request(base, "/api/generate", {
    method: "POST",
    body: JSON.stringify({
      work_dir: params.workDir,
      episode_dir: params.episodeDir ?? null,
      xlsx_file: params.xlsxFile ?? null,
      aspect_ratio: params.aspectRatio ?? "9:16",
      duration: params.duration ?? "15s",
      skip_existing: params.skipExisting ?? true,
      wait_between: params.waitBetween ?? 45,
      rest_after_tasks: params.restAfterTasks ?? 5,
      rest_duration: params.restDuration ?? 3000,
    }),
  });
}

/** 提交浏览器登录设置任务 */
export async function jimengSubmitSetup(
  workDir?: string,
): Promise<{ task_id: string; status: string; message: string }> {
  const base = await jimengEnsureStarted();
  return request(base, "/api/setup", {
    method: "POST",
    body: JSON.stringify({ work_dir: workDir ?? null }),
  });
}

/** 提交视频下载任务 */
export async function jimengSubmitDownload(
  workDir?: string,
  maxCount?: number,
): Promise<{ task_id: string; status: string; message: string }> {
  const base = await jimengEnsureStarted();
  return request(base, "/api/download", {
    method: "POST",
    body: JSON.stringify({
      work_dir: workDir ?? null,
      max_count: maxCount ?? null,
    }),
  });
}

/** 查询任务状态 */
export async function jimengGetTask(taskId: string): Promise<JimengTask> {
  const base = await jimengEnsureStarted();
  return request<JimengTask>(base, `/api/task/${taskId}`);
}

/** 列出所有任务（可选按类型/状态筛选） */
export async function jimengListTasks(
  taskType?: JimengTaskType,
  status?: JimengTaskStatus,
): Promise<{ total: number; tasks: JimengTask[] }> {
  const base = await jimengEnsureStarted();
  const params = new URLSearchParams();
  if (taskType) params.set("task_type", taskType);
  if (status) params.set("status", status);
  const qs = params.toString();
  return request(base, `/api/tasks${qs ? `?${qs}` : ""}`);
}

/** 删除已完成任务 */
export async function jimengDeleteTask(
  taskId: string,
): Promise<{ message: string }> {
  const base = await jimengEnsureStarted();
  return request(base, `/api/task/${taskId}`, { method: "DELETE" });
}

/** 轮询任务直到完成（成功或失败），返回最终状态 */
export async function jimengPollUntilDone(
  taskId: string,
  onUpdate?: (task: JimengTask) => void,
  intervalMs = 3000,
  timeoutMs?: number,
): Promise<JimengTask> {
  const deadline = timeoutMs ? Date.now() + timeoutMs : Infinity;

  while (Date.now() < deadline) {
    const task = await jimengGetTask(taskId);
    onUpdate?.(task);
    if (task.status === "success" || task.status === "failed") {
      return task;
    }
    await sleep(intervalMs);
  }

  return jimengGetTask(taskId);
}

/** 获取当前服务状态（Electron IPC） */
export async function jimengGetStatus(): Promise<{
  status: string;
  apiBase?: string;
  message?: string;
  logs?: string[];
}> {
  if (!isElectron()) {
    // Web 模式：直接 ping 健康检查
    const base = getWebBaseUrl();
    try {
      await request<JimengHealth>(base, "/api/health");
      return { status: "running", apiBase: base };
    } catch {
      return { status: "stopped" };
    }
  }
  return window.electronAPI!.jimeng.status();
}

/** 监听服务状态变化（Electron IPC） */
export function jimengOnStatusChange(
  callback: (status: {
    status: string;
    apiBase?: string;
    message?: string;
    logs?: string[];
  }) => void,
): () => void {
  if (!isElectron()) return () => {};
  return window.electronAPI!.jimeng.onStatusChange(callback);
}

/** 打开即梦登录页（Electron IPC） */
export async function jimengOpenSetup(): Promise<void> {
  if (!isElectron()) {
    window.open("https://jimeng.jianying.com/ai-tool/home");
    return;
  }
  await window.electronAPI!.jimeng.openSetup();
}

/** 打开浏览器数据目录（Electron IPC） */
export async function jimengOpenBrowserData(): Promise<void> {
  if (!isElectron()) return;
  await window.electronAPI!.jimeng.openBrowserData();
}

// =========================== xlsx 生成 & 写入 ===========================

function isElectronBridge(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.jimeng;
}

/** 写入 xlsx 文件并返回即梦目录信息（Electron IPC） */
async function prepareXlsxFile(params: {
  episodeLabel: string;
  base64Content: string;
  xlsxName: string;
}): Promise<{
  ok: boolean;
  workDir?: string;
  episodeDir?: string;
  xlsxFile?: string;
  error?: string;
}> {
  if (!isElectronBridge()) {
    return { ok: false, error: "Web 模式请手动下载 xlsx 文件" };
  }
  const storageRoot = await getResolvedFilesStoragePath();
  return window.electronAPI!.jimeng.prepareXlsx({
    ...params,
    ...(storageRoot ? { storageRoot } : {}),
  });
}

/** 生成即梦 xlsx ArrayBuffer */
async function buildJimengXlsxBuffer(
  rows: Array<{
    镜号: number;
    景别: string;
    镜头运动: string;
    场景时间: string;
    画面内容: string;
    人物动作神态: string;
    对白: string;
    角色Characters: string;
    音效备注: string;
  }>,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("分镜");

  const headers = [
    "镜号",
    "景别",
    "镜头运动",
    "场景/时间",
    "画面内容",
    "人物动作/神态",
    "对白（美式口语）",
    "角色/Characters",
    "音效/备注",
  ];
  ws.addRow(headers);
  for (const r of rows) {
    ws.addRow([
      r.镜号,
      r.景别,
      r.镜头运动,
      r.场景时间,
      r.画面内容,
      r.人物动作神态,
      r.对白,
      r.角色Characters,
      r.音效备注,
    ]);
  }
  ws.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const val = String(cell.value ?? "");
      if (val.length > maxLen) maxLen = Math.min(val.length, 40);
    });
    col.width = maxLen + 2;
  });
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/**
 * 提交即梦视频生成任务（直接传入分镜数据，无需手动填目录路径）。
 *
 * 工作流程：
 *  1. 根据 scenes + characters 生成 xlsx（内存中）
 *  2. 通过 Electron IPC 写入即梦临时目录
 *  3. 调用 /api/generate
 */
export async function jimengSubmitGenerateFromScenes(params: {
  scenes: Array<{
    sceneNumber: number;
    description: string;
    dialogue?: string;
    characters: string[];
    cameraDirection?: string;
    segmentLabel?: string;
  }>;
  characters: Array<{ name: string; description?: string }>;
  aspectRatio?: string;
  duration?: string;
  skipExisting?: boolean;
  /** 集数编号，用于文件命名 */
  episodeNumber?: number;
}): Promise<{
  task_id: string;
  status: string;
  message: string;
  workDir?: string;
}> {
  const episodeLabel =
    params.episodeNumber != null ? String(params.episodeNumber) : "auto";
  const xlsxName = `scene_${episodeLabel}.xlsx`;

  // 生成 xlsx
  const rows = params.scenes.map((s, idx) => ({
    镜号: idx + 1,
    景别: "",
    镜头运动: s.cameraDirection ?? "",
    场景时间: s.segmentLabel ?? "",
    画面内容: s.description,
    人物动作神态: "",
    对白: s.dialogue ?? "",
    角色Characters: s.characters.join("、"),
    音效备注: "",
  }));

  const buffer = await buildJimengXlsxBuffer(rows);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

  // Electron 模式：写入即梦临时目录
  const prepResult = await prepareXlsxFile({
    episodeLabel,
    base64Content: base64,
    xlsxName,
  });

  if (!prepResult.ok || !prepResult.workDir) {
    if (!isElectronBridge()) {
      // Web 模式：触发下载
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++)
        bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = xlsxName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      throw new Error(
        "Web 模式：已将 xlsx 下载到本地，请放入即梦项目目录的 test/<集数>/ 后手动运行服务。",
      );
    }
    throw new Error(`写入 xlsx 失败：${prepResult.error}`);
  }

  // 提交即梦任务
  const result = await jimengSubmitGenerate({
    workDir: prepResult.workDir,
    episodeDir: prepResult.episodeDir!,
    xlsxFile: prepResult.xlsxFile!,
    aspectRatio: params.aspectRatio,
    duration: params.duration,
    skipExisting: params.skipExisting,
  });

  return { ...result, workDir: prepResult.workDir };
}
