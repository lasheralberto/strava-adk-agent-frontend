import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  AlertTriangle,
  Bot,
  GitBranch,
  Layers,
  Plus,
  RefreshCw,
  Repeat,
  Save,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

import { cn } from '@/lib/utils'
import AgentNode, { type AgentNodeData } from '@/components/ui/agent-node'

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
const internalPipelineToken = (import.meta.env.VITE_INTERNAL_PIPELINE_TOKEN ?? '').trim()

const MAX_AGENTS = 10

const RESERVED_AGENT_IDS = new Set([
  'intent_router',
  'plan_react_planner',
  'strava_ingestion_agent',
  'query_agent',
  'answer_agent',
  'orchestrator',
  'wiki_research_chat',
])

const AGENT_TYPES = ['llm', 'sequential', 'parallel', 'loop', 'custom'] as const
type AgentType = (typeof AGENT_TYPES)[number]

const AGENT_TYPE_META: Record<AgentType, { label: string; icon: typeof Bot; color: string }> = {
  llm: { label: 'LLM', icon: Bot, color: 'text-blue-500' },
  sequential: { label: 'Sequential', icon: Layers, color: 'text-amber-500' },
  parallel: { label: 'Parallel', icon: Zap, color: 'text-green-500' },
  loop: { label: 'Loop', icon: Repeat, color: 'text-cyan-500' },
  custom: { label: 'Custom', icon: Wrench, color: 'text-pink-500' },
}

const MODEL_OPTIONS = [
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gemini/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
] as const

type AgentDefinitionResponse = {
  athlete_id: string
  toml_content: string
  version: number
  is_default: boolean
  updated_at: string | null
}

type AgentEntry = {
  id: string
  name: string
  type: AgentType
  model: string
  description: string
  prompt: string
  custom_type: string
  sub_agents: string[]
  output_key: string
  order: number
}

type DesignerDefinition = {
  system: { entrypoint: 'orchestrator' }
  agents: AgentEntry[]
}

type Props = {
  isDark: boolean
  athleteId: number | null
  selectedAgentId: string
  onAgentChange: (agentId: string) => void
}

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...base }
  if (internalPipelineToken) headers['X-Internal-Token'] = internalPipelineToken
  return headers
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeAgentType(value: string): AgentType {
  const lower = value.trim().toLowerCase()
  const aliases: Record<string, AgentType> = {
    llm: 'llm',
    llmagent: 'llm',
    sequential: 'sequential',
    sequentialagent: 'sequential',
    parallel: 'parallel',
    parallelagent: 'parallel',
    loop: 'loop',
    loopagent: 'loop',
    custom: 'custom',
    customagent: 'custom',
  }
  const normalized = aliases[lower] ?? lower
  if (AGENT_TYPES.includes(normalized as AgentType)) return normalized as AgentType
  return 'llm'
}

function normalizeAgentId(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  return normalized || fallback
}

function promptPreview(prompt: string, maxLen = 60): string {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (!compact) return 'Sin prompt'
  if (compact.length <= maxLen) return compact
  return `${compact.slice(0, maxLen - 3)}...`
}

function readPromptValue(candidate: Record<string, unknown>): string {
  const prompt = asString(candidate.prompt)
  if (prompt) return prompt

  const instruction = asString(candidate.instruction)
  if (instruction) return instruction

  return asString(candidate.instructions)
}

function parseNamedTableEntries(table: unknown, defaultType: AgentType, orderOffset = 0): AgentEntry[] {
  if (!isRecord(table)) return []

  const entries: AgentEntry[] = []
  const tableEntries = Object.entries(table)

  for (let i = 0; i < tableEntries.length; i++) {
    const [tableId, candidate] = tableEntries[i]
    if (!isRecord(candidate)) continue

    const fallbackId = `agent_${orderOffset + i + 1}`
    const id = normalizeAgentId(asString(candidate.id, tableId), fallbackId)
    const rawSubAgents = Array.isArray(candidate.sub_agents) ? candidate.sub_agents : []
    const subAgents = rawSubAgents.map((s) => String(s).trim()).filter(Boolean)

    entries.push({
      id,
      name: asString(candidate.name, tableId || id),
      type: normalizeAgentType(asString(candidate.type, defaultType)),
      model: asString(candidate.model),
      description: asString(candidate.description),
      prompt: readPromptValue(candidate),
      custom_type: asString(candidate.custom_type) || asString(candidate.custom_class),
      sub_agents: subAgents,
      output_key: asString(candidate.output_key),
      order: asNumber(candidate.order, orderOffset + i + 1),
    })
  }

  return entries
}

// ---------------------------------------------------------------------------
// TOML ↔ definition
// ---------------------------------------------------------------------------

