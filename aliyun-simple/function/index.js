/**
 * API Proxy - 阿里云函数计算 HTTP 触发器（FC 3.0 / Node.js 18）
 *
 * 支持：
 *   - CORS 预检请求（OPTIONS）
 *   - JSON POST 请求（{ service, path, body }），注入对应 AI 服务的 API Key
 *   - 流式响应透传（text/event-stream）
 *
 * 前端请求格式（Content-Type: application/json）：
 * {
 *   service: "gemini" | "jimeng" | "vidu" | "kling" | "zhanhu",
 *   path:    "/v1beta/models/...generateContent"   // 不含 base URL
 *   body?:   <上游需要的 JSON body>
 * }
 *
 * 密钥从函数环境变量读取，不暴露在前端。
 */

// ─────────────────────────────────────────────
// CORS 头（允许所有来源，生产环境建议限制）
// ─────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-service, x-target-url, x-target-headers, x-client-info, apikey",
  "Access-Control-Max-Age": "3600",
};

// ─────────────────────────────────────────────
// 服务端点与密钥映射
// ─────────────────────────────────────────────
const SERVICE_ENDPOINTS = {
  gemini:  process.env.GEMINI_ENDPOINT  || "https://generativelanguage.googleapis.com",
  jimeng:  process.env.JIMENG_ENDPOINT  || "https://ark.cn-beijing.volces.com/api/v3",
  vidu:    process.env.VIDU_ENDPOINT    || "https://api.vidu.cn",
  kling:   process.env.KLING_ENDPOINT   || "https://api.klingai.com",
  zhanhu:  process.env.ZHANHU_ENDPOINT  || "https://api.zhanhu.ai",
};

const SERVICE_KEYS = {
  gemini:  process.env.GEMINI_API_KEY  || "",
  jimeng:  process.env.JIMENG_API_KEY  || "",
  vidu:    process.env.VIDU_API_KEY   || "",
  kling:   process.env.KLING_API_KEY   || "",
  zhanhu:  process.env.ZHANHU_API_KEY || "",
};

// 带 /proxy 后缀的全路径
const PROXY_PATH = "/proxy";

// 流式响应最大超时（秒）
const STREAM_TIMEOUT_SEC = 300;

// ─────────────────────────────────────────────
// 辅助：统一返回带 CORS 头的 JSON 响应
// ─────────────────────────────────────────────
function jsonResponse(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

// ─────────────────────────────────────────────
// 辅助：向上游透传响应（支持流式 / 非流式）
// ─────────────────────────────────────────────
async function proxyUpstream(res, upstreamUrl, upstreamHeaders, upstreamBody) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_SEC * 1000);

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: upstreamBody ? JSON.stringify(upstreamBody) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  // 透传状态码
  res.statusCode = upstreamRes.status;

  // 透传 CORS + Content-Type
  res.setHeader("Content-Type", upstreamRes.headers.get("Content-Type") || "application/json; charset=utf-8");
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  // 透传流式 body（用于 SSE / generateContent stream）
  if (upstreamRes.body) {
    for await (const chunk of upstreamRes.body) {
      res.write(chunk);
    }
    res.end();
  } else {
    const buf = await upstreamRes.arrayBuffer();
    res.end(Buffer.from(buf));
  }
}

// ─────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────
module.exports.handler = async (req, res) => {
  const method = req.method || "";

  // ── 1. 处理 CORS 预检 ──────────────────────
  if (method === "OPTIONS") {
    res.statusCode = 204;
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.end();
    return;
  }

  // ── 2. 只接受 POST ──────────────────────
  if (method !== "POST") {
    return jsonResponse(res, 405, { error: "Method Not Allowed" });
  }

  // ── 3. 读取 body ────────────────────────
  let rawBody = "";
  if (req.body && typeof req.body !== "undefined") {
    rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  } else {
    // 兼容有些 FC runtime 不自动 parse 的情况
    rawBody = await new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => resolve(data));
    });
  }

  let requestBody;
  try {
    requestBody = JSON.parse(rawBody);
  } catch {
    return jsonResponse(res, 400, { error: "Invalid JSON body" });
  }

  const { service, path, body } = requestBody;

  // ── 4. 校验参数 ──────────────────────────
  if (!service || !path) {
    return jsonResponse(res, 400, { error: "Missing 'service' or 'path' in request body" });
  }

  const upstreamBase = SERVICE_ENDPOINTS[service];
  if (!upstreamBase) {
    return jsonResponse(res, 400, { error: `Unknown service: ${service}` });
  }

  const apiKey = SERVICE_KEYS[service];
  if (!apiKey) {
    return jsonResponse(res, 502, { error: `API Key not configured for service: ${service}` });
  }

  const upstreamUrl = upstreamBase.replace(/\/$/, "") + path;

  // ── 5. 构建上游请求头 ───────────────────
  const upstreamHeaders = {
    "Content-Type": "application/json",
  };

  // 各服务不同的鉴权方式
  if (service === "vidu") {
    upstreamHeaders["Authorization"] = `Token ${apiKey}`;
  } else if (service === "kling") {
    upstreamHeaders["Authorization"] = `Bearer ${apiKey}`;
  } else {
    // gemini / jimeng / zhanhu 通用 Bearer
    upstreamHeaders["Authorization"] = `Bearer ${apiKey}`;
  }

  // 若前端传了覆盖用的 authorization，直接用（已认证调用场景）
  if (requestBody.authorization) {
    upstreamHeaders["Authorization"] = requestBody.authorization;
  }

  console.log(`[proxy] service=${service} → ${upstreamUrl}`);

  // ── 6. 转发请求 ─────────────────────────
  try {
    await proxyUpstream(res, upstreamUrl, upstreamHeaders, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[proxy] upstream error:", msg);

    // 避免在已经写了部分数据后再次 write
    if (!res.headersSent) {
      jsonResponse(res, 502, { error: `Upstream error: ${msg}` });
    } else {
      res.end(); // 流式已经开始，直接关闭
    }
  }
};
