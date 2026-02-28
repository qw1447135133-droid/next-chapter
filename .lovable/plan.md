

## 修复剧本拆解报错

### 问题原因

上次为解决模型返回思考文本而非 JSON 的问题，添加了 `thinkingConfig: { thinkingBudget: 0 }`。但 `gemini-3.1-pro-preview` 模型**强制要求思考模式**，设置为 0 会直接返回 400 错误。

### 解决方案

**文件：`supabase/functions/script-decompose/index.ts`**

1. **移除 `thinkingBudget: 0`**，改为设置一个较小的思考预算（如 `thinkingBudget: 1024`），让模型正常运行但不过度思考。

2. **过滤思考内容**：由于模型可能在 `parts` 中返回 `thought: true` 的思考部分，解析响应时需要跳过思考 parts，只提取实际输出文本。具体逻辑：
   - 遍历 `candidates[0].content.parts`
   - 跳过 `thought === true` 的部分
   - 只拼接非思考部分的 `text`

### 技术细节

```text
修改前（第216行）：
  thinkingConfig: { thinkingBudget: 0 }

修改后：
  thinkingConfig: { thinkingBudget: 1024 }

修改前（第257行）：
  const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

修改后：
  // 过滤掉 thought parts，只取实际输出
  const parts = geminiData?.candidates?.[0]?.content?.parts || [];
  const textContent = parts
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text || "")
    .join("");
```

修改完成后重新部署 `script-decompose` 函数。

