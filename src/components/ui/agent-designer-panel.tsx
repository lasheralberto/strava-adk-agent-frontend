import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type ColorMode,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  BackgroundVariant,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Plus, Save, Workflow, X } from 'lucide-react'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

import AgentNode, { type AgentNodeData, type AgentNodeType } from '@/components/ui/agent-node'
import { cn } from '@/lib/utils'

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
const internalPipelineToken = (import.meta.env.VITE_INTERNAL_PIPELINE_TOKEN ?? '').trim()

const MAX_AGENTS = 10
const CONVERSATION_NODE_ID = '__conversation__'
const ENTRYPOINT_EDGE_PREFIX = 'entrypoint:'
const DELEGATION_EDGE_PREFIX = 'delegation:'

type PlannerMode = 'always' | 'full_only' | 'off'
type SourceType = 'instruction' | 'skill'

type AgentDefinitionResponse = {
  athlete_id: string
  toml_content: string
  version: number
  is_default: boolean
  updated_at: string | null
}

type DesignerAgent = {
  id: string
  name: string
  description: string
  sourceType: SourceType
  instruction: string
  skill: string
  model: string
  tools: string[]
  sub_agents: string[]
  planner: boolean
  wiki_context: boolean
  ui: {
    x: number
    y: number
  } | null
}

type DesignerSystem = {
  entrypoint: string
  model: string
  planner_mode: PlannerMode
}

type DesignerDefinition = {
  system: DesignerSystem
  agents: Record<string, DesignerAgent>
}

type ConversationNodeType = Node<Record<string, never>, 'conversation'>
type DesignerNode = AgentNodeType | ConversationNodeType

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
  if (typeof value === 'string') {
    return value
  }
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

  return Array.from(new Set(normalized))
}

function normalizePlannerMode(value: string): PlannerMode {
  if (value === 'always' || value === 'off' || value === 'full_only') {
    return value
  }
  return 'full_only'
}

function normalizeAgentId(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((item, index) => item === right[index])
}

function delegationEdgeId(source: string, target: string): string {
  return `${DELEGATION_EDGE_PREFIX}${source}->${target}`
}

function entrypointEdgeId(source: string): string {
  return `${ENTRYPOINT_EDGE_PREFIX}${source}->${CONVERSATION_NODE_ID}`
}

function isEntrypointEdge(edge: Edge): boolean {
  return edge.id.startsWith(ENTRYPOINT_EDGE_PREFIX)
}

function createAgentNodeData(agent: DesignerAgent): AgentNodeData {
  return {
    agentId: agent.id,
    name: agent.name,
    description: agent.description,
    hasInstruction: Boolean(agent.instruction.trim()) && agent.sourceType === 'instruction',
    hasSkill: Boolean(agent.skill.trim()) && agent.sourceType === 'skill',
    toolsCount: agent.tools.length,
    planner: agent.planner,
    wikiContext: agent.wiki_context,
  }
}

function parseTomlDefinition(tomlContent: string): DesignerDefinition {
  const parsed = parseToml(tomlContent)
  const root = isRecord(parsed) ? parsed : {}

  const systemRaw = isRecord(root.system) ? root.system : {}
  const system: DesignerSystem = {
    entrypoint: asString(systemRaw.entrypoint),
    model: asString(systemRaw.model),
    planner_mode: normalizePlannerMode(asString(systemRaw.planner_mode, 'full_only')),
  }

  const agentsRaw = Array.isArray(root.agents) ? root.agents : []
  const agents: Record<string, DesignerAgent> = {}

  for (const candidate of agentsRaw) {
    if (!isRecord(candidate)) {
      continue
    }

    const agentId = normalizeAgentId(asString(candidate.id))
    if (!agentId) {
      continue
    }

    const instruction = asString(candidate.instruction)
    const skill = asString(candidate.skill)
    const sourceType: SourceType = skill.trim() && !instruction.trim() ? 'skill' : 'instruction'

    agents[agentId] = {
      id: agentId,
      name: asString(candidate.name, agentId),
      description: asString(candidate.description),
      sourceType,
      instruction,
      skill,
      model: asString(candidate.model),
      tools: asStringArray(candidate.tools),
      sub_agents: asStringArray(candidate.sub_agents),
      planner: Boolean(candidate.planner),
      wiki_context: Boolean(candidate.wiki_context),
      ui: isRecord(candidate.ui)
        ? {
            x: asNumber(candidate.ui.x),
            y: asNumber(candidate.ui.y),
          }
        : null,
    }
  }

  if (!system.entrypoint && Object.keys(agents).length > 0) {
    system.entrypoint = Object.keys(agents)[0]
  }

  return { system, agents }
}

