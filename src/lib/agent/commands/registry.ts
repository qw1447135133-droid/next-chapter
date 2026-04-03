/**
 * Slash command registry.
 * Port of: hare/commands.py
 */

export interface Command {
  name: string
  description: string
  aliases?: string[]
  /** 'local' = handled in UI; 'prompt' = sent as a special prompt to the agent */
  type: 'local' | 'prompt'
  /** For local commands: handler function */
  handler?: (args: string, context: CommandContext) => void | Promise<void>
  /** For prompt commands: the prompt template (use {{args}} placeholder) */
  promptTemplate?: string
}

export interface CommandContext {
  clearMessages: () => void
  setModel: (model: string) => void
  getModel: () => string
  getTotalCost: () => number
  getMessages: () => unknown[]
  sendMessage: (prompt: string) => void
}

const registry = new Map<string, Command>()

export function registerCommand(cmd: Command) {
  registry.set(cmd.name, cmd)
  for (const alias of cmd.aliases ?? []) {
    registry.set(alias, cmd)
  }
}

export function findCommand(name: string): Command | undefined {
  return registry.get(name)
}

export function getAllCommands(): Command[] {
  const seen = new Set<Command>()
  for (const cmd of registry.values()) seen.add(cmd)
  return [...seen]
}

/** Parse "/command args" → { name, args } */
export function parseSlashCommand(input: string): { name: string; args: string } | null {
  if (!input.startsWith('/')) return null
  const [rawName, ...rest] = input.slice(1).split(' ')
  return { name: rawName.toLowerCase(), args: rest.join(' ') }
}
