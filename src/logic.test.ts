import { describe, expect, it } from 'vitest'
import { ageAt, analyzeBody, analyzeWorkouts, assignCycles, cycleInfo, effectiveSets, setsSummary, workoutMetrics } from './logic'
import { DEFAULT_SETTINGS, RESET, type DailyLog, type Workout } from './types'

const W = (id: number, date: string, exercise: string, side: Workout['side'], sets: Workout['sets'], category: Workout['category'] = '腿', bw: number | null = null): Workout => ({
  id, date, category, exercise, side, sets, body_weight: bw, note: null,
})

describe('訓練計算（與 Excel 版結果一致）', () => {
  it('kg 留空沿用前一組', () => {
    expect(effectiveSets([{ kg: 12, reps: 10 }, { kg: null, reps: 8 }, { kg: 10, reps: 9 }, { kg: null, reps: null }])).toEqual([
      { kg: 12, reps: 10 }, { kg: 12, reps: 8 }, { kg: 10, reps: 9 },
    ])
  })
  it('訓練量、1RM（Excel 測試：306、16）', () => {
    const m = workoutMetrics(W(1, '2026-11-27', '保加利亞分腿蹲', '左', [{ kg: 12, reps: 10 }, { kg: null, reps: 8 }, { kg: 10, reps: 9 }]), null)
    expect(m.volume).toBe(306)
    expect(m.e1rm).toBe(16)
    expect(m.maxKg).toBe(12)
  })
  it('引體用體重＋負數（Excel：56.7）', () => {
    const m = workoutMetrics(W(1, 'x', '輔助反握引體', '雙', [{ kg: -18, reps: 5 }, { kg: null, reps: 4 }], '引體'), 66.6)
    expect(m.e1rm).toBe(56.7)
    expect(m.maxKg).toBe(-18)
  })
  it('核心與自重用總次數', () => {
    expect(workoutMetrics(W(1, 'x', '捲腹', '雙', [{ kg: null, reps: 25 }, { kg: null, reps: 20 }], '核心'), null).indicator).toBe(45)
    expect(workoutMetrics(W(1, 'x', '伏地挺身', '雙', [{ kg: null, reps: 15 }], '推'), null).indicator).toBe(15)
  })
  it('與上次比分側別', () => {
    const rows = analyzeWorkouts([
      W(1, '2026-11-24', '保加利亞分腿蹲', '左', [{ kg: 10, reps: 10 }]),
      W(2, '2026-11-24', '保加利亞分腿蹲', '右', [{ kg: 10, reps: 10 }]),
      W(3, '2026-11-27', '保加利亞分腿蹲', '左', [{ kg: 12, reps: 10 }]),
    ], null)
    expect(rows.map((r) => r.delta)).toEqual([null, null, 2.7])
  })
  it('摘要', () => {
    expect(setsSummary([{ kg: 16, reps: 10 }, { kg: null, reps: 10 }, { kg: 14, reps: 8 }])).toBe('16kg × 10/10，14kg × 8')
  })
})

describe('Cycle（與 Excel 測試相同情境）', () => {
  const items: [string, string][] = [
    ['2026-11-24', RESET], ['2026-11-24', '腿'], ['2026-11-24', '輔助引體'], ['2026-11-25', '推'], ['2026-11-25', '核心'],
    ['2026-11-26', '背'], ['2026-11-27', '腿'], ['2026-11-27', '輔助引體'], ['2026-11-28', '拉'], ['2026-11-28', '背'],
    ['2026-11-28', '核心'], ['2026-11-29', 'HIIT'], ['2026-11-30', '輔助引體'], ['2026-12-12', '爬山'], ['2026-12-13', '腿'],
    ['2026-12-15', RESET], ['2026-12-15', '推'], ['2026-12-16', '推'],
  ]
  const logs: DailyLog[] = items.map(([date, item], i) => ({ id: i + 1, date, item, note: null }))
  const t = DEFAULT_SETTINGS.cycle_targets
  const rows = assignCycles(logs, t)
  it('自動與手動換輪', () => {
    expect(rows.map((r) => r.cycle)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 3, 3])
  })
  it('輪次統計', () => {
    const c1 = cycleInfo(rows, t, 1, '2026-12-16', false)
    expect([c1.start, c1.lastDate, c1.days, c1.trainingDays, c1.complete]).toEqual(['2026-11-24', '2026-12-12', 19, 8, true])
    const c3 = cycleInfo(rows, t, 3, '2026-12-16', true)
    expect(c3.trainingDays).toBe(2)
    expect(c3.notStarted).toEqual(['腿', '拉', '背', '核心', 'HIIT', '輔助引體', '爬山'])
    expect(c3.completion).toBeCloseTo(1 / 13)
  })
})

describe('身體組成', () => {
  it('年齡與 FFMI（Excel：18.15 / 18.64）', () => {
    expect(ageAt('2002-08-02', '2026-08-01')).toBe(23)
    expect(ageAt('2002-08-02', '2026-08-02')).toBe(24)
    const [r] = analyzeBody([{ id: 1, date: '2026-11-24', weight: 66.6, body_fat_pct: 19.3, smm: 30.2 }], 172, '2002-08-02')
    expect(r.ffmi).toBeCloseTo(18.167, 2)
    expect(r.nffmi).toBeCloseTo(18.655, 2)
    expect(r.age).toBe(24)
  })
})