function parseTomlDefinition(tomlContent: string): DesignerDefinition {
  const parsed = parseToml(tomlContent)
  const root = isRecord(parsed) ? parsed : {}

  const system: DesignerDefinition['system'] = { entrypoint: 'orchestrator' }

  const agents: AgentEntry[] = []

  // v3 format: [[agents]] with type
  const rawAgents = Array.isArray(root.agents) ? root.agents : []
  for (let i = 0; i < rawAgents.length; i++) {
    const candidate = rawAgents[i]
    if (!isRecord(candidate)) continue
    const fallbackId = `agent_${i + 1}`
    const id = normalizeAgentId(asString(candidate.id), fallbackId)

    const rawSubAgents = Array.isArray(candidate.sub_agents) ? candidate.sub_agents : []
    const subAgents = rawSubAgents.map((s) => String(s).trim()).filter(Boolean)

    agents.push({
      id,
      name: asString(candidate.name, id),
      type: normalizeAgentType(asString(candidate.type, 'llm')),
      model: asString(candidate.model),
      description: asString(candidate.description),
      prompt: readPromptValue(candidate),
      custom_type: asString(candidate.custom_type) || asString(candidate.custom_class),
      sub_agents: subAgents,
      output_key: asString(candidate.output_key),
      order: asNumber(candidate.order, i + 1),
    })
  }

  // v3 compatibility: [agents.<id>] and [workflow.<id>] tables
  if (agents.length === 0) {
    const namedAgents = parseNamedTableEntries(root.agents, 'llm')
    const namedWorkflow = parseNamedTableEntries(root.workflow, 'sequential', namedAgents.length)
    agents.push(...namedAgents, ...namedWorkflow)
  } else {
    const workflowEntries = parseNamedTableEntries(root.workflow, 'sequential', agents.length)
    agents.push(...workflowEntries)
  }

  // v2 fallback: [[prompt_agents]]
  if (agents.length === 0) {
    const rawPromptAgents = Array.isArray(root.prompt_agents) ? root.prompt_agents : []
    for (let i = 0; i < rawPromptAgents.length; i++) {
      const candidate = rawPromptAgents[i]
      if (!isRecord(candidate)) continue
      const fallbackId = `agent_${i + 1}`
      const id = normalizeAgentId(asString(candidate.id), fallbackId)
      agents.push({
        id,
        name: asString(candidate.name, id),
        type: 'llm',
        model: asString(candidate.model),
        description: '',
        prompt: readPromptValue(candidate),
        custom_type: '',
        sub_agents: [],
        output_key: '',
        order: asNumber(candidate.order, i + 1),
      })
    }
  }

  // Legacy fallback: [[agents]] with instruction
  if (agents.length === 0) {
    const rawLegacy = Array.isArray(root.agents) ? root.agents : []
    for (let i = 0; i < rawLegacy.length; i++) {
      const candidate = rawLegacy[i]
      if (!isRecord(candidate)) continue
      const instruction = asString(candidate.instruction)
      if (!instruction.trim()) continue
      const fallbackId = `agent_${i + 1}`
      const id = normalizeAgentId(asString(candidate.id), fallbackId)
      if (RESERVED_AGENT_IDS.has(id)) continue
      agents.push({
        id,
        name: asString(candidate.name, id),
        type: 'llm',
        model: '',
        description: '',
        prompt: instruction,
        custom_type: '',
        sub_agents: [],
        output_key: '',
        order: agents.length + 1,
      })
    }
  }

  if (agents.length === 0) {
    agents.push(emptyAgent('agent_1', 1))
  }

  return {
    system,
    agents: agents.sort((a, b) => a.order - b.order),
  }
}

function definitionToToml(definition: DesignerDefinition): string {
  const agents = definition.agents.map((item, index) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    model: item.model || '',
    description: item.description || '',
    prompt: item.prompt || '',
    custom_type: item.custom_type || '',
    sub_agents: item.sub_agents,
    output_key: item.output_key || '',
    order: index + 1,
  }))

  return stringifyToml({
    system: { entrypoint: 'orchestrator' },
    agents,
  })
}

function emptyAgent(id: string, order: number): AgentEntry {
  return {
    id,
    name: id,
    type: 'llm',
    model: '',
    description: '',
    prompt: '',
    custom_type: '',
    sub_agents: [],
    output_key: '',
    order,
  }
}

function nextAgentId(existingIds: string[]): string {
  const existing = new Set(existingIds)
  let index = 1
  while (existing.has(`agent_${index}`)) index += 1
  return `agent_${index}`
}

// ---------------------------------------------------------------------------
// Topology helpers
// ---------------------------------------------------------------------------

type TopoNode = { id: string; name: string; type: AgentType; children: string[]; depth: number }
type FlowNode = Node<AgentNodeData, 'agent'>

const flowNodeTypes = { agent: AgentNode }

function extractPromptVariables(prompt: string): string[] {
  const found = new Set<string>()
  const regex = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
  let match: RegExpExecArray | null = regex.exec(prompt)
  while (match) {
    if (match[1]) found.add(match[1])
    match = regex.exec(prompt)
  }
  return Array.from(found)
}

