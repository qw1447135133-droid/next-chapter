/**
 * electron/main.ts
 *
 * Electron 主进程：
 *  - 启动 / 管理 Python 即梦自动化服务（子进程）
 *  - 通过 preload 向渲染进程暴露安全的 IPC API
 *  - 窗口管理 + 系统托盘
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
} = require("electron");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require("node:child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { reversePlaywrightRunner } = require("./reverse-playwright-runner");

// CJS 模式下 __dirname 由 Node.js 自动提供
// 注意：main.ts 被 esbuild 编译为 CJS，__dirname 在运行时可用
// __dirname 指向 electron/ 目录

// =========================== 配置 ===========================

/** 获取资源目录：开发时指向 electron/../auto_jimeng，打包后指向 resources/auto_jimeng */
function getJimengSourceDir(): string {
  try {
    const isDev = !app.isPackaged;
    if (isDev) {
      return path.join(__dirname, "..", "auto_jimeng");
    }
    return path.join(process.resourcesPath, "auto_jimeng");
  } catch {
    // app.isPackaged 在模块加载时可能不可用，默认用开发模式
    return path.join(__dirname, "..", "auto_jimeng");
  }
}

/** Python API 服务监听端口 */
const API_PORT = 8000;
/** API 地址 */
const API_BASE = `http://localhost:${API_PORT}`;

// =========================== 状态 ===========================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pythonProcess: ChildProcess | null = null;
let pythonStatus: "stopped" | "starting" | "running" | "error" = "stopped";
let pythonLogs: string[] = [];
let embeddedBrowserView: BrowserView | null = null;
let embeddedBrowserState = {
  visible: false,
  url: "",
  title: "",
  loading: false,
  error: "",
};
let embeddedBrowserBounds = { x: 0, y: 0, width: 0, height: 0 };

function emitEmbeddedBrowserState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("browserView:state", {
    ...embeddedBrowserState,
  });
}

