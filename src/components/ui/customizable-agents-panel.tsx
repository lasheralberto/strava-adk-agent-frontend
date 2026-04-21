import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Copy,
  Globe,
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
const EDITOR_ENTER_Y_PX = 42
const EDITOR_EXIT_Y_PX = 56
const MOBILE_EDITOR_MEDIA_QUERY = '(max-width: 767px)'

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

  return {
    system,
    agents: agents.sort((a, b) => a.order - b.order),
  }
}

function definitionToToml(definition: DesignerDefinition): string {
  const agents = definition.agents.map((item, index) => ({
    id: item.id,
    name: item.name,
    type: 'llm',
    model: item.model || '',
    description: item.description || '',
    prompt: item.prompt || '',
    custom_type: '',
    sub_agents: [],
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

function buildFlowGraph(agents: AgentEntry[]): { nodes: FlowNode[]; edges: Edge[] } {
  const ordered = [...agents].sort((a, b) => a.order - b.order)
  const columnWidth = 280
  const agentsY = 96
  const consensusY = 340
  const apiY = 560
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

    nodes.push({
      id: '__api_endpoint__',
      type: 'agent',
      position: { x: centerX, y: apiY },
      data: {
        agentId: 'api_public_endpoint',
        name: 'Public API',
        type: 'api',
        promptPreview: 'GET /v1/ask — endpoint exposed to users',
        subAgentsCount: 0,
      },
    })
  }

  const edges: Edge[] = []

  if (ordered.length > 1) {
    for (let i = 0; i < ordered.length; i++) {
      const sourceAgent = ordered[i]
      const targetAgent = ordered[(i + 1) % ordered.length]
      edges.push({
        id: `iter__${sourceAgent.id}__${targetAgent.id}`,
        source: sourceAgent.id,
        target: targetAgent.id,
        type: 'smoothstep',
        label: i === ordered.length - 1 ? 'closes round' : 'iterates',
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.6 },
        labelStyle: { fill: 'hsl(var(--muted-foreground))', fontSize: 10 },
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: true,
      })
    }
  }

  for (const agent of ordered) {
    edges.push({
      id: `consensus__${agent.id}`,
      source: agent.id,
      target: '__consensus__',
      type: 'bezier',
      label: resolveOutputKey(agent),
      style: { stroke: 'hsl(var(--success))', strokeDasharray: '5 4' },
      labelStyle: { fill: 'hsl(var(--muted-foreground))', fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: true,
    })
  }

  if (ordered.length > 0) {
    edges.push({
      id: 'api__consensus__endpoint',
      source: '__consensus__',
      target: '__api_endpoint__',
      type: 'smoothstep',
      label: 'final response',
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.6, strokeDasharray: '6 3' },
      labelStyle: { fill: 'hsl(var(--muted-foreground))', fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: false,
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
  })

  const [activeAgentId, setActiveAgentId] = useState(selectedAgentId)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorDraft, setEditorDraft] = useState<AgentEntry | null>(null)
  const [isMobileEditorViewport, setIsMobileEditorViewport] = useState(false)
  const [curlPanelOpen, setCurlPanelOpen] = useState(false)
  const [curlCopied, setCurlCopied] = useState(false)

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

  const flowGraph = useMemo(() => buildFlowGraph(orderedAgents), [orderedAgents])
  const [flowNodes, setFlowNodes] = useState(() => flowGraph.nodes)
  useEffect(() => { setFlowNodes(flowGraph.nodes) }, [flowGraph.nodes])
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setFlowNodes((nds) => applyNodeChanges(changes, nds) as FlowNode[]),
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
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(MOBILE_EDITOR_MEDIA_QUERY)

    const updateViewport = () => {
      setIsMobileEditorViewport(mediaQuery.matches)
    }

    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)
    return () => mediaQuery.removeEventListener('change', updateViewport)
  }, [])

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

      setDefinition((cur) => ({ ...cur, agents: cleaned }))

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
    setCurlPanelOpen(false)
    setOpen(false)
  }, [closeEditor])

  const handleCopyCurl = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCurlCopied(true)
      setTimeout(() => setCurlCopied(false), 2000)
    })
  }, [])

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
                'fixed inset-0 z-50 flex h-screen w-screen flex-col bg-popover text-popover-foreground',
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

              {/* ── Body: sidebar + canvas ── */}
              {loading ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
                    <p className="text-[13px] text-muted-foreground">Loading agent definition...</p>
                  </div>
                </div>
              ) : (
              <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[260px_1fr]">
                {/* ── Sidebar ── */}
                <aside className="flex flex-col border-b border-border p-3 md:border-b-0 md:border-r md:overflow-y-auto">
                  {/* Agent list */}
                  <section className="rounded-md border border-border bg-background/40 p-2">
                    <div className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Agents
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
                                onClick={() => handleMoveAgent(item.id, -1)}
                                disabled={orderedAgents[0]?.id === item.id}
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Move up"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveAgent(item.id, 1)}
                                disabled={orderedAgents[orderedAgents.length - 1]?.id === item.id}
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Move down"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditorFor(item.id)}
                                className="inline-flex h-6 items-center rounded border border-border px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAgent(item.id)}
                                disabled={orderedAgents.length <= 1}
                                className="inline-flex h-6 items-center rounded border border-destructive/40 px-2 text-[10px] text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                </aside>

                {/* ── Main canvas pane ── */}
                <section className="flex flex-col p-3 md:p-4">
                  <div className="rounded-md border border-border bg-background/40 p-3">
                    <div className="mb-2 text-[12px] text-muted-foreground">
                      Automatic flow: agents iterate among themselves for {CONSENSUS_ROUNDS} rounds and then pass their outputs to the final consensus node.
                    </div>
                    <div className="h-[52vh] min-h-[320px] overflow-hidden rounded-md border border-border bg-background md:h-[62vh] md:min-h-[420px]">
                      <ReactFlow
                        nodes={flowNodes}
                        edges={flowGraph.edges}
                        onNodesChange={onNodesChange}
                        nodeTypes={flowNodeTypes}
                        fitView
                        nodesDraggable={true}
                        nodesConnectable={false}
                        edgesFocusable
                        elementsSelectable
                        onNodeClick={(_, node) => {
                          if (node.id === '__consensus__') return
                          if (node.id === '__api_endpoint__') {
                            setCurlPanelOpen(true)
                            return
                          }
                          setActiveAndNotify(node.id)
                        }}
                        onNodeDoubleClick={(_, node) => {
                          if (node.id === '__consensus__') return
                          if (node.id === '__api_endpoint__') {
                            setCurlPanelOpen(true)
                            return
                          }
                          openEditorFor(node.id)
                        }}
                        className="bg-background"
                      >
                        <Background gap={18} size={1} color="hsl(var(--border))" />
                        <Controls showInteractive={false} />
                      </ReactFlow>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                        <span className="inline-block h-2 w-4 rounded-sm bg-primary" />
                        Agent iteration
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                        <span className="inline-block h-2 w-4 rounded-sm border border-success bg-transparent" />
                        Output to consensus
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                        <Globe className="h-2.5 w-2.5 text-violet-500" />
                        Public API — click to see curl
                      </span>
                    </div>
                  </div>
                </section>
              </div>
              )}
            </motion.aside>

            <AnimatePresence>
              {curlPanelOpen ? (() => {
                const curlSnippet = `curl -X GET \\
  "${apiBaseUrl}/v1/ask?question=How+much+did+I+run+this+week?&strava_athlete_id=YOUR_ATHLETE_ID" \\
  -H "Authorization: Bearer YOUR_STRAVA_ACCESS_TOKEN" \\
  -H "Accept: application/json"`
                return (
                  <>
                    <motion.div
                      key="curl-backdrop"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0 : NOTICE_ANIMATION_DURATION_S }}
                      onClick={() => setCurlPanelOpen(false)}
                      className="fixed inset-0 z-[60] bg-foreground/40"
                      aria-hidden="true"
                    />

                    <div className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-4">
                      <motion.section
                        key="curl-panel"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Curl code for public API"
                        initial={
                          reduceMotion
                            ? { opacity: 0 }
                            : isMobileEditorViewport
                              ? { opacity: 0, y: '100%' }
                              : { opacity: 0, y: EDITOR_ENTER_Y_PX }
                        }
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={
                          reduceMotion
                            ? { opacity: 0 }
                            : isMobileEditorViewport
                              ? { opacity: 0, y: '100%' }
                              : { opacity: 0, y: EDITOR_EXIT_Y_PX }
                        }
                        transition={{ duration: reduceMotion ? 0 : EDITOR_ANIMATION_DURATION_S, ease: 'easeOut' }}
                        className="pointer-events-auto w-full max-h-[88dvh] overflow-y-auto rounded-t-2xl border border-violet-500/30 bg-popover p-4 pb-6 shadow-2xl md:w-[min(92vw,38rem)] md:max-h-[86vh] md:rounded-xl md:pb-4"
                      >
                        <header className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-violet-500" aria-hidden="true" />
                            <div>
                              <h3 className="text-[15px] font-semibold text-foreground">Public API</h3>
                              <p className="text-[11px] text-muted-foreground">GET {apiBaseUrl}/v1/ask</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCurlPanelOpen(false)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Close curl panel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </header>

                        <div className="space-y-4">
                          <p className="text-[12px] text-muted-foreground">
                            Public endpoint that returns the same response as <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/chat</code>. No internal token required — use your Strava access token in the <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">Authorization</code> header.
                          </p>

                          <div>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Curl example
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyCurl(curlSnippet)}
                                className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                {curlCopied ? (
                                  <><Check className="h-3 w-3 text-success" /> Copied</>
                                ) : (
                                  <><Copy className="h-3 w-3" /> Copy</>
                                )}
                              </button>
                            </div>
                            <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                              {curlSnippet}
                            </pre>
                          </div>

                          <div className="rounded-md border border-border bg-background/60 p-3 text-[11px] text-muted-foreground space-y-1.5">
                            <p className="font-semibold text-foreground text-[12px]">Parameters</p>
                            <div className="grid grid-cols-[1fr_2fr] gap-x-3 gap-y-1">
                              <span className="font-mono text-violet-500">question</span>
                              <span>Question to the agent (query param, required)</span>
                              <span className="font-mono text-violet-500">strava_athlete_id</span>
                              <span>Strava athlete ID (query param, required)</span>
                              <span className="font-mono text-violet-500">model</span>
                              <span>LLM model (query param, optional)</span>
                              <span className="font-mono text-violet-500">top_k</span>
                              <span>Wiki results to retrieve (query param, optional)</span>
                              <span className="font-mono text-violet-500">Authorization</span>
                              <span>Bearer YOUR_STRAVA_ACCESS_TOKEN (header, required)</span>
                            </div>
                          </div>

                          <div className="rounded-md border border-border bg-background/60 p-3 text-[11px] text-muted-foreground">
                            <p className="font-semibold text-foreground text-[12px] mb-1">Response</p>
                            <pre className="font-mono text-[10px] leading-relaxed">{`{
  "response": "This week you ran 42 km...",
  "tool_calls": [...],
  "structured": { ... }
}`}</pre>
                          </div>
                        </div>
                      </motion.section>
                    </div>
                  </>
                )
              })() : null}
            </AnimatePresence>

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
                    className="fixed inset-0 z-[60] bg-foreground/40"
                    aria-hidden="true"
                  />

                  <div className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-4">
                    <motion.section
                      key="agent-editor"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Edit agent"
                      initial={
                        reduceMotion
                          ? { opacity: 0 }
                          : isMobileEditorViewport
                            ? { opacity: 0, y: '100%' }
                            : { opacity: 0, y: EDITOR_ENTER_Y_PX }
                      }
                      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      exit={
                        reduceMotion
                          ? { opacity: 0 }
                          : isMobileEditorViewport
                            ? { opacity: 0, y: '100%' }
                            : { opacity: 0, y: EDITOR_EXIT_Y_PX }
                      }
                      transition={{ duration: reduceMotion ? 0 : EDITOR_ANIMATION_DURATION_S, ease: 'easeOut' }}
                      className="pointer-events-auto w-full max-h-[88dvh] overflow-y-auto rounded-t-2xl border border-border bg-popover p-4 pb-6 shadow-2xl md:w-[min(92vw,34rem)] md:max-h-[86vh] md:rounded-xl md:pb-4"
                    >
                    <header className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-[15px] font-semibold text-foreground">Edit agent</h3>
                        <p className="text-[11px] text-muted-foreground">{editorDraft.id}</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeEditor}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Close editor"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </header>

                    <div className="space-y-3">
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
                          rows={7}
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
                          <option value="">Default model (env)</option>
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

                    </div>

                    <footer className="mt-4 flex items-center justify-end gap-2">
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
                  </div>
                </>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
