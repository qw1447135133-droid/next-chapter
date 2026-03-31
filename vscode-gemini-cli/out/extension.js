"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const vscode = __importStar(require("vscode"));
const pty = __importStar(require("node-pty"));
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
class GeminiSidebarProvider {
    callbacks;
    static viewType = "geminiCli.panel";
    view;
    state = {
        available: false,
        commandPath: "Not checked yet",
        configuredCommand: "gemini",
        shellPath: "powershell.exe",
        workspaceLabel: "No workspace folder",
        hint: "Press refresh to detect the local Gemini command.",
        checkedAt: "Not checked yet",
        pageOpen: false
    };
    constructor(callbacks) {
        this.callbacks = callbacks;
    }
    async resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.renderHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case "openPage":
                    await this.callbacks.openPage();
                    break;
                case "newSession":
                    await this.callbacks.newSession();
                    break;
                case "refresh":
                    await this.callbacks.refresh();
                    break;
                case "settings":
                    await this.callbacks.settings();
                    break;
            }
        });
        this.postState();
    }
    updateStatus(status) {
        this.state = status;
        this.postState();
    }
    postState() {
        void this.view?.webview.postMessage({ type: "status", value: this.state });
    }
    renderHtml(webview) {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 14px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
    }
    .stack {
      display: grid;
      gap: 12px;
    }
    .hero, .card {
      border-radius: 14px;
      padding: 14px;
      border: 1px solid var(--vscode-widget-border, transparent);
      background: var(--vscode-editorWidget-background);
    }
    .hero {
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--vscode-button-background) 22%, transparent), transparent 42%),
        linear-gradient(160deg, color-mix(in srgb, var(--vscode-editor-background) 85%, transparent), color-mix(in srgb, var(--vscode-sideBar-background) 94%, transparent));
    }
    h1 {
      margin: 0;
      font-size: 16px;
    }
    p {
      margin: 8px 0 0;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }
    .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .value {
      font-size: 12px;
      line-height: 1.5;
      word-break: break-word;
    }
    .ok {
      color: var(--vscode-testing-iconPassed);
    }
    .warn {
      color: var(--vscode-testing-iconFailed);
    }
    .meta {
      display: grid;
      gap: 8px;
    }
    button {
      appearance: none;
      width: 100%;
      border: 0;
      border-radius: 10px;
      padding: 10px 12px;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      margin-top: 8px;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .ghost {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
    }
  </style>
</head>
<body>
  <div class="stack">
    <section class="hero">
      <h1>Gemini Page</h1>
      <p>This extension opens Gemini in a dedicated editor tab backed by a real PTY session, so it feels much closer to Claude Code than a plain VS Code terminal panel.</p>
    </section>
    <section class="card">
      <div class="label">Status</div>
      <div id="availability" class="value">Checking...</div>
      <div class="meta" style="margin-top: 10px;">
        <div>
          <div class="label">Command</div>
          <div id="commandPath" class="value">-</div>
        </div>
        <div>
          <div class="label">Shell</div>
          <div id="shellPath" class="value">-</div>
        </div>
        <div>
          <div class="label">Workspace</div>
          <div id="workspaceLabel" class="value">-</div>
        </div>
        <div>
          <div class="label">Hint</div>
          <div id="hint" class="value">-</div>
        </div>
        <div>
          <div class="label">Checked</div>
          <div id="checkedAt" class="value">-</div>
        </div>
      </div>
      <button class="primary" id="openPage">Open Gemini Page</button>
      <button class="secondary" id="newSession">New Gemini Session</button>
      <button class="ghost" id="refresh">Refresh Status</button>
      <button class="ghost" id="settings">Open Settings</button>
    </section>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const send = (type) => vscode.postMessage({ type });
    document.getElementById('openPage')?.addEventListener('click', () => send('openPage'));
    document.getElementById('newSession')?.addEventListener('click', () => send('newSession'));
    document.getElementById('refresh')?.addEventListener('click', () => send('refresh'));
    document.getElementById('settings')?.addEventListener('click', () => send('settings'));
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type !== 'status') {
        return;
      }
      const value = message.value;
      const availability = document.getElementById('availability');
      availability.textContent = value.available
        ? (value.pageOpen ? 'Gemini is ready and the page is open.' : 'Gemini is ready. Open the page to start.')
        : 'Gemini command was not found on this machine.';
      availability.className = value.available ? 'value ok' : 'value warn';
      document.getElementById('commandPath').textContent = value.commandPath;
      document.getElementById('shellPath').textContent = value.shellPath;
      document.getElementById('workspaceLabel').textContent = value.workspaceLabel;
      document.getElementById('hint').textContent = value.hint;
      document.getElementById('checkedAt').textContent = value.checkedAt;
    });
  </script>
