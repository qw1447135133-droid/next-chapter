# 🚨 角色与场景页面闪退 - 紧急修复指南

## 快速修复 (30秒)

### 方法 1: 控制台一键修复 ⚡ (推荐)

1. 打开应用
2. 按 **F12** 打开开发者工具
3. 切换到 **Console** 标签
4. 复制粘贴以下代码并回车:

```javascript
['generating-tasks','generating-storyboard-tasks','phase1-results','decompose-meta','charImg-generating','sceneImg-generating','charDesc-generating','sceneDesc-generating'].forEach(k=>localStorage.removeItem(k));console.log('✅ 缓存已清理');location.reload();
```

页面会自动刷新,问题应该解决了!

### 方法 2: 使用紧急修复脚本

1. 按 **F12** 打开开发者工具
2. 切换到 **Console** 标签
3. 复制粘贴 `public/emergency-fix.js` 的内容并回车
4. 按照提示刷新页面

### 方法 3: 访问清理工具页面

访问: `http://localhost:5173/clean-cache.html`

点击"清理所有缓存"按钮,然后重启应用。

---

## 问题原因

经过深入诊断,发现以下问题:

### 1. localStorage 数据损坏 🔥
- `generating-tasks` 中的 JSON 数据可能损坏
- 组件初始化时解析失败导致崩溃

### 2. 组件文件过大 📦
- `CharacterSettings.tsx`: **125KB**
- `MultimodalAgentPanel.tsx`: **102KB**
- 大文件可能导致内存溢出

### 3. 缺少错误处理 ⚠️
- 未捕获的异常导致整个应用崩溃
- 没有数据验证机制

---

## 已实施的修复 ✅

### 1. 安全的 localStorage 读取
创建了 `src/lib/safe-storage.ts`:
- 自动捕获 JSON 解析错误
- 清理损坏的数据
- 应用启动时自动清理

### 2. 数据验证
创建了 `src/lib/validate-data.ts`:
- 验证 `characters` 数据结构
- 验证 `sceneSettings` 数据结构
- 验证 `scenes` 数据结构
- 自动过滤无效数据

### 3. 错误边界
创建了 `src/components/ErrorBoundary.tsx`:
- 捕获组件崩溃
- 显示友好错误提示
- 提供一键恢复功能

### 4. 自动清理
在 `src/main.tsx` 中添加:
- 应用启动时自动检查并清理损坏数据
- 防止损坏数据导致崩溃

---

## 如果问题仍然存在

### 步骤 1: 查看控制台错误
1. 按 **F12** 打开开发者工具
2. 切换到 **Console** 标签
3. 尝试打开角色与场景页面
4. 截图错误信息

### 步骤 2: 完全清理
```javascript
// 在控制台运行
localStorage.clear();
sessionStorage.clear();
location.reload();
```

⚠️ **注意**: 这会清除所有本地数据,包括项目数据!

### 步骤 3: 检查数据库
```javascript
// 在控制台运行
indexedDB.databases().then(dbs => {
  console.log('数据库列表:', dbs);
  dbs.forEach(db => {
    console.log(`- ${db.name} (${db.version})`);
  });
});
```

### 步骤 4: 降级测试
如果以上都不行,可以尝试:

1. **禁用图片加载**
   - 临时注释掉图片相关代码
   - 测试是否还会崩溃

2. **减少数据量**
   - 删除部分角色/场景
   - 测试是否是数据量问题

3. **检查内存使用**
   - 打开任务管理器
   - 查看应用内存占用
   - 如果超过 1GB,可能是内存泄漏

---

## 预防措施

### 1. 定期清理缓存
每次生成大量内容后,运行:
```javascript
['generating-tasks','generating-storyboard-tasks'].forEach(k=>localStorage.removeItem(k));
```

### 2. 避免同时生成过多内容
- 分批生成角色图片 (每次不超过 5 个)
- 分批生成场景图片 (每次不超过 5 个)
- 避免同时运行多个生成任务

### 3. 监控内存使用
- 如果应用变慢,考虑重启
- 定期关闭并重新打开应用

---

## 技术细节

### 修复的关键代码

#### 1. 安全的 localStorage 读取
```typescript
// src/lib/safe-storage.ts
export function safeGetLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item) as T;
  } catch (error) {
    console.warn(`Failed to parse localStorage key "${key}":`, error);
    localStorage.removeItem(key); // 清理损坏数据
    return defaultValue;
  }
}
```

#### 2. 数据验证
```typescript
// src/lib/validate-data.ts
export function validateCharacters(characters: CharacterSetting[]): CharacterSetting[] {
  if (!Array.isArray(characters)) return [];
  return characters.filter(char => char && char.id && char.name);
}
```

#### 3. 错误边界
```tsx
// src/components/ErrorBoundary.tsx
<ErrorBoundary>
  <CharacterSettings {...props} />
</ErrorBoundary>
```

### 清理的 localStorage 键

| 键名 | 用途 | 是否必须清理 |
|------|------|------------|
| `generating-tasks` | 生成任务队列 | ✅ 是 |
| `generating-storyboard-tasks` | 分镜图生成任务 | ✅ 是 |
| `phase1-results` | 剧本拆解第一阶段 | ✅ 是 |
| `decompose-meta` | 拆解元数据 | ✅ 是 |
| `char-image-model` | 角色图片模型选择 | ⚠️ 可选 |
| `char-view-mode` | 角色视图模式 | ⚠️ 可选 |

---

## 后续优化建议

1. **拆分大组件**
   - 将 `CharacterSettings.tsx` (125KB) 拆分成多个小组件
   - 使用 React.lazy 懒加载

2. **虚拟滚动**
   - 当角色/场景数量 > 20 时使用虚拟滚动
   - 减少 DOM 节点数量

3. **图片懒加载**
   - 只加载可见区域的图片
   - 使用 Intersection Observer

4. **性能监控**
   - 添加性能监控代码
   - 记录组件渲染时间
   - 监控内存使用

---

## 联系支持

如果以上方法都无法解决问题,请提供:

1. 控制台错误截图
2. 操作步骤
3. 数据量 (角色数、场景数)
4. 系统信息 (OS, 内存)

---

**最后更新**: 2024-03-28
**版本**: v2.0 (深度修复版)
