/**
 * MCP type definitions.
 * Port of: hare/services/mcp/types.py
 */

export type McpTransport = 'stdio' | 'sse' | 'http' | 'websocket'

export interface McpServerConfig {
  name: string
  transport: McpTransport
  /** For stdio transport */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** For HTTP/SSE/WebSocket transport */
  url?: string
  /** Connection scope */
  scope?: 'user' | 'project' | 'local'
  enabled?: boolean
}

export interface McpTool {
  serverName: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpResource {
  serverName: string
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface McpServerState {
  config: McpServerConfig
  status: McpConnectionStatus
  tools: McpTool[]
  resources: McpResource[]
  error?: string
}
