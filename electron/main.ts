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
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require("electron");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require("node:child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");

// CJS 模式下 __dirname 由 Node.js 自动提供
// 注意：main.ts 被 esbuild 编译为 CJS，__dirname 在运行时可用
// __dirname 指向 electron/ 目录

// =========================== 配置 ===========================

/** 获取资源目录：开发时指向 electron/../auto_jimeng，打包后指向 resources/auto_jimeng */
function getJimengSourceDir(): string {
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(__dirname, "..", "auto_jimeng");
  }
  return path.join(process.resourcesPath, "auto_jimeng");
}

/** 打包后 auto_jimeng 源码所在目录 */
const JIMENG_SOURCE_DIR = getJimengSourceDir();
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

function getUserDataPath(): string {
  return app.getPath("userData");
}

function getBrowserDataPath(): string {
  // 即梦浏览器数据放在用户目录，避免打包 exe 内部
  return path.join(getUserDataPath(), "jimeng_browser_data");
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
async function findPython(): Promise<{ cmd: string; args: string[]; useUv: boolean } | null> {
  // 策略1: uv（auto_jimeng 用 uv 管理依赖）
  for (const name of ["uv"]) {
    try {
      const result = await runCommand(name, ["--version"], 5000);
      if (result.stdout.includes("uv ")) {
        log("info", `找到 uv 包管理器，将使用 "uv run python"`);
        return { cmd: name, args: ["run", "python"], useUv: true };
      }
    } catch { /* try next */ }
  }

  // 策略2: 直接用 venv 中的 Python（已包含所有依赖）
  const venvPython = path.join(JIMENG_SOURCE_DIR, ".venv", "Scripts", "python.exe");
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
    } catch { /* try next */ }
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
  mainWindow?.webContents.send("jimeng:status", { status: "starting", logs: pythonLogs });

  // 检查源码目录
  if (!fs.existsSync(JIMENG_SOURCE_DIR)) {
    log("error", `auto_jimeng 源码目录不存在: ${JIMENG_SOURCE_DIR}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: `auto_jimeng 源码未找到，请联系开发者。\n期望路径: ${JIMENG_SOURCE_DIR}`,
    });
    return false;
  }

  const pythonInfo = await findPython();
  if (!pythonInfo) {
    log("error", "未找到 Python 解释器或 uv，请安装 Python 3.10+ 或 uv");
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: "未找到 Python 或 uv，请安装 Python 3.10+：\nhttps://www.python.org/downloads/",
    });
    return false;
  }

  const { cmd: pythonCmd, args: pythonBaseArgs, useUv } = pythonInfo;
  log("info", `启动方式: ${useUv ? "uv run python" : "venv python"}`);

  // 启动 FastAPI 服务
  const apiScript = path.join(JIMENG_SOURCE_DIR, "start_api.py");
  if (!fs.existsSync(apiScript)) {
    log("error", `API 入口脚本不存在: ${apiScript}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", { status: "error", message: "API 入口脚本缺失" });
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
    cwd: JIMENG_SOURCE_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  pythonProcess.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const l of lines) {
      log("python", l);
      mainWindow?.webContents.send("jimeng:status", { status: pythonStatus, logs: [...pythonLogs] });
    }
  });

  pythonProcess.stderr?.on("data", (chunk: Buffer) => {
    const l = chunk.toString().trim();
    if (l) log("error", `[Python stderr] ${l}`);
  });

  pythonProcess.on("error", (err) => {
    log("error", `Python 子进程启动失败: ${err.message}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", { status: "error", message: err.message });
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
    mainWindow?.webContents.send("jimeng:status", { status: "running", apiBase: API_BASE });
    return true;
  } else {
    log("error", "Python API 服务启动超时");
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", { status: "error", message: "服务启动超时，请查看日志" });
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
      const resp = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) return true;
    } catch { /* 还没启动 */ }
    await sleep(2000);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function runCommand(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { proc.kill(); reject(new Error("超时")); }, timeoutMs);
    let stdout = "", stderr = "";
    proc.stdout?.on("data", (c: Buffer) => { stdout += c.toString(); });
    proc.stderr?.on("data", (c: Buffer) => { stderr += c.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `exit ${code}`));
    });
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// =========================== IPC 处理 ===========================

function setupIPC() {
  ipcMain.handle("jimeng:start", async () => {
    log("info", "收到启动请求");
    const ok = await startPythonServer();
    return { ok, status: pythonStatus, apiBase: ok ? API_BASE : undefined, logs: pythonLogs };
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

  // 打开即梦登录页面（用于首次授权）
  ipcMain.handle("jimeng:openSetup", async () => {
    if (pythonStatus !== "running") {
      await startPythonServer();
    }
    shell.openExternal("https://jimeng.jianying.com/ai-tool/home");
    return { ok: true };
  });

  // 打开浏览器数据目录
  ipcMain.handle("jimeng:openBrowserData", () => {
    shell.openPath(getBrowserDataPath());
  });

  // 写入 xlsx 文件并返回即梦可用的 workDir/episodeDir/xlsxFile
  ipcMain.handle("jimeng:prepareXlsx", async (_event, {
    episodeLabel,
    base64Content,
    xlsxName,
  }: { episodeLabel: string; base64Content: string; xlsxName: string }) => {
    try {
      const tempDir = path.join(app.getPath("userData"), "jimeng_temp");
      const episodeDir = path.join(tempDir, "test", String(episodeLabel));
      if (!fs.existsSync(episodeDir)) fs.mkdirSync(episodeDir, { recursive: true });
      const filePath = path.join(episodeDir, xlsxName);
      const buffer = Buffer.from(base64Content, "base64");
      fs.writeFileSync(filePath, buffer);
      return { ok: true, workDir: tempDir, episodeDir: String(episodeLabel), xlsxFile: xlsxName };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ===== 存储路径 ============================

  ipcMain.handle("storage:getDefaultPath", () => {
    const userData = app.getPath("userData");
    return {
      files: path.join(userData, "files"),
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
}

// =========================== 窗口 & 托盘 ===========================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    title: "Infinio",
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    // 自动启动 Python 服务（静默后台，不阻塞 UI）
    startPythonServer().catch((e) => log("error", `自动启动失败: ${e}`));
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
  // 创建简单的托盘图标（空白 16x16）
  const icon = nativeImage.createEmpty();
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
