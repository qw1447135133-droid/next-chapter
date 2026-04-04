/**
 * FileWriteTool – write/create files.
 * Port of: hare/tools_impl/FileWriteTool/
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

export class FileWriteTool extends ToolBase {
  readonly name = 'Write'
  readonly aliases = ['FileWrite']
  readonly searchHint = 'Write a file to the local filesystem'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to write to' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['file_path', 'content'],
    }
  }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const result = await window.electronAPI?.invoke('tool:execute', {
      toolName: 'FileWrite',
      args: { filePath: args.file_path, content: args.content },
    })
    if (result?.error) throw new Error(result.error)
    return { data: `File written: ${args.file_path}` }
  }
}
