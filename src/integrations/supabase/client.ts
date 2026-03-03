// Supabase 客户端 - 支持从本地存储读取配置
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// 从本地存储获取配置
function getSupabaseConfig(): { url: string; key: string } {
  try {
    const saved = localStorage.getItem("storyforge_api_config");
    if (saved) {
      const config = JSON.parse(saved);
      if (config.supabaseUrl && config.supabaseKey) {
        return { url: config.supabaseUrl, key: config.supabaseKey };
      }
    }
  } catch { /* ignore */ }
  
  // 回退到环境变量
  return {
    url: import.meta.env.VITE_SUPABASE_URL || "",
    key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  };
}

const { url, key } = getSupabaseConfig();

// 导出创建客户端的函数
let supabaseInstance: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseInstance || url !== import.meta.env.VITE_SUPABASE_URL || key !== import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    const config = getSupabaseConfig();
    if (!config.url || !config.key) {
      throw new Error("请先在设置页面配置 Supabase URL 和 Key");
    }
    supabaseInstance = createClient<Database>(config.url, config.key, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseInstance;
}

// 兼容旧代码 - 导出默认实例
export const supabase = getSupabase();
