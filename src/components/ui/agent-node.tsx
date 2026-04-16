import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Bot, Brain, Wrench } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AgentNodeData = {
  agentId: string
  name: string
  description: string
  hasInstruction: boolean
  hasSkill: boolean
  toolsCount: number
  planner: boolean
  wikiContext: boolean
}

export type AgentNodeType = Node<AgentNodeData, 'agent'>

function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  return (
    <div
      className={cn(
        'w-[270px] rounded-lg border bg-popover text-popover-foreground shadow-md transition-[border-color] duration-120',
        selected ? 'border-primary/60' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{data.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{data.agentId}</p>
        </div>
      </div>

      <div className="space-y-2 px-3 py-2 text-[11px] text-muted-foreground">
        {data.description ? <p className="line-clamp-2">{data.description}</p> : null}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1">
            <Brain className="h-3.5 w-3.5" />
            {data.hasSkill ? 'Skill' : data.hasInstruction ? 'Instruction' : 'Sin source'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Wrench className="h-3.5 w-3.5" />
            {data.toolsCount} tools
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {data.planner ? (
            <span className="rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              planner
            </span>
          ) : null}
          {data.wikiContext ? (
            <span className="rounded-sm border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
              wiki_context
            </span>
          ) : null}
        </div>
      </div>

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
