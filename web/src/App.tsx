import { useState, useEffect } from 'react'
import type { Teacher } from './api'
import { getToken, getMe, clearToken } from './api'
import AuthPage from './pages/AuthPage'
import WorkspacePage from './pages/WorkspacePage'
import AdminPage from './pages/AdminPage'

type Page = 'workspace' | 'admin'

export default function App() {
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [checking, setChecking] = useState(true)
  const [page, setPage] = useState<Page>('workspace')

  useEffect(() => {
    if (!getToken()) { setChecking(false); return }
    getMe()
      .then(t => setTeacher(t))
      .catch(() => clearToken())
      .finally(() => setChecking(false))
  }, [])

  function handleLogout() {
    setTeacher(null)
    setPage('workspace')
  }

  if (checking) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-tertiary)' }}>
      加载中…
    </div>
  )

  if (!teacher) return <AuthPage onAuth={t => setTeacher(t)} />

  if (page === 'admin' && teacher.isAdmin) {
    return (
      <AdminPage
        teacher={teacher}
        onBack={() => setPage('workspace')}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <WorkspacePage
      teacher={teacher}
      onLogout={handleLogout}
      onAdmin={teacher.isAdmin ? () => setPage('admin') : undefined}
    />
  )
}
