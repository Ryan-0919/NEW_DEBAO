# AI批改提示词架构混乱问题分析

## 🔴 当前提示词来源（太混乱了！）

### 1️⃣ 代码硬编码的默认提示词
**位置：** `src/shared/mock-exam-ai-review-config.js`

```
DEFAULT_AI_REVIEW_SYSTEM_PROMPT                    (系统提示词)
DEFAULT_AI_REVIEW_USER_PROMPT_TEMPLATE             (用户提示词模板)
DEFAULT_AI_REVIEW_GRADING_PRINCIPLES_TEMPLATE      (批改原则模板)
DEFAULT_AI_REVIEW_OUTPUT_REQUIREMENTS_PROMPT       (输出要求)
DEFAULT_AI_REVIEW_JSON_NORMALIZER_SYSTEM_PROMPT    (JSON修复器系统提示词)
DEFAULT_AI_REVIEW_JSON_NORMALIZER_USER_PROMPT_TEMPLATE (JSON修复器用户提示词)
AI_REVIEW_OUTPUT_JSON_EXAMPLE                      (JSON示例)
```

**特点：**
- ✅ 有版本控制
- ✅ 可以随代码部署
- ❌ 修改需要发版
- ❌ 运营/产品无法直接调整

---

### 2️⃣ 数据库存储的提示词
**位置：** `systemConfig.mockExamAiReviewConfigJson`

```sql
SELECT mockExamAiReviewConfigJson FROM systemConfig WHERE id = 1;
```

**JSON结构：**
```json
{
  "systemPrompt": "...",
  "userPromptTemplate": "...",
  "gradingPrinciplesTemplate": "...",
  "outputRequirementsPrompt": "...",
  "jsonNormalizerSystemPrompt": "...",
  "jsonNormalizerUserPromptTemplate": "..."
}
```

**特点：**
- ✅ 可以动态修改
- ✅ 不需要发版
- ❌ 没有版本历史
- ❌ 容易被误改
- ❌ 难以回滚

---

### 3️⃣ 代码中动态追加的硬性校验规则
**位置：** `server/lib/mock-exams.js:1403-1423`

```javascript
const REQUIRED_AI_REVIEW_OUTPUT_REQUIREMENTS = [
  "硬性校验：只能返回一个合法 JSON 对象...",
  "硬性校验：所有字符串内容中禁止直接使用未转义的英文双引号...",
  "硬性校验：answerMarks 必须同时体现得分点和错误点...",
  // ... 共20条硬性校验规则
];

const appendRequiredAiReviewOutputRequirements = (value = "") => {
  const base = `${value ?? ""}`.trim();
  const missingRules = REQUIRED_AI_REVIEW_OUTPUT_REQUIREMENTS.filter((rule) => !base.includes(rule));
  return [base, ...missingRules, ...].join("\n");
};
```

**特点：**
- ✅ 确保关键规则不会被删除
- ❌ 与数据库配置混在一起
- ❌ 可能与数据库配置冲突或重复
- ❌ 难以理解最终生效的是什么

---

## 🌊 提示词组装流程（像俄罗斯套娃）

### 第一层：获取配置
```javascript
// 1. 从数据库读取
const systemConfig = await db.systemConfig.findUnique({ where: { id: 1 } });
const dbConfig = JSON.parse(systemConfig.mockExamAiReviewConfigJson);

// 2. 与默认值合并
const finalConfig = normalizeMockExamAiReviewConfig(
  dbConfig,  // 数据库配置（优先）
  {          // 环境变量配置（fallback）
    systemPrompt: DEFAULT_AI_REVIEW_SYSTEM_PROMPT,
    userPromptTemplate: DEFAULT_AI_REVIEW_USER_PROMPT_TEMPLATE,
    gradingPrinciplesTemplate: DEFAULT_AI_REVIEW_GRADING_PRINCIPLES_TEMPLATE,
    outputRequirementsPrompt: DEFAULT_AI_REVIEW_OUTPUT_REQUIREMENTS_PROMPT,
  }
);
```

### 第二层：追加硬性校验
```javascript
const outputRequirements = appendRequiredAiReviewOutputRequirements(
  finalConfig.outputRequirementsPrompt  // 可能来自数据库或默认值
);
// 结果：数据库内容 + 代码中的20条硬性规则 + JSON示例
```

### 第三层：组装批改原则
```javascript
const gradingPrinciples = finalConfig.gradingPrinciplesTemplate
  .replace("{{题目}}", question.stem)
  .replace("{{材料}}", question.material)
  .replace("{{参考解析}}", question.analysis)
  .replace("{{小问批改依据}}", subQuestionRubrics);
```

### 第四层：组装最终User Prompt
```javascript
const finalUserPrompt = finalConfig.userPromptTemplate
  .replace("{{批改原则}}", gradingPrinciples)      // 第三层结果
  .replace("{{输出要求}}", outputRequirements)     // 第二层结果
  .replace("{{题目数据}}", JSON.stringify(questionData));
```

### 第五层：发送给AI
```javascript
{
  messages: [
    { role: "system", content: finalConfig.systemPrompt },
    { role: "user", content: finalUserPrompt }
  ]
}
```

---

## 😵 实际问题示例

### 问题1：不知道最终发给AI的是什么
```
管理员在后台改了 outputRequirementsPrompt，以为生效了
但实际上代码中的 REQUIRED_AI_REVIEW_OUTPUT_REQUIREMENTS 又追加了一遍
导致最终prompt = 后台版本 + 代码硬编码版本（可能重复、可能冲突）
```

