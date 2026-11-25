import { useState } from 'react'
import type { PageProps } from '../App'
import { deleteAll, insertRows, saveSettings, supabase } from '../db'
import type { ImportResult } from '../io'

// xlsx 套件較大，只在匯入／匯出時才載入
const io = () => import('../io')
import { CATEGORIES, type Settings } from '../types'

export default function DataPage({ data, run, email }: PageProps & { email: string }) {
  return (
    <div className="page">
      <ExportCard data={data} />
      <ImportCard data={data} run={run} />
      <SettingsCard settings={data.settings} run={run} />
      <section className="card">
        <h2>帳號</h2>
        <p className="muted small">{email}</p>
        <button className="ghost full" onClick={() => supabase.auth.signOut()}>
          登出
        </button>
      </section>
    </div>
  )
}

function ExportCard({ data }: Pick<PageProps, 'data'>) {
  const [busy, setBusy] = useState(false)
  const n = data.workouts.length + data.logs.length + data.body.length
  return (
    <section className="card">
      <h2>匯出</h2>
      <p className="muted small">
        訓練 {data.workouts.length}・每日 {data.logs.length}・身體 {data.body.length} 筆。Excel 適合給 AI 分析或自己看，JSON 適合完整備份。
      </p>
      <div className="row gap">
        <button
          className="primary grow"
          disabled={busy || !n}
          onClick={async () => {
            setBusy(true)
            try {
              ;(await io()).exportXlsx(data)
            } finally {
              setBusy(false)
            }
          }}
        >
          匯出 Excel
        </button>
        <button className="ghost grow" disabled={!n} onClick={async () => (await io()).exportJson(data)}>
          JSON 備份
        </button>
      </div>
    </section>
  )
}

function ImportCard({ data, run }: Pick<PageProps, 'data' | 'run'>) {
  const [res, setRes] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [replace, setReplace] = useState(false)
  const [withSettings, setWithSettings] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const onFile = async (f: File | undefined) => {
    setRes(null)
    setErr(null)
    if (!f) return
    setFileName(f.name)
    try {
      const m = await io()
      setRes(f.name.toLowerCase().endsWith('.json') ? m.parseJson(await f.text()) : m.parseXlsx(await f.arrayBuffer()))
    } catch (e) {
      setErr(`無法讀取：${(e as Error).message}`)
    }
  }

  const doImport = async () => {
    if (!res) return
    const d = res.data
    if (replace && !confirm('會先刪除雲端上所有訓練、每日紀錄和身體組成資料，再匯入檔案內容。確定嗎？')) return
    const ok = await run(async () => {
      if (replace) {
        await deleteAll('workouts')
        await deleteAll('daily_logs')
        await deleteAll('body_metrics')
      }
      if (withSettings && res.settingsFound) await saveSettings(d.settings)
      await insertRows('workouts', d.workouts)
      await insertRows('daily_logs', d.daily_logs)
      await insertRows('body_metrics', d.body_metrics)
    }, '匯入完成')
    if (ok) setRes(null)
  }

  const dup = res && !replace ? countDup(res, data) : 0

  return (
    <section className="card">
      <h2>匯入</h2>
      <p className="muted small">支援這個網頁匯出的 Excel／JSON，以及原本的「重訓紀錄表.xlsx」。</p>
      <input type="file" accept=".xlsx,.json" onChange={(e) => onFile(e.target.files?.[0])} />
      {err && <p className="error">{err}</p>}
      {res && (
        <div className="import-preview">
          <p>
            <b>{fileName}</b>：訓練 {res.data.workouts.length}・每日 {res.data.daily_logs.length}・身體 {res.data.body_metrics.length} 筆
            {res.skippedRef > 0 && <span className="muted">（略過 {res.skippedRef} 筆參考值）</span>}
          </p>
          {dup > 0 && <p className="bad small">⚠ 有 {dup} 筆和現有資料同一天、同內容，加入後會重複。</p>}
          <label className="check">
            <input type="radio" checked={!replace} onChange={() => setReplace(false)} /> 加到現有資料後面
          </label>
          <label className="check">
            <input type="radio" checked={replace} onChange={() => setReplace(true)} /> 清空雲端資料後匯入（還原備份用）
          </label>
          {res.settingsFound && (
            <label className="check">
              <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} /> 一併匯入設定（身高、出生日期、Cycle 目標、動作清單）
            </label>
          )}
          <button className={replace ? 'danger full' : 'primary full'} onClick={doImport}>
            {replace ? '清空並匯入' : '匯入'}
          </button>
        </div>
      )}
    </section>
  )
}

function countDup(res: ImportResult, data: PageProps['data']): number {
  const k1 = new Set(data.workouts.map((w) => `${w.date}|${w.exercise}|${w.side}|${JSON.stringify(w.sets)}`))
  const k2 = new Set(data.logs.map((l) => `${l.date}|${l.item}`))
  const k3 = new Set(data.body.map((b) => `${b.date}|${b.weight}`))
  return (
    res.data.workouts.filter((w) => k1.has(`${w.date}|${w.exercise}|${w.side}|${JSON.stringify(w.sets)}`)).length +
    res.data.daily_logs.filter((l) => k2.has(`${l.date}|${l.item}`)).length +
    res.data.body_metrics.filter((b) => k3.has(`${b.date}|${b.weight}`)).length
  )
}

