import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, ListChecks, RefreshCw } from 'lucide-react'
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
      return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-500'
    case 'failed':
      return 'border-red-400/40 bg-red-500/10 text-red-500'
    case 'running':
      return 'border-sky-400/40 bg-sky-500/10 text-sky-500'
    case 'queued':
      return 'border-amber-400/40 bg-amber-500/10 text-amber-500'
    default:
      return 'border-border/60 bg-muted/50 text-muted-foreground'
  }
}

function statusDotClass(status: ActivityRunStatus | undefined): string {
  switch (status) {
    case 'success':
      return 'bg-emerald-500'
    case 'failed':
      return 'bg-red-500'
    case 'running':
      return 'bg-sky-500 animate-pulse'
    case 'queued':
      return 'bg-amber-500'
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
        `${apiBaseUrl}/pipeline/activities-runs?athlete_id=${athleteId}&limit=20`,
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

  // Fetch on open, athlete change, or refreshKey bump (e.g. after sync)
  useEffect(() => {
    if (!open || !athleteId) return
    fetchRuns()
  }, [open, athleteId, refreshKey, fetchRuns])

  // Reset panel when logging out
  useEffect(() => {
    if (!athleteId) {
      setOpen(false)
      setRuns([])
      setError(null)
    }
  }, [athleteId])

  if (!athleteId) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="activities-runs-panel"
        title={open ? 'Ocultar actividades' : 'Ver últimas actividades'}
        className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-border/60 bg-background/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ListChecks className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Actividades</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="activities-runs-panel"
            id="activities-runs-panel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute right-0 z-30 mt-2 w-[min(92vw,44rem)] origin-top-right overflow-hidden rounded-2xl border border-border/70 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                <span>Últimas actividades indexadas</span>
              </div>
              <button
                type="button"
                onClick={fetchRuns}
                disabled={loading}
                title="Recargar"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </button>
            </div>

            <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
              {error ? (
                <div className="px-3 py-4 text-xs text-destructive">{error}</div>
              ) : runs.length === 0 && !loading ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No hay actividades indexadas todavía. Pulsa Sync para comenzar.
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
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
