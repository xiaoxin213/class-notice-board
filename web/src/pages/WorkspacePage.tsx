import { useState, useEffect, useCallback } from 'react'
import type {
  Teacher, ClassItem, Device, Notice, BindCode,
} from '../api'
import {
  getClasses, createClass, renameClass, deleteClass, genBindCode, getDevices,
  soundTest, publishNotice, getNotices, clearToken,
} from '../api'
import { useSSE } from '../hooks/useSSE'
import './WorkspacePage.css'

interface Props { teacher: Teacher; onLogout: () => void }

const DISPLAY_OPTIONS = [
  { label: '30秒', value: 30 },
  { label: '1分钟', value: 60 },
  { label: '5分钟', value: 300 },
]
const SPEAK_OPTIONS = [
  { label: '1次', value: 1 },
  { label: '2次', value: 2 },
  { label: '3次', value: 3 },
]
const TEMPLATES = ['请到办公室', '到操场集合', '带作业本来办公室', '课代表来办公室']

export default function WorkspacePage({ teacher, onLogout }: Props) {
  const [classes, setClasses]         = useState<ClassItem[]>([])
  const [maxClasses, setMaxClasses]   = useState(50)
  const [selected, setSelected]       = useState<ClassItem | null>(null)
  const [devices, setDevices]         = useState<Device[]>([])
  const [notices, setNotices]         = useState<Notice[]>([])
  const [bindCode, setBindCode]       = useState<BindCode | null>(null)
  const [content, setContent]         = useState('')
  const [displaySec, setDisplaySec]   = useState(60)
  const [speakTimes, setSpeakTimes]   = useState(2)
  const [sending, setSending]         = useState(false)
  const [sendMsg, setSendMsg]         = useState('')
  const [newName, setNewName]         = useState('')
  const [showAdd, setShowAdd]         = useState(false)
  const [editingId, setEditingId]     = useState<number|null>(null)
  const [editingName, setEditingName] = useState('')
  const [sseOk, setSseOk]             = useState(true)
  const [mobilePane, setMobilePane]   = useState<'list'|'notice'|'bind'>('list')

  // 加载班级列表
  async function loadClasses() {
    try {
      const r = await getClasses()
      setMaxClasses(r.max)
      setClasses(r.classes)
      if (!selected && r.classes.length > 0) setSelected(r.classes[0])
    } catch {}
  }

  useEffect(() => { loadClasses() }, [])

  // 切换班级时加载设备 & 通知
  useEffect(() => {
    if (!selected) return
    getDevices(selected.id).then(r => setDevices(r.devices)).catch(() => {})
    getNotices(selected.id).then(r => setNotices(r.notices)).catch(() => {})
    setBindCode(null)
  }, [selected?.id])

  // SSE 实时更新
  const handleSSE = useCallback((ev: any) => {
    setSseOk(true)
    if (ev.type === 'device_status') {
      setClasses(prev => prev.map(c => c.id === ev.classId ? { ...c, online: ev.online } : c))
      if (selected?.id === ev.classId) {
        setDevices(prev => prev.map(d => ({ ...d, online: false })))
        getDevices(ev.classId).then(r => setDevices(r.devices)).catch(() => {})
      }
    }
    if (ev.type === 'notice_ack' && ev.allDelivered) {
      setNotices(prev => prev.map(n => n.id === ev.noticeId ? { ...n, status: 'delivered' } : n))
    }
  }, [selected?.id])

  useSSE(handleSSE, true)

  // 发布通知
  async function handlePublish(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSending(true); setSendMsg('')
    try {
      const r = await publishNotice(selected.id, content, displaySec, speakTimes)
      setSendMsg(r.online > 0 ? `已发出，${r.sentTo} 台教室端在线` : '已发出（当前无教室端在线，设备上线后自动补发）')
      setContent('')
      getNotices(selected.id).then(r => setNotices(r.notices)).catch(() => {})
    } catch (err: any) {
      setSendMsg('发送失败：' + err.message)
    } finally {
      setSending(false)
    }
  }

  // 生成绑定码
  async function handleGenCode() {
    if (!selected) return
    try {
      const r = await genBindCode(selected.id)
      setBindCode(r)
    } catch (err: any) { alert(err.message) }
  }

  // 声音测试
  async function handleSoundTest() {
    if (!selected) return
    try {
      const r = await soundTest(selected.id)
      alert(r.sentTo > 0 ? `已发送声音测试到 ${r.sentTo} 台在线教室端` : '当前无在线教室端')
    } catch (err: any) { alert(err.message) }
  }

  // 新增班级
  async function handleAddClass(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      const c = await createClass(newName.trim())
      setClasses(prev => [...prev, c])
      setSelected(c)
      setNewName(''); setShowAdd(false)
    } catch (err: any) { alert(err.message) }
  }

  function handleLogout() {
    clearToken()
    onLogout()
  }

  const expireStr = bindCode
    ? new Date(bindCode.expireAt * 1000).toLocaleString('zh-CN', { hour12: false })
    : ''


  async function handleRename(c: ClassItem) {
    const name = editingName.trim()
    if (!name || name === c.name) { setEditingId(null); return }
    try {
      await renameClass(c.id, name)
      setClasses(prev => prev.map(x => x.id === c.id ? { ...x, name } : x))
      if (selected?.id === c.id) setSelected(prev => prev ? { ...prev, name } : prev)
    } catch (e: any) { alert(e.message) }
    setEditingId(null)
  }

  async function handleDelete(c: ClassItem) {
    if (!confirm(`确认删除「${c.name}」？该班级的所有设备和通知记录将一并删除。`)) return
    try {
      await deleteClass(c.id)
      const next = classes.filter(x => x.id !== c.id)
      setClasses(next)
      if (selected?.id === c.id) setSelected(next[0] ?? null)
    } catch (e: any) { alert(e.message) }
  }

  return (
    <div className="ws-root">
      {/* 顶栏 */}
      <header className="ws-header">
        <div className="ws-header-left">
          <span className="ws-logo">🔔</span>
          <span className="ws-brand">班级通知屏</span>
        </div>
        <div className="ws-header-right">
          <span className={`ws-conn ${sseOk ? 'ok' : 'err'}`}>
            <span className={`dot ${sseOk ? 'dot-online' : 'dot-offline'}`} />
            {sseOk ? '服务已连接' : '连接断开'}
          </span>
          <span className="ws-user">{teacher.displayName}</span>
          <button className="btn-secondary ws-logout" onClick={handleLogout}>退出登录</button>
        </div>
      </header>

      {/* 移动端导航 */}
      <nav className="ws-mobile-nav">
        {(['list','notice','bind'] as const).map(p => (
          <button key={p} className={`ws-mobile-tab ${mobilePane===p?'active':''}`}
            onClick={() => setMobilePane(p)}>
            {p==='list'?'班级':p==='notice'?'发布':'教室'}
          </button>
        ))}
      </nav>

      <div className="ws-body">
        {/* 左栏：班级列表 */}
        <aside className={`ws-col ws-col-left ${mobilePane==='list'?'mobile-visible':''}`}>
          <div className="ws-col-header">
            <span className="ws-col-title">班级列表</span>
            <span className="ws-quota">{classes.length}/{maxClasses}</span>
            <button className="ws-add-btn" onClick={() => setShowAdd(v=>!v)} title="新建班级">＋</button>
          </div>

          {showAdd && (
            <form className="ws-add-form" onSubmit={handleAddClass}>
              <input className="input" value={newName} onChange={e=>setNewName(e.target.value)}
                placeholder="班级名称" autoFocus />
              <button className="btn-primary" type="submit" style={{whiteSpace:'nowrap'}}>创建</button>
            </form>
          )}

          <ul className="ws-class-list">
            {classes.map(c => (
              <li key={c.id}
                className={`ws-class-item ${selected?.id===c.id?'selected':''}`}
                onClick={() => { if (editingId !== c.id) { setSelected(c); setMobilePane('notice') } }}
              >
                <span className={`dot ${c.online>0?'dot-online':'dot-offline'}`} />
                {editingId === c.id ? (
                  <form className="ws-class-edit-form" onSubmit={e=>{e.preventDefault();handleRename(c)}}
                    onClick={e=>e.stopPropagation()}>
                    <input className="input ws-class-edit-input" autoFocus value={editingName}
                      onChange={e=>setEditingName(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Escape') setEditingId(null) }} />
                    <button type="submit" className="ws-icon-btn" title="保存">✓</button>
                    <button type="button" className="ws-icon-btn" title="取消"
                      onClick={e=>{e.stopPropagation();setEditingId(null)}}>✕</button>
                  </form>
                ) : (
                  <>
                    <span className="ws-class-name">{c.name}</span>
                    <span className="ws-class-role">{c.role==='owner'?'班主任':'兼任'}</span>
                    {c.online > 0 && <span className="ws-online-count">{c.online}台在线</span>}
                    {c.role === 'owner' && (
                      <span className="ws-class-actions" onClick={e=>e.stopPropagation()}>
                        <button className="ws-icon-btn" title="重命名"
                          onClick={()=>{ setEditingId(c.id); setEditingName(c.name) }}>✎</button>
                        <button className="ws-icon-btn ws-icon-btn-danger" title="删除"
                          onClick={()=>handleDelete(c)}>✕</button>
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
            {classes.length === 0 && <li className="ws-empty">暂无班级，点击＋创建</li>}
          </ul>
        </aside>

        {/* 中栏：发布通知 + 记录 */}
        <main className={`ws-col ws-col-center ${mobilePane==='notice'?'mobile-visible':''}`}>
          <div className="ws-col-header">
            <span className="ws-col-title">发布通知</span>
            {selected && <span className="ws-selected-class">→ {selected.name}</span>}
          </div>

          {!selected ? (
            <div className="ws-empty-hint">← 请先选择班级</div>
          ) : (
            <form className="ws-notice-form" onSubmit={handlePublish}>
              <div className="form-group">
                <label>通知内容</label>
                <textarea className="input ws-textarea" value={content}
                  onChange={e => setContent(e.target.value.slice(0,200))}
                  placeholder="输入通知内容…" rows={4} required />
                <span className="ws-counter">{content.length}/200</span>
              </div>

              <div className="ws-templates">
                {TEMPLATES.map(t => (
                  <button key={t} type="button" className="ws-tpl-chip"
                    onClick={() => setContent(t)}>{t}</button>
                ))}
              </div>

              <div className="ws-options-row">
                <div className="ws-option-group">
                  <span className="ws-option-label">显示时间</span>
                  <div className="ws-option-btns">
                    {DISPLAY_OPTIONS.map(o => (
                      <button key={o.value} type="button"
                        className={`ws-option-btn ${displaySec===o.value?'active':''}`}
                        onClick={() => setDisplaySec(o.value)}>{o.label}</button>
                    ))}
                  </div>
                </div>
                <div className="ws-option-group">
                  <span className="ws-option-label">播报次数</span>
                  <div className="ws-option-btns">
                    {SPEAK_OPTIONS.map(o => (
                      <button key={o.value} type="button"
                        className={`ws-option-btn ${speakTimes===o.value?'active':''}`}
                        onClick={() => setSpeakTimes(o.value)}>{o.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              {sendMsg && (
                <p className={`ws-send-msg ${sendMsg.startsWith('发送失败')?'err':''}`}>{sendMsg}</p>
              )}

              <button className="btn-primary ws-publish-btn" type="submit" disabled={sending || !content.trim()}>
                {sending ? '发布中…' : '立即发布'}
              </button>
            </form>
          )}

          {/* 发布记录 */}
          {notices.length > 0 && (
            <div className="ws-history">
              <div className="ws-col-header" style={{borderTop:'1px solid var(--border)',paddingTop:16}}>
                <span className="ws-col-title">发布记录</span>
              </div>
              <ul className="ws-notice-list">
                {notices.map(n => (
                  <li key={n.id} className="ws-notice-item">
                    <p className="ws-notice-content">{n.content}</p>
                    <div className="ws-notice-meta">
                      <span>{n.publisher}</span>
                      <span>{new Date(n.created_at*1000).toLocaleString('zh-CN',{hour12:false})}</span>
                      <span className={`ws-notice-status ws-status-${n.status}`}>
                        {n.status==='pending'?'待送达':n.status==='delivered'?'已送达':'已过期'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>

        {/* 右栏：教室绑定 + 在线状态 */}
        <aside className={`ws-col ws-col-right ${mobilePane==='bind'?'mobile-visible':''}`}>
          <div className="ws-col-header">
            <span className="ws-col-title">教室绑定</span>
          </div>

          {!selected ? (
            <div className="ws-empty-hint">← 请先选择班级</div>
          ) : (
            <>
              <div className="ws-bind-area">
                <p className="ws-bind-class">当前班级：<strong>{selected.name}</strong></p>

                {bindCode ? (
                  <div className="ws-code-box">
                    <p className="ws-code-label">绑定码</p>
                    <p className="ws-code">{bindCode.code}</p>
                    <p className="ws-code-expire">有效期至 {expireStr}</p>
                    <button className="btn-secondary ws-copy-btn"
                      onClick={() => { navigator.clipboard.writeText(bindCode.code); }}>
                      复制绑定码
                    </button>
                  </div>
                ) : (
                  <button className="btn-secondary ws-gen-btn" onClick={handleGenCode}>生成绑定码</button>
                )}

                <button className="btn-secondary ws-sound-btn" onClick={handleSoundTest}>🔊 声音测试</button>
              </div>

              <div className="ws-devices">
                <div className="ws-col-header" style={{padding:'12px 0 8px'}}>
                  <span className="ws-col-subtitle">教室端设备</span>
                  <button className="ws-refresh" onClick={() =>
                    getDevices(selected.id).then(r=>setDevices(r.devices)).catch(()=>{})
                  }>刷新</button>
                </div>
                {devices.length === 0
                  ? <p className="ws-empty">暂无绑定设备</p>
                  : <ul className="ws-device-list">
                      {devices.map(d => (
                        <li key={d.id} className="ws-device-item">
                          <span className={`dot ${d.online?'dot-online':'dot-offline'}`} />
                          <span className="ws-device-name">{d.name}</span>
                          <span className="ws-device-status">{d.online?'在线':'离线'}</span>
                        </li>
                      ))}
                    </ul>
                }
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