function SettingsCard({ settings, run }: { settings: Settings; run: PageProps['run'] }) {
  const [s, setS] = useState<Settings>(settings)
  const [exText, setExText] = useState(() => Object.fromEntries(CATEGORIES.map((c) => [c, (settings.exercises[c] ?? []).join('\n')])))
  const dirty = JSON.stringify(s) !== JSON.stringify(settings) || CATEGORIES.some((c) => exText[c] !== (settings.exercises[c] ?? []).join('\n'))

  const save = () => {
    const exercises = Object.fromEntries(
      CATEGORIES.map((c) => [c, exText[c].split('\n').map((x) => x.trim()).filter(Boolean)]),
    ) as Settings['exercises']
    const cycle_targets = s.cycle_targets.filter((t) => t.item.trim()).map((t) => ({ item: t.item.trim(), target: Math.max(0, Math.round(t.target)) }))
    const all = new Set(Object.values(exercises).flat())
    run(
      () => saveSettings({ ...s, exercises, cycle_targets, unilateral: s.unilateral.filter((x) => all.has(x)), bodyweight: s.bodyweight.filter((x) => all.has(x)) }),
      '設定已儲存',
    )
  }
  const setT = (i: number, patch: Partial<Settings['cycle_targets'][number]>) =>
    setS({ ...s, cycle_targets: s.cycle_targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) })

  return (
    <section className="card">
      <h2>設定</h2>
      <div className="grid2">
        <label>
          身高 cm
          <input inputMode="decimal" value={s.height_cm} onChange={(e) => setS({ ...s, height_cm: Number(e.target.value) || 0 })} />
        </label>
        <label>
          出生日期
          <input type="date" value={s.birth_date} onChange={(e) => setS({ ...s, birth_date: e.target.value })} />
        </label>
      </div>

      <h3>Cycle 目標</h3>
      <table className="sets targets">
        <tbody>
          {s.cycle_targets.map((t, i) => (
            <tr key={i}>
              <td>
                <input value={t.item} onChange={(e) => setT(i, { item: e.target.value })} />
              </td>
              <td className="w80">
                <input inputMode="numeric" value={t.target} onChange={(e) => setT(i, { target: Number(e.target.value) || 0 })} />
              </td>
              <td>
                <button className="x" aria-label="刪除" onClick={() => setS({ ...s, cycle_targets: s.cycle_targets.filter((_, j) => j !== i) })}>
                  −
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="ghost full" onClick={() => setS({ ...s, cycle_targets: [...s.cycle_targets, { item: '', target: 1 }] })}>
        ＋ 新增項目
      </button>
      <p className="muted small">改名會讓舊的每日紀錄對不上，建議新增而不是改名。</p>

      <h3>動作清單（一行一個）</h3>
      {CATEGORIES.map((c) => (
        <label key={c}>
          {c}
          <textarea rows={Math.max(3, exText[c].split('\n').length)} value={exText[c]} onChange={(e) => setExText({ ...exText, [c]: e.target.value })} />
        </label>
      ))}
      <h3>單邊動作（左右分開記錄）</h3>
      <div className="chips">
        {[...new Set(CATEGORIES.flatMap((c) => exText[c].split('\n').map((x) => x.trim()).filter(Boolean)))].map((name) => {
          const on = s.unilateral.includes(name)
          return (
            <button
              key={name}
              className={`chip ${on ? 'on' : ''}`}
              onClick={() => setS({ ...s, unilateral: on ? s.unilateral.filter((x) => x !== name) : [...s.unilateral, name] })}
            >
              {on ? '✓ ' : ''}
              {name}
            </button>
          )
        })}
      </div>
      <p className="muted small">點選要左右分開記錄的動作。單邊動作會用「左次數／右次數」並排輸入，並顯示左右差。</p>

      <h3>自重動作（可記輔助／加重，1RM 含體重）</h3>
      <div className="chips">
        {[...new Set(CATEGORIES.filter((c) => c !== '引體').flatMap((c) => exText[c].split('\n').map((x) => x.trim()).filter(Boolean)))].map((name) => {
          const on = s.bodyweight.includes(name)
          return (
            <button
              key={name}
              className={`chip ${on ? 'on' : ''}`}
              onClick={() => setS({ ...s, bodyweight: on ? s.bodyweight.filter((x) => x !== name) : [...s.bodyweight, name] })}
            >
              {on ? '✓ ' : ''}
              {name}
            </button>
          )
        })}
      </div>
      <p className="muted small">「引體」類別的動作一律是自重動作，不在這裡列出。標記後，該動作的進步指標會從總次數改成含體重的估算 1RM（所有歷史紀錄一起重算）。</p>
      <button className="primary full" disabled={!dirty} onClick={save}>
        儲存設定
      </button>
    </section>
  )
}
