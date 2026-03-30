# 角色与场景页面闪退修复方案

## 问题诊断

通过诊断发现以下问题:

1. **CharacterSettings.tsx 文件过大** (125KB) - 可能导致内存溢出
2. **缺少错误边界** - 未捕获的异常会导致整个应用崩溃
3. **localStorage 数据可能损坏** - 缓存的生成任务状态可能导致问题

## 已实施的修复

### 1. 添加错误边界组件 ✅

创建了 `src/components/ErrorBoundary.tsx`,当页面崩溃时会:
- 显示友好的错误提示
- 提供"清理缓存并重试"按钮
- 自动清理可能损坏的 localStorage 数据

### 2. 包裹 CharacterSettings 组件 ✅

在 `src/pages/Workspace.tsx` 中用 ErrorBoundary 包裹了 CharacterSettings 组件,防止崩溃影响整个应用。

### 3. 创建清理工具 ✅

创建了 `public/clean-cache.html` 清理工具页面,可以手动清理缓存。

## 使用方法

### 方法 1: 如果页面已经闪退

1. 启动应用后,在浏览器中访问: `http://localhost:5173/clean-cache.html`
2. 点击"清理所有缓存"按钮
3. 重启应用

### 方法 2: 使用开发者工具

1. 打开应用
2. 按 F12 打开开发者工具
3. 切换到 Console 标签
4. 粘贴以下代码并回车:

\`\`\`javascript
const keys = [
  'char-image-model',
  'char-view-mode',
  'custom-art-style-prompt',
  'generating-storyboard-tasks',
  'phase1-results',
  'decompose-meta',
  'charImg-generating',
  'sceneImg-generating',
  'charDesc-generating',
  'sceneDesc-generating',
];
keys.forEach(key => localStorage.removeItem(key));
console.log('✅ 缓存已清理,请刷新页面');
\`\`\`

5. 刷新页面 (Ctrl+R 或 F5)

### 方法 3: 如果错误边界捕获到错误

当页面显示"页面加载失败"时:
1. 点击"清理缓存并重试"按钮
2. 或点击"刷新页面"按钮

## 预防措施

为了避免将来再次出现闪退:

1. **定期清理缓存** - 特别是在生成大量图片后
2. **避免同时生成过多内容** - 分批生成角色和场景图片
3. **监控内存使用** - 如果应用变慢,考虑重启

## 如果问题仍然存在

如果清理缓存后问题仍然存在,请尝试:

1. **查看控制台错误**
   - 按 F12 打开开发者工具
   - 切换到 Console 标签
   - 截图错误信息

2. **检查数据完整性**
   - 确保 `characters` 和 `sceneSettings` 数据格式正确
   - 检查是否有损坏的图片 URL

3. **降级测试**
   - 尝试注释掉图片加载相关代码
   - 逐步启用功能,定位问题

## 技术细节

### 错误边界工作原理

\`\`\`tsx
<ErrorBoundary>
  <CharacterSettings {...props} />
</ErrorBoundary>
\`\`\`

当 CharacterSettings 内部抛出错误时:
1. ErrorBoundary 捕获错误
2. 显示友好的错误界面
3. 提供恢复选项
4. 防止整个应用崩溃

### 清理的 localStorage 键

- `char-image-model` - 角色图片生成模型选择
- `char-view-mode` - 角色视图模式
- `custom-art-style-prompt` - 自定义画风提示词
- `generating-storyboard-tasks` - 分镜图生成任务
- `phase1-results` - 剧本拆解第一阶段结果
- `decompose-meta` - 拆解元数据
- `*-generating` - 各种生成任务状态

## 后续优化建议

1. **拆分 CharacterSettings 组件** - 将 125KB 的大文件拆分成多个小组件
2. **添加虚拟滚动** - 当角色/场景数量很多时使用虚拟滚动
3. **图片懒加载** - 只加载可见区域的图片
4. **添加性能监控** - 监控组件渲染时间和内存使用
