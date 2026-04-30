import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { ArrowRight, Bot, Globe, Target } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AgentNodeData = {
  agentId: string
  name: string
  type: 'llm' | 'consensus' | 'api'
  promptPreview: string
  subAgentsCount: number
}

export type AgentNodeType = Node<AgentNodeData, 'agent'>

const TYPE_META: Record<AgentNodeData['type'], { label: string; color: string; icon: typeof Bot }> = {
  llm: { label: 'LLM', color: 'blue', icon: Bot },
  consensus: { label: 'Consensus', color: 'emerald', icon: Target },
  api: { label: 'API', color: 'violet', icon: Globe },
}

const colorClasses: Record<string, string> = {
  blue: 'border-blue-400/40 bg-blue-400/10 text-blue-400',
  emerald: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400',
  violet: 'border-violet-400/40 bg-violet-400/10 text-violet-400',
}

function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  const meta = TYPE_META[data.type]
  const Icon = meta.icon
  const isApi = data.type === 'api'
  const colorClass = colorClasses[meta.color]

  return (
    <div className="relative" style={{ width: 220 }}>
      <div
        className={cn(
          'group/node relative w-full overflow-hidden rounded-xl border p-3 backdrop-blur transition-all hover:shadow-lg bg-background/70',
          colorClass,
          selected && 'ring-2 ring-primary/50 shadow-xl',
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.04] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/node:opacity-100" />

        <div className="relative space-y-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background/80 backdrop-blur',
                colorClass,
              )}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="mb-0.5 inline-block rounded-full border border-border/40 bg-background/80 px-1.5 py-0 text-[9px] uppercase tracking-[0.15em] text-foreground/60">
                {meta.label}
              </span>
              <p className="truncate text-xs font-semibold tracking-tight text-foreground">
                {data.name || data.agentId}
              </p>
            </div>
          </div>

          <p className="line-clamp-2 text-[10px] leading-relaxed text-foreground/70">
            {data.type === 'consensus'
              ? `Integrates ${data.subAgentsCount} outputs → final response`
              : data.promptPreview}
          </p>

          <div className="flex items-center gap-1.5 text-[10px] text-foreground/50">
            <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
            <span className="uppercase tracking-[0.1em]">{isApi ? 'API endpoint' : 'Connected'}</span>
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={isApi ? Position.Top : Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-border !bg-muted"
      />
      {!isApi && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !rounded-full !border-2 !border-primary/50 !bg-primary/20"
        />
      )}
    </div>
  )
}

export default memo(AgentNode)
