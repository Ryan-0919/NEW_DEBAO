# 当前AI批改系统完整概述

基于我对代码的深入分析，这是你现有AI批改系统的完整图景：

---

## 📊 系统架构概览

### **批改流程全貌**

```
用户交卷
  ↓
finalizeMockExamRecord (判断是否需要批改)
  ↓
reviewWorkflowStatus = "ai_pending"
  ↓
enqueueMockExamAiReview (加入队列)
  ↓
pumpMockExamAiReviewQueue (队列定时轮询)
  ↓ 
autoReviewMockExamRecord (执行批改)
  ↓
buildSubjectiveReviewJson (构建批改结果)
  ↓
  ├─ AI批改分支：requestOpenAiCompatibleReview
  │   ↓
  │   Claude批改 → JSON解析 → JSON校对 → 验证 → 返回结果
  │
  └─ 规则批改分支：buildRuleBasedSubjectiveReviewJson
      ↓
      关键词匹配 → 返回结果
  ↓
保存到 reviewJson
  ↓
reviewWorkflowStatus = "manual_pending" (等待人工审核)
  ↓
管理员发布
  ↓
reviewWorkflowStatus = "published"
publishedReviewJson = reviewJson (学生可见)
```

---

## 🏗️ 核心组件详解

### 1. **队列系统** (`server/lib/mock-exam-ai-review-queue.js`)

**工作原理：**
- **定时轮询**：每3秒检查一次队列（`queuePollIntervalMs`）
- **并发控制**：最多3个任务同时执行（`maxConcurrency`）
- **重试机制**：失败后最多重试3次（`maxRetryCount`），每次间隔15秒（`retryDelayMs`）
- **冷却机制**：连续失败3次后进入2小时冷却期（`retryCooldownMs`）

**关键函数：**
```javascript
// 启动队列（服务器启动时调用）
startMockExamAiReviewQueue({ db: prisma })

// 加入队列
enqueueMockExamAiReview({ db, recordId, adminId })

// 队列轮询（每3秒执行）
pumpMockExamAiReviewQueue({ db })

// 执行单个批改任务
consumeQueuedRecord({ db, recordId })
```

**队列状态判断：**
```javascript
// 检查是否可以进入队列
canQueueAutoReview({ 
  retryCount,     // 已重试次数
  lastError,      // 上次错误信息
  runtimeConfig   // 运行时配置
})

// 检查是否有可处理的记录
hasQueuedRecords({ db })
```

---

### 2. **Prompt系统** (超级混乱！)

#### **配置来源有5个：**

**来源1：代码默认值**
- 位置：`src/shared/mock-exam-ai-review-config.js`
- 内容：
  ```javascript
  DEFAULT_AI_REVIEW_SYSTEM_PROMPT = "你是国家统一法律职业资格考试主观题阅卷老师..."
  DEFAULT_AI_REVIEW_USER_PROMPT_TEMPLATE = "你现在只批改 1 道主观大题..."
  DEFAULT_AI_REVIEW_GRADING_PRINCIPLES_TEMPLATE = "..."
  DEFAULT_AI_REVIEW_OUTPUT_REQUIREMENTS_PROMPT = "只能返回一个合法 JSON 对象..."
  ```

**来源2：环境变量**
- 位置：`server/lib/config.js`
- 读取：`process.env.MOCK_EXAM_AI_*`
- 优先级：低于数据库配置

**来源3：数据库配置**
- 表：`systemConfig.mockExamAiReviewConfigJson`
- 字段：
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

**来源4：代码硬编码的20条"硬性校验"规则**
- 位置：`server/lib/mock-exams.js:1403-1423`
- 内容：
  ```javascript
  REQUIRED_AI_REVIEW_OUTPUT_REQUIREMENTS = [
    "硬性校验：只能返回一个合法 JSON 对象...",
    "硬性校验：answerMarks 必须同时体现得分点和错误点...",
    // ... 共20条
  ]
  ```
- **这些规则会自动追加到 outputRequirementsPrompt 后面！**

**来源5：运行时动态组装**
- 题目数据、采分点、学生答案会实时插入到Prompt中

#### **Prompt组装过程：**

