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

/** bodyWeight 只用於引體（有效負重＝體重＋kg） */
export function workoutMetrics(w: Pick<Workout, 'sets' | 'category'>, bodyWeight: number | null): WorkoutMetrics {
  const eff = effectiveSets(w.sets)
  if (eff.length === 0) return { setCount: 0, totalReps: 0, maxKg: null, volume: 0, e1rm: null, indicator: null }
  const bw = w.category === '引體' ? bodyWeight ?? 0 : 0
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
export function analyzeWorkouts(ws: Workout[], defaultBW: number | null): WorkoutRow[] {
  const sorted = [...ws].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
  const lastInd = new Map<string, number>()
  return sorted.map((w) => {
    const m = workoutMetrics(w, w.body_weight ?? defaultBW)
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
