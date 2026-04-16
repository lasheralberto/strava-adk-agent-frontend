import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Plus, Save, Trash2, Workflow, X } from 'lucide-react'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

import { cn } from '@/lib/utils'

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

type PlannerMode = 'always' | 'full_only' | 'off'

type AgentDefinitionResponse = {
  athlete_id: string
  toml_content: string
  version: number
  is_default: boolean
  updated_at: string | null
}

type PromptAgent = {
  id: string
  prompt: string
  order: number
}

type DesignerDefinition = {
  system: {
    entrypoint: 'orchestrator'
    model: string
    planner_mode: PlannerMode
  }
  promptAgents: PromptAgent[]
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
  if (typeof value === 'string') {
    return value
  }
  return fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizePlannerMode(value: string): PlannerMode {
  if (value === 'always' || value === 'off' || value === 'full_only') {
    return value
  }
  return 'full_only'
}

function normalizeAgentId(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  return normalized || fallback
}

function promptPreview(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return 'Sin prompt'
  }
  if (compact.length <= 72) {
    return compact
  }
  return `${compact.slice(0, 69)}...`
}

function dedupePromptAgents(promptAgents: PromptAgent[]): PromptAgent[] {
  const seen = new Set<string>()
  return promptAgents.map((item, index) => {
    let candidate = item.id
    let suffix = 1
    while (seen.has(candidate) || RESERVED_AGENT_IDS.has(candidate)) {
      suffix += 1
      candidate = `${item.id}_${suffix}`
    }
    seen.add(candidate)
    return {
      id: candidate,
      prompt: item.prompt,
      order: item.order || index + 1,
    }
  })
}

function parseTomlDefinition(tomlContent: string): DesignerDefinition {
  const parsed = parseToml(tomlContent)
  const root = isRecord(parsed) ? parsed : {}

  const systemRaw = isRecord(root.system) ? root.system : {}
  const system: DesignerDefinition['system'] = {
    entrypoint: 'orchestrator',
    model: asString(systemRaw.model),
    planner_mode: normalizePlannerMode(asString(systemRaw.planner_mode, 'full_only')),
  }

  const promptAgents: PromptAgent[] = []
  const rawPromptAgents = Array.isArray(root.prompt_agents) ? root.prompt_agents : []

  rawPromptAgents.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      return
    }
    const fallbackId = `agent_${index + 1}`
    const id = normalizeAgentId(asString(candidate.id), fallbackId)
    promptAgents.push({
      id,
      prompt: asString(candidate.prompt),
      order: asNumber(candidate.order, index + 1),
    })
  })

  if (promptAgents.length === 0 && Array.isArray(root.agents)) {
    root.agents.forEach((candidate, index) => {
      if (!isRecord(candidate)) {
        return
      }
      const rawInstruction = asString(candidate.instruction)
      if (!rawInstruction.trim()) {
        return
      }
      const fallbackId = `agent_${index + 1}`
      const id = normalizeAgentId(asString(candidate.id), fallbackId)
      if (RESERVED_AGENT_IDS.has(id)) {
        return
      }
      promptAgents.push({
        id,
        prompt: rawInstruction,
        order: promptAgents.length + 1,
      })
    })
  }

  const normalizedAgents = dedupePromptAgents(
    promptAgents.length > 0
      ? promptAgents
      : [
          {
            id: 'agent_1',
            prompt: '',
            order: 1,
          },
        ],
  )

  return {
    system,
    promptAgents: normalizedAgents.sort((left, right) => left.order - right.order),
  }
}

function definitionToToml(definition: DesignerDefinition): string {
  const promptAgents = definition.promptAgents
    .map((item, index) => ({
      id: item.id,
      prompt: item.prompt,
      order: index + 1,
    }))

  return stringifyToml({
    system: {
      entrypoint: 'orchestrator',
      model: definition.system.model,
      planner_mode: definition.system.planner_mode,
    },
    prompt_agents: promptAgents,
  })
}

