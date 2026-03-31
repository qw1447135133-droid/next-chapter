# 闪退调试指南

## 问题现象

程序在使用 gemini-3-pro-image-preview 生成图像后瞬间闪退，终端显示 `node electron/dev-launch.cjs exited with code 0`

## 已修复的问题

1. **Base64 转换内存溢出** - 在 `src/lib/gemini-client.ts` 中使用分块处理替代 `reduce()`
2. **增强错误处理** - 添加超时保护和详细日志

## 调试步骤

### 步骤 1：检查是否有编译错误

在 PowerShell 中运行：
```powershell
cd C:\Users\14471\Documents\GitHub\next-chapter
npm run build
```

如果有错误，请先修复编译错误。

### 步骤 2：启用详细日志

修改 `electron/main.ts`，在 `createWindow()` 函数开头添加：

```typescript
console.log('[main] Creating window...');
console.log('[main] Memory usage:', process.memoryUsage());
```

### 步骤 3：检查崩溃日志

运行应用后，检查崩溃日志：
```powershell
# 查看崩溃日志
Get-Content "$env:APPDATA\vite_react_shadcn_ts\crash-log.json" -ErrorAction SilentlyContinue
```

### 步骤 4：使用 Chrome DevTools 调试

1. 在 `electron/main.ts` 的 `createWindow()` 中确保有：
   ```typescript
   mainWindow.webContents.openDevTools();
   ```

2. 运行 `npm run electron:dev`

3. 在 DevTools 打开前就崩溃？添加启动延迟：
   ```typescript
   mainWindow.once("ready-to-show", async () => {
     await new Promise(resolve => setTimeout(resolve, 2000)); // 延迟 2 秒
     mainWindow?.show();
   });
   ```

### 步骤 5：检查是否是特定图像导致崩溃

临时移除生成的图像：
```powershell
# 备份图像
Move-Item "C:\Users\14471\Documents\GitHub\next-chapter\files\projects\mnars0s8tsms3urcilf\images\generated" "C:\Users\14471\Documents\GitHub\next-chapter\files\projects\mnars0s8tsms3urcilf\images\generated.bak"
```

然后重新运行应用，看是否还会崩溃。

### 步骤 6：增加内存限制

如果是内存问题，在 `electron/main.ts` 的顶部添加：

```typescript
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
```

### 步骤 7：禁用硬件加速

有时硬件加速会导致崩溃，在 `electron/main.ts` 添加：

```typescript
app.disableHardwareAcceleration();
```

## 常见原因和解决方案

### 原因 1：大图像导致内存溢出
**症状**：生成图像后立即崩溃
**解决**：已在代码中修复，使用分块处理

### 原因 2：GPU 驱动问题
**症状**：窗口显示时崩溃
**解决**：禁用硬件加速（见步骤 7）

### 原因 3：Node 模块不兼容
**症状**：启动时立即崩溃
**解决**：重新安装依赖
```powershell
Remove-Item node_modules -Recurse -Force
npm install
```

### 原因 4：Electron 版本问题
**症状**：随机崩溃
**解决**：检查 Electron 版本兼容性

## 收集诊断信息

如果以上步骤都无法解决，请收集以下信息：

1. **系统信息**：
   ```powershell
   systeminfo | findstr /C:"OS Name" /C:"OS Version" /C:"System Type" /C:"Total Physical Memory"
   ```

2. **Node 和 npm 版本**：
   ```powershell
   node --version
   npm --version
   ```

3. **崩溃日志**：
   ```powershell
   Get-Content "$env:APPDATA\vite_react_shadcn_ts\crash-log.json"
   ```

4. **控制台输出**：
   运行 `npm run electron:dev` 并复制所有输出

## 临时解决方案

如果无法立即修复，可以暂时使用同步模型：

在设置中将图像生成模型从：
- `gemini-3-pro-image-preview-2k-async`
改为：
- `gemini-3-pro-image-preview-2k`

同步模型虽然慢一些，但更稳定。
