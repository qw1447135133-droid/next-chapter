# Gemini Code Page

一个独立的 VS Code 扩展工程，目标是把本机 `gemini` CLI 放进 VS Code 的独立页面里，而不是依赖外部终端面板。

现在的形态：

- 左侧 Activity Bar 显示 Gemini 图标
- 侧边栏里一键打开 Gemini 页面
- 右上角工具栏显示快捷启动按钮
- 编辑区打开独立的 Gemini 页面标签
- 页面内部用 PTY 跑真实 `gemini`，尽量保持和 PowerShell 里输入 `gemini` 一致

## 开发

```powershell
cd vscode-gemini-cli
npm install
npm run compile
```

按 `F5` 启动 Extension Development Host 进行调试。

## 使用

1. 确保系统里已经能在 PowerShell 中直接运行 `gemini`
2. 编译扩展并在 VS Code 中加载
3. 点击左侧 Gemini 图标，或右上角快捷按钮
4. 扩展会在编辑区打开一个 Gemini 页面
5. 页面内部会启动 PowerShell PTY 并执行 `gemini`

## 可配置项

- `geminiCli.command`: Gemini 命令或完整路径
- `geminiCli.shellPath`: 自定义 shell，默认 Windows 下使用 `powershell.exe`
- `geminiCli.terminalName`: 终端名称