function wouldCreateCycle(sourceId: string, targetId: string, agents: AgentEntry[]): boolean {
  if (sourceId === targetId) return true
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]))
  const stack = [targetId]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current)) continue
    visited.add(current)
    if (current === sourceId) return true

    const node = agentMap.get(current)
    if (!node) continue
    for (const childId of node.sub_agents) {
      stack.push(childId)
    }
  }

  return false
}

function buildTopology(agents: AgentEntry[]): TopoNode[] {
  const agentMap = new Map(agents.map((a) => [a.id, a]))
  const referencedAsChild = new Set(agents.flatMap((a) => a.sub_agents))

  // Root agents = not referenced as sub_agent by anyone
  const roots = agents.filter((a) => !referencedAsChild.has(a.id))

  const result: TopoNode[] = []
  const visited = new Set<string>()

  function walk(id: string, depth: number) {
    if (visited.has(id)) return
    visited.add(id)
    const agent = agentMap.get(id)
    if (!agent) return
    result.push({ id: agent.id, name: agent.name, type: agent.type, children: agent.sub_agents, depth })
    for (const childId of agent.sub_agents) {
      walk(childId, depth + 1)
    }
  }

  for (const root of roots) walk(root.id, 0)

  // Orphans (in case of cycles or disconnected)
  for (const agent of agents) {
    if (!visited.has(agent.id)) {
      result.push({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        children: agent.sub_agents,
        depth: 0,
      })
    }
  }

  return result
}

