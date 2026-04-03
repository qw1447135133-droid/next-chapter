/**
 * PermissionDialog – legacy fallback for AskUserQuestion outside the homepage shell.
 */

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  resolveAskUserQuestion,
  rejectAskUserQuestion,
  type AskUserQuestionRequest,
} from '@/lib/agent/tools/ask-user-question'

export function PermissionDialog() {
  const [request, setRequest] = useState<AskUserQuestionRequest | null>(null)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const handler = (e: Event) => {
      const req = (e as CustomEvent<AskUserQuestionRequest>).detail
      setRequest(req)
      // Init answers
      const init: Record<string, string[]> = {}
      for (const q of req.questions) init[q.question] = []
      setAnswers(init)
    }
    window.addEventListener('agent:ask-user-question', handler)
    return () => window.removeEventListener('agent:ask-user-question', handler)
  }, [])

  function handleSubmit() {
    if (!request) return
    const result = Object.entries(answers)
      .map(([q, a]) => `${q}: ${a.join(', ')}`)
      .join('\n')
    resolveAskUserQuestion(request.id, result)
    setRequest(null)
  }

  function handleCancel() {
    if (!request) return
    rejectAskUserQuestion(request.id)
    setRequest(null)
  }

  if (!request) return null

  return (
    <Dialog open onOpenChange={open => { if (!open) handleCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agent needs your input</DialogTitle>
          <DialogDescription>
            Please answer the following question(s) to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {request.questions.map(q => (
            <div key={q.question} className="space-y-2">
              <p className="text-sm font-medium">{q.question}</p>
              {q.multiSelect ? (
                <div className="space-y-1.5">
                  {q.options.map(opt => (
                    <div key={opt.label} className="flex items-start gap-2">
                      <Checkbox
                        id={`${q.question}-${opt.label}`}
                        checked={answers[q.question]?.includes(opt.label)}
                        onCheckedChange={checked => {
                          setAnswers(prev => ({
                            ...prev,
                            [q.question]: checked
                              ? [...(prev[q.question] ?? []), opt.label]
                              : (prev[q.question] ?? []).filter(a => a !== opt.label),
                          }))
                        }}
                      />
                      <Label htmlFor={`${q.question}-${opt.label}`} className="text-sm leading-tight cursor-pointer">
                        <span className="font-medium">{opt.label}</span>
                        {opt.description && (
                          <span className="text-muted-foreground ml-1">— {opt.description}</span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <RadioGroup
                  value={answers[q.question]?.[0] ?? ''}
                  onValueChange={val => setAnswers(prev => ({ ...prev, [q.question]: [val] }))}
                  className="space-y-1.5"
                >
                  {q.options.map(opt => (
                    <div key={opt.label} className="flex items-start gap-2">
                      <RadioGroupItem value={opt.label} id={`${q.question}-${opt.label}`} className="mt-0.5" />
                      <Label htmlFor={`${q.question}-${opt.label}`} className="text-sm leading-tight cursor-pointer">
                        <span className="font-medium">{opt.label}</span>
                        {opt.description && (
                          <span className="text-muted-foreground ml-1">— {opt.description}</span>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={request.questions.some(q => !answers[q.question]?.length)}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