function attachEmbeddedBrowserEvents(view: typeof embeddedBrowserView) {
  if (!view) return;

  view.webContents.on("page-title-updated", (_event: unknown, title: string) => {
    embeddedBrowserState.title = title;
    emitEmbeddedBrowserState();
  });

  view.webContents.on("did-start-loading", () => {
    embeddedBrowserState.loading = true;
    embeddedBrowserState.error = "";
    emitEmbeddedBrowserState();
  });

  view.webContents.on("did-stop-loading", () => {
    embeddedBrowserState.loading = false;
    embeddedBrowserState.url = view.webContents.getURL();
    emitEmbeddedBrowserState();
  });

  view.webContents.on("did-fail-load", (_event: unknown, code: number, description: string) => {
    if (code === -3) {
      log("warn", `BrowserView 导航被中断: ${description}`);
      return;
    }
    embeddedBrowserState.loading = false;
    embeddedBrowserState.error = description;
    emitEmbeddedBrowserState();
  });

  view.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (url.startsWith("https://jimeng.jianying.com/")) {
      view.webContents.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

async function loadURLWithAbortTolerance(view: BrowserView, url: string) {
  try {
    await view.webContents.loadURL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const currentUrl = view.webContents.getURL();
    if (message.includes("ERR_ABORTED") || message.includes("(-3)")) {
      // Jimeng sometimes redirects through an intermediate route and Electron
      // reports a recoverable abort before the final page URL is committed.
      log("warn", `BrowserView loadURL 被中断，按可恢复处理: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      embeddedBrowserState.url = view.webContents.getURL() || currentUrl || url;
      embeddedBrowserState.loading = false;
      embeddedBrowserState.error = "";
      emitEmbeddedBrowserState();
      return;
    }
    throw error;
  }
}

async function ensureEmbeddedBrowserView(url?: string) {
  if (!mainWindow) throw new Error("主窗口尚未创建");
  if (!embeddedBrowserView) {
    log("info", "创建内嵌 BrowserView");
    embeddedBrowserView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    mainWindow.setBrowserView(embeddedBrowserView);
    attachEmbeddedBrowserEvents(embeddedBrowserView);
  }

  if (embeddedBrowserBounds.width > 0 && embeddedBrowserBounds.height > 0) {
    log("info", `设置 BrowserView bounds: ${JSON.stringify(embeddedBrowserBounds)}`);
    embeddedBrowserView.setBounds(embeddedBrowserBounds);
    embeddedBrowserView.setAutoResize({ width: true, height: true });
  } else {
    log("warn", `BrowserView bounds 无效，跳过设置: ${JSON.stringify(embeddedBrowserBounds)}`);
  }

  embeddedBrowserState.visible = true;
  if (url) {
    const currentUrl =
      embeddedBrowserView.webContents.getURL() || embeddedBrowserState.url;
    embeddedBrowserState.url = url;
    if (currentUrl === url) {
      log("info", `BrowserView already at target URL, skipping reload: ${url}`);
    } else {
    log("info", `BrowserView 导航到: ${url}`);
      await loadURLWithAbortTolerance(embeddedBrowserView, url);
    }
  }
  emitEmbeddedBrowserState();
  return embeddedBrowserView;
}

function hideEmbeddedBrowserView() {
  if (!embeddedBrowserView || !mainWindow) return;
  embeddedBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  embeddedBrowserState.visible = false;
  emitEmbeddedBrowserState();
}

function closeEmbeddedBrowserView() {
  if (!embeddedBrowserView || !mainWindow) return;
  mainWindow.removeBrowserView(embeddedBrowserView);
  try {
    const wc = embeddedBrowserView.webContents as any;
    if (wc && !wc.isDestroyed?.()) {
      wc.destroy?.();
    }
  } catch {
    /* ignore */
  }
  embeddedBrowserView = null;
  embeddedBrowserState = { visible: false, url: "", title: "", loading: false, error: "" };
  embeddedBrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
  emitEmbeddedBrowserState();
}

function getUserDataPath(): string {
  return app.getPath("userData");
}

function getBrowserDataPath(): string {
  // 即梦浏览器数据放在用户目录，避免打包 exe 内部
  return path.join(getUserDataPath(), "jimeng_browser_data");
}

/**
 * 默认缓存目录：与程序同级的 files/
 * - 开发：项目根目录/files（main 在 electron/，上一级为仓库根）
 * - 打包：可执行文件所在目录/files
 */
function getDefaultFilesDir(): string {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), "files");
  }
  return path.join(__dirname, "..", "files");
}

// =========================== 日志 ===========================

function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] [${level}] ${msg}`;
  pythonLogs.push(line);
  if (pythonLogs.length > 500) pythonLogs.shift();
  console.log(line);
}

// =========================== Python 服务管理 ===========================

/** 查找可用的 Python/uv 解释器 */
async function findPython(): Promise<{
  cmd: string;
  args: string[];
  useUv: boolean;
} | null> {
  // 策略1: uv（auto_jimeng 用 uv 管理依赖）
  for (const name of ["uv"]) {
    try {
      const result = await runCommand(name, ["--version"], 5000);
      if (result.stdout.includes("uv ")) {
        log("info", `找到 uv 包管理器，将使用 "uv run python"`);
        return { cmd: name, args: ["run", "python"], useUv: true };
      }
    } catch {
      /* try next */
    }
  }

  // 策略2: 直接用 venv 中的 Python（已包含所有依赖）
  const venvPython = path.join(
    getJimengSourceDir(),
    ".venv",
    "Scripts",
    "python.exe",
  );
  if (fs.existsSync(venvPython)) {
    log("info", `使用 venv Python: ${venvPython}`);
    return { cmd: venvPython, args: [], useUv: false };
  }

  // 策略3: 系统 Python
  for (const name of ["python3", "python"]) {
    try {
      const result = await runCommand(name, ["--version"], 5000);
      if (result.stdout.includes("Python 3")) {
        log("info", `找到 Python: ${name}`);
        return { cmd: name, args: [], useUv: false };
      }
    } catch {
      /* try next */
    }
  }

  return null;
}

async function startPythonServer(): Promise<boolean> {
  if (pythonStatus === "running" || pythonStatus === "starting") {
    log("warn", "Python 服务已在运行，忽略启动请求");
    return true;
  }

  pythonStatus = "starting";
  pythonLogs = [];
  log("info", "========== 启动即梦自动化服务 ==========");
  mainWindow?.webContents.send("jimeng:status", {
    status: "starting",
    logs: pythonLogs,
  });

  // 检查源码目录
  if (!fs.existsSync(getJimengSourceDir())) {
    log("error", `auto_jimeng 源码目录不存在: ${getJimengSourceDir()}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: `auto_jimeng 源码未找到，请联系开发者。\n期望路径: ${getJimengSourceDir()}`,
    });
    return false;
  }

  const pythonInfo = await findPython();
  if (!pythonInfo) {
    log("error", "未找到 Python 解释器或 uv，请安装 Python 3.10+ 或 uv");
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message:
        "未找到 Python 或 uv，请安装 Python 3.10+：\nhttps://www.python.org/downloads/",
    });
    return false;
  }

  const { cmd: pythonCmd, args: pythonBaseArgs, useUv } = pythonInfo;
  log("info", `启动方式: ${useUv ? "uv run python" : "venv python"}`);

  // 启动 FastAPI 服务
  const apiScript = path.join(getJimengSourceDir(), "start_api.py");
  if (!fs.existsSync(apiScript)) {
    log("error", `API 入口脚本不存在: ${apiScript}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: "API 入口脚本缺失",
    });
    return false;
  }

  const browserData = getBrowserDataPath();
  fs.mkdirSync(browserData, { recursive: true });

  const env = {
    ...process.env,
    JIMENG_BROWSER_DATA: browserData,
    JIMENG_SKIP_LICENSE: "1",
  };

  // 构建启动命令
  const spawnArgs = useUv
    ? ["run", "python", apiScript, "--port", String(API_PORT)]
    : [...pythonBaseArgs, apiScript, "--port", String(API_PORT)];

  log("info", `启动命令: ${pythonCmd} ${spawnArgs.join(" ")}`);
  log("info", `浏览器数据目录: ${browserData}`);

  pythonProcess = spawn(pythonCmd, spawnArgs, {
    cwd: getJimengSourceDir(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  pythonProcess.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const l of lines) {
      log("python", l);
      mainWindow?.webContents.send("jimeng:status", {
        status: pythonStatus,
        logs: [...pythonLogs],
      });
    }
  });

  pythonProcess.stderr?.on("data", (chunk: Buffer) => {
    const l = chunk.toString().trim();
    if (l) log("error", `[Python stderr] ${l}`);
  });

  pythonProcess.on("error", (err) => {
    log("error", `Python 子进程启动失败: ${err.message}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: err.message,
    });
  });

  pythonProcess.on("exit", (code) => {
    log("info", `Python 服务已退出，code=${code}`);
    pythonStatus = "stopped";
    pythonProcess = null;
    mainWindow?.webContents.send("jimeng:status", { status: "stopped" });
  });

  // 等待服务就绪（ping 健康检查）
  log("info", "等待服务就绪...");
  const ready = await waitForServer(API_BASE, 60000);
  if (ready) {
    pythonStatus = "running";
    log("info", "✅ Python API 服务已就绪");
    mainWindow?.webContents.send("jimeng:status", {
      status: "running",
      apiBase: API_BASE,
    });
    return true;
  } else {
    log("error", "Python API 服务启动超时");
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: "服务启动超时，请查看日志",
    });
    return false;
  }
}

function stopPythonServer() {
  if (!pythonProcess) return;
  log("info", "停止 Python 服务...");
  pythonProcess.kill("SIGTERM");
  // 给一点时间优雅退出
  setTimeout(() => {
    if (pythonProcess) {
      pythonProcess.kill("SIGKILL");
      pythonProcess = null;
    }
    pythonStatus = "stopped";
    pythonLogs.push(`[${new Date().toISOString()}] 服务已手动停止`);
    mainWindow?.webContents.send("jimeng:status", { status: "stopped" });
  }, 2000);
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) return true;
    } catch {
      /* 还没启动 */
    }
    await sleep(2000);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function runCommand(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("超时"));
    }, timeoutMs);
    let stdout = "",
      stderr = "";
    proc.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    proc.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `exit ${code}`));
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

// =========================== IPC 处理 ===========================

function setupIPC() {
  ipcMain.handle("jimeng:start", async () => {
    log("info", "收到启动请求");
    const ok = await startPythonServer();
    return {
      ok,
      status: pythonStatus,
      apiBase: ok ? API_BASE : undefined,
      logs: pythonLogs,
    };
  });

  ipcMain.handle("jimeng:stop", () => {
    stopPythonServer();
    return { ok: true };
  });

  ipcMain.handle("jimeng:status", () => ({
    status: pythonStatus,
    apiBase: pythonStatus === "running" ? API_BASE : undefined,
    logs: pythonLogs,
  }));

  ipcMain.handle("jimeng:getApiBase", () => {
    if (pythonStatus !== "running") return null;
    return API_BASE;
  });

  // 🛡️ 读取崩溃日志
  ipcMain.handle("crash:getLogs", () => {
    const crashLogPath = path.join(getUserDataPath(), "crash-log.json");
    try {
      if (fs.existsSync(crashLogPath)) {
        const logs = JSON.parse(fs.readFileSync(crashLogPath, "utf8"));
        return { ok: true, logs };
      }
      return { ok: true, logs: [] };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("browserView:create", async (_event, params?: {
    url?: string;
    bounds?: { x: number; y: number; width: number; height: number };
  }) => {
    if (params?.bounds) {
      embeddedBrowserBounds = params.bounds;
    }
    const view = await ensureEmbeddedBrowserView(params?.url);
    return {
      ok: true,
      id: "embedded-browser-view",
      state: {
        ...embeddedBrowserState,
        url: view.webContents.getURL() || embeddedBrowserState.url,
      },
    };
  });

  ipcMain.handle("browserView:navigate", async (_event, { url }: { url: string }) => {
    const view = await ensureEmbeddedBrowserView();
    await loadURLWithAbortTolerance(view, url);
    embeddedBrowserState.url = view.webContents.getURL();
    emitEmbeddedBrowserState();
    return { ok: true, state: { ...embeddedBrowserState } };
  });

  ipcMain.handle("browserView:setBounds", (_event, bounds) => {
    embeddedBrowserBounds = bounds;
    log("info", `收到 BrowserView bounds: ${JSON.stringify(bounds)}`);
    if (embeddedBrowserView) {
      embeddedBrowserView.setBounds(bounds);
      embeddedBrowserView.setAutoResize({ width: true, height: true });
    }
    return { ok: true };
  });

  ipcMain.handle("browserView:show", async () => {
    await ensureEmbeddedBrowserView();
    if (embeddedBrowserView && embeddedBrowserBounds.width > 0 && embeddedBrowserBounds.height > 0) {
      embeddedBrowserView.setBounds(embeddedBrowserBounds);
    }
    embeddedBrowserState.visible = true;
    emitEmbeddedBrowserState();
    return { ok: true, state: { ...embeddedBrowserState } };
  });

  ipcMain.handle("browserView:hide", () => {
    hideEmbeddedBrowserView();
    return { ok: true, state: { ...embeddedBrowserState } };
  });

  ipcMain.handle("browserView:getState", () => ({ ...embeddedBrowserState }));

  ipcMain.handle("browserView:execute", async (_event, { script, data }: { script: string; data?: unknown; args?: unknown[] }) => {
    if (!embeddedBrowserView) {
      return { ok: false, error: "浏览器视图尚未创建" };
    }
    try {
      // If data is provided, inject it as window.__executeData__ before running the script
      if (data !== undefined) {
        const dataScript = `window.__executeData__ = ${JSON.stringify(data)};`;
        await embeddedBrowserView.webContents.executeJavaScript(dataScript, true);
      }
      const result = await embeddedBrowserView.webContents.executeJavaScript(script, true);
      return { ok: true, result };
    } catch (error) {
      log("error", `browserView:execute 失败: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("browserView:capture", async () => {
    if (!embeddedBrowserView) {
      return { ok: false, error: "浏览器视图尚未创建" };
    }
    try {
      const image = await embeddedBrowserView.webContents.capturePage();
      const png = image.toPNG();
      return { ok: true, base64: png.toString("base64"), mimeType: "image/png" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    "browserView:setFileInputFiles",
    async (
      _event,
      {
        selector = "input[type=\"file\"]",
        index = 0,
        files,
      }: {
        selector?: string;
        index?: number;
        files: Array<{ fileName: string; dataUrl: string }>;
      },
    ) => {
      if (!embeddedBrowserView) {
        return { ok: false, error: "浏览器视图尚未创建" };
      }
      if (!Array.isArray(files)) {
        return { ok: false, error: "没有可上传的文件" };
      }

      const tempDir = path.join(
        app.getPath("temp"),
        "next-chapter-browserview-files",
      );
      fs.mkdirSync(tempDir, { recursive: true });

      const writtenFiles = files.map((file, fileIndex) => {
        const match = String(file.dataUrl || "").match(
          /^data:([^;]+);base64,(.+)$/i,
        );
        if (!match) {
          throw new Error(`无效 dataUrl: ${file.fileName || fileIndex}`);
        }
        const mime = match[1];
        const ext =
          path.extname(file.fileName || "") ||
          (mime.includes("png")
            ? ".png"
            : mime.includes("webp")
              ? ".webp"
              : ".jpg");
        const safeBase = path
          .basename(file.fileName || `upload-${fileIndex}${ext}`, ext)
          .replace(/[^\w.-]+/g, "_");
        const targetPath = path.join(
          tempDir,
          `${Date.now()}-${fileIndex}-${safeBase}${ext}`,
        );
        fs.writeFileSync(targetPath, Buffer.from(match[2], "base64"));
        return targetPath;
      });

      const debuggerClient = embeddedBrowserView.webContents.debugger;
      const attachedByHandler = !debuggerClient.isAttached();

      try {
        if (attachedByHandler) debuggerClient.attach("1.3");
        const { root } = await debuggerClient.sendCommand("DOM.getDocument", {
          depth: -1,
          pierce: true,
        });
        const { nodeIds } = await debuggerClient.sendCommand(
          "DOM.querySelectorAll",
          {
            nodeId: root.nodeId,
            selector,
          },
        );
        if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
          throw new Error(`未找到文件输入框: ${selector}`);
        }
        const safeIndex = Math.max(0, Math.min(index, nodeIds.length - 1));
        const described = await debuggerClient.sendCommand("DOM.describeNode", {
          nodeId: nodeIds[safeIndex],
        });
        const backendNodeId = described?.node?.backendNodeId;
        await debuggerClient.sendCommand("DOM.setFileInputFiles", {
          ...(backendNodeId ? { backendNodeId } : { nodeId: nodeIds[safeIndex] }),
          files: writtenFiles,
        });
        return {
          ok: true,
          count: writtenFiles.length,
          selector,
          index: safeIndex,
        };
      } catch (error) {
        log(
          "error",
          `browserView:setFileInputFiles 失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        if (attachedByHandler && debuggerClient.isAttached()) {
          try {
            debuggerClient.detach();
          } catch {
            /* ignore */
          }
        }
      }
    },
  );

  ipcMain.handle(
    "browserView:sendInputEvents",
    async (
      _event,
      {
        events,
      }: {
        events: Array<{
          type: string;
          keyCode?: string;
          modifiers?: string[];
          x?: number;
          y?: number;
          button?: string;
          clickCount?: number;
        }>;
      },
    ) => {
      if (!embeddedBrowserView) {
        return { ok: false, error: "浏览器视图尚未创建" };
      }
      if (!Array.isArray(events) || events.length === 0) {
        return { ok: false, error: "没有可发送的输入事件" };
      }
      try {
        embeddedBrowserView.webContents.focus();
        for (const event of events) {
          embeddedBrowserView.webContents.sendInputEvent({
            type: event.type as any,
            keyCode: event.keyCode as any,
            modifiers: event.modifiers as any,
            x: event.x,
            y: event.y,
            button: event.button as any,
            clickCount: event.clickCount,
          });
        }
        return { ok: true };
      } catch (error) {
        log(
          "error",
          `browserView:sendInputEvents 失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    "browserView:download",
    async (
      _event,
      {
        savePath,
        script,
        timeoutMs = 20000,
      }: {
        savePath: string;
        script?: string;
        timeoutMs?: number;
      },
    ) => {
      if (!embeddedBrowserView) {
        return { ok: false, error: "浏览器视图尚未创建" };
      }
      if (!savePath) {
        return { ok: false, error: "缺少保存路径" };
      }

      const targetDir = path.dirname(savePath);
      fs.mkdirSync(targetDir, { recursive: true });

      return await new Promise((resolve) => {
        const session = embeddedBrowserView!.webContents.session;
        let finished = false;

        const cleanup = () => {
          session.removeListener("will-download", onWillDownload);
          clearTimeout(timer);
        };

        const finish = (payload: Record<string, unknown>) => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve(payload);
        };

        const onWillDownload = (
          _downloadEvent: Electron.Event,
          item: Electron.DownloadItem,
          webContents: Electron.WebContents,
        ) => {
          if (webContents !== embeddedBrowserView!.webContents) return;

          item.setSavePath(savePath);
          item.once("done", (_doneEvent, state) => {
            if (state === "completed") {
              finish({
                ok: true,
                savePath,
                url: item.getURL(),
              });
            } else {
              finish({
                ok: false,
                error: `下载未完成: ${state}`,
                savePath,
              });
            }
          });
        };

        const timer = setTimeout(() => {
          finish({ ok: false, error: "等待下载超时", savePath });
        }, timeoutMs);

        session.on("will-download", onWillDownload);

        if (!script) {
          finish({ ok: false, error: "缺少下载触发脚本", savePath });
          return;
        }

        embeddedBrowserView!.webContents
          .executeJavaScript(script, true)
          .catch((error) => {
            finish({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
              savePath,
            });
          });
      });
    },
  );

  ipcMain.handle("browserView:close", () => {
    closeEmbeddedBrowserView();
    return { ok: true };
  });

  ipcMain.handle("browserView:setIgnoreMouseEvents", (_event, ignore: boolean) => {
    if (embeddedBrowserView) {
      embeddedBrowserView.webContents.executeJavaScript(`
        (() => {
          const OVERLAY_ID = '__jimeng_browser_lock_overlay__';
          const existing = document.getElementById(OVERLAY_ID);
          if (${ignore ? "true" : "false"}) {
            if (!existing) {
              const overlay = document.createElement('div');
              overlay.id = OVERLAY_ID;
              overlay.style.position = 'fixed';
              overlay.style.inset = '0';
              overlay.style.zIndex = '2147483647';
              overlay.style.background = 'transparent';
              overlay.style.cursor = 'not-allowed';
              overlay.addEventListener('wheel', (event) => {
                event.preventDefault();
                event.stopPropagation();
              }, { passive: false });
              overlay.addEventListener('mousedown', (event) => {
                event.preventDefault();
                event.stopPropagation();
              }, true);
              overlay.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
              }, true);
              document.body.appendChild(overlay);
            }
          } else if (existing) {
            existing.remove();
          }
        })();
      `, true).catch(() => {});
    }
    return { ok: true };
  });

  ipcMain.handle(
    "reversePlaywright:prepareSegment",
    async (
      _event,
      params: {
        url: string;
        model: string;
        duration: string;
        prompt: string;
        refs: Array<{ fileName: string; url?: string; dataUrl?: string }>;
        headless?: boolean;
      },
    ) => {
      return reversePlaywrightRunner.prepareSegment(params);
    },
  );

  ipcMain.handle(
    "reversePlaywright:runSegments",
    async (
      _event,
      params: {
        url: string;
        model: string;
        duration: string;
        segments: Array<{
          segmentKey: string;
          prompt: string;
          refs: Array<{ fileName: string; url?: string; dataUrl?: string }>;
        }>;
        headless?: boolean;
      },
    ) => {
      return reversePlaywrightRunner.runSegments(params);
    },
  );

  ipcMain.handle("reversePlaywright:capture", async () => {
    return reversePlaywrightRunner.capture();
  });

  ipcMain.handle("reversePlaywright:close", async () => {
    await reversePlaywrightRunner.close();
    return { ok: true };
  });

  // 打开即梦登录页面（用于首次授权）
  ipcMain.handle("jimeng:openSetup", async () => {
    await ensureEmbeddedBrowserView("https://jimeng.jianying.com/ai-tool/home");
    return { ok: true };
  });

  ipcMain.handle(
    "jimeng:writeFile",
    async (
      _event,
      { filePath, content }: { filePath: string; content: string },
    ) => {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, Buffer.from(content, "base64"));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // 打开浏览器数据目录
  ipcMain.handle("jimeng:openBrowserData", () => {
    shell.openPath(getBrowserDataPath());
  });

  // 写入 xlsx 文件并返回即梦可用的 workDir/episodeDir/xlsxFile
  ipcMain.handle(
    "jimeng:prepareXlsx",
    async (
      _event,
      {
        episodeLabel,
        base64Content,
        xlsxName,
        storageRoot,
      }: {
        episodeLabel: string;
        base64Content: string;
        xlsxName: string;
        storageRoot?: string;
      },
    ) => {
      try {
        const baseRoot =
          typeof storageRoot === "string" && storageRoot.trim().length > 0
            ? path.normalize(storageRoot.trim())
            : getDefaultFilesDir();
        const tempDir = path.join(baseRoot, "jimeng_temp");
        const episodeDir = path.join(tempDir, "test", String(episodeLabel));
        if (!fs.existsSync(episodeDir))
          fs.mkdirSync(episodeDir, { recursive: true });
        const filePath = path.join(episodeDir, xlsxName);
        const buffer = Buffer.from(base64Content, "base64");
        fs.writeFileSync(filePath, buffer);
        return {
          ok: true,
          workDir: tempDir,
          episodeDir: String(episodeLabel),
          xlsxFile: xlsxName,
        };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );

  // ===== 存储路径 ============================

  ipcMain.handle("storage:getDefaultPath", () => {
    const filesDir = getDefaultFilesDir();
    try {
      fs.mkdirSync(filesDir, { recursive: true });
    } catch {
      /* ignore */
    }
    const userData = app.getPath("userData");
    return {
      files: filesDir,
      db: path.join(userData, "db"),
    };
  });

  ipcMain.handle("storage:selectFolder", async () => {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory"],
      title: "选择存储文件夹",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("storage:openFolder", (_event, folderPath: string) => {
    shell.openPath(folderPath);
  });

  ipcMain.handle(
    "storage:writeText",
    async (
      _event,
      { filePath, content }: { filePath: string; content: string },
    ) => {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, "utf8");
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    "storage:readText",
    async (_event, { filePath }: { filePath: string }) => {
      try {
        if (!fs.existsSync(filePath)) {
          return { ok: true, exists: false, content: "" };
        }
        return {
          ok: true,
          exists: true,
          content: fs.readFileSync(filePath, "utf8"),
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    "storage:readBase64",
    async (_event, { filePath }: { filePath: string }) => {
      try {
        if (!fs.existsSync(filePath)) {
          return { ok: true, exists: false, base64: "" };
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeType =
          ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : ext === ".mp4"
                  ? "video/mp4"
                  : "image/jpeg";

        return {
          ok: true,
          exists: true,
          base64: fs.readFileSync(filePath).toString("base64"),
          mimeType,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}

// =========================== 窗口 & 托盘 ===========================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    title: "Infinio",
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    // 自动启动 Python 服务（静默后台，不阻塞 UI）
    startPythonServer().catch((e) => log("error", `自动启动失败: ${e}`));
  });

  // 🛡️ 监听渲染进程崩溃
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    log("error", `========== 渲染进程崩溃 ==========`);
    log("error", `原因: ${details.reason}`);
    log("error", `退出码: ${details.exitCode}`);
    console.error("渲染进程崩溃详情:", details);

    // 保存崩溃信息到文件
    const crashInfo = {
      timestamp: new Date().toISOString(),
      reason: details.reason,
      exitCode: details.exitCode,
    };

    const crashLogPath = path.join(getUserDataPath(), "crash-log.json");
    try {
      let logs = [];
      if (fs.existsSync(crashLogPath)) {
        logs = JSON.parse(fs.readFileSync(crashLogPath, "utf8"));
      }
      logs.unshift(crashInfo);
      if (logs.length > 20) logs.length = 20;
      fs.writeFileSync(crashLogPath, JSON.stringify(logs, null, 2));
      log("info", `崩溃日志已保存到: ${crashLogPath}`);
    } catch (err) {
      log("error", `无法保存崩溃日志: ${err}`);
    }
  });

  // 🛡️ 监听未响应
  mainWindow.webContents.on("unresponsive", () => {
    log("warn", "渲染进程未响应");
  });

  // 🛡️ 监听恢复响应
  mainWindow.webContents.on("responsive", () => {
    log("info", "渲染进程已恢复响应");
  });

  mainWindow.on("resize", () => {
    if (embeddedBrowserView && embeddedBrowserState.visible && embeddedBrowserBounds.width > 0 && embeddedBrowserBounds.height > 0) {
      embeddedBrowserView.setBounds(embeddedBrowserBounds);
    }
  });

  mainWindow.on("close", (e) => {
    // 关闭时先停止 Python 服务
    if (pythonProcess) {
      e.preventDefault();
      stopPythonServer();
      setTimeout(() => {
        pythonProcess = null;
        mainWindow?.destroy();
        app.quit();
      }, 3000);
    }
  });

  // 加载 Vite dev server 或打包后的 index.html
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function createTray() {
  // 加载图标
  const icon = nativeImage.createFromPath(path.join(__dirname, "../build/icon.ico"));
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: "显示窗口", click: () => mainWindow?.show() },
    {
      label: `即梦服务: ${pythonStatus}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "打开浏览器数据",
      click: () => shell.openPath(getBrowserDataPath()),
    },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]);

  tray.setToolTip("Infinio - 即梦AI自动化");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}

// =========================== App 入口 ===========================

app.whenReady().then(() => {
  log("info", "========== Electron 主进程启动 ==========");
  setupIPC();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopPythonServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopPythonServer();
});
