/**
 * Maps technical error messages to user-friendly Chinese descriptions.
 */
export function friendlyError(error: unknown): { title: string; description: string } {
  const msg = error instanceof Error ? error.message : String(error || "");
  const lower = msg.toLowerCase();

  // Timeout errors
  if (lower.includes("超时") || lower.includes("timeout") || lower.includes("abort") || lower.includes("timed out")) {
    return {
      title: "⏳ 生成超时",
      description: "AI 处理时间过长，请稍后重试。如反复出现，可尝试缩短描述或切换风格。",
    };
  }

  // Network / connection errors
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("connection") || lower.includes("net::") || lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return {
      title: "🌐 网络连接失败",
      description: "无法连接到服务器，请检查网络后重试。",
    };
  }

  // 504 / 502 gateway errors
  if (lower.includes("504") || lower.includes("502") || lower.includes("gateway")) {
    return {
      title: "🔧 服务暂时不可用",
      description: "后端服务繁忙或维护中，请稍等片刻再试。",
    };
  }

  // 429 rate limit
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many")) {
    return {
      title: "🚦 请求过于频繁",
      description: "AI 服务调用已达上限，请等待 30 秒后重试。",
    };
  }

  // 503 service unavailable
  if (lower.includes("503") || lower.includes("service unavailable") || lower.includes("overloaded")) {
    return {
      title: "⚠️ AI 服务繁忙",
      description: "当前使用人数较多，服务暂时不可用，请稍后再试。",
    };
  }

  // 401 / 403 auth errors
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("api key")) {
    return {
      title: "🔑 认证失败",
      description: "API 密钥无效或已过期，请联系管理员检查配置。",
    };
  }

  // 400 bad request
  if (lower.includes("400") || lower.includes("bad request") || lower.includes("invalid")) {
    return {
      title: "❌ 请求参数错误",
      description: "输入内容可能包含不支持的格式，请检查后重试。",
    };
  }

  // Content safety / moderation
  if (lower.includes("safety") || lower.includes("blocked") || lower.includes("content filter") || lower.includes("moderation") || lower.includes("违规")) {
    return {
      title: "🛡️ 内容审核未通过",
      description: "AI 检测到可能不适当的内容，请修改描述后重试。",
    };
  }

  // AI generation specific
  if (lower.includes("生成失败") || lower.includes("generation failed")) {
    return {
      title: "🎨 生成失败",
      description: "AI 未能成功生成内容，请重试或调整描述。",
    };
  }

  // Generic fallback with original message
  return {
    title: "😥 操作失败",
    description: msg || "发生未知错误，请稍后重试。如问题持续，请联系支持。",
  };
}
