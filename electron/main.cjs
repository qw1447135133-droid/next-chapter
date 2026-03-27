// electron/main.ts
var path = require("node:path");
var {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell
} = require("electron");
var { spawn } = require("node:child_process");
var fs = require("node:fs");
function getJimengSourceDir() {
  try {
    const isDev = !app.isPackaged;
    if (isDev) {
      return path.join(__dirname, "..", "auto_jimeng");
    }
    return path.join(process.resourcesPath, "auto_jimeng");
  } catch {
    return path.join(__dirname, "..", "auto_jimeng");
  }
}
var API_PORT = 8e3;
var API_BASE = `http://localhost:${API_PORT}`;
var mainWindow = null;
var tray = null;
var pythonProcess = null;
var pythonStatus = "stopped";
var pythonLogs = [];
var embeddedBrowserView = null;
var embeddedBrowserState = {
  visible: false,
  url: "",
  title: "",
  loading: false,
  error: ""
};
var embeddedBrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
function emitEmbeddedBrowserState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("browserView:state", {
    ...embeddedBrowserState
  });
}
function attachEmbeddedBrowserEvents(view) {
  if (!view) return;
  view.webContents.on("page-title-updated", (_event, title) => {
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
  view.webContents.on("did-fail-load", (_event, code, description) => {
    if (code === -3) {
      log("warn", `BrowserView \u5BFC\u822A\u88AB\u4E2D\u65AD: ${description}`);
      return;
    }
    embeddedBrowserState.loading = false;
    embeddedBrowserState.error = description;
    emitEmbeddedBrowserState();
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://jimeng.jianying.com/")) {
      view.webContents.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}
async function loadURLWithAbortTolerance(view, url) {
  try {
    await view.webContents.loadURL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const currentUrl = view.webContents.getURL();
    if (message.includes("ERR_ABORTED") || message.includes("(-3)")) {
      log("warn", `BrowserView loadURL \u88AB\u4E2D\u65AD\uFF0C\u6309\u53EF\u6062\u590D\u5904\u7406: ${message}`);
      if (currentUrl) {
        embeddedBrowserState.url = currentUrl;
        embeddedBrowserState.loading = false;
        embeddedBrowserState.error = "";
        emitEmbeddedBrowserState();
        return;
      }
    }
    throw error;
  }
}
async function ensureEmbeddedBrowserView(url) {
  if (!mainWindow) throw new Error("\u4E3B\u7A97\u53E3\u5C1A\u672A\u521B\u5EFA");
  if (!embeddedBrowserView) {
    log("info", "\u521B\u5EFA\u5185\u5D4C BrowserView");
    embeddedBrowserView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    });
    mainWindow.setBrowserView(embeddedBrowserView);
    attachEmbeddedBrowserEvents(embeddedBrowserView);
  }
  if (embeddedBrowserBounds.width > 0 && embeddedBrowserBounds.height > 0) {
    log("info", `\u8BBE\u7F6E BrowserView bounds: ${JSON.stringify(embeddedBrowserBounds)}`);
    embeddedBrowserView.setBounds(embeddedBrowserBounds);
    embeddedBrowserView.setAutoResize({ width: true, height: true });
  } else {
    log("warn", `BrowserView bounds \u65E0\u6548\uFF0C\u8DF3\u8FC7\u8BBE\u7F6E: ${JSON.stringify(embeddedBrowserBounds)}`);
  }
  embeddedBrowserState.visible = true;
  if (url) {
    embeddedBrowserState.url = url;
    log("info", `BrowserView \u5BFC\u822A\u5230: ${url}`);
    await loadURLWithAbortTolerance(embeddedBrowserView, url);
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
  embeddedBrowserView.webContents.destroy?.();
  embeddedBrowserView = null;
  embeddedBrowserState = { visible: false, url: "", title: "", loading: false, error: "" };
  embeddedBrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
  emitEmbeddedBrowserState();
}
function getUserDataPath() {
  return app.getPath("userData");
}
function getBrowserDataPath() {
  return path.join(getUserDataPath(), "jimeng_browser_data");
}
function getDefaultFilesDir() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), "files");
  }
  return path.join(__dirname, "..", "files");
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
  const venvPython = path.join(
    getJimengSourceDir(),
    ".venv",
    "Scripts",
    "python.exe"
  );
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
  mainWindow?.webContents.send("jimeng:status", {
    status: "starting",
    logs: pythonLogs
  });
  if (!fs.existsSync(getJimengSourceDir())) {
    log("error", `auto_jimeng \u6E90\u7801\u76EE\u5F55\u4E0D\u5B58\u5728: ${getJimengSourceDir()}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: `auto_jimeng \u6E90\u7801\u672A\u627E\u5230\uFF0C\u8BF7\u8054\u7CFB\u5F00\u53D1\u8005\u3002
\u671F\u671B\u8DEF\u5F84: ${getJimengSourceDir()}`
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
  const apiScript = path.join(getJimengSourceDir(), "start_api.py");
  if (!fs.existsSync(apiScript)) {
    log("error", `API \u5165\u53E3\u811A\u672C\u4E0D\u5B58\u5728: ${apiScript}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: "API \u5165\u53E3\u811A\u672C\u7F3A\u5931"
    });
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
    cwd: getJimengSourceDir(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false
  });
  pythonProcess.stdout?.on("data", (chunk) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const l of lines) {
      log("python", l);
      mainWindow?.webContents.send("jimeng:status", {
        status: pythonStatus,
        logs: [...pythonLogs]
      });
    }
  });
  pythonProcess.stderr?.on("data", (chunk) => {
    const l = chunk.toString().trim();
    if (l) log("error", `[Python stderr] ${l}`);
  });
  pythonProcess.on("error", (err) => {
    log("error", `Python \u5B50\u8FDB\u7A0B\u542F\u52A8\u5931\u8D25: ${err.message}`);
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: err.message
    });
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
    mainWindow?.webContents.send("jimeng:status", {
      status: "running",
      apiBase: API_BASE
    });
    return true;
  } else {
    log("error", "Python API \u670D\u52A1\u542F\u52A8\u8D85\u65F6");
    pythonStatus = "error";
    mainWindow?.webContents.send("jimeng:status", {
      status: "error",
      message: "\u670D\u52A1\u542F\u52A8\u8D85\u65F6\uFF0C\u8BF7\u67E5\u770B\u65E5\u5FD7"
    });
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
      const resp = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(3e3)
      });
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
    return {
      ok,
      status: pythonStatus,
      apiBase: ok ? API_BASE : void 0,
      logs: pythonLogs
    };
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
  ipcMain.handle("browserView:create", async (_event, params) => {
    if (params?.bounds) {
      embeddedBrowserBounds = params.bounds;
    }
    const view = await ensureEmbeddedBrowserView(params?.url);
    return {
      ok: true,
      id: "embedded-browser-view",
      state: {
        ...embeddedBrowserState,
        url: view.webContents.getURL() || embeddedBrowserState.url
      }
    };
  });
  ipcMain.handle("browserView:navigate", async (_event, { url }) => {
    const view = await ensureEmbeddedBrowserView();
    await loadURLWithAbortTolerance(view, url);
    embeddedBrowserState.url = view.webContents.getURL();
    emitEmbeddedBrowserState();
    return { ok: true, state: { ...embeddedBrowserState } };
  });
  ipcMain.handle("browserView:setBounds", (_event, bounds) => {
    embeddedBrowserBounds = bounds;
    log("info", `\u6536\u5230 BrowserView bounds: ${JSON.stringify(bounds)}`);
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
  ipcMain.handle("browserView:execute", async (_event, { script }) => {
    if (!embeddedBrowserView) {
      return { ok: false, error: "\u6D4F\u89C8\u5668\u89C6\u56FE\u5C1A\u672A\u521B\u5EFA" };
    }
    try {
      const result = await embeddedBrowserView.webContents.executeJavaScript(script, true);
      return { ok: true, result };
    } catch (error) {
      log("error", `browserView:execute \u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("browserView:capture", async () => {
    if (!embeddedBrowserView) {
      return { ok: false, error: "\u6D4F\u89C8\u5668\u89C6\u56FE\u5C1A\u672A\u521B\u5EFA" };
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
    async (_event, {
      selector = 'input[type="file"]',
      index = 0,
      files
    }) => {
      if (!embeddedBrowserView) {
        return { ok: false, error: "\u6D4F\u89C8\u5668\u89C6\u56FE\u5C1A\u672A\u521B\u5EFA" };
      }
      if (!Array.isArray(files) || files.length === 0) {
        return { ok: false, error: "\u6CA1\u6709\u53EF\u4E0A\u4F20\u7684\u6587\u4EF6" };
      }
      const tempDir = path.join(
        app.getPath("temp"),
        "next-chapter-browserview-files"
      );
      fs.mkdirSync(tempDir, { recursive: true });
      const writtenFiles = files.map((file, fileIndex) => {
        const match = String(file.dataUrl || "").match(
          /^data:([^;]+);base64,(.+)$/i
        );
        if (!match) {
          throw new Error(`\u65E0\u6548 dataUrl: ${file.fileName || fileIndex}`);
        }
        const mime = match[1];
        const ext = path.extname(file.fileName || "") || (mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : ".jpg");
        const safeBase = path.basename(file.fileName || `upload-${fileIndex}${ext}`, ext).replace(/[^\w.-]+/g, "_");
        const targetPath = path.join(
          tempDir,
          `${Date.now()}-${fileIndex}-${safeBase}${ext}`
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
          pierce: true
        });
        const { nodeIds } = await debuggerClient.sendCommand(
          "DOM.querySelectorAll",
          {
            nodeId: root.nodeId,
            selector
          }
        );
        if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
          throw new Error(`\u672A\u627E\u5230\u6587\u4EF6\u8F93\u5165\u6846: ${selector}`);
        }
        const safeIndex = Math.max(0, Math.min(index, nodeIds.length - 1));
        await debuggerClient.sendCommand("DOM.setFileInputFiles", {
          nodeId: nodeIds[safeIndex],
          files: writtenFiles
        });
        return {
          ok: true,
          count: writtenFiles.length,
          selector,
          index: safeIndex
        };
      } catch (error) {
        log(
          "error",
          `browserView:setFileInputFiles \u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`
        );
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      } finally {
        if (attachedByHandler && debuggerClient.isAttached()) {
          try {
            debuggerClient.detach();
          } catch {
          }
        }
      }
    }
  );
  ipcMain.handle("browserView:close", () => {
    closeEmbeddedBrowserView();
    return { ok: true };
  });
  ipcMain.handle("browserView:setIgnoreMouseEvents", (_event, ignore) => {
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
      `, true).catch(() => {
      });
    }
    return { ok: true };
  });
  ipcMain.handle("jimeng:openSetup", async () => {
    await ensureEmbeddedBrowserView("https://jimeng.jianying.com/ai-tool/home");
    return { ok: true };
  });
  ipcMain.handle("jimeng:openBrowserData", () => {
    shell.openPath(getBrowserDataPath());
  });
  ipcMain.handle(
    "jimeng:prepareXlsx",
    async (_event, {
      episodeLabel,
      base64Content,
      xlsxName,
      storageRoot
    }) => {
      try {
        const baseRoot = typeof storageRoot === "string" && storageRoot.trim().length > 0 ? path.normalize(storageRoot.trim()) : getDefaultFilesDir();
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
          xlsxFile: xlsxName
        };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
  );
  ipcMain.handle("storage:getDefaultPath", () => {
    const filesDir = getDefaultFilesDir();
    try {
      fs.mkdirSync(filesDir, { recursive: true });
    } catch {
    }
    const userData = app.getPath("userData");
    return {
      files: filesDir,
      db: path.join(userData, "db")
    };
  });
  ipcMain.handle("storage:selectFolder", async () => {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "\u9009\u62E9\u5B58\u50A8\u6587\u4EF6\u5939"
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("storage:openFolder", (_event, folderPath) => {
    shell.openPath(folderPath);
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
  mainWindow.on("resize", () => {
    if (embeddedBrowserView && embeddedBrowserState.visible && embeddedBrowserBounds.width > 0 && embeddedBrowserBounds.height > 0) {
      embeddedBrowserView.setBounds(embeddedBrowserBounds);
    }
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
