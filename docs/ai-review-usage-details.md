# AI批改系统使用细节完整说明

## 👨‍🎓 学生端体验

### 1. 交卷流程

**步骤1：学生答题**
- 进入考试 → 答题 → 点击"交卷"
- 前端调用：`POST /api/user/mock-exams/records/:recordId/submit`

**步骤2：系统判断**
```javascript
// 判断是否需要AI批改
const paper = record.paper;
const hasSubjectiveQuestion = paper.questions.some(q => q.type === 'subjective_case');
const reviewEnabled = paper.reviewEnabled;
const attemptNo = record.attemptNo;
const reviewAttemptLimit = paper.reviewAttemptLimit;

// 需要批改的条件：
// 1. 试卷开启了批改功能 (reviewEnabled = true)
// 2. 有主观题
// 3. 未超过批改次数限制
if (reviewEnabled && hasSubjectiveQuestion && 
    (reviewAttemptLimit === 0 || attemptNo <= reviewAttemptLimit)) {
  reviewWorkflowStatus = "ai_pending";  // 进入AI批改队列
} else {
  reviewWorkflowStatus = "not_required"; // 不需要批改
  publishedAt = now;                     // 立即发布
}
```

**步骤3：学生看到的状态**

**场景A：需要批改**
- 跳转到：`/user/my-exams/records/:recordId/pending`
- 显示：
  ```
  正在等待老师批改
  
  你的试卷已提交成功，老师正在批改中...
  批改完成后会自动通知你。
  
  客观题得分：45分
  主观题：待批改
  ```
- `reviewWorkflowStatus` 可能是：
  - `ai_pending` - 在队列中等待
  - `ai_processing` - AI正在批改
  - `manual_pending` - AI批改完成，等待老师审核

**场景B：不需要批改（纯客观题）**
- 直接跳转到：`/user/my-exams/records/:recordId/result`
- 显示完整成绩和答案解析

### 2. 批改状态轮询

**前端轮询逻辑：**
```javascript
// 每5秒检查一次状态
useEffect(() => {
  const timer = setInterval(async () => {
    const detail = await mockApi.getMockExamRecordDetail(recordId);
    
    // 如果已发布，跳转到结果页
    if (detail.reviewWorkflowStatus === 'published') {
      navigate(`/user/my-exams/records/${recordId}/result`);
    }
  }, 5000);
  
  return () => clearInterval(timer);
}, [recordId]);
```

**问题：**
- 学生无法区分 `ai_pending`、`ai_processing`、`manual_pending`
- 都显示"正在等待老师批改"
- 不知道AI是否已经完成

### 3. 查看批改结果

**触发条件：** `reviewWorkflowStatus === 'published'`

**URL：** `/user/my-exams/records/:recordId/result`

**显示内容：**
```
【总分】
客观题：45分
主观题：28分
总分：73分 / 100分

【主观题详情】
第1题（20分）

小问(1)（10分）得分：8分

你的答案：
[学生的答案文本，带划线标注]

老师点评：
你这一问的基本方向是对的，能够意识到证明责任需要结合具体事实来分配...

参考答案：
赵某应对污染行为承担证明责任...

采分点：
✓ 污染行为证明责任（5分）已命中
✗ 其他养殖户未受影响的证明责任（3分）未命中

遗漏点：
• 答案没有说明该事实应由白云制药厂承担证明责任
```

**答案划线显示：**
- 绿色高亮 + 得分标记：正向划线（status: "score"）
- 红色高亮 + 错误说明：错误划线（status: "wrong"）
- 蓝色高亮 + 提示信息：中性划线（status: "neutral"）

**当前问题：** 没有红色高亮，因为AI不标注错误！

---

## 👨‍💼 管理员端体验

### 1. 批改队列管理

**URL：** `/admin/mock-exam-reviews`

**界面：**
```
【批改队列】

筛选：
[试卷选择 ▼] [状态选择 ▼] [搜索学生]

统计：
总计：125份  |  待批改：45份  |  批改中：3份  |  已完成：77份

列表：
┌────────┬──────────┬────────┬──────────┬──────────┬────────┐
│ 学生   │ 试卷     │ 状态   │ 提交时间 │ 批改时间 │ 操作   │
├────────┼──────────┼────────┼──────────┼──────────┼────────┤
│ 张三   │ 2024真题 │ AI批改中│ 10:30   │ -        │ 查看   │
│ 李四   │ 2024真题 │ 待审核  │ 10:25   │ 10:27    │ 领取   │
│ 王五   │ 2024真题 │ 已发布  │ 10:20   │ 10:22    │ 查看   │
└────────┴──────────┴────────┴──────────┴──────────┴────────┘
```

