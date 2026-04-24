export type AgentTraceStatus = 'idle' | 'running' | 'completed' | 'error'

export type AgentTraceStep = {
  node_id: string
  round?: number | null
  runtime_id: string
}

export type AgentTraceNode = {
  id: string
  label: string
  kind: 'participant' | 'finalizer'
  order: number
  output_key: string
  runtime_ids?: string[]
}

export type AgentTraceEdge = {
  id: string
  source: string
  target: string
  label: string
  kind: 'context' | 'finalize'
}

export type AgentTracePayload = {
  version: string
  status: AgentTraceStatus
  current_round: number
  total_rounds: number
  active_node_id?: string | null
  active_step?: AgentTraceStep | null
  active_path: string[]
  completed_node_ids: string[]
  visited_steps: AgentTraceStep[]
  nodes: AgentTraceNode[]
  edges: AgentTraceEdge[]
}