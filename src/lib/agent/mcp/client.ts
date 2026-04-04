/**
 * MCP client – connects to MCP servers via Electron IPC.
 * Port of: hare/services/mcp/
 *
 * The actual MCP server process runs in the Electron main process.
 * This client communicates with it via IPC.
 */

import type { McpServerConfig, McpTool, McpResource } from './types'
import { mcpRegistry } from './registry'

export async function connectMcpServer(config: McpServerConfig): Promise<void> {
  mcpRegistry.updateServerState(config.name, { status: 'connecting' })

  const result = await window.electronAPI?.invoke('mcp:connect', { config })

  if (result?.error) {
    mcpRegistry.updateServerState(config.name, {
      status: 'error',
      error: result.error,
    })
    throw new Error(result.error)
  }

  mcpRegistry.updateServerState(config.name, {
    status: 'connected',
    tools: result?.tools ?? [],
    resources: result?.resources ?? [],
  })
}

export async function disconnectMcpServer(name: string): Promise<void> {
  await window.electronAPI?.invoke('mcp:disconnect', { name })
  mcpRegistry.updateServerState(name, { status: 'disconnected', tools: [], resources: [] })
}

export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await window.electronAPI?.invoke('mcp:call-tool', {
    serverName,
    toolName,
    args,
  })
  if (result?.error) throw new Error(result.error)
  return result?.content
}

export async function readMcpResource(
  serverName: string,
  uri: string,
): Promise<string> {
  const result = await window.electronAPI?.invoke('mcp:read-resource', { serverName, uri })
  if (result?.error) throw new Error(result.error)
  return result?.content ?? ''
}

/** Load MCP server configs from settings and connect */
export async function initMcpFromSettings(): Promise<void> {
  const result = await window.electronAPI?.invoke('tool:execute', {
    toolName: 'Config',
    args: { action: 'get', key: 'mcp.servers' },
  })
  const configs: McpServerConfig[] = JSON.parse(result?.content ?? '[]') ?? []
  for (const config of configs) {
    mcpRegistry.addServer(config)
    if (config.enabled !== false) {
      connectMcpServer(config).catch(console.error)
    }
  }
}
