import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Bot, Globe, Target } from 'lucide-react'

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
  llm: { label: 'LLM', color: 'text-blue-500', icon: Bot },
  consensus: { label: 'Consensus', color: 'text-emerald-500', icon: Target },
  api: { label: 'API', color: 'text-violet-500', icon: Globe },
}

function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  const meta = TYPE_META[data.type]
  const Icon = meta.icon
  const isApi = data.type === 'api'

  return (
    <div
      className={cn(
        'w-[260px] rounded-lg border bg-popover text-popover-foreground transition-[border-color] duration-120',
        selected ? 'border-primary/60' : 'border-border',
        isApi && 'border-violet-500/40',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icon className={cn('h-4 w-4 shrink-0', meta.color)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{data.name || data.agentId}</p>
          <p className="truncate text-[11px] text-muted-foreground">{data.agentId}</p>
        </div>
        <span className={cn('rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium', meta.color)}>
          {meta.label}
        </span>
      </div>

      <div className="space-y-2 px-3 py-2 text-[11px] text-muted-foreground">
        {data.type === 'llm' ? (
          <p className="line-clamp-2">{data.promptPreview}</p>
        ) : data.type === 'api' ? (
          <>
            <p className="line-clamp-2">{data.promptPreview}</p>
            <p className="text-[10px] text-violet-500/80">Click to see curl code</p>
          </>
        ) : (
          <p>Integrates {data.subAgentsCount} output_keys and produces the final response.</p>
        )}
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span>input</span>
          {!isApi && <span>output</span>}
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
