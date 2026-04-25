import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'

import { DEFAULT_LANDING_PRICING, getLandingPricing, type LandingPricingData } from '@/lib/landing-pricing'

// ── Design tokens ────────────────────────────────────────────────────────────
const A_ORANGE = '#FC4C02'
const A_AMBER  = '#FF8A3D'
const A_BLUE   = '#3B82F6'
const A_CYAN   = '#22D3EE'
const A_GREEN  = '#22C55E'
const A_LINE   = 'rgba(255,255,255,0.08)'
const A_LINE2  = 'rgba(255,255,255,0.14)'
const A_DIM    = 'rgba(255,255,255,0.55)'
const A_DIM2   = 'rgba(255,255,255,0.38)'
const FONT     = `'Geist', -apple-system, system-ui, sans-serif`
const MONO     = `'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace`

// ── Props ────────────────────────────────────────────────────────────────────
interface AuthSwitchProps {
  onLogin: () => void
  isPending?: boolean
  error?: string | null
  className?: string
}

const LANDING_PRICING_FEATURES = [
  'Conversaciones ilimitadas con el agente',
  'Sincronización automática con Strava y Garmin',
  'Plan adaptativo semanal',
  'Detección de fatiga, PRs y asimetrías',
  'Histórico completo, sin límite de actividades',
]

const MOBILE_LANDING_PRICING_FEATURES = [
  'Conversaciones ilimitadas',
  'Strava + Garmin',
  'Plan adaptativo semanal',
  'Detección de fatiga y PRs',
]

function formatLandingPrice(value: number): string {
  const formatter = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })

  return `${formatter.format(value)}€`
}

function getAnnualSavingsPercent(pricing: LandingPricingData): number {
  const fullYearMonthly = pricing.monthlyPrice * 12
  if (fullYearMonthly <= pricing.annualPrice) {
    return 0
  }

  return Math.round(((fullYearMonthly - pricing.annualPrice) / fullYearMonthly) * 100)
}

// ── SVG Marks ────────────────────────────────────────────────────────────────
function AthlyMark({ size = 22, accent = false }: { size?: number; accent?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <path d="M11 3 L19 19 L14.5 19 L11 11.5 L7.5 19 L3 19 Z" fill="#fff" />
      <path d="M11 11.5 L13.2 16 L8.8 16 Z" fill={accent ? A_ORANGE : A_ORANGE} />
    </svg>
  )
}

function StravaIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  )
}

// ── Noise grain overlay ───────────────────────────────────────────────────────
function Grain() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      }}
    />
  )
}

// ── Phone shell ───────────────────────────────────────────────────────────────
function PhoneShell({ width = 320, height = 660, children }: { width?: number; height?: number; children: ReactNode }) {
  return (
    <div style={{ width, height }}>
      <div style={{
        width, height, borderRadius: 44,
        background: 'linear-gradient(180deg, #1a2336 0%, #0c1426 100%)',
        padding: 8,
        boxShadow: '0 60px 120px -30px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.04)',
        position: 'relative',
      }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 36, background: '#0A1020', overflow: 'hidden', position: 'relative' }}>
          {children}
        </div>
        {/* Dynamic island */}
        <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', width: 96, height: 28, borderRadius: 14, background: '#000' }} />
      </div>
    </div>
  )
}

function PhoneStatus() {
  return (
    <div style={{ height: 44, padding: '14px 22px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff', fontSize: 13, fontFamily: FONT, fontWeight: 600 }}>
      <div>9:41</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <svg width="16" height="10" viewBox="0 0 16 10"><g fill="#fff">
          <rect x="0"  y="6" width="3" height="4" rx="0.5" />
          <rect x="4"  y="4" width="3" height="6" rx="0.5" />
          <rect x="8"  y="2" width="3" height="8" rx="0.5" />
          <rect x="12" y="0" width="3" height="10" rx="0.5" />
        </g></svg>
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
          <rect x="0" y="0" width="18" height="10" rx="2" stroke="#fff" strokeOpacity="0.6" />
          <rect x="2" y="2" width="14" height="6" rx="1" fill="#fff" />
          <rect x="19" y="3" width="2" height="4" rx="1" fill="#fff" opacity="0.6" />
        </svg>
      </div>
    </div>
  )
}

