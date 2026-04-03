/**
 * ConfigTool – read and write agent configuration.
 * Port of: hare/tools_impl/ConfigTool/
 * Uses localStorage for persistence.
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

const STORAGE_KEY = 'agent:config'

function loadConfig(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveConfig(cfg: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

export class ConfigTool extends ToolBase {
  readonly name = 'Config'
  readonly searchHint = 'Read and write agent configuration settings'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'list', 'delete'],
          description: 'Action to perform',
        },
        key: { type: 'string', description: 'Config key (dot-separated path)' },
        value: { description: 'Value to set (for action=set)' },
      },
      required: ['action'],
    }
  }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const cfg = loadConfig()
    const action = args.action as string
    const key = args.key as string | undefined

    switch (action) {
      case 'list':
        return { data: JSON.stringify(cfg, null, 2) }

      case 'get':
        if (!key) throw new Error('key is required for action=get')
        return { data: JSON.stringify(getNestedKey(cfg, key) ?? null) }

      case 'set': {
        if (!key) throw new Error('key is required for action=set')
        setNestedKey(cfg, key, args.value)
        saveConfig(cfg)
        return { data: `Config key "${key}" set` }
      }

      case 'delete': {
        if (!key) throw new Error('key is required for action=delete')
        deleteNestedKey(cfg, key)
        saveConfig(cfg)
        return { data: `Config key "${key}" deleted` }
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }
}

function getNestedKey(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, k) => {
    if (cur && typeof cur === 'object') return (cur as Record<string, unknown>)[k]
    return undefined
  }, obj)
}

function setNestedKey(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object') cur[keys[i]] = {}
    cur = cur[keys[i]] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
}

function deleteNestedKey(obj: Record<string, unknown>, path: string) {
  const keys = path.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object') return
    cur = cur[keys[i]] as Record<string, unknown>
  }
  delete cur[keys[keys.length - 1]]
}
