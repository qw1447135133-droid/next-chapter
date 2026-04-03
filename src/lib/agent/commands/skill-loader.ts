/**
 * Skill loader – load .md skill files as prompt-based slash commands.
 * Port of: hare/commands.py (skill loading section)
 *
 * Scans the .claude/skills/ directory for .md files and registers
 * each as a /skill-name prompt command.
 */

import { registerCommand } from './registry'

export async function loadSkillCommands(): Promise<number> {
  if (!window.electronAPI?.invoke) return 0

  const result = await window.electronAPI.invoke('tool:execute', {
    toolName: 'Glob',
    args: { pattern: '.claude/skills/**/*.md', path: process.cwd?.() },
  })

  if (!result?.files) return 0

  let loaded = 0
  for (const filePath of result.files as string[]) {
    const nameMatch = filePath.match(/([^/\\]+)\.md$/)
    if (!nameMatch) continue
    const skillName = nameMatch[1].toLowerCase().replace(/[^a-z0-9-]/g, '-')

    const readResult = await window.electronAPI.invoke('tool:execute', {
      toolName: 'FileRead',
      args: { filePath, offset: 0 },
    })

    const content = readResult?.content as string ?? ''
    if (!content) continue

    // Extract description from first line of the file
    const firstLine = content.split('\n').find(l => l.trim()) ?? skillName

    registerCommand({
      name: skillName,
      description: firstLine.replace(/^#\s*/, '').trim(),
      type: 'prompt',
      promptTemplate: content + '\n\n{{args}}',
    })
    loaded++
  }

  return loaded
}
