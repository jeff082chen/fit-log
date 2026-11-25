import { useEffect, useState } from 'react'
import { todayStr } from './logic'

/** 今天的日期；App 放在背景跨過午夜後回到前景也會更新 */
export function useToday(): string {
  const [today, setToday] = useState(todayStr())
  useEffect(() => {
    const update = () => setToday(todayStr())
    const id = setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
    }
  }, [])
  return today
}

/** 記錄用的日期：沒有手動選的話永遠是「今天」（跨午夜自動換日） */
export function useRecordDate(): [string, (d: string) => void, string] {
  const today = useToday()
  const [picked, setPicked] = useState<string | null>(null)
  const date = picked && picked < today ? picked : today
  return [date, (d: string) => setPicked(!d || d >= today ? null : d), today]
}
