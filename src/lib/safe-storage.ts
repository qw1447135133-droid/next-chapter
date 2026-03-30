// 安全的 localStorage 读取工具
// 用于防止损坏的数据导致应用崩溃

export function safeGetLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;

    // 🛡️ 如果默认值是字符串类型，直接返回字符串，不解析 JSON
    if (typeof defaultValue === 'string') {
      return item as T;
    }

    return JSON.parse(item) as T;
  } catch (error) {
    console.warn(`Failed to parse localStorage key "${key}":`, error);
    // 清理损坏的数据
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return defaultValue;
  }
}

export function safeSetLocalStorage<T>(key: string, value: T): boolean {
  try {
    // 🛡️ 如果值是字符串，直接存储，不用 JSON.stringify
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
    return true;
  } catch (error) {
    console.warn(`Failed to set localStorage key "${key}":`, error);
    return false;
  }
}

export function safeRemoveLocalStorage(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove localStorage key "${key}":`, error);
    return false;
  }
}

// 批量清理可能损坏的 localStorage 键
export function cleanupCorruptedStorage(keys: string[]): number {
  let cleaned = 0;
  for (const key of keys) {
    try {
      const item = localStorage.getItem(key);
      if (item) {
        // 尝试解析,如果失败则清理
        JSON.parse(item);
      }
    } catch {
      try {
        localStorage.removeItem(key);
        cleaned++;
        console.log(`Cleaned corrupted localStorage key: ${key}`);
      } catch {
        // ignore
      }
    }
  }
  return cleaned;
}

// 在应用启动时自动清理
export function autoCleanupOnStartup() {
  const keysToCheck = [
    'generating-tasks',
    'generating-storyboard-tasks',
    'phase1-results',
    'decompose-meta',
    'charImg-generating',
    'sceneImg-generating',
    'charDesc-generating',
    'sceneDesc-generating',
  ];

  // 🛡️ 清理字符串类型的键（它们不应该被 JSON.parse）
  const stringKeys = ['char-image-model', 'char-view-mode', 'custom-art-style-prompt'];
  stringKeys.forEach(key => {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        // 尝试 JSON.parse，如果成功说明是旧格式（错误的），需要清理
        try {
          JSON.parse(value);
          // 如果能解析成 JSON，说明是旧的错误格式，清理它
          localStorage.removeItem(key);
          console.log(`Cleaned incorrectly stored string key: ${key}`);
        } catch {
          // 无法解析 JSON，说明是正确的纯字符串格式，保留
        }
      }
    } catch {
      // ignore
    }
  });

  const cleaned = cleanupCorruptedStorage(keysToCheck);
  if (cleaned > 0) {
    console.log(`Auto-cleanup: removed ${cleaned} corrupted localStorage entries`);
  }
}
