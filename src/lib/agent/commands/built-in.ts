/**
 * Built-in slash commands.
 * Port of: hare/commands.py (local commands section)
 */

import { registerCommand, type Command } from './registry'

export function registerBuiltinCommands() {
  const commands: Command[] = [
    {
      name: 'clear',
      description: 'Clear the conversation history',
      aliases: ['c'],
      type: 'local',
      handler: (_args, ctx) => ctx.clearMessages(),
    },
    {
      name: 'help',
      description: 'Show available commands',
      aliases: ['h', '?'],
      type: 'local',
      handler: (_args, ctx) => {
        const { getAllCommands } = require('./registry')
        const lines = getAllCommands()
          .map((cmd: Command) => `/${cmd.name} — ${cmd.description}`)
          .join('\n')
        ctx.sendMessage(`Available commands:\n${lines}`)
      },
    },
    {
      name: 'model',
      description: 'Switch the model (e.g. /model claude-opus-4-6)',
      type: 'local',
      handler: (args, ctx) => {
        if (!args.trim()) {
          ctx.sendMessage(`Current model: ${ctx.getModel()}`)
          return
        }
        ctx.setModel(args.trim())
        ctx.sendMessage(`Model switched to: ${args.trim()}`)
      },
    },
    {
      name: 'cost',
      description: 'Show total API cost for this session',
      type: 'local',
      handler: (_args, ctx) => {
        ctx.sendMessage(`Total cost: $${ctx.getTotalCost().toFixed(6)} USD`)
      },
    },
    {
      name: 'compact',
      description: 'Summarize and compact the conversation context',
      type: 'prompt',
      promptTemplate: 'Please summarize the conversation so far into a concise context summary, then continue as normal. {{args}}',
    },
    {
      name: 'diff',
      description: 'Show recent file changes (runs git diff)',
      type: 'prompt',
      promptTemplate: 'Run `git diff` and show me a summary of the recent changes. {{args}}',
    },
    {
      name: 'review',
      description: 'Review recent code changes',
      type: 'prompt',
      promptTemplate: 'Review the recent code changes for bugs, issues, and improvements. {{args}}',
    },
    {
      name: 'init',
      description: 'Initialize a CLAUDE.md for this project',
      type: 'prompt',
      promptTemplate: 'Analyze this project and create a CLAUDE.md file with project overview, key commands, and coding conventions. {{args}}',
    },
    {
      name: 'status',
      description: 'Show session status (model, turns, cost)',
      type: 'local',
      handler: (_args, ctx) => {
        ctx.sendMessage(
          `Model: ${ctx.getModel()}\nMessages: ${ctx.getMessages().length}\nCost: $${ctx.getTotalCost().toFixed(6)}`
        )
      },
    },
  ]

  for (const cmd of commands) registerCommand(cmd)
}
