import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  Plus,
  X,
} from 'lucide-react'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

import { cn } from '@/lib/utils'
import AgentNode, { type AgentNodeData } from '@/components/ui/agent-node'

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
const internalPipelineToken = (import.meta.env.VITE_INTERNAL_PIPELINE_TOKEN ?? '').trim()

const MAX_AGENTS = 10
const CONSENSUS_ROUNDS = 2
const PANEL_ANIMATION_DURATION_S = 0.16
const NOTICE_ANIMATION_DURATION_S = 0.15
const EDITOR_ANIMATION_DURATION_S = 0.2

const RESERVED_AGENT_IDS = new Set([
  'intent_router',
  'plan_react_planner',
  'strava_ingestion_agent',
  'query_agent',
  'answer_agent',
  'orchestrator',
  'wiki_research_chat',
])

const AGENT_TYPES = ['llm'] as const
type AgentType = (typeof AGENT_TYPES)[number]

const AGENT_TYPE_META: Record<AgentType, { label: string; icon: typeof Bot; color: string }> = {
  llm: { label: 'LLM', icon: Bot, color: 'text-blue-500' },
}

const MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
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

type AgentConnection = {
  from: string
  to: string
}

type DesignerDefinition = {
  system: { entrypoint: 'orchestrator' }
  agents: AgentEntry[]
  connections: AgentConnection[]
}

function inferConnectionsFromSubAgents(agents: AgentEntry[]): AgentConnection[] {
  const agentIds = new Set(agents.map((agent) => agent.id))
  const inferred: AgentConnection[] = []
  const seen = new Set<string>()

  for (const agent of agents) {
    for (const rawRef of agent.sub_agents) {
      const refId = String(rawRef || '').trim()
      if (!refId || refId === agent.id || !agentIds.has(refId)) continue

      const key = `${refId}__${agent.id}`
      if (seen.has(key)) continue

      seen.add(key)
      inferred.push({ from: refId, to: agent.id })
    }
  }

  return inferred
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
  if (lower === 'llm' || lower === 'llmagent') return 'llm'
  return 'llm'
}

