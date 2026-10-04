import { useEffect, useState } from 'react'

export function Clock({ format = 'HH:mm', intervalMs = 60000 }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  const h = now.getHours()
  const m = now.getMinutes()
  const formatted = format.replace('HH', String(h).padStart(2, '0')).replace('mm', String(m).padStart(2, '0'))

  return <span className="clock">{formatted}</span>
}