function MiniStat({ label, value, delta, warn }: { label: string; value: string; delta?: string; warn?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${A_LINE}` }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: A_DIM, letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', fontFamily: FONT, letterSpacing: '-0.02em' }}>{value}</div>
        {delta && <div style={{ fontFamily: MONO, fontSize: 9, color: warn ? A_AMBER : A_GREEN }}>{delta}</div>}
      </div>
    </div>
  )
}

function PhoneBubble({ user, children }: { user?: boolean; children: ReactNode }) {
  return (
    <div style={{
      maxWidth: '82%',
      alignSelf: user ? 'flex-end' : 'flex-start',
      padding: '10px 14px',
      borderRadius: user ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
      background: user ? 'rgba(255,255,255,0.08)' : 'transparent',
      border: user ? 'none' : `1px solid ${A_LINE}`,
      color: user ? '#fff' : 'rgba(255,255,255,0.85)',
      fontSize: 13, lineHeight: 1.45, fontFamily: FONT,
    }}>{children}</div>
  )
}

function PhoneAgentChat() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#070C1A', display: 'flex', flexDirection: 'column' }}>
      <PhoneStatus />
      {/* Header */}
      <div style={{ padding: '6px 18px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${A_ORANGE} 0%, ${A_AMBER} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AthlyMark size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: FONT }}>Athly</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: A_GREEN, boxShadow: `0 0 8px ${A_GREEN}` }} />
            <div style={{ fontFamily: MONO, fontSize: 10, color: A_DIM, letterSpacing: '0.06em' }}>STRAVA · sincronizado hace 2 min</div>
          </div>
        </div>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `1px solid ${A_LINE}` }} />
      </div>
      {/* Metric strip */}
      <div style={{ padding: '0 18px', display: 'flex', gap: 8 }}>
        <MiniStat label="CTL" value="68" delta="+3" />
        <MiniStat label="ATL" value="74" delta="+11" warn />
        <MiniStat label="TSB" value="−6" />
      </div>
      {/* Chat */}
      <div style={{ flex: 1, padding: '20px 18px 12px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <PhoneBubble user>¿Cuál fue mi mejor 5K este mes?</PhoneBubble>
        <PhoneBubble>
          Tu mejor 5K fue el <b style={{ color: '#fff' }}>martes</b> en <b style={{ color: A_AMBER }}>21:34</b>, ritmo 4:19/km. Mejoraste <span style={{ color: A_AMBER }}>23 seg</span> respecto al anterior.
        </PhoneBubble>
        <PhoneBubble user>¿Cuánto correr mañana?</PhoneBubble>
        <PhoneBubble>
          Carga alta esta semana (847 TSS). Recomiendo <b style={{ color: '#fff' }}>30–40 min fácil</b> en <span style={{ color: A_BLUE, fontFamily: MONO }}>zona 2</span>.
        </PhoneBubble>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: -2 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: A_DIM2 }} />
          <span style={{ width: 6, height: 6, borderRadius: 3, background: A_DIM }} />
          <span style={{ width: 6, height: 6, borderRadius: 3, background: A_DIM2 }} />
        </div>
      </div>
      {/* Composer */}
      <div style={{ padding: '8px 14px 18px' }}>
        <div style={{ height: 46, borderRadius: 23, background: 'rgba(255,255,255,0.04)', border: `1px solid ${A_LINE2}`, padding: '0 8px 0 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 13, color: A_DIM2 }}>Pregúntame sobre tu entrenamiento…</div>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: A_ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>↑</div>
        </div>
        <div style={{ height: 4, marginTop: 14, marginInline: '100px', borderRadius: 2, background: 'rgba(255,255,255,0.4)' }} />
      </div>
    </div>
  )
}

// ── Floating card components ──────────────────────────────────────────────────
type CardTone = 'up' | 'warn' | 'info'

function FloatingCard({ children, top, left, right, tone = 'info', floatStyle }: {
  children: ReactNode
  top?: number | string
  left?: number | string
  right?: number | string
  tone?: CardTone
  floatStyle?: 'a' | 'b'
}) {
  const ring = tone === 'up' ? 'rgba(34,197,94,0.25)' : tone === 'warn' ? 'rgba(252,76,2,0.3)' : 'rgba(59,130,246,0.25)'
  return (
    <div style={{
      position: 'absolute', top, left, right, zIndex: 3,
      width: 230, padding: 14, borderRadius: 14,
      background: 'linear-gradient(180deg, rgba(20,28,46,0.92), rgba(10,16,32,0.92))',
      border: `1px solid rgba(255,255,255,0.08)`,
      boxShadow: `0 30px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px ${ring}`,
      backdropFilter: 'blur(8px)',
      animation: floatStyle === 'a' ? 'athly-float-a 4s ease-in-out infinite' : floatStyle === 'b' ? 'athly-float-b 4.8s ease-in-out infinite' : undefined,
    }}>
      {children}
    </div>
  )
}

function CardHeader({ icon, tone, children }: { icon: string; tone: CardTone; children: ReactNode }) {
  const c = tone === 'up' ? A_GREEN : tone === 'warn' ? A_ORANGE : A_BLUE
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: 'rgba(255,255,255,0.06)', color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontFamily: MONO }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{children}</div>
    </div>
  )
}

function Sparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 200 32" width="100%" height="28" style={{ marginTop: 10 }}>
      <path d="M0 24 L20 22 L40 24 L60 18 L80 20 L100 14 L120 18 L140 10 L160 12 L180 6 L200 8" stroke={color} strokeWidth="1.5" fill="none" />
      <circle cx="180" cy="6" r="3" fill={color} />
    </svg>
  )
}

function BarRow() {
  const heights = [10, 14, 9, 16, 12, 20, 8]
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 24, marginTop: 10 }}>
      {heights.map((h, i) => (
        <div key={i} style={{ flex: 1, height: h, borderRadius: 1.5, background: i === 5 ? A_ORANGE : 'rgba(255,255,255,0.25)' }} />
      ))}
    </div>
  )
}

function ScanLine() {
  return (
    <div style={{ marginTop: 10, height: 26, position: 'relative', borderRadius: 6, background: 'rgba(59,130,246,0.08)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: 24, background: `linear-gradient(90deg, transparent, ${A_BLUE}, transparent)`, animation: 'athly-scan 2.4s linear infinite' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4 }}>
        {Array.from({ length: 28 }).map((_, i) => (
          <div key={i} style={{ width: 2, height: 4 + (i % 4) * 3, background: 'rgba(59,130,246,0.45)', borderRadius: 1 }} />
        ))}
      </div>
    </div>
  )
}

function RecoveryBar() {
  return (
    <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ width: '82%', height: '100%', background: `linear-gradient(90deg, ${A_GREEN}, ${A_CYAN})`, borderRadius: 3 }} />
    </div>
  )
}

function Avatars() {
  const cs = [A_ORANGE, A_BLUE, A_GREEN, '#A855F7']
  return (
    <div style={{ display: 'flex' }}>
      {cs.map((c, i) => (
        <div key={i} style={{ width: 24, height: 24, borderRadius: 12, background: c, marginLeft: i === 0 ? 0 : -8, border: '2px solid #050A18' }} />
      ))}
    </div>
  )
}

// ── Shared section header ─────────────────────────────────────────────────────
function SectionHeader({ eye, title }: { eye: string; title: ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.14em' }}>{eye}</div>
      <h2 style={{ margin: '14px 0 0', maxWidth: 800, fontSize: 'clamp(36px, 4.5vw, 60px)', lineHeight: 1, color: '#fff', letterSpacing: '-0.03em', fontWeight: 600 }}>
        {title}
      </h2>
    </div>
  )
}

// ── Feature visual mocks ──────────────────────────────────────────────────────
function FeatBubble({ user, children }: { user?: boolean; children: ReactNode }) {
  return (
    <div style={{
      maxWidth: '85%',
      alignSelf: user ? 'flex-end' : 'flex-start',
      padding: '10px 14px',
      borderRadius: user ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
      background: user ? 'rgba(255,255,255,0.08)' : 'transparent',
      border: user ? 'none' : `1px solid ${A_LINE2}`,
      color: user ? '#fff' : 'rgba(255,255,255,0.85)',
      fontSize: 13.5, lineHeight: 1.5, fontFamily: FONT,
    }}>{children}</div>
  )
}

function FeatChat() {
  return (
    <div style={{ background: '#070C1A', borderRadius: 18, border: `1px solid ${A_LINE}`, padding: 22, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 280 }}>
      <FeatBubble user>¿Estoy listo para 10×400 mañana?</FeatBubble>
      <FeatBubble>
        Sí — TSB en <b style={{ color: A_GREEN }}>−6</b>, sueño 7h12, FC reposo normal. Ritmo objetivo <b style={{ color: A_AMBER }}>3:45/km</b>, recuperación 90 seg.
      </FeatBubble>
      <FeatBubble user>¿Y si llueve?</FeatBubble>
      <FeatBubble>Cambio a 6×800 en cinta a 3:55. Mismo estímulo, menos riesgo.</FeatBubble>
    </div>
  )
}

function FeatPatterns() {
  const pts: [number, number][] = [[20,140],[50,130],[80,135],[110,118],[140,125],[170,108],[200,115],[230,98],[260,90],[290,75],[320,82],[350,62],[380,55]]
  return (
    <div style={{ background: '#070C1A', borderRadius: 18, border: `1px solid ${A_LINE}`, padding: 22, minHeight: 280, position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.1em' }}>RITMO 5K · ÚLTIMOS 90 DÍAS</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: A_GREEN }}>−47s</div>
      </div>
      <svg viewBox="0 0 400 180" width="100%" height="180" style={{ marginTop: 16 }}>
        <line x1="0" y1="60" x2="400" y2="60" stroke="rgba(255,255,255,0.06)" />
        <line x1="0" y1="120" x2="400" y2="120" stroke="rgba(255,255,255,0.06)" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill={i === 11 ? A_ORANGE : 'rgba(255,255,255,0.5)'} />
        ))}
        <path d="M20 140 C 80 130, 140 120, 200 110 S 320 70, 380 55" stroke={A_ORANGE} strokeWidth="2" fill="none" opacity="0.6" />
        <circle cx="350" cy="62" r="8" fill="none" stroke={A_ORANGE} strokeWidth="1.5" />
      </svg>
      <div style={{ position: 'absolute', right: 36, top: 86, padding: '6px 10px', borderRadius: 8, background: A_ORANGE, color: '#fff', fontSize: 11, fontFamily: MONO, fontWeight: 600 }}>
        PR · 21:34
      </div>
    </div>
  )
}

function FeatPlan() {
  const days = [
    { d: 'LUN', label: 'Fácil 45min',   tone: 'green' as const },
    { d: 'MAR', label: 'Series 8×400',  tone: 'orange' as const, updated: true },
    { d: 'MIE', label: 'Descanso',      tone: 'gray' as const },
    { d: 'JUE', label: 'Tempo 30min',   tone: 'orange' as const },
    { d: 'VIE', label: 'Movilidad',     tone: 'gray' as const },
    { d: 'SAB', label: 'Largo 18km',    tone: 'orange' as const },
    { d: 'DOM', label: 'Recuperación',  tone: 'green' as const },
  ]
  const dotColor = (t: 'orange' | 'green' | 'gray') => t === 'orange' ? A_ORANGE : t === 'green' ? A_GREEN : 'rgba(255,255,255,0.4)'
  return (
    <div style={{ background: '#070C1A', borderRadius: 18, border: `1px solid ${A_LINE}`, padding: 22, minHeight: 280 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.1em' }}>SEMANA · 28 ABR — 4 MAY</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: A_AMBER }}>↻ ajustado hace 4 min</div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {days.map(d => (
          <div key={d.d} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: `1px solid ${A_LINE}` }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.1em', width: 36 }}>{d.d}</div>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: dotColor(d.tone) }} />
            <div style={{ flex: 1, fontSize: 13, color: '#fff', fontFamily: FONT }}>{d.label}</div>
            {d.updated && <div style={{ fontFamily: MONO, fontSize: 10, color: A_AMBER }}>actualizado</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── CTA button styles ─────────────────────────────────────────────────────────
const ctaPrimaryStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 16px', borderRadius: 10,
  background: A_ORANGE, color: '#fff', border: 'none',
  fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
  boxShadow: '0 8px 24px -8px rgba(252,76,2,0.6)',
}

// ── Desktop NAV ───────────────────────────────────────────────────────────────
function Nav({ onLogin, isPending }: { onLogin: () => void; isPending?: boolean }) {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'rgba(5, 10, 24, 0.6)', backdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${A_LINE}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <AthlyMark size={26} />
        <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em', fontFamily: FONT }}>Athly</div>
        <div style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: `1px solid ${A_LINE2}`, fontFamily: MONO, fontSize: 10, color: A_DIM, letterSpacing: '0.08em' }}>BETA</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32, fontSize: 14, color: A_DIM, fontFamily: FONT }}>
        <a style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', cursor: 'pointer' }} href="#funciones">Funciones</a>
        <a style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', cursor: 'pointer' }} href="#como-funciona">Cómo funciona</a>
        <a style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', cursor: 'pointer' }} href="#atletas">Atletas</a>
        <a style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', cursor: 'pointer' }} href="#precio">Precio</a>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onLogin} disabled={isPending} style={{ ...ctaPrimaryStyle, opacity: isPending ? 0.7 : 1 }}>
          {isPending
            ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: 7, display: 'inline-block', animation: 'spin 0.8s linear infinite' }} /> Conectando…</>
            : <><StravaIcon size={14} /> Conectar con Strava</>
          }
        </button>
      </div>
    </nav>
  )
}

// ── Desktop HERO ──────────────────────────────────────────────────────────────
function Hero({ onLogin, isPending }: { onLogin: () => void; isPending?: boolean }) {
  return (
    <section style={{
      position: 'relative', overflow: 'hidden',
      padding: '80px 40px 120px',
      background: `radial-gradient(1200px 600px at 80% 20%, rgba(252,76,2,0.18), transparent 60%),
                   radial-gradient(900px 600px at 10% 60%, rgba(59,130,246,0.18), transparent 60%)`,
    }}>
      <Grain />
      <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        {/* Eyebrow */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: `1px solid ${A_LINE2}`, fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: A_GREEN, boxShadow: `0 0 8px ${A_GREEN}` }} />
          AGENTE IA · IMPULSADO POR TUS DATOS DE STRAVA
        </div>

        <h1 style={{ margin: '24px 0 0', maxWidth: 920, fontSize: 'clamp(48px, 6vw, 84px)', lineHeight: 0.96, fontWeight: 600, letterSpacing: '-0.035em', color: '#fff', fontFamily: FONT }}>
          Tu rendimiento,<br />
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>sin filtros ni complicaciones.</span>
        </h1>

        <p style={{ marginTop: 28, maxWidth: 560, fontSize: 18, lineHeight: 1.55, color: 'rgba(255,255,255,0.7)', fontFamily: FONT }}>
          Athly es un agente que lee cada actividad, conversa contigo y te dice qué entrenar, cuándo descansar y por qué — en lenguaje humano, no en gráficas que tienes que descifrar.
        </p>

        <div style={{ marginTop: 36, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onLogin} disabled={isPending} style={{ ...ctaPrimaryStyle, padding: '14px 22px', fontSize: 15 }}>
            {isPending
              ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: 7, display: 'inline-block' }} /> Conectando…</>
              : <><StravaIcon size={16} /> Conectar con Strava</>
            }
          </button>
          <button style={{ padding: '14px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', color: '#fff', border: `1px solid ${A_LINE2}`, fontSize: 15, fontWeight: 500, fontFamily: FONT, cursor: 'pointer' }}>
            Ver demo · 90 seg →
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8, color: A_DIM, fontSize: 13, fontFamily: FONT }}>
            <Avatars />
            <span>+12.400 atletas conectados esta semana</span>
          </div>
        </div>

        {/* Phone + floating cards */}
        <div style={{ marginTop: 80, position: 'relative', height: 720, display: 'flex', justifyContent: 'center' }}>
          {/* Glow plate */}
          <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', width: 520, height: 580, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(252,76,2,0.25), transparent 70%)', filter: 'blur(20px)' }} />

          {/* Phone */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            <PhoneShell width={340} height={700}>
              <PhoneAgentChat />
            </PhoneShell>
          </div>

          {/* Left cards */}
          <FloatingCard top={120} left="6%" tone="up" floatStyle="a">
            <CardHeader icon="↗" tone="up">PR detectado · 5K</CardHeader>
            <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, marginTop: 4 }}>21:34 · Hoy 7:30am</div>
            <Sparkline color={A_GREEN} />
          </FloatingCard>

          <FloatingCard top={320} left="2%" tone="warn" floatStyle="b">
            <CardHeader icon="◐" tone="warn">Carga semanal alta</CardHeader>
            <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, marginTop: 4 }}>847 TSS · Descansa mañana</div>
            <BarRow />
          </FloatingCard>

          {/* Right cards */}
          <FloatingCard top={80} right="4%" tone="info" floatStyle="b">
            <CardHeader icon="●" tone="info">Agente analizando</CardHeader>
            <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, marginTop: 4 }}>Identificando patrones de ritmo</div>
            <ScanLine />
          </FloatingCard>

          <FloatingCard top={300} right="8%" tone="up" floatStyle="a">
            <CardHeader icon="▮" tone="up">Recuperación: 82%</CardHeader>
            <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, marginTop: 4 }}>Listo para entrenar hoy</div>
            <RecoveryBar />
          </FloatingCard>

          <FloatingCard top={520} right="14%" tone="info">
            <CardHeader icon="⌖" tone="info">Próxima carrera</CardHeader>
            <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, marginTop: 4 }}>Maratón Madrid · 38 días</div>
          </FloatingCard>

          <FloatingCard top={540} left="10%" tone="warn">
            <CardHeader icon="✦" tone="warn">Asimetría detectada</CardHeader>
            <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, marginTop: 4 }}>Pierna der. +4% impacto</div>
          </FloatingCard>
        </div>
      </div>
    </section>
  )
}

// ── Logos strip ───────────────────────────────────────────────────────────────
function LogosStrip() {
  const items = ['STRAVA', 'GARMIN', 'WAHOO', 'COROS', 'POLAR', 'SUUNTO', 'APPLE HEALTH']
  return (
    <section style={{ padding: '40px 40px 60px', borderTop: `1px solid ${A_LINE}`, borderBottom: `1px solid ${A_LINE}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.14em' }}>SE CONECTA CON</div>
        {items.map(l => (
          <div key={l} style={{ fontFamily: MONO, fontSize: 14, color: 'rgba(255,255,255,0.55)', fontWeight: 500, letterSpacing: '0.08em' }}>{l}</div>
        ))}
      </div>
    </section>
  )
}

