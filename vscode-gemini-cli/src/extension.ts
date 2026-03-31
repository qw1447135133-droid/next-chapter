import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import * as pty from "node-pty";

const execFileAsync = promisify(execFile);

type SidebarMessage =
  | { type: "openPage" }
  | { type: "newSession" }
  | { type: "refresh" }
  | { type: "settings" };

type PageMessage =
  | { type: "ready" }
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "restart" }
  | { type: "settings" };

type GeminiStatus = {
  available: boolean;
  commandPath: string;
  configuredCommand: string;
  shellPath: string;
  workspaceLabel: string;
  hint: string;
  checkedAt: string;
  pageOpen: boolean;
};

class GeminiSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "geminiCli.panel";

  private view?: vscode.WebviewView;
  private state: GeminiStatus = {
    available: false,
    commandPath: "Not checked yet",
    configuredCommand: "gemini",
    shellPath: "powershell.exe",
    workspaceLabel: "No workspace folder",
    hint: "Press refresh to detect the local Gemini command.",
    checkedAt: "Not checked yet",
    pageOpen: false
  };

  public constructor(
    private readonly callbacks: {
      openPage: () => Promise<void>;
      newSession: () => Promise<void>;
      refresh: () => Promise<void>;
      settings: () => Promise<void>;
    }
  ) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.renderHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: SidebarMessage) => {
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

  public updateStatus(status: GeminiStatus): void {
    this.state = status;
    this.postState();
  }

  private postState(): void {
    void this.view?.webview.postMessage({ type: "status", value: this.state });
  }

  private renderHtml(webview: vscode.Webview): string {
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
  private readonly panel: vscode.WebviewPanel;
  private readonly ptyProcess: pty.IPty;
  private isReady = false;
  private readonly bufferedChunks: string[] = [];
  private exitState = "Running";

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sessionId: number,
    private readonly status: GeminiStatus,
    private readonly onDispose: () => void
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "geminiCli.page",
      `Gemini Code ${sessionId}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "node_modules", "@xterm", "xterm"),
          vscode.Uri.joinPath(context.extensionUri, "node_modules", "@xterm", "addon-fit"),
          vscode.Uri.joinPath(context.extensionUri, "media")
        ]
      }
    );

    this.panel.iconPath = {
      light: vscode.Uri.joinPath(context.extensionUri, "media", "gemini-activity.svg"),
      dark: vscode.Uri.joinPath(context.extensionUri, "media", "gemini-activity.svg")
    };
    this.panel.webview.html = this.renderHtml();

    this.panel.onDidDispose(() => {
      this.ptyProcess.kill();
      this.onDispose();
    });

    this.panel.webview.onDidReceiveMessage((message: PageMessage) => {
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

  public reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Active, true);
    this.post({ type: "focus" });
  }

  private restartGemini(): void {
    this.pushData("\r\n\x1b[33m[Gemini Page] Restarting Gemini in the same PTY...\x1b[0m\r\n");
    this.ptyProcess.write("\x03");
    setTimeout(() => {
      this.ptyProcess.write(`${buildLaunchCommand(this.status.configuredCommand)}\r`);
    }, 120);
  }

  private pushData(data: string): void {
    if (this.isReady) {
      this.post({ type: "terminal-data", value: data });
      return;
    }

    this.bufferedChunks.push(data);
  }

  private flushBuffer(): void {
    if (!this.bufferedChunks.length) {
      return;
    }

    this.post({
      type: "terminal-data",
      value: this.bufferedChunks.join("")
    });
    this.bufferedChunks.length = 0;
  }

  private postStatus(): void {
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

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private renderHtml(): string {
    const nonce = getNonce();
    const xtermCssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@xterm", "xterm", "css", "xterm.css")
    );
    const xtermJsUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@xterm", "xterm", "lib", "xterm.js")
    );
    const fitJsUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@xterm", "addon-fit", "lib", "addon-fit.js")
    );

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
  private readonly sessions = new Map<number, GeminiSessionPage>();
  private sessionCounter = 0;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sidebarProvider: GeminiSidebarProvider
  ) {}

  public async refreshStatus(showToast: boolean): Promise<GeminiStatus> {
    const status = await detectGeminiStatus(this.sessions.size > 0);
    this.sidebarProvider.updateStatus(status);

    if (showToast) {
      const notifier = status.available ? vscode.window.showInformationMessage : vscode.window.showWarningMessage;
      void notifier(
        status.available
          ? `Gemini is available at ${status.commandPath}`
          : "Gemini command was not found. Make sure `gemini` works in PowerShell first."
      );
    }

    return status;
  }

  public async openPage(): Promise<void> {
    const latestSession = this.sessions.get(this.sessionCounter);
    if (latestSession) {
      latestSession.reveal();
      return;
    }

    await this.newSession();
  }

  public async newSession(): Promise<void> {
    const status = await this.refreshStatus(false);
    if (!status.available) {
      void vscode.window.showErrorMessage(
        "Gemini command is not available yet. Please verify that `gemini` runs in PowerShell, then try again."
      );
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

  public async openSettings(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.openSettings", "geminiCli");
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let controller: GeminiWorkbenchController | undefined;

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

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GeminiSidebarProvider.viewType, sidebarProvider),
    vscode.commands.registerCommand("geminiCli.startSession", async () => {
      await controller?.openPage();
    }),
    vscode.commands.registerCommand("geminiCli.newSession", async () => {
      await controller?.newSession();
    }),
    vscode.commands.registerCommand("geminiCli.refreshStatus", async () => {
      await controller?.refreshStatus(true);
    }),
    vscode.commands.registerCommand("geminiCli.openSettings", async () => {
      await controller?.openSettings();
    })
  );

  await controller.refreshStatus(false);
}

export function deactivate(): void {}

function createGeminiPty(): pty.IPty {
  const shellPath = getConfiguredShellPath();
  const cwd = getWorkspaceFolderFsPath() ?? os.homedir();
  const shellArgs = getShellArgs(shellPath);

  return pty.spawn(shellPath, shellArgs, {
    name: "xterm-256color",
    cols: 120,
    rows: 36,
    cwd,
    env: process.env as Record<string, string>
  });
}

async function detectGeminiStatus(pageOpen: boolean): Promise<GeminiStatus> {
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
  } catch (error) {
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

function getConfiguredCommand(): string {
  return vscode.workspace.getConfiguration("geminiCli").get<string>("command", "gemini").trim() || "gemini";
}

function getConfiguredShellPath(): string {
  const configured = vscode.workspace.getConfiguration("geminiCli").get<string>("shellPath", "").trim();
  if (configured) {
    return configured;
  }

  if (process.platform === "win32") {
    return "powershell.exe";
  }

  return process.env.SHELL || "/bin/bash";
}

function getShellArgs(shellPath: string): string[] {
  const shellName = path.basename(shellPath).toLowerCase();

  if (shellName === "powershell.exe" || shellName === "powershell" || shellName === "pwsh.exe" || shellName === "pwsh") {
    return ["-NoLogo"];
  }

  if (shellName === "bash" || shellName === "zsh") {
    return ["-l"];
  }

  return [];
}

function getWorkspaceFolderFsPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function resolveCommandPath(command: string): Promise<string> {
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

function buildLaunchCommand(command: string): string {
  if (process.platform === "win32") {
    return `& ${quoteForPowerShell(command)}`;
  }

  return quoteForPosix(command);
}

function quoteForPowerShell(value: string): string {
  if (/^[A-Za-z0-9._-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '`"')}"`;
}

function quoteForPosix(value: string): string {
  if (/^[A-Za-z0-9._/-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";

  for (let index = 0; index < 32; index += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return text;
}