function buildFlowGraph(agents: AgentEntry[]): { nodes: FlowNode[]; edges: Edge[] } {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]))

  const depths = new Map<string, number>()
  for (const agent of agents) {
    depths.set(agent.id, 0)
  }

  // Relax depth assignment across links to place children to the right.
  for (let i = 0; i < agents.length; i++) {
    let changed = false
    for (const agent of agents) {
      const parentDepth = depths.get(agent.id) ?? 0
      for (const childId of agent.sub_agents) {
        if (!agentById.has(childId)) continue
        const currentDepth = depths.get(childId) ?? 0
        const nextDepth = parentDepth + 1
        if (nextDepth > currentDepth) {
          depths.set(childId, nextDepth)
          changed = true
        }
      }
    }
    if (!changed) break
  }

  const depthGroups = new Map<number, AgentEntry[]>()
  for (const agent of agents) {
    const depth = depths.get(agent.id) ?? 0
    const group = depthGroups.get(depth) ?? []
    group.push(agent)
    depthGroups.set(depth, group)
  }

  const nodes: FlowNode[] = []
  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b)
  for (const depth of sortedDepths) {
    const group = depthGroups.get(depth) ?? []
    group.sort((a, b) => a.order - b.order)
    for (let row = 0; row < group.length; row++) {
      const agent = group[row]
      nodes.push({
        id: agent.id,
        type: 'agent',
        position: { x: depth * 300, y: row * 150 },
        data: {
          agentId: agent.id,
          name: agent.name,
          type: agent.type,
          promptPreview: promptPreview(agent.prompt, 90),
          subAgentsCount: agent.sub_agents.length,
        },
      })
    }
  }

  const edges: Edge[] = []
  const structuralPairs = new Set<string>()
  for (const agent of agents) {
    for (const childId of agent.sub_agents) {
      if (!agentById.has(childId)) continue
      structuralPairs.add(`${agent.id}__${childId}`)
      edges.push({
        id: `struct__${agent.id}__${childId}`,
        source: agent.id,
        target: childId,
        type: 'smoothstep',
        label: 'flow',
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.6 },
        labelStyle: { fill: 'hsl(var(--muted-foreground))', fontSize: 10 },
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: agent.type === 'loop',
      })
    }
  }

  const outputKeyProducers = new Map<string, string[]>()
  for (const agent of agents) {
    const key = agent.output_key.trim()
    if (!key) continue
    const current = outputKeyProducers.get(key) ?? []
    current.push(agent.id)
    outputKeyProducers.set(key, current)
  }

  const dataPairs = new Map<string, Set<string>>()
  for (const consumer of agents) {
    const variables = extractPromptVariables(consumer.prompt)
    for (const variable of variables) {
      const producers = outputKeyProducers.get(variable) ?? []
      for (const producerId of producers) {
        if (producerId === consumer.id) continue
        const pairKey = `${producerId}__${consumer.id}`
        const current = dataPairs.get(pairKey) ?? new Set<string>()
        current.add(variable)
        dataPairs.set(pairKey, current)
      }
    }
  }

  for (const [pairKey, vars] of dataPairs.entries()) {
    const [sourceId, targetId] = pairKey.split('__')
    if (!sourceId || !targetId || !agentById.has(sourceId) || !agentById.has(targetId)) continue

    const variableLabel = Array.from(vars).sort().join(', ')
    edges.push({
      id: `data__${sourceId}__${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'bezier',
      label: variableLabel,
      style: {
        stroke: structuralPairs.has(pairKey) ? 'hsl(var(--warning))' : 'hsl(var(--success))',
        strokeDasharray: '5 4',
      },
      labelStyle: { fill: 'hsl(var(--muted-foreground))', fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: true,
    })
  }

  return { nodes, edges }
}

function getAncestors(agentId: string, agents: AgentEntry[]): Set<string> {
  const ancestors = new Set<string>()
  function findParents(targetId: string) {
    for (const agent of agents) {
      if (agent.sub_agents.includes(targetId) && !ancestors.has(agent.id)) {
        ancestors.add(agent.id)
        findParents(agent.id)
      }
    }
  }
  findParents(agentId)
  return ancestors
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomizableAgentsPanel({ isDark, athleteId, selectedAgentId, onAgentChange }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [restoringDefault, setRestoringDefault] = useState(false)

  const [version, setVersion] = useState(0)
  const [isDefaultDefinition, setIsDefaultDefinition] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [definition, setDefinition] = useState<DesignerDefinition>({
    system: { entrypoint: 'orchestrator' },
    agents: [emptyAgent('agent_1', 1)],
  })

  const [activeAgentId, setActiveAgentId] = useState(selectedAgentId)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const canAddAgent = definition.agents.length < MAX_AGENTS

  const orderedAgents = useMemo(
    () => [...definition.agents].sort((a, b) => a.order - b.order),
    [definition.agents],
  )

  const activeAgent = orderedAgents.find((a) => a.id === activeAgentId) ?? null

  const topology = useMemo(() => buildTopology(orderedAgents), [orderedAgents])
  const flowGraph = useMemo(() => buildFlowGraph(orderedAgents), [orderedAgents])

  const setActiveAndNotify = useCallback(
    (agentId: string) => {
      setActiveAgentId(agentId)
      onAgentChange(agentId)
    },
    [onAgentChange],
  )

  // ── Fetch ──────────────────────────────────────────────────────────

  const fetchDefinition = useCallback(async () => {
    if (!apiBaseUrl || athleteId === null || athleteId <= 0) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${apiBaseUrl}/agent-definition/${athleteId}`, {
        headers: authHeaders(),
      })

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string; details?: string }
        throw new Error(payload.error || payload.details || `HTTP ${res.status}`)
      }

      const payload = (await res.json()) as AgentDefinitionResponse
      const parsed = parseTomlDefinition(payload.toml_content)

      setVersion(typeof payload.version === 'number' ? payload.version : 0)
      setIsDefaultDefinition(Boolean(payload.is_default))
      setDefinition(parsed)

      const preferred = parsed.agents.some((a) => a.id === selectedAgentId)
        ? selectedAgentId
        : parsed.agents[0]?.id ?? ''

      if (preferred) setActiveAndNotify(preferred)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la definición.')
    } finally {
      setLoading(false)
    }
  }, [athleteId, selectedAgentId, setActiveAndNotify])

  useEffect(() => {
    if (open) fetchDefinition()
  }, [open, fetchDefinition])

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) triggerRef.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (definition.agents.some((a) => a.id === selectedAgentId)) {
      setActiveAgentId(selectedAgentId)
    }
  }, [definition.agents, selectedAgentId])

  // ── Mutations ──────────────────────────────────────────────────────

  const updateAgent = useCallback((agentId: string, patch: Partial<AgentEntry>) => {
    setDefinition((cur) => ({
      ...cur,
      agents: cur.agents.map((a) => (a.id === agentId ? { ...a, ...patch } : a)),
    }))
  }, [])

  const handleConnectNodes = useCallback((connection: Connection) => {
    const sourceId = connection.source?.trim()
    const targetId = connection.target?.trim()
    if (!sourceId || !targetId) return

    const outcomeRef: { current: 'added' | 'exists' | 'cycle' | 'invalid' } = { current: 'invalid' }

    setDefinition((cur) => {
      const sourceAgent = cur.agents.find((a) => a.id === sourceId)
      const targetAgent = cur.agents.find((a) => a.id === targetId)
      if (!sourceAgent || !targetAgent) {
        outcomeRef.current = 'invalid'
        return cur
      }

      if (sourceAgent.sub_agents.includes(targetId)) {
        outcomeRef.current = 'exists'
        return cur
      }

      if (wouldCreateCycle(sourceId, targetId, cur.agents)) {
        outcomeRef.current = 'cycle'
        return cur
      }

      outcomeRef.current = 'added'
      return {
        ...cur,
        agents: cur.agents.map((agent) => {
          if (agent.id !== sourceId) return agent
          return {
            ...agent,
            sub_agents: [...agent.sub_agents, targetId],
          }
        }),
      }
    })

    const outcome = outcomeRef.current
    if (outcome === 'cycle') {
      setError('Conexión inválida: generaría un ciclo en el workflow.')
      return
    }

    if (outcome === 'added') {
      setNotice('Conexión agregada. Guarda para persistir.')
      setTimeout(() => setNotice(null), 2000)
    }
  }, [])

  const handleDeleteEdges = useCallback((edgesToDelete: Edge[]) => {
    const structuralEdges = edgesToDelete.filter((edge) => edge.id.startsWith('struct__'))
    if (structuralEdges.length === 0) return

    const toRemove = structuralEdges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }))

    setDefinition((cur) => ({
      ...cur,
      agents: cur.agents.map((agent) => {
        const targets = toRemove
          .filter((item) => item.source === agent.id)
          .map((item) => item.target)
        if (targets.length === 0) return agent
        return {
          ...agent,
          sub_agents: agent.sub_agents.filter((subId) => !targets.includes(subId)),
        }
      }),
    }))

    setNotice('Conexión eliminada. Guarda para persistir.')
    setTimeout(() => setNotice(null), 1800)
  }, [])

  const handleAddAgent = useCallback(() => {
    if (!canAddAgent) {
      setError(`Máximo ${MAX_AGENTS} agentes.`)
      return
    }

    const candidateId = nextAgentId(definition.agents.map((a) => a.id))
    const newAgent = emptyAgent(candidateId, definition.agents.length + 1)

    setDefinition((cur) => ({
      ...cur,
      agents: [...cur.agents, newAgent],
    }))

    setActiveAndNotify(candidateId)
    setNotice('Agente agregado. Guarda para persistir.')
    setTimeout(() => setNotice(null), 2500)
  }, [canAddAgent, definition.agents, setActiveAndNotify])

  const handleDeleteAgent = useCallback(
    (agentId: string) => {
      const remaining = orderedAgents.filter((a) => a.id !== agentId)
      if (remaining.length === 0) {
        setError('Debe existir al menos un agente.')
        return
      }

      // Remove from sub_agents references too
      const cleaned = remaining.map((a, i) => ({
        ...a,
        order: i + 1,
        sub_agents: a.sub_agents.filter((s) => s !== agentId),
      }))

      setDefinition((cur) => ({ ...cur, agents: cleaned }))

      if (activeAgentId === agentId) {
        setActiveAndNotify(cleaned[0].id)
      }

      setNotice('Agente eliminado. Guarda para persistir.')
      setTimeout(() => setNotice(null), 2200)
    },
    [activeAgentId, orderedAgents, setActiveAndNotify],
  )

  // ── Validate / Save / Reload / Restore ─────────────────────────────

  const serializeCurrent = useCallback(() => definitionToToml(definition), [definition])

  const validateTomlContent = useCallback(
    async (tomlContent: string): Promise<void> => {
      if (!apiBaseUrl || athleteId === null || athleteId <= 0) {
        throw new Error('Atleta inválido para validar definición.')
      }

      const res = await fetch(`${apiBaseUrl}/agent-definition/${athleteId}/validate`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ toml_content: tomlContent }),
      })

      const payload = (await res.json().catch(() => ({}))) as {
        valid?: boolean
        errors?: string[]
        error?: string
      }

      if (payload.valid) return

      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        throw new Error(payload.errors.join(' | '))
      }

      throw new Error(payload.error || `HTTP ${res.status}`)
    },
    [athleteId],
  )

  const handleValidate = useCallback(async () => {
    setValidating(true)
    setError(null)
    setNotice(null)
    try {
      await validateTomlContent(serializeCurrent())
      setNotice('Definición válida.')
      setTimeout(() => setNotice(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validación fallida.')
    } finally {
      setValidating(false)
    }
  }, [serializeCurrent, validateTomlContent])

  const handleSave = useCallback(async () => {
    if (!apiBaseUrl || athleteId === null || athleteId <= 0) {
      setError('No hay atleta activo.')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const tomlContent = serializeCurrent()
      await validateTomlContent(tomlContent)

      const res = await fetch(`${apiBaseUrl}/agent-definition/${athleteId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ toml_content: tomlContent, version }),
      })

      const payload = (await res.json().catch(() => ({}))) as {
        version?: number
        error?: string
        details?: string
      }

      if (!res.ok) {
        throw new Error(payload.error || payload.details || `HTTP ${res.status}`)
      }

      setVersion(typeof payload.version === 'number' ? payload.version : version + 1)
      setIsDefaultDefinition(false)
      setNotice('Definición guardada.')
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }, [athleteId, serializeCurrent, validateTomlContent, version])

  const handleReload = useCallback(async () => {
    await fetchDefinition()
    setNotice('Cambios locales descartados.')
    setTimeout(() => setNotice(null), 1800)
  }, [fetchDefinition])

  const handleRestoreDefault = useCallback(async () => {
    if (!apiBaseUrl || athleteId === null || athleteId <= 0) {
      setError('No hay atleta activo.')
      return
    }

    setRestoringDefault(true)
    setError(null)

    try {
      const res = await fetch(`${apiBaseUrl}/agent-definition/${athleteId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string; details?: string }
        throw new Error(payload.error || payload.details || `HTTP ${res.status}`)
      }

      await fetchDefinition()
      setNotice('Definición por defecto restaurada.')
      setTimeout(() => setNotice(null), 2400)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restaurar.')
    } finally {
      setRestoringDefault(false)
    }
  }, [athleteId, fetchDefinition])

  const disabled = athleteId === null || athleteId <= 0 || !apiBaseUrl

  const activeAgentLabel = activeAgent?.name || activeAgent?.id || 'Agentes'

  // ── Sub-agents: which agents can be selected as children ────────────

  const availableSubAgents = useMemo(() => {
    if (!activeAgent) return []
    const ancestors = getAncestors(activeAgent.id, definition.agents)
    return definition.agents
      .filter((a) => a.id !== activeAgent.id && !ancestors.has(a.id))
      .map((a) => a.id)
  }, [activeAgent, definition.agents])

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls="customizable-agents-drawer"
        aria-label="Gestionar agentes"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Bot className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{activeAgentLabel}</span>
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="agents-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'linear' }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
              aria-hidden="true"
            />

            <motion.aside
              key="agents-drawer"
              id="customizable-agents-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="agents-drawer-title"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                'fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(96vw,68rem)] flex-col border-l border-border bg-popover text-popover-foreground shadow-2xl',
                isDark ? 'text-foreground' : 'text-foreground',
              )}
            >
              {/* ── Header ── */}
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h2 id="agents-drawer-title" className="text-[15px] font-semibold text-foreground">
                    Multi-Agent Designer
                  </h2>
                  <span className="text-[12px] text-muted-foreground">
                    {definition.agents.length}/{MAX_AGENTS}
                  </span>
                  {isDefaultDefinition ? (
                    <span className="rounded-sm border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                      default
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <AnimatePresence>
                    {notice ? (
                      <motion.span
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.15 }}
                        className="text-[12px] text-success"
                      >
                        {notice}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>

                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={validating || loading || saving}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {validating ? 'Validando...' : 'Validar'}
                  </button>

                  <button
                    type="button"
                    onClick={handleReload}
                    disabled={loading || saving || validating}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Recargar
                  </button>

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || validating || loading || definition.agents.length === 0}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 text-[12px] font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className={cn('h-3.5 w-3.5', saving && 'animate-pulse')} />
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>

                  <button
                    type="button"
                    onClick={handleRestoreDefault}
                    disabled={restoringDefault || loading}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 text-[12px] text-warning hover:bg-warning/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {restoringDefault ? 'Restaurando...' : 'Default'}
                  </button>

                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar panel"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>

              {/* ── Error bar ── */}
              {error ? (
                <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-[12px] text-destructive">
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {error}
                  </span>
                </div>
              ) : null}

              {/* ── Body: sidebar + editor ── */}
              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
                {/* ── Sidebar ── */}
                <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
                  {/* Agent list */}
                  <section className="rounded-md border border-border bg-background/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Agentes
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddAgent}
                        disabled={!canAddAgent}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Plus className="h-3.5 w-3.5" /> Nuevo
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {orderedAgents.map((item) => {
                        const active = item.id === activeAgentId
                        const meta = AGENT_TYPE_META[item.type]
                        const Icon = meta.icon
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'rounded-md border p-2',
                              active ? 'border-primary/50 bg-primary/10' : 'border-border bg-background',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveAndNotify(item.id)}
                              className="mb-1 flex w-full items-start gap-2 text-left"
                            >
                              <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', meta.color)} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-[12px] font-medium text-foreground">
                                    {item.name || item.id}
                                  </span>
                                  <span className={cn('text-[10px] font-medium', meta.color)}>{meta.label}</span>
                                </div>
                                <div className="truncate text-[10px] text-muted-foreground">{item.id}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {item.type === 'llm'
                                    ? promptPreview(item.prompt)
                                    : `${item.sub_agents.length} sub-agent${item.sub_agents.length !== 1 ? 's' : ''}`}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAgent(item.id)}
                              disabled={orderedAgents.length <= 1}
                              className="inline-flex h-5 items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 text-[10px] text-destructive hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </section>

                  {/* Topology preview */}
                  <section className="rounded-md border border-border bg-background/40 p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Topología
                      </h3>
                    </div>
                    <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                      {topology.map((node) => {
                        const meta = AGENT_TYPE_META[node.type]
                        const indent = '\u00A0\u00A0'.repeat(node.depth)
                        const prefix = node.depth > 0 ? '└─ ' : ''
                        return (
                          <div key={node.id} className="flex items-center gap-1">
                            <span>{indent}{prefix}</span>
                            <span className={cn('font-medium', meta.color)}>{node.name || node.id}</span>
                            <span className="text-[10px] opacity-60">[{node.id}]</span>
                            <span className="text-[10px] opacity-60">({meta.label.toLowerCase()})</span>
                          </div>
                        )
                      })}
                      {topology.length === 0 ? (
                        <span className="italic">Sin agentes</span>
                      ) : null}
                    </div>
                  </section>
                </aside>

                {/* ── Editor pane ── */}
                <section className="min-h-0 overflow-y-auto p-4">
                  {!activeAgent ? (
                    <div className="rounded-md border border-border bg-background/40 p-4 text-[13px] text-muted-foreground">
                      Selecciona un agente para editar.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-md border border-border bg-background/40 p-3">
                        <div className="mb-2 flex items-center gap-1.5">
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Canvas de flujo
                          </h3>
                        </div>
                        <div className="h-[290px] overflow-hidden rounded-md border border-border bg-background">
                          <ReactFlow
                            nodes={flowGraph.nodes}
                            edges={flowGraph.edges}
                            nodeTypes={flowNodeTypes}
                            fitView
                            nodesDraggable={false}
                            nodesConnectable
                            edgesFocusable
                            deleteKeyCode={["Backspace", "Delete"]}
                            elementsSelectable
                            onConnect={handleConnectNodes}
                            onEdgesDelete={handleDeleteEdges}
                            onNodeClick={(_, node) => setActiveAndNotify(node.id)}
                            className="bg-background"
                          >
                            <Background gap={18} size={1} color="hsl(var(--border))" />
                            <Controls showInteractive={false} />
                          </ReactFlow>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                            <span className="inline-block h-2 w-4 rounded-sm bg-primary" />
                            flujo sub_agents
                          </span>
                          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                            <span className="inline-block h-2 w-4 rounded-sm border border-success bg-transparent" />
                            datos output_key -&gt; {'{variable}'}
                          </span>
                        </div>
                      </div>

                      {/* ID + Type row */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">ID</label>
                          <input
                            type="text"
                            value={activeAgent.id}
                            disabled
                            className="h-8 w-full rounded-md border border-border bg-muted px-2 text-[12px] text-muted-foreground"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">Tipo</label>
                          <select
                            value={activeAgent.type}
                            onChange={(e) => {
                              const newType = normalizeAgentType(e.target.value)
                              const patch: Partial<AgentEntry> = { type: newType }
                              // Clear irrelevant fields when switching type
                              if (newType !== 'llm') {
                                patch.model = ''
                                patch.prompt = ''
                              }
                              if (newType === 'custom' && !activeAgent.custom_type.trim()) {
                                patch.custom_type = activeAgent.name || activeAgent.id
                              }
                              if (newType !== 'custom') {
                                patch.custom_type = ''
                              }
                              if (newType === 'llm') {
                                // Keep sub_agents — llm can have them for delegation
                              }
                              updateAgent(activeAgent.id, patch)
                            }}
                            disabled={loading || saving}
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {AGENT_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {AGENT_TYPE_META[t].label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-[12px] text-muted-foreground">Nombre</label>
                        <input
                          type="text"
                          value={activeAgent.name}
                          onChange={(e) => updateAgent(activeAgent.id, { name: e.target.value })}
                          disabled={loading || saving}
                          placeholder="Nombre visible del agente..."
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>

                      {/* Model (only for LLM) */}
                      {activeAgent.type === 'llm' ? (
                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">Modelo</label>
                          <select
                            value={activeAgent.model}
                            onChange={(e) => updateAgent(activeAgent.id, { model: e.target.value })}
                            disabled={loading || saving}
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="">Modelo por defecto (env)</option>
                            {MODEL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      {/* Description */}
                      <div>
                        <label className="mb-1 block text-[12px] text-muted-foreground">
                          Descripción
                          <span className="ml-1 text-[10px] opacity-60">(para delegación LLM)</span>
                        </label>
                        <input
                          type="text"
                          value={activeAgent.description}
                          onChange={(e) => updateAgent(activeAgent.id, { description: e.target.value })}
                          disabled={loading || saving}
                          placeholder="Describe qué hace este agente..."
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>

                      {activeAgent.type === 'custom' ? (
                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">
                            Custom Type
                            <span className="ml-1 text-[10px] opacity-60">(registrado en backend)</span>
                          </label>
                          <input
                            type="text"
                            value={activeAgent.custom_type}
                            onChange={(e) => updateAgent(activeAgent.id, { custom_type: e.target.value })}
                            disabled={loading || saving}
                            placeholder="ej: slack_notifier"
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </div>
                      ) : null}

                      {/* Prompt (only for LLM) */}
                      {activeAgent.type === 'llm' ? (
                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">Prompt</label>
                          <textarea
                            value={activeAgent.prompt}
                            onChange={(e) => updateAgent(activeAgent.id, { prompt: e.target.value })}
                            disabled={loading || saving}
                            rows={12}
                            spellCheck={false}
                            placeholder="Instrucción del agente..."
                            className={cn(
                              'w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px] leading-5 text-foreground',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              'disabled:cursor-not-allowed disabled:opacity-60',
                            )}
                          />
                        </div>
                      ) : null}

                      {/* Sub-agents */}
                      <div>
                        <label className="mb-1 block text-[12px] text-muted-foreground">
                          Sub-agents
                          {activeAgent.type !== 'llm' ? (
                            <span className="ml-1 text-[10px] text-warning">requerido</span>
                          ) : (
                            <span className="ml-1 text-[10px] opacity-60">(opcional, para delegación)</span>
                          )}
                        </label>
                        {availableSubAgents.length === 0 ? (
                          <p className="text-[11px] italic text-muted-foreground">
                            No hay agentes disponibles. Crea más agentes primero.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                            {availableSubAgents.map((subId) => {
                              const checked = activeAgent.sub_agents.includes(subId)
                              const subAgent = definition.agents.find((a) => a.id === subId)
                              const subMeta = subAgent ? AGENT_TYPE_META[subAgent.type] : null
                              return (
                                <label
                                  key={subId}
                                  className={cn(
                                    'flex cursor-pointer items-center gap-2 rounded-md border p-2 text-[12px] transition-colors',
                                    checked
                                      ? 'border-primary/50 bg-primary/10 text-foreground'
                                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? activeAgent.sub_agents.filter((s) => s !== subId)
                                        : [...activeAgent.sub_agents, subId]
                                      updateAgent(activeAgent.id, { sub_agents: next })
                                    }}
                                    disabled={loading || saving}
                                    className="h-3.5 w-3.5 rounded border-border"
                                  />
                                  <span className="font-medium">{subId}</span>
                                  {subMeta ? (
                                    <span className={cn('text-[10px]', subMeta.color)}>{subMeta.label}</span>
                                  ) : null}
                                </label>
                              )
                            })}
                          </div>
                        )}

                        {activeAgent.sub_agents.length > 0 ? (
                          <div className="mt-2 rounded-md border border-border bg-background/60 p-2">
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Orden de ejecución
                            </p>
                            <div className="space-y-1">
                              {activeAgent.sub_agents.map((subId, index) => {
                                const move = (direction: -1 | 1) => {
                                  const target = index + direction
                                  if (target < 0 || target >= activeAgent.sub_agents.length) return
                                  const next = [...activeAgent.sub_agents]
                                  const [item] = next.splice(index, 1)
                                  next.splice(target, 0, item)
                                  updateAgent(activeAgent.id, { sub_agents: next })
                                }

                                return (
                                  <div
                                    key={`${subId}-${index}`}
                                    className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground"
                                  >
                                    <span className="truncate">
                                      {index + 1}. {subId}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => move(-1)}
                                        disabled={index === 0 || loading || saving}
                                        className="inline-flex h-5 w-5 items-center justify-center rounded border border-border text-[10px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => move(1)}
                                        disabled={index === activeAgent.sub_agents.length - 1 || loading || saving}
                                        className="inline-flex h-5 w-5 items-center justify-center rounded border border-border text-[10px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        ↓
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Output key (optional) */}
                      <div>
                        <label className="mb-1 block text-[12px] text-muted-foreground">
                          Output key
                          <span className="ml-1 text-[10px] opacity-60">(opcional, para pipelines)</span>
                        </label>
                        <input
                          type="text"
                          value={activeAgent.output_key}
                          onChange={(e) => updateAgent(activeAgent.id, { output_key: e.target.value })}
                          disabled={loading || saving}
                          placeholder="ej: research_result"
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>

                      {/* Pattern hint */}
                      <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-[11px] text-muted-foreground">
                        {activeAgent.type === 'llm' ? (
                          <p>
                            <strong>LLM Agent:</strong> Agente con modelo de lenguaje. Define un prompt con instrucciones.
                            Si tiene sub-agents, puede delegar tareas a ellos (patrón Coordinator).
                          </p>
                        ) : activeAgent.type === 'sequential' ? (
                          <p>
                            <strong>Sequential:</strong> Ejecuta sub-agents en orden fijo. El output de cada paso
                            está disponible para el siguiente via <code>output_key</code> en el estado compartido.
                          </p>
                        ) : activeAgent.type === 'parallel' ? (
                          <p>
                            <strong>Parallel:</strong> Ejecuta sub-agents simultáneamente. Ideal para recopilar
                            información de múltiples fuentes. Combina resultados con un agente posterior.
                          </p>
                        ) : activeAgent.type === 'custom' ? (
                          <p>
                            <strong>Custom:</strong> Instancia una implementación registrada en backend por su
                            <code>custom_type</code>. Útil para integrar lógica Python específica.
                          </p>
                        ) : (
                          <p>
                            <strong>Loop:</strong> Repite sub-agents iterativamente. Útil para refinamiento
                            progresivo (generar → revisar → mejorar). Se detiene por max_iterations o escalación.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
