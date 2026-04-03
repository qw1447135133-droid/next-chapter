/**
 * electron/main.ts
 *
 * Electron 主进程：
 *  - 通过 preload 向渲染进程暴露安全的 IPC API
 *  - 窗口管理 + 系统托盘
 */

/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("node:path");
const crypto = require("node:crypto");
const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
} = require("electron");
const fs = require("node:fs");
const os = require("node:os");

// CJS 模式下 __dirname 由 Node.js 自动提供
// 注意：main.ts 被 esbuild 编译为 CJS，__dirname 在运行时可用
// __dirname 指向 electron/ 目录

// =========================== 配置 ===========================

const BUILTIN_API_ADMIN_PASSWORD_HASH =
  "d4f31b6def1e6e11148cbab15b400e91528ab18880b25225d9a9f840d4d0d192";
const STARTUP_LOG_PATH = path.join(
  process.env.TEMP || process.cwd(),
  "infinio-startup.log",
);

// =========================== 状态 ===========================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function getUserDataPath(): string {
  return app.getPath("userData");
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
  console.log(line);
  try {
    fs.appendFileSync(STARTUP_LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* ignore */
  }
}

process.on("uncaughtException", (error) => {
  log(
    "fatal",
    `uncaughtException: ${
      error instanceof Error ? error.stack || error.message : String(error)
    }`,
  );
});

process.on("unhandledRejection", (reason) => {
  log(
    "fatal",
    `unhandledRejection: ${
      reason instanceof Error ? reason.stack || reason.message : String(reason)
    }`,
  );
});

