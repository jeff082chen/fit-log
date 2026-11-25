import { createClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS, type BodyMetric, type DailyLog, type Settings, type Workout } from './types'

// 這兩個值是 Supabase 設計給前端使用的公開設定；資料由登入＋資料列權限（RLS）保護。
export const SUPABASE_URL = 'https://pagfhiqhoxschnzwnbak.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_ItD5M8TkCr1AXG52Oz83Gg_d1Vz9c2I'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

type Table = 'workouts' | 'daily_logs' | 'body_metrics'

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** 分頁抓取全部資料（Supabase 單次上限 1000 列） */
async function fetchAll<T>(table: Table): Promise<T[]> {
  const out: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('*').order('date').order('id').range(from, from + page - 1)
    fail(error)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < page) break
  }
  return out
}

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

export async function loadAll(): Promise<{ workouts: Workout[]; logs: DailyLog[]; body: BodyMetric[]; settings: Settings }> {
  const [workouts, logs, body, settings] = await Promise.all([
    fetchAll<Workout>('workouts'),
    fetchAll<DailyLog>('daily_logs'),
    fetchAll<BodyMetric>('body_metrics'),
    loadSettings(),
  ])
  return {
    workouts: workouts.map((w) => ({ ...w, body_weight: numOrNull(w.body_weight) })),
    logs,
    body: body.map((b) => ({ ...b, weight: numOrNull(b.weight), body_fat_pct: numOrNull(b.body_fat_pct), smm: numOrNull(b.smm) })),
    settings,
  }
}

export async function loadSettings(): Promise<Settings> {
  const { data, error } = await supabase.from('settings').select('*').maybeSingle()
  fail(error)
  if (!data) {
    const { error: e2 } = await supabase.from('settings').insert({})
    fail(e2)
    return DEFAULT_SETTINGS
  }
  return {
    height_cm: Number(data.height_cm),
    birth_date: data.birth_date,
    cycle_targets: data.cycle_targets,
    exercises: Object.fromEntries(
      Object.entries({ ...DEFAULT_SETTINGS.exercises, ...data.exercises }).filter(([k]) => !k.startsWith('_')),
    ) as Settings['exercises'],
    unilateral: Array.isArray(data.exercises?._unilateral) ? data.exercises._unilateral : DEFAULT_SETTINGS.unilateral,
    bodyweight: Array.isArray(data.exercises?._bodyweight) ? data.exercises._bodyweight : DEFAULT_SETTINGS.bodyweight,
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  const { unilateral, bodyweight, ...rest } = s
  // 單邊／自重動作清單存在 exercises 欄位的 _unilateral／_bodyweight 鍵（不需要改資料表結構）
  const { error } = await supabase.from('settings').upsert({
    ...rest,
    exercises: { ...rest.exercises, _unilateral: unilateral, _bodyweight: bodyweight },
    updated_at: new Date().toISOString(),
  })
  fail(error)
}

export async function insertRows<T extends object>(table: Table, rows: T[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 500))
    fail(error)
  }
}

export async function updateRow<T extends object>(table: Table, id: number, patch: T): Promise<void> {
  const { error } = await supabase.from(table).update(patch).eq('id', id)
  fail(error)
}

export async function deleteRow(table: Table, id: number): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  fail(error)
}

export async function deleteAll(table: Table): Promise<void> {
  const { error } = await supabase.from(table).delete().gte('id', 0)
  fail(error)
}
