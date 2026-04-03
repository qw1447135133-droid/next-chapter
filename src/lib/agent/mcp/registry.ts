/**
 * MCP server registry – manages connected MCP servers.
 * Port of: hare/services/mcp/config.py (MCPCliState)
 */

import type { McpServerConfig, McpServerState, McpTool, McpResource } from './types'

class McpRegistry {
  private servers = new Map<string, McpServerState>()
  private listeners: Array<() => void> = []

  addServer(config: McpServerConfig) {
    this.servers.set(config.name, {
      config,
      status: 'disconnected',
      tools: [],
      resources: [],
    })
    this.notify()
  }

  removeServer(name: string) {
    this.servers.delete(name)
    this.notify()
  }

  updateServerState(name: string, patch: Partial<McpServerState>) {
    const state = this.servers.get(name)
    if (!state) return
    this.servers.set(name, { ...state, ...patch })
    this.notify()
  }

  getServer(name: string): McpServerState | undefined {
    return this.servers.get(name)
  }

  getAllServers(): McpServerState[] {
    return [...this.servers.values()]
  }

  getAllTools(): McpTool[] {
    return this.getAllServers().flatMap(s => s.tools)
  }

  getAllResources(): McpResource[] {
    return this.getAllServers().flatMap(s => s.resources)
  }

  onChange(listener: () => void) {
    this.listeners.push(listener)
    return () => { this.listeners = this.listeners.filter(l => l !== listener) }
  }

  private notify() {
    for (const listener of this.listeners) listener()
    window.dispatchEvent(new CustomEvent('agent:mcp-updated', { detail: this.getAllServers() }))
  }
}

export const mcpRegistry = new McpRegistry()
