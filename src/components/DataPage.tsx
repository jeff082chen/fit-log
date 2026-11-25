import { useState } from 'react'
import type { PageProps } from '../App'
import { deleteIds, insertRows, renameInRecords, saveSettings, supabase } from '../db'
import { renameExerciseInSettings, renameItemInSettings, validateName } from '../logic'
import type { ImportResult } from '../io'

// xlsx 套件較大，只在匯入／匯出時才載入
const io = () => import('../io')
import { CATEGORIES, type Category, type Settings } from '../types'

export default function DataPage({ data, run, email }: PageProps & { email: string }) {
  return (
    <div className="page">
      <ExportCard data={data} />
      <ImportCard data={data} run={run} />
      <SettingsCard key={JSON.stringify(data.settings)} settings={data.settings} data={data} run={run} />
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
            } catch (e) {
              alert(`匯出失敗：${(e as Error).message}`)
            } finally {
              setBusy(false)
            }
          }}
        >
          匯出 Excel
        </button>
        <button
          className="ghost grow"
          disabled={!n}
          onClick={async () => {
            try {
              ;(await io()).exportJson(data)
            } catch (e) {
              alert(`匯出失敗：${(e as Error).message}`)
            }
          }}
        >
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
  const [inputKey, setInputKey] = useState(0)

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
    if (replace && !confirm('雲端上現有的訓練、每日紀錄和身體組成資料會被檔案內容取代。確定嗎？')) return
    // 取代模式：先新增檔案內容，全部成功後才刪除舊資料（中途失敗不會遺失資料）
    const old = { w: data.workouts.map((x) => x.id), l: data.logs.map((x) => x.id), b: data.body.map((x) => x.id) }
    const ok = await run(async () => {
      await insertRows('workouts', d.workouts)
      await insertRows('daily_logs', d.daily_logs)
      await insertRows('body_metrics', d.body_metrics)
      if (replace) {
        await deleteIds('workouts', old.w)
        await deleteIds('daily_logs', old.l)
        await deleteIds('body_metrics', old.b)
      }
      if (withSettings && res.settingsFound) await saveSettings({ ...data.settings, ...res.settingsPatch })
    }, '匯入完成')
    if (ok) {
      setRes(null)
      setInputKey((k) => k + 1)
    }
  }

  const dup = res && !replace ? countDup(res, data) : 0

  return (
    <section className="card">
      <h2>匯入</h2>
      <p className="muted small">支援這個網頁匯出的 Excel／JSON，以及原本的「重訓紀錄表.xlsx」。</p>
      <input key={inputKey} type="file" accept=".xlsx,.json" onChange={(e) => onFile(e.target.files?.[0])} />
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

function SettingsCard({ settings, data, run }: { settings: Settings; data: PageProps['data']; run: PageProps['run'] }) {
  const [s, setS] = useState<Settings>(settings)
  const [newEx, setNewEx] = useState<Record<string, string>>({})
  const [newItem, setNewItem] = useState('')
  const dirty = JSON.stringify(s) !== JSON.stringify(settings)

  const save = () => {
    if (!(s.height_cm >= 100 && s.height_cm <= 250)) return alert('身高請填 100～250 cm')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.birth_date)) return alert('請填出生日期')
    const all = new Set(Object.values(s.exercises).flat())
    run(
      () =>
        saveSettings({
          ...s,
          cycle_targets: s.cycle_targets.map((t) => ({ ...t, target: Math.max(0, Math.round(t.target)) })),
          unilateral: s.unilateral.filter((x) => all.has(x)),
          bodyweight: s.bodyweight.filter((x) => all.has(x)),
        }),
      '設定已儲存',
    )
  }

  const blockIfDirty = () => {
    if (!dirty) return false
    alert('改名會直接更新雲端資料。請先按「儲存設定」或「還原」處理目前未儲存的變更，再改名。')
    return true
  }

  // ---- 動作 ----
  const renameExercise = (cat: Category, from: string) => {
    if (blockIfDirty()) return
    const to = prompt(`把「${from}」改名為：`, from)?.trim()
    if (to === undefined || to === from) return
    const err = validateName(to)
    if (err) return alert(err)
    const otherCat = CATEGORIES.find((c) => c !== cat && settings.exercises[c].includes(to)) ??
      data.workouts.find((w) => w.exercise === to && w.category !== cat)?.category
    if (otherCat) return alert(`「${to}」屬於「${otherCat}」類別，不能和「${cat}」類別的動作合併。`)
    const n = data.workouts.filter((w) => w.exercise === from).length
    const m = data.workouts.filter((w) => w.exercise === to).length
    const merging = m > 0 || settings.exercises[cat].includes(to)
    const msg = merging
      ? `「${to}」已經存在，會把「${from}」的 ${n} 筆紀錄合併進「${to}」（目前 ${m} 筆）。合併後無法自動拆回。確定嗎？`
      : `把「${from}」改名為「${to}」，會一併更新 ${n} 筆訓練紀錄。確定嗎？`
    if (!confirm(msg)) return
    run(async () => {
      await renameInRecords('exercise', from, to)
      await saveSettings(renameExerciseInSettings(settings, from, to))
    }, merging ? '已合併' : '已改名')
  }
  const setList = (cat: Category, list: string[]) => setS({ ...s, exercises: { ...s.exercises, [cat]: list } })
  const move = <T,>(list: T[], i: number, d: number): T[] => {
    const j = i + d
    if (j < 0 || j >= list.length) return list
    const out = [...list]
    ;[out[i], out[j]] = [out[j], out[i]]
    return out
  }
  const addExercise = (cat: Category) => {
    const name = (newEx[cat] ?? '').trim()
    const err = validateName(name)
    if (err) return alert(err)
    const where = CATEGORIES.find((c) => s.exercises[c].includes(name))
    if (where) return alert(`「${name}」已經在「${where}」類別裡了`)
    setList(cat, [...s.exercises[cat], name])
    setNewEx({ ...newEx, [cat]: '' })
  }
  const toggle = (key: 'unilateral' | 'bodyweight', name: string) =>
    setS({ ...s, [key]: s[key].includes(name) ? s[key].filter((x) => x !== name) : [...s[key], name] })

  // ---- Cycle 項目 ----
  const renameItem = (from: string) => {
    if (blockIfDirty()) return
    const to = prompt(`把 Cycle 項目「${from}」改名為：`, from)?.trim()
    if (to === undefined || to === from) return
    const err = validateName(to)
    if (err) return alert(err)
    const n = data.logs.filter((l) => l.item === from).length
    const m = data.logs.filter((l) => l.item === to).length
    const merging = m > 0 || settings.cycle_targets.some((t) => t.item === to)
    const msg = merging
      ? `「${to}」已經存在，會把「${from}」的 ${n} 筆每日紀錄合併進「${to}」，目標次數沿用「${to}」的設定。確定嗎？`
      : `把「${from}」改名為「${to}」，會一併更新 ${n} 筆每日紀錄。確定嗎？`
    if (!confirm(msg)) return
    run(async () => {
      await renameInRecords('item', from, to)
      await saveSettings(renameItemInSettings(settings, from, to))
    }, merging ? '已合併' : '已改名')
  }
  const setT = (i: number, patch: Partial<Settings['cycle_targets'][number]>) =>
    setS({ ...s, cycle_targets: s.cycle_targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  const addItem = () => {
    const name = newItem.trim()
    const err = validateName(name)
    if (err) return alert(err)
    if (s.cycle_targets.some((t) => t.item === name)) return alert(`「${name}」已經存在`)
    setS({ ...s, cycle_targets: [...s.cycle_targets, { item: name, target: 1 }] })
    setNewItem('')
  }
  const items = s.cycle_targets.map((t) => t.item)

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

      <h3>Cycle 項目與目標次數</h3>
      <ul className="edlist">
        {s.cycle_targets.map((t, i) => (
          <li key={t.item}>
            <span className="name">{t.item}</span>
            <input className="num" inputMode="numeric" value={t.target} onChange={(e) => setT(i, { target: Number(e.target.value) || 0 })} />
            <span className="muted small">次</span>
            <button className="ic" title="改名" onClick={() => renameItem(t.item)}>✎</button>
            <button className="ic" title="上移" onClick={() => setS({ ...s, cycle_targets: move(s.cycle_targets, i, -1) })}>↑</button>
            <button className="ic" title="下移" onClick={() => setS({ ...s, cycle_targets: move(s.cycle_targets, i, 1) })}>↓</button>
            <button className="ic" title="移除" onClick={() => setS({ ...s, cycle_targets: s.cycle_targets.filter((_, j) => j !== i) })}>×</button>
          </li>
        ))}
      </ul>
      <div className="row gap">
        <input placeholder="新增項目" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
        <button className="ghost" onClick={addItem}>新增</button>
      </div>

      <h3>訓練存檔時自動記錄的項目</h3>
      <div className="maprow">
        {CATEGORIES.map((c) => (
          <label key={c}>
            {c}
            <select value={s.category_items[c] ?? ''} onChange={(e) => setS({ ...s, category_items: { ...s.category_items, [c]: e.target.value } })}>
              <option value="">（不記錄）</option>
              {[...new Set([...items, s.category_items[c]].filter(Boolean))].map((it) => (
                <option key={it} value={it}>{it}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <h3>動作清單</h3>
      <p className="muted small">「單邊」＝左右分開記錄；「自重」＝可記輔助／加重，1RM 含體重（引體類一律是自重）。</p>
      {CATEGORIES.map((c) => (
        <div key={c} className="excat">
          <div className="muted small catname">{c}</div>
          <ul className="edlist">
            {s.exercises[c].map((name, i) => (
              <li key={name}>
                <span className="name">{name}</span>
                <button className={`flag ${s.unilateral.includes(name) ? 'on' : ''}`} onClick={() => toggle('unilateral', name)}>單邊</button>
                {c === '引體' ? (
                  <span className="flag on locked">自重</span>
                ) : (
                  <button className={`flag ${s.bodyweight.includes(name) ? 'on' : ''}`} onClick={() => toggle('bodyweight', name)}>自重</button>
                )}
                <button className="ic" title="改名" onClick={() => renameExercise(c, name)}>✎</button>
                <button className="ic" title="上移" onClick={() => setList(c, move(s.exercises[c], i, -1))}>↑</button>
                <button className="ic" title="下移" onClick={() => setList(c, move(s.exercises[c], i, 1))}>↓</button>
                <button className="ic" title="從清單移除（紀錄保留）" onClick={() => setList(c, s.exercises[c].filter((x) => x !== name))}>×</button>
              </li>
            ))}
          </ul>
          <div className="row gap">
            <input placeholder={`新增${c}動作`} value={newEx[c] ?? ''} onChange={(e) => setNewEx({ ...newEx, [c]: e.target.value })} />
            <button className="ghost" onClick={() => addExercise(c)}>新增</button>
          </div>
        </div>
      ))}
      <p className="muted small">✎ 改名會同步更新所有歷史紀錄，改成已存在的名稱＝合併。× 只是從清單移除，歷史紀錄會保留，加回同名動作就會接上。</p>

      <div className="row gap sticky-save">
        {dirty && <button className="ghost" onClick={() => setS(settings)}>還原</button>}
        <button className="primary grow" disabled={!dirty} onClick={save}>
          {dirty ? '儲存設定' : '設定已是最新'}
        </button>
      </div>
    </section>
  )
}
