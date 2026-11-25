import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { loadAll, supabase } from './db'
import { DEFAULT_SETTINGS, type BodyMetric, type DailyLog, type Settings, type Workout } from './types'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Training from './components/Training'
import Body from './components/Body'
import DataPage from './components/DataPage'

export interface AppData {
  workouts: Workout[]
  logs: DailyLog[]
  body: BodyMetric[]
  settings: Settings
}

export interface PageProps {
  data: AppData
  reload: () => Promise<void>
  run: (fn: () => Promise<unknown>, okMsg?: string) => Promise<boolean>
}

const TABS = [
  { id: 'dash', label: '看板', icon: '◎' },
  { id: 'train', label: '訓練', icon: '🏋' },
  { id: 'body', label: '身體', icon: '⚖' },
  { id: 'data', label: '資料', icon: '⇅' },
] as const
type Tab = (typeof TABS)[number]['id']

const EMPTY: AppData = { workouts: [], logs: [], body: [], settings: DEFAULT_SETTINGS }

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>(() => (localStorageGet('tab') as Tab) || 'dash')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const busy = useRef(false)
  const show = useCallback((msg: string, err = false) => {
    setToast({ msg, err })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), err ? 5000 : 2000)
  }, [])

  const reload = useCallback(async () => {
    try {
      setData(await loadAll())
    } catch (e) {
      show(`讀取失敗：${(e as Error).message}`, true)
    }
  }, [show])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    reload().finally(() => setLoading(false))
  }, [session?.user.id, reload])

  const run = useCallback(
    async (fn: () => Promise<unknown>, okMsg?: string) => {
      // 上一個動作還在處理時忽略（避免連點造成重複紀錄）
      if (busy.current) return false
      busy.current = true
      try {
        await fn()
        await reload()
        if (okMsg) show(okMsg)
        return true
      } catch (e) {
        await reload() // 部分成功時也要讓畫面和雲端一致
        show(`失敗：${(e as Error).message}`, true)
        return false
      } finally {
        busy.current = false
      }
    },
    [reload, show],
  )

  const go = (t: Tab) => {
    setTab(t)
    localStorageSet('tab', t)
    window.scrollTo(0, 0)
  }

  if (session === undefined) return <div className="center muted">載入中…</div>
  if (!session) return <Login />

  const props: PageProps = { data, reload, run }
  return (
    <div className="app">
      <main>
        {loading ? (
          <div className="center muted">讀取資料中…</div>
        ) : tab === 'dash' ? (
          <Dashboard {...props} />
        ) : tab === 'train' ? (
          <Training {...props} />
        ) : tab === 'body' ? (
          <Body {...props} />
        ) : (
          <DataPage {...props} email={session.user.email ?? ''} />
        )}
      </main>
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
            <span className="ic">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function localStorageGet(k: string): string | null {
  try {
    return localStorage.getItem(`fitlog.${k}`)
  } catch {
    return null
  }
}
function localStorageSet(k: string, v: string): void {
  try {
    localStorage.setItem(`fitlog.${k}`, v)
  } catch {
    /* ignore */
  }
}
