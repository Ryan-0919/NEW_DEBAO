# 用户端展示数据真实化记录（2026-05-26）

## 背景

本次任务是核对用户端前台仍在使用 mock 或占位展示的数据，并优先把首页公告、“我的”页学习数据、订单记录、个人资料和设置页里会误导用户的信息改成真实接口或明确空状态。

## 已完成

1. 学习公告管理
   - 新增后台菜单：`学习公告管理`。
   - 新增后台页面：`src/app/pages/admin/LearningAnnouncementManagement.tsx`。
   - 新增接口：
     - `GET /api/admin/learning-announcements`
     - `PATCH /api/admin/learning-announcements`
   - 公告数据复用 `SystemConfig.portalConfigJson.memberHome.announcement`，不新增数据库表。
   - 公告项支持标题、内容、标签、颜色、时间、链接、显示/隐藏、排序。

2. 首页学习公告真实化
   - 用户首页不再读取本地写死公告数组。
   - 登录后通过 `/api/auth/user-home-config` 读取 `memberHome.announcement.items`。
   - 首页公告只展示后台设置为可见的公告，并按排序字段展示。
   - 公告链接支持外链和站内路径。

3. 首页“我的数据”真实化
   - 新增用户汇总接口：`GET /api/user/study-summary`。
   - 首页“累计练题、答题正确率、累计学习、错题收藏”改为读取真实学习汇总。
   - 原先写死的“全国排名 Top 12%”已移除。
   - 原先写死的 AI 学情诊断文案已改为根据真实练题、错题、收藏数据生成。

4. “我的”页真实化
   - 顶部不再显示写死的“备考第 42 天、连续签到 21 天、全国排名 Top 12%”。
   - 改为展示真实注册天数、已开通课程数、授权题库数和账号手机号。
   - 学习统计卡片改为读取 `/api/user/study-summary.stats`。
   - 本周学习柱状图改为读取 `/api/user/study-summary.weekData`。
   - 最近动态改为读取 `/api/user/study-summary.recentActivity`。
   - 练题热力图改为读取 `/api/user/study-summary.heatmapDays`。
   - 订单记录改为读取 `/api/user/study-summary.orders`。
   - 无数据时显示空状态，不再显示假订单和假动态。

5. 个人资料页占位清理
   - 移除假邮箱 `li@example.com`。
   - 移除假简介“备考中，目标2026年通过法考两卷”。
   - 移除未落库的备考年份、重点科目选择。
   - 当前只保留旧用户系统真实支持的昵称和手机号展示。

6. 设置页占位清理
   - 清除缓存不再显示假大小 `234 MB`。
   - 版本号改为读取 `APP_VERSION`。
   - 微信绑定、两步验证不再假显示“已绑定/已开启”，改为明确说明旧用户系统暂未返回状态或由系统策略控制。
   - 清缓存动作会清理本地题库草稿、机考标记和页面偏好缓存。

7. 首页运营位清理
   - 首页主视觉不再使用写死的 Unsplash 活动轮播。
   - 改为读取后台门户配置中的会员首页标题、描述和横幅图。
   - 在线答疑卡片改为读取后台客服链接；未配置时显示“暂未配置”，不再假显示“老师在线”。

## 新增接口数据来源

`GET /api/user/study-summary` 汇总了以下真实数据：

| 模块 | 数据来源 |
|---|---|
| 课程学习时长 | `UserProgress`、`UserVideoProgress` |
| 练题数量、正确率、错题、收藏 | `UserBookQuestionBankItemState` |
| 考试记录数量 | `MockExamRecord` |
| 打字练习统计 | `TypingPracticeRecord` |
| 授权题库数量 | `UserBookQuestionBankPermission` |
| 订单记录 | `ShopOrder`、`ShopOrderItem` |

## 验证结果

已执行并通过：

```powershell
node --check server/routes/admin-operations.js
node --check server/routes/user.js
node --check server/routes/auth.js
npm.cmd run build
```

构建只有 Vite chunk size warning，大包体积警告不影响功能。

## 仍建议后续处理

1. 设置页的通知、播放、隐私偏好目前仍是前端本地状态，刷新后不会持久化。建议后续新增用户偏好接口。
2. 首页快速入口目前仍是固定功能入口。后台已有 `memberHome.operations` 配置结构，后续可以把入口文案、排序、显示隐藏完全配置化。
3. 首页“全部公告”目前只提示当前展示数量。后续如果公告数量变多，建议新增用户端公告列表页。
4. 个人资料如需邮箱、简介、备考年份、重点科目，需要先扩展用户资料存储和接口，再恢复表单字段。