// ── Features section ──────────────────────────────────────────────────────────
function Features() {
  const items = [
    { tag: '01 · CONVERSA', t: 'Habla con tu agente como con un coach.', d: 'Pregúntale en lenguaje natural: "¿Estoy listo para una serie de 10×400?". Athly conoce tus zonas, tu fatiga y tu historial.', visual: <FeatChat /> },
    { tag: '02 · DETECTA', t: 'Encuentra patrones que tú no ves.', d: 'Athly cruza ritmo, frecuencia, sueño y volumen para detectar PRs, sobreentrenamiento o asimetrías antes de que se vuelvan lesión.', visual: <FeatPatterns /> },
    { tag: '03 · DECIDE', t: 'Plan que se reescribe solo.', d: 'Si duermes mal o subiste pulsaciones, el plan de mañana ya viene ajustado. Sin abrir hojas de cálculo.', visual: <FeatPlan /> },
  ]
  return (
    <section id="funciones" style={{ padding: '120px 40px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <SectionHeader eye="FUNCIONES" title={<>Tres cosas que tu reloj <span style={{ color: A_DIM }}>no hace.</span></>} />
        <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', gap: 32 }}>
          {items.map((it, i) => (
            <div key={i} style={{ padding: 32, borderRadius: 24, background: 'linear-gradient(180deg, rgba(20,28,46,0.6), rgba(10,16,32,0.6))', border: `1px solid ${A_LINE}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
              <div style={{ order: i % 2 === 0 ? 0 : 1 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: A_ORANGE, letterSpacing: '0.14em' }}>{it.tag}</div>
                <h3 style={{ margin: '14px 0 0', fontSize: 36, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.025em', fontWeight: 600, fontFamily: FONT }}>{it.t}</h3>
                <p style={{ marginTop: 14, fontSize: 16, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55, maxWidth: 460, fontFamily: FONT }}>{it.d}</p>
              </div>
              <div style={{ order: i % 2 === 0 ? 1 : 0 }}>{it.visual}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: '01', t: 'Conecta Strava', d: 'Un clic. Athly importa tus últimos 90 días para entender de dónde vienes.' },
    { n: '02', t: 'El agente aprende', d: 'En 2 minutos calibra tus zonas, ritmos y patrones de fatiga reales — no genéricos.' },
    { n: '03', t: 'Pregunta. Entrena. Ajusta.', d: 'Cada conversación afina el plan. Cada actividad reentrena al agente.' },
  ]
  return (
    <section id="como-funciona" style={{ padding: '120px 40px', borderTop: `1px solid ${A_LINE}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <SectionHeader eye="CÓMO FUNCIONA" title={<>Listo en menos<br />de tres minutos.</>} />
        <div style={{ marginTop: 64, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {steps.map((s, i) => (
            <div key={s.n} style={{ position: 'relative' }}>
              <div style={{ fontFamily: MONO, fontSize: 13, color: A_ORANGE, letterSpacing: '0.1em' }}>{s.n}</div>
              <div style={{ marginTop: 12, height: 1, background: A_LINE2, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: -3, width: 7, height: 7, borderRadius: 4, background: A_ORANGE }} />
                {i < steps.length - 1 && <div style={{ position: 'absolute', right: -12, top: -3, width: 7, height: 7, borderRadius: 4, background: A_LINE2 }} />}
              </div>
              <h3 style={{ margin: '24px 0 0', fontSize: 28, color: '#fff', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1, fontFamily: FONT }}>{s.t}</h3>
              <p style={{ marginTop: 12, fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55, fontFamily: FONT }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Athletes / testimonials ────────────────────────────────────────────────────
function Athletes() {
  const testimonials = [
    { q: '"Dejé de exportar a hojas de Excel los domingos. Athly responde en un mensaje lo que me llevaba una hora."', n: 'Lucía M.', r: 'Maratonista · 2:58' },
    { q: '"Detectó que iba sobreentrenado tres semanas antes que mi entrenador. Ahora me fío de los dos."', n: 'David R.', r: 'Triatleta · 70.3' },
    { q: '"No sabía leer el TSS. Ahora simplemente le pregunto si puedo correr fuerte mañana y me explica el porqué."', n: 'Ana P.', r: 'Trail runner' },
  ]
  return (
    <section id="atletas" style={{ padding: '120px 40px', borderTop: `1px solid ${A_LINE}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <SectionHeader eye="ATLETAS" title={<>Lo que dicen quienes <span style={{ color: A_DIM }}>ya entrenan con Athly.</span></>} />
        <div style={{ marginTop: 64, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {testimonials.map((c, i) => (
            <div key={i} style={{ padding: 28, borderRadius: 20, background: 'linear-gradient(180deg, rgba(20,28,46,0.6), rgba(10,16,32,0.6))', border: `1px solid ${A_LINE}`, display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div style={{ fontSize: 18, lineHeight: 1.45, color: '#fff', fontWeight: 500, letterSpacing: '-0.01em', fontFamily: FONT }}>{c.q}</div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: `linear-gradient(135deg, ${A_ORANGE}, ${A_AMBER})` }} />
                <div>
                  <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, fontFamily: FONT }}>{c.n}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.06em' }}>{c.r}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing ───────────────────────────────────────────────────────────────────
function Pricing({ onLogin, isPending, pricing }: { onLogin: () => void; isPending?: boolean; pricing: LandingPricingData }) {
  const annualSavings = getAnnualSavingsPercent(pricing)
  return (
    <section id="precio" style={{ padding: '120px 40px', borderTop: `1px solid ${A_LINE}` }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.14em' }}>PRECIO</div>
        <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(36px, 4.5vw, 60px)', color: '#fff', letterSpacing: '-0.03em', fontWeight: 600, lineHeight: 1.05, fontFamily: FONT }}>
          Un solo plan.<br /><span style={{ color: A_DIM }}>Cancelas cuando quieras.</span>
        </h2>
        <div style={{ margin: '60px auto 0', maxWidth: 480, padding: 32, borderRadius: 24, textAlign: 'left', background: 'linear-gradient(180deg, rgba(252,76,2,0.18) 0%, rgba(20,28,46,0.6) 30%, rgba(10,16,32,0.6) 100%)', border: `1px solid rgba(252,76,2,0.35)`, boxShadow: '0 40px 80px -20px rgba(252,76,2,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: A_ORANGE, fontFamily: MONO, letterSpacing: '0.08em' }}>ATHLY PRO</div>
            <div style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', fontFamily: MONO, fontSize: 10, color: A_DIM, letterSpacing: '0.1em' }}>{pricing.trialDays} DÍAS GRATIS</div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 64, color: '#fff', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: FONT }}>{formatLandingPrice(pricing.monthlyPrice)}</div>
            <div style={{ fontSize: 16, color: A_DIM, fontFamily: FONT }}>/ mes</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.06em', marginTop: 4 }}>{`O ${formatLandingPrice(pricing.annualPrice)}/AÑO${annualSavings > 0 ? ` · AHORRA ${annualSavings}%` : ''}`}</div>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {LANDING_PRICING_FEATURES.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.85)', fontFamily: FONT }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: 'rgba(34,197,94,0.15)', color: A_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>✓</div>
                {f}
              </div>
            ))}
          </div>
          <button onClick={onLogin} disabled={isPending} style={{ ...ctaPrimaryStyle, width: '100%', padding: '14px 22px', fontSize: 15, marginTop: 28, justifyContent: 'center', opacity: isPending ? 0.7 : 1 }}>
            <StravaIcon size={16} /> Empezar prueba con Strava
          </button>
          <div style={{ marginTop: 12, textAlign: 'center', fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.06em' }}>
            Sin tarjeta. Sin compromiso.
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCTA({ onLogin, isPending }: { onLogin: () => void; isPending?: boolean }) {
  return (
    <section style={{ padding: '140px 40px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(800px 400px at 50% 100%, rgba(252,76,2,0.25), transparent 70%)' }} />
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        <h2 style={{ fontSize: 'clamp(40px, 5vw, 72px)', color: '#fff', letterSpacing: '-0.035em', fontWeight: 600, lineHeight: 1, margin: 0, fontFamily: FONT }}>
          Deja de mirar gráficas.<br />
          <span style={{ color: A_ORANGE }}>Empieza a conversar.</span>
        </h2>
        <p style={{ marginTop: 24, fontSize: 18, color: 'rgba(255,255,255,0.65)', maxWidth: 560, margin: '24px auto 0', lineHeight: 1.55, fontFamily: FONT }}>
          Conecta tu Strava y deja que Athly haga el trabajo de leer entre líneas. Tú corre.
        </p>
        <button onClick={onLogin} disabled={isPending} style={{ ...ctaPrimaryStyle, padding: '16px 28px', fontSize: 16, marginTop: 36, opacity: isPending ? 0.7 : 1 }}>
          <StravaIcon size={16} /> Conectar con Strava — gratis 14 días
        </button>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  const cols = [
    { t: 'Producto', l: ['Funciones', 'Precio', 'Demo', 'Cambios'] },
    { t: 'Empresa',  l: ['Sobre nosotros', 'Blog', 'Trabajo', 'Contacto'] },
    { t: 'Legal',    l: ['Privacidad', 'Términos', 'Cookies'] },
  ]
  return (
    <footer style={{ padding: '60px 40px 40px', borderTop: `1px solid ${A_LINE}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AthlyMark size={26} />
            <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', fontFamily: FONT }}>Athly</div>
          </div>
          <p style={{ marginTop: 14, fontSize: 13, color: A_DIM, lineHeight: 1.55, maxWidth: 320, fontFamily: FONT }}>
            Agente IA para corredores y triatletas. Hecho con cariño en Barcelona.
          </p>
        </div>
        {cols.map(col => (
          <div key={col.t}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.12em' }}>{col.t.toUpperCase()}</div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.l.map(x => <a key={x} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', cursor: 'pointer', fontSize: 13, fontFamily: FONT }}>{x}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1280, margin: '40px auto 0', paddingTop: 24, borderTop: `1px solid ${A_LINE}`, display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 11, color: A_DIM, letterSpacing: '0.06em' }}>
        <div>© 2026 ATHLY · TODOS LOS DERECHOS RESERVADOS</div>
        <div>HECHO PARA CORREDORES, NO PARA HOJAS DE CÁLCULO</div>
      </div>
    </footer>
  )
}

// ── Mobile NAV ────────────────────────────────────────────────────────────────
function MobileNav({ onLogin, isPending }: { onLogin: () => void; isPending?: boolean }) {
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(5, 10, 24, 0.7)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${A_LINE}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AthlyMark size={22} />
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', fontFamily: FONT }}>Athly</div>
      </div>
      <button onClick={onLogin} disabled={isPending} style={{ padding: '8px 14px', borderRadius: 8, background: A_ORANGE, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: isPending ? 0.7 : 1, cursor: 'pointer' }}>
        <StravaIcon size={12} /> Conectar
      </button>
    </nav>
  )
}

// ── Mobile HERO ───────────────────────────────────────────────────────────────
function MiniCardM({ tone, icon, t, d }: { tone: CardTone; icon: string; t: string; d: string }) {
  const c = tone === 'up' ? A_GREEN : tone === 'warn' ? A_ORANGE : A_BLUE
  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'rgba(20,28,46,0.6)', border: `1px solid ${A_LINE}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: MONO }}>{icon}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', fontFamily: FONT }}>{t}</div>
      </div>
      <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 10, color: A_DIM }}>{d}</div>
    </div>
  )
}

function MobileHero({ onLogin, isPending }: { onLogin: () => void; isPending?: boolean }) {
  return (
    <section style={{ position: 'relative', overflow: 'hidden', padding: '40px 22px 60px', background: `radial-gradient(600px 400px at 80% 0%, rgba(252,76,2,0.25), transparent 60%), radial-gradient(500px 400px at 0% 60%, rgba(59,130,246,0.18), transparent 60%)` }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: `1px solid ${A_LINE2}`, fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em' }}>
        <span style={{ width: 5, height: 5, borderRadius: 3, background: A_GREEN, boxShadow: `0 0 6px ${A_GREEN}` }} />
        AGENTE IA · STRAVA
      </div>
      <h1 style={{ margin: '20px 0 0', fontSize: 44, lineHeight: 0.98, fontWeight: 600, letterSpacing: '-0.035em', color: '#fff', fontFamily: FONT }}>
        Tu rendimiento,<br />
        <span style={{ color: 'rgba(255,255,255,0.55)' }}>sin filtros.</span>
      </h1>
      <p style={{ marginTop: 20, fontSize: 16, lineHeight: 1.5, color: 'rgba(255,255,255,0.7)', fontFamily: FONT }}>
        Athly lee tu Strava, conversa contigo y te dice qué entrenar — en lenguaje humano.
      </p>
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={onLogin} disabled={isPending} style={{ padding: '14px 18px', borderRadius: 12, background: A_ORANGE, color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, fontFamily: FONT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 12px 32px -8px rgba(252,76,2,0.5)', opacity: isPending ? 0.7 : 1, cursor: 'pointer' }}>
          <StravaIcon size={14} /> Conectar con Strava
        </button>
        <button style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', color: '#fff', border: `1px solid ${A_LINE2}`, fontSize: 14, fontWeight: 500, fontFamily: FONT, cursor: 'pointer' }}>
          Ver demo · 90 seg →
        </button>
      </div>
      {/* Phone */}
      <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)', width: 320, height: 360, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(252,76,2,0.3), transparent 70%)', filter: 'blur(20px)' }} />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <PhoneShell width={300} height={620}>
            <PhoneAgentChat />
          </PhoneShell>
        </div>
      </div>
      {/* Mini cards */}
      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <MiniCardM tone="up"   icon="↗" t="PR · 5K"         d="21:34 · hoy" />
        <MiniCardM tone="warn" icon="◐" t="Carga alta"       d="847 TSS" />
        <MiniCardM tone="info" icon="●" t="Recuperación 82%" d="Listo hoy" />
        <MiniCardM tone="info" icon="⌖" t="Maratón"          d="38 días" />
      </div>
    </section>
  )
}

// ── Mobile Features ───────────────────────────────────────────────────────────
function MobileFeatures() {
  const items = [
    { tag: '01 · CONVERSA', t: 'Habla con tu agente.', d: 'Pregúntale en lenguaje natural si estás listo para una serie dura. Conoce tus zonas y tu fatiga.' },
    { tag: '02 · DETECTA',  t: 'Encuentra patrones.',  d: 'Cruza ritmo, sueño y volumen para detectar PRs, sobreentrenamiento o asimetrías a tiempo.' },
    { tag: '03 · DECIDE',   t: 'Plan que se reescribe.', d: 'Si duermes mal o subiste pulsaciones, el plan de mañana ya viene ajustado.' },
  ]
  return (
    <section style={{ padding: '60px 22px' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: A_DIM, letterSpacing: '0.14em' }}>FUNCIONES</div>
      <h2 style={{ margin: '12px 0 0', fontSize: 32, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.025em', fontWeight: 600, fontFamily: FONT }}>
        Tres cosas que tu reloj <span style={{ color: A_DIM }}>no hace.</span>
      </h2>
      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map(it => (
          <div key={it.tag} style={{ padding: 22, borderRadius: 18, background: 'rgba(20,28,46,0.5)', border: `1px solid ${A_LINE}` }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: A_ORANGE, letterSpacing: '0.14em' }}>{it.tag}</div>
            <h3 style={{ margin: '10px 0 0', fontSize: 22, color: '#fff', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15, fontFamily: FONT }}>{it.t}</h3>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55, fontFamily: FONT }}>{it.d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Mobile Steps ──────────────────────────────────────────────────────────────
function MobileSteps() {
  const steps = [
    { n: '01', t: 'Conecta Strava', d: 'Un clic. Importa tus últimos 90 días.' },
    { n: '02', t: 'El agente aprende', d: 'Calibra tus zonas y patrones reales.' },
    { n: '03', t: 'Pregunta y entrena', d: 'Cada conversación afina el plan.' },
  ]
  return (
    <section style={{ padding: '60px 22px', borderTop: `1px solid ${A_LINE}` }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: A_DIM, letterSpacing: '0.14em' }}>CÓMO FUNCIONA</div>
      <h2 style={{ margin: '12px 0 0', fontSize: 32, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.025em', fontWeight: 600, fontFamily: FONT }}>
        Listo en menos de tres minutos.
      </h2>
      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: 'flex', gap: 14, paddingBottom: 22 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, background: A_ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: MONO, fontWeight: 600 }}>{s.n}</div>
              {i < steps.length - 1 && <div style={{ width: 1, flex: 1, background: A_LINE2, marginTop: 6 }} />}
            </div>
            <div style={{ paddingTop: 2 }}>
              <div style={{ fontSize: 17, color: '#fff', fontWeight: 600, letterSpacing: '-0.01em', fontFamily: FONT }}>{s.t}</div>
              <div style={{ marginTop: 4, fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, fontFamily: FONT }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Mobile Athletes ───────────────────────────────────────────────────────────
function MobileAthletes() {
  const t = [
    { q: '"Dejé de exportar a Excel los domingos."', n: 'Lucía M.', r: 'Maratón · 2:58' },
    { q: '"Detectó sobreentrenamiento tres semanas antes que mi entrenador."', n: 'David R.', r: 'Triatleta · 70.3' },
    { q: '"Le pregunto si puedo correr fuerte y me explica el porqué."', n: 'Ana P.', r: 'Trail runner' },
  ]
  return (
    <section style={{ padding: '60px 22px', borderTop: `1px solid ${A_LINE}` }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: A_DIM, letterSpacing: '0.14em' }}>ATLETAS</div>
      <h2 style={{ margin: '12px 0 0', fontSize: 32, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.025em', fontWeight: 600, fontFamily: FONT }}>
        Lo que dicen quienes <span style={{ color: A_DIM }}>ya entrenan con Athly.</span>
      </h2>
      <div style={{ marginTop: 28, display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory' }}>
        {t.map((c, i) => (
          <div key={i} style={{ minWidth: 280, padding: 22, borderRadius: 18, background: 'rgba(20,28,46,0.6)', border: `1px solid ${A_LINE}`, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontSize: 16, lineHeight: 1.45, color: '#fff', fontWeight: 500, fontFamily: FONT }}>{c.q}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: `linear-gradient(135deg, ${A_ORANGE}, ${A_AMBER})` }} />
              <div>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, fontFamily: FONT }}>{c.n}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: A_DIM }}>{c.r}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Mobile Pricing ────────────────────────────────────────────────────────────
function MobilePricing({ onLogin, isPending, pricing }: { onLogin: () => void; isPending?: boolean; pricing: LandingPricingData }) {
  return (
    <section style={{ padding: '60px 22px', borderTop: `1px solid ${A_LINE}` }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: A_DIM, letterSpacing: '0.14em' }}>PRECIO</div>
      <h2 style={{ margin: '12px 0 0', fontSize: 32, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.025em', fontWeight: 600, fontFamily: FONT }}>
        Un plan. <span style={{ color: A_DIM }}>Cancelas cuando quieras.</span>
      </h2>
      <div style={{ marginTop: 28, padding: 22, borderRadius: 20, background: 'linear-gradient(180deg, rgba(252,76,2,0.18) 0%, rgba(20,28,46,0.6) 30%, rgba(10,16,32,0.6) 100%)', border: `1px solid rgba(252,76,2,0.35)` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: A_ORANGE, fontFamily: MONO, letterSpacing: '0.08em' }}>ATHLY PRO</div>
          <div style={{ padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', fontFamily: MONO, fontSize: 9, color: A_DIM, letterSpacing: '0.1em' }}>{pricing.trialDays} DÍAS GRATIS</div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <div style={{ fontSize: 52, color: '#fff', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: FONT }}>{formatLandingPrice(pricing.monthlyPrice)}</div>
          <div style={{ fontSize: 14, color: A_DIM, fontFamily: FONT }}>/ mes</div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MOBILE_LANDING_PRICING_FEATURES.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'rgba(255,255,255,0.85)', fontFamily: FONT }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, background: 'rgba(34,197,94,0.15)', color: A_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>✓</div>
              {f}
            </div>
          ))}
        </div>
        <button onClick={onLogin} disabled={isPending} style={{ marginTop: 22, width: '100%', padding: '14px 18px', borderRadius: 12, background: A_ORANGE, color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, fontFamily: FONT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isPending ? 0.7 : 1, cursor: 'pointer' }}>
          <StravaIcon size={14} /> Empezar prueba con Strava
        </button>
        <div style={{ marginTop: 10, textAlign: 'center', fontFamily: MONO, fontSize: 10, color: A_DIM }}>SIN TARJETA · SIN COMPROMISO</div>
      </div>
    </section>
  )
}

// ── Mobile Footer ─────────────────────────────────────────────────────────────
function MobileFooter() {
  return (
    <footer style={{ padding: '40px 22px 32px', borderTop: `1px solid ${A_LINE}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <AthlyMark size={22} />
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', fontFamily: FONT }}>Athly</div>
      </div>
      <p style={{ marginTop: 12, fontSize: 12, color: A_DIM, lineHeight: 1.55, fontFamily: FONT }}>
        Agente IA para corredores y triatletas. Hecho con cariño en Barcelona.
      </p>
      <div style={{ marginTop: 24, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: FONT }}>
        <a style={{ cursor: 'pointer' }}>Funciones</a>
        <a style={{ cursor: 'pointer' }}>Precio</a>
        <a style={{ cursor: 'pointer' }}>Privacidad</a>
        <a style={{ cursor: 'pointer' }}>Términos</a>
        <a style={{ cursor: 'pointer' }}>Contacto</a>
      </div>
      <div style={{ marginTop: 24, fontFamily: MONO, fontSize: 10, color: A_DIM, letterSpacing: '0.06em' }}>
        © 2026 ATHLY
      </div>
    </footer>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function AuthSwitch({ onLogin, isPending, error }: AuthSwitchProps) {
  const [pricing, setPricing] = useState(DEFAULT_LANDING_PRICING)

  useEffect(() => {
    let cancelled = false

    void getLandingPricing().then((nextPricing) => {
      if (!cancelled) {
        setPricing(nextPricing)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const baseStyle: CSSProperties = {
    background: '#050A18',
    color: '#fff',
    fontFamily: FONT,
    WebkitFontSmoothing: 'antialiased' as CSSProperties['WebkitFontSmoothing'],
  }

  return (
    <div style={baseStyle}>
      {/* ── Desktop (> 760px) ── */}
      <div className="hidden md:block">
        <Nav onLogin={onLogin} isPending={isPending} />
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(252,76,2,0.15)', borderBottom: `1px solid rgba(252,76,2,0.3)`, padding: '10px 40px', fontSize: 13, color: 'rgba(255,180,140,0.9)', fontFamily: FONT }}
          >
            {error}
          </motion.div>
        )}
        <Hero onLogin={onLogin} isPending={isPending} />
        <LogosStrip />
        <Features />
        <HowItWorks />
        <Athletes />
        <Pricing onLogin={onLogin} isPending={isPending} pricing={pricing} />
        <FinalCTA onLogin={onLogin} isPending={isPending} />
        <Footer />
      </div>

      {/* ── Mobile (≤ 760px) ── */}
      <div className="block md:hidden">
        <MobileNav onLogin={onLogin} isPending={isPending} />
        {error && (
          <div style={{ background: 'rgba(252,76,2,0.15)', borderBottom: `1px solid rgba(252,76,2,0.3)`, padding: '8px 22px', fontSize: 12, color: 'rgba(255,180,140,0.9)', fontFamily: FONT }}>
            {error}
          </div>
        )}
        <MobileHero onLogin={onLogin} isPending={isPending} />
        <MobileFeatures />
        <MobileSteps />
        <MobileAthletes />
        <MobilePricing onLogin={onLogin} isPending={isPending} pricing={pricing} />
        <MobileFooter />
      </div>
    </div>
  )
}
