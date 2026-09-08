# 班级通知屏

> 教室实时通知推送系统 — 让重要通知秒达每一块屏幕

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docs.docker.com/compose/)
[![Electron](https://img.shields.io/badge/Electron-客户端-47848F?logo=electron)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-服务端-339933?logo=node.js)](https://nodejs.org/)

---

## 目录

- [功能状态](#功能状态)
- [技术架构](#技术架构)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [前端路由](#前端路由)
- [配置说明](#配置说明)
- [客户端打包](#客户端打包)
- [完整 API 参考](#完整-api-参考)
- [WebSocket 协议](#websocket-协议)
- [SSE 事件流](#sse-事件流)
- [数据库结构](#数据库结构)
- [开发指南](#开发指南)
- [CI/CD 流程](#cicd-流程)
- [常见问题](#常见问题)

---

## 功能状态

### ✅ 已完成

| 功能 | 说明 |
|------|------|
| 实时推送 | WebSocket 长连接，通知 < 1s 送达 |
| 设备补发 | 设备上线时自动补投 TTL 内未送达通知 |
| TTS 语音播报 | Web Speech API，可配置播报次数 |
| 送达回执 | 每台设备独立 ACK，教师端可见送达状态 |
| 双显示模式 | 全屏覆盖（重要）+ 右下角弹窗（提醒） |
| 手动关闭通知 | 全屏/弹窗均支持点击 ✕ 或空白处关闭 |
| 快捷模板 | 工作台一键发送常用通知 |
| 多班级管理 | 一套服务管理多班级，精准投递 |
| 6 位绑定码 | 安全关联教室设备到班级，有 TTL 限制 |
| 设备管理 | 查看在线状态、重命名、删除设备 |
| 管理后台 | 教师账号管理、邀请码、系统统计 |
| 产品落地页 | `/` 路径展示落地页，含登录入口 |
| 工作台路由 | `/console` 进入教师工作台 |
| Windows 打包 | NSIS 安装包，CI 自动构建 |
| macOS 打包 | DMG（x64 + arm64），GitHub Actions 手动触发 |
| 版本自动递增 | 每次 push 自动 `npm version patch` + tag |
| Docker 部署 | `docker compose up -d` 一键启动 |

### 🔲 待完成 / 规划中

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 教室端自动更新 | 高 | electron-updater 检查新版本并静默更新 |
| 通知撤回 | 中 | 教师发出后可在 TTL 内撤回，客户端隐藏 |
| 班级助教角色 | 中 | 多教师协同管理同一班级 |
| 图片/附件通知 | 中 | 支持在通知中附带图片展示 |
| 通知定时发送 | 低 | 提前设定发送时间，定时触发 |
| macOS 代码签名 | 低 | Apple 开发者证书公证，免 Gatekeeper 警告 |
| 移动端适配 | 低 | 教师工作台适配手机操作 |
| 通知声音自定义 | 低 | 支持上传自定义提示音替换 TTS |

### 💡 可优化项

| 项目 | 说明 |
|------|------|
| 客户端重连策略 | 目前使用指数退避，可加上网络恢复事件触发立即重连 |
| 通知历史分页 | 当前一次全量拉取，历史多时需分页 |
| SSE 断线重连 | EventSource 原生支持，但错误处理可更健壮 |
| 模板持久化 | 快捷模板当前硬编码，可存 DB 支持教师自定义 |
| 设备分组 | 同班级多台设备可按区域/用途分组管理 |
| 通知优先级 | 区分紧急/普通，客户端按优先级决定展示方式 |
| 服务端测试 | 缺少单元/集成测试，核心逻辑（notices.js）应补充 |
| 前端路由守卫 | `/console` 直接访问时若未登录应重定向到 `/`（当前已通过 ConsolePage 内部处理） |

---

## 技术架构

```
                        ┌──────────────────────────────────┐
                        │           浏览器 (教师)            │
                        │  React 19 + TypeScript + Vite     │
                        │                                    │
                        │  /           落地页 (LandingPage)  │
                        │  /console    工作台 (WorkspacePage) │
                        │  /console    管理后台 (AdminPage)   │
                        └──────┬──────────────┬─────────────┘
                               │ REST API      │ SSE /api/events
                               │ HTTP          │ (通知 ACK 推送)
                        ┌──────▼──────────────▼─────────────┐
                        │         服务端 (Node.js)            │
                        │  Fastify + better-sqlite3           │
                        │                                    │
                        │  auth.js    scrypt 密码 / HMAC token│
                        │  notices.js 发布 / 分发 / ACK       │
                        │  hub.js     WS 连接集线器            │
                        │  db.js      SQLite 初始化            │
                        └──────────────┬─────────────────────┘
                                       │ WebSocket /ws
                                       │ (长连接推送)
              ┌────────────────────────▼──────────────────────┐
              │              教室客户端 (Electron)              │
              │  main.js      主进程：WS 连接、窗口管理、托盘   │
              │  preload.js   IPC bridge → window.cnb API      │
              │  overlay.html 全屏通知（BrowserWindow）         │
              │  toast.html   右下角弹窗（BrowserWindow）       │
              │  index.html   设置页（绑定码 / 服务器地址）      │
              │                                               │
              │  Windows x64 (NSIS) / macOS x64 + arm64 (DMG) │
              └───────────────────────────────────────────────┘
```

**数据流（发送一条通知）：**

```
教师点击发送
  → POST /api/notices
    → notices.js publishNotice()
      → 写 notice 表（status=pending）
      → hub.onlineDeviceIds(classId) 取在线设备
        → hub.sendToDevice() 推 WS 帧
          → 写 notice_delivery（status=sent）
      → 返回 { sentTo: N }
教师端 SSE /api/events 收到 notice_ack 事件
  ← 教室客户端展示通知后发 notice_ack WS 帧
    ← ackNotice() 更新 notice_delivery(status=delivered)
      ← 若全部设备已 ACK → notice.status=delivered
        ← hub.notifyClassTeachers() 推 SSE
```

---

## 目录结构

```
notice/
├── server/
│   ├── src/
│   │   ├── app.js          # Fastify 主入口，路由注册
│   │   ├── auth.js         # scrypt 密码、HMAC token、绑定码
│   │   ├── notices.js      # 通知发布/分发/ACK/过期清理
│   │   ├── hub.js          # WebSocket 连接集线器
│   │   └── db.js           # SQLite schema 初始化
│   ├── package.json
│   └── Dockerfile
│
├── web/
│   ├── index.html          # Vite 入口（含 Google Fonts）
│   ├── src/
│   │   ├── main.tsx        # BrowserRouter 挂载
│   │   ├── App.tsx         # 路由表：/ → Landing, /console → Console
│   │   ├── api/index.ts    # 所有 REST API 调用封装
│   │   ├── hooks/useSSE.ts # SSE 监听 hook
│   │   ├── styles/
│   │   │   ├── global.css  # 全局重置 + 公共组件类
│   │   │   └── tokens.css  # 设计 token（颜色/圆角/阴影）
│   │   └── pages/
│   │       ├── LandingPage.tsx   # 产品落地页（/）
│   │       ├── LandingPage.css   # 落地页专属样式（作用域隔离）
│   │       ├── ConsolePage.tsx   # 工作台路由容器（/console）
│   │       ├── AuthPage.tsx      # 登录 / 注册
│   │       ├── WorkspacePage.tsx # 主工作台
│   │       └── AdminPage.tsx     # 管理后台（isAdmin 可见）
│   ├── package.json
│   └── vite.config.ts      # 代理 /api → :3210, /ws → :3210
│
├── classroom/
│   ├── main.js             # 主进程
│   ├── preload.js          # IPC bridge
│   ├── renderer/
│   │   ├── overlay.html    # 全屏通知
│   │   ├── toast.html      # 右下角弹窗
│   │   └── index.html      # 设置页
│   ├── assets/
│   │   ├── icon.png        # 1024×1024 PNG（macOS 必需）
│   │   └── icon.ico        # Windows 托盘图标
│   └── package.json        # 含 build/build:mac/release/release:mac
│
├── docker-compose.yml
├── .github/workflows/
│   ├── docker-publish.yml  # push→main 触发：服务端镜像 + Win 安装包
│   └── build-mac.yml       # 手动触发：macOS DMG
├── AGENTS.md               # AI 开发注意事项（坑点备忘）
└── README.md
```

---

## 快速开始

### 部署服务端

```bash
git clone https://github.com/<your-org>/notice.git && cd notice
cp .env.example .env   # 编辑 .env，填写 JWT_SECRET 和 ADMIN_PASSWORD
docker compose up -d
```

服务默认监听 `:3000`（HTTP + WebSocket）。

#### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 监听端口 |
| `JWT_SECRET` | **必填** | 教师 Token 签名密钥 |
| `ADMIN_PASSWORD` | **必填** | 管理员初始密码 |
| `NOTICE_TTL_SECONDS` | `300` | 通知存活时长（补发窗口） |
| `TOKEN_TTL_SECONDS` | `86400` | 教师 JWT 有效期（秒） |
| `BIND_CODE_TTL_SECONDS` | `300` | 设备绑定码有效期（秒） |

### 安装教室客户端

1. 从 GitHub Releases 下载安装包（Windows `.exe` / macOS `.dmg`）
2. 安装后应用最小化到系统托盘
3. 在设置页填写服务器地址（如 `http://192.168.1.100:3000`）
4. 工作台 → 班级 → 生成绑定码 → 客户端输入 6 位码完成绑定

---

## 前端路由

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `LandingPage` | 产品落地页，含登录弹窗 |
| `/console` | `ConsolePage → WorkspacePage` | 教师工作台（需登录） |
| `/console` | `ConsolePage → AdminPage` | 管理后台（isAdmin） |
| `/console` | `ConsolePage → AuthPage` | 未登录时展示登录/注册 |
| `/*` | `Navigate to /` | 其他路径重定向落地页 |

**登录流程：**
- 落地页点击"进入工作台" → 弹出登录框
- 登录成功 `setToken()` + `navigate('/console')`
- 已有 token 直接访问 `/` → 自动跳转 `/console`

---

## 配置说明

### 客户端持久化（electron-store）

| 键 | 说明 |
|----|------|
| `serverUrl` | 服务器地址 |
| `deviceToken` | 绑定后获取的长期令牌 |
| `classId` | 已绑定的班级 ID |

### `window.cnb` API（preload.js 暴露）

```js
window.cnb.config.get()              // 读取客户端配置
window.cnb.config.save(obj)          // 保存配置
window.cnb.device.bind(code)         // 凭绑定码注册设备
window.cnb.ws.status()               // 获取 WS 连接状态
window.cnb.on(channel, fn)           // 监听 IPC 事件
window.cnb.notifyDone(noticeId)      // 通知展示完成（触发 ACK）
```

---

## 客户端打包

### classroom/package.json scripts

| 命令 | 说明 |
|------|------|
| `npm start` | 开发运行 |
| `npm run build` | 构建 Windows 安装包（不递增版本） |
| `npm run release` | 递增版本号 + 构建 Windows 安装包 |
| `npm run build:mac` | 构建 macOS DMG（需 macOS 环境） |
| `npm run release:mac` | 递增版本号 + 构建 macOS DMG |

### macOS 在 Windows 上构建

electron-builder 无法在 Windows 交叉编译 macOS 包。解决方案：

1. 仓库 → Actions → **Build macOS DMG** → Run workflow
2. 约 3–5 分钟后下载 `classroom-mac-dmg` Artifact
3. 内含 x64 和 arm64 两个 DMG 文件

---

## 完整 API 参考

所有接口以 `/api` 为前缀。教师接口需携带：`Authorization: Bearer <token>`

### 认证

| 方法 | 路径 | Auth | 说明 |
|------|------|------|------|
| `POST` | `/api/auth/login` | 否 | 登录，返回 token + teacher |
| `POST` | `/api/auth/register` | 否 | 注册（需邀请码） |
| `GET` | `/api/me` | 是 | 获取当前教师信息 |

```jsonc
// POST /api/auth/login
// 请求
{ "username": "teacher01", "password": "••••••" }
// 响应
{ "token": "eyJ...", "teacher": { "id": 1, "username": "teacher01", "displayName": "王老师", "isAdmin": false } }

// POST /api/auth/register
// 请求
{ "username": "teacher02", "password": "••••••", "displayName": "李老师", "inviteCode": "ABC123" }
// 响应（同 login）
```

### 班级

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/classes` | 获取我的班级列表 |
| `POST` | `/api/classes` | 创建班级 |
| `PATCH` | `/api/classes/:id` | 重命名班级 |
| `DELETE` | `/api/classes/:id` | 删除班级 |

```jsonc
// GET /api/classes 响应
{ "max": 10, "classes": [{ "id": 1, "name": "三年级一班", "role": "owner", "online": 3 }] }

// POST /api/classes 请求
{ "name": "三年级一班" }
```

### 设备

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/classes/:id/bind-code` | 生成 6 位绑定码（5 分钟有效） |
| `POST` | `/api/devices/bind` | 设备凭绑定码注册，获取 deviceToken |
| `GET` | `/api/classes/:id/devices` | 获取班级设备列表 |
| `PATCH` | `/api/classes/:id/devices/:did` | 重命名设备 |
| `DELETE` | `/api/classes/:id/devices/:did` | 删除设备 |
| `POST` | `/api/classes/:id/sound-test` | 向在线设备发声音测试 |

```jsonc
// POST /api/classes/1/bind-code 响应
{ "code": "123456", "expireAt": 1720000300 }

// POST /api/devices/bind 请求
{ "code": "123456", "name": "教室前屏" }
// 响应
{ "deviceToken": "abc...xyz", "classId": 1, "deviceId": 5 }

// GET /api/classes/1/devices 响应
{ "devices": [{ "id": 5, "name": "教室前屏", "last_seen_at": 1720000200, "online": true }] }
```

### 通知

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/notices` | 发送通知 |
| `GET` | `/api/notices?classId=` | 获取通知历史 |
| `GET` | `/api/events?classId=` | SSE 实时事件流 |

```jsonc
// POST /api/notices 请求
{
  "classId": 1,
  "content": "请到操场集合",
  "displaySeconds": 10,
  "speakTimes": 2
}
// 响应
{ "id": 42, "sentTo": 3, "online": 3 }

// GET /api/notices?classId=1 响应
{ "notices": [{ "id": 42, "content": "...", "status": "delivered", "created_at": 1720000100, "display_seconds": 10, "speak_times": 2, "publisher": "王老师" }] }
```

### 管理后台（isAdmin 权限）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/admin/stats` | 教师列表 + 在线统计 |
| `GET` | `/api/admin/settings` | 系统设置（邀请码等） |
| `PUT` | `/api/admin/settings` | 更新系统设置 |
| `PATCH` | `/api/admin/teachers/:id` | 修改教师信息/密码 |
| `PATCH` | `/api/admin/teachers/:id/disabled` | 启用/禁用教师账号 |
| `DELETE` | `/api/admin/teachers/:id` | 删除教师 |
| `GET` | `/api/admin/downloads` | 获取客户端下载文件列表 |

---

## WebSocket 协议

**设备连接：** `ws://<host>/ws?deviceToken=<token>`

### 服务端 → 设备

```jsonc
// 推送通知
{
  "type": "notice",
  "id": 42,
  "content": "请到操场集合",
  "publisher": "王老师",
  "publishedAt": 1720000100,
  "displaySeconds": 10,
  "speakTimes": 2,
  "expireAt": 1720000400
}

// 心跳
{ "type": "ping" }
```

### 设备 → 服务端

```jsonc
// 通知已展示回执
{ "type": "notice_ack", "noticeId": 42 }

// 心跳响应
{ "type": "pong" }
```

---

## SSE 事件流

**连接：** `GET /api/events?classId=<id>`（需 Auth header）

教师端收到的事件类型：

```jsonc
// 设备 ACK 回执
{
  "type": "notice_ack",
  "noticeId": 42,
  "classId": 1,
  "deviceId": 5,
  "allDelivered": false
}

// 设备上线/离线（如实现）
{ "type": "device_online",  "deviceId": 5 }
{ "type": "device_offline", "deviceId": 5 }
```

---

## 数据库结构

```sql
-- 教师账号
teacher (id, username, password_hash, display_name, is_admin, disabled, created_at)

-- 班级
class (id, name, teacher_id, created_at)

-- 教室设备
device (id, class_id, name, token_hash, last_seen_at, created_at)

-- 通知
notice (
  id, class_id, publisher_id, content,
  display_seconds, speak_times,
  expire_at,                    -- Unix 秒，TTL 截止
  status,                       -- 'pending' | 'delivered' | 'expired'
  created_at
)

-- 投递记录（每设备一行）
notice_delivery (
  notice_id, device_id,
  status,     -- 'sent' | 'delivered'
  acked_at    -- NULL 直到收到 ACK
)
-- 唯一约束：(notice_id, device_id)
```

**通知生命周期：**

```
发布 → pending
  ├─ 在线设备：dispatch → notice_delivery(sent)
  │     设备 ACK → notice_delivery(delivered)
  │       全部 ACK → notice(delivered)
  └─ 设备上线时：deliverPending() 补投 TTL 内未投递的
定时任务：expireStaleNotices() → pending 且超 expire_at → expired
```

---

## 开发指南

### 本地启动

```bash
# 服务端（热重载）
cd server && npm install && npm run dev

# 教师工作台
cd web && npm install && npm run dev   # http://localhost:5173

# 教室客户端
cd classroom && npm install && npm start
```

Vite 代理配置（`web/vite.config.ts`）：
- `/api/*` → `http://localhost:3210`
- `/ws` → `ws://localhost:3210`

### 添加通知模板

`web/src/pages/LandingPage.tsx` 和 `WorkspacePage.tsx` 各有一份 `TEMPLATES` 数组，两处同步修改：

```ts
const TEMPLATES = ['请到办公室', '到操场集合', '放学注意安全', '明天带红领巾', /* 新增 */]
```

### 通知数据帧结构

`overlay.html` / `toast.html` 通过 `window.cnb.on('notice', fn)` 接收：

```ts
interface NoticeFrame {
  type: 'notice'
  id: number
  content: string
  publisher: string
  publishedAt: number   // Unix 秒
  displaySeconds: number
  speakTimes: number
  expireAt: number      // Unix 秒
}
```

---

## CI/CD 流程

### `docker-publish.yml`（push to main 自动触发）

1. 检出代码，配置 git 用户
2. `npm version patch --no-git-tag-version` 递增 classroom 版本
3. `electron-builder --win --x64` 构建 Windows 安装包
4. 构建服务端 Docker 镜像，推送到 GHCR
5. 提交版本变更 `[skip ci]`，创建并推送 git tag
6. 上传 Windows 安装包为 Artifact（30 天保留）

### `build-mac.yml`（手动触发）

- 在 `macos-latest` runner 上执行
- 运行 `npm run build:mac`（electron-builder --mac --x64 --arm64）
- 上传 Artifact `classroom-mac-dmg`（30 天保留）

---

## 常见问题

**Q：教室客户端连接后图标仍为灰色？**
A：检查服务器地址局域网可达性、防火墙端口（默认 3000）。

**Q：通知发出但设备未收到？**
A：查看工作台送达状态。若"待送达"表示设备离线，上线后 TTL 内自动补发。

**Q：全屏通知如何关闭？**
A：点击屏幕任意空白处或右上角 ✕ 按钮；或等待 displaySeconds 自动消失。

**Q：macOS 提示"无法验证开发者"？**
A：右键应用 → 打开 → 再次点击"打开"，绕过 Gatekeeper。

**Q：`npm run build:mac` 报错？**
A：必须在 macOS 环境运行，Windows 本地无法交叉编译。用 GitHub Actions 的 Build macOS DMG 工作流。

**Q：版本号没有自动递增？**
A：自动递增发生在 CI（push to main）。本地手动构建用 `npm run release`。