```javascript
// 1. 获取配置（数据库 + 环境变量 + 代码默认值）
const runtimeConfig = await getMockExamAiReviewConfig({ db });

// 2. 追加硬性校验规则
const outputRequirements = appendRequiredAiReviewOutputRequirements(
  runtimeConfig.outputRequirementsPrompt
);
// 结果 = 数据库内容 + 20条硬性规则 + JSON示例

// 3. 组装批改原则
const gradingPrinciples = runtimeConfig.gradingPrinciplesTemplate
  .replace("{{题目}}", question.stem)
  .replace("{{材料}}", question.material)
  .replace("{{参考解析}}", question.analysis)
  .replace("{{小问批改依据}}", subQuestionRubrics);

// 4. 组装最终User Prompt
const finalUserPrompt = runtimeConfig.userPromptTemplate
  .replace("{{批改原则}}", gradingPrinciples)
  .replace("{{输出要求}}", outputRequirements)
  .replace("{{题目数据}}", JSON.stringify(questionData));

// 5. 发送给AI
const messages = [
  { role: "system", content: runtimeConfig.systemPrompt },
  { role: "user", content: finalUserPrompt }
];
```

**问题：**
- ❌ 无法看到最终发给AI的完整prompt
- ❌ 数据库配置可能被代码规则覆盖/重复
- ❌ 修改后无法回滚
- ❌ 不知道哪个版本效果好

---

### 3. **AI批改执行** (`requestOpenAiCompatibleReview`)

#### **完整流程：**

```javascript
// 第1步：发送请求给Claude
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-6",  // 或其他模型
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  })
});

// 第2步：解析响应
const rawText = await response.text();
const payload = JSON.parse(rawText);

// 第3步：提取JSON（3次尝试）
let parsed = null;

// 尝试1：直接从payload中提取
parsed = extractDirectAiReviewPayload(payload);

// 尝试2：从文本中提取（支持Markdown代码块）
if (!parsed) {
  const texts = extractCompletionTexts(payload);
  parsed = parseAiReviewPayloadFromTexts(texts);
}

// 尝试3：调用JSON校对AI修复
if (!parsed) {
  parsed = await requestJsonRepairFromAi({
    runtimeConfig,
    endpoint,
    brokenText: texts[0] || rawText,
    signal: controller.signal
  });
}

// 第4步：如果还是失败，抛出错误
if (!parsed || !Array.isArray(parsed.subQuestions)) {
  throw new Error("批改返回结果不是有效 JSON");
}

// 第5步：返回解析后的结果
return parsed;
```

#### **JSON校对AI的工作原理：**

```javascript
// 如果jsonNormalizerEnabled=true，会调用另一个AI修复JSON
const repairResponse = await fetch(jsonNormalizerEndpoint, {
  method: "POST",
  body: JSON.stringify({
    model: jsonNormalizerModel || model,  // 默认用同一个模型
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "你是 JSON 修复器。只能返回修复后的 JSON..."
      },
      {
        role: "user", 
        content: "请修复下面这段 AI 批改 JSON：\n\n" + brokenText
      }
    ]
  })
});
```

**配置字段：**
- `jsonNormalizerEnabled`: true/false（默认true）
- `jsonNormalizerBaseUrl`: 校对AI的地址（默认用主AI地址）
- `jsonNormalizerModel`: 校对AI的模型（默认用主模型）
- `jsonNormalizerApiKey`: 校对AI的密钥（默认用主密钥）

---

### 4. **验证系统** (不完整！)

#### **当前验证内容：**

**验证1：正向划线验证** ✅
```javascript
assertPositiveAnswerMarksMatchScore({
  answerMarks,
  score,
  title
})
```
- ✅ 检查得分 > 0 时是否有正向划线
- ✅ 检查正向划线分数总和是否等于得分

**验证2：采分点验证** ✅
```javascript
assertAiMissedPointsReturned({
  rubricPoints,
  missedPoints,
  title
})
```
- ✅ 检查未命中的采分点是否在 missedPoints 中
- ✅ 检查 missedPoints 数量是否足够

**验证3：答案标记验证** ✅
```javascript
normalizeAndValidateAiAnswerMarks({
  rawAnswerMarks,
  answerText,
  answerSegments,
  title
})
```
- ✅ 检查划线是否能对应到学生原文
- ✅ 检查划线范围是否合理（≤60字符）
- ✅ 检查 status 是否合法

**缺失的验证：** ❌
- ❌ **没有验证错误标注**（status:wrong）是否存在
- ❌ 没有验证错误标注的comment是否详细
- ❌ 没有验证标注覆盖度
- ❌ 没有验证 reviewComment 质量

**这就是为什么AI"只打对不打错"！**

---

### 5. **状态管理** (混乱！)

#### **当前状态值：**
```javascript
const WORKFLOW_STATUSES = [
  "not_required",    // 无需批改
  "ai_pending",      // 等待AI批改
  "ai_processing",   // AI批改中
  "manual_pending",  // 等待人工审核
  "published"        // 已发布
];
```

