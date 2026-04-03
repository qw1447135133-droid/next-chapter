/**
 * All built-in tools – registration and factory.
 */

import { FileReadTool } from './file-read'
import { FileWriteTool } from './file-write'
import { FileEditTool } from './file-edit'
import { GlobTool } from './glob'
import { GrepTool } from './grep'
import { BashTool } from './bash'
import { WebFetchTool } from './web-fetch'
import { TodoWriteTool } from './todo-write'
import { AskUserQuestionTool } from './ask-user-question'
import { SleepTool } from './sleep'
import { ConfigTool } from './config'
import { AgentTool } from './agent-tool'
import { TaskWriteTool, TaskStopTool } from './task-tools'
import { SendMessageTool } from './send-message'
import { StudioWorkflowTool } from './studio-workflow'
import type { Tool } from '../tool'

export {
  FileReadTool,
  FileWriteTool,
  FileEditTool,
  GlobTool,
  GrepTool,
  BashTool,
  WebFetchTool,
  TodoWriteTool,
  AskUserQuestionTool,
  SleepTool,
  ConfigTool,
  AgentTool,
  TaskWriteTool,
  TaskStopTool,
  SendMessageTool,
  StudioWorkflowTool,
}

export { getCurrentTodos } from './todo-write'
export type { Todo, TodoStatus } from './todo-write'
export { resolveAskUserQuestion, rejectAskUserQuestion } from './ask-user-question'
export type { AskUserQuestionRequest } from './ask-user-question'
export { getAllTasks } from './task-tools'
export type { Task, TaskStatus } from './task-tools'

/** Create a default set of all built-in tools */
export function createDefaultTools(): Tool[] {
  return [
    new FileReadTool(),
    new FileWriteTool(),
    new FileEditTool(),
    new GlobTool(),
    new GrepTool(),
    new BashTool(),
    new WebFetchTool(),
    new TodoWriteTool(),
    new AskUserQuestionTool(),
    new SleepTool(),
    new ConfigTool(),
    new AgentTool(),
    new TaskWriteTool(),
    new TaskStopTool(),
    new SendMessageTool(),
    new StudioWorkflowTool(),
  ]
}
