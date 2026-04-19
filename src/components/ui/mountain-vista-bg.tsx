import React, { useEffect, useMemo, useState } from 'react'

// ── Layer configuration ───────────────────────────────────────────────────
const BASE_URL = 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/24650'

type LayerConfig = {
  className: string
  speed: string
  size: string
  zIndex: number
  image: string
}

// 4 mountain layers only — bikes removed (they animated background-position on
// the main thread). Visual depth is preserved with 4 evenly-spaced planes.
const LAYERS: LayerConfig[] = [
  { className: 'layer-6', speed: '120s', size: '222px', zIndex: 1, image: '6' },
  { className: 'layer-4', speed: '75s',  size: '468px', zIndex: 2, image: '4' },
  { className: 'layer-2', speed: '30s',  size: '145px', zIndex: 3, image: '2' },
  { className: 'layer-1', speed: '20s',  size: '136px', zIndex: 4, image: '1' },
]

// Low-power: only the 2 closest layers (most visible)
const LAYERS_LOW: LayerConfig[] = [LAYERS[2], LAYERS[3]]

function isLowPower(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { deviceMemory?: number }
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4) ||
    (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) ||
    (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1024)
  )
}

interface MountainVistaParallaxProps {
  title?: string
  subtitle?: string
}

const MountainVistaParallax = ({ title = '', subtitle = '' }: MountainVistaParallaxProps) => {
  const [lowPower, setLowPower] = useState(() => isLowPower())
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const check = () => setLowPower(isLowPower())
    window.addEventListener('resize', check, { passive: true })
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const sync = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const layers = lowPower ? LAYERS_LOW : LAYERS

  const dynamicStyles = useMemo(
    () =>
      layers
        .map(
          (l) => `
          .${l.className} { z-index: ${l.zIndex}; }
          .${l.className} .parallax-inner {
            background-image: url(${BASE_URL}/${l.image}.png);
            animation-duration: ${l.speed};
            background-size: auto ${l.size};
          }`,
        )
        .join('\n'),
    [layers],
  )

  const cls = ['hero-container', paused && 'hero-container--paused'].filter(Boolean).join(' ')

  return (
    <section className={cls} aria-hidden="true">
      <style>{dynamicStyles}</style>

      <div className="parallax-wrapper">
        {layers.map((l) => (
          <div key={l.className} className={`parallax-layer ${l.className}`}>
            <div className="parallax-inner" />
          </div>
        ))}
        {/* Dark blue overlay — replaces the expensive per-frame CSS filter */}
        <div className="parallax-tint" />
      </div>

      {(title || subtitle) && (
        <div className="hero-content">
          {title && <h1 className="hero-title">{title}</h1>}
          {subtitle && <p className="hero-subtitle">{subtitle}</p>}
        </div>
      )}
    </section>
  )
}

export default React.memo(MountainVistaParallax)
