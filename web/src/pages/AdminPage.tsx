import { useState, useEffect, useCallback } from 'react'
import type { Teacher, AdminTeacherStat, AdminSettings } from '../api'
import {
  getAdminStats, getAdminSettings, updateAdminSettings, clearToken,
  updateTeacher, setTeacherDisabled, deleteTeacher, getAdminDownloads,
} from '../api'
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
  const [downloads, setDownloads] = useState<{ name: string; url: string }[]>([])
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  // 编辑用户弹窗状态
  const [editTarget, setEditTarget] = useState<AdminTeacherStat | null>(null)
  const [editName, setEditName]     = useState('')
  const [editPass, setEditPass]     = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const load = useCallback(async () => {
    setStatsLoading(true)
    try {
      const [s, cfg, dl] = await Promise.all([
        getAdminStats(),
        getAdminSettings(),
        getAdminDownloads(),
      ])
      setStats(s)
      setSettings(cfg)
      setCodeInput(cfg.inviteCode)
      setDownloads(dl.files)
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

  function copyLink() {
    const code = settings?.inviteCode
    const url = code
      ? `${window.location.origin}/?invite=${encodeURIComponent(code)}`
      : window.location.origin
    navigator.clipboard.writeText(url)
    setHint({ msg: '链接已复制', ok: true })
  }

  function copyDownloadLink(url: string) {
    const full = url.startsWith('http') ? url : `${window.location.origin}${url}`
    navigator.clipboard.writeText(full)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  function handleLogout() {
    clearToken()
    onLogout()
  }

  // ---- 编辑用户 ----
  function openEdit(t: AdminTeacherStat) {
    setEditTarget(t)
    setEditName(t.displayName)
    setEditPass('')
    setHint(null)
  }

  function closeEdit() {
    setEditTarget(null)
    setEditName('')
    setEditPass('')
  }

  async function saveEdit() {
    if (!editTarget) return
    const nameTrimmed = editName.trim()
    const passTrimmed = editPass.trim()
    if (!nameTrimmed) { setHint({ msg: '姓名不能为空', ok: false }); return }
    setEditSaving(true); setHint(null)
    try {
      const patch: { displayName?: string; password?: string } = {}
      if (nameTrimmed !== editTarget.displayName) patch.displayName = nameTrimmed
      if (passTrimmed) patch.password = passTrimmed
      if (Object.keys(patch).length > 0) await updateTeacher(editTarget.id, patch)
      closeEdit()
      setHint({ msg: '修改已保存', ok: true })
      load()
    } catch (e: any) {
      setHint({ msg: e.message, ok: false })
    } finally {
      setEditSaving(false)
    }
  }

  // ---- 停用 / 启用 ----
  async function handleDisable(t: AdminTeacherStat) {
    const action = t.disabled ? '启用' : '停用'
    if (!window.confirm(`确认${action}用户「${t.displayName}」？${t.disabled ? '' : '\n停用后该用户将无法登录。'}`)) return
    setHint(null)
    try {
      await setTeacherDisabled(t.id, !t.disabled)
      setHint({ msg: `已${action}「${t.displayName}」`, ok: true })
      load()
    } catch (e: any) {
      setHint({ msg: e.message, ok: false })
    }
  }

  // ---- 删除 ----
  async function handleDelete(t: AdminTeacherStat) {
    if (!window.confirm(`确认删除用户「${t.displayName}」（${t.username}）？\n此操作不可撤销，该用户的班级与设备将一并删除。`)) return
    setHint(null)
    try {
      await deleteTeacher(t.id)
      setHint({ msg: `已删除「${t.displayName}」`, ok: true })
      load()
    } catch (e: any) {
      setHint({ msg: e.message, ok: false })
    }
  }

  const inviteLink = settings?.inviteCode
    ? `${window.location.origin}/?invite=${encodeURIComponent(settings.inviteCode)}`
    : ''

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
          <div className="admin-card-title">🔑 邀请码管理</div>
          {settings === null ? (
            <div className="admin-loading">加载中…</div>
          ) : (
            <div className="admin-settings-grid">

              {/* 邀请码编辑 */}
              <div className="admin-setting-row">
                <span className="admin-setting-label">邀请码</span>
                <input
                  className="input admin-code-input"
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value.toUpperCase().slice(0, 20))}
                  placeholder="留空则禁止注册"
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
              {inviteLink && (
                <div className="admin-setting-row">
                  <span className="admin-setting-label">注册链接</span>
                  <span className="admin-invite-link">{inviteLink}</span>
                  <button className="btn-secondary" onClick={copyLink}>
                    复制链接
                  </button>
                </div>
              )}

              {!settings.inviteCode && (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  邀请码为空时，注册功能关闭。设置邀请码后，老师凭码注册。
                </p>
              )}

              {hint && (
                <div className={hint.ok ? 'admin-saved-hint' : 'admin-error-hint'}>
                  {hint.msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 注册用户 */}
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
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.teachers.map(t => {
                      const isSelf = t.username === teacher.username
                      return (
                        <tr key={t.id} className={t.disabled ? 'admin-row-disabled' : ''}>
                          <td>
                            <span>{t.displayName}</span>
                            {t.disabled && <span className="admin-disabled-badge">已停用</span>}
                            {isSelf && <span className="admin-self-badge">我</span>}
                          </td>
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
                          <td>
                            <div className="admin-row-actions">
                              <button className="btn-link" onClick={() => openEdit(t)}>编辑</button>
                              {!isSelf && (
                                <>
                                  <button
                                    className={t.disabled ? 'btn-link btn-link-green' : 'btn-link btn-link-warn'}
                                    onClick={() => handleDisable(t)}
                                  >
                                    {t.disabled ? '启用' : '停用'}
                                  </button>
                                  <button
                                    className="btn-link btn-link-danger"
                                    onClick={() => handleDelete(t)}
                                  >删除</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {stats.teachers.length === 0 && (
                      <tr><td colSpan={7} className="admin-loading">暂无注册用户</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>

        {/* 教室端下载 */}
        <div className="admin-card">
          <div className="admin-card-title">💻 教室端下载</div>
          {downloads.length > 0 ? (
            <div className="admin-download-list">
              {downloads.map(f => (
                <div key={f.name} className="admin-download-item">
                  <span className="admin-download-name">📦 {f.name}</span>
                  <div className="admin-download-actions">
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 13, padding: '6px 14px' }}
                      onClick={() => copyDownloadLink(f.url)}
                    >{copiedUrl === f.url ? '已复制 ✓' : '复制链接'}</button>
                    <a
                      href={f.url}
                      className="btn-secondary"
                      style={{ fontSize: 13, padding: '6px 14px', textDecoration: 'none' }}
                      download
                    >下载</a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="admin-download-hint">
              暂无可下载的安装包。将构建好的 <code>.exe</code> 安装包放入服务器的
              <code>web/dist/downloads/</code> 目录后，刷新此页面即可显示下载链接。
            </p>
          )}
        </div>

      </div>

      {/* 编辑用户弹窗 */}
      {editTarget && (
        <div className="admin-modal-overlay" onClick={closeEdit}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-title">编辑用户</div>
            <div className="admin-modal-sub">{editTarget.username}</div>
            <div className="admin-modal-field">
              <label className="admin-modal-label">姓名</label>
              <input
                className="input"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                disabled={editSaving}
                placeholder="显示名称"
                autoFocus
              />
            </div>
            <div className="admin-modal-field">
              <label className="admin-modal-label">新密码</label>
              <input
                className="input"
                type="password"
                value={editPass}
                onChange={e => setEditPass(e.target.value)}
                disabled={editSaving}
                placeholder="留空则不修改密码"
              />
            </div>
            {hint && !hint.ok && (
              <div className="admin-error-hint" style={{ marginBottom: 4 }}>{hint.msg}</div>
            )}
            <div className="admin-modal-actions">
              <button className="btn-secondary" onClick={closeEdit} disabled={editSaving}>取消</button>
              <button className="btn-primary" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