function verifyBuiltinApiAdminPassword(password: string): boolean {
  if (typeof password !== "string" || !password) {
    return false;
  }
  const actualHash = crypto.createHash("sha256").update(password, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(BUILTIN_API_ADMIN_PASSWORD_HASH, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function getDreaminaCandidatePaths(): string[] {
  const homeDir = os.homedir();
  const executableName = process.platform === "win32" ? "dreamina.exe" : "dreamina";
  return Array.from(
    new Set([
      path.join(homeDir, "bin", executableName),
      path.join(homeDir, ".local", "bin", executableName),
      path.join(path.dirname(process.execPath), executableName),
    ]),
  );
}

// =========================== IPC 处理 ===========================

function setupIPC() {
  // 🛡️ 读取崩溃日志
  ipcMain.handle(
    "runtime:verifyBuiltinApiAdminPassword",
    (_event, password: string) => verifyBuiltinApiAdminPassword(password),
  );

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

  ipcMain.handle(
    "jimeng:writeFile",
    async (
      _event,
      { filePath, content }: { filePath: string; content: string },
    ) => {
      try {
        // Normalize path to handle mixed slashes
        const normalizedPath = path.normalize(filePath);
        fs.mkdirSync(path.dirname(normalizedPath), { recursive: true });
        fs.writeFileSync(normalizedPath, Buffer.from(content, "base64"));
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
    "dreamina:exec",
    async (
      _event,
      { args, stdin }: { args: string[]; stdin?: string },
    ) => {
      const executablePath = await resolveDreaminaExecutable();
      if (!executablePath) {
        return {
          ok: false,
          installed: false,
          error: "未检测到 dreamina CLI，请先执行官方安装脚本安装。",
        };
      }

      const safeArgs = Array.isArray(args)
        ? args.filter((value) => typeof value === "string" && value.length > 0)
        : [];

      return await new Promise((resolve) => {
        const proc = spawn(executablePath, safeArgs, {
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        proc.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });

        proc.on("error", (error: Error) => {
          resolve({
            ok: false,
            installed: true,
            path: executablePath,
            error: error.message,
            stdout,
            stderr,
          });
        });

        proc.on("close", (code: number | null) => {
          resolve({
            ok: code === 0,
            installed: true,
            path: executablePath,
            code: code ?? -1,
            stdout,
            stderr,
          });
        });

        if (typeof stdin === "string" && stdin.length > 0) {
          proc.stdin.write(stdin);
        }
        proc.stdin.end();
      });
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
        // Normalize path to handle mixed slashes
        const normalizedPath = path.normalize(filePath);

        if (!fs.existsSync(normalizedPath)) {
          return { ok: true, exists: false, base64: "" };
        }

        const ext = path.extname(normalizedPath).toLowerCase();
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
          base64: fs.readFileSync(normalizedPath).toString("base64"),
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

  // =========================== Agent IPC ===========================
  // Manages QueryEngine instances keyed by sessionId.
  // Renders invoke agent:submitMessage → receives streamed agent:event messages.

  const { QueryEngine } = require("../src/lib/agent/query-engine");

  const agentSessions = new Map<string, InstanceType<typeof QueryEngine>>();

  ipcMain.handle(
    "agent:submitMessage",
    async (
      event,
      {
        sessionId,
        prompt,
        config,
      }: {
        sessionId: string;
        prompt: string;
        config: {
          apiKey: string;
          baseUrl?: string;
          model?: string;
          systemPrompt?: string;
          appendSystemPrompt?: string;
          maxTurns?: number;
          maxBudgetUsd?: number;
        };
      },
    ) => {
      // Reuse existing session or create a new one
      let engine = agentSessions.get(sessionId);
      if (!engine) {
        engine = new QueryEngine(config);
        agentSessions.set(sessionId, engine);
      } else {
        // Update API key / model if provided
        if (config.apiKey) engine["config"].apiKey = config.apiKey;
        if (config.model) engine.setModel(config.model);
      }

      try {
        for await (const sdkMsg of engine.submitMessage(prompt)) {
          if (event.sender.isDestroyed()) break;
          event.sender.send("agent:event", { sessionId, message: sdkMsg });
        }
      } catch (err) {
        if (!event.sender.isDestroyed()) {
          event.sender.send("agent:event", {
            sessionId,
            message: {
              type: "result",
              subtype: "success",
              isError: true,
              result: String(err),
              durationMs: 0,
              numTurns: 0,
              sessionId,
              totalCostUsd: 0,
              usage: { inputTokens: 0, outputTokens: 0 },
              uuid: crypto.randomUUID(),
            },
          });
        }
      }

      return { ok: true };
    },
  );

  ipcMain.handle("agent:interrupt", (_event, { sessionId }: { sessionId: string }) => {
    agentSessions.get(sessionId)?.interrupt();
    return { ok: true };
  });

  ipcMain.handle("agent:clearSession", (_event, { sessionId }: { sessionId: string }) => {
    agentSessions.delete(sessionId);
    return { ok: true };
  });

  // =========================== Tool Execute IPC ===========================
  // Unified handler for all built-in tools that require main-process access.

  const glob = require("fast-glob");
  const { exec, execFile, spawn } = require("node:child_process");
  const { promisify } = require("node:util");
  const execAsync = promisify(exec);
  const execFileAsync = promisify(execFile);

  async function resolveDreaminaExecutable(): Promise<string | null> {
    for (const candidate of getDreaminaCandidatePaths()) {
      if (fs.existsSync(candidate)) return candidate;
    }

    try {
      const lookupCommand = process.platform === "win32" ? "where.exe" : "which";
      const { stdout } = await execFileAsync(
        lookupCommand,
        ["dreamina"],
        { windowsHide: true },
      );
      return String(stdout)
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .find((line: string) => !!line && fs.existsSync(line)) || null;
    } catch {
      return null;
    }
  }

  ipcMain.handle(
    "tool:execute",
    async (_event, { toolName, args }: { toolName: string; args: Record<string, unknown> }) => {
      try {
        switch (toolName) {
          // ── FileRead ──────────────────────────────────────────────────
          case "FileRead": {
            const filePath = String(args.filePath);
            const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"]);
            const ext = path.extname(filePath).toLowerCase();
            if (IMAGE_EXTS.has(ext)) {
              if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };
              const base64 = fs.readFileSync(filePath).toString("base64");
              return { content: `[Image: data:image/${ext.slice(1)};base64,${base64}]` };
            }
            if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };
            const raw = fs.readFileSync(filePath, "utf8");
            const lines = raw.split("\n");
            const offset = Number(args.offset ?? 0);
            const limit = args.limit ? Number(args.limit) : undefined;
            const slice = limit ? lines.slice(offset, offset + limit) : lines.slice(offset);
            const numbered = slice
              .map((line: string, i: number) => `${offset + i + 1}\t${line}`)
              .join("\n");
            return { content: numbered };
          }

          // ── FileWrite ─────────────────────────────────────────────────
          case "FileWrite": {
            const filePath = String(args.filePath);
            const content = String(args.content ?? "");
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content, "utf8");
            return { ok: true };
          }

          // ── FileEdit ──────────────────────────────────────────────────
          case "FileEdit": {
            const filePath = String(args.filePath);
            if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };
            let content = fs.readFileSync(filePath, "utf8");
            const oldStr = String(args.oldString);
            const newStr = String(args.newString ?? "");
            const replaceAll = Boolean(args.replaceAll);
            if (!content.includes(oldStr)) {
              return { error: `old_string not found in ${filePath}` };
            }
            if (replaceAll) {
              content = content.split(oldStr).join(newStr);
            } else {
              const idx = content.indexOf(oldStr);
              content = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
            }
            fs.writeFileSync(filePath, content, "utf8");
            return { ok: true, message: `Edited ${filePath}` };
          }

          // ── Glob ──────────────────────────────────────────────────────
          case "Glob": {
            const pattern = String(args.pattern);
            const cwd = args.path ? String(args.path) : process.cwd();
            const files: string[] = await glob(pattern, {
              cwd,
              absolute: true,
              dot: false,
              ignore: ["**/node_modules/**", "**/.git/**"],
            });
            // Sort by mtime descending
            const withStat = files.map((f: string) => ({
              f,
              mtime: fs.statSync(f).mtimeMs,
            }));
            withStat.sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);
            return { files: withStat.map((x: { f: string }) => x.f) };
          }

          // ── Grep ──────────────────────────────────────────────────────
          case "Grep": {
            const pattern = String(args.pattern);
            const searchPath = args.path ? String(args.path) : process.cwd();
            const globFilter = args.glob ? String(args.glob) : undefined;
            const outputMode = String(args.output_mode ?? "files_with_matches");
            const caseInsensitive = Boolean(args["-i"]);
            const contextLines = Number(args.context ?? 0);
            const headLimit = Number(args.head_limit ?? 250);

            // Use ripgrep if available, else fallback to node regex
            let rgCmd = `rg --no-heading`;
            if (caseInsensitive) rgCmd += ` -i`;
            if (contextLines > 0) rgCmd += ` -C ${contextLines}`;
            if (globFilter) rgCmd += ` --glob "${globFilter}"`;
            if (outputMode === "files_with_matches") rgCmd += ` -l`;
            else if (outputMode === "count") rgCmd += ` --count`;
            else rgCmd += ` -n`;
            rgCmd += ` "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`;

            try {
              const { stdout } = await execAsync(rgCmd, { maxBuffer: 10 * 1024 * 1024 });
              const lines = stdout.split("\n").filter(Boolean).slice(0, headLimit);
              return { output: lines.join("\n") };
            } catch (e: unknown) {
              // ripgrep exits 1 when no matches, that's fine
              const exitCode = (e as { code?: number }).code;
              if (exitCode === 1) return { output: "" };
              // rg not found – fallback
              const { stdout } = await execAsync(
                `grep -r ${caseInsensitive ? "-i" : ""} -l "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`,
                { maxBuffer: 5 * 1024 * 1024 },
              ).catch(() => ({ stdout: "" }));
              return { output: stdout.trim() };
            }
          }

          // ── Bash ──────────────────────────────────────────────────────
          case "Bash": {
            const command = String(args.command);
            const timeout = Math.min(Number(args.timeout ?? 120_000), 600_000);
            const cwd = args.cwd ? String(args.cwd) : process.cwd();
            try {
              const { stdout, stderr } = await execAsync(command, {
                cwd,
                timeout,
                maxBuffer: 10 * 1024 * 1024,
                shell: process.platform === "win32" ? "powershell.exe" : "/bin/bash",
              });
              const output = [stdout, stderr].filter(Boolean).join("\n").trimEnd();
              return { output: output || "(no output)" };
            } catch (e: unknown) {
              const err = e as { stdout?: string; stderr?: string; message?: string };
              const output = [err.stdout, err.stderr, err.message]
                .filter(Boolean)
                .join("\n")
                .trimEnd();
              return { output: output || "Command failed" };
            }
          }

          default:
            return { error: `Unknown tool: ${toolName}` };
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  // =========================== MCP IPC ===========================
  // Manages stdio MCP server subprocesses.

  const mcpProcesses = new Map<string, {
    proc: ReturnType<typeof spawn>;
    pending: Map<number, {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }>;
    nextId: number;
  }>();

  function sendMcpRequest(
    name: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const session = mcpProcesses.get(name);
    if (!session) throw new Error(`MCP server "${name}" not connected`);
    const id = session.nextId++;
    return new Promise((resolve, reject) => {
      session.pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      session.proc.stdin.write(msg);
      setTimeout(() => {
        if (session.pending.has(id)) {
          session.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  ipcMain.handle("mcp:connect", async (_event, { config }: { config: {
    name: string; transport: string; command?: string; args?: string[]; env?: Record<string, string>;
  }}) => {
    try {
      if (config.transport !== "stdio" || !config.command) {
        return { error: "Only stdio transport supported currently" };
      }
      if (mcpProcesses.has(config.name)) {
        mcpProcesses.get(config.name)?.proc.kill();
        mcpProcesses.delete(config.name);
      }
      const proc = spawn(config.command, config.args ?? [], {
        env: { ...process.env, ...(config.env ?? {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const session = {
        proc,
        pending: new Map<
          number,
          { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
        >(),
        nextId: 1,
      };
      mcpProcesses.set(config.name, session);

      let buffer = "";
      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            const pend = session.pending.get(msg.id);
            if (pend) {
              session.pending.delete(msg.id);
              if (msg.error) pend.reject(new Error(msg.error.message));
              else pend.resolve(msg.result);
            }
          } catch {
            // Ignore non-JSON or partial stdio frames until the buffer completes.
          }
        }
      });

      // Initialize
      await sendMcpRequest(config.name, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "next-chapter", version: "1.0.0" },
      });

      // List tools
      const toolsResult = await sendMcpRequest(config.name, "tools/list", {}) as { tools?: unknown[] };
      const tools = (toolsResult?.tools ?? []).map((t: unknown) => {
        const tool = t as { name: string; description?: string; inputSchema?: unknown };
        return { serverName: config.name, name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema ?? {} };
      });

      // List resources
      const resResult = await sendMcpRequest(config.name, "resources/list", {}) as { resources?: unknown[] };
      const resources = (resResult?.resources ?? []).map((r: unknown) => {
        const res = r as { uri: string; name: string; description?: string; mimeType?: string };
        return { serverName: config.name, uri: res.uri, name: res.name, description: res.description, mimeType: res.mimeType };
      });

      return { ok: true, tools, resources };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("mcp:disconnect", (_event, { name }: { name: string }) => {
    mcpProcesses.get(name)?.proc.kill();
    mcpProcesses.delete(name);
    return { ok: true };
  });

  ipcMain.handle("mcp:call-tool", async (_event, {
    serverName, toolName, args,
  }: { serverName: string; toolName: string; args: Record<string, unknown> }) => {
    try {
      const result = await sendMcpRequest(serverName, "tools/call", { name: toolName, arguments: args });
      const content = (result as { content?: unknown })?.content;
      return { ok: true, content };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("mcp:read-resource", async (_event, {
    serverName, uri,
  }: { serverName: string; uri: string }) => {
    try {
      const result = await sendMcpRequest(serverName, "resources/read", { uri });
      const content = (result as { contents?: Array<{ text?: string }> })?.contents?.[0]?.text ?? "";
      return { ok: true, content };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}

// =========================== 窗口 & 托盘 ===========================

function createWindow() {
  log("info", "createWindow start");
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
    title: "InFinio-一站式智能体自动化平台",
  });

  mainWindow.once("ready-to-show", () => {
    log("info", "main window ready-to-show");
    mainWindow?.show();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    log("info", "main window did-finish-load");
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    log("error", `main window did-fail-load code=${code} description=${description} url=${url}`);
  });

  // 🛡️ 监听渲染进程崩溃
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    log("error", `========== 渲染进程崩溃 ==========`);
    log("error", `原因: ${details.reason}`);
    log("error", `退出码: ${details.exitCode}`);
    console.error("渲染进程崩溃详情:", details);

    // 保存崩溃信息到文件，包含更多上下文
    const crashInfo = {
      timestamp: new Date().toISOString(),
      reason: details.reason,
      exitCode: details.exitCode,
      // 添加内存使用信息
      memoryUsage: process.memoryUsage(),
      // 添加系统信息
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
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

  // 加载 Vite dev server 或打包后的 index.html
  if (process.env.VITE_DEV_SERVER_URL) {
    log("info", `loading dev url: ${process.env.VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools();
    }
  } else {
    const indexPath = path.join(__dirname, "../dist/index.html");
    log("info", `loading file: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }
}

function createTray() {
  // 加载图标
  const icon = nativeImage.createFromPath(path.join(__dirname, "../build/icon.ico"));
  log("info", `createTray icon empty=${icon.isEmpty()}`);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: "显示窗口", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]);

  tray.setToolTip("InFinio-一站式智能体自动化平台");
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
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  // Cleanup if needed
});
