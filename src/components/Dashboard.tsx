import { useMemo, useState } from 'react'
import type { PageProps } from '../App'
import { deleteRow, insertRows } from '../db'
import { assignCycles, cycleInfo, daysBetween, fmtDate, todayStr } from '../logic'
import { RESET } from '../types'

export default function Dashboard({ data, run }: PageProps) {
  const today = todayStr()
  const [date, setDate] = useState(today)
  const targets = data.settings.cycle_targets
  const rows = useMemo(() => assignCycles(data.logs, targets), [data.logs, targets])
  const cur = rows.length ? rows[rows.length - 1].cycle : 1
  const info = cycleInfo(rows, targets, cur, today, true)
  const history = useMemo(
    () => Array.from({ length: cur }, (_, i) => cycleInfo(rows, targets, cur - i, today, cur - i === cur)),
    [rows, targets, cur, today],
  )

  const add = (item: string) =>
    run(() => insertRows('daily_logs', [{ date, item, note: null }]), `已記錄 ${fmtDate(date).slice(5)} ${item}`)
  const reset = () => {
    if (confirm(`確定從 ${fmtDate(date)} 開始新的一輪？`)) run(() => insertRows('daily_logs', [{ date, item: RESET, note: null }]), '已開始新的一輪')
  }

  const curRows = rows.filter((r) => r.cycle === cur).reverse()

  return (
    <div className="page">
      <section className="card hero">
        <div className="hero-top">
          <div>
            <div className="big">第 {info.cycle} 輪</div>
            <div className="muted">{info.start ? `${fmtDate(info.start)} 開始` : '還沒有紀錄'}</div>
          </div>
          <div className="right">
            <div className="big">{info.days ?? 0}<small> 天</small></div>
            <div className="muted">
              訓練 {info.trainingDays}・休息 {info.restDays ?? 0}
            </div>
          </div>
        </div>
        <div className="bar">
          <div style={{ width: `${Math.round(info.completion * 100)}%` }} />
        </div>
        <div className={`status ${info.complete ? 'ok' : ''}`}>
          {info.complete
            ? '✅ 本輪已完成！下一筆紀錄會自動進入新的一輪'
            : info.notStarted.length
              ? `還沒做過：${info.notStarted.join('、')}`
              : `每項都做過了，還差 ${info.items.reduce((a, i) => a + Math.max(0, i.target - i.done), 0)} 次`}
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <h2>記一筆</h2>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </div>
        <p className="muted small">點項目就會記到 {date === today ? '今天' : fmtDate(date)}</p>
        <div className="items">
          {info.items.map((i) => {
            const st = i.done >= i.target ? 'done' : i.done === 0 ? 'none' : 'part'
            return (
              <button key={i.item} className={`item ${st}`} onClick={() => add(i.item)}>
                <b>{i.item}</b>
                <span className="dots">
                  {'●'.repeat(Math.min(i.done, i.target))}
                  {'○'.repeat(Math.max(0, i.target - i.done))}
                  {i.done > i.target && <em> +{i.done - i.target}</em>}
                </span>
                <span className="muted small">{i.lastDate ? ago(daysBetween(i.lastDate, today)) : '從未'}</span>
              </button>
            )
          })}
        </div>
        <button className="ghost full" onClick={reset}>
          ↻ 開始新 Cycle
        </button>
      </section>

      <section className="card">
        <h2>本輪紀錄</h2>
        {curRows.length === 0 && <p className="muted">還沒有紀錄</p>}
        <ul className="list">
          {curRows.map((r) => (
            <li key={r.id}>
              <span className="muted">{fmtDate(r.date).slice(5)}</span>
              <span className={r.item === RESET ? 'accent' : ''}>{r.item}</span>
              <button className="x" aria-label="刪除" onClick={() => confirm(`刪除 ${fmtDate(r.date)} ${r.item}？`) && run(() => deleteRow('daily_logs', r.id), '已刪除')}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      <details className="card">
        <summary>
          <h2>Cycle 歷史</h2>
        </summary>
        <table className="tbl">
          <thead>
            <tr>
              <th>輪次</th>
              <th>開始</th>
              <th>天數</th>
              <th>訓練</th>
              <th>結果</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.cycle}>
                <td>{h.cycle}</td>
                <td>{h.start ? fmtDate(h.start).slice(2) : '—'}</td>
                <td>{h.days ?? '—'}</td>
                <td>{h.trainingDays}</td>
                <td className={h.complete ? 'good' : ''}>{h.complete ? '✓ 完成' : h.cycle === cur ? '進行中' : '提前換輪'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

function ago(d: number): string {
  return d <= 0 ? '今天' : d === 1 ? '昨天' : `${d} 天前`
}
