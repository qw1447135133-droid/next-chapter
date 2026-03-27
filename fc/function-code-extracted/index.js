/**
 * Infinio API Gateway - 事件函数 + HTTP 触发器
 */

const PORT = 8080;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-service, x-path, x-target-url, x-target-headers",
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
    authPrefix: "Token ",
  },
  kling: {
    keyEnv: "KLING_API_KEY",
    endpointEnv: "KLING_ENDPOINT",
    defaultEndpoint: "https://api.klingai.com",
    authPrefix: "Bearer ",
  },
};

function getServiceConfig(service) {
  const cfg = SERVICE_CONFIG[service] || {
    keyEnv: "GENERAL_API_KEY",
    endpointEnv: "GENERAL_ENDPOINT",
    defaultEndpoint: "",
    authPrefix: "Bearer ",
  };
  return {
    apiKey: process.env[cfg.keyEnv] || process.env["GENERAL_API_KEY"] || "",
    endpoint: process.env[cfg.endpointEnv] || cfg.defaultEndpoint || "",
    authPrefix: cfg.authPrefix,
  };
}

function getServiceStatus() {
  const status = {};
  for (const [name, cfg] of Object.entries(SERVICE_CONFIG)) {
    status[name] = {
      configured: !!process.env[cfg.keyEnv],
      endpoint: process.env[cfg.endpointEnv] || cfg.defaultEndpoint,
    };
  }
  return status;
}

async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      try {
        const resp = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        if (resp.status >= 500 && i < maxRetries - 1) {
          console.log(`Request failed ${resp.status}, retrying (${i + 1}/${maxRetries})`);
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
          lastError = new Error(`HTTP ${resp.status}`);
          continue;
        }
        return resp;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

function buildResponse(statusCode, data, contentType) {
  return {
    statusCode,
    headers: { ...corsHeaders, "Content-Type": contentType || "application/json" },
    body: typeof data === "string" ? data : JSON.stringify(data),
  };
}

async function parseBody(rawBody, isBase64Encoded) {
  if (!rawBody) return {};
  try {
    const decoded = isBase64Encoded
      ? Buffer.from(rawBody, "base64").toString()
      : Buffer.from(rawBody).toString();
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

async function handleProxy(event) {
  const body = await parseBody(event.body, event.isBase64Encoded);

  let service = body.service || event.headers?.["x-service"] || "gemini";
  let apiPath = body.path || body.apiPath || event.headers?.["x-path"] || "";
  let requestBody = body.body || body.requestBody || undefined;

  // OPTIONS 预检请求没有 body，直接返回成功
  if (event.method === "OPTIONS") {
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

  if (!svcCfg.apiKey) {
    return buildResponse(500, { error: `API Key not configured for service: ${service}` });
  }

  if (!svcCfg.endpoint) {
    return buildResponse(500, { error: `Endpoint not configured for service: ${service}` });
  }

  const targetUrl = svcCfg.endpoint.replace(/\/$/, "") + apiPath;
  const method = body.options?.method || body.method || "POST";

  const targetHeaders = {
    "Content-Type": "application/json",
    "Authorization": svcCfg.authPrefix + svcCfg.apiKey,
  };

  if (body.options?.headers) {
    Object.assign(targetHeaders, body.options.headers);
  }

  let serializedBody;
  if (method !== "GET" && method !== "HEAD") {
    if (requestBody && typeof requestBody === "object") {
      serializedBody = JSON.stringify(requestBody);
    } else if (requestBody && typeof requestBody === "string") {
      serializedBody = requestBody;
    } else if (body.options?.body && typeof body.options.body === "object") {
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

// HTTP 触发器的请求事件格式
function parseHttpRequest(event) {
  return {
    method: event.method || "GET",
    path: (event.path || event.url || "/").split("?")[0],
    headers: event.headers || {},
    query: event.query || {},
    body: event.body,
    isBase64Encoded: event.isBase64Encoded || false,
  };
}

// 事件函数入口
module.exports.handler = async function (req, context) {
  // 解析 HTTP 请求
  const httpReq = parseHttpRequest(req);
  const { method, path } = httpReq;

  // CORS 预检
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
      isBase64Encoded: false,
    };
  }

  try {
    if (path === "/health" || path === "/healthz") {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ok",
          services: getServiceStatus(),
          timestamp: new Date().toISOString(),
        }),
      };
    }

    if (path === "/proxy" || path === "/") {
      return await handleProxy(httpReq);
    }

    return buildResponse(404, { error: "Not found" });
  } catch (e) {
    console.error("Handler error:", e.message);
    return buildResponse(500, { error: e.message });
  }
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
