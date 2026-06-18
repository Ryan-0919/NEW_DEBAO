# 默写本功能开发记录

## 已完成

- 首页入口：将原“法条练习”快捷入口替换为“默写本”，法条练习路由保留但首页隐藏。
- 用户端：新增 `/user/dictation` 默写本页面。
  - 支持选择科目。
  - 支持选择章节。
  - 练习页可切换章节。
  - 题目按 `{{答案}}` 自动生成挖空输入框。
  - 顶部支持“查看答案 / 隐藏答案”和“重做本章”。
  - 查看答案后显示标准答案并标记填写正误。
- 后台管理：新增 `/admin/dictation` 默写本管理。
  - 可管理科目：名称、编码、颜色、排序、启停。
  - 可管理章节：所属科目、章节名称、说明、排序、启停。
  - 可管理默写题：标题、内容、来源、解析、状态、排序。
  - 支持批量导入：粘贴文本或上传 `xlsx/xls/csv/txt/md`。
- 后端接口：
  - 用户端：`/api/user/dictation/*`
  - 后台：`/api/admin/dictation/*`
- 数据库：
  - 新增 `DictationSubject`
  - 新增 `DictationChapter`
  - 新增 `DictationItem`
  - 新增 `DictationItemStatus`
  - 默认八科会在访问科目接口时自动初始化：民法、刑法、民诉、刑诉、商法、行政、三国、理论。

## 导入格式

后台默写题内容使用双花括号标记挖空：

```txt
法律行为以{{意思表示}}为核心，意思表示包括{{效果意思}}和{{表示行为}}。
国际法基本原则具有{{强行法}}性质，但并不是所有强行法规则都是国际法基本原则。
```

Excel 推荐列：

| 标题 | 默写内容 | 来源 | 状态 | 排序 |
| --- | --- | --- | --- | --- |
| 法律行为 | 法律行为以{{意思表示}}为核心。 | 讲义 | 已发布 | 1 |

## 本地验证

- 已执行 `npx.cmd prisma generate`
- 已执行 `npx.cmd prisma db push`
- 已执行 `npm.cmd run build` 通过

## 服务器更新

```bash
cd /srv/NEW_DEBAO
git pull
npm install
npx prisma db push
npx prisma generate
npm run build
pm2 restart new-debao
```
