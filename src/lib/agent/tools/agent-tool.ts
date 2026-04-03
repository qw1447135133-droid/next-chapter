/**
 * AgentTool – spawn a sub-agent (nested QueryEngine).
 * Port of: hare/tools_impl/AgentTool/
 */

import { ToolBase, type ToolUseContext, type CanUseToolFn } from '../tool'
import type { AssistantMessage, ToolResult } from '../types'
import { QueryEngine } from '../query-engine'

// Background task registry
const backgroundTasks = new Map<string, Promise<string>>()

export function getBackgroundTaskResult(id: string): Promise<string> | undefined {
  return backgroundTasks.get(id)
}

export class AgentTool extends ToolBase {
  readonly name = 'Agent'
  readonly searchHint = 'Launch a new agent to handle complex multi-step tasks'

  inputSchema() {
    return {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Task for the sub-agent' },
        description: { type: 'string', description: '3-5 word summary of what the agent will do' },
        subagent_type: {
          type: 'string',
          description: 'Type of agent (general-purpose, Explore, Plan, etc.)',
        },
        model: { type: 'string', description: 'Optional model override' },
        run_in_background: {
          type: 'boolean',
          description: 'Run in background; returns task ID immediately',
        },
      },
      required: ['prompt', 'description'],
    }
  }

  async call(
    args: Record<string, unknown>,
    context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
  ): Promise<ToolResult> {
    const prompt = args.prompt as string
    const model = (args.model as string) ?? context.options.model
    const runInBackground = (args.run_in_background as boolean) ?? false

    // Inherit API key from parent context options
    const apiKey = (context.options as Record<string, unknown>).apiKey as string
    const baseUrl = (context.options as Record<string, unknown>).baseUrl as string | undefined

    const subEngine = new QueryEngine({
      apiKey,
      baseUrl,
      model,
      tools: context.options.tools,
      systemPrompt: 'You are a sub-agent. Complete the assigned task and return a concise result.',
    })

    const runTask = async (): Promise<string> => {
      let result = ''
      for await (const msg of subEngine.submitMessage(prompt)) {
        if (msg.type === 'result' && msg.subtype === 'success') {
          result = msg.result ?? ''
        }
      }
      return result
    }

    if (runInBackground) {
      const taskId = crypto.randomUUID()
      backgroundTasks.set(taskId, runTask())
      return { data: `Background task started. Task ID: ${taskId}` }
    }

    const result = await runTask()
    return { data: result }
  }
}
