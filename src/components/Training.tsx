import { useMemo, useState } from 'react'
import type { PageProps } from '../App'
import { deleteRow, insertRows, updateRow } from '../db'
import {
  analyzeWorkouts, bestSets, bodyWeightLookup, cascadeKg, fmtDate, IMBALANCE_ALERT, imbalance, isBodyweight, pairSummary, sessionsOf,
  type BestSet, type TrainingSession, type WorkoutRow,
} from '../logic'
import { CATEGORIES, CATEGORY_TO_ITEM, type Category, type SetEntry, type Side } from '../types'
import LineChart from './LineChart'
import { useRecordDate } from '../hooks'

/** 編輯中的目標：單邊動作以「日期」為單位（左右一起），雙邊動作以「一筆紀錄」為單位 */
interface EditorState {
  exercise: string
  category: Category
  editDate: string | null
  editRow: WorkoutRow | null
}

export default function Training(props: PageProps) {
  const { data } = props
  const [date, setDate, today] = useRecordDate()
  const [cat, setCat] = useState<Category>(() => (sessionStorage.getItem('fitlog.cat') as Category) || '腿')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const bwAt = useMemo(() => bodyWeightLookup(data.body), [data.body])
  const bwList = data.settings.bodyweight
  const rows = useMemo(() => analyzeWorkouts(data.workouts, bwAt, bwList), [data.workouts, bwAt, bwList])
  const uni = useMemo(() => new Set(data.settings.unilateral), [data.settings.unilateral])

  const pickCat = (c: Category) => {
    setCat(c)
    sessionStorage.setItem('fitlog.cat', c)
  }
  const open = (exercise: string, category: Category, row?: WorkoutRow) => {
    if (uni.has(exercise)) {
      // 單邊動作同一天只有一組左右紀錄：當天已記過就直接打開編輯
      const done = rows.some((r) => r.exercise === exercise && r.date === date && r.side !== '雙')
      setEditor({ exercise, category, editDate: row ? row.date : done ? date : null, editRow: null })
    } else setEditor({ exercise, category, editDate: null, editRow: row ?? null })
  }

  const exercises = data.settings.exercises[cat] ?? []
  const extra = [...new Set(rows.filter((r) => r.category === cat && !exercises.includes(r.exercise)).map((r) => r.exercise))]
  const dayRows = rows.filter((r) => r.date === date)
  const daySessions: { exercise: string; category: Category; s: TrainingSession }[] = []
  for (const ex of [...new Set(dayRows.map((r) => r.exercise))]) {
    const own = dayRows.filter((r) => r.exercise === ex)
    if (uni.has(ex)) daySessions.push({ exercise: ex, category: own[0].category, s: sessionsOf(own)[0] })
    else for (const r of own) daySessions.push({ exercise: ex, category: r.category, s: { date: r.date, B: r } })
  }

  return (
    <div className="page">
      <section className="card">
        <div className="row between">
          <h2>訓練紀錄</h2>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        {date !== today && (
          <div className="row between not-today">
            <span>⚠ 正在記錄 {fmtDate(date)}（不是今天）</span>
            <button className="ghost small-btn" onClick={() => setDate(today)}>回到今天</button>
          </div>
        )}
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
            const doneToday = dayRows.some((r) => r.exercise === ex)
            return (
              <li key={ex}>
                <button onClick={() => open(ex, cat)}>
                  <div className="row between">
                    <b>
                      {doneToday && <span className="good">✓ </span>}
                      {ex}
                      {uni.has(ex) && <span className="tag uni">單邊</span>}
                    </b>
                    <LatestIndicator hist={hist} unilateral={uni.has(ex)} />
                  </div>
                  <LastLine hist={hist} unilateral={uni.has(ex)} />
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <h2>{date === today ? '今天' : fmtDate(date)}的紀錄</h2>
        {daySessions.length === 0 && <p className="muted">還沒有紀錄</p>}
        <ul className="list">
          {daySessions.map(({ exercise, category, s }) => {
            const row = s.B ?? s.L ?? s.R!
            return (
              <li key={`${exercise}-${row.id}`} onClick={() => open(exercise, category, row)} className="tap">
                <span className="tag">{category}</span>
                <span>
                  {exercise}
                  <div className="muted small">{pairSummary(s)}</div>
                </span>
                {s.B ? <Delta d={s.B.delta} /> : <Balance s={s} />}
              </li>
            )
          })}
        </ul>
      </section>

      {editor &&
        (uni.has(editor.exercise) ? (
          <UnilateralEditor
            key={`${editor.exercise}|${editor.editDate}`}
            {...props}
            st={editor}
            date={date}
            rows={rows}
            bwAt={bwAt}
            onClose={() => setEditor(null)}
          />
        ) : (
          <BilateralEditor
            key={`${editor.exercise}|${editor.editRow?.id ?? 'new'}`}
            {...props}
            st={editor}
            date={date}
            rows={rows}
            bwAt={bwAt}
            onClose={() => setEditor(null)}
          />
        ))}
    </div>
  )
}

// ---------- 清單顯示 ----------
function lastOfSide(hist: WorkoutRow[], side: Side): WorkoutRow | undefined {
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i].side === side) return hist[i]
  return undefined
}

