# 得宝新项目部署方案

## 目标

`new_debao` 作为新的完整部署项目运行，包含前端、后端和 Prisma schema。旧项目 `音频系统/video-hub` 继续生产运行，不在迁移过程中修改。

## 第一阶段范围

- 用户登录、注册、当前用户、资料修改、退出登录。
- 用户课程列表、课程详情、标签目录。
- 音频详情、视频详情、讲义下载。
- 音频和视频学习进度保存、标记学完。
- 前端仍可通过 Vite 开发代理访问 `/api`。

## 不做事项

- 不自动执行 Prisma `db push` 或迁移。
- 不复制旧项目真实 `.env` 密钥。
- 不启动旧项目的定时任务、音频转码队列、AI 队列、支付、后台管理。
- 不改旧生产项目文件。

## 本地开发

1. 复制 `.env.example` 为 `.env`，填入测试库或确认可安全读取的旧库连接。
2. 安装依赖：`npm install`
3. 生成 Prisma Client：`npm run prisma:generate`
4. 启动后端：`npm run server`
5. 启动前端：`npm run dev`

## 部署

1. 在部署环境设置 `DATABASE_URL`、`JWT_SECRET`、`CORS_ORIGIN` 和可选 OSS 配置。
2. 执行 `npm install && npm run prisma:generate && npm run build`。
3. 使用 `npm run start` 启动后端，生产模式会同时托管 `dist` 前端静态文件。

## 风险控制

- 新服务连接旧库时，第一阶段只复用用户侧数据和学习进度写入。
- 不运行后台队列，避免和旧生产服务重复处理任务。
- 任何表结构变更必须先在测试库验证，再单独安排停机或灰度窗口。
