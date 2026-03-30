# 🚀 快速修复指南

## 立即执行 (1分钟)

### 第一步: 清理缓存

打开应用,按 **F12**,在控制台粘贴:

```javascript
['generating-tasks','generating-storyboard-tasks','phase1-results','decompose-meta','charImg-generating','sceneImg-generating','charDesc-generating','sceneDesc-generating'].forEach(k=>localStorage.removeItem(k));console.log('✅ 已清理');location.reload();
```

### 第二步: 重启应用

```bash
# 完全关闭应用,然后重新启动
npm run electron:dev
```

### 第三步: 测试

1. 打开应用
2. 导航到"角色与场景"页面
3. 如果还是闪退,继续下一步

---

## 如果还是闪退

### 完全清理 (会丢失所有本地数据)

在控制台运行:

```javascript
localStorage.clear();
sessionStorage.clear();
indexedDB.databases().then(dbs => {
  dbs.forEach(db => {
    if (db.name) indexedDB.deleteDatabase(db.name);
  });
});
console.log('✅ 已完全清理');
location.reload();
```

---

## 修复内容

✅ 添加了安全的 localStorage 读取
✅ 添加了数据验证
✅ 添加了错误边界
✅ 添加了自动清理
✅ 创建了紧急修复工具

---

## 需要帮助?

查看详细文档: `CRASH_FIX_V2.md`
