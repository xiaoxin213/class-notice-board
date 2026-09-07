# 班级通知屏

班主任在手机或电脑上发布通知，教室电脑同步全屏显示并语音播报。

## 目录结构

```
doc/          产品与技术文档
server/       服务端（Node.js + Fastify + SQLite）
Dockerfile    单容器镜像
docker-compose.yml
AGENTS.md     协作约定
```

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [doc/PRD.md](doc/PRD.md) | 产品需求，参考产品拆解 |
| [doc/架构讨论.md](doc/架构讨论.md) | 教室端联网可行性、方案对比与决策记录 |
| [doc/技术方案.md](doc/技术方案.md) | 云端架构、通信协议、数据模型 |
| [doc/设计规范.md](doc/设计规范.md) | 暖黄视觉规范与色板 |
| [doc/接口文档.md](doc/接口文档.md) | 服务端 API 与 WebSocket 协议 |
| [doc/部署说明.md](doc/部署说明.md) | Docker 部署、反向代理、备份、排查 |
| [doc/使用说明.md](doc/使用说明.md) | 面向老师的操作说明 |

## 本地开发

```bash
cd server
npm install
TOKEN_SECRET=dev INVITE_CODE=DEV2026 npm start
npm test
```

## 进度

- [x] 服务端：账号、班级、教室绑定、通知投递、在线状态、SSE、WebSocket
- [ ] 教师端 Web / H5
- [ ] 教室端 Electron 客户端
