import { useState } from 'react'
import { BarChart2, Brain, Check, Copy, TrendingUp, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { GradientBars } from '@/components/ui/gradient-bars-background'
import athlyLogo from '@/assets/athly_logo.png'
import btnStravaConnect from '@/assets/btn_strava_connect_with_orange.png'
import { TextGlitch } from '@/components/ui/text-glitch-effect'

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
          <img
            src={athlyLogo}
            alt="Athly"
            className="h-[18px] w-auto max-w-[90px] object-contain"
          />
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
        <div className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2">
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

// ── Pain point section ────────────────────────────────────────────────────
const PAIN_POINTS = [
  {
    icon: Zap,
    title: 'Extrae sin esfuerzo',
    body: 'Synca con Strava automáticamente. Tus actividades llegan solas, cada día.',
  },
  {
    icon: Brain,
    title: 'Analiza en profundidad',
    body: 'Agentes especializados detectan carga, patrones de recuperación y PRs ocultos.',
  },
  {
    icon: TrendingUp,
    title: 'Te conoce mejor cada día',
    body: 'Con cada sesión construye tu perfil deportivo. Un entrenador que nunca para.',
  },
] as const

function PainPointSection() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55, ease: 'easeOut' }}
      className="w-full max-w-2xl mt-16 px-2"
      aria-labelledby="pain-point-heading"
    >
      <div className="mb-8 text-center">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#FC4C02]/60">
          Por qué Athly
        </p>
        <h2
          id="pain-point-heading"
          className="text-[22px] font-bold leading-tight tracking-tight text-white sm:text-[26px]"
        >
          Hacemos el trabajo sucio.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-white/40">
          La mayoría de atletas tiene datos valiosos en Strava que nunca aprovecha.
          Athly los extrae, los analiza y actúa como tu segundo cerebro deportivo —
          cuanto más entrenas, más sabe de ti.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PAIN_POINTS.map((point, i) => (
          <motion.div
            key={point.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.62 + i * 0.1, ease: 'easeOut' }}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5">
              <point.icon className="h-3.5 w-3.5 text-[#FC4C02]" aria-hidden="true" />
            </div>
            <div className="mb-1 text-[13px] font-semibold text-white">{point.title}</div>
            <div className="text-[11px] leading-relaxed text-white/40">{point.body}</div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  )
}

// ── API CLI demo section ──────────────────────────────────────────────────
const API_STEPS = [
  { label: 'Tu App', sub: 'cualquier cliente HTTP', accent: false },
  { label: 'Agentes', sub: 'diseña tu pipeline', accent: true },
  { label: 'API', sub: 'obtén tu análisis', accent: false },
]

type Token = { t: string; c?: string }
type CodeLine = Token[]
type ApiTab = 'curl' | 'fetch' | 'python'

function buildCurlLines(apiBase: string): CodeLine[] {
  return [
    [
      { t: '$ ', c: 'select-none text-white/25' },
      { t: 'curl', c: 'text-[#FC4C02]' },
      { t: ' -G \\', c: 'text-white/40' },
    ],
    [
      { t: '    "', c: 'text-white/45' },
      { t: apiBase, c: 'text-white/30' },
      { t: '/v1/ask', c: 'text-violet-400' },
      { t: '" \\', c: 'text-white/45' },
    ],
    [
      { t: '    --data-urlencode ', c: 'text-white/40' },
      { t: '"question=', c: 'text-white/50' },
      { t: '¿Cuánto corrí esta semana?', c: 'text-emerald-400' },
      { t: '" \\', c: 'text-white/45' },
    ],
    [
      { t: '    --data-urlencode ', c: 'text-white/40' },
      { t: '"strava_athlete_id=', c: 'text-white/50' },
      { t: 'YOUR_ATHLETE_ID', c: 'text-yellow-400' },
      { t: '" \\', c: 'text-white/45' },
    ],
    [
      { t: '    -H ', c: 'text-white/40' },
      { t: '"Authorization: Bearer ', c: 'text-white/50' },
      { t: 'YOUR_STRAVA_TOKEN', c: 'text-yellow-400' },
      { t: '"', c: 'text-white/45' },
    ],
  ]
}

