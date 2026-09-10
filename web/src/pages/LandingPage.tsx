import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, setToken, getToken } from '../api'
import './LandingPage.css'

const TEMPLATES = ['请到办公室', '到操场集合', '放学注意安全', '明天带红领巾']

export default function LandingPage() {
  const navigate = useNavigate()
  const [msgIdx, setMsgIdx]     = useState(0)
  const [fade, setFade]         = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  // 已登录直接跳过落地页
  useEffect(() => {
    if (getToken()) navigate('/console', { replace: true })
  }, [navigate])

  // 轮播通知 mock
  useEffect(() => {
    const id = setInterval(() => {
      setFade(true)
      setTimeout(() => {
        setMsgIdx(i => (i + 1) % TEMPLATES.length)
        setFade(false)
      }, 400)
    }, 4000)
    return () => clearInterval(id)
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(username, password)
      setToken(res.token)
      navigate('/console', { replace: true })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function openModal() { setShowModal(true); setError('') }
  function closeModal() { setShowModal(false); setUsername(''); setPassword(''); setError('') }

  return (
    <div className="landing-root">

      {/* ── NAV ── */}
      <nav className="l-nav">
        <div className="l-nav-brand">
          <span className="l-nav-brand-icon">🔔</span>
          班级通知屏
        </div>
        <div className="l-nav-links">
          <a href="#features">功能</a>
          <a href="#how">使用流程</a>
          <a href="#download">下载</a>
          <button className="l-btn-enter" onClick={openModal}>进入工作台</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="l-hero">
        <div className="l-hero-text">
          <div className="l-hero-eyebrow">🚀 实时推送 · 语音播报 · 多端覆盖</div>
          <h1 className="l-hero-h1">
            让通知<em>瞬间抵达</em><br />每一块教室屏幕
          </h1>
          <p className="l-hero-sub">
            一键发送，WebSocket 实时推送，支持全屏覆盖与右下角弹窗，
            TTS 语音播报，送达状态一目了然。
          </p>
          <div className="l-hero-actions">
            <button className="l-btn-cta" onClick={openModal}>进入工作台</button>
            <a href="#download" className="l-btn-ghost">下载教室端 ↓</a>
          </div>
        </div>

        <div className="l-hero-mock">
          <div className="l-mock-bar">
            <span className="l-mock-dot" /><span className="l-mock-dot" /><span className="l-mock-dot" />
          </div>
          <div className="l-mock-screen">
            <div className="l-mock-overlay">
              <div className="l-mock-bell">🔔</div>
              <div className={`l-mock-content${fade ? ' fade' : ''}`}>
                {TEMPLATES[msgIdx]}
              </div>
            </div>
            <div className="l-mock-info">
              <span className="l-mock-publisher">王老师</span>
              <span>刚刚发布</span>
            </div>
            <div className="l-mock-progress" key={msgIdx} />
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <div className="l-stats">
        <div className="l-stats-inner">
          <div className="l-stat"><div className="l-stat-num">&lt; 1s</div><div className="l-stat-label">通知送达延迟</div></div>
          <div className="l-stat"><div className="l-stat-num">WebSocket</div><div className="l-stat-label">全双工长连接</div></div>
          <div className="l-stat"><div className="l-stat-num">Win / Mac</div><div className="l-stat-label">双平台客户端</div></div>
          <div className="l-stat"><div className="l-stat-num">TTS</div><div className="l-stat-label">语音播报支持</div></div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section className="l-section l-features-alt" id="features">
        <div className="l-section-inner">
          <div className="l-section-label">核心功能</div>
          <h2 className="l-section-title">专为教室场景设计</h2>
          <p className="l-section-sub">从通知发布到设备回执，每个细节都经过打磨。</p>
          <div className="l-features-grid">
            {[
              { icon: '⚡', title: '实时推送', desc: 'WebSocket 长连接，通知毫秒级送达；设备上线自动补发 TTL 内的未送达通知。' },
              { icon: '🔊', title: 'TTS 语音播报', desc: '使用 Web Speech API，支持配置播报次数，无需额外硬件。' },
              { icon: '✅', title: '送达回执', desc: '每台设备独立 ACK，教师端实时查看哪台屏幕已送达、哪台离线待送。' },
              { icon: '🏫', title: '多班级管理', desc: '一套服务管理多个班级，通知精准投递到指定班级的所有在线设备。' },
              { icon: '📝', title: '快捷模板', desc: '常用通知一键发送，告别重复输入；支持自定义模板内容。' },
              { icon: '💻', title: 'Windows & macOS', desc: 'Electron 打包，NSIS 安装包 / DMG 双格式，自动 CI 构建发布。' },
            ].map(f => (
              <div key={f.title} className="l-feat-card">
                <div className="l-feat-icon">{f.icon}</div>
                <div className="l-feat-title">{f.title}</div>
                <div className="l-feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="l-section" id="how">
        <div className="l-section-inner">
          <div className="l-section-label">使用流程</div>
          <h2 className="l-section-title">三步开始使用</h2>
          <p className="l-section-sub">从部署到第一条通知送达，最快五分钟。</p>
          <div className="l-flow-steps">
            {[
              { n: '1', title: '部署服务 & 登录', desc: 'Docker Compose 一键启动，登录教师工作台，创建班级。' },
              { n: '2', title: '绑定教室设备', desc: '在工作台生成 6 位绑定码，教室电脑安装客户端后输入绑定码即完成关联。' },
              { n: '3', title: '发送通知', desc: '选择班级，输入内容或选快捷模板，点击发送——通知即刻出现在教室屏幕上。' },
            ].map(s => (
              <div key={s.n} className="l-flow-step">
                <div className="l-flow-num">{s.n}</div>
                <div>
                  <div className="l-flow-title">{s.title}</div>
                  <div className="l-flow-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARISON ── */}
      <section className="l-section l-compare-alt">
        <div className="l-section-inner">
          <div className="l-section-label">显示模式</div>
          <h2 className="l-section-title">全屏覆盖 或 角落弹窗</h2>
          <p className="l-section-sub">根据通知紧急程度自由选择，互不干扰。</p>
          <div className="l-compare-grid">
            <div className="l-compare-card">
              <div className="l-compare-screen l-compare-fullscreen">
                <span className="l-cmp-bell">🔔</span>
                <span className="l-cmp-text">请到操场集合</span>
                <span className="l-cmp-sub">王老师 · 全体通知</span>
                <div className="l-cmp-bar" />
              </div>
              <div className="l-compare-info">
                <div className="l-compare-name">全屏覆盖</div>
                <div className="l-compare-desc">强制注意力，适合紧急或重要通知；TTS 语音播报，可配置显示时长。</div>
                <div className="l-compare-tags">
                  <span className="l-tag">紧急通知</span>
                  <span className="l-tag">全班注意</span>
                  <span className="l-tag">语音播报</span>
                </div>
              </div>
            </div>
            <div className="l-compare-card">
              <div className="l-compare-screen l-compare-toast">
                <div className="l-toast-mock">
                  <div className="l-toast-mock-top">
                    <span className="l-toast-mock-icon">🔔</span>
                    <span className="l-toast-mock-name">班级通知屏 · 王老师</span>
                  </div>
                  <div className="l-toast-mock-text">放学注意安全，排队有序离校。</div>
                  <div className="l-toast-mock-bar" />
                </div>
              </div>
              <div className="l-compare-info">
                <div className="l-compare-name">右下角弹窗</div>
                <div className="l-compare-desc">非侵入式提醒，不打断正在进行的课堂活动；自动淡出，轻量不干扰。</div>
                <div className="l-compare-tags">
                  <span className="l-tag">日常提醒</span>
                  <span className="l-tag">非侵入式</span>
                  <span className="l-tag">自动消失</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DOWNLOAD ── */}
      <section className="l-section l-download-alt" id="download">
        <div className="l-section-inner">
          <div className="l-section-label">下载客户端</div>
          <h2 className="l-section-title">安装教室端，完成最后一步</h2>
          <p className="l-section-sub" style={{ margin: '0 auto' }}>
            在教室电脑上安装客户端，与服务器绑定后即可接收通知。
          </p>
          <div className="l-download-btns">
            <a className="l-dl-btn" href="https://cnb.992498.xyz/downloads/%E7%8F%AD%E7%BA%A7%E9%80%9A%E7%9F%A5%E5%B1%8F-Setup-v1.0.6.exe" download>
              <span className="l-dl-btn-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 2.9L8.3 1.9V9.4H1V2.9Z" fill="#00A4EF" />
                  <path d="M9.2 1.8L19 0.4V9.3H9.2V1.8Z" fill="#00A4EF" />
                  <path d="M1 10.3H8.3V17.8L1 16.8V10.3Z" fill="#00A4EF" />
                  <path d="M9.2 10.3H19V19.3L9.2 17.9V10.3Z" fill="#00A4EF" />
                </svg>
              </span>
              <span className="l-dl-btn-meta">
                <span>Windows 版</span>
                <span className="l-dl-btn-sub">NSIS 安装包 · x64</span>
              </span>
            </a>
            <div className="l-dl-btn l-dl-btn-muted">
              <span className="l-dl-btn-icon"></span>
              <span className="l-dl-btn-meta">
                <span>macOS / 麒麟 / 统信 UOS 版</span>
                <span className="l-dl-btn-sub">其他系统版本，请联系管理员获取</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="l-footer">
        <div className="l-footer-inner">
          <div className="l-footer-brand">🔔 班级通知屏</div>
          <div className="l-footer-copy">© 2026 班级通知屏. MIT License.</div>
          <div className="l-footer-cta">
            <a className="l-footer-link" href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
            <button className="l-btn-enter" onClick={openModal}>进入工作台 →</button>
          </div>
        </div>
      </footer>

      {/* ── LOGIN MODAL ── */}
      {showModal && (
        <div className="l-modal-mask" onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="l-modal">
            <button className="l-modal-close" onClick={closeModal}>✕</button>
            <div className="l-modal-logo">🔔</div>
            <div className="l-modal-title">登录工作台</div>
            <div className="l-modal-sub">使用教师账号登录，管理班级与通知</div>
            <form onSubmit={handleLogin}>
              <div className="l-modal-group">
                <label className="l-modal-label">账号名</label>
                <input
                  className="l-modal-input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="请输入账号名"
                  required minLength={3}
                  autoComplete="username"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus() } }}
                />
              </div>
              <div className="l-modal-group">
                <label className="l-modal-label">密码</label>
                <input
                  className="l-modal-input"
                  type="password"
                  ref={passwordRef}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  required minLength={6}
                  autoComplete="current-password"
                />
              </div>
              {error && <div className="l-modal-error">{error}</div>}
              <button className="l-modal-submit" type="submit" disabled={loading}>
                {loading ? '登录中…' : '登录'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
