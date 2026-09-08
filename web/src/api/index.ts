// ---- 类型 ----
export interface Teacher { id: number; username: string; displayName: string; isAdmin?: boolean }
export interface ClassItem { id: number; name: string; role: 'owner'|'assistant'; online: number }
export interface Device   { id: number; name: string; last_seen_at: number; online: boolean }
export interface Notice   {
  id: number; content: string; status: 'pending'|'delivered'|'expired';
  created_at: number; display_seconds: number; speak_times: number; publisher: string;
}
export interface BindCode { code: string; expireAt: number }

export interface AdminTeacherStat {
  id: number; username: string; displayName: string; createdAt: number;
  classCount: number; deviceCount: number; onlineCount: number;
}
export interface AdminSettings { inviteCode: string; regOpen: boolean }

// ---- 令牌存储 ----
let _token = ''
try { _token = localStorage.getItem('token') ?? '' } catch {}
export const getToken   = () => _token
export const setToken   = (t: string) => { _token = t; try { localStorage.setItem('token', t) } catch {} }
export const clearToken = () => { _token = ''; try { localStorage.removeItem('token') } catch {} }

// ---- fetch 封装 ----
async function req<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string,string> = {}
  if (body != null) headers['Content-Type'] = 'application/json'
  if (auth && _token) headers['Authorization'] = `Bearer ${_token}`

  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })
  } catch (e: any) {
    throw new Error('无法连接服务器，请确认服务端已启动')
  }

  const text = await res.text()
  let data: any
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`服务器返回异常（${res.status}）`)
  }

  if (!res.ok) throw new Error(data.error ?? `请求失败（${res.status}）`)
  return data as T
}

// ---- 账号 ----
export const login    = (username: string, password: string) =>
  req<{ token: string; teacher: Teacher }>('POST', '/api/auth/login', { username, password }, false)

export const register = (username: string, password: string, displayName: string, inviteCode: string) =>
  req<{ token: string; teacher: Teacher }>('POST', '/api/auth/register', { username, password, displayName, inviteCode }, false)

export const getMe = () => req<Teacher>('GET', '/api/me')

// ---- 班级 ----
export const getClasses  = () => req<{ max: number; classes: ClassItem[] }>('GET', '/api/classes')
export const createClass = (name: string) => req<ClassItem>('POST', '/api/classes', { name })

// ---- 教室绑定 ----
export const genBindCode = (classId: number) =>
  req<BindCode>('POST', `/api/classes/${classId}/bind-code`)

export const getDevices  = (classId: number) =>
  req<{ devices: Device[] }>('GET', `/api/classes/${classId}/devices`)

export const soundTest    = (classId: number) =>
  req<{ sentTo: number }>('POST', `/api/classes/${classId}/sound-test`)

export const deleteDevice = (classId: number, deviceId: number) =>
  req<void>('DELETE', `/api/classes/${classId}/devices/${deviceId}`)

// ---- 通知 ----
export const publishNotice = (classId: number, content: string, displaySeconds: number, speakTimes: number) =>
  req<{ id: number; sentTo: number; online: number }>('POST', '/api/notices', { classId, content, displaySeconds, speakTimes })

export const getNotices = (classId: number) =>
  req<{ notices: Notice[] }>('GET', `/api/notices?classId=${classId}`)

export const renameClass = (classId: number, name: string) =>
  req<{ id: number; name: string }>('PATCH', `/api/classes/${classId}`, { name })

export const deleteClass = (classId: number) =>
  req<void>('DELETE', `/api/classes/${classId}`)

// ---- 管理后台 ----
export const getAdminStats = () =>
  req<{ teachers: AdminTeacherStat[]; totalOnline: number }>('GET', '/api/admin/stats')

export const getAdminSettings = () =>
  req<AdminSettings>('GET', '/api/admin/settings')

export const updateAdminSettings = (patch: Partial<AdminSettings>) =>
  req<AdminSettings>('PUT', '/api/admin/settings', patch)
