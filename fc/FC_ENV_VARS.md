# FC 环境变量配置

新架构下，所有 AI API 端点和密钥存储在 FC 环境变量中，前端完全不感知。

## 必需的环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `GEMINI_API_KEY` | Gemini / 站狐代理 Key | sk-xxx |
| `GEMINI_ENDPOINT` | Gemini 端点 | http://202.90.21.53:13003/v1beta |
| `JIMENG_API_KEY` | 即梦 API Key | sk-xxx |
| `JIMENG_ENDPOINT` | 即梦端点 | http://202.90.21.53:13003/v1 |
| `VIDU_API_KEY` | Vidu API Key | sk-xxx |
| `VIDU_ENDPOINT` | Vidu 端点 | https://api.vidu.cn/ent/v2 |
| `KLING_API_KEY` | 可灵 API Key | sk-xxx |
| `KLING_ENDPOINT` | 可灵端点 | https://api.klingai.com |

## 配置方式

### 方式一：通过 s.yaml 部署时配置

在 `s.yaml` 的 `environmentVariables` 中直接配置：

```yaml
function:
  environmentVariables:
    GEMINI_API_KEY: "你的Gemini Key"
    GEMINI_ENDPOINT: "http://202.90.21.53:13003/v1beta"
    JIMENG_API_KEY: "你的即梦Key"
    JIMENG_ENDPOINT: "http://202.90.21.53:13003/v1"
    VIDU_API_KEY: "你的Vidu Key"
    VIDU_ENDPOINT: "https://api.vidu.cn/ent/v2"
    KLING_API_KEY: "你的可灵Key"
    KLING_ENDPOINT: "https://api.klingai.com"
```

### 方式二：直接在阿里云控制台配置

1. 登录阿里云控制台
2. 进入函数计算 → 服务详情 → 函数配置
3. 在环境变量中添加上述变量

## 架构说明

```
前端 (本地)          FC Gateway           AI 服务
    │                   │                   │
    │  POST /proxy      │                   │
    │  service=gemini   │                   │
    │  path=/v1/...     │                   │
    │───────────────────▶                   │
    │                   │  注入 Key + 端点   │
    │                   │──────────────────▶│
    │                   │◀──────────────────│
    │◀──────────────────│                   │
```

前端只需传 `service` + `path` + `body`，FC 自动注入对应的端点和密钥。
