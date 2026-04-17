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
  Layers,
  Plus,
  Repeat,
  Save,
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
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorDraft, setEditorDraft] = useState<AgentEntry | null>(null)
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false)
  const [showUtilitiesMenu, setShowUtilitiesMenu] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const canAddAgent = definition.agents.length < MAX_AGENTS

  const orderedAgents = useMemo(
    () => [...definition.agents].sort((a, b) => a.order - b.order),
    [definition.agents],
  )

  const activeAgent = orderedAgents.find((a) => a.id === activeAgentId) ?? null

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
        if (editorOpen) {
          setEditorOpen(false)
          setEditorDraft(null)
          setShowAdvancedEditor(false)
          return
        }
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [editorOpen, open])

  useEffect(() => {
    if (!open) triggerRef.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (definition.agents.some((a) => a.id === selectedAgentId)) {
      setActiveAgentId(selectedAgentId)
    }
  }, [definition.agents, selectedAgentId])

  // ── Mutations ──────────────────────────────────────────────────────

  const replaceAgent = useCallback((agentId: string, nextAgent: AgentEntry) => {
    setDefinition((cur) => ({
      ...cur,
      agents: cur.agents.map((agent) => (agent.id === agentId ? nextAgent : agent)),
    }))
  }, [])

  const openEditorFor = useCallback((agentId: string) => {
    const candidate = orderedAgents.find((agent) => agent.id === agentId)
    if (!candidate) return
    setEditorDraft({ ...candidate, sub_agents: [...candidate.sub_agents] })
    setShowAdvancedEditor(false)
    setEditorOpen(true)
    setActiveAndNotify(agentId)
  }, [orderedAgents, setActiveAndNotify])

  const closeEditor = useCallback(() => {
    setEditorOpen(false)
    setEditorDraft(null)
    setShowAdvancedEditor(false)
  }, [])

  const saveEditor = useCallback(() => {
    if (!editorDraft) return
    replaceAgent(editorDraft.id, {
      ...editorDraft,
      name: editorDraft.name.trim() || editorDraft.id,
      custom_type: editorDraft.custom_type.trim(),
    })
    setNotice('Agente actualizado. Guarda para persistir.')
    setTimeout(() => setNotice(null), 2000)
    closeEditor()
  }, [closeEditor, editorDraft, replaceAgent])

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
    setEditorDraft({ ...newAgent, sub_agents: [] })
    setShowAdvancedEditor(false)
    setEditorOpen(true)
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

      if (editorDraft?.id === agentId) {
        closeEditor()
      }

      setNotice('Agente eliminado. Guarda para persistir.')
      setTimeout(() => setNotice(null), 2200)
    },
    [activeAgentId, closeEditor, editorDraft?.id, orderedAgents, setActiveAndNotify],
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

  const activeAgentMeta = activeAgent ? AGENT_TYPE_META[activeAgent.type] : null

  // ── Modal editor helpers ───────────────────────────────────────────

  const editorAvailableSubAgents = useMemo(() => {
    if (!editorDraft) return []
    const ancestors = getAncestors(editorDraft.id, definition.agents)
    return definition.agents
      .filter((a) => a.id !== editorDraft.id && !ancestors.has(a.id))
      .map((a) => a.id)
  }, [definition.agents, editorDraft])

  const closePanel = useCallback(() => {
    setShowUtilitiesMenu(false)
    closeEditor()
    setOpen(false)
  }, [closeEditor])

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setShowUtilitiesMenu(false)
          setOpen(true)
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-controls="customizable-agents-drawer"
        aria-label="Gestionar agentes"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Bot className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Diseñar agentes</span>
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.aside
              key="agents-drawer"
              id="customizable-agents-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="agents-drawer-title"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className={cn(
                'fixed inset-0 z-50 flex h-screen w-screen flex-col bg-popover text-popover-foreground',
                isDark ? 'text-foreground' : 'text-foreground',
              )}
            >
              {/* ── Header ── */}
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h2 id="agents-drawer-title" className="text-[16px] font-semibold text-foreground">
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

                <div className="relative flex flex-wrap items-center gap-2">
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
                    onClick={handleAddAgent}
                    disabled={!canAddAgent}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nuevo
                  </button>

                  <button
                    type="button"
                    onClick={() => activeAgent && openEditorFor(activeAgent.id)}
                    disabled={!activeAgent || loading || saving}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Editar
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
                    onClick={() => setShowUtilitiesMenu((prev) => !prev)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Más
                  </button>

                  {showUtilitiesMenu ? (
                    <div className="absolute right-12 top-10 z-20 w-44 rounded-md border border-border bg-background p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setShowUtilitiesMenu(false)
                          handleValidate()
                        }}
                        disabled={validating || loading || saving}
                        className="flex h-8 w-full items-center rounded px-2 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {validating ? 'Validando...' : 'Validar definición'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowUtilitiesMenu(false)
                          handleReload()
                        }}
                        disabled={loading || saving || validating}
                        className="flex h-8 w-full items-center rounded px-2 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Recargar cambios
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowUtilitiesMenu(false)
                          handleRestoreDefault()
                        }}
                        disabled={restoringDefault || loading}
                        className="flex h-8 w-full items-center rounded px-2 text-left text-[12px] text-warning hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {restoringDefault ? 'Restaurando...' : 'Restaurar default'}
                      </button>
                    </div>
                  ) : null}

                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={closePanel}
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

              {/* ── Body: sidebar + canvas ── */}
              <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_1fr]">
                {/* ── Sidebar ── */}
                <aside className="flex min-h-0 flex-col overflow-y-auto border-b border-border p-3 md:border-b-0 md:border-r">
                  {/* Agent list */}
                  <section className="rounded-md border border-border bg-background/40 p-2">
                    <div className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Agentes
                    </div>

                    <div className="space-y-1">
                      {orderedAgents.map((item) => {
                        const active = item.id === activeAgentId
                        const meta = AGENT_TYPE_META[item.type]
                        const Icon = meta.icon
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'rounded-md border p-2 transition-colors',
                              active ? 'border-primary/50 bg-primary/10' : 'border-border bg-background',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveAndNotify(item.id)}
                              onDoubleClick={() => openEditorFor(item.id)}
                              className="flex w-full items-start gap-2 text-left"
                            >
                              <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', meta.color)} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-[12px] font-medium text-foreground">
                                    {item.name || item.id}
                                  </span>
                                  <span className={cn('shrink-0 text-[10px] font-medium', meta.color)}>{meta.label}</span>
                                </div>
                                <div className="truncate text-[10px] text-muted-foreground">{promptPreview(item.prompt, 46)}</div>
                              </div>
                            </button>
                            <div className="mt-1 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditorFor(item.id)}
                                className="inline-flex h-6 items-center rounded border border-border px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAgent(item.id)}
                                disabled={orderedAgents.length <= 1}
                                className="inline-flex h-6 items-center rounded border border-destructive/40 px-2 text-[10px] text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Borrar
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                </aside>

                {/* ── Main canvas pane ── */}
                <section className="flex min-h-0 flex-col p-4">
                  <div className="rounded-md border border-border bg-background/40 px-3 py-2">
                    {activeAgent ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-foreground">{activeAgent.name || activeAgent.id}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{promptPreview(activeAgent.prompt, 90)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {activeAgentMeta ? (
                            <span className={cn('rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium', activeAgentMeta.color)}>
                              {activeAgentMeta.label}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openEditorFor(activeAgent.id)}
                            className="inline-flex h-7 items-center rounded-md border border-border px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            Editar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[13px] text-muted-foreground">Selecciona un agente o crea uno nuevo para empezar.</p>
                    )}
                  </div>

                  <div className="mt-3 min-h-0 flex-1 rounded-md border border-border bg-background/40 p-3">
                    <div className="mb-2 text-[12px] text-muted-foreground">
                      Conecta agentes arrastrando una línea entre nodos. Doble click en un nodo para editar detalles.
                    </div>
                    <div className="h-full min-h-[360px] overflow-hidden rounded-md border border-border bg-background">
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
                        onNodeDoubleClick={(_, node) => openEditorFor(node.id)}
                        className="bg-background"
                      >
                        <Background gap={18} size={1} color="hsl(var(--border))" />
                        <Controls showInteractive={false} />
                      </ReactFlow>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                        <span className="inline-block h-2 w-4 rounded-sm bg-primary" />
                        Flujo principal
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                        <span className="inline-block h-2 w-4 rounded-sm border border-success bg-transparent" />
                        Flujo de datos ({'{variable}'})
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            </motion.aside>

            <AnimatePresence>
              {editorOpen && editorDraft ? (
                <>
                  <motion.div
                    key="agent-editor-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={closeEditor}
                    className="fixed inset-0 z-[60] bg-foreground/40"
                    aria-hidden="true"
                  />

                  <motion.section
                    key="agent-editor"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Editar agente"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                    className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-4 shadow-2xl"
                  >
                    <header className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-[15px] font-semibold text-foreground">Editar agente</h3>
                        <p className="text-[11px] text-muted-foreground">{editorDraft.id}</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeEditor}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Cerrar edición"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </header>

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-[12px] text-muted-foreground">Nombre</label>
                        <input
                          type="text"
                          value={editorDraft.name}
                          onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, name: event.target.value } : cur))}
                          placeholder="Ej: Analista de entreno"
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px] text-foreground"
                        />
                      </div>

                      {editorDraft.type === 'llm' ? (
                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">Prompt</label>
                          <textarea
                            value={editorDraft.prompt}
                            onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, prompt: event.target.value } : cur))}
                            rows={7}
                            spellCheck={false}
                            placeholder="Escribe instrucciones sencillas para este agente..."
                            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                          />
                        </div>
                      ) : (
                        <p className="rounded-md border border-border bg-background/60 px-3 py-2 text-[12px] text-muted-foreground">
                          Este tipo de agente no necesita prompt directo. Conecta sub-agents en el canvas.
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowAdvancedEditor((prev) => !prev)}
                        className="text-[12px] font-medium text-primary hover:underline"
                      >
                        {showAdvancedEditor ? 'Ocultar opciones avanzadas' : 'Mostrar opciones avanzadas'}
                      </button>

                      {showAdvancedEditor ? (
                        <div className="space-y-3 rounded-md border border-border bg-background/40 p-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-[12px] text-muted-foreground">Tipo</label>
                              <select
                                value={editorDraft.type}
                                onChange={(event) => {
                                  const nextType = normalizeAgentType(event.target.value)
                                  setEditorDraft((cur) => {
                                    if (!cur) return cur
                                    const next: AgentEntry = { ...cur, type: nextType }
                                    if (nextType !== 'llm') {
                                      next.model = ''
                                      next.prompt = ''
                                    }
                                    if (nextType === 'custom' && !next.custom_type.trim()) {
                                      next.custom_type = cur.name || cur.id
                                    }
                                    if (nextType !== 'custom') {
                                      next.custom_type = ''
                                    }
                                    return next
                                  })
                                }}
                                className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                              >
                                {AGENT_TYPES.map((typeValue) => (
                                  <option key={typeValue} value={typeValue}>
                                    {AGENT_TYPE_META[typeValue].label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {editorDraft.type === 'llm' ? (
                              <div>
                                <label className="mb-1 block text-[12px] text-muted-foreground">Modelo</label>
                                <select
                                  value={editorDraft.model}
                                  onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, model: event.target.value } : cur))}
                                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
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
                          </div>

                          {editorDraft.type === 'custom' ? (
                            <div>
                              <label className="mb-1 block text-[12px] text-muted-foreground">Custom type</label>
                              <input
                                type="text"
                                value={editorDraft.custom_type}
                                onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, custom_type: event.target.value } : cur))}
                                placeholder="ej: slack_notifier"
                                className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                              />
                            </div>
                          ) : null}

                          <div>
                            <label className="mb-1 block text-[12px] text-muted-foreground">Descripción</label>
                            <input
                              type="text"
                              value={editorDraft.description}
                              onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, description: event.target.value } : cur))}
                              placeholder="Descripción corta"
                              className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-[12px] text-muted-foreground">Output key</label>
                            <input
                              type="text"
                              value={editorDraft.output_key}
                              onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, output_key: event.target.value } : cur))}
                              placeholder="ej: research_result"
                              className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-[12px] text-muted-foreground">Sub-agents</label>
                            {editorAvailableSubAgents.length === 0 ? (
                              <p className="text-[11px] italic text-muted-foreground">No hay agentes disponibles.</p>
                            ) : (
                              <div className="grid grid-cols-2 gap-1.5">
                                {editorAvailableSubAgents.map((subId) => {
                                  const checked = editorDraft.sub_agents.includes(subId)
                                  return (
                                    <label
                                      key={subId}
                                      className={cn(
                                        'flex cursor-pointer items-center gap-2 rounded-md border p-2 text-[11px]',
                                        checked ? 'border-primary/50 bg-primary/10' : 'border-border bg-background',
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          setEditorDraft((cur) => {
                                            if (!cur) return cur
                                            const nextSubAgents = checked
                                              ? cur.sub_agents.filter((value) => value !== subId)
                                              : [...cur.sub_agents, subId]
                                            return { ...cur, sub_agents: nextSubAgents }
                                          })
                                        }}
                                        className="h-3.5 w-3.5"
                                      />
                                      <span className="truncate">{subId}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <footer className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={closeEditor}
                        className="inline-flex h-8 items-center rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={saveEditor}
                        className="inline-flex h-8 items-center rounded-md border border-primary/40 bg-primary/10 px-3 text-[12px] font-medium text-primary hover:bg-primary/15"
                      >
                        Aplicar cambios
                      </button>
                    </footer>
                  </motion.section>
                </>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
