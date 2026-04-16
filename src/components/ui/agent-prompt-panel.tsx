import { AnimatePresence, motion } from 'motion/react'
import { Bot, ChevronDown, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

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

type Props = {
  selectedAgentId: string
  onAgentChange: (agentId: string) => void
}

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...base }
  if (internalPipelineToken) headers['X-Internal-Token'] = internalPipelineToken
  return headers
}

/* ── Create Agent Modal ────────────────────────────────────────────────────── */

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
        const body = await res.json().catch(() => ({})) as { error?: string }
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
        key="create-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
      />
      <motion.div
        key="create-modal"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      >
        <div className="w-full max-w-lg rounded-lg border border-border bg-popover p-5 shadow-2xl">
          <h3 className="mb-4 text-[15px] font-semibold text-foreground">Crear nuevo agente</h3>

          {error ? (
            <div role="alert" className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {error}
            </div>
          ) : null}

          <div className="mb-3">
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">ID (único, sin espacios)</label>
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
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Descripción (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descripción del agente..."
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Prompt (instruction_template)
            </label>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder="Escribe las instrucciones del agente. El contexto de la wiki y el ID del atleta se inyectan automáticamente."
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] leading-5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              La wiki del atleta y su ID se inyectan automáticamente por el backend.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !agentId.trim() || !name.trim() || !template.trim()}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 text-[13px] font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className={cn('h-3.5 w-3.5', saving && 'animate-pulse')} />
              {saving ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

/* ── Main Panel ────────────────────────────────────────────────────────────── */

export function AgentPromptPanel({ selectedAgentId, onAgentChange }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [activeAgentId, setActiveAgentId] = useState(selectedAgentId)
  const [record, setRecord] = useState<AgentRecord | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const inflightRef = useRef<AbortController | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  const fetchAgentList = useCallback(async () => {
    if (!apiBaseUrl) return
    try {
      const res = await fetch(`${apiBaseUrl}/agents`, {
        headers: authHeaders(),
      })
      if (!res.ok) return
      const data = (await res.json()) as { agents: AgentRecord[] }
      setAgents(data.agents ?? [])
    } catch {
      /* ignore */
    }
  }, [])

  const fetchAgent = useCallback(async (agentId: string) => {
    if (!apiBaseUrl) {
      setError('VITE_GCLOUD_ENDPOINT no está configurado.')
      return
    }

    inflightRef.current?.abort()
    const controller = new AbortController()
    inflightRef.current = controller

    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`${apiBaseUrl}/agents/${agentId}`, {
        headers: authHeaders(),
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as AgentRecord
      setRecord(data)
      setDraft(data.instruction_template ?? '')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar el agente.')
    } finally {
      if (inflightRef.current === controller) {
        setLoading(false)
        inflightRef.current = null
      }
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!apiBaseUrl || !activeAgentId) return
    if (!draft.trim()) {
      setError('El prompt no puede estar vacío.')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`${apiBaseUrl}/agents/${activeAgentId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ instruction_template: draft }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as AgentRecord
      setRecord(data)
      setDraft(data.instruction_template ?? draft)
      setNotice('Prompt guardado correctamente.')
      fetchAgentList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el prompt.')
    } finally {
      setSaving(false)
    }
  }, [activeAgentId, draft, fetchAgentList])

  const handleDelete = useCallback(async () => {
    if (!apiBaseUrl || !activeAgentId) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`${apiBaseUrl}/agents/${activeAgentId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      await fetchAgentList()
      const fallbackId = agents.find((a) => a.agent_id !== activeAgentId)?.agent_id ?? 'wiki_research_chat'
      setActiveAgentId(fallbackId)
      onAgentChange(fallbackId)
      fetchAgent(fallbackId)
      setNotice('Agente eliminado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar agente.')
    } finally {
      setDeleting(false)
    }
  }, [activeAgentId, agents, fetchAgent, fetchAgentList, onAgentChange])

  const handleReset = useCallback(() => {
    if (record) {
      setDraft(record.instruction_template ?? '')
      setNotice(null)
      setError(null)
    }
  }, [record])

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      setActiveAgentId(agentId)
      onAgentChange(agentId)
      setSelectorOpen(false)
      fetchAgent(agentId)
    },
    [fetchAgent, onAgentChange],
  )

  const handleCreated = useCallback(
    (newRecord: AgentRecord) => {
      setShowCreate(false)
      setAgents((prev) => [...prev, newRecord])
      setActiveAgentId(newRecord.agent_id)
      onAgentChange(newRecord.agent_id)
      setRecord(newRecord)
      setDraft(newRecord.instruction_template ?? '')
      setNotice('Agente creado correctamente.')
    },
    [onAgentChange],
  )

  useEffect(() => {
    if (open) {
      fetchAgentList()
      fetchAgent(activeAgentId)
    }
  }, [open, fetchAgentList, fetchAgent, activeAgentId])

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (showCreate) {
          setShowCreate(false)
        } else if (selectorOpen) {
          setSelectorOpen(false)
        } else {
          setOpen(false)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, showCreate, selectorOpen])

  useEffect(() => {
    if (!open) triggerRef.current?.focus({ preventScroll: true })
  }, [open])

  const dirty = record ? draft !== (record.instruction_template ?? '') : Boolean(draft)
  const activeAgent = agents.find((a) => a.agent_id === activeAgentId)
  const canDelete = record && !record.is_default

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="agent-prompt-drawer"
        aria-label="Gestionar agentes"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bot className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{activeAgent?.name ?? 'Agentes'}</span>
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="agent-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'linear' }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
              aria-hidden="true"
            />
            <motion.aside
              key="agent-drawer"
              id="agent-prompt-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="agent-drawer-title"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(96vw,48rem)] flex-col border-l border-border bg-popover text-popover-foreground shadow-2xl"
            >
              {/* ── Header ── */}
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h2 id="agent-drawer-title" className="text-[15px] font-semibold text-foreground">
                    Agentes
                  </h2>
                  <span className="text-[12px] text-muted-foreground">
                    {agents.length}/{MAX_AGENTS}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {agents.length < MAX_AGENTS ? (
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      aria-label="Crear nuevo agente"
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[12px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Nuevo</span>
                    </button>
                  ) : null}
                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar panel"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </header>

              {/* ── Agent Selector ── */}
              <div className="border-b border-border px-4 py-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectorOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate">
                      {activeAgent?.name ?? activeAgentId}
                    </span>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', selectorOpen && 'rotate-180')} />
                  </button>

                  <AnimatePresence>
                    {selectorOpen ? (
                      <motion.ul
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
                      >
                        {agents.map((agent) => (
                          <li key={agent.agent_id}>
                            <button
                              type="button"
                              onClick={() => handleSelectAgent(agent.agent_id)}
                              className={cn(
                                'flex w-full flex-col gap-0.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted',
                                agent.agent_id === activeAgentId && 'bg-muted/60 font-medium',
                              )}
                            >
                              <span className="text-foreground">{agent.name ?? agent.agent_id}</span>
                              {agent.description ? (
                                <span className="text-[11px] text-muted-foreground line-clamp-1">{agent.description}</span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>

              {/* ── Body ── */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {record?.description ? (
                  <p className="mb-2 text-[13px] text-muted-foreground">{record.description}</p>
                ) : null}

                {error ? (
                  <div
                    role="alert"
                    className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
                  >
                    {error}
                  </div>
                ) : null}
                {notice ? (
                  <div className="mb-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-[13px] text-success">
                    {notice}
                  </div>
                ) : null}

                <label
                  htmlFor="agent-instruction-template"
                  className="mb-1 block text-[12px] font-medium text-muted-foreground"
                >
                  Prompt (instruction_template)
                </label>
                <textarea
                  id="agent-instruction-template"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={loading || saving}
                  spellCheck={false}
                  className={cn(
                    'h-[60vh] w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] leading-5 text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                  placeholder={loading ? 'Cargando…' : 'Escribe el prompt…'}
                />
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {record?.updated_at
                    ? `Última actualización: ${new Date(record.updated_at).toLocaleString()}`
                    : 'Sin modificaciones guardadas (se usa el prompt por defecto).'}
                </p>
              </div>

              {/* ── Footer ── */}
              <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                <div>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting || saving || loading}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-[13px] text-destructive transition-colors duration-80 hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className={cn('h-3.5 w-3.5', deleting && 'animate-pulse')} />
                      {deleting ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={!dirty || saving || loading}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-3 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Revertir
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!dirty || saving || loading || !draft.trim()}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 text-[13px] font-medium text-primary transition-colors duration-80 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className={cn('h-4 w-4', saving && 'animate-pulse')} aria-hidden="true" />
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </footer>
            </motion.aside>

            {/* ── Create Modal ── */}
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
