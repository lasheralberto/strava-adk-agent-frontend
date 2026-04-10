import { Activity, BarChart2, Route, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuthSwitchProps {
  onLogin: () => void
  isPending?: boolean
  error?: string | null
  className?: string
}

const features = [
  { icon: BarChart2, label: 'Carga semanal, HRV y recuperación' },
  { icon: Route, label: 'Ritmos, segmentos y zonas por actividad' },
  { icon: TrendingUp, label: 'Consultas en lenguaje natural sobre tus datos' },
]

export default function AuthSwitch({ onLogin, isPending, error, className }: AuthSwitchProps) {
  return (
    <div className={cn('min-h-screen flex bg-background', className)}>
      {/* Left — hero image */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=1400&auto=format&fit=crop&q=75"
          alt="Corredor en carretera"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/70 via-foreground/40 to-transparent" />

        {/* quote bottom-left */}
        <div className="relative z-10 flex flex-col justify-end p-12 pb-14">
          <blockquote className="max-w-xs">
            <p className="text-white/90 text-lg font-medium leading-relaxed">
              "Entiende tu entrenamiento. Mejora con datos."
            </p>
          </blockquote>
        </div>
      </div>

      {/* Right — login panel */}
      <div className="flex w-full lg:w-[45%] items-center justify-center px-8 py-12 bg-background">
        <div className="w-full max-w-[340px] space-y-9">

          {/* Brand */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">
                Toontracks
              </span>
            </div>
            <h1 className="text-[2rem] font-bold tracking-tight text-foreground leading-none">
              Conecta tu cuenta
            </h1>
            <p className="text-sm text-muted-foreground pt-1">
              Autoriza el acceso a Strava para empezar a analizar tus actividades.
            </p>
          </div>

          {/* Feature list */}
          <ul className="space-y-3.5">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Error banner */}
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {/* CTA */}
          <div className="space-y-3">
            <button
              onClick={onLogin}
              disabled={isPending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                  Conectando...
                </>
              ) : (
                'Conectar con Strava'
              )}
            </button>

            <p className="text-center text-xs text-muted-foreground/70">
              Solo lectura &mdash; no modificamos tus actividades.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