function resolveOutputKey(agent: AgentEntry): string {
  const candidate = (agent.output_key || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  if (candidate) return candidate
  return `${agent.id}_output`
}

function normalizeAgentId(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  return normalized || fallback
}

function promptPreview(prompt: string, maxLen = 60): string {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (!compact) return 'No prompt'
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

function parseNamedTableEntries(table: unknown, defaultType: string, orderOffset = 0): AgentEntry[] {
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

  // Parse [[connections]]
  const rawConnections = Array.isArray((parsed as Record<string, unknown>).connections)
    ? (parsed as Record<string, unknown>).connections as unknown[]
    : []
  const connections: AgentConnection[] = rawConnections
    .filter((c): c is Record<string, unknown> => isRecord(c))
    .map((c) => ({ from: asString(c.from), to: asString(c.to) }))
    .filter((c) => c.from && c.to)

  const resolvedConnections = connections.length > 0 ? connections : inferConnectionsFromSubAgents(agents)

  return {
    system,
    agents: agents.sort((a, b) => a.order - b.order),
    connections: resolvedConnections,
  }
}

function definitionToToml(definition: DesignerDefinition): string {
  const agents = definition.agents.map((item, index) => ({
    id: item.id,
    name: item.name,
    type: 'llm',
    model: item.model || MODEL_OPTIONS[0].value,
    description: item.description || '',
    prompt: item.prompt || '',
    custom_type: '',
    sub_agents: [],
    output_key: item.output_key || resolveOutputKey(item),
    order: index + 1,
  }))

  const connections = definition.connections.map((c) => ({ from: c.from, to: c.to }))

  return stringifyToml({
    system: { entrypoint: 'orchestrator' },
    agents,
    ...(connections.length > 0 ? { connections } : {}),
  })
}

function emptyAgent(id: string, order: number): AgentEntry {
  return {
    id,
    name: id,
    type: 'llm',
    model: MODEL_OPTIONS[0].value,
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

function buildFlowGraph(
  agents: AgentEntry[],
  connections: AgentConnection[],
): { nodes: FlowNode[]; edges: Edge[] } {
  const ordered = [...agents].sort((a, b) => a.order - b.order)
  const columnWidth = 280
  const agentsY = 96
  const consensusY = 340
  const nodes: FlowNode[] = []

  for (let i = 0; i < ordered.length; i++) {
    const agent = ordered[i]
    nodes.push({
      id: agent.id,
      type: 'agent',
      position: { x: i * columnWidth, y: agentsY },
      data: {
        agentId: agent.id,
        name: agent.name,
        type: 'llm',
        promptPreview: promptPreview(agent.prompt, 90),
        subAgentsCount: 0,
      },
    })
  }

  const centerX = ((ordered.length - 1) * columnWidth) / 2

  if (ordered.length > 0) {
    nodes.push({
      id: '__consensus__',
      type: 'agent',
      position: { x: centerX, y: consensusY },
      data: {
        agentId: 'consensus_final_answer',
        name: 'Final Consensus',
        type: 'consensus',
        promptPreview: `Synthesis after ${CONSENSUS_ROUNDS} rounds`,
        subAgentsCount: ordered.length,
      },
    })

  }

  const agentIds = new Set(ordered.map((a) => a.id))
  const edges: Edge[] = []

  // ── Only render connections explicitly defined by the user ──────────────
  const validTargets = new Set([...agentIds, '__consensus__'])
  for (const conn of connections) {
    if (!agentIds.has(conn.from) || !validTargets.has(conn.to)) continue
    const sourceAgent = ordered.find((a) => a.id === conn.from)
    edges.push({
      id: `conn__${conn.from}__${conn.to}`,
      source: conn.from,
      target: conn.to,
      type: 'smoothstep',
      label: sourceAgent ? resolveOutputKey(sourceAgent) : conn.from,
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.8 },
      labelStyle: { fill: 'hsl(var(--muted-foreground))', fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: true,
      deletable: true,
    })
  }

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomizableAgentsPanel({ isDark, athleteId, selectedAgentId, onAgentChange }: Props) {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [version, setVersion] = useState(0)
  const [isDefaultDefinition, setIsDefaultDefinition] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [definition, setDefinition] = useState<DesignerDefinition>({
    system: { entrypoint: 'orchestrator' },
    agents: [emptyAgent('agent_1', 1)],
    connections: [],
  })

  const [activeAgentId, setActiveAgentId] = useState(selectedAgentId)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorDraft, setEditorDraft] = useState<AgentEntry | null>(null)

  const [consensusEditorOpen, setConsensusEditorOpen] = useState(false)
  const [consensusPromptDraft, setConsensusPromptDraft] = useState('')
  const [consensusPromptSaving, setConsensusPromptSaving] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const selectedAgentIdRef = useRef(selectedAgentId)
  const isDefinitionFromApi = useRef<false | 'skip-next' | true>(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canAddAgent = definition.agents.length < MAX_AGENTS

  const orderedAgents = useMemo(
    () => [...definition.agents].sort((a, b) => a.order - b.order),
    [definition.agents],
  )

  const flowGraph = useMemo(
    () => buildFlowGraph(orderedAgents, definition.connections),
    [orderedAgents, definition.connections],
  )
  const [flowNodes, setFlowNodes] = useState(() => flowGraph.nodes)
  const [flowEdges, setFlowEdges] = useState(() => flowGraph.edges)
  useEffect(() => { setFlowNodes(flowGraph.nodes) }, [flowGraph.nodes])
  useEffect(() => { setFlowEdges(flowGraph.edges) }, [flowGraph.edges])
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setFlowNodes((nds) => applyNodeChanges(changes, nds) as FlowNode[]),
    [],
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setFlowEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  )

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
      isDefinitionFromApi.current = 'skip-next'
      setDefinition(parsed)

      const preferred = parsed.agents.some((a) => a.id === selectedAgentIdRef.current)
        ? selectedAgentIdRef.current
        : parsed.agents[0]?.id ?? ''

      if (preferred) setActiveAndNotify(preferred)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load definition.')
    } finally {
      setLoading(false)
    }
  }, [athleteId, setActiveAndNotify])

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId
  }, [selectedAgentId])

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
    setEditorOpen(true)
    setActiveAndNotify(agentId)
  }, [orderedAgents, setActiveAndNotify])

  const closeEditor = useCallback(() => {
    setEditorOpen(false)
    setEditorDraft(null)
  }, [])

  const saveEditor = useCallback(() => {
    if (!editorDraft) return
    replaceAgent(editorDraft.id, {
      ...editorDraft,
      name: editorDraft.name.trim() || editorDraft.id,
      output_key: editorDraft.output_key.trim(),
    })
    setNotice('Agent updated.')
    setTimeout(() => setNotice(null), 2000)
    closeEditor()
  }, [closeEditor, editorDraft, replaceAgent])

  const handleAddAgent = useCallback(() => {
    if (!canAddAgent) {
      setError(`Maximum ${MAX_AGENTS} agents.`)
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
    setEditorOpen(true)
    setNotice('Agent added.')
    setTimeout(() => setNotice(null), 2500)
  }, [canAddAgent, definition.agents, setActiveAndNotify])

  const handleDeleteAgent = useCallback(
    (agentId: string) => {
      const remaining = orderedAgents.filter((a) => a.id !== agentId)
      if (remaining.length === 0) {
        setError('At least one agent must exist.')
        return
      }

      // Remove from sub_agents references too
      const cleaned = remaining.map((a, i) => ({
        ...a,
        order: i + 1,
        sub_agents: a.sub_agents.filter((s) => s !== agentId),
      }))

      setDefinition((cur) => ({
        ...cur,
        agents: cleaned,
        connections: cur.connections.filter((c) => c.from !== agentId && c.to !== agentId),
      }))

      if (activeAgentId === agentId) {
        setActiveAndNotify(cleaned[0].id)
      }

      if (editorDraft?.id === agentId) {
        closeEditor()
      }

      setNotice('Agent deleted.')
      setTimeout(() => setNotice(null), 2200)
    },
    [activeAgentId, closeEditor, editorDraft?.id, orderedAgents, setActiveAndNotify],
  )

  // ── Connection handlers ────────────────────────────────────────────

  const handleConnect = useCallback((params: Connection) => {
    const { source, target } = params
    if (!source || !target) return
    if (source === '__consensus__' || source === '__api_endpoint__') return
    if (target === '__api_endpoint__') return
    if (source === target) return

    setDefinition((cur) => {
      if (cur.connections.some((c) => c.from === source && c.to === target)) return cur
      return { ...cur, connections: [...cur.connections, { from: source, to: target }] }
    })

    // Also let ReactFlow render the edge immediately
    setFlowEdges((eds) => addEdge(params, eds))
  }, [])

  const handleEdgesDelete = useCallback((edges: Edge[]) => {
    const toRemove = new Set(edges.filter((e) => e.deletable !== false).map((e) => e.id))
    if (toRemove.size === 0) return
    setDefinition((cur) => ({
      ...cur,
      connections: cur.connections.filter((c) => !toRemove.has(`conn__${c.from}__${c.to}`)),
    }))
  }, [])

  const handleClearConnections = useCallback(() => {
    setDefinition((cur) => ({ ...cur, connections: [] }))
    setNotice('Connections cleared.')
    setTimeout(() => setNotice(null), 2000)
  }, [])

  const handleMoveAgent = useCallback((agentId: string, direction: -1 | 1) => {
    let moved = false
    setDefinition((cur) => {
      const ordered = [...cur.agents].sort((a, b) => a.order - b.order)
      const currentIndex = ordered.findIndex((agent) => agent.id === agentId)
      const targetIndex = currentIndex + direction
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
        return cur
      }

      const next = [...ordered]
      const [agent] = next.splice(currentIndex, 1)
      next.splice(targetIndex, 0, agent)
      moved = true
      return {
        ...cur,
        agents: next.map((item, index) => ({ ...item, order: index + 1 })),
      }
    })

    if (moved) {
      setNotice('Order updated.')
      setTimeout(() => setNotice(null), 1800)
    }
  }, [])

  // ── Validate / Save / Reload / Restore ─────────────────────────────

  const serializeCurrent = useCallback(() => definitionToToml(definition), [definition])

  const validateTomlContent = useCallback(
    async (tomlContent: string): Promise<void> => {
      if (!apiBaseUrl || athleteId === null || athleteId <= 0) {
        throw new Error('Invalid athlete to validate definition.')
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

  const handleSave = useCallback(async () => {
    if (!apiBaseUrl || athleteId === null || athleteId <= 0) {
      setError('No active athlete.')
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
      setNotice('Definition saved.')
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }, [athleteId, serializeCurrent, validateTomlContent, version])

  // ── Auto-save on definition change ────────────────────────────────

  useEffect(() => {
    if (isDefinitionFromApi.current === false) return
    if (isDefinitionFromApi.current === 'skip-next') {
      isDefinitionFromApi.current = true
      return
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => { void handleSave() }, 900)
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition])

  const disabled = athleteId === null || athleteId <= 0 || !apiBaseUrl

  // ── Modal editor helpers ───────────────────────────────────────────

  const closePanel = useCallback(() => {
    closeEditor()
    setOpen(false)
  }, [closeEditor])

  const openConsensusEditor = useCallback(async () => {
    setConsensusPromptDraft('')
    setConsensusEditorOpen(true)
    if (!apiBaseUrl) return
    try {
      const res = await fetch(`${apiBaseUrl}/agents/consensus_final_answer`, {
        headers: authHeaders(),
      })
      if (res.ok) {
        const data = (await res.json()) as { instruction_template?: string }
        setConsensusPromptDraft(data.instruction_template ?? '')
      }
    } catch {
      // draft stays empty
    }
  }, [])

  const saveConsensusPrompt = useCallback(async () => {
    if (!apiBaseUrl) return
    setConsensusPromptSaving(true)
    try {
      const res = await fetch(`${apiBaseUrl}/agents/consensus_final_answer`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ instruction_template: consensusPromptDraft }),
      })
      if (res.ok) {
        setConsensusEditorOpen(false)
        setNotice('Consensus prompt saved.')
        setTimeout(() => setNotice(null), 2500)
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        setError(err.error ?? 'Error saving consensus prompt.')
      }
    } catch {
      setError('Network error saving consensus prompt.')
    } finally {
      setConsensusPromptSaving(false)
    }
  }, [consensusPromptDraft])

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
        aria-label="Manage agents"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Bot className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Design agents</span>
      </button>

      {createPortal(
      <AnimatePresence>
        {open ? (
          <>
            <motion.aside
              key="agents-drawer"
              id="customizable-agents-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="agents-drawer-title"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              transition={{ duration: reduceMotion ? 0 : PANEL_ANIMATION_DURATION_S, ease: 'easeOut' }}
              className={cn(
                'fixed inset-0 z-[9999] flex h-screen w-screen flex-col bg-popover text-popover-foreground',
                isDark ? 'text-foreground' : 'text-foreground',
              )}
            >
              {/* ── Header ── */}
              <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-popover/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-popover/90">
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

                <div className="flex flex-wrap items-center gap-2">
                  <AnimatePresence>
                    {notice ? (
                      <motion.span
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: reduceMotion ? 0 : NOTICE_ANIMATION_DURATION_S }}
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
                    New
                  </button>

                  {saving ? (
                    <span className="text-[12px] text-muted-foreground animate-pulse">Saving...</span>
                  ) : null}

                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={closePanel}
                    aria-label="Close panel"
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

              {/* ── Body: full canvas ── */}
              {loading ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
                    <p className="text-[13px] text-muted-foreground">Loading agent definition...</p>
                  </div>
                </div>
              ) : (
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* ── Info bar ── */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
                  <p className="text-[12px] text-muted-foreground">
                    {definition.connections.length > 0
                      ? 'Custom flow — drag handles to wire agents. Select a connection and press Delete to remove it.'
                      : 'Automatic flow — agents iterate for ' + CONSENSUS_ROUNDS + ' rounds then pass outputs to Final Consensus. Click any agent to edit it.'}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {definition.connections.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearConnections}
                        className="inline-flex h-6 items-center gap-1 rounded border border-destructive/40 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-3 w-3" />
                        Clear wiring
                      </button>
                    )}
                    <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      <span className="inline-block h-2 w-4 rounded-sm bg-primary" />
                      {definition.connections.length > 0 ? 'Custom' : 'Iteration'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      <span className="inline-block h-2 w-4 rounded-sm border border-success bg-transparent" />
                      Consensus
                    </span>
                  </div>
                </div>

                {/* ── Canvas ── */}
                <div className="flex-1 overflow-hidden">
                  <ReactFlow
                    nodes={flowNodes}
                    edges={flowEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={handleConnect}
                    onEdgesDelete={handleEdgesDelete}
                    nodeTypes={flowNodeTypes}
                    fitView
                    nodesDraggable={true}
                    nodesConnectable={true}
                    edgesFocusable
                    edgesReconnectable={false}
                    elementsSelectable
                    deleteKeyCode="Delete"
                    onNodeClick={(_, node) => {
                      if (node.id === '__consensus__') { void openConsensusEditor(); return }
                      openEditorFor(node.id)
                    }}
                    className="h-full w-full bg-background"
                  >
                    <Background gap={18} size={1} color="hsl(var(--border))" />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                </div>
              </div>
              )}
            </motion.aside>

            <AnimatePresence>
              {editorOpen && editorDraft ? (
                <>
                  <motion.div
                    key="agent-editor-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : NOTICE_ANIMATION_DURATION_S }}
                    onClick={closeEditor}
                    className="fixed inset-0 z-[10000] bg-foreground/20"
                    aria-hidden="true"
                  />

                  <motion.section
                    key="agent-editor"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Edit agent"
                    initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                    animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                    transition={{ duration: reduceMotion ? 0 : EDITOR_ANIMATION_DURATION_S, ease: 'easeOut' }}
                    className="fixed right-0 top-0 bottom-0 z-[10001] flex w-[min(92vw,400px)] flex-col border-l border-border bg-popover shadow-2xl"
                  >
                    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <div>
                        <h3 className="text-[15px] font-semibold text-foreground">Edit agent</h3>
                        <p className="text-[11px] text-muted-foreground">{editorDraft.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteAgent(editorDraft.id)}
                          disabled={orderedAgents.length <= 1}
                          className="inline-flex h-7 items-center rounded border border-destructive/40 px-2 text-[11px] text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={closeEditor}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Close editor"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </header>

                    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                      <div>
                        <label className="mb-1 block text-[12px] text-muted-foreground">Name</label>
                        <input
                          type="text"
                          value={editorDraft.name}
                          onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, name: event.target.value } : cur))}
                          placeholder="E.g.: Training Analyst"
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px] text-foreground"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[12px] text-muted-foreground">Prompt</label>
                        <textarea
                          value={editorDraft.prompt}
                          onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, prompt: event.target.value } : cur))}
                          rows={9}
                          spellCheck={false}
                          placeholder="Write simple instructions for this agent..."
                          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[12px] text-muted-foreground">Model</label>
                        <select
                          value={editorDraft.model}
                          onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, model: event.target.value } : cur))}
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                        >
                          {MODEL_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-[12px] text-muted-foreground">Description</label>
                        <input
                          type="text"
                          value={editorDraft.description}
                          onChange={(event) => setEditorDraft((cur) => (cur ? { ...cur, description: event.target.value } : cur))}
                          placeholder="Short description"
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[12px] font-medium text-foreground">Output key</label>
                        <input
                          type="text"
                          value={editorDraft.output_key}
                          onChange={(event) => {
                            const raw = event.target.value.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
                            setEditorDraft((cur) => (cur ? { ...cur, output_key: raw } : cur))
                          }}
                          placeholder={`${editorDraft.id}_output`}
                          className="h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-[13px] text-foreground"
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Downstream agents reference this as{' '}
                          <code className="rounded bg-muted px-1 font-mono text-[10px]">
                            {'{' + (editorDraft.output_key || `${editorDraft.id}_output`) + '}'}
                          </code>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => handleMoveAgent(editorDraft.id, -1)}
                          disabled={orderedAgents[0]?.id === editorDraft.id}
                          className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Move left"
                        >
                          <ArrowUp className="h-3 w-3" />
                          Move left
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveAgent(editorDraft.id, 1)}
                          disabled={orderedAgents[orderedAgents.length - 1]?.id === editorDraft.id}
                          className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Move right"
                        >
                          <ArrowDown className="h-3 w-3" />
                          Move right
                        </button>
                      </div>
                    </div>

                    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
                      <button
                        type="button"
                        onClick={closeEditor}
                        className="inline-flex h-8 items-center rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEditor}
                        className="inline-flex h-8 items-center rounded-md border border-primary/40 bg-primary/10 px-3 text-[12px] font-medium text-primary hover:bg-primary/15"
                      >
                        Apply changes
                      </button>
                    </footer>
                  </motion.section>
                </>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {consensusEditorOpen ? (
                <>
                  <motion.div
                    key="consensus-editor-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : NOTICE_ANIMATION_DURATION_S }}
                    onClick={() => setConsensusEditorOpen(false)}
                    className="fixed inset-0 z-[10000] bg-foreground/20"
                    aria-hidden="true"
                  />

                  <motion.section
                    key="consensus-editor"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Edit consensus prompt"
                    initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                    animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                    transition={{ duration: reduceMotion ? 0 : EDITOR_ANIMATION_DURATION_S, ease: 'easeOut' }}
                    className="fixed right-0 top-0 bottom-0 z-[10001] flex w-[min(92vw,400px)] flex-col border-l border-border bg-popover shadow-2xl"
                  >
                    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <div>
                        <h3 className="text-[15px] font-semibold text-foreground">Final Consensus</h3>
                        <p className="text-[11px] text-muted-foreground">consensus_final_answer</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConsensusEditorOpen(false)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Close editor"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </header>

                    <div className="flex-1 overflow-y-auto px-4 py-4">
                      <label className="mb-1 block text-[12px] text-muted-foreground">Prompt</label>
                      <textarea
                        value={consensusPromptDraft}
                        onChange={(e) => setConsensusPromptDraft(e.target.value)}
                        rows={14}
                        spellCheck={false}
                        placeholder="Instructions for the final consensus agent..."
                        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                      />
                    </div>

                    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setConsensusEditorOpen(false)}
                        className="inline-flex h-8 items-center rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveConsensusPrompt()}
                        disabled={consensusPromptSaving}
                        className="inline-flex h-8 items-center rounded-md border border-primary/40 bg-primary/10 px-3 text-[12px] font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {consensusPromptSaving ? 'Saving…' : 'Save'}
                      </button>
                    </footer>
                  </motion.section>
                </>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </AnimatePresence>,
      document.body
      )}
    </>
  )
}
