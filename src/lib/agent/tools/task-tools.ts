/**
 * TaskTools – persistent task management (create/update/list/cancel).
 * Port of: hare/tools_impl/TaskTools/
 *
 * More advanced than TodoWrite: tasks persist across sub-agents,
 * support output files and status tracking.
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Task {
  id: string
  prompt: string
  status: TaskStatus
  output?: string
  createdAt: number
  updatedAt: number
}

const tasks = new Map<string, Task>()

function notifyTaskUpdate() {
  window.dispatchEvent(new CustomEvent('agent:tasks-updated', { detail: [...tasks.values()] }))
}

export function getAllTasks(): Task[] {
  return [...tasks.values()]
}

export class TaskWriteTool extends ToolBase {
  readonly name = 'TaskOutput'
  readonly searchHint = 'Read output from a background task'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to retrieve output for' },
        block: { type: 'boolean', description: 'Wait for task completion (default true)' },
        timeout: { type: 'number', description: 'Max wait time in ms (default 30000)' },
      },
      required: ['task_id'],
    }
  }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const taskId = args.task_id as string
    const task = tasks.get(taskId)
    if (!task) return { data: `Task ${taskId} not found` }
    return { data: JSON.stringify(task, null, 2) }
  }
}

export class TaskStopTool extends ToolBase {
  readonly name = 'TaskStop'
  readonly searchHint = 'Stop a running background task'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to stop' },
      },
      required: ['task_id'],
    }
  }

  async call(
    args: Record<string, unknown>,
    _context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const taskId = args.task_id as string
    const task = tasks.get(taskId)
    if (!task) return { data: `Task ${taskId} not found` }
    task.status = 'cancelled'
    task.updatedAt = Date.now()
    notifyTaskUpdate()
    return { data: `Task ${taskId} cancelled` }
  }
}
