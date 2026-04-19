import React, { useMemo } from 'react'

// ── Layer configuration ───────────────────────────────────────────────────
const BASE_URL = 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/24650'

const layersData = [
  { className: 'layer-6', speed: '120s', size: '222px', zIndex: 1, image: '6' },
  { className: 'layer-5', speed: '95s',  size: '311px', zIndex: 1, image: '5' },
  { className: 'layer-4', speed: '75s',  size: '468px', zIndex: 1, image: '4' },
  { className: 'bike-1',  speed: '10s',  size: '75px',  zIndex: 2, image: 'bike', animation: 'parallax_bike', bottom: '100px', noRepeat: true },
  { className: 'bike-2',  speed: '15s',  size: '75px',  zIndex: 2, image: 'bike', animation: 'parallax_bike', bottom: '100px', noRepeat: true },
  { className: 'layer-3', speed: '55s',  size: '158px', zIndex: 3, image: '3' },
  { className: 'layer-2', speed: '30s',  size: '145px', zIndex: 4, image: '2' },
  { className: 'layer-1', speed: '20s',  size: '136px', zIndex: 5, image: '1' },
]

interface MountainVistaParallaxProps {
  title?: string
  subtitle?: string
}

const MountainVistaParallax = ({ title = '', subtitle = '' }: MountainVistaParallaxProps) => {
  const dynamicStyles = useMemo(() => {
    return layersData
      .map((layer) => {
        const url = `${BASE_URL}/${layer.image}.png`
        const isBike = layer.noRepeat
        return `
          .${layer.className} {
            z-index: ${layer.zIndex};
            ${layer.bottom ? `bottom: ${layer.bottom};` : ''}
          }
          .${layer.className} .parallax-inner {
            background-image: url(${url});
            animation-duration: ${layer.speed};
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
  }, [])

  return (
    <section
      className="hero-container"
      aria-label="Animated parallax mountain landscape at night"
      aria-hidden="true"
    >
      <style>{dynamicStyles}</style>

      <div className="parallax-wrapper">
        {layersData.map((layer) => (
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
