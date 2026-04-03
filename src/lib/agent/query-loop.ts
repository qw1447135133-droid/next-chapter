/**
 * Query loop – the core model-calling and tool-execution state machine.
 * Port of: hare/query/__init__.py
 *
 * Yields Message events as the model responds and tools are executed.
 */

import { v4 as uuidv4 } from 'uuid'
import { callModelAPI, toAPIMessages } from './api-client'
import { withRetry } from './retry'
import { findToolByName, type CanUseToolFn, type Tool, type ToolUseContext } from './tool'
import type {
  AssistantMessage,
  Message,
  RequestStartEvent,
  ToolResultBlock,
  UserMessage,
} from './types'

export interface QueryParams {
  messages: Message[]
  systemPrompt: string[]
  canUseTool?: CanUseToolFn
  toolUseContext: ToolUseContext
  maxTurns?: number
  apiKey: string
  baseUrl?: string
}

interface LoopState {
  messages: Message[]
  turnCount: number
}

export async function* queryLoop(
  params: QueryParams,
): AsyncGenerator<Message | RequestStartEvent> {
  const { systemPrompt, canUseTool, toolUseContext, maxTurns, apiKey, baseUrl } = params
  const model = toolUseContext.options.model
  const tools = toolUseContext.options.tools

  const state: LoopState = {
    messages: [...params.messages],
    turnCount: 1,
  }

  while (true) {
    // Abort check
    if (toolUseContext.abortSignal?.aborted) return

    yield { type: 'stream_request_start' } satisfies RequestStartEvent

    // Prepare API messages (only user/assistant types)
    const apiMessages = toAPIMessages(state.messages)

    // Call the model (with retry)
    let assistantMsg: AssistantMessage
    try {
      assistantMsg = await withRetry(() =>
        callModelAPI({
          messages: apiMessages,
          systemPrompt,
          model,
          tools,
          thinkingConfig: toolUseContext.options.thinkingConfig,
          apiKey,
          baseUrl,
        }),
      )
    } catch (err) {
      const errorMsg: AssistantMessage = {
        type: 'assistant',
        uuid: uuidv4(),
        isApiErrorMessage: true,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: String(err) }],
          stop_reason: 'end_turn',
        },
      }
      yield errorMsg
      return
    }

    state.messages.push(assistantMsg)
    yield assistantMsg

    // Abort check after response
    if (toolUseContext.abortSignal?.aborted) return

    // Find tool_use blocks
    const content = assistantMsg.message.content
    const toolUseBlocks =
      Array.isArray(content)
        ? content.filter(b => b.type === 'tool_use')
        : []

    if (toolUseBlocks.length === 0) {
      // No tools called – end of conversation turn
      return
    }

    // Execute each tool and collect results
    const toolResultBlocks: ToolResultBlock[] = []

    for (const block of toolUseBlocks) {
      if (block.type !== 'tool_use') continue
      const { id: toolUseId, name: toolName, input } = block
      const toolInput = input as Record<string, unknown>

      const tool = findToolByName(tools, toolName)

      if (!tool) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: `Tool "${toolName}" not found`,
          is_error: true,
        })
        continue
      }

      // Permission check
      if (canUseTool) {
        const perm = await canUseTool(
          tool,
          toolInput,
          toolUseContext,
          assistantMsg,
          toolUseId,
        )
        if (perm.behavior === 'deny') {
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: (perm as { behavior: 'deny'; message?: string }).message ?? 'Permission denied',
            is_error: true,
          })
          continue
        }
      }

      // Execute tool
      try {
        const result = await tool.call(
          toolInput,
          toolUseContext,
          canUseTool ?? defaultAllowAll,
          assistantMsg,
        )

        const resultBlock = tool.mapToolResultToBlock(result.data, toolUseId) as ToolResultBlock
        toolResultBlocks.push(resultBlock)

        // Apply context modifier
        if (result.contextModifier) {
          Object.assign(toolUseContext, result.contextModifier(toolUseContext))
        }
      } catch (err) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: `Error: ${String(err)}`,
          is_error: true,
        })
      }

      // Abort check during tool execution
      if (toolUseContext.abortSignal?.aborted) return
    }

    // Build user message with tool results
    const toolResultMsg: UserMessage = {
      type: 'user',
      uuid: uuidv4(),
      message: {
        role: 'user',
        content: toolResultBlocks,
      },
      sourceToolAssistantUuid: assistantMsg.uuid,
    }

    state.messages.push(toolResultMsg)
    yield toolResultMsg

    // Check max turns
    state.turnCount++
    if (maxTurns != null && state.turnCount > maxTurns) {
      return
    }
  }
}

async function defaultAllowAll(
  _tool: Tool,
  _input: Record<string, unknown>,
): Promise<import('./types').PermissionResult> {
  return { behavior: 'allow' }
}
