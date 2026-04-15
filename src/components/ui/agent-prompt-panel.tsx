import { AnimatePresence, motion } from 'motion/react'
import { Bot, RotateCcw, Save, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '')
const internalPipelineToken = (import.meta.env.VITE_INTERNAL_PIPELINE_TOKEN ?? '').trim()

type AgentRecord = {
  agent_id: string
  name?: string
  description?: string
  placeholders?: string[]
  instruction_template: string
  is_default?: boolean
  updated_at?: string | null
  updated_by?: string | null
}

type Props = {
  agentId?: string
}

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...base }
  if (internalPipelineToken) headers['X-Internal-Token'] = internalPipelineToken
  return headers
}

export function AgentPromptPanel({ agentId = 'wiki_research_chat' }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [record, setRecord] = useState<AgentRecord | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const inflightRef = useRef<AbortController | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  const fetchAgent = useCallback(async () => {
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
  }, [agentId])

  const handleSave = useCallback(async () => {
    if (!apiBaseUrl) return
    if (!draft.trim()) {
      setError('El prompt no puede estar vacío.')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`${apiBaseUrl}/agents/${agentId}`, {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el prompt.')
    } finally {
      setSaving(false)
    }
  }, [agentId, draft])

  const handleReset = useCallback(() => {
    if (record) {
      setDraft(record.instruction_template ?? '')
      setNotice(null)
      setError(null)
    }
  }, [record])

  useEffect(() => {
    if (open) fetchAgent()
  }, [open, fetchAgent])

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) triggerRef.current?.focus({ preventScroll: true })
  }, [open])

  const dirty = record ? draft !== (record.instruction_template ?? '') : Boolean(draft)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="agent-prompt-drawer"
        aria-label="Editar prompt del agente researcher"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bot className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Researcher</span>
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
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h2
                    id="agent-drawer-title"
                    className="text-[15px] font-semibold text-foreground"
                  >
                    {record?.name ?? 'Agente researcher'}
                  </h2>
                  {record?.is_default ? (
                    <span className="inline-flex items-center rounded-sm border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                      por defecto
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
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

              <div className="flex-1 overflow-y-auto px-4 py-4">
                {record?.description ? (
                  <p className="mb-2 text-[13px] text-muted-foreground">{record.description}</p>
                ) : null}
                {record?.placeholders && record.placeholders.length > 0 ? (
                  <p className="mb-3 text-[12px] text-muted-foreground">
                    Placeholders:{' '}
                    {record.placeholders.map((placeholder, idx) => (
                      <span key={placeholder}>
                        <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
                          {placeholder}
                        </code>
                        {idx < (record.placeholders?.length ?? 0) - 1 ? ' · ' : ''}
                      </span>
                    ))}
                  </p>
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

              <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
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
              </footer>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