const FETCH_LINES: CodeLine[] = [
  [
    { t: 'const ', c: 'text-violet-400' },
    { t: 'params ', c: 'text-white/65' },
    { t: '= ', c: 'text-white/40' },
    { t: 'new ', c: 'text-violet-400' },
    { t: 'URLSearchParams', c: 'text-[#FC4C02]' },
    { t: '({', c: 'text-white/50' },
  ],
  [
    { t: '  question: ', c: 'text-white/45' },
    { t: '"¿Cuánto corrí esta semana?"', c: 'text-emerald-400' },
    { t: ',', c: 'text-white/35' },
  ],
  [
    { t: '  strava_athlete_id: ', c: 'text-white/45' },
    { t: '"YOUR_ATHLETE_ID"', c: 'text-yellow-400' },
    { t: ',', c: 'text-white/35' },
  ],
  [{ t: '});', c: 'text-white/50' }],
  [],
  [
    { t: 'const ', c: 'text-violet-400' },
    { t: 'res ', c: 'text-white/65' },
    { t: '= ', c: 'text-white/40' },
    { t: 'await ', c: 'text-violet-400' },
    { t: 'fetch', c: 'text-[#FC4C02]' },
    { t: '(`${', c: 'text-white/35' },
    { t: 'BASE_URL', c: 'text-violet-400' },
    { t: '}/v1/ask?${', c: 'text-white/35' },
    { t: 'params', c: 'text-white/65' },
    { t: '}`, {', c: 'text-white/35' },
  ],
  [
    { t: '  headers: { Authorization: ', c: 'text-white/45' },
    { t: '`Bearer ${', c: 'text-white/35' },
    { t: 'token', c: 'text-yellow-400' },
    { t: '}`', c: 'text-white/35' },
    { t: ' },', c: 'text-white/45' },
  ],
  [{ t: '});', c: 'text-white/50' }],
]

const PYTHON_LINES: CodeLine[] = [
  [
    { t: 'import ', c: 'text-violet-400' },
    { t: 'requests', c: 'text-white/65' },
  ],
  [],
  [
    { t: 'r ', c: 'text-white/65' },
    { t: '= requests.', c: 'text-white/40' },
    { t: 'get', c: 'text-[#FC4C02]' },
    { t: '(', c: 'text-white/50' },
  ],
  [
    { t: '  f"', c: 'text-white/40' },
    { t: '{BASE_URL}', c: 'text-violet-400' },
    { t: '/v1/ask",', c: 'text-white/45' },
  ],
  [{ t: '  params={', c: 'text-white/50' }],
  [
    { t: '    "question": ', c: 'text-white/45' },
    { t: '"¿Cuánto corrí esta semana?"', c: 'text-emerald-400' },
    { t: ',', c: 'text-white/35' },
  ],
  [
    { t: '    "strava_athlete_id": ', c: 'text-white/45' },
    { t: '"YOUR_ATHLETE_ID"', c: 'text-yellow-400' },
    { t: ',', c: 'text-white/35' },
  ],
  [{ t: '  },', c: 'text-white/50' }],
  [
    { t: '  headers={', c: 'text-white/50' },
    { t: '"Authorization"', c: 'text-white/45' },
    { t: ': ', c: 'text-white/35' },
    { t: 'f"Bearer {', c: 'text-white/40' },
    { t: 'token', c: 'text-yellow-400' },
    { t: '}"', c: 'text-white/40' },
    { t: '},', c: 'text-white/50' },
  ],
  [{ t: ')', c: 'text-white/50' }],
]

const COPY_TEXT: Record<ApiTab, (base: string) => string> = {
  curl: (b) =>
    `curl -G \\\n    "${b}/v1/ask" \\\n    --data-urlencode "question=¿Cuánto corrí esta semana?" \\\n    --data-urlencode "strava_athlete_id=YOUR_ATHLETE_ID" \\\n    -H "Authorization: Bearer YOUR_STRAVA_TOKEN"`,
  fetch: () =>
    `const params = new URLSearchParams({\n  question: "¿Cuánto corrí esta semana?",\n  strava_athlete_id: "YOUR_ATHLETE_ID",\n});\nconst res = await fetch(\`\${BASE_URL}/v1/ask?\${params}\`, {\n  headers: { Authorization: \`Bearer \${token}\` },\n});`,
  python: () =>
    `import requests\n\nr = requests.get(\n  f"{BASE_URL}/v1/ask",\n  params={\n    "question": "¿Cuánto corrí esta semana?",\n    "strava_athlete_id": "YOUR_ATHLETE_ID",\n  },\n  headers={"Authorization": f"Bearer {token}"},\n)`,
}

