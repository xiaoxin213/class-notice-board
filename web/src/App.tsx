import { useState, useEffect } from 'react'
import type { Teacher } from './api'
import { getToken, getMe, clearToken } from './api'
import AuthPage from './pages/AuthPage'
import WorkspacePage from './pages/WorkspacePage'

export default function App() {
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!getToken()) { setChecking(false); return }
    getMe()
      .then(t => setTeacher(t))
      .catch(() => clearToken())
      .finally(() => setChecking(false))
  }, [])

  if (checking) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-tertiary)' }}>
      加载中…
    </div>
  )

  if (!teacher) return <AuthPage onAuth={t => setTeacher(t)} />

  return <WorkspacePage teacher={teacher} onLogout={() => setTeacher(null)} />
}
