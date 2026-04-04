/**
 * MCPTool – execute tools on connected MCP servers.
 * Port of: hare/tools_impl/MCPTool/
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'
import { callMcpTool } from './client'
import { mcpRegistry } from './registry'

export class MCPTool extends ToolBase {
  readonly name = 'mcp'
  readonly searchHint = 'Execute tools on connected MCP servers'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        server_name: { type: 'string', description: 'Name of the MCP server' },
        tool_name: { type: 'string', description: 'Name of the tool to call' },
        arguments: { type: 'object', description: 'Arguments to pass to the tool' },
      },
      required: ['server_name', 'tool_name'],
    }
  }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const serverName = args.server_name as string
    const toolName = args.tool_name as string
    const toolArgs = (args.arguments as Record<string, unknown>) ?? {}

    const result = await callMcpTool(serverName, toolName, toolArgs)
    return { data: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }
  }
}

export class ListMcpResourcesTool extends ToolBase {
  readonly name = 'ListMcpResourcesTool'
  readonly searchHint = 'List available resources from connected MCP servers'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'Filter by server name (optional)' },
      },
    }
  }

  isReadOnly() { return true }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const filterServer = args.server as string | undefined
    const resources = filterServer
      ? (mcpRegistry.getServer(filterServer)?.resources ?? [])
      : mcpRegistry.getAllResources()
    return { data: JSON.stringify(resources, null, 2) }
  }
}

export class ReadMcpResourceTool extends ToolBase {
  readonly name = 'ReadMcpResourceTool'
  readonly searchHint = 'Read a specific resource from an MCP server'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'MCP server name' },
        uri: { type: 'string', description: 'Resource URI to read' },
      },
      required: ['server', 'uri'],
    }
  }

  isReadOnly() { return true }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const { readMcpResource } = await import('./client')
    const content = await readMcpResource(args.server as string, args.uri as string)
    return { data: content }
  }
}
