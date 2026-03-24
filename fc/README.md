# Infinio API Gateway

阿里云函数计算（FC）API 网关，前端完全不感知 AI 服务地址和密钥。

## 架构说明

```
┌──────────────┐         ┌─────────────────┐         ┌────────────────────┐
│   前端应用    │ ──────▶ │   阿里云 FC      │ ──────▶ │   AI 服务 API      │
│  (本地 Electron)│◀────── │  (API Gateway)  │◀───────│  Gemini/Seedance   │
│              │         │                 │         │  Vidu/Kling        │
│  只配 FC 地址  │         │  注：端点+密钥   │         │                    │
└──────────────┘         └─────────────────┘         └────────────────────┘
```

前端只需配置 FC 代理地址，所有 API 端点和密钥由 FC 环境变量管理。

## 支持的服务

| 服务 | 说明 | 认证方式 |
|------|------|---------|
| gemini | Gemini / 站狐代理 | Bearer |
| jimeng | 即梦 | Bearer |
| vidu | Vidu | Token |
| kling | 可灵 | Bearer |

## 快速开始

### 1. 安装 Serverless Devs

```bash
npm install -g @serverless-devs/s
```

### 2. 配置阿里云 AccessKey

```bash
s config add
```

按提示输入：
- Account ID: 你的阿里云账号 ID
- AccessKey ID: 你的 AccessKey ID
- AccessKey Secret: 你的 AccessKey Secret
- region: cn-hangzhou

### 3. 配置环境变量

编辑 `s.yaml`，在 `environmentVariables` 中填入你的密钥：

```yaml
environmentVariables:
  # Gemini (站狐代理)
  GEMINI_API_KEY: "你的 Gemini API Key"
  GEMINI_ENDPOINT: "http://202.90.21.53:13003/v1beta"
  # Jimeng (即梦)
  JIMENG_API_KEY: "你的即梦 API Key"
  JIMENG_ENDPOINT: "http://202.90.21.53:13003/v1"
  # Vidu
  VIDU_API_KEY: "你的 Vidu API Key"
  VIDU_ENDPOINT: "https://api.vidu.cn/ent/v2"
  # Kling (可灵)
  KLING_API_KEY: "你的可灵 API Key"
  KLING_ENDPOINT: "https://api.klingai.com"
```

### 4. 部署

```bash
cd fc
s deploy
```

部署成功后会输出类似：
```
触发器名称: http-trigger
URL: https://infinio-api-gateway.cn-hangzhou.fc.aliyuncs.com/2016-08-15/proxy/infinio-api-gateway/api-handler/
```

### 5. 前端配置

在 Infinio 前端的「设置」→「网络模式」中选择「阿里云 FC」，
填入 FC 代理地址（上面的 URL），即可使用。

## API 接口

### 健康检查

```bash
curl https://你的FC地址/health
```

响应：
```json
{
  "status": "ok",
  "services": {
    "gemini": { "configured": true, "endpoint": "..." },
    "jimeng": { "configured": true, "endpoint": "..." },
    "vidu": { "configured": false, "endpoint": "..." },
    "kling": { "configured": false, "endpoint": "..." }
  },
  "timestamp": "2026-03-24T00:00:00.000Z"
}
```

### 代理请求

**推荐方式：只传 service + path + body**

```bash
curl -X POST https://你的FC地址/proxy \
  -H "Content-Type: application/json" \
  -H "x-service: gemini" \
  -d '{
    "path": "/v1beta/models/gemini-2.0-flash:generateContent",
    "body": {
      "contents": [{"role": "user", "parts": [{"text": "Hello"}]}]
    }
  }'
```

前端会自动从完整 URL 中提取 path，发往 FC 后，FC 根据 service 注入对应的端点和密钥。

### 兼容旧格式

FC 也兼容旧的 url 格式：

```bash
curl -X POST https://你的FC地址/proxy \
  -H "Content-Type: application/json" \
  -d '{
    "service": "gemini",
    "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    "body": {
      "contents": [{"role": "user", "parts": [{"text": "Hello"}]}]
    }
  }'
```

## 环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| GEMINI_API_KEY | Gemini / 站狐代理 Key | sk-xxx |
| GEMINI_ENDPOINT | Gemini 端点 | http://202.90.21.53:13003/v1beta |
| JIMENG_API_KEY | 即梦 API Key | sk-xxx |
| JIMENG_ENDPOINT | 即梦端点 | http://202.90.21.53:13003/v1 |
| VIDU_API_KEY | Vidu API Key | sk-xxx |
| VIDU_ENDPOINT | Vidu 端点 | https://api.vidu.cn/ent/v2 |
| KLING_API_KEY | 可灵 API Key | sk-xxx |
| KLING_ENDPOINT | 可灵端点 | https://api.klingai.com |

## 特性

- 所有 API 端点和密钥存储在 FC 环境变量中
- 前端完全不感知密钥，无法查看或修改
- 自动根据 service 参数注入对应的端点和密钥
- CORS 跨域处理，浏览器可直接调用
- 5xx 错误自动重试（最多 3 次）
- 健康检查端点，查看各服务配置状态

## 常见问题

### Q: 如何更新密钥？
A: 在阿里云控制台 → 函数计算 → 服务详情 → 函数配置 → 环境变量中修改，
或更新 `s.yaml` 后重新 `s deploy`。

### Q: 如何查看日志？
A: 使用 `s logs` 命令或在 FC 控制台查看。

### Q: 前端是否还能配置密钥？
A: FC 模式下前端无法配置密钥，密钥完全由 FC 管理。如果需要本地配置密钥，
可以切换到 Supabase 代理模式或直连模式。