function Ind({ r, label }: { r?: WorkoutRow; label?: string }) {
  if (!r || r.m.indicator === null) return null
  return (
    <span>
      {label && <span className="muted">{label} </span>}
      {r.m.e1rm ?? `${r.m.totalReps}下`}
      <Delta d={r.delta} />
    </span>
  )
}

function LatestIndicator({ hist, unilateral }: { hist: WorkoutRow[]; unilateral: boolean }) {
  if (!hist.length) return null
  if (!unilateral) {
    const last = hist[hist.length - 1]
    return (
      <span className="small">
        {last.m.e1rm != null && '1RM '}
        <Ind r={last} />
      </span>
    )
  }
  return (
    <span className="small">
      <Ind r={lastOfSide(hist, '左')} label="左" />
      <span className="muted">｜</span>
      <Ind r={lastOfSide(hist, '右')} label="右" />
    </span>
  )
}

function LastLine({ hist, unilateral }: { hist: WorkoutRow[]; unilateral: boolean }) {
  if (!hist.length) return <div className="muted small">尚無紀錄</div>
  const ss = unilateral ? sessionsOf(hist) : sessionsOf(hist.slice(-1))
  const s = ss[ss.length - 1]
  return (
    <div className="muted small">
      {fmtDate(s.date).slice(5)}：{pairSummary(s)}
      {unilateral && <Balance s={s} inline />}
    </div>
  )
}

function Delta({ d }: { d: number | null }) {
  if (d === null) return <span className="muted small"> 首次</span>
  if (d === 0) return <span className="muted small"> ＝</span>
  return <span className={`small ${d > 0 ? 'good' : 'bad'}`}> {d > 0 ? `▲${d}` : `▼${-d}`}</span>
}

function Balance({ s, inline }: { s: TrainingSession; inline?: boolean }) {
  if (!s.L || !s.R) return inline ? null : <span className="muted small">{s.L ? '只有左' : '只有右'}</span>
  const im = imbalance(s)
  if (!im) return <span className="good small">{inline ? '　' : ''}⚖ 平衡</span>
  const alert = im.pct >= IMBALANCE_ALERT
  return (
    <span className={`small ${alert ? 'bad' : 'muted'}`}>
      {inline ? '　' : ''}
      {alert ? '⚠ ' : ''}
      {im.weak}弱 {im.pct}%
    </span>
  )
}

// ---------- 共用 ----------
interface EditorProps extends PageProps {
  st: EditorState
  date: string
  rows: WorkoutRow[]
  bwAt: (date: string) => number | null
  onClose: () => void
}

