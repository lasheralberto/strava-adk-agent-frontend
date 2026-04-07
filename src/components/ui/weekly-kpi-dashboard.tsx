import {
  Bike,
  Flame,
  Gauge,
  HeartPulse,
  Mountain,
  Route,
  Timer,
  TrendingUp,
} from 'lucide-react'

import { BouncingDots } from '@/components/ui/bouncing-dots'
import type { WeeklyDeltaMetric, WeeklySummaryResponse } from '@/types/weekly-kpis'

type WeeklyKpiDashboardProps = {
  data: WeeklySummaryResponse | null
  loading: boolean
  error: string | null
  isAuthenticated: boolean
}

function formatTrend(metric: WeeklyDeltaMetric, unit = ''): string {
  const sign = metric.delta > 0 ? '+' : ''
  const value = Number.isInteger(metric.delta) ? metric.delta.toFixed(0) : metric.delta.toFixed(1)
  const suffix = unit ? ` ${unit}` : ''
  return `${sign}${value}${suffix}`
}

function trendClassName(metric: WeeklyDeltaMetric): string {
  if (metric.delta > 0) {
    return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
  }
  if (metric.delta < 0) {
    return 'border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300'
  }
  return 'border-border/70 bg-background/60 text-muted-foreground'
}

function formatDateWindow(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)

  const formatter = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
  })

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`
}

export function WeeklyKpiDashboard({
  data,
  loading,
  error,
  isAuthenticated,
}: WeeklyKpiDashboardProps) {
  if (!isAuthenticated) {
    return (
      <section className="space-y-3 rounded-2xl border border-border/70 bg-background/50 p-4">
        <p className="text-sm font-medium text-foreground">Dashboard semanal</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Inicia sesion con Strava para cargar tus KPIs de ciclismo antes de arrancar la conversacion.
        </p>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="space-y-3 rounded-2xl border border-border/70 bg-background/50 p-4">
        <p className="text-sm font-medium text-foreground">Calculando resumen semanal...</p>
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <BouncingDots dots={3} className="h-2 w-2 bg-foreground/80" />
          Consultando actividades, zonas y carga de entrenamiento.
        </div>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="space-y-3 rounded-2xl border border-border/70 bg-background/50 p-4">
        <p className="text-sm font-medium text-foreground">Dashboard semanal</p>
        <p className="text-xs leading-5 text-muted-foreground">
          No fue posible cargar el resumen semanal en este momento.
        </p>
        {error ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    )
  }

  const summary = data.summary
  const intensity = data.intensity
  const trend = data.trends
  const topActivities = data.activities.slice(0, 4)

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-background/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Resumen semanal de ciclismo</p>
          <p className="text-xs text-muted-foreground">
            {formatDateWindow(data.week.start_date, data.week.end_date)} · {summary.total_activities} actividades
          </p>
        </div>
        <span className="status-pill text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          vs semana previa
        </span>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="metric-card">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Distancia</p>
            <p className="text-lg font-semibold text-foreground">{summary.total_distance_km.toFixed(1)} km</p>
            <p className="text-xs text-muted-foreground">{formatTrend(trend.distance_km, 'km')}</p>
          </div>
          <span className="metric-icon"><Route className="h-4 w-4" /></span>
        </article>

        <article className="metric-card">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Tiempo</p>
            <p className="text-lg font-semibold text-foreground">{summary.total_moving_time_h.toFixed(1)} h</p>
            <p className="text-xs text-muted-foreground">{formatTrend(trend.moving_time_h, 'h')}</p>
          </div>
          <span className="metric-icon"><Timer className="h-4 w-4" /></span>
        </article>

        <article className="metric-card">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Desnivel</p>
            <p className="text-lg font-semibold text-foreground">{summary.total_elevation_gain_m.toFixed(0)} m</p>
            <p className="text-xs text-muted-foreground">{formatTrend(trend.elevation_gain_m, 'm')}</p>
          </div>
          <span className="metric-icon"><Mountain className="h-4 w-4" /></span>
        </article>

        <article className="metric-card">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Trabajo</p>
            <p className="text-lg font-semibold text-foreground">{summary.total_kilojoules.toFixed(0)} kJ</p>
            <p className="text-xs text-muted-foreground">{formatTrend(trend.kilojoules, 'kJ')}</p>
          </div>
          <span className="metric-icon"><Flame className="h-4 w-4" /></span>
        </article>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <span className="status-pill text-xs text-muted-foreground">
          <Bike className="h-3.5 w-3.5" />
          {summary.active_days} dias activos
        </span>
        <span className="status-pill text-xs text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" />
          NP sem: {summary.weighted_avg_power_w?.toFixed(0) ?? 'N/D'} W
        </span>
        <span className="status-pill text-xs text-muted-foreground">
          <HeartPulse className="h-3.5 w-3.5" />
          FC media: {summary.avg_heartrate_bpm?.toFixed(0) ?? 'N/D'} bpm
        </span>
        <span className="status-pill text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          IF: {intensity.estimated_if?.toFixed(2) ?? 'N/D'} · TSS: {intensity.estimated_tss?.toFixed(0) ?? 'N/D'}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <span className={`rounded-xl border px-3 py-2 text-xs ${trendClassName(trend.activities)}`}>
          Actividades: {formatTrend(trend.activities)}
        </span>
        <span className={`rounded-xl border px-3 py-2 text-xs ${trendClassName(trend.distance_km)}`}>
          Distancia: {formatTrend(trend.distance_km, 'km')}
        </span>
        <span className={`rounded-xl border px-3 py-2 text-xs ${trendClassName(trend.moving_time_h)}`}>
          Tiempo: {formatTrend(trend.moving_time_h, 'h')}
        </span>
        <span className={`rounded-xl border px-3 py-2 text-xs ${trendClassName(trend.elevation_gain_m)}`}>
          Desnivel: {formatTrend(trend.elevation_gain_m, 'm')}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ultimas salidas</p>
        {topActivities.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin actividades de ciclismo en esta ventana.</p>
        ) : (
          <div className="space-y-2">
            {topActivities.map((activity) => (
              <article
                key={activity.id}
                className="rounded-xl border border-border/70 bg-background/55 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium text-foreground">{activity.name}</p>
                  <p className="text-[11px] text-muted-foreground">{activity.distance_km.toFixed(1)} km</p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {activity.moving_time_h.toFixed(2)} h · {activity.elevation_gain_m.toFixed(0)} m · {activity.avg_power_w?.toFixed(0) ?? 'N/D'} W
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
