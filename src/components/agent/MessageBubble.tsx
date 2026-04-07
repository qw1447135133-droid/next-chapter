/**
 * MessageBubble – renders a single agent conversation message.
 */

import { Bot, User } from 'lucide-react'
import { ToolCallBlock } from './ToolCallBlock'
import type { AssistantMessage, UserMessage, ToolUseBlock, ToolResultBlock } from '@/lib/agent/types'

type Props = {
  message: AssistantMessage | UserMessage
  /** Pending tool calls (no result yet) for this assistant message */
  pendingToolUseIds?: Set<string>
  /** Map from tool_use_id → tool_result for this assistant message */
  toolResults?: Map<string, ToolResultBlock>
}

export function MessageBubble({ message, pendingToolUseIds, toolResults }: Props) {
  const isAssistant = message.type === 'assistant'
  const content = message.message.content

  if (typeof content === 'string') {
    return (
      <BubbleWrapper isAssistant={isAssistant}>
        <p className="whitespace-pre-wrap">{content}</p>
      </BubbleWrapper>
    )
  }

  // Filter out tool_result blocks from assistant messages (they are user messages)
  const displayBlocks = Array.isArray(content)
    ? content.filter(b => b.type !== 'tool_result' || !isAssistant)
    : []

  const hasVisibleContent = displayBlocks.some(
    b => b.type === 'text' || b.type === 'tool_use',
  )
  if (!hasVisibleContent) return null

  return (
    <BubbleWrapper isAssistant={isAssistant}>
      {displayBlocks.map((block, i) => {
        if (block.type === 'text') {
          return block.text ? (
            <p key={i} className="whitespace-pre-wrap">{block.text}</p>
          ) : null
        }

        if (block.type === 'tool_use') {
          const toolUse = block as ToolUseBlock
          const toolResult = toolResults?.get(toolUse.id)
          const isPending = !toolResult && pendingToolUseIds?.has(toolUse.id)
          return (
            <ToolCallBlock
              key={i}
              toolUse={toolUse}
              toolResult={isPending ? undefined : toolResult}
            />
          )
        }

        return null
      })}
    </BubbleWrapper>
  )
}

function BubbleWrapper({ isAssistant, children }: {
  isAssistant: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isAssistant
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground'
      }`}>
        {isAssistant
          ? <Bot className="w-4 h-4" />
          : <User className="w-4 h-4" />
        }
      </div>
      <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
        isAssistant
          ? 'bg-muted'
          : 'bg-primary text-primary-foreground'
      }`}>
        {children}
      </div>
    </div>
  )
}
