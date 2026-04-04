/**
 * SendMessageTool – send a message to another agent instance.
 * Port of: hare/tools_impl/SendMessageTool/
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

// Message queue keyed by agent name
const messageQueues = new Map<string, string[]>()

export function receiveMessages(agentName: string): string[] {
  const msgs = messageQueues.get(agentName) ?? []
  messageQueues.delete(agentName)
  return msgs
}

export class SendMessageTool extends ToolBase {
  readonly name = 'SendMessage'
  readonly searchHint = 'Send a message to another agent'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Target agent name or ID' },
        message: { type: 'string', description: 'Message content' },
      },
      required: ['to', 'message'],
    }
  }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const to = args.to as string
    const message = args.message as string

    const queue = messageQueues.get(to) ?? []
    queue.push(message)
    messageQueues.set(to, queue)

    return { data: `Message sent to "${to}"` }
  }
}
