import { describe, expect, it } from 'vitest'
import { ageAt, analyzeBody, bestSets, analyzeWorkouts, assignCycles, cycleInfo, effectiveSets, setsSummary, workoutMetrics } from './logic'
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

describe('個人紀錄', () => {
  it('最重／最多次／最大容量', () => {
    const r = bestSets([
      W(1, '2026-11-20', '高腳杯深蹲', '雙', [{ kg: 18, reps: 15 }, { kg: null, reps: 12 }]),
      W(2, '2026-11-23', '高腳杯深蹲', '雙', [{ kg: 20, reps: 12 }, { kg: 22, reps: 8 }]),
    ], null)!
    expect([r.heaviest.kg, r.heaviest.reps, r.heaviest.date]).toEqual([22, 8, '2026-11-23'])
    expect([r.mostReps.kg, r.mostReps.reps]).toEqual([18, 15])
    expect([r.maxVolume!.kg, r.maxVolume!.reps, r.maxVolume!.volume]).toEqual([18, 15, 270])
  })
  it('引體輔助越少越重；自重動作沒有容量', () => {
    const r = bestSets([
      W(1, 'a', '輔助反握引體', '雙', [{ kg: -20, reps: 6 }], '引體'),
      W(2, 'b', '輔助反握引體', '雙', [{ kg: -15, reps: 4 }], '引體'),
    ], 66.6)!
    expect(r.heaviest.kg).toBe(-15)
    expect(r.mostReps.kg).toBe(-20)
    expect(bestSets([W(1, 'a', '伏地挺身', '雙', [{ kg: null, reps: 15 }], '推')], null)!.maxVolume).toBeNull()
  })
})

describe('單邊動作', () => {
  it('合併、摘要與左右差', async () => {
    const { sessionsOf, pairSummary, imbalance } = await import('./logic')
    const rows = analyzeWorkouts([
      W(1, '2026-11-24', '保加利亞分腿蹲', '左', [{ kg: 10, reps: 10 }, { kg: null, reps: 10 }, { kg: null, reps: 9 }]),
      W(2, '2026-11-24', '保加利亞分腿蹲', '右', [{ kg: 10, reps: 10 }, { kg: null, reps: 8 }, { kg: null, reps: 7 }]),
      W(3, '2026-11-27', '保加利亞分腿蹲', '左', [{ kg: 12, reps: 8 }]),
    ], null)
    const ss = sessionsOf(rows)
    expect(ss.length).toBe(2)
    expect(pairSummary(ss[0])).toBe('10kg × 左 10/10/9・右 10/8/7')
    expect(imbalance(ss[0])).toEqual({ weak: '右', pct: 14 })
    expect(imbalance(ss[1])).toBeNull()
    expect(pairSummary(ss[1])).toBe('左 12kg × 8')
  })
})

describe('體重依日期、自重動作', () => {
  it('取當天或之前最近一次體重，更早用最早一筆', async () => {
    const { bodyWeightLookup } = await import('./logic')
    const f = bodyWeightLookup([
      { id: 1, date: '2026-10-01', weight: 67.2, body_fat_pct: null, smm: null },
      { id: 2, date: '2026-11-24', weight: 66.6, body_fat_pct: null, smm: null },
      { id: 3, date: '2026-11-10', weight: null, body_fat_pct: null, smm: null },
    ])
    expect([f('2026-09-01'), f('2026-10-01'), f('2026-11-23'), f('2026-11-24'), f('2027-01-01')]).toEqual([67.2, 67.2, 67.2, 66.6, 66.6])
    expect(bodyWeightLookup([])('2026-01-01')).toBeNull()
  })
  it('引體用當天體重；有填體重以填的為準', async () => {
    const { bodyWeightLookup } = await import('./logic')
    const f = bodyWeightLookup([
      { id: 1, date: '2026-10-01', weight: 70, body_fat_pct: null, smm: null },
      { id: 2, date: '2026-11-24', weight: 60, body_fat_pct: null, smm: null },
    ])
    const rows = analyzeWorkouts([
      W(1, '2026-10-05', '輔助反握引體', '雙', [{ kg: -20, reps: 5 }], '引體'),
      W(2, '2026-11-25', '輔助反握引體', '雙', [{ kg: -20, reps: 5 }], '引體'),
      W(3, '2026-11-26', '輔助反握引體', '雙', [{ kg: -20, reps: 5 }], '引體', 65),
    ], f)
    expect(rows.map((r) => r.m.e1rm)).toEqual([58.3, 46.7, 52.5])
  })
  it('標記為自重動作的伏地挺身改用含體重 1RM，未標記維持總次數', () => {
    const w = [W(1, '2026-11-24', '伏地挺身', '雙', [{ kg: null, reps: 15 }, { kg: null, reps: 12 }], '推')]
    expect(analyzeWorkouts(w, 66.6)[0].m.indicator).toBe(27)
    expect(analyzeWorkouts(w, 66.6, ['伏地挺身'])[0].m.e1rm).toBe(99.9)
    expect(bestSets(w, 66.6, ['伏地挺身'])!.maxVolume!.volume).toBeCloseTo(999)
    expect(bestSets(w, 66.6)!.maxVolume).toBeNull()
  })
})