function buildGraphFromDefinition(definition: DesignerDefinition): {
  nodes: DesignerNode[]
  edges: Edge[]
} {
  const agents = Object.values(definition.agents)

  const centerX = 500
  const centerY = 320
  const fallbackRadius = 260

  const agentNodes: AgentNodeType[] = agents.map((agent, index) => {
    const angle = (2 * Math.PI * index) / Math.max(agents.length, 1) - Math.PI / 2
    const fallbackPosition = {
      x: centerX + fallbackRadius * Math.cos(angle) - 135,
      y: centerY + fallbackRadius * Math.sin(angle) - 55,
    }

    const position = agent.ui
      ? {
          x: asNumber(agent.ui.x, fallbackPosition.x),
          y: asNumber(agent.ui.y, fallbackPosition.y),
        }
      : fallbackPosition

    return {
      id: agent.id,
      type: 'agent',
      position,
      data: createAgentNodeData(agent),
    }
  })

  const conversationNode: ConversationNodeType = {
    id: CONVERSATION_NODE_ID,
    type: 'conversation',
    position: { x: centerX - 34, y: centerY - 34 },
    data: {},
    draggable: true,
    deletable: false,
  }

  const edges: Edge[] = []

  for (const agent of agents) {
    for (const subAgentId of agent.sub_agents) {
      if (!definition.agents[subAgentId]) {
        continue
      }
      edges.push({
        id: delegationEdgeId(agent.id, subAgentId),
        source: agent.id,
        target: subAgentId,
        animated: true,
        style: { stroke: 'hsl(var(--border))', strokeWidth: 1.8 },
      })
    }
  }

  if (definition.system.entrypoint && definition.agents[definition.system.entrypoint]) {
    edges.push({
      id: entrypointEdgeId(definition.system.entrypoint),
      source: definition.system.entrypoint,
      target: CONVERSATION_NODE_ID,
      animated: true,
      selectable: false,
      deletable: false,
      style: {
        stroke: 'hsl(var(--success))',
        strokeWidth: 2.4,
        strokeDasharray: '5 4',
      },
    })
  }

  return {
    nodes: [conversationNode, ...agentNodes],
    edges,
  }
}

function collectSubAgentsFromEdges(edges: Edge[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}

  for (const edge of edges) {
    if (edge.target === CONVERSATION_NODE_ID) {
      continue
    }

    if (!map[edge.source]) {
      map[edge.source] = []
    }

    if (!map[edge.source].includes(edge.target)) {
      map[edge.source].push(edge.target)
    }
  }

  return map
}

