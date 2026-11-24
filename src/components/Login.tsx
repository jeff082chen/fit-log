import { useState } from 'react'
import { supabase } from '../db'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password: pw })
        : await supabase.auth.signUp({ email, password: pw })
    setBusy(false)
    if (error) setMsg(translate(error.message))
    else if (mode === 'up' && !data.session) setMsg('帳號已建立，但需要驗證信。請到 Supabase 關閉「Confirm email」，或點信中的連結後再登入。')
  }

  return (
    <div className="login">
      <h1>Fit Log</h1>
      <p className="muted">重訓與身體組成紀錄</p>
      <form onSubmit={submit} className="card">
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          密碼
          <input
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            minLength={6}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? '處理中…' : mode === 'in' ? '登入' : '建立帳號'}
        </button>
        {msg && <p className="error">{msg}</p>}
      </form>
      <button className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? '第一次使用？建立帳號' : '已經有帳號？登入'}
      </button>
    </div>
  )
}

function translate(m: string): string {
  if (/Invalid login credentials/i.test(m)) return 'Email 或密碼錯誤'
  if (/already registered/i.test(m)) return '這個 Email 已經註冊過了，請直接登入'
  if (/Signups not allowed/i.test(m)) return '已關閉註冊新帳號'
  if (/Email not confirmed/i.test(m)) return '這個帳號還沒完成 Email 驗證'
  return m
}
