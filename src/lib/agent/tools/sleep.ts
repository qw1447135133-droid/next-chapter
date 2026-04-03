/**
 * SleepTool – pause execution for N seconds.
 * Port of: hare/tools_impl/SleepTool/
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

const MAX_SLEEP_S = 300

export class SleepTool extends ToolBase {
  readonly name = 'Sleep'
  readonly searchHint = 'Wait for a specified number of seconds'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: `Seconds to sleep (max ${MAX_SLEEP_S})`,
        },
      },
      required: ['seconds'],
    }
  }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const seconds = Math.min((args.seconds as number) ?? 1, MAX_SLEEP_S)
    await new Promise(resolve => setTimeout(resolve, seconds * 1000))
    return { data: `Slept for ${seconds}s` }
  }
}
