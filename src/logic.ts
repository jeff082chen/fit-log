import { RESET, type BodyMetric, type CycleTarget, type DailyLog, type SetEntry, type Workout } from './types'

// ---------- 日期 ----------
export function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 兩個 yyyy-mm-dd 相差的天數（b - a） */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((t(b) - t(a)) / 86400000)
}

export function ageAt(birth: string, date: string): number {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [y, m, d] = date.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

export function fmtDate(s: string): string {
  return s.replaceAll('-', '/')
}

// ---------- 訓練計算 ----------
export interface EffSet {
  kg: number
  reps: number
}

/** 套用「kg 留空＝沿用前一組；第一組空白＝0」，只回傳有做的組 */
export function effectiveSets(sets: SetEntry[]): EffSet[] {
  let last = 0
  const out: EffSet[] = []
  for (const s of sets) {
    if (s.kg !== null && s.kg !== undefined && !Number.isNaN(s.kg)) last = s.kg
    if (s.reps !== null && s.reps !== undefined && s.reps > 0) out.push({ kg: last, reps: s.reps })
  }
  return out
}

export interface WorkoutMetrics {
  setCount: number
  totalReps: number
  maxKg: number | null
  volume: number
  e1rm: number | null
  indicator: number | null
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ---------- 體重 ----------
/** 體重來源：固定值，或依日期查詢的函式 */
export type BWSource = number | null | ((date: string) => number | null)
const resolveBW = (src: BWSource, date: string) => (typeof src === 'function' ? src(date) : src)

/** 回傳「某天的體重」：當天或之前最近一次量測；更早的日期用最早一筆；沒有資料回傳 null */
export function bodyWeightLookup(ms: BodyMetric[]): (date: string) => number | null {
  const list = ms
    .filter((m) => m.weight !== null)
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
  return (date) => {
    if (!list.length) return null
    let found: BodyMetric | null = null
    for (const m of list) {
      if (m.date <= date) found = m
      else break
    }
    return (found ?? list[0]).weight
  }
}

/** 自重動作：引體類別一律是；其他類別看設定裡的自重動作清單 */
export function isBodyweight(category: string, exercise: string, bwExercises: readonly string[] = []): boolean {
  return category === '引體' || bwExercises.includes(exercise)
}

/** 自重動作的有效負重＝體重＋kg（輔助為負數） */
export function workoutMetrics(w: Pick<Workout, 'sets' | 'category'>, bodyWeight: number | null, bodyweightExercise = w.category === '引體'): WorkoutMetrics {
  const eff = effectiveSets(w.sets)
  if (eff.length === 0) return { setCount: 0, totalReps: 0, maxKg: null, volume: 0, e1rm: null, indicator: null }
  const bw = bodyweightExercise ? bodyWeight ?? 0 : 0
  const totalReps = eff.reduce((a, s) => a + s.reps, 0)
  const maxKg = Math.max(...eff.map((s) => s.kg))
  const volume = Math.round(eff.reduce((a, s) => a + (s.kg + bw) * s.reps, 0))
  let e1rm: number | null = null
  if (w.category !== '核心') {
    const best = Math.max(...eff.map((s) => (s.kg + bw) * (1 + s.reps / 30)))
    e1rm = best > 0 ? round1(best) : null
  }
  return { setCount: eff.length, totalReps, maxKg, volume, e1rm, indicator: e1rm ?? totalReps }
}

export interface WorkoutRow extends Workout {
  m: WorkoutMetrics
  delta: number | null // null＝首次
}

/** 依日期、建立順序排序，計算指標與「與上次比」 */
export function analyzeWorkouts(ws: Workout[], bwSource: BWSource, bwExercises: readonly string[] = []): WorkoutRow[] {
  const sorted = [...ws].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
  const lastInd = new Map<string, number>()
  return sorted.map((w) => {
    const m = workoutMetrics(w, w.body_weight ?? resolveBW(bwSource, w.date), isBodyweight(w.category, w.exercise, bwExercises))
    const key = `${w.exercise}|${w.side}`
    let delta: number | null = null
    if (m.indicator !== null) {
      const prev = lastInd.get(key)
      delta = prev === undefined ? null : round1(m.indicator - prev)
      lastInd.set(key, m.indicator)
    }
    return { ...w, m, delta }
  })
}

export function setsSummary(sets: SetEntry[]): string {
  const eff = effectiveSets(sets)
  if (!eff.length) return '—'
  const groups: { kg: number; reps: number[] }[] = []
  for (const s of eff) {
    const g = groups[groups.length - 1]
    if (g && g.kg === s.kg) g.reps.push(s.reps)
    else groups.push({ kg: s.kg, reps: [s.reps] })
  }
  const kg = (n: number) => (n < 0 ? `輔助${-n}kg × ` : n ? `${n}kg × ` : '')
  return groups.map((g) => `${kg(g.kg)}${g.reps.join('/')}`).join('，')
}

// ---------- Cycle ----------
export interface LogRow extends DailyLog {
  cycle: number
}

/** 依日期與建立順序分配輪次（與 Excel 版規則相同） */
export function assignCycles(logs: DailyLog[], targets: CycleTarget[]): LogRow[] {
  const sorted = [...logs].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
  const active = targets.filter((t) => t.item)
  let cur = 0
  let counts = new Map<string, number>()
  const complete = () => active.every((t) => (counts.get(t.item) ?? 0) >= t.target)
  return sorted.map((l) => {
    if (cur === 0) cur = 1
    else if (l.item === RESET || complete()) {
      cur += 1
      counts = new Map()
    }
    if (l.item !== RESET) counts.set(l.item, (counts.get(l.item) ?? 0) + 1)
    return { ...l, cycle: cur }
  })
}

export interface ItemStatus {
  item: string
  target: number
  done: number
  lastDate: string | null
}

export interface CycleInfo {
  cycle: number
  start: string | null
  lastDate: string | null
  days: number | null
  trainingDays: number
  restDays: number | null
  items: ItemStatus[]
  completion: number
  complete: boolean
  notStarted: string[]
}

export function cycleInfo(rows: LogRow[], targets: CycleTarget[], cycle: number, today: string, isCurrent: boolean): CycleInfo {
  const inC = rows.filter((r) => r.cycle === cycle)
  const start = inC.length ? inC[0].date : null
  const lastDate = inC.length ? inC[inC.length - 1].date : null
  const end = isCurrent ? today : lastDate
  const days = start && end ? daysBetween(start, end) + 1 : null
  const trainingDays = new Set(inC.filter((r) => r.item !== RESET).map((r) => r.date)).size
  const items = targets
    .filter((t) => t.item)
    .map((t) => {
      const all = rows.filter((r) => r.item === t.item)
      return {
        item: t.item,
        target: t.target,
        done: inC.filter((r) => r.item === t.item).length,
        lastDate: all.length ? all.reduce((a, r) => (r.date > a ? r.date : a), all[0].date) : null,
      }
    })
  const totalT = items.reduce((a, i) => a + i.target, 0)
  const doneT = items.reduce((a, i) => a + Math.min(i.done, i.target), 0)
  return {
    cycle,
    start,
    lastDate,
    days,
    trainingDays,
    restDays: days === null ? null : Math.max(0, days - trainingDays),
    items,
    completion: totalT ? doneT / totalT : 0,
    complete: items.every((i) => i.done >= i.target),
    notStarted: items.filter((i) => i.done === 0).map((i) => i.item),
  }
}

// ---------- 身體組成 ----------
export interface BodyRow extends BodyMetric {
  age: number
  ffm: number | null
  ffmi: number | null
  nffmi: number | null
}

export function analyzeBody(ms: BodyMetric[], heightCm: number, birth: string): BodyRow[] {
  const h = heightCm / 100
  return [...ms]
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
    .map((m) => {
      const ffm = m.weight !== null && m.body_fat_pct !== null ? m.weight * (1 - m.body_fat_pct / 100) : null
      const ffmi = ffm !== null && h > 0 ? ffm / (h * h) : null
      return { ...m, age: ageAt(birth, m.date), ffm, ffmi, nffmi: ffmi === null ? null : ffmi + 6.1 * (1.8 - h) }
    })
}

export function latestWeight(ms: BodyMetric[]): number | null {
  const rows = analyzeBody(ms, 170, '2000-01-01').filter((m) => m.weight !== null)
  return rows.length ? rows[rows.length - 1].weight : null
}

// ---------- 個人紀錄 ----------
export interface BestSet {
  date: string
  side: Workout['side']
  kg: number
  reps: number
  load: number // 引體＝體重＋kg，其他＝kg
  volume: number // load × reps
}

/** 歷史中重量最重、次數最多、容量（重量×次數）最大的一組 */
export function bestSets(
  rows: Pick<Workout, 'date' | 'side' | 'sets' | 'category' | 'exercise' | 'body_weight'>[],
  bwSource: BWSource,
  bwExercises: readonly string[] = [],
): { heaviest: BestSet; mostReps: BestSet; maxVolume: BestSet | null } | null {
  const all: BestSet[] = []
  for (const r of rows) {
    const bw = isBodyweight(r.category, r.exercise, bwExercises) ? r.body_weight ?? resolveBW(bwSource, r.date) ?? 0 : 0
    for (const s of effectiveSets(r.sets)) {
      const load = s.kg + bw
      all.push({ date: r.date, side: r.side, kg: s.kg, reps: s.reps, load, volume: load * s.reps })
    }
  }
  if (!all.length) return null
  const best = (score: (b: BestSet) => [number, number]) =>
    all.reduce((a, b) => {
      const [x1, x2] = score(a)
      const [y1, y2] = score(b)
      return y1 > x1 || (y1 === x1 && y2 > x2) ? b : a
    })
  const maxVolume = best((b) => [b.volume, b.load])
  return {
    heaviest: best((b) => [b.load, b.reps]),
    mostReps: best((b) => [b.reps, b.load]),
    maxVolume: maxVolume.volume > 0 ? maxVolume : null,
  }
}

// ---------- 單邊動作 ----------
export interface TrainingSession {
  date: string
  L?: WorkoutRow
  R?: WorkoutRow
  B?: WorkoutRow
}

/** 把同一動作的紀錄依日期合併（左右放在同一天） */
export function sessionsOf(rows: WorkoutRow[]): TrainingSession[] {
  const out: TrainingSession[] = []
  for (const r of rows) {
    let s = out[out.length - 1]
    if (!s || s.date !== r.date) out.push((s = { date: r.date }))
    s[r.side === '左' ? 'L' : r.side === '右' ? 'R' : 'B'] = r
  }
  return out
}

/** 一側的工作量：有重量用 重量×次數，自重用次數 */
export function workload(r: WorkoutRow): number {
  return r.m.volume > 0 ? r.m.volume : r.m.totalReps
}

/** 左右差：弱側比強側少多少（%），差距不到 1% 視為平衡 */
export function imbalance(s: TrainingSession): { weak: '左' | '右'; pct: number } | null {
  if (!s.L || !s.R) return null
  const l = workload(s.L)
  const r = workload(s.R)
  const hi = Math.max(l, r)
  if (hi <= 0) return null
  const pct = Math.round((Math.abs(l - r) / hi) * 100)
  return pct < 1 ? null : { weak: l < r ? '左' : '右', pct }
}

export const IMBALANCE_ALERT = 10

/** 左右合併成一行摘要 */
export function pairSummary(s: TrainingSession): string {
  if (s.B && !s.L && !s.R) return setsSummary(s.B.sets)
  const one = (r?: WorkoutRow) => (r ? effectiveSets(r.sets) : [])
  const l = one(s.L)
  const r = one(s.R)
  const kgs = new Set([...l, ...r].map((x) => x.kg))
  if (l.length && r.length && kgs.size === 1) {
    const kg = [...kgs][0]
    const k = kg < 0 ? `輔助${-kg}kg × ` : kg ? `${kg}kg × ` : ''
    return `${k}左 ${l.map((x) => x.reps).join('/')}・右 ${r.map((x) => x.reps).join('/')}`
  }
  return [s.L && `左 ${setsSummary(s.L.sets)}`, s.R && `右 ${setsSummary(s.R.sets)}`].filter(Boolean).join('・')
}
