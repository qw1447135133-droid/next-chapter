/**
 * FileReadTool – read file contents with line numbering.
 * Port of: hare/tools_impl/FileReadTool/
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg'])

export class FileReadTool extends ToolBase {
  readonly name = 'Read'
  readonly aliases = ['FileRead']
  readonly searchHint = 'Read a file from the local filesystem'
  readonly maxResultSizeChars = 200_000

  inputSchema() {
    return {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to read' },
        offset: { type: 'number', description: 'Line number to start reading from (0-based)' },
        limit: { type: 'number', description: 'Max number of lines to read' },
      },
      required: ['file_path'],
    }
  }

  isReadOnly() { return true }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const filePath = args.file_path as string
    const offset = (args.offset as number) ?? 0
    const limit = args.limit as number | undefined

    const result = await window.electronAPI?.invoke('tool:execute', {
      toolName: 'FileRead',
      args: { filePath, offset, limit },
    })

    if (result?.error) throw new Error(result.error)
    return { data: result?.content ?? '' }
  }
}
