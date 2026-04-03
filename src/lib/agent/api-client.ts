/**
 * Anthropic-compatible API client for the homepage agent.
 *
 * Uses a minimal fetch implementation instead of the official SDK so
 * browser-side Claude-compatible gateways can pass CORS preflight.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import type { Tool } from './tool'
import type { AssistantMessage, ContentBlock, UsageStats } from './types'

const MAX_OUTPUT_TOKENS_DEFAULT = 16384
const MAX_OUTPUT_TOKENS_THINKING = 32768

function getMaxOutputTokens(model: string): number {
  return model.toLowerCase().includes('opus')
    ? MAX_OUTPUT_TOKENS_THINKING
    : MAX_OUTPUT_TOKENS_DEFAULT
}

function buildSystemBlocks(
  systemPrompt: string[],
): string | Anthropic.TextBlockParam[] {
  if (systemPrompt.length === 0) return ''
  if (systemPrompt.length === 1) return systemPrompt[0]
  return systemPrompt.map(s => ({ type: 'text' as const, text: s }))
}

function buildToolsParam(tools: Tool[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.searchHint ?? t.name,
    input_schema: t.inputSchema() as Anthropic.Tool.InputSchema,
  }))
}

function buildMessagesApiUrl(baseUrl?: string): string {
  const root = String(baseUrl || 'https://api.anthropic.com')
    .replace(/\/v1beta(\/.*)?$/i, '')
    .replace(/\/v1(\/.*)?$/i, '')
    .replace(/\/+$/i, '')
  return `${root}/v1/messages`
}

export interface CallModelOptions {
  messages: Anthropic.MessageParam[]
  systemPrompt: string[]
  model: string
  tools: Tool[]
  thinkingConfig?: Record<string, unknown>
  maxTokens?: number
  apiKey: string
  baseUrl?: string
}

export async function callModelAPI(opts: CallModelOptions): Promise<AssistantMessage> {
  const {
    messages,
    systemPrompt,
    model,
    tools,
    thinkingConfig,
    maxTokens,
    apiKey,
    baseUrl,
  } = opts

  const effectiveMaxTokens = maxTokens ?? getMaxOutputTokens(model)
  const systemBlock = buildSystemBlocks(systemPrompt)
  const toolsParam = tools.length > 0 ? buildToolsParam(tools) : undefined

  const requestParams = {
    model,
    max_tokens: effectiveMaxTokens,
    messages,
    ...(systemBlock ? { system: systemBlock } : {}),
    ...(toolsParam ? { tools: toolsParam } : {}),
    ...(thinkingConfig ? { thinking: thinkingConfig as Anthropic.ThinkingConfigParam } : {}),
  }

  const response = await fetch(buildMessagesApiUrl(baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestParams),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Model ${model} failed (${response.status}): ${text.slice(0, 300) || response.statusText}`,
    )
  }

  const parsed = await response.json() as Anthropic.Message

  const contentBlocks: ContentBlock[] = parsed.content.map(block => {
    if (block.type === 'text') return { type: 'text', text: block.text }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      }
    }
    if (block.type === 'thinking') {
      return { type: 'thinking', thinking: block.thinking }
    }
    return { type: 'text', text: '' }
  })

  const usage: UsageStats = {
    inputTokens: parsed.usage.input_tokens,
    outputTokens: parsed.usage.output_tokens,
    cacheCreationInputTokens: (parsed.usage as Record<string, number>).cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: (parsed.usage as Record<string, number>).cache_read_input_tokens ?? 0,
  }

  return {
    type: 'assistant',
    uuid: uuidv4(),
    message: {
      role: 'assistant',
      content: contentBlocks,
      model: parsed.model,
      stop_reason: parsed.stop_reason ?? 'end_turn',
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_creation_input_tokens: usage.cacheCreationInputTokens,
        cache_read_input_tokens: usage.cacheReadInputTokens,
      },
    },
  }
}

/** Convert internal messages to Anthropic API format */
export function toAPIMessages(messages: import('./types').Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = []

  for (const msg of messages) {
    if (msg.type === 'user' || msg.type === 'assistant') {
      const content = msg.message.content
      if (typeof content === 'string') {
        result.push({ role: msg.message.role, content })
      } else {
        const blocks = content.filter(b => b.type !== 'thinking')
        if (blocks.length > 0) {
          result.push({
            role: msg.message.role,
            content: blocks as Anthropic.ContentBlockParam[],
          })
        }
      }
    }
  }

  return result
}