#### **状态流转：**

**正常流程：**
```
交卷 → ai_pending → ai_processing → manual_pending → published
```

**AI重批：**
```
published → ai_pending → ai_processing → manual_pending
```

**问题：**
- ❌ AI批改完成后是 `manual_pending`，不是 `published`
- ❌ 用户看不出AI是否已完成
- ❌ `ai_pending` 和 `ai_processing` 对用户来说没区别
- ❌ 没有 `ai_failed` 状态

#### **publishedReviewJson 的混乱逻辑：**

```javascript
// reviewJson: 最新的批改结果（管理员可见）
// publishedReviewJson: 已发布的批改结果（学生可见）

// 问题1：重批时 publishedReviewJson 不会自动清空
// 导致：学生看到的是旧版本批改结果

// 问题2：getReviewWorkflowStatus 的判断逻辑
if (record.publishedAt) return "published";
if (record.answers.some(a => a.publishedReviewJson)) return "published";
// 即使 publishedAt=null，只要有 publishedReviewJson 就显示为 published
```

**我已经修复了重批问题：**
- 重批时会清空 `publishedReviewJson` 和 `publishedScore`

---

### 6. **规则批改** (fallback机制)

**触发条件：**
```javascript
// 1. provider !== "openai-compatible"
if (!isOpenAiCompatibleProvider(runtimeConfig)) {
  return buildRuleBasedSubjectiveReviewJson({ question, answer });
}

// 2. 缺少必要配置（baseUrl、apiKey、model）
if (!isOpenAiCompatibleReady(runtimeConfig)) {
  throw new Error("远程批改配置不完整");
}
```

**规则批改逻辑：**
```javascript
function scoreSubjectiveByRubric({ answerText, rubricPoints, maxScore }) {
  // 1. 如果答案为空 → 0分
  if (!answerText.trim()) {
    return { score: 0, rubricPoints: [], answerMarks: [] };
  }
  
  // 2. 如果没有采分点 → 按字数评分（180字=满分）
  if (!rubricPoints.length) {
    const score = (answerText.length / 180) * maxScore;
    return { score, rubricPoints: [], answerMarks: [] };
  }
  
  // 3. 简单关键词匹配
  rubricPoints.forEach(point => {
    const keywords = point.title.split(/[,，。；;、：:（）()《》"""]+/);
    const matched = keywords.find(kw => answerText.includes(kw));
    if (matched) {
      point.hit = true;
      point.awardedScore = point.maxScore;
    }
  });
}
```

**问题：**
- ❌ 关键词匹配太粗糙
- ❌ 无法识别语义相反（如"正当防卫" vs "不属于正当防卫"）
- ❌ 字数评分不科学

---

## 📁 数据库结构

### **核心表：**

#### `mockExamRecord` (考试记录)
```sql
reviewWorkflowStatus           VARCHAR(50)    -- 批改状态
aiReviewStartedAt             DATETIME        -- AI批改开始时间
aiReviewFinishedAt            DATETIME        -- AI批改完成时间
aiReviewNextRetryAt           DATETIME        -- 下次重试时间
aiReviewRetryCount            INT             -- 已重试次数
lastAiReviewError             TEXT            -- 最后的错误信息
reviewedAt                    DATETIME        -- 批改完成时间
publishedAt                   DATETIME        -- 发布时间
manualReviewVersion           INT             -- 人工批改版本号
```

#### `mockExamAnswer` (答案)
```sql
answerJson                    TEXT            -- 学生答案
reviewJson                    TEXT            -- 最新批改结果（JSON）
publishedReviewJson           TEXT            -- 已发布批改结果（JSON）
score                         DECIMAL         -- 最新得分
publishedScore                DECIMAL         -- 已发布得分
```

#### `systemConfig` (系统配置)
```sql
mockExamAiReviewConfigJson    TEXT            -- AI批改配置（JSON）
```

