/**
 * GrepTool – search file contents with regex.
 * Port of: hare/tools_impl/GrepTool/
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

export class GrepTool extends ToolBase {
  readonly name = 'Grep'
  readonly searchHint = 'Search file contents using regex'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search in' },
        glob: { type: 'string', description: 'Glob pattern to filter files, e.g. "*.ts"' },
        output_mode: {
          type: 'string',
          enum: ['content', 'files_with_matches', 'count'],
          description: 'Output mode (default: files_with_matches)',
        },
        '-i': { type: 'boolean', description: 'Case insensitive search' },
        '-n': { type: 'boolean', description: 'Show line numbers' },
        context: { type: 'number', description: 'Lines of context around match' },
        head_limit: { type: 'number', description: 'Limit results to first N lines' },
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
      toolName: 'Grep',
      args,
    })
    if (result?.error) throw new Error(result.error)
    return { data: result?.output ?? '' }
  }
}
