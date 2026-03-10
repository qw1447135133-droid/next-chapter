

## Plan: Add Model Selector to Script Creator

Add a model selection dropdown to the ScriptCreator header, reusing the same model options and `localStorage` key (`decompose-model`) as the workspace.

### Changes

**`src/pages/ScriptCreator.tsx`**:
- Import `useState` for model state, add model dropdown UI in the header (between "新建项目" and settings button)
- Use same model options as ScriptInput: `gemini-3.1-pro-preview`, `gemini-3-pro-preview`, `gemini-3-pro-preview-thinking`, `gemini-3-flash-preview`
- Read/write from `localStorage("decompose-model")` so it stays in sync with workspace
- Use a simple `Select` component from the UI library
- No changes needed to step components since they already read from `localStorage("decompose-model")`

This is a single-file change. The step components (StepCreativePlan, StepCharacters, etc.) already read the model from `localStorage` so they will automatically pick up the selection.

