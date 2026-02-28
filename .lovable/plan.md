
## Problem

The "generate-storyboard" edge function successfully calls the Gemini API (HTTP 200), but fails to extract the generated image from the response. The error "AI 未返回分镜图" occurs because the code only looks for `part.inlineData` in the response, but the API may return images in alternative formats (e.g., `fileData`, a URL field, or as a markdown image link in text).

There is no debug logging of the actual API response, making it impossible to diagnose the exact format mismatch.

## Solution

### 1. Add debug logging for the Gemini API response structure

In `supabase/functions/generate-storyboard/index.ts`, after parsing the JSON response (line 419), log the structure of the response parts so we can see exactly what the API returns:

```typescript
const data = await response.json();
const responseParts = data.candidates?.[0]?.content?.parts;
// Debug: log what the API actually returned
console.log("[DEBUG] Gemini response keys:", JSON.stringify(Object.keys(data)));
console.log("[DEBUG] Gemini candidates count:", data.candidates?.length);
if (responseParts) {
  console.log("[DEBUG] Response parts count:", responseParts.length);
  for (let i = 0; i < responseParts.length; i++) {
    const keys = Object.keys(responseParts[i]);
    console.log(`[DEBUG] Part ${i} keys:`, keys, 
      keys.includes("text") ? `text: ${responseParts[i].text?.slice(0, 200)}` : "",
      keys.includes("fileData") ? `fileData mime: ${responseParts[i].fileData?.mimeType}` : "");
  }
} else {
  console.log("[DEBUG] No response parts found. Full response (truncated):", JSON.stringify(data).slice(0, 500));
}
```

### 2. Handle alternative image response formats

Extend the image extraction logic to handle multiple formats:

- **`part.inlineData`** (current) -- base64 image data directly in the response
- **`part.fileData`** -- some Gemini API versions return a `fileUri` that needs to be fetched
- **Markdown image URL in `part.text`** -- the API sometimes returns `![...](url)` in text; extract and fetch the image
- **Plain URL in `part.text`** -- detect and fetch direct image URLs from text parts

```typescript
// After existing inlineData check, add fallback handlers:

// Fallback 1: fileData (Gemini file URI)
if (!imageBase64 && responseParts) {
  for (const part of responseParts) {
    if (part.fileData?.fileUri) {
      const fetched = await fetchImageAsBase64(part.fileData.fileUri);
      if (fetched) {
        mimeType = fetched.mimeType;
        imageBase64 = fetched.data;
        break;
      }
    }
  }
}

// Fallback 2: Markdown image link or plain URL in text
if (!imageBase64 && responseParts) {
  for (const part of responseParts) {
    if (part.text) {
      const mdMatch = part.text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      const urlMatch = mdMatch?.[1] || part.text.match(/(https?:\/\/\S+\.(?:png|jpg|jpeg|webp))/i)?.[1];
      if (urlMatch) {
        const fetched = await fetchImageAsBase64(urlMatch);
        if (fetched) {
          mimeType = fetched.mimeType;
          imageBase64 = fetched.data;
          break;
        }
      }
    }
  }
}
```

### 3. Apply the same fix to generate-character and generate-scene

The `generate-character/index.ts` (lines 171-181) and `generate-scene/index.ts` have the same vulnerable pattern -- only checking `part.inlineData`. Apply the same fallback handlers to both functions for consistency.

### Files to modify:
- `supabase/functions/generate-storyboard/index.ts` -- add debug logging + fallback image extraction
- `supabase/functions/generate-character/index.ts` -- add fallback image extraction
- `supabase/functions/generate-scene/index.ts` -- add fallback image extraction

### Expected outcome:
- If `inlineData` is present, behavior is unchanged
- If the API returns images in alternative formats, they will now be correctly extracted
- Debug logs will reveal the exact response structure for future troubleshooting
