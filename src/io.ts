import * as XLSX from 'xlsx'
import { analyzeBody, analyzeWorkouts, assignCycles, bodyWeightLookup, todayStr } from './logic'
import {
  CATEGORIES, DEFAULT_SETTINGS, SIDES,
  type BodyMetric, type Category, type DailyLog, type SetEntry, type Settings, type Side, type Workout,
} from './types'

export interface Dataset {
  settings: Settings
  workouts: Omit<Workout, 'id'>[]
  daily_logs: Omit<DailyLog, 'id'>[]
  body_metrics: Omit<BodyMetric, 'id'>[]
}

const AI_GUIDE: [string, string][] = [
  ['通用', '各資料頁第 1 列是標題、第 2 列是表頭、資料從第 3 列開始（pandas：header=1）。用欄位名稱辨識欄位。表頭標「(計算)」的欄位是匯出時算好的值。'],
  ['訓練頁', '腿／推／拉／引體／核心。一列＝某天一個動作；單邊動作（清單在「設定」頁）左右各一列。欄位：日期、動作、側別（雙／左／右）、體重(kg)、組N kg、組N 次數、備註。'],
  ['kg 留空', '有次數但 kg 空白＝沿用前一組重量；第一組也空白＝自重（0）。沒填次數＝沒做。'],
  ['重量記法', '啞鈴記單手重量；名稱含「槓鈴」記總重量（含槓）；高腳杯深蹲、仰臥拉舉記單顆重量。'],
  ['自重動作', '引體類別的所有動作，以及「設定」頁列為「自重動作」的動作：kg 負數＝輔助公斤數（-20＝輔助 20 kg），0＝自重，正數＝加重。有效負重＝體重＋kg；體重(kg) 欄空白時，用當天或之前最近一次身體組成的體重（更早則用最早一筆）。'],
  ['核心', '每組做到力竭，看次數；俄羅斯轉體記左右合計次數。'],
  ['計算欄', '估算1RM＝max(有效重量×(1＋次數/30))；進步指標＝估算1RM，自重或核心則用總次數；與上次比＝和同動作、同側別的上一筆相比。'],
  ['每日紀錄', '一列＝某天完成的一個項目；沒有紀錄的日期＝休息。「開始新 Cycle」是手動換輪標記。各項目達到「設定」頁的 Cycle 目標後，下一筆自動進入新的一輪。Cycle 欄是輪次。'],
  ['身體組成', '輸入：日期、體重、體脂率、骨骼肌量。計算：年齡、去脂體重＝體重×(1－體脂率)、FFMI＝去脂體重÷身高²、標準化 FFMI＝FFMI＋6.1×(1.8－身高 m)。身高與出生日期在「設定」頁。'],
]

// ---------- 匯出 ----------
function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

type Cell = string | number | Date | null

function sheet(title: string, head: string[], rows: Cell[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([[title], head, ...rows], { cellDates: true, dateNF: 'yyyy/mm/dd' })
  ws['!cols'] = head.map((h, i) => ({ wch: i === 0 ? 11 : h === '動作' || h === '備註' ? 16 : 8 }))
  ws['!freeze'] = { xSplit: 0, ySplit: 2 }
  return ws
}

export function exportXlsx(data: { workouts: Workout[]; logs: DailyLog[]; body: BodyMetric[]; settings: Settings }): void {
  const wb = XLSX.utils.book_new()
  const s = data.settings
  const rows = analyzeWorkouts(data.workouts, bodyWeightLookup(data.body), s.bodyweight)
  for (const cat of CATEGORIES) {
    const list = rows.filter((r) => r.category === cat)
    const n = Math.max(6, ...list.map((r) => r.sets.length))
    const head = ['日期', '動作', '側別']
    head.push('體重(kg)')
    for (let i = 1; i <= n; i++) head.push(`組${i} kg`, `組${i} 次數`)
    head.push('備註', '組數(計算)', '總次數(計算)', '最大重量(計算)', '訓練量(計算)', '估算1RM(計算)', '進步指標(計算)', '與上次比(計算)')
    const data_ = list.map((r) => {
      const row: Cell[] = [toDate(r.date), r.exercise, r.side]
      row.push(r.body_weight)
      for (let i = 0; i < n; i++) row.push(r.sets[i]?.kg ?? null, r.sets[i]?.reps ?? null)
      row.push(r.note, r.m.setCount, r.m.totalReps, r.m.maxKg, r.m.volume, r.m.e1rm, r.m.indicator, r.delta)
      return row
    })
    XLSX.utils.book_append_sheet(wb, sheet(`${cat}｜啞鈴記單手、槓鈴記總重；kg 留空＝同上一組`, head, data_), cat)
  }
  const logs = assignCycles(data.logs, s.cycle_targets)
  XLSX.utils.book_append_sheet(wb, sheet('每日紀錄', ['日期', '項目', '備註', 'Cycle(計算)'],
    logs.map((l) => [toDate(l.date), l.item, l.note, l.cycle])), '每日紀錄')
  const body = analyzeBody(data.body, s.height_cm, s.birth_date)
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)
  XLSX.utils.book_append_sheet(wb, sheet('身體組成', ['日期', '體重(kg)', '體脂率(%)', '骨骼肌量(kg)', '年齡(計算)', '去脂體重(計算)', 'FFMI(計算)', '標準化FFMI(計算)'],
    body.map((b) => [toDate(b.date), b.weight, b.body_fat_pct, b.smm, b.age, r1(b.ffm), r1(b.ffmi), r1(b.nffmi)])), '身體組成')
  const setRows: Cell[][] = [['身高(cm)', '', s.height_cm], ['出生日期', '', s.birth_date]]
  for (const t of s.cycle_targets) setRows.push(['Cycle目標', t.item, t.target])
  for (const c of CATEGORIES) for (const e of s.exercises[c]) setRows.push(['動作', c, e])
  for (const e of s.unilateral) setRows.push(['單邊動作', '', e])
  for (const e of s.bodyweight) setRows.push(['自重動作', '', e])
  XLSX.utils.book_append_sheet(wb, sheet('設定', ['類型', '名稱', '值'], setRows), '設定')
  XLSX.utils.book_append_sheet(wb, sheet('AI 解析說明', ['項目', '說明'], AI_GUIDE), 'AI解析說明')
  XLSX.writeFile(wb, `fit-log-${todayStr()}.xlsx`, { compression: true })
}

