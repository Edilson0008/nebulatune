import { memo } from 'react'

export const Cover = memo(function Cover({ colors, image, size = 40, radius = 8 }) {
  const [c1, c2, c3] =
    Array.isArray(colors) && colors.length ? colors : ['#6b5bd6', '#2a2450', '#b9a7ff']
  if (image) {
    return (
      <span
        className="cover cover-img"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
        }}
      >
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', display: 'block' }}
        />
      </span>
    )
  }
  return (
    <span
      className="cover"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `radial-gradient(circle at 30% 25%, ${c3}33 0%, transparent 42%), radial-gradient(circle at 70% 75%, ${c1} 0%, ${c2} 120%)`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08), 0 4px 12px ${c2}55`,
      }}
    >
      <span className="cover-star" style={{ left: '30%', top: '25%', background: c3 }} />
      <span className="cover-star" style={{ left: '72%', top: '62%', background: c3 }} />
    </span>
  )
})