**状态显示：**
- `ai_pending` → "等待AI批改"（灰色）
- `ai_processing` → "AI批改中"（蓝色，转圈动画）
- `manual_pending` → "待审核"（橙色，可领取）
- `published` → "已发布"（绿色）

### 2. 领取批改

**操作：** 点击"领取"按钮

**API：** `POST /api/admin/mock-exam-reviews/records/:recordId/claim`

**后端逻辑：**
```javascript
// 1. 检查是否可领取
if (record.reviewWorkflowStatus !== 'manual_pending' && 
    record.reviewWorkflowStatus !== 'published') {
  throw new Error('该记录不可领取');
}

// 2. 检查锁
const lockExpiresAt = record.manualReviewLockExpiresAt;
if (lockExpiresAt && lockExpiresAt > now) {
  throw new Error('该记录已被其他老师领取');
}

// 3. 加锁
await db.mockExamRecord.update({
  where: { id: recordId },
  data: {
    manualReviewerId: adminId,
    manualReviewerName: adminName,
    manualReviewLockToken: crypto.randomUUID(),
    manualReviewClaimedAt: now,
    manualReviewLockExpiresAt: new Date(now.getTime() + 120 * 60 * 1000), // 2小时后过期
    reviewWorkflowStatus: wasPublished ? 'published' : 'manual_pending'
  }
});
```

**锁机制：**
- 锁定时长：2小时（`LOCK_MINUTES = 120`）
- 超过2小时后，其他管理员可以抢锁
- 同一管理员可以续期

### 3. 批改详情页

**URL：** `/admin/mock-exam-reviews/records/:recordId`

**界面布局：**
```
┌─────────────────────────────────────────────────────────┐
│ 【学生信息】                                             │
│ 姓名：张三  |  试卷：2024年法考真题  |  提交时间：10:30 │
│                                                          │
│ 【操作按钮】                                             │
│ [AI重批] [释放] [保存草稿] [发送给学生]                 │
└─────────────────────────────────────────────────────────┘

┌──────────────────────┬──────────────────────────────────┐
│ 【题目】             │ 【批改区】                        │
│                      │                                   │
│ 第1题（主观题）      │ 小问(1)（10分）                   │
│                      │                                   │
│ 材料：               │ 学生答案：                        │
│ [题目材料...]        │ [学生答案，可划线标注]            │
│                      │                                   │
│ 小问(1)：            │ 当前得分：[8] 分                  │
│ [小问内容...]        │                                   │
│                      │ 点评：                            │
│ 参考答案：           │ [文本框，300-400字]               │
│ [参考答案...]        │                                   │
│                      │ 采分点：                          │
│ 采分点：             │ □ 污染行为证明责任（5分）         │
│ 1. 污染行为证明责任  │ □ 其他养殖户未受影响（3分）       │
│ 2. 其他养殖户未受影响│                                   │
│                      │ 划线标注：                        │
│                      │ • 白云制药厂排放废气 [5分] ✓      │
│                      │ • 由白云制药厂承担 [错误] ✗       │
└──────────────────────┴──────────────────────────────────┘
```

**批改操作：**

1. **调整分数**：直接修改分数输入框
2. **修改点评**：编辑文本框
3. **划线标注**：
   - 选中学生答案中的文字
   - 弹出菜单：[得分点 | 错误 | 中性 | 删除]
   - 选择类型后输入comment和分数
4. **标记采分点**：勾选已命中的采分点

### 4. AI重批

**操作：** 点击"AI重批"按钮

**流程：**

**前端确认：**
```javascript
if (hasUnsavedChanges) {
  if (!confirm('当前批改内容还没有保存，AI重批会覆盖当前本地修改，确认继续吗？')) {
    return;
  }
}

if (record.reviewWorkflowStatus === 'published') {
  toast.error('已发送的试卷请先点击"重新修改"领取后，再进行 AI 重批');
  return;
}
```

**API：** `POST /api/admin/mock-exam-reviews/records/:recordId/ai-review`

**后端逻辑：**
```javascript
await prisma.$transaction(async (tx) => {
  // 1. 检查锁
  if (record.lock.active && !record.lock.ownedByMe) {
    throw new Error('该记录已被其他老师领取');
  }
  
  // 2. 清空已发布的批改（我刚修复的）
  const subjectiveAnswers = record.answers.filter(/* 主观题 */);
  await Promise.all(
    subjectiveAnswers.map(answer =>
      tx.mockExamAnswer.update({
        where: { id: answer.id },
        data: {
          publishedReviewJson: null,  // ← 清空旧数据
          publishedScore: null
        }
      })
    )
  );
});

// 3. 重新入队
await enqueueMockExamAiReview({
  db: prisma,
  recordId,
  adminId: req.auth.adminId  // 强制批改，不受冷却期限制
});
```

**管理员看到：**
- 状态变为"AI批改中"
- 页面自动刷新（轮询）
- 批改完成后状态变为"待审核"
- 可以查看新的批改结果