function ApiCliSection() {
  const [tab, setTab] = useState<ApiTab>('curl')
  const [copied, setCopied] = useState(false)

  const apiBase =
    (import.meta.env.VITE_GCLOUD_ENDPOINT ?? '').trim().replace(/\/$/, '') ||
    'https://api.athly.app'

  const lines =
    tab === 'curl' ? buildCurlLines(apiBase) : tab === 'fetch' ? FETCH_LINES : PYTHON_LINES

  const handleCopy = () => {
    void navigator.clipboard.writeText(COPY_TEXT[tab](apiBase)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.65, ease: 'easeOut' }}
      className="w-full max-w-2xl mt-14 px-2"
      aria-label="Integración por API"
    >
      {/* Flow steps */}
      <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
        {API_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2 sm:gap-4">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'rounded-md border px-3 py-1.5 text-[13px] font-semibold transition-colors',
                  step.accent
                    ? 'border-[#FC4C02]/40 bg-[#FC4C02]/10 text-white'
                    : 'border-white/10 bg-white/5 text-white/65',
                )}
              >
                {step.label}
              </div>
              <span className="text-[10px] text-white/30">{step.sub}</span>
            </div>
            {i < API_STEPS.length - 1 ? (
              <span className="mb-4 text-[15px] leading-none text-white/20" aria-hidden="true">
                →
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Terminal */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/60 px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/55" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/55" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/55" />
            </div>
            {/* Language tabs */}
            <div className="flex items-center gap-0.5 rounded-md bg-white/5 p-0.5">
              {(['curl', 'fetch', 'python'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'rounded px-2.5 py-1 font-mono text-[10px] transition-colors',
                    tab === t
                      ? 'bg-white/10 text-white/80'
                      : 'text-white/30 hover:text-white/55',
                  )}
                  aria-pressed={tab === t}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-white/35 transition-colors hover:bg-white/5 hover:text-white/65"
            aria-label="Copiar código"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3" aria-hidden="true" />
            )}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>

        {/* Code */}
        <pre
          className="px-4 py-4 font-mono text-[12px] leading-[1.75]"
          aria-label="Ejemplo de código"
        >
          {lines.map((line, li) =>
            line.length === 0 ? (
              <div key={li} className="h-3" aria-hidden="true" />
            ) : (
              <div key={li}>
                {line.map((tok, ti) => (
                  <span key={ti} className={tok.c}>
                    {tok.t}
                  </span>
                ))}
              </div>
            ),
          )}
        </pre>

        {/* Response */}
        <div className="border-t border-white/10 px-4 py-3">
          <span className="mb-1.5 block font-mono text-[10px] text-white/25">// respuesta</span>
          <pre className="font-mono text-[11px] leading-relaxed text-white/45">{`{\n  "response": "Esta semana corriste 42 km en 4 sesiones. Ritmo medio: 4:58/km..."\n}`}</pre>
        </div>
      </div>
    </motion.section>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function AuthSwitch({ onLogin, isPending, error, className }: AuthSwitchProps) {
  return (
    <div className={cn('relative min-h-screen flex flex-col overflow-hidden bg-[rgb(7,13,32)]', className)}>
      {/* Gradient bars background */}
      <GradientBars
        numBars={13}
        gradientFrom="hsl(var(--primary))"
        gradientTo="transparent"
        animationDuration={2.4}
      />

      {/* Soft white halo for depth on top of animated bars */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(circle at 50% 32%, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 20%, rgba(255, 255, 255, 0) 52%)',
        }}
      />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex shrink-0 items-center">
          <img
            src={athlyLogo}
            alt="Athly"
            className="h-24 w-auto max-w-none object-contain"
          />
        </div>
        <button
          onClick={onLogin}
          disabled={isPending}
          className="overflow-hidden rounded-md transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Conectar con Strava"
        >
          {isPending ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#FC4C02] px-4 text-[12px] font-semibold text-white">
              <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
              Connecting...
            </span>
          ) : (
            <span className="inline-flex h-8 items-center gap-2 rounded-md bg-[#FC4C02] px-4 text-[12px] font-semibold text-white">
              <img
                src={btnStravaConnect}
                alt=""
                className="h-5 w-auto"
              />
              Connect with Strava
            </span>
          )}
        </button>
      </nav>

      {/* Error banner */}
      {error && (
        <div className="relative z-10 mx-6 mb-2 rounded-md border border-red-400/30 bg-red-950/60 px-4 py-2 text-xs text-red-300 backdrop-blur-sm sm:mx-10">
          {error}
        </div>
      )}

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-8 sm:px-10">
        {/* Headline */}
        <div className="mb-12 w-full px-6 sm:px-10">
          <TextGlitch
            text="Tu rendimiento,"
            hoverText="Tu rendimiento,"
            delay={0}
            className="text-[6vw]"
          />
          <TextGlitch
            text="sin filtros ni complicaciones."
            hoverText="sin filtros ni complicaciones."
            delay={0.2}
            className="text-[4.2vw]"
          />
        </div>

        {/* Phone + floating cards */}
        <div className="flex items-center justify-center gap-6 lg:gap-10">
          {/* Left cards */}
          <div className="hidden flex-col items-end gap-4 lg:flex">
            {leftCards.map((card) => (
              <motion.div
                key={card.id}
                className="flex w-[192px] items-start gap-2.5 rounded-md border border-white/10 bg-zinc-900/75 px-3 py-2.5 shadow-md"
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
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5',
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
                className="flex w-[192px] items-start gap-2.5 rounded-md border border-white/10 bg-zinc-900/75 px-3 py-2.5 shadow-md"
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
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5',
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

        {/* Pain point */}
        <PainPointSection />

        {/* API CLI demo */}
        <ApiCliSection />

      </main>
    </div>
  )
}
