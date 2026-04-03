/**
 * TodoWriteTool – manage a structured task list.
 * Port of: hare/tools_impl/TodoWriteTool/
 * Pure in-memory, synced to React via CustomEvent.
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface Todo {
  content: string
  status: TodoStatus
  activeForm: string
}

// Module-level state (shared across all TodoWriteTool instances)
let currentTodos: Todo[] = []

export function getCurrentTodos(): Todo[] {
  return [...currentTodos]
}

function notifyTodoUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent:todos-updated', { detail: currentTodos }))
  }
}

export class TodoWriteTool extends ToolBase {
  readonly name = 'TodoWrite'
  readonly searchHint = 'Create and manage a structured task list'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The updated todo list',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Task description (imperative)' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
              activeForm: { type: 'string', description: 'Present continuous form (e.g. "Running tests")' },
            },
            required: ['content', 'status', 'activeForm'],
          },
        },
      },
      required: ['todos'],
    }
  }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const todos = args.todos as Todo[]
    currentTodos = todos
    notifyTodoUpdate()
    return { data: `Updated ${todos.length} todos` }
  }
}