### 5. 发布给学生

**操作：** 点击"发送给学生"按钮

**API：** `POST /api/admin/mock-exam-reviews/records/:recordId/publish`

**后端逻辑：**
```javascript
await prisma.$transaction(async (tx) => {
  // 1. 计算总分
  const subjectiveScore = subQuestions.reduce((sum, sq) => sum + sq.score, 0);
  const objectiveScore = objectiveQuestions.reduce((sum, q) => sum + q.score, 0);
  const totalScore = objectiveScore + subjectiveScore;
  
  // 2. 保存发布快照
  for (const answer of subjectiveAnswers) {
    await tx.mockExamAnswer.update({
      where: { id: answer.id },
      data: {
        publishedReviewJson: answer.reviewJson,  // 保存快照
        publishedScore: answer.score
      }
    });
  }
  
  // 3. 更新记录状态
  await tx.mockExamRecord.update({
    where: { id: recordId },
    data: {
      totalScore,
      reviewWorkflowStatus: 'published',
      reviewedAt: now,
      publishedAt: now,
      manualReviewVersion: { increment: 1 },  // 版本号+1
      manualReviewLockToken: null,            // 释放锁
      manualReviewLockExpiresAt: null
    }
  });
});
```

**发布后：**
- 学生立即可以查看批改结果
- 管理员可以"重新修改"（再次领取）

### 6. 批量AI重批

**操作：** 勾选多个记录 → 点击"批量AI重批"

**API：** `POST /api/admin/mock-exam-reviews/records/batch-ai-review`

**逻辑：**
```javascript
const results = [];
for (const recordId of selectedRecordIds) {
  try {
    // 逐个处理，不影响其他记录
    await enqueueMockExamAiReview({ db, recordId, adminId });
    results.push({ recordId, success: true });
  } catch (error) {
    results.push({ recordId, success: false, message: error.message });
  }
}

return {
  successCount: 成功数,
  failedCount: 失败数,
  results: 详细结果
};
```

**管理员看到：**
```
批量AI重批结果：
成功：8份
失败：2份
- 张三的试卷：该记录已被其他老师领取
- 李四的试卷：该试卷已达到最大重试次数
```

---

## ⚙️ 管理员配置

### 1. AI批改配置入口

**URL：** `/admin/settings` 或 `/admin/ai-review/config`

**配置项：**

```
【基础配置】

AI提供商：
○ 规则批改（关键词匹配）
● OpenAI兼容（Claude等）

API配置：
Base URL: [https://api.anthropic.com     ]
API Key:  [sk-ant-***********           ] [测试连接]
模型:     [claude-sonnet-4-6            ] 

【批改策略】

温度: [==●======] 0.5
      低←  创造性  →高

最大Token: [8000 ]

超时时间: [120] 秒

【队列配置】

启用队列: ☑
最大并发: [3] 个
最大重试: [3] 次
重试间隔: [15] 秒
冷却时间: [120] 分钟

【验证配置】

严格验证: ☑ （验证失败时拒绝AI结果）

【JSON校对】

启用JSON校对: ☑
校对模型: [claude-haiku-4-5] （留空使用主模型）

【提示词配置】

System Prompt:
┌────────────────────────────────────────┐
│ 你是国家统一法律职业资格考试主观题...  │
│                                         │
│ [大文本框，支持多行]                    │
│                                         │
└────────────────────────────────────────┘

User Prompt Template:
┌────────────────────────────────────────┐
│ {{批改原则}}                            │
│ {{输出要求}}                            │
│ {{题目数据}}                            │
└────────────────────────────────────────┘

批改原则模板:
┌────────────────────────────────────────┐
│ 题目：{{题目}}                          │
│ 材料：{{材料}}                          │
│ 小问批改依据：{{小问批改依据}}          │
└────────────────────────────────────────┘

输出要求:
┌────────────────────────────────────────┐
│ 只能返回一个合法 JSON 对象...           │
│ answerMarks 必须同时体现得分点和错误点..│
└────────────────────────────────────────┘

[保存配置] [恢复默认]
```

**保存后：**
- 写入 `systemConfig.mockExamAiReviewConfigJson`
- 立即生效（有3秒缓存延迟）
- 无版本历史（无法回滚）❌

### 2. 配置的实际使用

**读取配置：**
```javascript
// server/lib/mock-exam-ai-review-config.js
const getMockExamAiReviewConfig = async ({ db }) => {
  // 1. 从数据库读取
  const systemConfig = await db.systemConfig.findUnique({ where: { id: 1 } });
  const dbConfig = JSON.parse(systemConfig?.mockExamAiReviewConfigJson);
  
  // 2. 与环境变量/代码默认值合并
  return normalizeMockExamAiReviewConfig(
    dbConfig,           // 优先
    getEnvConfig()      // fallback
  );
};
```

