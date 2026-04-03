/**
 * GlobTool – find files by glob pattern.
 * Port of: hare/tools_impl/GlobTool/
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

export class GlobTool extends ToolBase {
  readonly name = 'Glob'
  readonly searchHint = 'Fast file pattern matching tool'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts"' },
        path: { type: 'string', description: 'Directory to search in (default: cwd)' },
      },
      required: ['pattern'],
    }
  }

  isReadOnly() { return true }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const result = await window.electronAPI?.invoke('tool:execute', {
      toolName: 'Glob',
      args: { pattern: args.pattern, path: args.path },
    })
    if (result?.error) throw new Error(result.error)
    return { data: (result?.files as string[])?.join('\n') ?? '' }
  }
}
