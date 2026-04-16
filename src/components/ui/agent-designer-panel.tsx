import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type NodeTypes,
  type ColorMode,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, Workflow, X } from 'lucide-react'

import AgentNode, { type AgentNodeData, type AgentNodeType } from '@/components/ui/agent-node'
import { cn } from '@/lib/utils'

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
const internalPipelineToken = (import.meta.env.VITE_INTERNAL_PIPELINE_TOKEN ?? '').trim()

const MAX_AGENTS = 5

type AgentRecord = {
  agent_id: string
  name?: string
  description?: string
  instruction_template: string
  is_default?: boolean
  updated_at?: string | null
  updated_by?: string | null
}

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...base }
  if (internalPipelineToken) headers['X-Internal-Token'] = internalPipelineToken
  return headers
}

/* ── Create Agent Inline Modal ─────────────────────────────────────────────── */

function CreateAgentModal({
  onCreated,
  onClose,
}: {
  onCreated: (record: AgentRecord) => void
  onClose: () => void
}) {
  const [agentId, setAgentId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!agentId.trim() || !name.trim() || !template.trim()) {
      setError('ID, nombre y prompt son obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${apiBaseUrl}/agents`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          agent_id: agentId.trim().toLowerCase().replace(/\s+/g, '_'),
          name: name.trim(),
          description: description.trim(),
          instruction_template: template,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as AgentRecord
      onCreated(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear agente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div
        key="create-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-foreground/40 backdrop-blur-sm"
      />
      <motion.div
        key="create-modal"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      >
        <div className="w-full max-w-lg rounded-lg border border-border bg-popover p-5 shadow-2xl">
          <h3 className="mb-4 text-[15px] font-semibold text-foreground">Crear nuevo agente</h3>

          {error ? (
            <div role="alert" className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {error}
            </div>
          ) : null}

          <div className="mb-3">
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">ID (unico, sin espacios)</label>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="mi_agente_custom"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mi Agente Custom"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Descripcion (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descripcion del agente..."
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Prompt</label>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="Instrucciones del agente..."
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] leading-5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !agentId.trim() || !name.trim() || !template.trim()}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 text-[13px] font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className={cn('h-3.5 w-3.5', saving && 'animate-pulse')} />
              {saving ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

/* ── Conversation Node (central hub) ──────────────────────────────────────── */

function ConversationNode() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/50 bg-primary/10 shadow-md">
      <Workflow className="h-6 w-6 text-primary" />
      <div className="absolute -bottom-6 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
        Conversacion
      </div>
      {/* Accepts connections from all agents */}
      <div className="absolute inset-0">
        {/* Multiple target handles around the circle */}
        {[Position.Left, Position.Right, Position.Top, Position.Bottom].map((pos) => (
          <Handle key={pos} type="target" position={pos} className="!h-3 !w-3 !rounded-full !border-2 !border-primary/50 !bg-primary/20" />
        ))}
      </div>
    </div>
  )
}

// Need to import Handle and Position for ConversationNode
import { Handle, Position } from '@xyflow/react'

/* ── Main Designer Panel ──────────────────────────────────────────────────── */

type Props = {
  isDark: boolean
  selectedAgentId: string
  onAgentChange: (agentId: string) => void
}

export function AgentDesignerPanel({ isDark, selectedAgentId, onAgentChange }: Props) {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      agent: AgentNode,
      conversation: ConversationNode,
    }),
    [],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
          },
          eds,
        ),
      )
    },
    [setEdges],
  )

  const handlePromptSave = useCallback(
    async (agentId: string, template: string) => {
      if (!apiBaseUrl) return
      const res = await fetch(`${apiBaseUrl}/agents/${agentId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ instruction_template: template }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }
      const updated = (await res.json()) as AgentRecord
      setAgents((prev) => prev.map((a) => (a.agent_id === agentId ? updated : a)))
      // Update node data
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === 'agent' && (n.data as AgentNodeData).agentId === agentId) {
            return {
              ...n,
              data: {
                ...n.data,
                instructionTemplate: updated.instruction_template,
              } as AgentNodeData,
            }
          }
          return n
        }),
      )
      setNotice('Prompt guardado.')
      setTimeout(() => setNotice(null), 2000)
    },
    [setNodes],
  )

  const buildNodesFromAgents = useCallback(
    (agentList: AgentRecord[]) => {
      // Conversation hub in center
      const centerX = 500
      const centerY = 300
      const convNode = {
        id: 'conversation-hub',
        type: 'conversation',
        position: { x: centerX - 32, y: centerY - 32 },
        data: {},
        draggable: true,
      }

      // Arrange agents in a circle around the hub
      const radius = 280
      const agentNodes = agentList.map((agent, i) => {
        const angle = (2 * Math.PI * i) / Math.max(agentList.length, 1) - Math.PI / 2
        const x = centerX + radius * Math.cos(angle) - 140
        const y = centerY + radius * Math.sin(angle) - 40

        return {
          id: agent.agent_id,
          type: 'agent' as const,
          position: { x, y },
          data: {
            agentId: agent.agent_id,
            name: agent.name ?? agent.agent_id,
            description: agent.description ?? '',
            instructionTemplate: agent.instruction_template,
            isDefault: agent.is_default ?? false,
            onPromptSave: handlePromptSave,
          } satisfies AgentNodeData,
        }
      })

      // Default edges: every agent connects to conversation hub
      const defaultEdges: Edge[] = agentList.map((agent) => ({
        id: `${agent.agent_id}-to-conv`,
        source: agent.agent_id,
        target: 'conversation-hub',
        animated: true,
        style: {
          stroke: agent.agent_id === selectedAgentId ? 'hsl(var(--primary))' : 'hsl(var(--border))',
          strokeWidth: agent.agent_id === selectedAgentId ? 2.5 : 1.5,
        },
      }))

      return {
        nodes: [convNode, ...agentNodes] as AgentNodeType[],
        edges: defaultEdges,
      }
    },
    [handlePromptSave, selectedAgentId],
  )

  const fetchAgents = useCallback(async () => {
    if (!apiBaseUrl) return
    try {
      const res = await fetch(`${apiBaseUrl}/agents`, { headers: authHeaders() })
      if (!res.ok) return
      const data = (await res.json()) as { agents: AgentRecord[] }
      const list = data.agents ?? []
      setAgents(list)
      const { nodes: n, edges: e } = buildNodesFromAgents(list)
      setNodes(n)
      setEdges(e)
    } catch {
      /* ignore */
    }
  }, [buildNodesFromAgents, setNodes, setEdges])

  useEffect(() => {
    if (open) fetchAgents()
  }, [open, fetchAgents])

  // Keyboard
  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (showCreate) {
          setShowCreate(false)
        } else {
          setOpen(false)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, showCreate])

  useEffect(() => {
    if (!open) triggerRef.current?.focus({ preventScroll: true })
  }, [open])

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: AgentNodeType) => {
      if (node.type === 'agent') {
        const agentId = (node.data as AgentNodeData).agentId
        onAgentChange(agentId)
        // Highlight edge of selected agent
        setEdges((eds) =>
          eds.map((e) => ({
            ...e,
            style: {
              stroke: e.source === agentId ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              strokeWidth: e.source === agentId ? 2.5 : 1.5,
            },
          })),
        )
      }
    },
    [onAgentChange, setEdges],
  )

  const handleCreated = useCallback(
    (record: AgentRecord) => {
      setShowCreate(false)
      setAgents((prev) => {
        const next = [...prev, record]
        const { nodes: n, edges: e } = buildNodesFromAgents(next)
        setNodes(n)
        setEdges(e)
        return next
      })
      onAgentChange(record.agent_id)
      setNotice('Agente creado.')
      setTimeout(() => setNotice(null), 2000)
    },
    [buildNodesFromAgents, onAgentChange, setNodes, setEdges],
  )

  const colorMode: ColorMode = isDark ? 'dark' : 'light'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Diseñar agentes"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Workflow className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Diseñar</span>
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
              {/* ── Header ── */}
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-[15px] font-semibold text-foreground">Diseñador de Agentes</h2>
                  <span className="text-[12px] text-muted-foreground">
                    {agents.length}/{MAX_AGENTS}
                  </span>
                </div>
                <div className="flex items-center gap-2">
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
                  {agents.length < MAX_AGENTS ? (
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Nuevo agente</span>
                    </button>
                  ) : null}
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

              {/* ── Canvas ── */}
              <div className="flex-1">
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
                  minZoom={0.3}
                  maxZoom={1.5}
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

              {/* ── Footer hint ── */}
              <footer className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                <span>Arrastra nodos para reorganizar</span>
                <span>Conecta agentes arrastrando desde los handles</span>
                <span>Click en un nodo para seleccionarlo como agente activo</span>
              </footer>
            </motion.div>

            <AnimatePresence>
              {showCreate ? (
                <CreateAgentModal
                  onCreated={handleCreated}
                  onClose={() => setShowCreate(false)}
                />
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