**配置缓存：**
```javascript
let configCache = null;
let cacheExpiresAt = 0;

const getRuntimeConfig = async ({ db }) => {
  const now = Date.now();
  if (configCache && cacheExpiresAt > now) {
    return configCache;  // 使用缓存
  }
  
  configCache = await getMockExamAiReviewConfig({ db });
  cacheExpiresAt = now + 3000;  // 3秒后过期
  return configCache;
};
```

**问题：**
- 修改配置后最多3秒生效
- 无法看到"最终发给AI的完整prompt"
- 无法对比不同配置的效果

---

## 🔄 完整批改流程时间线

### 示例：学生张三交卷到看到结果

**10:30:00 - 学生交卷**
```
POST /api/user/mock-exams/records/rec_123/submit

reviewWorkflowStatus: "ai_pending"
aiReviewNextRetryAt: 2024-01-01 10:30:00
```

**10:30:03 - 队列首次检查（3秒后）**
```
pumpMockExamAiReviewQueue()
→ hasQueuedRecords() = true
→ claimQueuedRecordForProcessing()
  → 检查并发：activeProcessingCount = 2 < maxConcurrency(3) ✓
  → 更新状态：reviewWorkflowStatus = "ai_processing"
→ consumeQueuedRecord()
```

**10:30:03 - 开始AI批改**
```
autoReviewMockExamRecord()
→ buildSubjectiveReviewJson()
  → requestOpenAiCompatibleReview()
    → 第1次尝试：requestOpenAiCompatibleReviewOnce()
```

**10:30:15 - Claude返回结果（12秒后）**
```
← Claude响应：{ "subQuestions": [...] }
→ extractDirectAiReviewPayload() ✓
→ 跳过JSON校对（直接解析成功）
→ normalizeReturnedAiSubQuestion()
  → 验证正向划线 ✓
  → 验证采分点 ✓
  → 验证遗漏点 ✓
  → 未验证错误标注 ❌
```

**10:30:15 - 保存批改结果**
```
保存到 mockExamAnswer.reviewJson
更新 reviewWorkflowStatus = "manual_pending"
更新 aiReviewFinishedAt = 10:30:15
```

**10:30:15 - 学生端状态（仍在轮询）**
```
GET /api/user/mock-exams/records/rec_123
reviewWorkflowStatus: "manual_pending"

显示：正在等待老师批改 ← 用户不知道AI已完成！
```

**10:32:00 - 管理员看到（2分钟后）**
```
刷新批改队列页面
状态：待审核（橙色）
```

**10:35:00 - 管理员领取**
```
POST /api/admin/mock-exam-reviews/records/rec_123/claim
manualReviewerId: admin_456
manualReviewLockExpiresAt: 12:35:00 (2小时后)
```

**10:36:00 - 管理员修改（微调分数和点评）**
```
在批改详情页修改
保存草稿（前端状态）
```

**10:37:00 - 管理员发布**
```
POST /api/admin/mock-exam-reviews/records/rec_123/publish

publishedReviewJson = reviewJson
publishedScore = score
reviewWorkflowStatus = "published"
publishedAt = 10:37:00
```

**10:37:05 - 学生看到结果（5秒后，下次轮询）**
```
GET /api/user/mock-exams/records/rec_123
reviewWorkflowStatus: "published"

→ 自动跳转到结果页
→ 显示完整批改结果
```

**总耗时：7分钟**
- AI批改：15秒
- 等待人工审核：7分钟（取决于管理员何时处理）

---

## 🐛 用户体验问题汇总

### 学生端问题：

1. **状态不明确**
   - `ai_pending`、`ai_processing`、`manual_pending` 都显示"正在等待老师批改"
   - 不知道AI是否已完成
   - 不知道大概还要等多久

2. **缺少通知**
   - 批改完成后没有推送通知
   - 需要手动刷新或依赖轮询

3. **看不到错误标注**
   - 只有绿色的得分点划线
   - 没有红色的错误标注
   - 不知道具体哪里错了

### 管理员端问题：

1. **队列信息不足**
   - 不知道队列积压多少
   - 不知道AI批改失败率
   - 不知道平均批改耗时

2. **无法调试Prompt**
   - 看不到最终发给AI的完整prompt
   - 修改后不知道效果
   - 无法对比不同版本

3. **批改质量无监控**
   - 不知道AI批改的准确率
   - 无法标记问题案例
   - 无法反馈给Prompt优化

4. **重批操作不清晰**
   - 不知道重批会发生什么
   - 已发布的试卷操作流程复杂
   - 缺少批量操作

---

这就是你AI批改系统在**使用层面的完整细节**。

还有什么具体的操作流程或细节需要我详细说明的吗？
