import React, { useEffect, useMemo, useState } from 'react'

// ── Layer configuration ───────────────────────────────────────────────────
const BASE_URL = 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/24650'

type LayerConfig = {
  className: string
  speed: string
  size: string
  zIndex: number
  image: string
  animation?: 'parallax_scroll' | 'parallax_bike'
  bottom?: string
  noRepeat?: boolean
}

const layersData: LayerConfig[] = [
  { className: 'layer-6', speed: '120s', size: '222px', zIndex: 1, image: '6' },
  { className: 'layer-5', speed: '95s',  size: '311px', zIndex: 1, image: '5' },
  { className: 'layer-4', speed: '75s',  size: '468px', zIndex: 1, image: '4' },
  { className: 'bike-1',  speed: '10s',  size: '75px',  zIndex: 2, image: 'bike', animation: 'parallax_bike', bottom: '100px', noRepeat: true },
  { className: 'bike-2',  speed: '15s',  size: '75px',  zIndex: 2, image: 'bike', animation: 'parallax_bike', bottom: '100px', noRepeat: true },
  { className: 'layer-3', speed: '55s',  size: '158px', zIndex: 3, image: '3' },
  { className: 'layer-2', speed: '30s',  size: '145px', zIndex: 4, image: '2' },
  { className: 'layer-1', speed: '20s',  size: '136px', zIndex: 5, image: '1' },
]

const LOW_POWER_LAYER_CLASSES = new Set(['layer-6', 'layer-4', 'layer-2', 'layer-1'])
const MOBILE_BREAKPOINT_PX = 1024

function detectLowPowerMode(): boolean {
  if (typeof window === 'undefined') return false

  const nav = navigator as Navigator & { deviceMemory?: number }
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const lowCoreCount = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const smallViewport = window.innerWidth < MOBILE_BREAKPOINT_PX

  return prefersReducedMotion || lowCoreCount || lowMemory || (coarsePointer && smallViewport)
}

interface MountainVistaParallaxProps {
  title?: string
  subtitle?: string
}

const MountainVistaParallax = ({ title = '', subtitle = '' }: MountainVistaParallaxProps) => {
  const [isLowPower, setIsLowPower] = useState(() => detectLowPowerMode())
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    const evaluateMode = () => setIsLowPower(detectLowPowerMode())
    evaluateMode()

    window.addEventListener('resize', evaluateMode, { passive: true })
    return () => window.removeEventListener('resize', evaluateMode)
  }, [])

  useEffect(() => {
    const syncVisibility = () => setIsPaused(document.hidden)
    syncVisibility()

    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  }, [])

  const activeLayers = useMemo(
    () => (isLowPower ? layersData.filter((layer) => LOW_POWER_LAYER_CLASSES.has(layer.className)) : layersData),
    [isLowPower],
  )

  const dynamicStyles = useMemo(() => {
    return activeLayers
      .map((layer) => {
        const url = `${BASE_URL}/${layer.image}.png`
        const isBike = layer.noRepeat
        const animationName = layer.animation ?? 'parallax_scroll'

        return `
          .${layer.className} {
            z-index: ${layer.zIndex};
            ${layer.bottom ? `bottom: ${layer.bottom};` : ''}
          }
          .${layer.className} .parallax-inner {
            background-image: url(${url});
            animation-duration: ${layer.speed};
            animation-name: ${animationName};
            background-size: auto ${layer.size};
            ${isBike ? `
              background-repeat: no-repeat;
              width: 100%;
              animation-name: parallax_bike;
              background-position: -300px 100%;
              will-change: auto;
            ` : ''}
          }
        `
      })
      .join('\n')
  }, [activeLayers])

  const containerClassName = [
    'hero-container',
    isLowPower ? 'hero-container--low-power' : '',
    isPaused ? 'hero-container--paused' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={containerClassName}
      aria-label="Animated parallax mountain landscape at night"
      aria-hidden="true"
    >
      <style>{dynamicStyles}</style>

      <div className="parallax-wrapper">
        {activeLayers.map((layer) => (
          <div key={layer.className} className={`parallax-layer ${layer.className}`}>
            <div className="parallax-inner" />
          </div>
        ))}
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
