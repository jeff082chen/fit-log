import { useMemo, useState } from 'react'
import type { PageProps } from '../App'
import { deleteRow, insertRows, updateRow } from '../db'
import { analyzeWorkouts, fmtDate, latestWeight, setsSummary, todayStr, type WorkoutRow } from '../logic'
import { CATEGORIES, CATEGORY_TO_ITEM, SIDES, type Category, type SetEntry, type Side } from '../types'
import LineChart from './LineChart'

type Draft = { kg: string; reps: string }[]

interface EditorState {
  exercise: string
  side: Side
  editing: WorkoutRow | null
}

export default function Training(props: PageProps) {
  const { data, run } = props
  const today = todayStr()
  const [date, setDate] = useState(today)
  const [cat, setCat] = useState<Category>(() => (sessionStorage.getItem('fitlog.cat') as Category) || '腿')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const bw = latestWeight(data.body)
  const rows = useMemo(() => analyzeWorkouts(data.workouts, bw), [data.workouts, bw])

  const pickCat = (c: Category) => {
    setCat(c)
    sessionStorage.setItem('fitlog.cat', c)
  }

  const exercises = data.settings.exercises[cat] ?? []
  const extra = [...new Set(rows.filter((r) => r.category === cat && !exercises.includes(r.exercise)).map((r) => r.exercise))]
  const dayRows = rows.filter((r) => r.date === date)

  return (
    <div className="page">
      <section className="card">
        <div className="row between">
          <h2>訓練紀錄</h2>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </div>
        <div className="seg">
          {CATEGORIES.map((c) => (
            <button key={c} className={c === cat ? 'on' : ''} onClick={() => pickCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <ul className="exlist">
          {[...exercises, ...extra].map((ex) => {
            const hist = rows.filter((r) => r.exercise === ex)
            const last = hist[hist.length - 1]
            const doneToday = dayRows.some((r) => r.exercise === ex)
            return (
              <li key={ex}>
                <button onClick={() => setEditor({ exercise: ex, side: last?.side === '右' ? '左' : last?.side ?? '雙', editing: null })}>
                  <div className="row between">
                    <b>
                      {doneToday && <span className="good">✓ </span>}
                      {ex}
                    </b>
                    {last?.m.indicator != null && (
                      <span className="small">
                        {last.m.e1rm != null ? `1RM ${last.m.e1rm}` : `${last.m.totalReps} 下`}
                        <Delta d={last.delta} />
                      </span>
                    )}
                  </div>
                  <div className="muted small">
                    {last ? `${fmtDate(last.date).slice(5)}${last.side !== '雙' ? `（${last.side}）` : ''}：${setsSummary(last.sets)}` : '尚無紀錄'}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <h2>{date === today ? '今天' : fmtDate(date)}的紀錄</h2>
        {dayRows.length === 0 && <p className="muted">還沒有紀錄</p>}
        <ul className="list">
          {dayRows.map((r) => (
            <li key={r.id} onClick={() => setEditor({ exercise: r.exercise, side: r.side, editing: r })} className="tap">
              <span className="tag">{r.category}</span>
              <span>
                {r.exercise}
                {r.side !== '雙' && `（${r.side}）`}
                <div className="muted small">{setsSummary(r.sets)}</div>
              </span>
              <Delta d={r.delta} />
            </li>
          ))}
        </ul>
      </section>

      {editor && (
        <Editor
          key={`${editor.exercise}|${editor.side}|${editor.editing?.id ?? 'new'}`}
          {...props}
          state={editor}
          setState={setEditor}
          date={date}
          category={editor.editing?.category ?? cat}
          rows={rows}
          defaultBW={bw}
          onClose={() => setEditor(null)}
          runSave={run}
        />
      )}
    </div>
  )
}

function Delta({ d }: { d: number | null }) {
  if (d === null) return <span className="muted small"> 首次</span>
  if (d === 0) return <span className="muted small"> ＝</span>
  return <span className={`small ${d > 0 ? 'good' : 'bad'}`}> {d > 0 ? `▲${d}` : `▼${-d}`}</span>
}

interface EditorProps extends PageProps {
  state: EditorState
  setState: (s: EditorState | null) => void
  date: string
  category: Category
  rows: WorkoutRow[]
  defaultBW: number | null
  onClose: () => void
  runSave: PageProps['run']
}

function Editor({ data, state, setState, date, category, rows, defaultBW, onClose, runSave }: EditorProps) {
  const { exercise, side, editing } = state
  const isPull = category === '引體'
  const hist = rows.filter((r) => r.exercise === exercise)
  const prev = editing ?? [...hist].reverse().find((r) => r.side === side) ?? hist[hist.length - 1]
  const initSets: SetEntry[] = prev?.sets.length ? prev.sets : [{ kg: null, reps: null }, { kg: null, reps: null }, { kg: null, reps: null }]
  const [assist, setAssist] = useState(() => (isPull ? !initSets.some((s) => s.kg !== null && s.kg > 0) : false))
  const [sets, setSets] = useState<Draft>(() =>
    initSets.map((s) => ({ kg: s.kg === null ? '' : String(isPull ? Math.abs(s.kg) : s.kg), reps: editing && s.reps !== null ? String(s.reps) : '' })),
  )
  const [repsHint] = useState(() => initSets.map((s) => (s.reps === null ? '' : String(s.reps))))
  const [note, setNote] = useState(editing?.note ?? '')
  const [bodyW, setBodyW] = useState(editing?.body_weight != null ? String(editing.body_weight) : '')
  const item = CATEGORY_TO_ITEM[category]
  const alreadyLogged = data.logs.some((l) => l.date === date && l.item === item)
  const [logDaily, setLogDaily] = useState(!editing && !alreadyLogged)

  const parse = (v: string): number | null => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const buildSets = (): SetEntry[] => {
    const out = sets.map((s, i) => {
      let kg = parse(s.kg)
      if (kg !== null && isPull && assist) kg = -Math.abs(kg)
      // 次數留空時採用預填提示（直接照上次做完）
      const reps = parse(s.reps) ?? (editing ? null : parse(repsHint[i] ?? ''))
      return { kg, reps }
    })
    // 和前一組重量相同的 kg 存成 null（沿用前一組）
    let last: number | null = null
    for (const s of out) {
      if (s.kg !== null && s.kg === last) s.kg = null
      else if (s.kg !== null) last = s.kg
    }
    while (out.length && out[out.length - 1].reps === null) out.pop()
    return out
  }

  const save = async (thenSide?: Side) => {
    const payload = {
      date: editing?.date ?? date,
      category,
      exercise,
      side,
      sets: buildSets(),
      note: note.trim() || null,
      body_weight: isPull ? parse(bodyW) : null,
    }
    if (!payload.sets.length) return alert('至少要填一組次數')
    const ok = await runSave(async () => {
      if (editing) await updateRow('workouts', editing.id, payload)
      else await insertRows('workouts', [payload])
      if (logDaily && !alreadyLogged) await insertRows('daily_logs', [{ date, item, note: null }])
    }, editing ? '已更新' : `已儲存${logDaily && !alreadyLogged ? `，並記到每日紀錄（${item}）` : ''}`)
    if (!ok) return
    if (thenSide) setState({ exercise, side: thenSide, editing: null })
    else onClose()
  }

  const remove = () => {
    if (editing && confirm('刪除這筆紀錄？')) runSave(() => deleteRow('workouts', editing.id), '已刪除').then((ok) => ok && onClose())
  }

  const upd = (i: number, k: 'kg' | 'reps', v: string) => setSets((ss) => ss.map((s, j) => (j === i ? { ...s, [k]: v } : s)))
  const chartPts = hist.filter((r) => r.side === side && r.m.indicator !== null).map((r) => ({ x: r.date, y: r.m.indicator! }))
  const otherSide = side === '左' ? '右' : side === '右' ? '左' : null
  const otherDone = otherSide && rows.some((r) => r.exercise === exercise && r.side === otherSide && r.date === date)

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{exercise}</h2>
          <button className="x" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>
        <p className="muted small">
          {editing ? `編輯 ${fmtDate(editing.date)}` : fmtDate(date)}・{category}
        </p>

        <div className="seg small">
          {SIDES.map((s) => (
            <button key={s} className={s === side ? 'on' : ''} disabled={!!editing} onClick={() => setState({ ...state, side: s })}>
              {s}
            </button>
          ))}
        </div>

        {isPull && (
          <div className="row gap">
            <div className="seg small grow">
              <button className={assist ? 'on' : ''} onClick={() => setAssist(true)}>輔助</button>
              <button className={!assist ? 'on' : ''} onClick={() => setAssist(false)}>加重</button>
            </div>
            <input className="w80" inputMode="decimal" placeholder={defaultBW ? `體重 ${defaultBW}` : '體重'} value={bodyW} onChange={(e) => setBodyW(e.target.value)} />
          </div>
        )}

        <table className="sets">
          <thead>
            <tr>
              <th>組</th>
              <th>{isPull ? (assist ? '輔助 kg' : '加重 kg') : 'kg'}</th>
              <th>次數</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sets.map((s, i) => (
              <tr key={i}>
                <td className="muted">{i + 1}</td>
                <td>
                  <input inputMode="decimal" value={s.kg} placeholder={i > 0 ? '同上' : category === '核心' || exercise === '伏地挺身' ? '自重' : ''} onChange={(e) => upd(i, 'kg', e.target.value)} />
                </td>
                <td>
                  <input inputMode="numeric" value={s.reps} placeholder={repsHint[i] ?? ''} onChange={(e) => upd(i, 'reps', e.target.value)} />
                </td>
                <td>
                  <button className="x" onClick={() => setSets((ss) => ss.filter((_, j) => j !== i))} aria-label="刪除這組">
                    −
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="ghost full" onClick={() => setSets((ss) => [...ss, { kg: '', reps: '' }])}>
          ＋ 加一組
        </button>
        {!editing && <p className="muted small">灰字是上次的次數，留空就照上次儲存；kg 留空＝同上一組。</p>}

        <input placeholder="備註（選填）" value={note} onChange={(e) => setNote(e.target.value)} />
        {!editing && !alreadyLogged && (
          <label className="check">
            <input type="checkbox" checked={logDaily} onChange={(e) => setLogDaily(e.target.checked)} />
            同時記到每日紀錄（{item}）
          </label>
        )}

        <div className="row gap">
          {editing && (
            <button className="danger" onClick={remove}>
              刪除
            </button>
          )}
          {!editing && otherSide && !otherDone && (
            <button className="ghost grow" onClick={() => save(otherSide)}>
              儲存，接著記{otherSide}側
            </button>
          )}
          <button className="primary grow" onClick={() => save()}>
            儲存
          </button>
        </div>

        {chartPts.length > 1 && (
          <>
            <h3>進步指標（{hist.some((r) => r.side === side && r.m.e1rm !== null) ? '估算1RM' : '總次數'}）</h3>
            <LineChart series={[{ name: exercise, color: 'var(--accent)', points: chartPts }]} height={140} />
          </>
        )}
        {hist.length > 0 && (
          <>
            <h3>歷史</h3>
            <ul className="list small">
              {[...hist].reverse().slice(0, 20).map((r) => (
                <li key={r.id}>
                  <span className="muted">{fmtDate(r.date).slice(2)}</span>
                  <span>
                    {r.side !== '雙' && `${r.side}｜`}
                    {setsSummary(r.sets)}
                  </span>
                  <span>
                    {r.m.e1rm ?? r.m.totalReps}
                    <Delta d={r.delta} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
