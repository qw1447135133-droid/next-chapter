
## Problem

When you select a thinking model (e.g., "Gemini 3 Pro Thinking") for script decomposition, the same model is passed to character and scene description generation. These description tasks don't need deep reasoning, but the thinking model wastes time on internal deliberation, causing 290s timeouts and returning no results.

## Solution

Add a `thinkingBudget` limit to the `generate-character-description` and `generate-scene-description` edge functions when a thinking model is detected. This caps how long the model can "think" before generating output.

## Changes

### 1. `supabase/functions/generate-character-description/index.ts`
- Detect if the model name contains "thinking"
- If so, add `thinkingConfig: { thinkingBudget: 2048 }` to the `generationConfig` payload, limiting deliberation tokens
- This ensures the model responds within the timeout window

### 2. `supabase/functions/generate-scene-description/index.ts`
- Apply the same `thinkingBudget` limit for thinking models

### Technical Detail

The Gemini API supports a `generationConfig.thinkingConfig.thinkingBudget` parameter that limits the number of tokens the model can use for internal reasoning. Setting it to 2048 tokens is sufficient for description generation while preventing runaway thinking that causes timeouts.

```text
Request body addition when model contains "thinking":
{
  generationConfig: {
    thinkingConfig: { thinkingBudget: 2048 }
  }
}
```
