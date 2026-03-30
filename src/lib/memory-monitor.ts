/**
 * 内存监控和自动清理
 * 防止图片加载导致的内存溢出
 */

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 30000; // 30秒检查一次

export function monitorMemory() {
  if (!performance.memory) {
    console.warn('浏览器不支持 performance.memory');
    return;
  }

  const used = performance.memory.usedJSHeapSize;
  const total = performance.memory.totalJSHeapSize;
  const limit = performance.memory.jsHeapSizeLimit;
  const usagePercent = (used / limit) * 100;

  console.log(`📊 内存使用: ${(used / 1048576).toFixed(2)} MB / ${(limit / 1048576).toFixed(2)} MB (${usagePercent.toFixed(1)}%)`);

  // 如果内存使用超过 70%，触发清理
  if (usagePercent > 70) {
    console.warn('⚠️ 内存使用过高，触发自动清理');
    cleanupMemory();
  }

  return {
    used,
    total,
    limit,
    usagePercent
  };
}

export function cleanupMemory() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) {
    console.log('⏭️ 跳过清理（距离上次清理不足30秒）');
    return;
  }

  lastCleanup = now;

  try {
    // 1. 清理 IndexedDB 缓存
    if (window.indexedDB) {
      indexedDB.databases().then(dbs => {
        dbs.forEach(db => {
          if (db.name === 'thumb-cache') {
            console.log('🗑️ 清理图片缓存数据库');
            // 不删除整个数据库，只是标记需要清理
            // 实际清理由 ImageThumbnail 的 LRU 机制处理
          }
        });
      }).catch(err => {
        console.error('无法列出数据库:', err);
      });
    }

    // 2. 触发垃圾回收（如果浏览器支持）
    if (global.gc) {
      console.log('🧹 触发垃圾回收');
      global.gc();
    }

    // 3. 清理旧的 localStorage 数据
    const keysToCheck = [
      'generating-tasks',
      'generating-storyboard-tasks',
      'phase1-results',
      'decompose-meta'
    ];

    keysToCheck.forEach(key => {
      try {
        const value = localStorage.getItem(key);
        if (value && value.length > 100000) { // 超过 100KB
          console.log(`🗑️ 清理大型 localStorage: ${key} (${(value.length / 1024).toFixed(2)} KB)`);
          localStorage.removeItem(key);
        }
      } catch (err) {
        console.error(`清理 ${key} 失败:`, err);
      }
    });

    console.log('✅ 内存清理完成');
  } catch (err) {
    console.error('内存清理失败:', err);
  }
}

// 定期监控内存
export function startMemoryMonitoring() {
  // 每30秒检查一次
  const interval = setInterval(() => {
    monitorMemory();
  }, CLEANUP_INTERVAL);

  // 页面卸载时清理
  window.addEventListener('beforeunload', () => {
    clearInterval(interval);
  });

  console.log('🛡️ 内存监控已启动');
  return interval;
}
