

## IndexedDB 缩略图缓存清理机制

### 目标
限制 IndexedDB 中缓略图缓存的条目数量，防止长期使用后占用过多浏览器存储空间。

### 方案：LRU 淘汰策略

在 `ImageThumbnail.tsx` 中改造 IndexedDB 存储结构，实现基于"最近使用时间"的淘汰机制：

### 具体改动

**文件：`src/components/workspace/ImageThumbnail.tsx`**

1. **新增常量** `MAX_CACHE_ENTRIES = 200`，限制最大缓存条目数。

2. **改造存储结构**：将 IndexedDB 的 objectStore 升级到 v2，每条记录从纯字符串改为对象 `{ url: string, usedAt: number }`，并创建一个 `usedAt` 索引用于排序。

3. **更新 `idbSet`**：写入时同时记录 `usedAt = Date.now()`。写入后检查条目总数，如果超过 `MAX_CACHE_ENTRIES`，则按 `usedAt` 升序删除最旧的条目，直到总数回到限制以内。

4. **更新 `idbGet`**：读取命中时，异步更新该条目的 `usedAt` 为当前时间（标记为"最近使用"），确保常用缓存不被淘汰。

5. **版本迁移**：`onupgradeneeded` 中处理从 v1 到 v2 的迁移——删除旧 store，创建新 store 并添加 `usedAt` 索引。旧缓存会被清除（首次升级后会重新生成）。

### 技术细节

```text
写入流程:
idbSet(key, value)
  -> put({ url: value, usedAt: Date.now() }, key)
  -> count() > MAX_CACHE_ENTRIES ?
     -> 用 usedAt 索引打开游标，删除最旧条目直到 count <= MAX_CACHE_ENTRIES

读取流程:
idbGet(key)
  -> get(key)
  -> 命中: 返回 url，异步 put 更新 usedAt
  -> 未命中: 返回 undefined
```

这种方式保证常用图片始终保留在缓存中，而长期不用的旧条目会被自动清理。