export function exportJson(data: { workouts: Workout[]; logs: DailyLog[]; body: BodyMetric[]; settings: Settings }): void {
  const strip = <T extends { id: number }>(r: T) => {
    const { id: _id, ...rest } = r as T & { user_id?: string; created_at?: string }
    delete (rest as { user_id?: string }).user_id
    delete (rest as { created_at?: string }).created_at
    return rest
  }
  const out = {
    format: 'fit-log', version: 1, exported_at: new Date().toISOString(),
    settings: data.settings,
    workouts: data.workouts.map(strip),
    daily_logs: data.logs.map(strip),
    body_metrics: data.body.map(strip),
  }
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `fit-log-${todayStr()}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---------- 匯入 ----------
const norm = (v: unknown) => String(v ?? '').replace(/\s|\(計算\)/g, '')

function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const p = (n: number) => String(n).padStart(2, '0')
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    return d ? `${d.y}-${p(d.m)}-${p(d.d)}` : null
  }
  if (v instanceof Date) return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  const m = String(v).trim().match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/)
  return m ? `${m[1]}-${p(+m[2])}-${p(+m[3])}` : null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const str = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim())

/** 找出表頭列並回傳 {欄名: index} 與資料列 */
function table(ws: XLSX.WorkSheet | undefined, required: string[]): { col: Map<string, number>; rows: unknown[][] } | null {
  if (!ws) return null
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
  for (let i = 0; i < Math.min(6, aoa.length); i++) {
    const names = (aoa[i] ?? []).map(norm)
    if (required.every((r) => names.includes(r))) {
      const col = new Map<string, number>()
      names.forEach((n, j) => { if (n && !col.has(n)) col.set(n, j) })
      return { col, rows: aoa.slice(i + 1) }
    }
  }
  return null
}

export interface ImportResult {
  data: Dataset
  skippedRef: number
  settingsFound: boolean
}

export function parseXlsx(buf: ArrayBuffer): ImportResult {
  const wb = XLSX.read(buf, { type: 'array' })
  const out: Dataset = { settings: structuredClone(DEFAULT_SETTINGS), workouts: [], daily_logs: [], body_metrics: [] }
  let skippedRef = 0
  let settingsFound = false

  for (const cat of CATEGORIES) {
    const t = table(wb.Sheets[cat], ['日期', '動作'])
    if (!t) continue
    const get = (r: unknown[], k: string) => (t.col.has(k) ? r[t.col.get(k)!] : null)
    for (const r of t.rows) {
      const date = parseDate(get(r, '日期'))
      const exercise = str(get(r, '動作'))
      if (!date || !exercise) continue
      const note = str(get(r, '備註'))
      if (note?.includes('參考值')) { skippedRef++; continue }
      const sets: SetEntry[] = []
      for (let i = 1; t.col.has(`組${i}次數`); i++) {
        const kg = num(get(r, `組${i}kg`))
        const reps = num(get(r, `組${i}次數`))
        if (kg !== null || reps !== null) sets.push({ kg, reps })
      }
      while (sets.length && sets[sets.length - 1].reps === null) sets.pop()
      const side = str(get(r, '側別'))
      out.workouts.push({
        date, category: cat as Category, exercise,
        side: (SIDES as readonly string[]).includes(side ?? '') ? (side as Side) : '雙',
        body_weight: num(get(r, '體重(kg)')), sets, note,
      })
    }
  }

  const lt = table(wb.Sheets['每日紀錄'], ['日期', '項目'])
  if (lt) {
    for (const r of lt.rows) {
      const date = parseDate(r[lt.col.get('日期')!])
      const item = str(r[lt.col.get('項目')!])
      if (date && item) out.daily_logs.push({ date, item, note: lt.col.has('備註') ? str(r[lt.col.get('備註')!]) : null })
    }
  }

  const bt = table(wb.Sheets['身體組成'], ['日期', '體重(kg)'])
  if (bt) {
    const pick = (r: unknown[], ...ks: string[]) => { for (const k of ks) if (bt.col.has(k)) return num(r[bt.col.get(k)!]); return null }
    for (const r of bt.rows) {
      const date = parseDate(r[bt.col.get('日期')!])
      const weight = pick(r, '體重(kg)')
      if (!date || weight === null) continue
      out.body_metrics.push({ date, weight, body_fat_pct: pick(r, '體脂率(%)', '體脂肪率(%)'), smm: pick(r, '骨骼肌量(kg)') })
    }
  }

  // 設定：網頁匯出的「設定」頁，或原始 Excel 的「使用說明／Cycle看板／動作清單」
  const st = table(wb.Sheets['設定'], ['類型', '名稱', '值'])
  if (st) {
    settingsFound = true
    const targets: Settings['cycle_targets'] = []
    const ex: Record<string, string[]> = {}
    const uni: string[] = []
    const bwl: string[] = []
    for (const r of st.rows) {
      const [k, name, val] = [str(r[0]), str(r[1]), r[2]]
      if (k === '身高(cm)' && num(val)) out.settings.height_cm = num(val)!
      if (k === '出生日期' && parseDate(val)) out.settings.birth_date = parseDate(val)!
      if (k === 'Cycle目標' && name) targets.push({ item: name, target: num(val) ?? 0 })
      if (k === '動作' && name && str(val)) (ex[name] ??= []).push(str(val)!)
      if (k === '單邊動作' && str(val)) uni.push(str(val)!)
      if (k === '自重動作' && str(val)) bwl.push(str(val)!)
    }
    if (uni.length) out.settings.unilateral = uni
    out.settings.bodyweight = bwl
    if (targets.length) out.settings.cycle_targets = targets
    for (const c of CATEGORIES) if (ex[c]?.length) out.settings.exercises[c] = ex[c]
  } else {
    const guide = wb.Sheets['使用說明']
    if (guide) {
      const h = num(guide['C5']?.v)
      const b = parseDate(guide['C6']?.v)
      if (h) { out.settings.height_cm = h; settingsFound = true }
      if (b) out.settings.birth_date = b
    }
    const board = wb.Sheets['Cycle看板']
    if (board) {
      const targets: Settings['cycle_targets'] = []
      for (let r = 14; r <= 25; r++) {
        const item = str(board[`B${r}`]?.v)
        if (item) targets.push({ item, target: num(board[`C${r}`]?.v) ?? 0 })
      }
      if (targets.length) out.settings.cycle_targets = targets
    }
    const list = wb.Sheets['動作清單']
    if (list) {
      CATEGORIES.forEach((c, i) => {
        const colL = String.fromCharCode(65 + i)
        if (str(list[`${colL}1`]?.v) !== c) return
        const names: string[] = []
        for (let r = 2; r <= 13; r++) { const v = str(list[`${colL}${r}`]?.v); if (v) names.push(v) }
        if (names.length) out.settings.exercises[c] = names
      })
    }
  }
  return { data: out, skippedRef, settingsFound }
}

export function parseJson(text: string): ImportResult {
  const j = JSON.parse(text)
  if (j.format !== 'fit-log') throw new Error('不是 fit-log 匯出的 JSON 檔')
  return {
    data: {
      settings: {
        ...DEFAULT_SETTINGS, ...j.settings,
        unilateral: j.settings?.unilateral ?? DEFAULT_SETTINGS.unilateral,
        bodyweight: j.settings?.bodyweight ?? DEFAULT_SETTINGS.bodyweight,
      },
      workouts: j.workouts ?? [],
      daily_logs: j.daily_logs ?? [],
      body_metrics: j.body_metrics ?? [],
    },
    skippedRef: 0,
    settingsFound: !!j.settings,
  }
}
