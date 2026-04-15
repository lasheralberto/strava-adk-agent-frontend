import { AnimatePresence, motion } from 'motion/react'
import { ListChecks, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

const apiBaseUrl = (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '')
  .trim()
  .replace(/\/$/, '')
const internalPipelineToken = (import.meta.env.VITE_INTERNAL_PIPELINE_TOKEN ?? '').trim()

type ActivityRunStatus = 'queued' | 'running' | 'success' | 'failed' | string

type ActivityRun = {
  activity_id: number | string
  athlete_id?: number
  name?: string
  sport_type?: string
  type?: string
  start_date?: string
  distance?: number
  moving_time?: number
  status?: ActivityRunStatus
  queued_at?: string
  status_updated_at?: string
}

type ActivitiesRunsResponse = {
  athlete_id: number
  count: number
  runs: ActivityRun[]
}

type Props = {
  athleteId: number | null
  refreshKey?: number
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'En cola',
  running: 'Procesando',
  success: 'Indexada',
  failed: 'Fallida',
}

function statusClasses(status: ActivityRunStatus | undefined): string {
  switch (status) {
    case 'success':
      return 'border-success/40 bg-success/10 text-success'
    case 'failed':
      return 'border-destructive/40 bg-destructive/10 text-destructive'
    case 'running':
      return 'border-primary/40 bg-primary/10 text-primary'
    case 'queued':
      return 'border-warning/40 bg-warning/10 text-warning'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

function statusDotClass(status: ActivityRunStatus | undefined): string {
  switch (status) {
    case 'success':
      return 'bg-success'
    case 'failed':
      return 'bg-destructive'
    case 'running':
      return 'bg-primary animate-pulse'
    case 'queued':
      return 'bg-warning'
    default:
      return 'bg-muted-foreground/60'
  }
}

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDistance(meters: number | undefined): string {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) {
    return '—'
  }
  const km = meters / 1000
  return `${km.toFixed(km >= 10 ? 1 : 2)} km`
}

function formatDuration(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '—'
  }
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

export function ActivitiesRunsPanel({ athleteId, refreshKey = 0 }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [runs, setRuns] = useState<ActivityRun[]>([])
  const [error, setError] = useState<string | null>(null)
  const inflightRef = useRef<AbortController | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  const fetchRuns = useCallback(async () => {
    if (!apiBaseUrl || !athleteId) return
    inflightRef.current?.abort()
    const controller = new AbortController()
    inflightRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const headers: Record<string, string> = {}
      if (internalPipelineToken) headers['X-Internal-Token'] = internalPipelineToken
      const res = await fetch(
        `${apiBaseUrl}/pipeline/indexed-activities?athlete_id=${athleteId}&limit=20`,
        { headers, signal: controller.signal },
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as ActivitiesRunsResponse
      setRuns(Array.isArray(data.runs) ? data.runs : [])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al cargar actividades.')
      setRuns([])
    } finally {
      if (inflightRef.current === controller) {
        setLoading(false)
        inflightRef.current = null
      }
    }
  }, [athleteId])

  useEffect(() => {
    if (!open || !athleteId) return
    fetchRuns()
  }, [open, athleteId, refreshKey, fetchRuns])

  useEffect(() => {
    if (!athleteId) {
      setOpen(false)
      setRuns([])
      setError(null)
    }
  }, [athleteId])

  // Esc to close; focus close button on open; restore focus to trigger on close.
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
    if (!open) {
      triggerRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  if (!athleteId) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="activities-runs-drawer"
        aria-label="Ver últimas actividades indexadas"
        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[13px] text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ListChecks className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Actividades</span>
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="activities-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'linear' }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
              aria-hidden="true"
            />
            <motion.aside
              key="activities-drawer"
              id="activities-runs-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="activities-drawer-title"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(92vw,32rem)] flex-col border-l border-border bg-popover text-popover-foreground shadow-2xl"
            >
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h2
                    id="activities-drawer-title"
                    className="text-[15px] font-semibold text-foreground"
                  >
                    Actividades indexadas
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={fetchRuns}
                    disabled={loading}
                    aria-label="Recargar actividades"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors duration-80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground/50"
                  >
                    <RefreshCw
                      className={cn('h-4 w-4', loading && 'animate-spin')}
                      aria-hidden="true"
                    />
                  </button>
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

              <div className="flex-1 overflow-y-auto">
                {error ? (
                  <div
                    role="alert"
                    className="m-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
                  >
                    {error}
                  </div>
                ) : runs.length === 0 && !loading ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                    <p className="text-[15px] text-foreground">Sin actividades indexadas</p>
                    <p className="text-[13px] text-muted-foreground">
                      Pulsa Sync para comenzar a analizar tu historial.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Actividad</TableHead>
                        <TableHead className="hidden sm:table-cell">Deporte</TableHead>
                        <TableHead className="hidden md:table-cell">Fecha</TableHead>
                        <TableHead className="hidden md:table-cell">Distancia</TableHead>
                        <TableHead className="hidden lg:table-cell">Tiempo</TableHead>
                        <TableHead className="text-right">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => {
                        const status = (run.status ?? 'unknown') as ActivityRunStatus
                        const label = STATUS_LABELS[status] ?? status
                        return (
                          <TableRow key={String(run.activity_id)}>
                            <TableCell className="max-w-[14rem] truncate font-medium text-foreground">
                              {run.name || `Actividad ${run.activity_id}`}
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground sm:table-cell">
                              {run.sport_type || run.type || '—'}
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground md:table-cell">
                              {formatDate(run.start_date)}
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground md:table-cell">
                              {formatDistance(run.distance)}
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground lg:table-cell">
                              {formatDuration(run.moving_time)}
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[12px] font-medium',
                                  statusClasses(status),
                                )}
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(status))}
                                />
                                {label}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
