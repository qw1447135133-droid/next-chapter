/**
 * ToolCallBlock – collapsible tool call / result display.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { ToolUseBlock, ToolResultBlock } from '@/lib/agent/types'

interface Props {
  toolUse: ToolUseBlock
  toolResult?: ToolResultBlock
}

export function ToolCallBlock({ toolUse, toolResult }: Props) {
  const [open, setOpen] = useState(false)
  const isError = toolResult?.is_error
  const isPending = !toolResult

  return (
    <div className="border rounded-lg text-xs my-1 overflow-hidden bg-muted/30">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
        ) : isError ? (
          <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
        )}
        <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="font-mono font-medium">{toolUse.name}</span>
        <span className="text-muted-foreground truncate">
          {Object.entries(toolUse.input)
            .slice(0, 2)
            .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 40)}`)
            .join(', ')}
        </span>
        <span className="ml-auto shrink-0">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t">
          <div>
            <p className="text-muted-foreground mt-2 mb-1 font-medium">Input</p>
            <pre className="bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(toolUse.input, null, 2)}
            </pre>
          </div>
          {toolResult && (
            <div>
              <p className={`mb-1 font-medium ${isError ? 'text-red-500' : 'text-muted-foreground'}`}>
                {isError ? 'Error' : 'Result'}
              </p>
              <pre className={`rounded p-2 overflow-x-auto whitespace-pre-wrap break-all ${
                isError ? 'bg-red-50 dark:bg-red-950' : 'bg-muted'
              }`}>
                {toolResult.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
