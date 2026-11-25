import { useMemo, useState } from 'react'
import type { PageProps } from '../App'
import { deleteRow, insertRows } from '../db'
import { useRecordDate } from '../hooks'
import { analyzeBody, daysBetween, fmtDate } from '../logic'
import LineChart from './LineChart'

const RANGES = [
  { label: '30天', days: 30 },
  { label: '90天', days: 90 },
  { label: '1年', days: 365 },
  { label: '全部', days: Infinity },
]

export default function Body({ data, run }: PageProps) {
  const [date, setDate, today] = useRecordDate()
  const { height_cm, birth_date } = data.settings
  const rows = useMemo(() => analyzeBody(data.body, height_cm, birth_date), [data.body, height_cm, birth_date])
  const [form, setForm] = useState({ weight: '', pbf: '', smm: '' })
  const [range, setRange] = useState(1)
  const last = rows[rows.length - 1]
  const inRange = rows.filter((r) => daysBetween(r.date, today) <= RANGES[range].days)
  const first = inRange[0]

  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const weight = num(form.weight)
    if (weight === null) return alert('請填體重')
    const ok = await run(
      () => insertRows('body_metrics', [{ date, weight, body_fat_pct: num(form.pbf), smm: num(form.smm) }]),
      '已儲存',
    )
    if (ok) setForm({ weight: '', pbf: '', smm: '' })
  }

  const pts = (k: 'weight' | 'smm' | 'body_fat_pct' | 'ffmi') =>
    inRange.filter((r) => r[k] !== null).map((r) => ({ x: r.date, y: r[k] as number }))
  const diff = (k: 'weight' | 'smm' | 'body_fat_pct' | 'ffmi') =>
    first && last && first !== last && first[k] !== null && last[k] !== null ? (last[k] as number) - (first[k] as number) : null

  return (
    <div className="page">
      <form className="card" onSubmit={save}>
        <div className="row between">
          <h2>新增量測</h2>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        {date !== today && (
          <div className="row between not-today">
            <span>⚠ 記錄日期是 {fmtDate(date)}（不是今天）</span>
            <button type="button" className="ghost small-btn" onClick={() => setDate(today)}>回到今天</button>
          </div>
        )}
        <div className="grid3">
          <label>
            體重 kg
            <input inputMode="decimal" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder={last?.weight?.toString()} />
          </label>
          <label>
            體脂率 %
            <input inputMode="decimal" value={form.pbf} onChange={(e) => setForm({ ...form, pbf: e.target.value })} placeholder={last?.body_fat_pct?.toString()} />
          </label>
          <label>
            骨骼肌 kg
            <input inputMode="decimal" value={form.smm} onChange={(e) => setForm({ ...form, smm: e.target.value })} placeholder={last?.smm?.toString()} />
          </label>
        </div>
        <button className="primary full">儲存</button>
      </form>

      {last && (
        <section className="card">
          <div className="row between">
            <h2>目前</h2>
            <span className="muted small">
              {fmtDate(last.date)}・{last.age} 歲・{height_cm} cm
            </span>
          </div>
          <div className="stats">
            <Stat label="體重" v={last.weight} unit="kg" d={diff('weight')} neutral />
            <Stat label="體脂率" v={last.body_fat_pct} unit="%" d={diff('body_fat_pct')} goodDown />
            <Stat label="骨骼肌" v={last.smm} unit="kg" d={diff('smm')} />
            <Stat label="FFMI" v={last.ffmi} d={diff('ffmi')} sub={last.nffmi !== null ? `標準化 ${last.nffmi.toFixed(1)}` : undefined} />
          </div>
          {first && first !== last && <p className="muted small">變化：和 {fmtDate(first.date)} 相比（{RANGES[range].label}內第一筆）</p>}
        </section>
      )}

      {rows.length > 1 && (
        <section className="card">
          <div className="seg small">
            {RANGES.map((r, i) => (
              <button key={r.label} className={i === range ? 'on' : ''} onClick={() => setRange(i)}>
                {r.label}
              </button>
            ))}
          </div>
          <h3>體重 ／ 骨骼肌</h3>
          <LineChart
            series={[
              { name: '體重', color: '#2f6fd6', points: pts('weight'), own: true },
              { name: '骨骼肌', color: '#d6455d', points: pts('smm'), own: true },
            ]}
          />
          <h3>體脂率 ／ FFMI</h3>
          <LineChart
            series={[
              { name: '體脂率', color: '#e8892b', points: pts('body_fat_pct'), own: true },
              { name: 'FFMI', color: '#2a9d6f', points: pts('ffmi'), own: true },
            ]}
          />
        </section>
      )}

      <section className="card">
        <h2>紀錄</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>日期</th>
              <th>體重</th>
              <th>體脂</th>
              <th>骨骼肌</th>
              <th>FFMI</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.date).slice(2)}</td>
                <td>{r.weight?.toFixed(1) ?? '—'}</td>
                <td>{r.body_fat_pct?.toFixed(1) ?? '—'}</td>
                <td>{r.smm?.toFixed(1) ?? '—'}</td>
                <td>{r.ffmi?.toFixed(1) ?? '—'}</td>
                <td>
                  <button className="x" aria-label="刪除" onClick={() => confirm(`刪除 ${fmtDate(r.date)} 的紀錄？`) && run(() => deleteRow('body_metrics', r.id), '已刪除')}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Stat({ label, v, unit, d, goodDown, sub, neutral }: { label: string; v: number | null; unit?: string; d: number | null; goodDown?: boolean; sub?: string; neutral?: boolean }) {
  const cls = d === null || neutral || Math.abs(d) < 0.05 ? 'muted' : (d > 0) !== !!goodDown ? 'good' : 'bad'
  return (
    <div className="stat">
      <div className="muted small">{label}</div>
      <div className="big">
        {v === null ? '—' : v.toFixed(1)}
        {unit && <small>{unit}</small>}
      </div>
      {d !== null && <div className={`small ${cls}`}>{d > 0 ? '▲' : d < 0 ? '▼' : ''}{Math.abs(d).toFixed(1)}</div>}
      {sub && <div className="muted small">{sub}</div>}
    </div>
  )
}