const parse = (v: string): number | null => {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** 上次各組的有效重量（絕對值）與次數，用來顯示灰字 */
function hintsOf(sets: SetEntry[] | undefined): { kg: number; reps: number | null }[] {
  let last = 0
  return (sets ?? []).map((s) => {
    if (s.kg !== null) last = s.kg
    return { kg: Math.abs(last), reps: s.reps }
  })
}

/** 和前一組重量相同的 kg 存成 null（沿用前一組），並去掉尾端沒做的組 */
function compress(out: SetEntry[]): SetEntry[] {
  let last: number | null = null
  for (const s of out) {
    if (s.kg !== null && s.kg === last) s.kg = null
    else if (s.kg !== null) last = s.kg
  }
  while (out.length && (out[out.length - 1].reps === null || out[out.length - 1].reps === 0)) out.pop()
  return out
}

const fmtKg = (v: number | null, bodyweightOnly: boolean) => (v === null || (v === 0 && bodyweightOnly) ? (bodyweightOnly ? '自重' : '') : String(v))

function useDailyLog(data: PageProps['data'], category: Category, date: string, editing: boolean) {
  const item = data.settings.category_items[category] ?? CATEGORY_TO_ITEM[category]
  const alreadyLogged = data.logs.some((l) => l.date === date && l.item === item)
  const [logDaily, setLogDaily] = useState(!editing && !alreadyLogged)
  const node =
    item && !editing && !alreadyLogged ? (
      <label className="check">
        <input type="checkbox" checked={logDaily} onChange={(e) => setLogDaily(e.target.checked)} />
        同時記到每日紀錄（{item}）
      </label>
    ) : null
  return { item, shouldLog: !!item && logDaily && !alreadyLogged && !editing, node }
}

function SheetHead({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  return (
    <>
      <div className="row between">
        <h2>{title}</h2>
        <button className="x" onClick={onClose} aria-label="關閉">
          ×
        </button>
      </div>
      <p className="muted small">{sub}</p>
    </>
  )
}

// ---------- 雙邊動作 ----------
/** 一組的輸入；hk／hr 是這一組上次的 kg／次數（灰字），跟著這一列走，刪掉別組也不會錯位 */
type Row = { kg: string; reps: string; hk: number | null; hr: number | null }

function BilateralEditor({ data, st, date, rows, bwAt, onClose, run }: EditorProps) {
  const { exercise, category, editRow: editing } = st
  const isBW = isBodyweight(category, exercise, data.settings.bodyweight)
  const defaultBW = bwAt(editing?.date ?? date)
  const hist = rows.filter((r) => r.exercise === exercise)
  const prev = editing ?? hist[hist.length - 1]
  const initSets: SetEntry[] = prev?.sets.length ? prev.sets : [{ kg: null, reps: null }, { kg: null, reps: null }, { kg: null, reps: null }]
  const [assist, setAssist] = useState(() => (isBW ? !initSets.some((s) => s.kg !== null && s.kg > 0) : false))
  const [sets, setSets] = useState<Row[]>(() => {
    const h = editing ? [] : hintsOf(prev?.sets)
    return initSets.map((s, i) =>
      editing
        ? { kg: s.kg === null ? '' : String(isBW ? Math.abs(s.kg) : s.kg), reps: s.reps === null ? '' : String(s.reps), hk: null, hr: null }
        : { kg: '', reps: '', hk: h[i]?.kg ?? null, hr: h[i]?.reps ?? null },
    )
  })
  const bodyweightOnly = category === '核心' || (!editing && !!prev && hintsOf(prev.sets).every((h) => h.kg === 0))
  const [note, setNote] = useState(editing?.note ?? '')
  const [bodyW, setBodyW] = useState(editing?.body_weight != null ? String(editing.body_weight) : '')
  const daily = useDailyLog(data, category, date, !!editing)
  const effKg = cascadeKg(sets.map((s) => parse(s.kg)), sets.map((s) => s.hk))

  const save = async () => {
    const out = compress(
      sets.map((s, i) => {
        let kg = effKg[i]
        if (kg !== null && isBW) kg = assist ? -Math.abs(kg) : Math.abs(kg)
        return { kg, reps: parse(s.reps) ?? s.hr }
      }),
    )
    if (!out.length) return alert('至少要填一組次數')
    const payload = {
      date: editing?.date ?? date, category, exercise, side: editing?.side ?? ('雙' as Side),
      sets: out, note: note.trim() || null, body_weight: isBW ? parse(bodyW) : null,
    }
    const ok = await run(async () => {
      if (editing) await updateRow('workouts', editing.id, payload)
      else await insertRows('workouts', [payload])
      if (daily.shouldLog) await insertRows('daily_logs', [{ date, item: daily.item, note: null }])
    }, editing ? '已更新' : `已儲存${daily.shouldLog ? `，並記到每日紀錄（${daily.item}）` : ''}`)
    if (ok) onClose()
  }
  const remove = () => {
    if (editing && confirm('刪除這筆紀錄？')) run(() => deleteRow('workouts', editing.id), '已刪除').then((ok) => ok && onClose())
  }
  const upd = (i: number, k: 'kg' | 'reps', v: string) => setSets((ss) => ss.map((s, j) => (j === i ? { ...s, [k]: v } : s)))

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <SheetHead title={exercise} sub={`${editing ? `編輯 ${fmtDate(editing.date)}` : fmtDate(date)}・${category}`} onClose={onClose} />
        {isBW && (
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
              <th>{isBW ? (assist ? '輔助 kg' : '加重 kg') : '總 kg'}</th>
              <th>次數</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sets.map((s, i) => (
              <tr key={i}>
                <td className="muted">{i + 1}</td>
                <td><input inputMode="decimal" value={s.kg} placeholder={fmtKg(effKg[i], bodyweightOnly)} onChange={(e) => upd(i, 'kg', e.target.value)} /></td>
                <td><input inputMode="numeric" value={s.reps} placeholder={s.hr?.toString() ?? ''} onChange={(e) => upd(i, 'reps', e.target.value)} /></td>
                <td><button className="x" onClick={() => setSets((ss) => ss.filter((_, j) => j !== i))} aria-label="刪除這組">−</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="ghost full" onClick={() => setSets((ss) => [...ss, { kg: '', reps: '', hk: null, hr: null }])}>＋ 加一組</button>
        <p className="muted small">kg 記總重量（兩顆啞鈴請加總）。灰字＝留空時會存的值：次數是上次的次數；kg 是上次的重量，改了某一組的 kg，下面留空的組會跟著改。</p>
        <input placeholder="備註（選填）" value={note} onChange={(e) => setNote(e.target.value)} />
        {daily.node}
        <div className="row gap">
          {editing && <button className="danger" onClick={remove}>刪除</button>}
          <button className="primary grow" onClick={save}>儲存</button>
        </div>
        <HistoryBlock hist={hist} unilateral={false} bwAt={bwAt} bwList={data.settings.bodyweight} isBW={isBW} />
      </div>
    </div>
  )
}

// ---------- 單邊動作 ----------
type URow = { kg: string; kgR: string; l: string; r: string; hkL: number | null; hkR: number | null; hrL: number | null; hrR: number | null }

function UnilateralEditor({ data, st, date, rows, bwAt, onClose, run }: EditorProps) {
  const { exercise, category, editDate } = st
  const editing = editDate !== null
  const hist = rows.filter((r) => r.exercise === exercise)
  const target = editing ? sessionsOf(hist).find((s) => s.date === editDate) ?? { date: editDate } : null
  const prevL = editing ? target!.L : lastOfSide(hist, '左')
  const prevR = editing ? target!.R : lastOfSide(hist, '右')
  const n = Math.max(prevL?.sets.length ?? 0, prevR?.sets.length ?? 0) || 3
  const [split, setSplit] = useState(() => {
    const a = hintsOf(prevL?.sets)
    const b = hintsOf(prevR?.sets)
    return a.some((h, i) => b[i] && b[i].kg !== h.kg)
  })
  const [sets, setSets] = useState<URow[]>(() => {
    const hL = editing ? [] : hintsOf(prevL?.sets)
    const hR = editing ? [] : hintsOf(prevR?.sets)
    return Array.from({ length: n }, (_, i) => {
      const l = editing ? prevL?.sets[i] : undefined
      const r = editing ? prevR?.sets[i] : undefined
      return {
        kg: l?.kg != null ? String(l.kg) : '',
        kgR: r?.kg != null ? String(r.kg) : '',
        l: l?.reps != null ? String(l.reps) : '',
        r: r?.reps != null ? String(r.reps) : '',
        hkL: hL[i]?.kg ?? null,
        hkR: hR[i]?.kg ?? null,
        hrL: hL[i]?.reps ?? null,
        hrR: hR[i]?.reps ?? null,
      }
    })
  })
  const [note, setNote] = useState(editing ? prevL?.note ?? prevR?.note ?? '' : '')
  const daily = useDailyLog(data, category, date, editing)
  const sessions = sessionsOf(hist)
  const lastS = editing ? null : sessions[sessions.length - 1]
  const lastIm = lastS ? imbalance(lastS) : null
  const effL = cascadeKg(sets.map((s) => parse(s.kg)), sets.map((s) => s.hkL))
  const effR = cascadeKg(sets.map((s) => parse(split ? s.kgR : s.kg)), sets.map((s) => s.hkR))

  const build = (side: '左' | '右'): SetEntry[] => {
    const eff = side === '左' ? effL : effR
    return compress(
      sets.map((s, i) => {
        const reps = parse(side === '左' ? s.l : s.r) ?? (side === '左' ? s.hrL : s.hrR)
        return { kg: eff[i], reps: reps === 0 ? null : reps }
      }),
    )
  }

  const save = async () => {
    const L = build('左')
    const R = build('右')
    if (!L.length && !R.length) return alert('至少要填一組次數')
    const d = editDate ?? date
    const base = { date: d, category, exercise, body_weight: null, note: note.trim() || null }
    const ok = await run(async () => {
      for (const [side, out, old] of [['左', L, prevL], ['右', R, prevR]] as const) {
        if (editing && old) {
          if (out.length) await updateRow('workouts', old.id, { ...base, side, sets: out })
          else await deleteRow('workouts', old.id)
        } else if (out.length) {
          await insertRows('workouts', [{ ...base, side, sets: out }])
        }
      }
      if (daily.shouldLog) await insertRows('daily_logs', [{ date, item: daily.item, note: null }])
    }, editing ? '已更新' : `已儲存左右兩側${daily.shouldLog ? `，並記到每日紀錄（${daily.item}）` : ''}`)
    if (ok) onClose()
  }
  const remove = () => {
    if (!editing || !confirm(`刪除 ${fmtDate(editDate!)} 左右兩側的紀錄？`)) return
    run(async () => {
      if (prevL) await deleteRow('workouts', prevL.id)
      if (prevR) await deleteRow('workouts', prevR.id)
    }, '已刪除').then((ok) => ok && onClose())
  }
  const upd = (i: number, k: 'kg' | 'kgR' | 'l' | 'r', v: string) => setSets((ss) => ss.map((s, j) => (j === i ? { ...s, [k]: v } : s)))
  const kgPh = (eff: (number | null)[], i: number) => (eff[i] === null ? '' : String(eff[i]))

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <SheetHead title={exercise} sub={`${editing ? `編輯 ${fmtDate(editDate!)}` : fmtDate(date)}・${category}・單邊`} onClose={onClose} />
        {lastS && lastS.L && lastS.R && (
          <p className={`hint ${lastIm && lastIm.pct >= IMBALANCE_ALERT ? 'warn' : 'ok'}`}>
            {lastIm && lastIm.pct >= IMBALANCE_ALERT
              ? `上次${lastIm.weak}側較弱（少 ${lastIm.pct}%）。先讓${lastIm.weak}側追上，兩側都達到目標次數再加重。`
              : '上次兩側平衡。兩側每組都達到目標次數時，就可以加重。'}
          </p>
        )}
        <table className="sets uni">
          <thead>
            <tr>
              <th>組</th>
              <th>{split ? '左 總kg' : '總 kg'}</th>
              {split && <th>右 總kg</th>}
              <th>左次數</th>
              <th>右次數</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sets.map((s, i) => (
              <tr key={i}>
                <td className="muted">{i + 1}</td>
                <td><input inputMode="decimal" value={s.kg} placeholder={kgPh(effL, i)} onChange={(e) => upd(i, 'kg', e.target.value)} /></td>
                {split && <td><input inputMode="decimal" value={s.kgR} placeholder={kgPh(effR, i)} onChange={(e) => upd(i, 'kgR', e.target.value)} /></td>}
                <td><input inputMode="numeric" value={s.l} placeholder={s.hrL?.toString() ?? ''} onChange={(e) => upd(i, 'l', e.target.value)} /></td>
                <td><input inputMode="numeric" value={s.r} placeholder={s.hrR?.toString() ?? ''} onChange={(e) => upd(i, 'r', e.target.value)} /></td>
                <td><button className="x" onClick={() => setSets((ss) => ss.filter((_, j) => j !== i))} aria-label="刪除這組">−</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row gap">
          <button className="ghost grow" onClick={() => setSets((ss) => [...ss, { kg: '', kgR: '', l: '', r: '', hkL: null, hkR: null, hrL: null, hrR: null }])}>＋ 加一組</button>
          <button className="ghost" onClick={() => setSplit(!split)}>{split ? '左右同重量' : '左右不同重量'}</button>
        </div>
        <p className="muted small">kg 記這一側使用的總重量（兩手各拿一顆就兩顆加總）。灰字＝留空時會存的值（上次的重量和次數；改了某組 kg，下面留空的組會跟著改）。某側這組沒做就填 0。</p>
        <input placeholder="備註（選填）" value={note} onChange={(e) => setNote(e.target.value)} />
        {daily.node}
        <div className="row gap">
          {editing && <button className="danger" onClick={remove}>刪除</button>}
          <button className="primary grow" onClick={save}>儲存左右</button>
        </div>
        <HistoryBlock hist={hist} unilateral bwAt={bwAt} bwList={data.settings.bodyweight} isBW={isBodyweight(category, exercise, data.settings.bodyweight)} />
      </div>
    </div>
  )
}

// ---------- 個人紀錄、趨勢、歷史 ----------
function HistoryBlock({ hist, unilateral, bwAt, bwList, isBW }: {
  hist: WorkoutRow[]
  unilateral: boolean
  bwAt: (date: string) => number | null
  bwList: string[]
  isBW: boolean
}) {
  if (!hist.length) return null
  const sides: Side[] = unilateral ? ['左', '右'] : ['雙']
  const pick = (s: Side) => (unilateral ? hist.filter((r) => r.side === s) : hist)
  const recs = sides.map((s) => bestSets(pick(s), bwAt, bwList))
  const series = sides
    .map((s, i) => ({
      name: unilateral ? `${s}側` : hist[0].exercise,
      color: i === 0 ? 'var(--accent)' : '#d6455d',
      points: pick(s).filter((r) => r.m.indicator !== null).map((r) => ({ x: r.date, y: r.m.indicator! })),
    }))
    .filter((s) => s.points.length)
  const useE1rm = hist.some((r) => r.m.e1rm !== null)
  const sessions = unilateral ? sessionsOf(hist) : hist.map((r) => ({ date: r.date, B: r }) as TrainingSession)
  const labels = { heaviest: '最重', mostReps: '最多次', maxVolume: '最大容量' } as const

  return (
    <>
      {recs.some(Boolean) && (
        <>
          <h3>個人紀錄</h3>
          <table className="tbl recs">
            {unilateral && (
              <thead>
                <tr><th /><th>左</th><th>右</th></tr>
              </thead>
            )}
            <tbody>
              {(['heaviest', 'mostReps', 'maxVolume'] as const).map((k) =>
                recs.some((r) => r?.[k]) ? (
                  <tr key={k}>
                    <td className="muted">{labels[k]}</td>
                    {recs.map((r, i) => (
                      <td key={i}>{r?.[k] ? <RecCell r={r[k]!} isBW={isBW} volume={k === 'maxVolume'} /> : '—'}</td>
                    ))}
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
          {recs.some((r) => r && [r.heaviest, r.mostReps, r.maxVolume].some((b) => b?.e1rm != null)) && (
            <p className="muted small">1RM ≈ 用該組的重量和次數估算（Epley：重量 ×（1＋次數÷30）），自重動作含體重。</p>
          )}
        </>
      )}
      {series.some((s) => s.points.length > 1) && (
        <>
          <h3>進步指標（{useE1rm ? '估算1RM' : '總次數'}）</h3>
          <LineChart series={series} height={150} />
        </>
      )}
      <h3>歷史</h3>
      <ul className="list small">
        {[...sessions].reverse().slice(0, 20).map((s) => (
          <li key={s.date + (s.B?.id ?? '')}>
            <span className="muted">{fmtDate(s.date).slice(2)}</span>
            <span>{pairSummary(s)}</span>
            {s.B ? (
              <span>
                {s.B.m.e1rm ?? s.B.m.totalReps}
                <Delta d={s.B.delta} />
              </span>
            ) : (
              <Balance s={s} />
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function RecCell({ r, isBW, volume }: { r: BestSet; isBW: boolean; volume: boolean }) {
  const kg = r.kg < 0 ? `輔助${-r.kg}` : r.kg > 0 ? `${isBW ? '+' : ''}${r.kg}kg` : '自重'
  return (
    <div>
      <div>
        {kg} × {r.reps}
        {volume && <span className="muted">（{Math.round(r.volume)}）</span>}
      </div>
      {r.e1rm !== null && <div className="rec-1rm">1RM ≈ {r.e1rm}</div>}
      <div className="muted">{fmtDate(r.date).slice(2)}</div>
    </div>
  )
}