### 问题2：改了没效果
```
管理员：我在后台把 systemPrompt 改成了"你必须标注错误"
开发：但是 outputRequirements 里的规则可能冲突了
管理员：什么是 outputRequirements？
开发：就是那个...额...在另一个字段里...
管理员：😵‍💫
```

### 问题3：无法调试
```
AI批改结果不对，想看最终发给AI的prompt是什么？
→ 需要找到数据库配置
→ 手动运行 normalizeMockExamAiReviewConfig
→ 手动运行 appendRequiredAiReviewOutputRequirements  
→ 手动替换占位符
→ 才能看到最终内容
```

### 问题4：版本管理混乱
```
生产环境批改效果变差了，想回滚到上周的prompt
→ 数据库没有历史记录
→ 不知道是谁改的
→ 不知道改了什么
→ 无法回滚
```

---

## 🎯 提示词架构应该长什么样

### 理想架构：清晰分层

```
┌─────────────────────────────────────────┐
│  Layer 1: 基础提示词（代码默认）          │
│  - 核心角色定义                           │
│  - 基本批改原则                           │
│  - JSON格式要求                          │
│  【很少改动，随代码版本控制】              │
└─────────────────────────────────────────┘
              ↓ 继承
┌─────────────────────────────────────────┐
│  Layer 2: 可配置提示词（数据库）          │
│  - 批改风格调整                           │
│  - 特殊强调项                             │
│  - 评分标准微调                           │
│  【可动态修改，有版本历史】               │
└─────────────────────────────────────────┘
              ↓ 合并
┌─────────────────────────────────────────┐
│  Layer 3: 题目数据（运行时生成）          │
│  - 题目内容                               │
│  - 采分点                                 │
│  - 学生答案                               │
│  【每次批改动态生成】                     │
└─────────────────────────────────────────┘
              ↓ 组装
┌─────────────────────────────────────────┐
│  最终Prompt → 发送给AI                   │
└─────────────────────────────────────────┘
```

---

## ✅ 解决方案建议

### 方案A：简化为单一模板（推荐）

**核心思想：** 把所有提示词合并为一个完整的模板

```javascript
// 数据库只存一个字段
{
  "completePromptTemplate": `
你是国家统一法律职业资格考试主观题阅卷老师。

【批改原则】
{{批改原则}}

【题目数据】  
{{题目数据}}

【输出要求】
1. 必须同时标注得分点和错误点
2. 必须返回JSON格式
...

【JSON示例】
{{JSON示例}}
`
}
```

**优点：**
- ✅ 一目了然
- ✅ 容易理解
- ✅ 容易调试
- ❌ 灵活性降低

---

### 方案B：清晰的三层架构（最推荐）⭐

#### 代码层（不可变基础）
```javascript
// src/shared/ai-review-prompt-base.js
export const AI_REVIEW_BASE_PROMPT = {
  role: "你是国家统一法律职业资格考试主观题阅卷老师。",
  jsonFormat: "只能返回合法JSON对象",
  requiredFields: ["subQuestions", "answerMarks", "rubricPoints", "missedPoints"]
};
```

#### 配置层（可修改策略）
```javascript
// 数据库 promptConfig 表
{
  id: 1,
  name: "默认批改策略",
  version: "v2.1.0",
  style: "严格按采分点",
  emphasisOnErrors: true,  // 强调标注错误
  reviewCommentLength: 300,
  createdAt: "2024-01-01",
  createdBy: "admin"
}
```

#### 题目层（运行时数据）
```javascript
// 每次批改动态组装
{
  question: {...},
  rubricPoints: [...],
  studentAnswer: "..."
}
```

---

### 方案C：提示词版本管理系统

**新增表结构：**
```sql
CREATE TABLE ai_review_prompt_versions (
  id INT PRIMARY KEY,
  version VARCHAR(20),
  systemPrompt TEXT,
  userPromptTemplate TEXT,
  outputRequirements TEXT,
  isActive BOOLEAN,
  createdBy VARCHAR(50),
  createdAt DATETIME,
  comment TEXT,
  metrics JSON  -- 存储这个版本的批改效果指标
);
```

**好处：**
- ✅ 可以A/B测试不同prompt
- ✅ 可以回滚到历史版本
- ✅ 可以对比不同版本效果
- ✅ 有审计日志

---

## 🚀 立即可做的改进

### 改进1：添加Prompt调试接口

```javascript
// GET /api/admin/mock-exam-reviews/debug-prompt/:recordId
// 返回最终发给AI的完整prompt
{
  "systemPrompt": "实际发送的system prompt...",
  "userPrompt": "实际发送的user prompt...",
  "config": {
    "provider": "openai-compatible",
    "model": "gpt-4",
    "temperature": 0.2
  },
  "promptBreakdown": {
    "basePrompt": "来自代码",
    "customizations": "来自数据库",
    "hardRules": "代码追加的20条规则",
    "questionData": "题目数据"
  }
}
```

### 改进2：Prompt预览功能

在管理后台添加一个"预览最终Prompt"按钮，让管理员修改前看到最终效果。

### 改进3：记录每次批改使用的Prompt

```javascript
// mockExamAnswer 表添加字段
{
  promptSnapshot: "批改时使用的完整prompt",
  promptVersion: "v2.1.0",
  promptHash: "abc123"  // 用于检测prompt是否变化
}
```

---

你想先从哪个方案开始？我建议：
1. **立即做：** 添加调试接口（改进1）- 让你能看到实际发给AI的是什么
2. **本周做：** 实施方案B（清晰三层架构）- 彻底解决混乱问题
3. **下周做：** 添加版本管理（方案C）- 方便以后优化
