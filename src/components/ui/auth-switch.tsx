import { Activity, BarChart2, Brain, TrendingUp, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import MountainVistaParallax from '@/components/ui/mountain-vista-bg'
import btnStravaConnect from '@/assets/btn_strava_connect_with_orange.png'
import { GooeyText } from '@/components/ui/gooey-text-morphing'

interface AuthSwitchProps {
  onLogin: () => void
  isPending?: boolean
  error?: string | null
  className?: string
}

// ── Floating notification cards ───────────────────────────────────────────
const leftCards = [
  {
    id: 1,
    icon: TrendingUp,
    title: 'PR detectado · 5K',
    sub: '21:34 — Hoy 7:30am',
    tone: 'success' as const,
    delay: 0.1,
    floatY: 8,
  },
  {
    id: 2,
    icon: Zap,
    title: 'Carga semanal alta',
    sub: '847 TSS · Descansa mañana',
    tone: 'warning' as const,
    delay: 0.32,
    floatY: -6,
  },
]

const rightCards = [
  {
    id: 3,
    icon: Brain,
    title: 'Agente analizando',
    sub: 'Identificando patrones...',
    tone: 'primary' as const,
    delay: 0.2,
    floatY: -8,
  },
  {
    id: 4,
    icon: BarChart2,
    title: 'Recuperación: 82%',
    sub: 'Listo para entrenar hoy',
    tone: 'success' as const,
    delay: 0.42,
    floatY: 6,
  },
]

const iconTone = {
  success: 'text-success',
  warning: 'text-warning',
  primary: 'text-primary',
} as const

// ── Phone mockup ──────────────────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div className="flex h-[480px] w-[230px] flex-col overflow-hidden rounded-[38px] border-[6px] border-zinc-700 bg-zinc-900 shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)] select-none">
      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-0.5 pt-3.5">
        <span className="text-[10px] font-medium text-zinc-500">9:41</span>
        <div className="flex items-center gap-1.5">
          <div className="flex h-2.5 items-end gap-[2px]">
            {([3, 5, 7, 9] as const).map((h, i) => (
              <div
                key={i}
                className="w-[2px] rounded-[1px] bg-zinc-500"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          <span className="text-[9px] text-zinc-500">100%</span>
        </div>
      </div>

      {/* App header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-zinc-100">Toontracks</span>
          <span className="inline-flex items-center gap-1 rounded-[3px] bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-medium text-emerald-400">
            <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
            Conectado
          </span>
        </div>
        <div className="flex gap-1.5">
          <div className="h-5 w-5 rounded-md bg-zinc-800" />
          <div className="h-5 w-5 rounded-md bg-zinc-800" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-hidden px-2.5 py-3">
        {/* User */}
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-zinc-100 px-2.5 py-1.5">
            <p className="text-[9.5px] leading-snug text-zinc-900">
              ¿Cuál fue mi mejor 5K este mes?
            </p>
          </div>
        </div>
        {/* Assistant */}
        <div className="flex justify-start">
          <p className="max-w-[88%] text-[9.5px] leading-snug text-zinc-300">
            Tu mejor 5K fue el martes 14:{' '}
            <span className="font-semibold text-zinc-100">21:34</span>, ritmo 4:19/km.
            Mejoraste 23 seg respecto al anterior.
          </p>
        </div>
        {/* User */}
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-zinc-100 px-2.5 py-1.5">
            <p className="text-[9.5px] leading-snug text-zinc-900">¿Cuánto correr mañana?</p>
          </div>
        </div>
        {/* Assistant */}
        <div className="flex justify-start">
          <p className="max-w-[88%] text-[9.5px] leading-snug text-zinc-300">
            Carga alta esta semana (847 TSS). Recomiendo 30–40 min fácil en{' '}
            <span className="font-semibold text-zinc-100">zona 2</span>.
          </p>
        </div>
      </div>

      {/* Prompt bar */}
      <div className="shrink-0 border-t border-zinc-800 px-2.5 py-2.5">
        <div className="flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2">
          <span className="flex-1 text-[9.5px] text-zinc-600">
            Pregúntame sobre tu entrenamiento...
          </span>
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-700">
            <div className="h-2 w-2 rounded-[2px] bg-zinc-500" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function AuthSwitch({ onLogin, isPending, error, className }: AuthSwitchProps) {
  return (
    <div className={cn('relative min-h-screen flex flex-col overflow-hidden', className)}>
      {/* Parallax night background */}
      <div className="absolute inset-0 z-0">
        <MountainVistaParallax />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-white/60" />
          <span className="text-sm font-semibold tracking-tight text-white">Toontracks</span>
        </div>
        <button
          onClick={onLogin}
          disabled={isPending}
          className="transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50 rounded-sm"
          aria-label="Conectar con Strava"
        >
          {isPending ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#FC4C02] px-3 text-[12px] font-semibold text-white">
              <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
              Conectando...
            </span>
          ) : (
            <img
              src={btnStravaConnect}
              alt="Conectar con Strava"
              className="h-8 w-auto"
            />
          )}
        </button>
      </nav>

      {/* Error banner */}
      {error && (
        <div className="relative z-10 mx-6 mb-2 rounded-lg border border-red-400/30 bg-red-950/60 px-4 py-2 text-xs text-red-300 backdrop-blur-sm sm:mx-10">
          {error}
        </div>
      )}

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-8 sm:px-10">
        {/* Headline */}
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="relative h-24 w-full drop-shadow-lg">
            <GooeyText
              texts={["Rendimiento", "Recuperación", "Carga", "Progreso", "Análisis"]}
              morphTime={1.2}
              cooldownTime={2.5}
              className="h-24 w-full"
              textClassName="font-bold tracking-tight"
            />
          </div>
          <p className="mx-auto mt-3 max-w-xs text-sm text-white/60">
            Conecta Strava y consulta en lenguaje natural tu rendimiento, carga y recuperación.
          </p>
        </motion.div>

        {/* Phone + floating cards */}
        <div className="flex items-center justify-center gap-6 lg:gap-10">
          {/* Left cards */}
          <div className="hidden flex-col items-end gap-4 lg:flex">
            {leftCards.map((card) => (
              <motion.div
                key={card.id}
                className="flex w-[192px] items-start gap-2.5 rounded-xl border border-white/10 bg-zinc-900/75 px-3 py-2.5 shadow-md"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0, y: [0, card.floatY, 0] }}
                transition={{
                  opacity: { duration: 0.4, delay: card.delay, ease: 'easeOut' },
                  x: { duration: 0.4, delay: card.delay, ease: 'easeOut' },
                  y: {
                    duration: 3.6 + card.id * 0.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: card.delay + 0.5,
                  },
                }}
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5',
                    iconTone[card.tone],
                  )}
                >
                  <card.icon className="h-3 w-3" />
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold leading-tight text-white">
                    {card.title}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-tight text-white/55">
                    {card.sub}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Phone mockup */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05, ease: 'easeOut' }}
          >
            <PhoneMockup />
          </motion.div>

          {/* Right cards */}
          <div className="hidden flex-col items-start gap-4 lg:flex">
            {rightCards.map((card) => (
              <motion.div
                key={card.id}
                className="flex w-[192px] items-start gap-2.5 rounded-xl border border-white/10 bg-zinc-900/75 px-3 py-2.5 shadow-md"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0, y: [0, card.floatY, 0] }}
                transition={{
                  opacity: { duration: 0.4, delay: card.delay, ease: 'easeOut' },
                  x: { duration: 0.4, delay: card.delay, ease: 'easeOut' },
                  y: {
                    duration: 3.6 + card.id * 0.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: card.delay + 0.5,
                  },
                }}
              >
                <div
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5',
                    iconTone[card.tone],
                  )}
                >
                  <card.icon className="h-3 w-3" />
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold leading-tight text-white">
                    {card.title}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-tight text-white/55">
                    {card.sub}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
