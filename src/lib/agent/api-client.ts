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

type ModelApiBridgePayload = {
  url: string
  apiKey: string
  requestParams: Record<string, unknown>
}

function canUseElectronModelBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI?.invoke === 'function'
}

async function invokeElectronModelBridge(payload: ModelApiBridgePayload): Promise<Anthropic.Message> {
  const response = await window.electronAPI!.invoke('agent:callModelApi', payload) as
    | { ok: true; data: Anthropic.Message }
    | { ok: false; error: string }

  if (!response?.ok) {
    throw new Error(response?.error || 'Electron model bridge failed')
  }

  return response.data
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

  const requestUrl = buildMessagesApiUrl(baseUrl)
  const parsed = canUseElectronModelBridge()
    ? await invokeElectronModelBridge({
        url: requestUrl,
        apiKey,
        requestParams,
      })
    : await (async () => {
        const response = await fetch(requestUrl, {
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

        return await response.json() as Anthropic.Message
      })()

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

/** Streaming version: yields text deltas then the final AssistantMessage */
export async function* callModelAPIStream(opts: CallModelOptions): AsyncGenerator<{ type: 'delta'; text: string } | { type: 'message'; message: AssistantMessage }> {
  const { messages, systemPrompt, model, tools, thinkingConfig, maxTokens, apiKey, baseUrl } = opts

  const effectiveMaxTokens = maxTokens ?? getMaxOutputTokens(model)
  const systemBlock = buildSystemBlocks(systemPrompt)
  const toolsParam = tools.length > 0 ? buildToolsParam(tools) : undefined

  const requestParams = {
    model,
    max_tokens: effectiveMaxTokens,
    stream: true,
    messages,
    ...(systemBlock ? { system: systemBlock } : {}),
    ...(toolsParam ? { tools: toolsParam } : {}),
    ...(thinkingConfig ? { thinking: thinkingConfig as Anthropic.ThinkingConfigParam } : {}),
  }

  const requestUrl = buildMessagesApiUrl(baseUrl)

  // Electron bridge: use streaming IPC handler
  if (canUseElectronModelBridge()) {
    const streamId = Math.random().toString(36).slice(2)
    const electronAPI = window.electronAPI as Record<string, unknown>
    const onFn = electronAPI.on as ((channel: string, listener: (...args: unknown[]) => void) => void) | undefined
    const offFn = electronAPI.off as ((channel: string, listener: (...args: unknown[]) => void) => void) | undefined

    if (onFn && offFn) {
      // Use streaming IPC
      const deltaQueue: string[] = []
      let resolveNext: (() => void) | null = null
      let done = false

      const listener = (...args: unknown[]) => {
        const payload = args[0] as { streamId: string; delta: string }
        if (payload.streamId !== streamId) return
        deltaQueue.push(payload.delta)
        resolveNext?.()
        resolveNext = null
      }

      onFn('agent:stream-delta', listener)

      // Start the streaming request (non-blocking)
      const invokePromise = window.electronAPI!.invoke('agent:callModelApiStream', {
        url: requestUrl,
        apiKey,
        requestParams: { ...requestParams, stream: false }, // main process adds stream:true
        streamId,
      }) as Promise<{ ok: boolean; data?: Anthropic.Message; error?: string }>

      invokePromise.then(() => {
        done = true
        resolveNext?.()
        resolveNext = null
      }).catch(() => {
        done = true
        resolveNext?.()
        resolveNext = null
      })

      // Yield deltas as they arrive
      while (true) {
        if (deltaQueue.length > 0) {
          yield { type: 'delta', text: deltaQueue.shift()! }
        } else if (done) {
          break
        } else {
          await new Promise<void>((resolve) => { resolveNext = resolve })
        }
      }

      offFn('agent:stream-delta', listener)

      // Yield final message
      const result = await invokePromise
      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Electron streaming bridge failed')
      }
      const parsed = result.data
      const contentBlocks: ContentBlock[] = parsed.content.map(block => {
        if (block.type === 'text') return { type: 'text', text: block.text }
        if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> }
        if (block.type === 'thinking') return { type: 'thinking', thinking: (block as { thinking: string }).thinking }
        return { type: 'text', text: '' }
      })
      yield {
        type: 'message',
        message: {
          type: 'assistant',
          uuid: uuidv4(),
          message: {
            role: 'assistant',
            content: contentBlocks,
            model: parsed.model,
            stop_reason: parsed.stop_reason ?? 'end_turn',
            usage: { input_tokens: parsed.usage.input_tokens, output_tokens: parsed.usage.output_tokens },
          },
        },
      }
      return
    }

    // Fallback: no on/off support, use non-streaming
    const msg = await callModelAPI(opts)
    const text = msg.message.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')
    if (text) yield { type: 'delta', text }
    yield { type: 'message', message: msg }
    return
  }

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestParams),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Model ${model} failed (${response.status}): ${text.slice(0, 300) || response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let accText = ''
  const contentBlocks: ContentBlock[] = []
  let inputTokens = 0
  let outputTokens = 0
  let stopReason = 'end_turn'
  let currentToolUse: { id: string; name: string; inputJson: string } | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        let event: Record<string, unknown>
        try { event = JSON.parse(data) } catch { continue }

        const type = event.type as string
        if (type === 'content_block_start') {
          const block = event.content_block as Record<string, unknown>
          if (block?.type === 'tool_use') {
            currentToolUse = { id: block.id as string, name: block.name as string, inputJson: '' }
          }
        } else if (type === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown>
          if (delta?.type === 'text_delta') {
            const chunk = delta.text as string
            accText += chunk
            yield { type: 'delta', text: chunk }
          } else if (delta?.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.inputJson += delta.partial_json as string
          }
        } else if (type === 'content_block_stop') {
          if (currentToolUse) {
            let input: Record<string, unknown> = {}
            try { input = JSON.parse(currentToolUse.inputJson) } catch { /* ignore */ }
            contentBlocks.push({ type: 'tool_use', id: currentToolUse.id, name: currentToolUse.name, input })
            currentToolUse = null
          }
        } else if (type === 'message_delta') {
          const delta = event.delta as Record<string, unknown>
          if (delta?.stop_reason) stopReason = delta.stop_reason as string
          const usage = event.usage as Record<string, number> | undefined
          if (usage?.output_tokens) outputTokens = usage.output_tokens
        } else if (type === 'message_start') {
          const msg = event.message as Record<string, unknown>
          const usage = msg?.usage as Record<string, number> | undefined
          if (usage?.input_tokens) inputTokens = usage.input_tokens
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (accText) contentBlocks.unshift({ type: 'text', text: accText })

  yield {
    type: 'message',
    message: {
      type: 'assistant',
      uuid: uuidv4(),
      message: {
        role: 'assistant',
        content: contentBlocks,
        model,
        stop_reason: stopReason,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
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
