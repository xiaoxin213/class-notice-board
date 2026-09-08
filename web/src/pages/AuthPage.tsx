import { useState, useEffect } from 'react'
import type { Teacher } from '../api'
import { login, register, setToken } from '../api'
import './AuthPage.css'

interface Props { onAuth: (teacher: Teacher) => void }

export default function AuthPage({ onAuth }: Props) {
  const [tab, setTab]           = useState<'login'|'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [inviteCode, setInviteCode]   = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  // 读取 URL ?invite= 参数，自动填入邀请码并切换到注册 tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('invite')
    if (code) {
      setInviteCode(code)
      setTab('register')
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = tab === 'login'
        ? await login(username, password)
        : await register(username, password, displayName, inviteCode)
      setToken(res.token)
      onAuth(res.teacher)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <span className="auth-logo">🔔</span>
        <h1 className="auth-title">班级通知屏</h1>
        <p className="auth-tagline">一键发布 · 语音播报 · 安全可靠</p>
      </div>

      <div className="auth-card card">
        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError('') }}
          >登录</button>
          <button
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); setError('') }}
          >注册</button>
        </div>

        <form onSubmit={submit} className="auth-form">
          <div className="form-group">
            <label>账号名</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="请输入账号名" required minLength={3} autoComplete="username" />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码" required minLength={6} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />
          </div>

          {tab === 'register' && <>
            <div className="form-group">
              <label>姓名</label>
              <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="如：王老师" required />
            </div>
            <div className="form-group">
              <label>邀请码</label>
              <input className="input" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                placeholder="请输入邀请码" />
            </div>
          </>}

          {error && <p className="auth-error">{error}</p>}

          <button className="btn-primary auth-submit" type="submit" disabled={loading}>
            {loading ? '请稍候…' : tab === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <p className="auth-hint">
          {tab === 'login'
            ? <span>没有账号？<button type="button" className="link-btn" onClick={() => { setTab('register'); setError('') }}>使用邀请码注册</button></span>
            : <span>已有账号？<button type="button" className="link-btn" onClick={() => { setTab('login'); setError('') }}>返回登录</button></span>
          }
        </p>
      </div>
    </div>
  )
}