function nextAgentId(existingIds: string[]): string {
  const existing = new Set(existingIds)
  let index = 1
  while (existing.has(`agent_${index}`)) {
    index += 1
  }
  return `agent_${index}`
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
      entrypoint: 'orchestrator',
      model: '',
      planner_mode: 'full_only',
    },
    promptAgents: [
      {
        id: 'agent_1',
        prompt: '',
        order: 1,
      },
    ],
  })

  const [activePromptAgentId, setActivePromptAgentId] = useState(selectedAgentId)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const canAddAgent = definition.promptAgents.length < MAX_AGENTS

  const orderedPromptAgents = useMemo(
    () => [...definition.promptAgents].sort((left, right) => left.order - right.order),
    [definition.promptAgents],
  )

  const activePromptAgent = orderedPromptAgents.find((item) => item.id === activePromptAgentId) ?? null

  const setActiveAgent = useCallback(
    (agentId: string) => {
      setActivePromptAgentId(agentId)
      onAgentChange(agentId)
    },
    [onAgentChange],
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

      const preferred = parsed.promptAgents.some((item) => item.id === selectedAgentId)
        ? selectedAgentId
        : parsed.promptAgents[0]?.id ?? ''

      if (preferred) {
        setActiveAgent(preferred)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la definicion del atleta.')
    } finally {
      setLoading(false)
    }
  }, [athleteId, selectedAgentId, setActiveAgent])

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
    if (definition.promptAgents.some((item) => item.id === selectedAgentId)) {
      setActivePromptAgentId(selectedAgentId)
    }
  }, [definition.promptAgents, selectedAgentId])

  const updatePromptAgent = useCallback((agentId: string, nextPrompt: string) => {
    setDefinition((currentDefinition) => ({
      ...currentDefinition,
      promptAgents: currentDefinition.promptAgents.map((item) =>
        item.id === agentId ? { ...item, prompt: nextPrompt } : item,
      ),
    }))
  }, [])

  const handleAddAgent = useCallback(() => {
    if (!canAddAgent) {
      setError(`Solo se permiten ${MAX_AGENTS} agentes por atleta.`)
      return
    }

    const candidateId = nextAgentId(definition.promptAgents.map((item) => item.id))
    const nextAgent: PromptAgent = {
      id: candidateId,
      prompt: '',
      order: definition.promptAgents.length + 1,
    }

    setDefinition((currentDefinition) => ({
      ...currentDefinition,
      promptAgents: [...currentDefinition.promptAgents, nextAgent],
    }))

    setActiveAgent(candidateId)
    setNotice('Agente agregado. Escribe su prompt para activarlo.')
    setTimeout(() => setNotice(null), 2200)
  }, [canAddAgent, definition.promptAgents, setActiveAgent])

  const handleDeleteAgent = useCallback(
    (agentId: string) => {
      const remaining = orderedPromptAgents.filter((item) => item.id !== agentId)
      if (remaining.length === 0) {
        setError('Debe existir al menos un agente prompt.')
        return
      }

      const normalized = remaining.map((item, index) => ({
        ...item,
        order: index + 1,
      }))

      setDefinition((currentDefinition) => ({
        ...currentDefinition,
        promptAgents: normalized,
      }))

      if (activePromptAgentId === agentId) {
        setActiveAgent(normalized[0].id)
      }

      setNotice('Agente eliminado.')
      setTimeout(() => setNotice(null), 1800)
    },
    [activePromptAgentId, orderedPromptAgents, setActiveAgent],
  )

  const serializeCurrentDefinition = useCallback((): string => {
    return definitionToToml(definition)
  }, [definition])

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
      setNotice('Definicion prompt-only guardada.')
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
    setTimeout(() => setNotice(null), 1800)
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
      setTimeout(() => setNotice(null), 2400)
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
              className={cn(
                'fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl sm:inset-8',
                isDark ? 'text-foreground' : 'text-foreground',
              )}
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-[15px] font-semibold text-foreground">Disenador Prompt-Only</h2>
                  <span className="text-[12px] text-muted-foreground">
                    {definition.promptAgents.length}/{MAX_AGENTS}
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
                    disabled={saving || validating || loading || definition.promptAgents.length === 0}
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
                    aria-label="Cerrar disenador"
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

              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
                <aside className="min-h-0 overflow-y-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
                  <section className="mb-4 rounded-md border border-border bg-background/40 p-3">
                    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Sistema
                    </h3>

                    <label className="mb-1 block text-[12px] text-muted-foreground">Entrypoint</label>
                    <input
                      type="text"
                      value="orchestrator"
                      disabled
                      className="mb-3 h-8 w-full rounded-md border border-border bg-muted px-2 text-[12px] text-muted-foreground"
                    />

                    <label className="mb-1 block text-[12px] text-muted-foreground">Planner mode</label>
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
                        Prompt agents
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

                    <div className="space-y-2">
                      {orderedPromptAgents.map((item) => {
                        const active = item.id === activePromptAgentId
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
                              onClick={() => setActiveAgent(item.id)}
                              className="mb-1 w-full text-left"
                            >
                              <div className="text-[12px] font-medium text-foreground">{item.id}</div>
                              <div className="text-[11px] text-muted-foreground">{promptPreview(item.prompt)}</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAgent(item.id)}
                              disabled={orderedPromptAgents.length <= 1}
                              className="inline-flex h-6 items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 text-[11px] text-destructive hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" /> Eliminar
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                </aside>

                <section className="min-h-0 overflow-y-auto p-4">
                  {!activePromptAgent ? (
                    <div className="rounded-md border border-border bg-background/40 p-4 text-[13px] text-muted-foreground">
                      Selecciona un agente para editar su prompt.
                    </div>
                  ) : (
                    <div className="rounded-md border border-border bg-background/40 p-4">
                      <label className="mb-1 block text-[12px] text-muted-foreground">ID del agente</label>
                      <input
                        type="text"
                        value={activePromptAgent.id}
                        disabled
                        className="mb-3 h-8 w-full rounded-md border border-border bg-muted px-2 text-[12px] text-muted-foreground"
                      />

                      <label className="mb-1 block text-[12px] text-muted-foreground">Prompt</label>
                      <textarea
                        value={activePromptAgent.prompt}
                        onChange={(event) => updatePromptAgent(activePromptAgent.id, event.target.value)}
                        rows={14}
                        spellCheck={false}
                        placeholder="Escribe el prompt del nuevo agente..."
                        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px] leading-5 text-foreground"
                      />

                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Solo se configura el prompt. Tools, skills y conexiones se resuelven internamente en backend.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