**reviewJson 结构：**
```json
{
  "source": "ai",
  "reviewSource": "ai",
  "reviewProvider": "openai-compatible",
  "totalScore": 15,
  "maxScore": 20,
  "subQuestions": [
    {
      "id": "sub_1",
      "title": "小问1",
      "answer": "学生的答案...",
      "score": 8,
      "maxScore": 10,
      "reviewComment": "点评...",
      "referenceAnswer": "参考答案...",
      "abilityLabel": "证明责任",
      "rubricPoints": [
        {
          "id": "rubric_1",
          "title": "污染行为证明责任",
          "maxScore": 5,
          "awardedScore": 5,
          "hit": true,
          "comment": "已命中"
        }
      ],
      "missedPoints": [
        {
          "id": "missed_1",
          "title": "遗漏其他养殖户的证明责任",
          "score": 2,
          "comment": "该点未体现"
        }
      ],
      "answerMarks": [
        {
          "id": "mark_1",
          "highlight": "白云制药厂排放废气",
          "status": "score",
          "score": 5,
          "start": 10,
          "end": 20,
          "comment": "命中采分点"
        },
        {
          "id": "mark_2",
          "highlight": "由白云制药厂承担证明责任",
          "status": "wrong",
          "comment": "主体写反了，应该是赵某承担"
        }
      ]
    }
  ]
}
```

---

## ⚙️ 配置参数完整列表

### **AI配置：**
```javascript
provider: "openai-compatible" | "rules"  // AI提供商
baseUrl: "https://api.anthropic.com"     // API地址
apiKey: "sk-ant-xxx"                      // API密钥
model: "claude-sonnet-4-6"                // 模型
temperature: 0.2                          // 温度（0-2）
maxTokens: 8192                           // 最大token数
timeoutMs: 120000                         // 超时时间（2分钟）
```

### **队列配置：**
```javascript
disableQueue: false                       // 是否禁用队列
maxConcurrency: 3                         // 最大并发数
maxRetryCount: 3                          // 最大重试次数
retryDelayMs: 15000                       // 重试间隔（15秒）
retryCooldownMs: 7200000                  // 冷却时间（2小时）
queuePollIntervalMs: 3000                 // 轮询间隔（3秒）
```

### **验证配置：**
```javascript
strictAnswerMarkValidation: true          // 严格验证模式
```

### **JSON校对配置：**
```javascript
jsonNormalizerEnabled: true               // 启用JSON校对
jsonNormalizerBaseUrl: ""                 // 校对AI地址（默认用主地址）
jsonNormalizerModel: ""                   // 校对AI模型（默认用主模型）
jsonNormalizerApiKey: ""                  // 校对AI密钥（默认用主密钥）
jsonNormalizerMaxTokens: 16000            // 校对最大token
jsonNormalizerSystemPrompt: "..."         // 校对系统提示词
jsonNormalizerUserPromptTemplate: "..."   // 校对用户提示词
```

### **Prompt配置：**
```javascript
systemPrompt: "你是阅卷老师..."          // 系统提示词
userPromptTemplate: "{{批改原则}}..."     // 用户提示词模板
gradingPrinciplesTemplate: "{{题目}}..."  // 批改原则模板
outputRequirementsPrompt: "只能返回..."   // 输出要求
```

---

## 🐛 已知问题总结

### **高优先级（影响批改质量）：**
1. ❌ **AI只打对不打错** - 没有验证错误标注
2. ❌ **Prompt来源混乱** - 5个来源，难以管理
3. ❌ **无法调试Prompt** - 看不到最终发给AI的内容
4. ✅ **重批显示旧数据** - publishedReviewJson未清空（已修复）

### **中优先级（影响体验）：**
5. ❌ **状态不清晰** - 用户不知道AI是否已完成
6. ❌ **错误信息不友好** - 技术细节太多
7. ❌ **配置被硬编码覆盖** - disableQueue 强制为 false

### **低优先级（功能性）：**
8. ❌ **无监控** - 不知道队列积压、失败率
9. ❌ **无日志** - 批改失败了不知道原因
10. ❌ **规则批改太简单** - 只做关键词匹配

---

## 💪 系统优势

虽然有很多问题，但你的系统也有很多优秀的设计：

1. ✅ **完整的队列系统** - 并发控制、重试机制、冷却机制
2. ✅ **JSON校对机制** - 三层fallback保证JSON解析成功率
3. ✅ **灵活的配置** - 数据库配置支持动态修改
4. ✅ **版本控制** - manualReviewVersion 跟踪批改版本
5. ✅ **publishedReviewJson** - 保护已发布版本不被覆盖（虽然有bug）
6. ✅ **规则批改fallback** - AI失败时还有兜底

---

## 🎯 最紧急的3个修复

1. **增加错误标注验证** - 让AI必须标注错误
2. **实现Prompt调试接口** - 让你能看到完整prompt
3. **修复disableQueue硬编码** - 让配置真正生效

---

这就是你整个AI批改系统的全貌。哪些部分需要我详细解释？或者你想先修复哪个问题？
