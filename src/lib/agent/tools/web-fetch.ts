/**
 * WebFetchTool – fetch a URL and return its content as markdown.
 * Port of: hare/tools_impl/WebFetchTool/
 * Runs entirely in renderer (uses fetch API).
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

export class WebFetchTool extends ToolBase {
  readonly name = 'WebFetch'
  readonly searchHint = 'Fetch content from a URL'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        prompt: { type: 'string', description: 'What information to extract from the page' },
      },
      required: ['url', 'prompt'],
    }
  }

  isReadOnly() { return true }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const url = args.url as string

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Claude/1.0)' },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    let text: string

    if (contentType.includes('text/html')) {
      const html = await response.text()
      // Strip script/style tags and convert to plain text
      text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, '\n')
        .trim()
    } else {
      text = await response.text()
    }

    // Truncate to reasonable size
    if (text.length > 50_000) text = text.slice(0, 50_000) + '\n... (truncated)'
    return { data: text }
  }
}
