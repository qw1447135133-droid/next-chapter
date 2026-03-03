

## Plan: Add `gemini-3-flash-preview` to model selection

### Change

**`src/components/workspace/ScriptInput.tsx`** (lines 8-14):
- Add `"gemini-3-flash-preview"` to the `DecomposeModel` type union
- Add a new entry `{ value: "gemini-3-flash-preview", label: "Gemini 3 Flash" }` to `DECOMPOSE_MODEL_OPTIONS`

Single-file, two-line change. No other files reference the `DecomposeModel` type in a way that needs updating — edge functions already accept arbitrary model strings.

