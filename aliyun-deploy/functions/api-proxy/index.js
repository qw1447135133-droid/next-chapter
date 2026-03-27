/**
 * API Proxy - 阿里云函数计算 HTTP 触发器（FC 3.0 / Node.js 18）
 * 轻量级代理：接收 { service, path, body }，注入 AI 服务 API Key 后转发请求。
 *
 * 支持：
 *   - CORS 预检（OPTIONS）→ 返回 204 + CORS 头
 *   - POST 请求 → JSON { service, path, body } → 透传到目标服务
 *   - 流式响应透传（SSE / generateContent stream）
 *
 * 前端请求格式（Content-Type: application/json）：
 * {
 *   service: "gemini" | "jimeng" | "vidu" | "kling" | "zhanhu",
 *   path:    "/v1beta/models/...generateContent"   // 不含 base URL
 *   body?:   <上游需要的 JSON body>
 * }
 */

// ─────────────────────────────────────────────
// CORS 头
// ─────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-service, x-target-url, x-target-headers, x-client-info, apikey",
  "Access-Control-Max-Age": "3600",
};

// ─────────────────────────────────────────────
// 服务端点（可从环境变量覆盖）
// ─────────────────────────────────────────────
const SERVICE_ENDPOINTS = {
  gemini:  process.env.GEMINI_ENDPOINT  || "https://generativelanguage.googleapis.com",
  jimeng:  process.env.JIMENG_ENDPOINT  || "https://ark.cn-beijing.volces.com/api/v3",
  vidu:    process.env.VIDU_ENDPOINT    || "https://api.vidu.cn",
  kling:   process.env.KLING_ENDPOINT   || "https://api.klingai.com",
  zhanhu:  process.env.ZHANHU_ENDPOINT || "https://api.zhanhu.ai",
};

// 各服务的 API Key
const SERVICE_KEYS = {
  gemini:  process.env.GEMINI_API_KEY  || "",
  jimeng:  process.env.JIMENG_API_KEY  || "",
  vidu:    process.env.VIDU_API_KEY   || "",
  kling:   process.env.KLING_API_KEY   || "",
  zhanhu:  process.env.ZHANHU_API_KEY || "",
};

const STREAM_TIMEOUT_MS = 300_000; // 5 分钟

// ─────────────────────────────────────────────
// 辅助：返回带 CORS 头的 JSON
// ─────────────────────────────────────────────
function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

// ─────────────────────────────────────────────
// 辅助：透传上游响应（流式友好）
// ─────────────────────────────────────────────
async function pipeUpstream(res, upstreamUrl, upstreamHeaders, upstreamBody) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STREAM_TIMEOUT_MS);

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: upstreamHeaders,
      body: upstreamBody != null ? JSON.stringify(upstreamBody) : undefined,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  res.statusCode = upstreamRes.status;
  res.setHeader("Content-Type", upstreamRes.headers.get("Content-Type") || "application/json; charset=utf-8");
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

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

  // ── OPTIONS → CORS 预检 ──────────────────
  if (method === "OPTIONS") {
    res.statusCode = 204;
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.end();
    return;
  }

  // ── 只接受 POST ──────────────────────────
  if (method !== "POST") {
    return sendJson(res, 405, { error: "Method Not Allowed" });
  }

  // ── 解析请求体 ───────────────────────────
  let rawBody = "";
  if (req.body && typeof req.body !== "undefined") {
    rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  } else {
    rawBody = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const { service, path, body: requestPayload } = parsed;

  // ── 参数校验 ──────────────────────────────
  if (!service || !path) {
    return sendJson(res, 400, { error: "Missing 'service' or 'path' field in request body" });
  }

  const upstreamBase = SERVICE_ENDPOINTS[service];
  if (!upstreamBase) {
    return sendJson(res, 400, { error: `Unknown service: ${service}` });
  }

  const apiKey = SERVICE_KEYS[service];
  if (!apiKey) {
    return sendJson(res, 502, { error: `API key not configured for service: ${service}` });
  }

  const upstreamUrl = upstreamBase.replace(/\/$/, "") + path;

  // ── 构建上游请求头 ───────────────────────
  const upstreamHeaders = { "Content-Type": "application/json" };

  if (service === "vidu") {
    upstreamHeaders["Authorization"] = `Token ${apiKey}`;
  } else if (service === "kling") {
    upstreamHeaders["Authorization"] = `Bearer ${apiKey}`;
  } else {
    // gemini / jimeng / zhanhu → Bearer
    upstreamHeaders["Authorization"] = `Bearer ${apiKey}`;
  }

  // 允许前端覆盖 Authorization（如已持有 token 的场景）
  if (parsed.authorization) {
    upstreamHeaders["Authorization"] = parsed.authorization;
  }

  console.log(`[proxy] ${service} → ${upstreamUrl}`);

  // ── 转发请求 ─────────────────────────────
  try {
    await pipeUpstream(res, upstreamUrl, upstreamHeaders, requestPayload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[proxy] upstream error:", msg);
    if (!res.headersSent) {
      sendJson(res, 502, { error: `Upstream error: ${msg}` });
    } else {
      res.end();
    }
  }
};
