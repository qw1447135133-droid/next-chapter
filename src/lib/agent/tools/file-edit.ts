/**
 * FileEditTool – search and replace within a file.
 * Port of: hare/tools_impl/FileEditTool/
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

export class FileEditTool extends ToolBase {
  readonly name = 'Edit'
  readonly aliases = ['FileEdit']
  readonly searchHint = 'Perform exact string replacements in files'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit' },
        old_string: { type: 'string', description: 'Text to replace' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    }
  }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const result = await window.electronAPI?.invoke('tool:execute', {
      toolName: 'FileEdit',
      args: {
        filePath: args.file_path,
        oldString: args.old_string,
        newString: args.new_string,
        replaceAll: args.replace_all ?? false,
      },
    })
    if (result?.error) throw new Error(result.error)
    return { data: result?.message ?? `File edited: ${args.file_path}` }
  }
}