describe('改名', () => {
  it('動作改名與合併', async () => {
    const { renameExerciseInSettings } = await import('./logic')
    const s = { ...DEFAULT_SETTINGS, unilateral: ['保加利亞分腿蹲'], bodyweight: ['伏地挺身'] }
    const a = renameExerciseInSettings(s, '保加利亞分腿蹲', '分腿蹲')
    expect(a.exercises['腿']).toEqual(['高腳杯深蹲', '分腿蹲', '槓鈴硬舉', '槓鈴臀橋', '小腿提踵'])
    expect(a.unilateral).toEqual(['分腿蹲'])
    const b = renameExerciseInSettings(s, '高腳杯深蹲', '槓鈴硬舉')
    expect(b.exercises['腿']).toEqual(['槓鈴硬舉', '保加利亞分腿蹲', '槓鈴臀橋', '小腿提踵'])
  })
  it('Cycle 項目改名、合併與類別對應', async () => {
    const { renameItemInSettings, validateName } = await import('./logic')
    const a = renameItemInSettings(DEFAULT_SETTINGS, '輔助引體', '引體')
    expect(a.cycle_targets.find((t) => t.item === '引體')!.target).toBe(3)
    expect(a.category_items['引體']).toBe('引體')
    const b = renameItemInSettings(DEFAULT_SETTINGS, '背', '核心')
    expect(b.cycle_targets.map((t) => t.item)).toEqual(['腿', '推', '拉', '核心', 'HIIT', '輔助引體', '爬山'])
    expect(b.cycle_targets.find((t) => t.item === '核心')!.target).toBe(2)
    expect([validateName(''), validateName(RESET), validateName('_x'), validateName('ok')].map(Boolean)).toEqual([true, true, true, false])
  })
})

describe('表單 kg 推算', () => {
  it('改了上面的組，下面留空的組跟著改；都沒改用上次的值', async () => {
    const { cascadeKg } = await import('./logic')
    expect(cascadeKg([null, null, null], [20, 22, 24])).toEqual([20, 22, 24])
    expect(cascadeKg([22, null, null], [20, 20, 20])).toEqual([22, 22, 22])
    expect(cascadeKg([null, 25, null], [20, 22, 24])).toEqual([20, 25, 25])
    expect(cascadeKg([null, null, null, null], [20, 20])).toEqual([20, 20, 20, 20])
    expect(cascadeKg([null, null], [null, null])).toEqual([null, null])
  })
  it('沒有目標時不會自動換輪', () => {
    const logs = [{ id: 1, date: '2026-11-01', item: '腿', note: null }, { id: 2, date: '2026-11-02', item: '腿', note: null }]
    expect(assignCycles(logs, []).map((r) => r.cycle)).toEqual([1, 1])
    expect(assignCycles(logs, [{ item: '腿', target: 0 }]).map((r) => r.cycle)).toEqual([1, 1])
    expect(cycleInfo(assignCycles(logs, []), [], 1, '2026-11-02', true).complete).toBe(false)
  })
})
