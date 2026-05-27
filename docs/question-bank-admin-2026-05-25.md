# 练习原题库与练习题库配置后台开发记录 - 2026-05-25

## 范围

- 本轮做的是普通练习题库后台，不是机考试卷后台。
- 机考试卷仍在后台菜单“机考试卷管理”维护。
- 题库边界按四类区分：
  - 主观题批改题库：属于机考/主观批改流程，保留批改说明、遗漏点、老师点评等批改字段。
  - 客观题机考题库：属于客观模考流程，不进入普通练习题库。
  - 练习题库配置：用户端普通练习题库，按题库书、科目、引用题组织。
  - 公开给学员的题库：后续如需要无权限公开展示，应单独设计，不和“我的题库/练习题库配置”混写。
- 后台现在拆成两个入口：
  - “练习原题库”：集中维护普通练习原始题目、选项、答案、解析和文件夹。
  - “练习题库配置”：维护用户端普通练习题库的题库书、科目、题目引用和启停状态。
- “练习题库配置”不再直接上传或编辑题干，必须先在“练习原题库”维护原题，再从练习原题库选题引用。
- 2026-05-25 修复：练习题库的选题来源已从旧机考题源 `QuestionBankItem` 切换为练习原题库 `BookQuestionLibraryItem`，新导入只写 `bookQuestionLibraryItemId`。

## 已完成

### 后端接口

新增/调整路由：

- `server/routes/admin-question-bank.js`
- 挂载路径：`/api/admin/content/question-banks`
- `server/routes/admin-question-library.js`
- 挂载路径：`/api/admin/content/question-library`

已实现：

- 题库概览：`GET /summary`
- 题库列表：`GET /`
- 新建题库：`POST /`
- 题库详情：`GET /:bookId`
- 编辑题库：`PATCH /:bookId`
- 删除题库：`DELETE /:bookId`
- 题库排序：`PATCH /order/books`
- 新建科目：`POST /:bookId/subjects`
- 编辑科目：`PATCH /:bookId/subjects/:subjectId`
- 删除科目：`DELETE /:bookId/subjects/:subjectId`
- 科目排序：`PATCH /:bookId/subjects/order`
- 题目列表：`GET /:bookId/items`
- 可引用题目：`GET /:bookId/source-items`
- 从练习原题库引用题目：`POST /:bookId/items/import`
- 题目详情：`GET /:bookId/items/:itemId`
- 题目启停：`PATCH /:bookId/items/:itemId/status`
- 删除题目：`DELETE /:bookId/items/:itemId`
- 直录题目：`POST /:bookId/items` 已收口为 410，提示到练习原题库维护。
- 直接编辑题目内容：`PATCH /:bookId/items/:itemId` 已收口为 410，提示到练习原题库维护。

练习原题库接口：

- 概览：`GET /summary`
- 文件夹：`GET/POST/PATCH/DELETE /folders`
- 题目：`GET/POST/PATCH/DELETE /items`

后端保护：

- 仅 `super_admin`、`operations_admin` 可访问。
- 发布题库前校验必须有科目和启用题目。
- 题目内容在“练习原题库”维护时校验题干、选项、正确答案。
- 正确答案必须来自已有选项。
- 单选题只能有一个正确答案。
- 有用户权限、练习进度、题目或练习状态的题库不能硬删。
- 科目下有题目时不能删除。
- 有用户练习记录的题目不能硬删，只能停用。
- 主要写操作接入后台审计日志。

### 前端后台

新增：

- `src/app/services/adminQuestionBankService.ts`
- `src/app/services/adminQuestionLibraryService.ts`
- `src/app/pages/admin/QuestionBankManagement.tsx`
- `src/app/pages/admin/QuestionLibraryManagement.tsx`

接入：

- `src/app/layouts/AdminLayout.tsx`
- `src/app/pages/admin/AdminRouter.tsx`

后台菜单：

- 练习原题库
- 练习题库配置
- 机考试卷管理

页面能力：

- 练习原题库支持文件夹、题目列表、新建/编辑题目、选项、正确答案、解析、音频和引用次数。
- 练习题库配置支持题库列表、筛选、编辑、隐藏、删除。
- 练习题库详情按“题库书 -> 科目 -> 引用题目”三层组织。
- 科目新增、编辑、删除。
- 题目列表筛选：科目、状态、题型、关键词。
- 练习题库通过“从练习原题库选题”弹窗批量引用题目。
- 练习题库题目列表展示来源文件夹、引用状态、答案、练习记录数。
- 历史上已经从旧机考题源导入的数据会标记为“历史机考来源”，后续新引用不会再从旧机考题源读取。

### 用户端安全修复

修复用户端普通题库提前泄露解析的问题：

- 文件：`server/routes/user.js`
- 未答题、未查看答案前，不再返回 `analysis`。
- 提交答案或点击查看解析后，才返回 `correctAnswer` 和 `analysis`。

## 已验证

- `node --check server/routes/admin-question-bank.js`
- `node --check server/routes/admin-question-library.js`
- `node --check server/routes/user.js`
- `node --check server/index.js`
- `npm.cmd run build`

构建通过。仍有 Vite chunk 体积 warning，不影响运行。

接口验证：

- 后台登录后访问 `/api/admin/content/question-banks/summary` 成功。
- 后台登录后访问 `/api/admin/content/question-library/summary` 成功。
- 后台登录后访问 `/api/admin/content/question-banks/:bookId/source-items` 成功。
- `source-items` 当前读取 `BookQuestionLibraryItem`，不再读取旧 `QuestionBankItem`。
- 当前返回：`totalBooks=1`，`totalItems=0`。
- 当前练习原题库返回：`folderCount=8`，`itemCount=135`。
- 未登录访问返回 401。
- `/api/health` 正常。

## 当前限制

- 第一版已做从练习原题库批量引用；未做 Excel/Word 批量导入原题。
- 第一版未做题目预览。
- 第一版普通练习题先支持客观题：单选、多选、不定项。
- 题库封面暂时保留链接字段，未做本地上传控件。

## 建议下一步

1. 在“练习原题库”里检查现有 135 道题的文件夹、题型、答案和解析。
2. 在“练习题库配置”里给现有题库创建科目，并从练习原题库引用一批题。
3. 给一个测试用户开通该题库权限。
4. 用户端验证题库列表、章节练习、提交答案、查看解析、错题本、收藏。
5. 再做题目预览、批量导入原题、引用关系详情。
