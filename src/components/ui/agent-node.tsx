import { memo, useCallback, useState } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Bot, ChevronDown, ChevronUp, GripVertical, Save } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AgentNodeData = {
  agentId: string
  name: string
  description: string
  instructionTemplate: string
  isDefault: boolean
  onPromptSave: (agentId: string, template: string) => Promise<void>
}

export type AgentNodeType = Node<AgentNodeData, 'agent'>

function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(data.instructionTemplate)
  const [saving, setSaving] = useState(false)
  const dirty = draft !== data.instructionTemplate

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await data.onPromptSave(data.agentId, draft)
    } finally {
      setSaving(false)
    }
  }, [data, draft, dirty, saving])

  return (
    <div
      className={cn(
        'w-[280px] rounded-lg border bg-popover text-popover-foreground shadow-md transition-[border-color] duration-120',
        selected ? 'border-primary/60' : 'border-border',
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
        <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{data.name}</p>
          {data.description ? (
            <p className="truncate text-[11px] text-muted-foreground">{data.description}</p>
          ) : null}
        </div>
        {data.isDefault ? (
          <span className="shrink-0 rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            default
          </span>
        ) : null}
      </div>

      {/* ── Prompt toggle ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <span>Prompt</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {/* ── Prompt editor (collapsible) ── */}
      {expanded ? (
        <div className="border-t border-border px-3 py-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            rows={6}
            className="nodrag nowheel w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] leading-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Instrucciones del agente..."
          />
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="nodrag inline-flex h-6 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className={cn('h-3 w-3', saving && 'animate-pulse')} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Handles ── */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-border !bg-muted"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-primary/50 !bg-primary/20"
      />
    </div>
  )
}

export default memo(AgentNode)
