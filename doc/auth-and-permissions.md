# 账号与权限系统说明

## 账号类型

系统只有一种账号类型：**班主任（teacher）**。管理员不是单独的账号类型，而是通过用户名来识别的——用户名与 `ADMIN_USERNAME` 环境变量匹配的那个账号即为管理员，同时保留完整的班主任权限（可以创建班级、绑定设备、发送通知）。

| 能力 | 普通班主任 | 管理员 |
|------|-----------|--------|
| 注册 / 登录 | ✅ | ✅ |
| 创建 / 管理自己的班级 | ✅ | ✅ |
| 发布通知 | ✅ | ✅ |
| 查看所有用户统计（`GET /api/admin/stats`） | ❌ | ✅ |
| 修改注册设置（`GET/PUT /api/admin/settings`） | ❌ | ✅ |

---

## 管理员账号配置

### 环境变量

| 变量（.env 里的 CNB_ 前缀版） | 容器内实际变量 | 用途 | 默认值 |
|---|---|---|---|
| `CNB_ADMIN_USERNAME` | `ADMIN_USERNAME` | **识别**哪个账号是管理员 | `admin` |
| `CNB_INIT_ADMIN_USERNAME` | `INIT_ADMIN_USERNAME` | 首次启动自动创建账号的用户名 | 空（不自动创建）|
| `CNB_INIT_ADMIN_PASSWORD` | `INIT_ADMIN_PASSWORD` | 自动创建账号时使用的密码 | `Admin@123` |
| `CNB_INIT_ADMIN_DISPLAY_NAME` | `INIT_ADMIN_DISPLAY_NAME` | 自动创建账号时的显示名 | `管理员` |

`CNB_ADMIN_USERNAME` 和 `CNB_INIT_ADMIN_USERNAME` 必须保持一致，否则自动创建出来的账号不会被识别为管理员。

### 首次部署流程

1. 复制 `.env.example` → `.env`，修改 `CNB_TOKEN_SECRET` 为随机字符串。
2. 按需调整 `CNB_INIT_ADMIN_PASSWORD`（生产环境务必修改默认密码）。
3. 启动容器。`server.js` 在启动时检测 `INIT_ADMIN_USERNAME` 账号是否已存在，不存在则自动创建。
4. 之后重启不会重复创建（幂等）。

### 修改管理员密码

目前系统没有修改密码的 API。若需更换密码，可在容器内执行：

```bash
# 进入容器
docker exec -it class-notice-board sh

# 用 Node.js 生成新哈希后直接写库（bcrypt 格式）
node -e "
import { hashPassword } from './src/auth.js';
console.log(hashPassword('新密码'));
" | xargs -I{} sqlite3 /data/data.db \
  "UPDATE teacher SET password='{}' WHERE username='admin'"
```

或者更简单：删除 SQLite 里的账号记录，重启容器让初始化脚本重新创建。

---

## 权限中间件（server/src/app.js）

```
requireTeacher   →  校验 JWT，挂载 req.teacher
requireAdmin     →  检查 req.teacher.username === config.adminUsername
```

管理路由同时挂载两个中间件：

```js
{ preHandler: [requireTeacher, requireAdmin] }
```

---

## 动态注册设置（setting 表）

注册邀请码和注册开关存储在 SQLite `setting` 表中，可通过管理后台实时修改，无需重启服务器。

| key | 含义 | 初始值来源 |
|-----|------|-----------|
| `invite_code` | 注册邀请码 | `INVITE_CODE` 环境变量（留空则无需邀请码） |
| `reg_open` | 注册是否开放（`'1'` / `'0'`） | 默认 `'1'`（开放）|

修改后即时生效，旧邀请码同时作废。