</body>
</html>`;
    }
}
class GeminiSessionPage {
    context;
    sessionId;
    status;
    onDispose;
    panel;
    ptyProcess;
    isReady = false;
    bufferedChunks = [];
    exitState = "Running";
    constructor(context, sessionId, status, onDispose) {
        this.context = context;
        this.sessionId = sessionId;
        this.status = status;
        this.onDispose = onDispose;
        this.panel = vscode.window.createWebviewPanel("geminiCli.page", `Gemini Code ${sessionId}`, vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, "node_modules", "@xterm", "xterm"),
                vscode.Uri.joinPath(context.extensionUri, "node_modules", "@xterm", "addon-fit"),
                vscode.Uri.joinPath(context.extensionUri, "media")
            ]
        });
        this.panel.iconPath = {
            light: vscode.Uri.joinPath(context.extensionUri, "media", "gemini-activity.svg"),
            dark: vscode.Uri.joinPath(context.extensionUri, "media", "gemini-activity.svg")
        };
        this.panel.webview.html = this.renderHtml();
        this.panel.onDidDispose(() => {
            this.ptyProcess.kill();
            this.onDispose();
        });
        this.panel.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case "ready":
                    this.isReady = true;
                    this.flushBuffer();
                    this.postStatus();
                    break;
                case "input":
                    this.ptyProcess.write(message.data);
                    break;
                case "resize":
                    if (message.cols > 0 && message.rows > 0) {
                        this.ptyProcess.resize(message.cols, message.rows);
                    }
                    break;
                case "restart":
                    this.restartGemini();
                    break;
                case "settings":
                    void vscode.commands.executeCommand("workbench.action.openSettings", "geminiCli");
                    break;
            }
        });
        this.ptyProcess = createGeminiPty();
        this.ptyProcess.onData((data) => this.pushData(data));
        this.ptyProcess.onExit((event) => {
            this.exitState = `Exited with code ${event.exitCode ?? 0}`;
            this.post({ type: "session-exit", value: this.exitState });
            this.postStatus();
        });
        setTimeout(() => {
            this.ptyProcess.write(`${buildLaunchCommand(status.configuredCommand)}\r`);
        }, 80);
    }
    reveal() {
        this.panel.reveal(vscode.ViewColumn.Active, true);
        this.post({ type: "focus" });
    }
    restartGemini() {
        this.pushData("\r\n\x1b[33m[Gemini Page] Restarting Gemini in the same PTY...\x1b[0m\r\n");
        this.ptyProcess.write("\x03");
        setTimeout(() => {
            this.ptyProcess.write(`${buildLaunchCommand(this.status.configuredCommand)}\r`);
        }, 120);
    }
    pushData(data) {
        if (this.isReady) {
            this.post({ type: "terminal-data", value: data });
            return;
        }
        this.bufferedChunks.push(data);
    }
    flushBuffer() {
        if (!this.bufferedChunks.length) {
            return;
        }
        this.post({
            type: "terminal-data",
            value: this.bufferedChunks.join("")
        });
        this.bufferedChunks.length = 0;
    }
    postStatus() {
        this.post({
            type: "session-status",
            value: {
                state: this.exitState,
                workspace: this.status.workspaceLabel,
                commandPath: this.status.commandPath,
                shellPath: this.status.shellPath
            }
        });
    }
    post(message) {
        void this.panel.webview.postMessage(message);
    }
    renderHtml() {
        const nonce = getNonce();
        const xtermCssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@xterm", "xterm", "css", "xterm.css"));
        const xtermJsUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@xterm", "xterm", "lib", "xterm.js"));
        const fitJsUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@xterm", "addon-fit", "lib", "addon-fit.js"));
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${this.panel.webview.cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${xtermCssUri}" />
  <style>
    html, body {
      height: 100%;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    .layout {
      height: 100%;
      display: grid;
      grid-template-rows: auto 1fr auto;
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--vscode-button-background) 16%, transparent), transparent 32%),
        linear-gradient(180deg, color-mix(in srgb, var(--vscode-editor-background) 96%, transparent), var(--vscode-editor-background));
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 12px 16px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, transparent);
    }
    .headline {
      display: grid;
      gap: 6px;
    }
    .headline h1 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .ghost {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    #terminal {
      height: 100%;
      width: 100%;
      padding: 10px 14px 14px;
      box-sizing: border-box;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px 14px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
    }
    .badge {
      color: var(--vscode-terminal-ansiGreen);
    }
  </style>
</head>
<body>
  <div class="layout">
    <header class="topbar">
      <div class="headline">
        <h1>Gemini Code</h1>
        <div class="meta">
          <span id="state">Starting...</span>
          <span id="workspace">${escapeHtml(this.status.workspaceLabel)}</span>
          <span id="command">${escapeHtml(this.status.commandPath)}</span>
        </div>
      </div>
      <div class="actions">
        <button class="ghost" id="settingsButton">Settings</button>
        <button class="primary" id="restartButton">Restart Gemini</button>
      </div>
    </header>
    <main id="terminal"></main>
    <footer class="footer">
      <span>This page hosts the real Gemini CLI in an embedded PTY.</span>
      <span class="badge">Session ${this.sessionId}</span>
    </footer>
  </div>

  <script nonce="${nonce}" src="${xtermJsUri}"></script>
  <script nonce="${nonce}" src="${fitJsUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const terminalElement = document.getElementById('terminal');
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim(),
        foreground: getComputedStyle(document.body).getPropertyValue('--vscode-foreground').trim(),
        cursor: getComputedStyle(document.body).getPropertyValue('--vscode-terminalCursor-foreground').trim() || '#ffffff'
      }
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalElement);
    fitAddon.fit();
    term.focus();

    const sendResize = () => {
      fitAddon.fit();
      vscode.postMessage({ type: 'resize', cols: term.cols, rows: term.rows });
    };

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(sendResize);
    });
    resizeObserver.observe(terminalElement);

    term.onData((data) => {
      vscode.postMessage({ type: 'input', data });
    });

    document.getElementById('restartButton')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'restart' });
    });
    document.getElementById('settingsButton')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'settings' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'terminal-data') {
        term.write(message.value);
      } else if (message.type === 'session-status') {
        document.getElementById('state').textContent = message.value.state;
        document.getElementById('workspace').textContent = message.value.workspace;
        document.getElementById('command').textContent = message.value.commandPath;
      } else if (message.type === 'session-exit') {
        document.getElementById('state').textContent = message.value;
      } else if (message.type === 'focus') {
        term.focus();
      }
    });

    vscode.postMessage({ type: 'ready' });
    sendResize();
  </script>
</body>
</html>`;
    }
}
class GeminiWorkbenchController {
    context;
    sidebarProvider;
    sessions = new Map();
    sessionCounter = 0;
    constructor(context, sidebarProvider) {
        this.context = context;
        this.sidebarProvider = sidebarProvider;
    }
    async refreshStatus(showToast) {
        const status = await detectGeminiStatus(this.sessions.size > 0);
        this.sidebarProvider.updateStatus(status);
        if (showToast) {
            const notifier = status.available ? vscode.window.showInformationMessage : vscode.window.showWarningMessage;
            void notifier(status.available
                ? `Gemini is available at ${status.commandPath}`
                : "Gemini command was not found. Make sure `gemini` works in PowerShell first.");
        }
        return status;
    }
    async openPage() {
        const latestSession = this.sessions.get(this.sessionCounter);
        if (latestSession) {
            latestSession.reveal();
            return;
        }
        await this.newSession();
    }
    async newSession() {
        const status = await this.refreshStatus(false);
        if (!status.available) {
            void vscode.window.showErrorMessage("Gemini command is not available yet. Please verify that `gemini` runs in PowerShell, then try again.");
            return;
        }
        this.sessionCounter += 1;
        const sessionId = this.sessionCounter;
        const session = new GeminiSessionPage(this.context, sessionId, status, () => {
            this.sessions.delete(sessionId);
            void this.refreshStatus(false);
        });
        this.sessions.set(sessionId, session);
        await this.refreshStatus(false);
    }
    async openSettings() {
        await vscode.commands.executeCommand("workbench.action.openSettings", "geminiCli");
    }
}
async function activate(context) {
    let controller;
    const sidebarProvider = new GeminiSidebarProvider({
        openPage: async () => {
            await controller?.openPage();
        },
        newSession: async () => {
            await controller?.newSession();
        },
        refresh: async () => {
            await controller?.refreshStatus(true);
        },
        settings: async () => {
            await controller?.openSettings();
        }
    });
    controller = new GeminiWorkbenchController(context, sidebarProvider);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(GeminiSidebarProvider.viewType, sidebarProvider), vscode.commands.registerCommand("geminiCli.startSession", async () => {
        await controller?.openPage();
    }), vscode.commands.registerCommand("geminiCli.newSession", async () => {
        await controller?.newSession();
    }), vscode.commands.registerCommand("geminiCli.refreshStatus", async () => {
        await controller?.refreshStatus(true);
    }), vscode.commands.registerCommand("geminiCli.openSettings", async () => {
        await controller?.openSettings();
    }));
    await controller.refreshStatus(false);
}
function deactivate() { }
function createGeminiPty() {
    const shellPath = getConfiguredShellPath();
    const cwd = getWorkspaceFolderFsPath() ?? os.homedir();
    const shellArgs = getShellArgs(shellPath);
    return pty.spawn(shellPath, shellArgs, {
        name: "xterm-256color",
        cols: 120,
        rows: 36,
        cwd,
        env: process.env
    });
}
async function detectGeminiStatus(pageOpen) {
    const configuredCommand = getConfiguredCommand();
    const shellPath = getConfiguredShellPath();
    const workspaceLabel = getWorkspaceFolderFsPath() ?? "No workspace folder";
    const checkedAt = new Date().toLocaleString("en-US", { hour12: false });
    try {
        const commandPath = await resolveCommandPath(configuredCommand);
        return {
            available: true,
            commandPath,
            configuredCommand,
            shellPath,
            workspaceLabel,
            hint: "Use Open Gemini Page to launch a PTY-backed Gemini tab in the editor area.",
            checkedAt,
            pageOpen
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            available: false,
            commandPath: "Not found",
            configuredCommand,
            shellPath,
            workspaceLabel,
            hint: `Detection failed: ${message}`,
            checkedAt,
            pageOpen
        };
    }
}
function getConfiguredCommand() {
    return vscode.workspace.getConfiguration("geminiCli").get("command", "gemini").trim() || "gemini";
}
function getConfiguredShellPath() {
    const configured = vscode.workspace.getConfiguration("geminiCli").get("shellPath", "").trim();
    if (configured) {
        return configured;
    }
    if (process.platform === "win32") {
        return "powershell.exe";
    }
    return process.env.SHELL || "/bin/bash";
}
function getShellArgs(shellPath) {
    const shellName = path.basename(shellPath).toLowerCase();
    if (shellName === "powershell.exe" || shellName === "powershell" || shellName === "pwsh.exe" || shellName === "pwsh") {
        return ["-NoLogo"];
    }
    if (shellName === "bash" || shellName === "zsh") {
        return ["-l"];
    }
    return [];
}
function getWorkspaceFolderFsPath() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
async function resolveCommandPath(command) {
    if (path.isAbsolute(command)) {
        return command;
    }
    if (process.platform === "win32") {
        const { stdout } = await execFileAsync("where.exe", [command]);
        const firstMatch = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean);
        if (!firstMatch) {
            throw new Error(`where.exe could not find ${command}`);
        }
        return firstMatch;
    }
    const { stdout } = await execFileAsync("which", [command]);
    const firstMatch = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
    if (!firstMatch) {
        throw new Error(`which could not find ${command}`);
    }
    return firstMatch;
}
function buildLaunchCommand(command) {
    if (process.platform === "win32") {
        return `& ${quoteForPowerShell(command)}`;
    }
    return quoteForPosix(command);
}
function quoteForPowerShell(value) {
    if (/^[A-Za-z0-9._-]+$/.test(value)) {
        return value;
    }
    return `"${value.replace(/"/g, '`"')}"`;
}
function quoteForPosix(value) {
    if (/^[A-Za-z0-9._/-]+$/.test(value)) {
        return value;
    }
    return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function getNonce() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let index = 0; index < 32; index += 1) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
//# sourceMappingURL=extension.js.map