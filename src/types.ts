export const CATEGORIES = ['腿', '推', '拉', '引體', '核心'] as const
export type Category = (typeof CATEGORIES)[number]
export const SIDES = ['雙', '左', '右'] as const
export type Side = (typeof SIDES)[number]
export const RESET = '開始新 Cycle'

/** 訓練類別完成時，自動記到每日紀錄的項目名稱 */
export const CATEGORY_TO_ITEM: Record<Category, string> = {
  腿: '腿',
  推: '推',
  拉: '拉',
  引體: '輔助引體',
  核心: '核心',
}

export interface SetEntry {
  kg: number | null
  reps: number | null
}

export interface Workout {
  id: number
  date: string // yyyy-mm-dd
  category: Category
  exercise: string
  side: Side
  body_weight: number | null
  sets: SetEntry[]
  note: string | null
}

export interface DailyLog {
  id: number
  date: string
  item: string
  note: string | null
}

export interface BodyMetric {
  id: number
  date: string
  weight: number | null
  body_fat_pct: number | null
  smm: number | null
}

export interface CycleTarget {
  item: string
  target: number
}

export interface Settings {
  height_cm: number
  birth_date: string
  cycle_targets: CycleTarget[]
  exercises: Record<Category, string[]>
  /** 單邊動作（左右分開記錄）的名稱 */
  unilateral: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  height_cm: 172,
  birth_date: '2002-08-02',
  cycle_targets: [
    { item: '腿', target: 2 },
    { item: '推', target: 1 },
    { item: '拉', target: 1 },
    { item: '背', target: 2 },
    { item: '核心', target: 2 },
    { item: 'HIIT', target: 1 },
    { item: '輔助引體', target: 3 },
    { item: '爬山', target: 1 },
  ],
  exercises: {
    腿: ['高腳杯深蹲', '保加利亞分腿蹲', '槓鈴硬舉', '槓鈴臀橋', '小腿提踵'],
    推: ['臥推', '上斜臥推', '仰臥臂屈伸', '肩推', '側平舉', '啞鈴夾胸', '伏地挺身'],
    拉: ['槓鈴划船', '仰臥拉舉', '俯身飛鳥', '二頭彎舉', '反握彎舉', '腕彎舉', '反握腕彎舉'],
    引體: ['輔助反握引體', '輔助肩胛骨引體'],
    核心: ['捲腹', '抬腿', '俄羅斯轉體'],
  },
  unilateral: ['保加利亞分腿蹲'],
}