function definitionToToml(definition: DesignerDefinition, nodes: Node[]): string {
  const nodeOrder = nodes
    .filter((node) => node.type === 'agent')
    .map((node) => node.id)

  const fallbackOrder = Object.keys(definition.agents)
  const orderedIds = Array.from(new Set([...nodeOrder, ...fallbackOrder]))

  const positionById = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    if (node.type !== 'agent') {
      continue
    }
    positionById.set(node.id, {
      x: Number(node.position.x.toFixed(1)),
      y: Number(node.position.y.toFixed(1)),
    })
  }

  const agents = orderedIds
    .map((agentId) => definition.agents[agentId])
    .filter(Boolean)
    .map((agent) => {
      const payload: Record<string, unknown> = {
        id: agent.id,
        name: agent.name || agent.id,
      }

      if (agent.description.trim()) {
        payload.description = agent.description.trim()
      }

      if (agent.sourceType === 'skill') {
        if (agent.skill.trim()) {
          payload.skill = agent.skill.trim()
        }
      } else if (agent.instruction.trim()) {
        payload.instruction = agent.instruction
      }

      if (agent.model.trim()) {
        payload.model = agent.model.trim()
      }

      if (agent.tools.length > 0) {
        payload.tools = agent.tools
      }

      if (agent.sub_agents.length > 0) {
        payload.sub_agents = agent.sub_agents
      }

      if (agent.planner) {
        payload.planner = true
      }

      if (agent.wiki_context) {
        payload.wiki_context = true
      }

      const position = positionById.get(agent.id)
      if (position) {
        payload.ui = {
          x: position.x,
          y: position.y,
        }
      } else if (agent.ui) {
        payload.ui = {
          x: Number(agent.ui.x.toFixed(1)),
          y: Number(agent.ui.y.toFixed(1)),
        }
      }

      return payload
    })

  const tomlObject: Record<string, unknown> = {
    system: {
      entrypoint: definition.system.entrypoint,
      model: definition.system.model,
      planner_mode: definition.system.planner_mode,
    },
    agents,
  }

  return stringifyToml(tomlObject)
}

function ConversationNode() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-success/50 bg-success/10 shadow-md">
      <Workflow className="h-6 w-6 text-success" />
      <div className="absolute -bottom-6 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
        Conversacion
      </div>
      <div className="absolute inset-0">
        {[Position.Left, Position.Right, Position.Top, Position.Bottom].map((pos) => (
          <Handle
            key={pos}
            type="target"
            position={pos}
            className="!h-3 !w-3 !rounded-full !border-2 !border-success/50 !bg-success/20"
          />
        ))}
      </div>
    </div>
  )
}

