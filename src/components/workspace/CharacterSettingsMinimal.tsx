// 最小化测试版本 - 用于诊断崩溃原因
import { useEffect } from "react";

export default function CharacterSettingsMinimal() {
  useEffect(() => {
    console.log('✅ CharacterSettingsMinimal 已挂载');

    // 测试 localStorage 读取
    try {
      const keys = [
        'generating-tasks',
        'generating-storyboard-tasks',
        'phase1-results',
        'decompose-meta'
      ];

      keys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
          console.log(`📦 ${key}: ${value.length} 字符`);
          try {
            JSON.parse(value);
            console.log(`  ✅ JSON 解析成功`);
          } catch (e) {
            console.error(`  ❌ JSON 解析失败:`, e);
          }
        }
      });
    } catch (err) {
      console.error('❌ localStorage 测试失败:', err);
    }

    return () => {
      console.log('🔄 CharacterSettingsMinimal 已卸载');
    };
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">最小化测试页面</h1>
      <p className="text-muted-foreground">
        如果你能看到这个页面，说明基础渲染没问题。
      </p>
      <p className="text-muted-foreground mt-2">
        请打开控制台 (F12) 查看诊断信息。
      </p>
    </div>
  );
}
