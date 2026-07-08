# 兼职批改老师分发 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为主观题批改后台增加“主管手动分配 / 改派给兼职老师”的完整链路，并提供老师维度的批改统计。

**Architecture:** 在现有 `MockExamRecord` 上直接增加“分配归属”和“最终发布归属”字段，保留现有领取锁模型，新增更细的 `part_time_reviewer` 角色，并在主管端批改后台加入批量分配/改派能力。兼职老师端继续复用现有批改后台页面，但所有列表和统计都只暴露分配给自己的记录。

**Tech Stack:** Prisma + MySQL、Express 路由、React + TypeScript、现有 admin session / review layout、node:test 回归测试。

---

### Task 1: 数据结构与角色枚举

**Files:**
- Modify: `D:\Desktop\my_code\new_debao\prisma\schema.prisma`
- Modify: `D:\Desktop\my_code\new_debao\server\lib\admin-role.js`
- Modify: `D:\Desktop\my_code\new_debao\src\app\lib\admin-session.ts`
- Modify: `D:\Desktop\my_code\new_debao\src\app\services\adminOperationsService.ts`
- Test: `D:\Desktop\my_code\new_debao\tests\admin-role-access.test.mjs`

### Task 2: 主管端分配 / 改派后端接口

**Files:**
- Modify: `D:\Desktop\my_code\new_debao\server\routes\admin-mock-exam-review.js`
- Modify: `D:\Desktop\my_code\new_debao\server\lib\mock-exams.js`
- Test: `D:\Desktop\my_code\new_debao\tests\mock-exam-review-assignment.test.mjs`

### Task 3: 主管端批量分配 / 批量改派与老师统计接口

**Files:**
- Modify: `D:\Desktop\my_code\new_debao\server\routes\admin-mock-exam-review.js`
- Modify: `D:\Desktop\my_code\new_debao\src\app\services\adminMockExamReviewService.ts`
- Test: `D:\Desktop\my_code\new_debao\tests\mock-exam-review-stats.test.mjs`

### Task 4: 兼职老师视角过滤与路由权限

**Files:**
- Modify: `D:\Desktop\my_code\new_debao\src\app\layouts\ReviewLayout.tsx`
- Modify: `D:\Desktop\my_code\new_debao\src\app\pages\review\ReviewRouter.tsx`
- Modify: `D:\Desktop\my_code\new_debao\src\app\pages\admin\AdminAccountManagement.tsx`
- Modify: `D:\Desktop\my_code\new_debao\server\routes\admin-operations.js`

### Task 5: 主管端 UI：批量分配 / 改派 / 统计展示

**Files:**
- Modify: `D:\Desktop\my_code\new_debao\src\app\pages\admin\MockExamReviewManagement.tsx`
- Modify: `D:\Desktop\my_code\new_debao\src\app\services\adminMockExamReviewService.ts`

### Task 6: Prisma 生成、回归测试、前后端构建验证

**Files:**
- Modify: `D:\Desktop\my_code\new_debao\generated\prisma\` (generated)
- Test: `D:\Desktop\my_code\new_debao\tests\admin-role-access.test.mjs`
- Test: `D:\Desktop\my_code\new_debao\tests\mock-exam-review-assignment.test.mjs`
- Test: `D:\Desktop\my_code\new_debao\tests\mock-exam-review-stats.test.mjs`

