import { useState, useEffect, useCallback } from 'react'
import type { Teacher, AdminTeacherStat, AdminSettings } from '../api'
import { getAdminStats, getAdminSettings, updateAdminSettings, clearToken } from '../api'
import './AdminPage.css'

interface Props {
  teacher: Teacher
  onBack: () => void
  onLogout: () => void
}

/** 生成随机 6 位大写字母+数字邀请码 */
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function AdminPage({ teacher, onBack, onLogout }: Props) {
  const [stats, setStats]       = useState<{ teachers: AdminTeacherStat[]; totalOnline: number } | null>(null)
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [saving, setSaving]     = useState(false)
  const [hint, setHint]         = useState<{ msg: string; ok: boolean } | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const load = useCallback(async () => {
    setStatsLoading(true)
    try {
      const [s, cfg] = await Promise.all([getAdminStats(), getAdminSettings()])
      setStats(s)
      setSettings(cfg)
      setCodeInput(cfg.inviteCode)
    } catch (e: any) {
      setHint({ msg: e.message, ok: false })
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveCode() {
    if (!settings) return
    setSaving(true); setHint(null)
    try {
      const updated = await updateAdminSettings({ inviteCode: codeInput.trim() })
      setSettings(updated)
      setCodeInput(updated.inviteCode)
      setHint({ msg: '邀请码已保存', ok: true })
    } catch (e: any) {
      setHint({ msg: e.message, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function toggleRegOpen(open: boolean) {
    if (!settings) return
    setSaving(true); setHint(null)
    try {
      const updated = await updateAdminSettings({ regOpen: open })
      setSettings(updated)
      setHint({ msg: open ? '注册已开放' : '注册已关闭', ok: true })
    } catch (e: any) {
      setHint({ msg: e.message, ok: false })
    } finally {
      setSaving(false)
    }
  }

  function copyLink() {
    const code = settings?.inviteCode
    const url = code
      ? `${window.location.origin}/?invite=${encodeURIComponent(code)}`
      : window.location.origin
    navigator.clipboard.writeText(url)
    setHint({ msg: '链接已复制', ok: true })
  }

  function handleLogout() {
    clearToken()
    onLogout()
  }

  const inviteLink = settings?.inviteCode
    ? `${window.location.origin}/?invite=${encodeURIComponent(settings.inviteCode)}`
    : `${window.location.origin}/（未设置邀请码，开放注册）`

  return (
    <div className="admin-root">
      <header className="admin-header">
        <div className="admin-header-left">
          <span className="admin-logo">🔔</span>
          <span className="admin-brand">班级通知屏</span>
          <span className="admin-badge">管理后台</span>
        </div>
        <div className="admin-header-right">
          <button className="btn-secondary" onClick={onBack}>← 返回工作台</button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{teacher.displayName}</span>
          <button className="btn-secondary" onClick={handleLogout}>退出登录</button>
        </div>
      </header>

      <div className="admin-body">

        {/* 注册管理 */}
        <div className="admin-card">
          <div className="admin-card-title">🔑 注册管理</div>
          {settings === null ? (
            <div className="admin-loading">加载中…</div>
          ) : (
            <div className="admin-settings-grid">

              {/* 注册开关 */}
              <div className="admin-setting-row">
                <span className="admin-setting-label">注册状态</span>
                <div className="admin-toggle-row">
                  <label className="admin-toggle">
                    <input
                      type="checkbox"
                      checked={settings.regOpen}
                      disabled={saving}
                      onChange={e => toggleRegOpen(e.target.checked)}
                    />
                    <span className="admin-toggle-track" />
                    <span className="admin-toggle-thumb" />
                  </label>
                  <span className="admin-toggle-text">
                    {settings.regOpen ? '开放注册' : '禁止注册'}
                  </span>
                </div>
              </div>

              {/* 邀请码编辑 */}
              <div className="admin-setting-row">
                <span className="admin-setting-label">邀请码</span>
                <input
                  className="input admin-code-input"
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value.toUpperCase().slice(0, 20))}
                  placeholder="留空 = 无需邀请码"
                  disabled={saving}
                />
                <div className="admin-setting-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => setCodeInput(randomCode())}
                    disabled={saving}
                    title="随机生成一个新邀请码"
                  >随机生成</button>
                  <button
                    className="btn-primary"
                    onClick={saveCode}
                    disabled={saving}
                  >{saving ? '保存中…' : '保存'}</button>
                </div>
              </div>

              {/* 注册链接 */}
              <div className="admin-setting-row">
                <span className="admin-setting-label">注册链接</span>
                <span className="admin-invite-link">{inviteLink}</span>
                <button className="btn-secondary" onClick={copyLink} disabled={!settings.inviteCode}>
                  复制链接
                </button>
              </div>

              {hint && (
                <div className={hint.ok ? 'admin-saved-hint' : 'admin-error-hint'}>
                  {hint.msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 用户统计 */}
        <div className="admin-card">
          <div className="admin-card-title">👥 注册用户</div>
          {statsLoading ? (
            <div className="admin-loading">加载中…</div>
          ) : stats ? (
            <>
              <div className="admin-stats-summary">
                共 {stats.teachers.length} 名班主任 · 全局在线设备 {stats.totalOnline} 台
                <button
                  className="btn-secondary"
                  style={{ marginLeft: 12, fontSize: 12, padding: '2px 10px' }}
                  onClick={load}
                >刷新</button>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>姓名</th>
                      <th>账号</th>
                      <th>班级数</th>
                      <th>绑定设备</th>
                      <th>在线设备</th>
                      <th>注册时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.teachers.map(t => (
                      <tr key={t.id}>
                        <td>{t.displayName}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t.username}</td>
                        <td className={t.classCount === 0 ? 'admin-zero' : ''}>{t.classCount}</td>
                        <td className={t.deviceCount === 0 ? 'admin-zero' : ''}>{t.deviceCount}</td>
                        <td>
                          {t.onlineCount > 0 ? (
                            <span className="admin-online-chip">
                              <span className="dot" />{t.onlineCount}
                            </span>
                          ) : (
                            <span className="admin-zero">—</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                          {new Date(t.createdAt * 1000).toLocaleDateString('zh-CN', {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                    {stats.teachers.length === 0 && (
                      <tr><td colSpan={6} className="admin-loading">暂无注册用户</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>

      </div>
    </div>
  )
}
