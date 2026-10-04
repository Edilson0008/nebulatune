import { useEffect, useState } from 'react'

export function Greeting({ userName }) {
  const [hour, setHour] = useState(() => new Date().getHours())

  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60000)
    return () => clearInterval(id)
  }, [])

  const greeting = greetingForHour(hour)
  return userName ? `${greeting}, ${userName} ✦` : `${greeting} ✦`
}

function greetingForHour(h) {
  if (h >= 5 && h < 12) return 'Bom dia'
  if (h >= 12 && h < 18) return 'Boa tarde'
  return 'Boa noite'
}