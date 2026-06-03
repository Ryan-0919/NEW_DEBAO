# 🔄 AI批改V2系统 - 完整流程说明

## 📊 批改流程详解

### 流程概览

```
1个大题（主观题）
  ↓
包含 N 个小问（sub_1, sub_2, sub_3...）
  ↓
【并发批改】N 个小问同时批改
  ↓
【分阶段批改】每个小问分2个阶段
  ↓
【合并结果】所有小问的结果合并
  ↓
【返回前端】完整的批改数据
  ↓
【前端渲染】显示给学生
```

---

## 🔍 详细流程

### 步骤1: 识别小问数量

```javascript
// server/lib/ai-review-v2/multi-handler.js

const subQuestions = extractSubQuestions(question);
// 例如：3个小问 [sub_1, sub_2, sub_3]

console.log('[多小问处理] 题目有3个小问');
console.log('[多小问处理] 使用逐个批改（避免JSON截断）');
```

---

### 步骤2: 并发启动N个批改任务

```javascript
// 同时启动3个小问的批改
console.log('[多小问处理] 开始并发批改 3 个小问');

Promise.all([
  reviewSubQuestion(sub_1),  // 小问1 并发
  reviewSubQuestion(sub_2),  // 小问2 并发
  reviewSubQuestion(sub_3),  // 小问3 并发
])
```

**关键**：3个小问**同时进行**，不是串行！

---

### 步骤3: 每个小问分2个阶段批改

#### 阶段1：核心批改
```javascript
// server/lib/ai-review-v2/phase-reviewer.js

console.log('[分阶段批改] 执行阶段1：核心批改');

// AI返回
{
  "id": "sub_1",
  "score": 5,
  "reviewComment": "你这道题答得不错...",  // 350字详细批改意见
  "answerMarks": [
    {"id": "m1", "status": "score", "comment": "结论正确"},
    {"id": "m2", "status": "wrong", "comment": "理由过简"}
  ]
}
```

**特点**：
- ✅ 返回分数、评语、标注
- ✅ 但**没有highlight**（文本定位）
- ✅ JSON短小（约500字符）

#### 阶段2：补充信息
```javascript
console.log('[分阶段批改] 执行阶段2：补充信息');

// AI返回
{
  "id": "sub_1",
  "answerMarkHighlights": [
    {"id": "m1", "highlight": "陈某提起的自诉属于法定自诉案件范围"},
    {"id": "m2", "highlight": "因为公安机关不予立案"}
  ],
  "missedPoints": [
    {"id": "mp1", "title": "侵犯人身权利", "description": "未说明侵权"}
  ]
}
```

**特点**：
- ✅ 返回highlight（从答案中定位文本）
- ✅ 返回遗漏要点
- ✅ JSON短小（约400字符）

---

### 步骤4: 合并阶段1和阶段2的结果

```javascript
// 合并
const finalResult = {
  id: "sub_1",
  score: phase1.score,                    // 来自阶段1
  reviewComment: phase1.reviewComment,    // 来自阶段1
  answerMarks: [
    {
      id: "m1",
      status: "score",                    // 来自阶段1
      score: 2,                           // 来自阶段1
      comment: "结论正确",                // 来自阶段1
      highlight: "陈某提起的自诉..."     // 来自阶段2 ← 合并！
    }
  ],
  missedPoints: phase2.missedPoints      // 来自阶段2
}
```

---

### 步骤5: 等待所有小问完成

```javascript
// 等待3个小问的批改全部完成
const results = await Promise.all([
  reviewSub1,  // 小问1结果
  reviewSub2,  // 小问2结果  
  reviewSub3   // 小问3结果
]);

console.log('[多小问处理] 完成，总分: 12/15');
```

**关键**：
- 3个小问并发执行
- 总耗时 ≈ 单个小问耗时（最慢的那个）
- 不是 3 × 单小问耗时

---

### 步骤6: 合并所有小问的结果

```javascript
// 最终返回的完整数据
{
  "source": "ai",
  "reviewSource": "ai-v2",
  "version": "v2",
  "totalScore": 12,         // 所有小问分数之和
  "subQuestions": [
    {...},  // 小问1的完整结果
    {...},  // 小问2的完整结果
    {...}   // 小问3的完整结果
  ]
}
```

---

### 步骤7: 保存到数据库

```javascript
// 保存批改结果
await prisma.mockExamAnswer.update({
  where: { id: answerId },
  data: {
    reviewJson: JSON.stringify(finalResult),
    score: finalResult.totalScore
  }
});
```

---

### 步骤8: 前端渲染

#### 前端组件：`AnnotatedAnswerText`

```jsx
// 接收数据
const { answerMarks } = subQuestion;

// 渲染
answerMarks.map(mark => {
  // 在答案中找到 mark.highlight 的位置
  // 根据 mark.status 决定颜色
  // - "score" → 绿色背景
  // - "wrong" → 红色背景
  // - "missing" → 橙色背景
  // 显示 mark.comment 作为批注
})
```

#### 前端显示效果

```
学生答案：
┌────────────────────────────────────┐
│ [✅ 陈某提起的自诉属于...]          │ ← 绿色
│    💬 结论正确 (+2分)              │
│                                    │
│ 。[❌ 因为公安机关不予立案]...     │ ← 红色
│    💬 理由过简 (0分)               │
└────────────────────────────────────┘

老师的批改意见：
你这道题答得不错，能准确判断...
（350字详细批改意见）
...继续加油！
```

---

## ✅ 总结

### 是的！你的理解是对的！

**流程**：
1. ✅ **N个AI并发**对N个小问进行批改
2. ✅ 每个小问**分2个阶段**（核心+补充）
3. ✅ **合并**所有小问的结果
4. ✅ **渲染**到前端

### 关键特点

| 特点 | 说明 |
|------|------|
| **并发执行** | 3个小问同时批改，速度快 |
| **分阶段批改** | 每个小问分2次调用AI，避免JSON截断 |
| **结果合并** | 阶段1+阶段2合并，小问1+小问2+小问3合并 |
| **前端渲染** | 使用highlight定位，根据status着色 |

---

## 🚀 现在重启服务器

修改已保存，准备重启...
