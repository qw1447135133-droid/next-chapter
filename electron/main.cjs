const path = require("node:path");
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
function getJimengSourceDir() {
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(__dirname, "..", "auto_jimeng");
  }
  return path.join(process.resourcesPath, "auto_jimeng");
}
const JIMENG_SOURCE_DIR = getJimengSourceDir();
const API_PORT = 8e3;
const API_BASE = `http://localhost:${API_PORT}`;
let mainWindow = null;
let tray = null;
let pythonProcess = null;
let pythonStatus = "stopped";
let pythonLogs = [];
function getUserDataPath() {
  return app.getPath("userData");
}
function getBrowserDataPath() {
  return path.join(getUserDataPath(), "jimeng_browser_data");
}
function log(level, msg) {
  const ts = (/* @__PURE__ */ new Date()).toISOString().slice(11, 23);
  const line = `[${ts}] [${level}] ${msg}`;
  pythonLogs.push(line);
  if (pythonLogs.length > 500) pythonLogs.shift();
  console.log(line);
}
async function findPython() {
  for (const name of ["uv"]) {
    try {
      const result = await runCommand(name, ["--version"], 5e3);
      if (result.stdout.includes("uv ")) {
        log("info", `\u627E\u5230 uv \u5305\u7BA1\u7406\u5668\uFF0C\u5C06\u4F7F\u7528 "uv run python"`);
        return { cmd: name, args: ["run", "python"], useUv: true };
      }
    } catch {
    }
  }
  const venvPython = path.join(JIMENG_SOURCE_DIR, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(venvPython)) {
    log("info", `\u4F7F\u7528 venv Python: ${venvPython}`);
    return { cmd: venvPython, args: [], useUv: false };
  }
  for (const name of ["python3", "python"]) {
    try {
      const result = await runCommand(name, ["--version"], 5e3);
      if (result.stdout.includes("Python 3")) {
        log("info", `\u627E\u5230 Python: ${name}`);
        return { cmd: name, args: [], useUv: false };
      }
    } catch {
    }
  }
  return null;
}
async function startPythonServer() {
  if (pythonStatus === "running" || pythonStatus === "starting") {
    log("warn", "Python \u670D\u52A1\u5DF2\u5728\u8FD0\u884C\uFF0C\u5FFD\u7565\u542F\u52A8\u8BF7\u6C42");
    return true;
  }
  pythonStatus = "starting";
  pythonLogs = [];
  log("info", "========== \u542F\u52A8\u5373\u68A6\u81EA\u52A8\u5316\u670D\u52A1 ==========");
  mainWindow?.webContents.send("jimeng:status", { status: "starting", logs: pythonLogs });
  if (!fs.existsSync(JIMENG_SOURCE_DIR)) {
    log("error", `auto_jimeng \u6E90\u7801\u76EE\u5F55\u4E0D\u5B58\u5728: ${JIMENG_SOURCE_DIR}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: `auto_jimeng \u6E90\u7801\u672A\u627E\u5230\uFF0C\u8BF7\u8054\u7CFB\u5F00\u53D1\u8005\u3002
\u671F\u671B\u8DEF\u5F84: ${JIMENG_SOURCE_DIR}`
    });
    return false;
  }
  const pythonInfo = await findPython();
  if (!pythonInfo) {
    log("error", "\u672A\u627E\u5230 Python \u89E3\u91CA\u5668\u6216 uv\uFF0C\u8BF7\u5B89\u88C5 Python 3.10+ \u6216 uv");
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: "\u672A\u627E\u5230 Python \u6216 uv\uFF0C\u8BF7\u5B89\u88C5 Python 3.10+\uFF1A\nhttps://www.python.org/downloads/"
    });
    return false;
  }
  const { cmd: pythonCmd, args: pythonBaseArgs, useUv } = pythonInfo;
  log("info", `\u542F\u52A8\u65B9\u5F0F: ${useUv ? "uv run python" : "venv python"}`);
  const apiScript = path.join(JIMENG_SOURCE_DIR, "start_api.py");
  if (!fs.existsSync(apiScript)) {
    log("error", `API \u5165\u53E3\u811A\u672C\u4E0D\u5B58\u5728: ${apiScript}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", { status: "error", message: "API \u5165\u53E3\u811A\u672C\u7F3A\u5931" });
    return false;
  }
  const browserData = getBrowserDataPath();
  fs.mkdirSync(browserData, { recursive: true });
  const env = {
    ...process.env,
    JIMENG_BROWSER_DATA: browserData,
    JIMENG_SKIP_LICENSE: "1"
  };
  const spawnArgs = useUv ? ["run", "python", apiScript, "--port", String(API_PORT)] : [...pythonBaseArgs, apiScript, "--port", String(API_PORT)];
  log("info", `\u542F\u52A8\u547D\u4EE4: ${pythonCmd} ${spawnArgs.join(" ")}`);
  log("info", `\u6D4F\u89C8\u5668\u6570\u636E\u76EE\u5F55: ${browserData}`);
  pythonProcess = spawn(pythonCmd, spawnArgs, {
    cwd: JIMENG_SOURCE_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false
  });
  pythonProcess.stdout?.on("data", (chunk) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const l of lines) {
      log("python", l);
      mainWindow?.webContents.send("jimeng:status", { status: pythonStatus, logs: [...pythonLogs] });
    }
  });
  pythonProcess.stderr?.on("data", (chunk) => {
    const l = chunk.toString().trim();
    if (l) log("error", `[Python stderr] ${l}`);
  });
  pythonProcess.on("error", (err) => {
    log("error", `Python \u5B50\u8FDB\u7A0B\u542F\u52A8\u5931\u8D25: ${err.message}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", { status: "error", message: err.message });
  });
  pythonProcess.on("exit", (code) => {
    log("info", `Python \u670D\u52A1\u5DF2\u9000\u51FA\uFF0Ccode=${code}`);
    pythonStatus = "stopped";
    pythonProcess = null;
    mainWindow?.webContents.send("jimeng:status", { status: "stopped" });
  });
  log("info", "\u7B49\u5F85\u670D\u52A1\u5C31\u7EEA...");
  const ready = await waitForServer(API_BASE, 6e4);
  if (ready) {
    pythonStatus = "running";
    log("info", "\u2705 Python API \u670D\u52A1\u5DF2\u5C31\u7EEA");
    mainWindow?.webContents.send("jimeng:status", { status: "running", apiBase: API_BASE });
    return true;
  } else {
    log("error", "Python API \u670D\u52A1\u542F\u52A8\u8D85\u65F6");
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", { status: "error", message: "\u670D\u52A1\u542F\u52A8\u8D85\u65F6\uFF0C\u8BF7\u67E5\u770B\u65E5\u5FD7" });
    return false;
  }
}
function stopPythonServer() {
  if (!pythonProcess) return;
  log("info", "\u505C\u6B62 Python \u670D\u52A1...");
  pythonProcess.kill("SIGTERM");
  setTimeout(() => {
    if (pythonProcess) {
      pythonProcess.kill("SIGKILL");
      pythonProcess = null;
    }
    pythonStatus = "stopped";
    pythonLogs.push(`[${(/* @__PURE__ */ new Date()).toISOString()}] \u670D\u52A1\u5DF2\u624B\u52A8\u505C\u6B62`);
    mainWindow?.webContents.send("jimeng:status", { status: "stopped" });
  }, 2e3);
}
async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3e3) });
      if (resp.ok) return true;
    } catch {
    }
    await sleep(2e3);
  }
  return false;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function runCommand(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("\u8D85\u65F6"));
    }, timeoutMs);
    let stdout = "", stderr = "";
    proc.stdout?.on("data", (c) => {
      stdout += c.toString();
    });
    proc.stderr?.on("data", (c) => {
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
function setupIPC() {
  ipcMain.handle("jimeng:start", async () => {
    log("info", "\u6536\u5230\u542F\u52A8\u8BF7\u6C42");
    const ok = await startPythonServer();
    return { ok, status: pythonStatus, apiBase: ok ? API_BASE : void 0, logs: pythonLogs };
  });
  ipcMain.handle("jimeng:stop", () => {
    stopPythonServer();
    return { ok: true };
  });
  ipcMain.handle("jimeng:status", () => ({
    status: pythonStatus,
    apiBase: pythonStatus === "running" ? API_BASE : void 0,
    logs: pythonLogs
  }));
  ipcMain.handle("jimeng:getApiBase", () => {
    if (pythonStatus !== "running") return null;
    return API_BASE;
  });
  ipcMain.handle("jimeng:openSetup", async () => {
    if (pythonStatus !== "running") {
      await startPythonServer();
    }
    shell.openExternal("https://jimeng.jianying.com/ai-tool/home");
    return { ok: true };
  });
  ipcMain.handle("jimeng:openBrowserData", () => {
    shell.openPath(getBrowserDataPath());
  });
  ipcMain.handle("jimeng:writeFile", async (_event, { filePath, content }) => {
    try {
      const buffer = Buffer.from(content, "base64");
      const dir2 = path.dirname(filePath);
      if (!fs.existsSync(dir2)) fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(filePath, buffer);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  ipcMain.handle("jimeng:prepareXlsx", async (_event, { episodeLabel, base64Content, xlsxName }) => {
    try {
      const tempDir = path.join(app.getPath("userData"), "jimeng_temp");
      const episodeDir2 = path.join(tempDir, "test", String(episodeLabel));
      if (!fs.existsSync(episodeDir2)) fs.mkdirSync(episodeDir2, { recursive: true });
      const filePath2 = path.join(episodeDir2, xlsxName);
      const buffer = Buffer.from(base64Content, "base64");
      fs.writeFileSync(filePath2, buffer);
      return { ok: true, workDir: tempDir, episodeDir: String(episodeLabel), xlsxFile: xlsxName };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    title: "Infinio"
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    startPythonServer().catch((e) => log("error", `\u81EA\u52A8\u542F\u52A8\u5931\u8D25: ${e}`));
  });
  mainWindow.on("close", (e) => {
    if (pythonProcess) {
      e.preventDefault();
      stopPythonServer();
      setTimeout(() => {
        pythonProcess = null;
        mainWindow?.destroy();
        app.quit();
      }, 3e3);
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}
function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: "\u663E\u793A\u7A97\u53E3", click: () => mainWindow?.show() },
    {
      label: `\u5373\u68A6\u670D\u52A1: ${pythonStatus}`,
      enabled: false
    },
    { type: "separator" },
    {
      label: "\u6253\u5F00\u6D4F\u89C8\u5668\u6570\u636E",
      click: () => shell.openPath(getBrowserDataPath())
    },
    { type: "separator" },
    { label: "\u9000\u51FA", click: () => app.quit() }
  ]);
  tray.setToolTip("Infinio - \u5373\u68A6AI\u81EA\u52A8\u5316");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}
app.whenReady().then(() => {
  log("info", "========== Electron \u4E3B\u8FDB\u7A0B\u542F\u52A8 ==========");
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
