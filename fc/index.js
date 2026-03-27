/**
 * Infinio API Gateway - 事件函数 + HTTP 触发器
 */

const PORT = 8080;

// CORS 头（去掉旧的 x-service/x-path 等多余字段）
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "3600",
};

const SERVICE_CONFIG = {
  gemini: {
    keyEnv: "GEMINI_API_KEY",
    endpointEnv: "GEMINI_ENDPOINT",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    authPrefix: "Bearer ",
  },
  jimeng: {
    keyEnv: "JIMENG_API_KEY",
    endpointEnv: "JIMENG_ENDPOINT",
    defaultEndpoint: "https://ark.cn-beijing.volces.com/api/v3",
    authPrefix: "Bearer ",
  },
  vidu: {
    keyEnv: "VIDU_API_KEY",
    endpointEnv: "VIDU_ENDPOINT",
    defaultEndpoint: "https://api.vidu.cn/ent/v2",
    authPrefix: "Bearer ",
  },
  kling: {
    keyEnv: "KLING_API_KEY",
    endpointEnv: "KLING_ENDPOINT",
    defaultEndpoint: "https://api.klingai.com",
    authPrefix: "Bearer ",
  },
};

function getServiceConfig(service) {
  const cfg = SERVICE_CONFIG[service];
  if (!cfg) throw new Error(`Unknown service: ${service}`);
  const key = process.env[cfg.keyEnv] || "";
  const endpoint = process.env[cfg.endpointEnv] || cfg.defaultEndpoint;
  if (!key) throw new Error(`API key not configured for service: ${service}`);
  return { apiKey: key, endpoint, authPrefix: cfg.authPrefix };
}

function getServiceStatus() {
  const status = {};
  for (const [name, cfg] of Object.entries(SERVICE_CONFIG)) {
    const key = process.env[cfg.keyEnv] || "";
    status[name] = key ? "configured" : "missing_key";
  }
  return status;
}

function buildResponse(statusCode, body) {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return {
    statusCode,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: Buffer.from(bodyStr).toString("base64"),
    isBase64Encoded: true,
  };
}

async function parseBody(rawBody, isBase64Encoded) {
  if (!rawBody) return {};
  let str = isBase64Encoded
    ? Buffer.from(rawBody, "base64").toString()
    : String(rawBody);
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

async function handleProxy(event) {
  const reqMethod = event.httpMethod || event.method || "";
  const reqPath = event.path || "";
  const body = event.body != null ? await parseBody(event.body, event.isBase64Encoded) : {};

  let service = body?.service || "gemini";
  let apiPath = body?.path || body?.apiPath || "";
  // FC HTTP 触发器：body.body 是 JSON 字符串，需要额外解析
  let requestBody = body?.body;
  if (typeof requestBody === "string") {
    try { requestBody = JSON.parse(requestBody); } catch { requestBody = undefined; }
  }

  // OPTIONS 预检
  if (reqMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
      body: "",
      isBase64Encoded: false,
    };
  }

  if (!apiPath) {
    return buildResponse(400, { error: "Missing path parameter" });
  }

  const svcCfg = getServiceConfig(service);

  if (!svcCfg.endpoint) {
    return buildResponse(500, { error: `Endpoint not configured for service: ${service}` });
  }

  const targetUrl = svcCfg.endpoint.replace(/\/$/, "") + apiPath;
  const method = body?.options?.method || body?.method || "POST";

  const targetHeaders = {
    "Content-Type": "application/json",
    "Authorization": svcCfg.authPrefix + svcCfg.apiKey,
  };

  if (body?.options?.headers) {
    Object.assign(targetHeaders, body.options.headers);
  }

  let serializedBody;
  if (method !== "GET" && method !== "HEAD") {
    if (requestBody && typeof requestBody === "object") {
      serializedBody = JSON.stringify(requestBody);
    } else if (requestBody && typeof requestBody === "string") {
      serializedBody = requestBody;
    } else if (body?.options?.body && typeof body.options.body === "object") {
      serializedBody = JSON.stringify(body.options.body);
    } else if (typeof body === "object" && !body.url && !body.service && !body.path) {
      serializedBody = JSON.stringify(body);
    }
  }

  console.log(`[FC Gateway] ${service} -> ${targetUrl} (${method})`);

  const response = await fetchWithRetry(targetUrl, {
    method,
    headers: targetHeaders,
    body: serializedBody,
  });

  const buffer = await response.arrayBuffer();
  const ct = response.headers.get("content-type") || "application/json";
  return {
    statusCode: response.status,
    headers: { ...corsHeaders, "Content-Type": ct },
    body: Buffer.from(buffer).toString("base64"),
    isBase64Encoded: true,
  };
}

// HTTP 触发器的请求事件格式（兼容 API 网关和 HTTP 触发器）
function parseHttpRequest(event) {
  return {
    method: event.httpMethod || event.method || "GET",
    path: (event.path || event.url || "/").split("?")[0],
    headers: event.headers || {},
    query: event.query || {},
    body: event.body,
    isBase64Encoded: event.isBase64Encoded || false,
  };
}

// 事件函数入口
module.exports.handler = async function (req, context) {
  // HTTP 触发器传入 Uint8Array：转换为 Buffer → JSON → event 对象
  if (req && typeof req[0] === "number" && req.length > 0) {
    const buf = Buffer.from(req);
    const bodyStr = buf.toString("utf8");
    const parsed = JSON.parse(bodyStr);
    const innerBody = parsed.body || "";
    // innerBody 可能是 JSON 字符串，保持原样传给 handleProxy
    return await handleProxy({
      httpMethod: parsed.http?.method || "POST",
      path: parsed.rawPath || parsed.requestContext?.http?.path || "/",
      headers: parsed.headers || {},
      body: innerBody,
      isBase64Encoded: parsed.isBase64Encoded || false,
    });
  }

  // 标准 HTTP 事件格式（CLI 调用或 API 网关）
  if (req && req.httpMethod !== undefined) {
    return await handleProxy(req);
  }

  // 标准 event 函数格式
  const httpReq = parseHttpRequest(req);
  return await handleProxy(httpReq);
};

// HTTP 服务器保活（健康检查用，customRuntime 下必须）
let server;
try {
  server = require("http").createServer((req, res) => {
    if (req.url === "/_fc/healthcheck") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Infinio API Gateway HTTP server listening on port ${PORT}`);
  });
} catch (e) {
  console.log("HTTP server not started:", e.message);
}

// 初始化入口（HTTP 函数必须有健康检查端口存活）
module.exports.initializer = async function (context) {
  console.log("Initializing Infinio API Gateway...");
  return;
};

// ===== 上游请求重试逻辑 =====

async function fetchWithRetry(url, options, retries = 2, delay = 3000) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, {
        ...options,
        signal: options.signal,
      });
      return resp;
    } catch (err) {
      lastError = err;
      if (i < retries) {
        console.warn(`[FC] fetch error, retry ${i + 1}/${retries} in ${delay}ms: ${err.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
