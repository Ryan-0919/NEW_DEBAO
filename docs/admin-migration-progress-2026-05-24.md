# 后台迁移开发记录 - 2026-05-24

## 本轮范围

- 按 Ryan 要求继续依次开发后台管理事项。
- 跳过第 7 项题库管理。
- 每个模块按“开发 -> 阿测测试/审查 -> 阿前前端复查 -> 修复反馈”的流程推进。

## 已完成模块

### 1. 后台权限和操作安全收尾

- 新增统一后台操作日志工具：`server/lib/admin-audit.js`。
- 后台登录、用户管理、课程/素材/试卷内容管理、法条管理、打字练习管理均接入审计日志。
- 敏感字段统一脱敏：密码、token、secret、accessKey、answerJson、paperSnapshotJson 等不会明文写入审计。
- 修复用户管理里“重置机考次数”成功但未实际生效的问题：
  - 已有试卷权限时重置 `manualAttemptUsed`。
  - 没有试卷权限但有考试记录时，会创建权限记录并重置次数。
  - 操作写入审计日志。
- 给后台用户侧试卷列表接口补充角色限制，避免任意后台角色读取。
- 收窄打字练习文本和法条运营配置审计内容：
  - 不记录完整练习正文。
  - 不记录完整运营备注，只记录摘要和长度。
- 法条隐藏操作增加二次确认，并在筛选条件下刷新列表，避免“隐藏后仍停留在仅显示中列表”。

### 2. 法条和打字练习后台可用性修复

- 后台整体布局增加移动端导航抽屉，低高度屏幕侧栏可滚动。
- 法条详情长标题、目录路径支持换行，不再撑破弹窗。
- 打字练习后台：
  - 文件夹删除按钮 hover 颜色修复。
  - 练习记录搜索区小屏不再挤压输入框。
  - 文本编辑弹窗保持浅色、可滚动、可预览正文。

### 3. 批改中心

新增后台批改中心，路径：

- 前端：`/admin/mock-exam-reviews`
- 后端：`/api/admin/mock-exam-reviews`

已实现：

- 批改总览：
  - 批改试卷数、待批改、AI批改中、AI异常、人工处理中、我领取的、已发送。
- 主观题批改试卷列表：
  - 只展示开启批改的主观题试卷。
  - 支持搜索试卷标题、编号、阶段、套卷。
- 单卷批改队列：
  - 支持按全部、待批改、人工中、我领取、已发送、AI异常筛选。
  - 展示考生、手机号/昵称、提交时间、作答进度、批改进度、锁定人。
- 领取锁：
  - 老师必须先领取才能编辑。
  - 同一记录被他人锁定时不能覆盖；领取使用带锁条件的原子更新，避免并发覆盖。
  - 保存和发布都校验锁 token 和 `manualReviewVersion`。
  - `manualReviewVersion` 为必填合法整数，缺失或过期会拒绝保存/发布。
- 批改详情：
  - 展示题干材料、问题、考生答案、参考答案。
  - 支持编辑小问得分、老师点评、遗漏点、参考答案、能力标签。
  - 草稿保存不会设置 `publishedAt`，学生端仍只看到待批改。
- 发送给学生：
  - 前端二次确认。
  - 后端强制所有小问必须填写老师点评。
  - 发布后写入 `reviewWorkflowStatus=published`、`publishedAt`、`reviewedAt`、`totalScore`，并清除锁。
- 学生端泄露防护：
  - 后台保存草稿时会写入 `reviewJson`，但学生端序列化在未发布时不再读取或返回老师点评、参考答案、遗漏点、批注、语音点评和小问得分。
  - 未发布前学生端 API 只保留学生自己的答案和待批改状态。
- 操作审计：
  - 领取、释放、保存草稿、发送结果均写入审计。
  - 审计只记录记录 ID、试卷 ID、题数、总分等摘要，不记录完整学生答案或完整点评。

## 主要文件

- `server/lib/admin-audit.js`
- `server/routes/auth.js`
- `server/routes/admin-users.js`
- `server/routes/admin-content.js`
- `server/routes/law-admin.js`
- `server/routes/typing-practice-admin.js`
- `server/routes/admin-mock-exam-review.js`
- `server/index.js`
- `src/app/layouts/AdminLayout.tsx`
- `src/app/pages/admin/AdminRouter.tsx`
- `src/app/pages/admin/LawManagement.tsx`
- `src/app/pages/admin/TypingPracticeManagement.tsx`
- `src/app/pages/admin/MockExamReviewManagement.tsx`
- `src/app/services/adminMockExamReviewService.ts`

## 已运行验证

- `node --check server/lib/admin-audit.js`
- `node --check server/routes/auth.js`
- `node --check server/routes/admin-users.js`
- `node --check server/routes/admin-content.js`
- `node --check server/routes/law-admin.js`
- `node --check server/routes/typing-practice-admin.js`
- `node --check server/routes/admin-mock-exam-review.js`
- `node --check server/index.js`
- `npm.cmd run build`

构建通过。Vite 仍有 chunk 体积超过 500 kB 的提示，这是现有打包体积警告，不影响运行。

## 已知边界

- 第 7 项题库管理按要求跳过。
- 批改中心本轮不新增数据库字段，沿用现有 `MockExamRecord` 和 `MockExamAnswer.reviewJson`。
- 批改中心不改学生端机考、结果页、待批改页样式和路由。
- 批改中心后端允许 `super_admin`、`operations_admin`、`review_admin`，前端也会给 `review_admin` 展示批改中心入口。
- 语音点评字段后端结构保留在 `reviewJson` 中，但本轮未做后台语音上传控件。
- 如果后续要区分“人工正在批改”和“待人工发送”为两个独立数据库状态，需要新增枚举值并迁移数据库；本轮用锁字段区分“正在批改”。

## 建议下一步

- 先让后台老师试用批改中心真实流程：领取、保存草稿、刷新页面、继续编辑、发送给学生。
- 再做批改中心细节增强：
  - 答案划线/批注定位编辑器。
  - 语音点评上传。
  - AI异常重试/转人工按钮。
  - 批改记录导出和老师工作量统计。