export function AgentDesignerPanel({ isDark, athleteId, selectedAgentId, onAgentChange }: Props) {
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
    system: {
      entrypoint: '',
      model: '',
      planner_mode: 'full_only',
    },
    agents: {},
  })

  const [selectedNodeId, setSelectedNodeId] = useState(selectedAgentId)

  const [nodes, setNodes, onNodesChange] = useNodesState<DesignerNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      agent: AgentNode,
      conversation: ConversationNode,
    }),
    [],
  )

  const colorMode: ColorMode = isDark ? 'dark' : 'light'

  const selectedAgent = definition.agents[selectedNodeId] ?? null
  const canAddAgent = Object.keys(definition.agents).length < MAX_AGENTS

  const syncNodeMetadata = useCallback(
    (nextAgents: Record<string, DesignerAgent>) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.type !== 'agent') {
            return node
          }

          const agent = nextAgents[node.id]
          if (!agent) {
            return node
          }

          return {
            ...node,
            data: createAgentNodeData(agent),
          }
        }),
      )
    },
    [setNodes],
  )

  const fetchDefinition = useCallback(async () => {
    if (!apiBaseUrl || athleteId === null || athleteId <= 0) {
      return
    }

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

      const graph = buildGraphFromDefinition(parsed)
      setNodes(graph.nodes)
      setEdges(graph.edges)

      const preferred = parsed.agents[selectedAgentId]
        ? selectedAgentId
        : parsed.system.entrypoint || Object.keys(parsed.agents)[0] || ''

      if (preferred) {
        setSelectedNodeId(preferred)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la definicion del atleta.')
    } finally {
      setLoading(false)
    }
  }, [athleteId, selectedAgentId, setEdges, setNodes])

  useEffect(() => {
    if (open) {
      fetchDefinition()
    }
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
    if (!open) {
      triggerRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    setSelectedNodeId(selectedAgentId)
  }, [selectedAgentId])

  useEffect(() => {
    setDefinition((currentDefinition) => {
      const subAgentMap = collectSubAgentsFromEdges(edges)
      let changed = false

      const nextAgents: Record<string, DesignerAgent> = {}
      for (const [agentId, agent] of Object.entries(currentDefinition.agents)) {
        const nextSubAgents = subAgentMap[agentId] ?? []
        if (!arraysEqual(agent.sub_agents, nextSubAgents)) {
          changed = true
        }
        nextAgents[agentId] = {
          ...agent,
          sub_agents: nextSubAgents,
        }
      }

      if (!changed) {
        return currentDefinition
      }

      syncNodeMetadata(nextAgents)

      return {
        ...currentDefinition,
        agents: nextAgents,
      }
    })
  }, [edges, syncNodeMetadata])

  const setEntrypoint = useCallback(
    (entrypoint: string) => {
      setDefinition((currentDefinition) => ({
        ...currentDefinition,
        system: {
          ...currentDefinition.system,
          entrypoint,
        },
      }))

      setEdges((currentEdges) => {
        const withoutEntrypoint = currentEdges.filter((edge) => !isEntrypointEdge(edge))
        if (!entrypoint) {
          return withoutEntrypoint
        }

        return [
          ...withoutEntrypoint,
          {
            id: entrypointEdgeId(entrypoint),
            source: entrypoint,
            target: CONVERSATION_NODE_ID,
            animated: true,
            selectable: false,
            deletable: false,
            style: {
              stroke: 'hsl(var(--success))',
              strokeWidth: 2.4,
              strokeDasharray: '5 4',
            },
          },
        ]
      })
    },
    [setEdges],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection
      if (!source || !target || source === target) {
        return
      }

      if (target === CONVERSATION_NODE_ID && definition.agents[source]) {
        setEntrypoint(source)
        return
      }

      if (!definition.agents[source] || !definition.agents[target]) {
        return
      }

      const id = delegationEdgeId(source, target)

      setEdges((currentEdges) => {
        if (currentEdges.some((edge) => edge.id === id)) {
          return currentEdges
        }

        return addEdge(
          {
            id,
            source,
            target,
            animated: true,
            style: { stroke: 'hsl(var(--border))', strokeWidth: 1.8 },
          },
          currentEdges,
        )
      })
    },
    [definition.agents, setEdges, setEntrypoint],
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type !== 'agent') {
        return
      }
      setSelectedNodeId(node.id)
      onAgentChange(node.id)
    },
    [onAgentChange],
  )

  const updateSelectedAgent = useCallback(
    (updater: (agent: DesignerAgent) => DesignerAgent) => {
      if (!selectedAgent) {
        return
      }

      setDefinition((currentDefinition) => {
        const current = currentDefinition.agents[selectedAgent.id]
        if (!current) {
          return currentDefinition
        }

        const nextAgent = updater(current)
        const nextAgents = {
          ...currentDefinition.agents,
          [nextAgent.id]: nextAgent,
        }

        syncNodeMetadata(nextAgents)

        return {
          ...currentDefinition,
          agents: nextAgents,
        }
      })
    },
    [selectedAgent, syncNodeMetadata],
  )

  const handleAddAgent = useCallback(() => {
    if (!canAddAgent) {
      setError(`Solo se permiten ${MAX_AGENTS} agentes por atleta.`)
      return
    }

    const existing = new Set(Object.keys(definition.agents))
    let candidateId = 'agent_1'
    let index = 1
    while (existing.has(candidateId)) {
      index += 1
      candidateId = `agent_${index}`
    }

    const newAgent: DesignerAgent = {
      id: candidateId,
      name: `Agent ${index}`,
      description: '',
      sourceType: 'instruction',
      instruction: 'You are a helpful sub-agent.',
      skill: '',
      model: '',
      tools: [],
      sub_agents: [],
      planner: false,
      wiki_context: false,
      ui: null,
    }

    const nextAgents = {
      ...definition.agents,
      [candidateId]: newAgent,
    }

    setDefinition((currentDefinition) => ({
      ...currentDefinition,
      agents: nextAgents,
      system: {
        ...currentDefinition.system,
        entrypoint: currentDefinition.system.entrypoint || candidateId,
      },
    }))

    setNodes((currentNodes) => {
      const centerX = 520
      const centerY = 320
      return [
        ...currentNodes,
        {
          id: candidateId,
          type: 'agent',
          position: { x: centerX - 120 + index * 14, y: centerY - 55 + index * 10 },
          data: createAgentNodeData(newAgent),
        },
      ]
    })

    if (!definition.system.entrypoint) {
      setEntrypoint(candidateId)
    }

    setSelectedNodeId(candidateId)
    onAgentChange(candidateId)
    setNotice('Agente agregado al canvas.')
    setTimeout(() => setNotice(null), 2000)
  }, [canAddAgent, definition.agents, definition.system.entrypoint, onAgentChange, setEntrypoint, setNodes])

  const handleDeleteSelectedAgent = useCallback(() => {
    if (!selectedAgent) {
      return
    }

    const currentAgentIds = Object.keys(definition.agents)
    const remainingAgentIds = currentAgentIds.filter((agentId) => agentId !== selectedAgent.id)

    const nextAgents: Record<string, DesignerAgent> = {}
    for (const agentId of remainingAgentIds) {
      const current = definition.agents[agentId]
      nextAgents[agentId] = {
        ...current,
        sub_agents: current.sub_agents.filter((subId) => subId !== selectedAgent.id),
      }
    }

    const nextEntrypoint =
      definition.system.entrypoint === selectedAgent.id
        ? remainingAgentIds[0] ?? ''
        : definition.system.entrypoint

    setDefinition((currentDefinition) => ({
      ...currentDefinition,
      agents: nextAgents,
      system: {
        ...currentDefinition.system,
        entrypoint: nextEntrypoint,
      },
    }))

    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedAgent.id))
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.source !== selectedAgent.id && edge.target !== selectedAgent.id),
    )

    if (nextEntrypoint) {
      setEntrypoint(nextEntrypoint)
    }

    const nextSelected = remainingAgentIds[0] ?? ''
    setSelectedNodeId(nextSelected)
    if (nextSelected) {
      onAgentChange(nextSelected)
    }

    setNotice('Agente eliminado del sistema.')
    setTimeout(() => setNotice(null), 2000)
  }, [definition.agents, definition.system.entrypoint, onAgentChange, selectedAgent, setEntrypoint, setNodes, setEdges])

  const serializeCurrentDefinition = useCallback((): string => {
    return definitionToToml(definition, nodes)
  }, [definition, nodes])

  const validateTomlContent = useCallback(
    async (tomlContent: string): Promise<void> => {
      if (!apiBaseUrl || athleteId === null || athleteId <= 0) {
        throw new Error('Atleta invalido para validar definicion.')
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

      if (payload.valid) {
        return
      }

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
      const tomlContent = serializeCurrentDefinition()
      await validateTomlContent(tomlContent)
      setNotice('Definicion valida.')
      setTimeout(() => setNotice(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo validar la definicion.')
    } finally {
      setValidating(false)
    }
  }, [serializeCurrentDefinition, validateTomlContent])

  const handleSave = useCallback(async () => {
    if (!apiBaseUrl || athleteId === null || athleteId <= 0) {
      setError('No hay atleta activo para guardar esta definicion.')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const tomlContent = serializeCurrentDefinition()
      await validateTomlContent(tomlContent)

      const res = await fetch(`${apiBaseUrl}/agent-definition/${athleteId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          toml_content: tomlContent,
          version,
        }),
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
      setNotice('Sistema de agentes guardado.')
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la definicion.')
    } finally {
      setSaving(false)
    }
  }, [athleteId, serializeCurrentDefinition, validateTomlContent, version])

  const handleReload = useCallback(async () => {
    await fetchDefinition()
    setNotice('Cambios locales descartados.')
    setTimeout(() => setNotice(null), 2000)
  }, [fetchDefinition])

  const handleRestoreDefault = useCallback(async () => {
    if (!apiBaseUrl || athleteId === null || athleteId <= 0) {
      setError('No hay atleta activo para restaurar la definicion.')
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
      setNotice('Se restauro la definicion por defecto.')
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restaurar la definicion por defecto.')
    } finally {
      setRestoringDefault(false)
    }
  }, [athleteId, fetchDefinition])

  const disabled = athleteId === null || athleteId <= 0 || !apiBaseUrl

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="Disenar agentes"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Workflow className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Disenar</span>
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="designer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
            />

            <motion.div
              key="designer-panel"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl sm:inset-8"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-[15px] font-semibold text-foreground">Diseñador de Agentes</h2>
                  <span className="text-[12px] text-muted-foreground">
                    {Object.keys(definition.agents).length}/{MAX_AGENTS}
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
                    Recargar
                  </button>

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || validating || loading || Object.keys(definition.agents).length === 0}
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
                    aria-label="Cerrar diseñador"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>

              {error ? (
                <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-[12px] text-destructive">
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {error}
                  </span>
                </div>
              ) : null}

              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_340px]">
                <div className="min-h-0 border-b border-border lg:border-b-0 lg:border-r">
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={handleNodeClick}
                    nodeTypes={nodeTypes}
                    colorMode={colorMode}
                    fitView
                    fitViewOptions={{ padding: 0.3 }}
                    minZoom={0.25}
                    maxZoom={1.6}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                    <Controls showInteractive={false} />
                    <MiniMap
                      nodeStrokeWidth={3}
                      zoomable
                      pannable
                      className="!rounded-md !border !border-border !bg-muted/60"
                    />
                  </ReactFlow>
                </div>

                <aside className="flex min-h-0 flex-col overflow-y-auto border-border p-3">
                  <section className="mb-4 rounded-md border border-border bg-background/40 p-3">
                    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Sistema
                    </h3>

                    <label className="mb-2 block text-[12px] text-muted-foreground">Entrypoint</label>
                    <select
                      value={definition.system.entrypoint}
                      onChange={(event) => setEntrypoint(event.target.value)}
                      className="mb-3 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                    >
                      <option value="">Selecciona entrypoint</option>
                      {Object.keys(definition.agents).map((agentId) => (
                        <option key={agentId} value={agentId}>
                          {agentId}
                        </option>
                      ))}
                    </select>

                    <label className="mb-2 block text-[12px] text-muted-foreground">Planner mode</label>
                    <select
                      value={definition.system.planner_mode}
                      onChange={(event) =>
                        setDefinition((currentDefinition) => ({
                          ...currentDefinition,
                          system: {
                            ...currentDefinition.system,
                            planner_mode: normalizePlannerMode(event.target.value),
                          },
                        }))
                      }
                      className="mb-3 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                    >
                      <option value="full_only">full_only</option>
                      <option value="always">always</option>
                      <option value="off">off</option>
                    </select>

                    <label className="mb-1 block text-[12px] text-muted-foreground">Modelo por sistema</label>
                    <input
                      type="text"
                      value={definition.system.model}
                      onChange={(event) =>
                        setDefinition((currentDefinition) => ({
                          ...currentDefinition,
                          system: {
                            ...currentDefinition.system,
                            model: event.target.value,
                          },
                        }))
                      }
                      placeholder="vacio = modelo de entorno"
                      className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                    />
                  </section>

                  <section className="rounded-md border border-border bg-background/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Agente
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

                    {!selectedAgent ? (
                      <p className="text-[12px] text-muted-foreground">
                        Selecciona un nodo de agente para editar sus propiedades.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">ID</label>
                          <input
                            type="text"
                            value={selectedAgent.id}
                            disabled
                            className="h-8 w-full rounded-md border border-border bg-muted px-2 text-[12px] text-muted-foreground"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">Nombre</label>
                          <input
                            type="text"
                            value={selectedAgent.name}
                            onChange={(event) =>
                              updateSelectedAgent((agent) => ({
                                ...agent,
                                name: event.target.value,
                              }))
                            }
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">Descripcion</label>
                          <input
                            type="text"
                            value={selectedAgent.description}
                            onChange={(event) =>
                              updateSelectedAgent((agent) => ({
                                ...agent,
                                description: event.target.value,
                              }))
                            }
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">Source</label>
                          <select
                            value={selectedAgent.sourceType}
                            onChange={(event) => {
                              const nextSource = event.target.value === 'skill' ? 'skill' : 'instruction'
                              updateSelectedAgent((agent) => ({
                                ...agent,
                                sourceType: nextSource,
                                instruction: nextSource === 'instruction' ? agent.instruction : '',
                                skill: nextSource === 'skill' ? agent.skill : '',
                              }))
                            }}
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                          >
                            <option value="instruction">instruction</option>
                            <option value="skill">skill</option>
                          </select>
                        </div>

                        {selectedAgent.sourceType === 'instruction' ? (
                          <div>
                            <label className="mb-1 block text-[12px] text-muted-foreground">Instruction</label>
                            <textarea
                              value={selectedAgent.instruction}
                              onChange={(event) =>
                                updateSelectedAgent((agent) => ({
                                  ...agent,
                                  instruction: event.target.value,
                                }))
                              }
                              rows={6}
                              spellCheck={false}
                              className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="mb-1 block text-[12px] text-muted-foreground">Skill</label>
                            <input
                              type="text"
                              value={selectedAgent.skill}
                              onChange={(event) =>
                                updateSelectedAgent((agent) => ({
                                  ...agent,
                                  skill: normalizeAgentId(event.target.value),
                                }))
                              }
                              placeholder="intent-router"
                              className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                            />
                          </div>
                        )}

                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">Model override</label>
                          <input
                            type="text"
                            value={selectedAgent.model}
                            onChange={(event) =>
                              updateSelectedAgent((agent) => ({
                                ...agent,
                                model: event.target.value,
                              }))
                            }
                            placeholder="vacio = usa system.model"
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[12px] text-muted-foreground">Tools (CSV)</label>
                          <input
                            type="text"
                            value={selectedAgent.tools.join(', ')}
                            onChange={(event) =>
                              updateSelectedAgent((agent) => ({
                                ...agent,
                                tools: event.target.value
                                  .split(',')
                                  .map((tool) => tool.trim())
                                  .filter(Boolean),
                              }))
                            }
                            placeholder="run_query_pipeline"
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2 text-[12px] text-muted-foreground">
                          <label className="inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={selectedAgent.planner}
                              onChange={(event) =>
                                updateSelectedAgent((agent) => ({
                                  ...agent,
                                  planner: event.target.checked,
                                }))
                              }
                            />
                            planner
                          </label>

                          <label className="inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={selectedAgent.wiki_context}
                              onChange={(event) =>
                                updateSelectedAgent((agent) => ({
                                  ...agent,
                                  wiki_context: event.target.checked,
                                }))
                              }
                            />
                            wiki_context
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={handleDeleteSelectedAgent}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 px-2 text-[12px] text-destructive hover:bg-destructive/15"
                        >
                          Eliminar agente
                        </button>
                      </div>
                    )}
                  </section>
                </aside>
              </div>

              <footer className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                <span>Conecta agente -&gt; agente para delegacion (sub_agents)</span>
                <span>Conecta agente -&gt; Conversacion para definir entrypoint</span>
                <span>La posicion se guarda como [agents.ui] en TOML</span>
              </footer>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
