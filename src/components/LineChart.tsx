import { daysBetween } from '../logic'

export interface Series {
  name: string
  color: string
  points: { x: string; y: number }[] // x = yyyy-mm-dd
  /** 獨立的 y 軸範圍（不同單位的線各自縮放） */
  own?: boolean
}

export default function LineChart({ series, height = 180 }: { series: Series[]; height?: number }) {
  const all = series.flatMap((s) => s.points)
  if (all.length < 2) return <p className="muted small">至少要兩筆資料才畫得出趨勢</p>
  const W = 340
  const H = height
  const pad = { l: 34, r: 10, t: 20, b: 22 }
  const xs = all.map((p) => p.x).sort()
  const x0 = xs[0]
  const span = Math.max(1, daysBetween(x0, xs[xs.length - 1]))
  const sx = (x: string) => pad.l + (daysBetween(x0, x) / span) * (W - pad.l - pad.r)
  const range = (pts: { y: number }[]) => {
    let lo = Math.min(...pts.map((p) => p.y))
    let hi = Math.max(...pts.map((p) => p.y))
    if (hi - lo < 1) { lo -= 0.5; hi += 0.5 }
    const m = (hi - lo) * 0.1
    return [lo - m, hi + m] as const
  }
  const shared = range(all)
  const fmt = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`
  const showYAxis = series.every((s) => !s.own)

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join('、')}>
        {[0, 0.5, 1].map((f) => {
          const y = pad.t + f * (H - pad.t - pad.b)
          return (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} className="grid" />
              {showYAxis && (
                <text x={pad.l - 4} y={y + 3} textAnchor="end" className="axis">
                  {(shared[1] - f * (shared[1] - shared[0])).toFixed(shared[1] - shared[0] < 10 ? 1 : 0)}
                </text>
              )}
            </g>
          )
        })}
        <text x={pad.l} y={H - 6} className="axis">{fmt(x0)}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="axis">{fmt(xs[xs.length - 1])}</text>
        {series.map((s) => {
          if (!s.points.length) return null
          const [lo, hi] = s.own ? range(s.points) : shared
          const sy = (y: number) => pad.t + (1 - (y - lo) / (hi - lo)) * (H - pad.t - pad.b)
          const pts = [...s.points].sort((a, b) => (a.x < b.x ? -1 : 1))
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('')
          const last = pts[pts.length - 1]
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={s.color} />
              ))}
              <text x={sx(last.x) - 4} y={sy(last.y) - 6} textAnchor="end" className="val" fill={s.color}>
                {last.y.toFixed(1)}
              </text>
            </g>
          )
        })}
      </svg>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
