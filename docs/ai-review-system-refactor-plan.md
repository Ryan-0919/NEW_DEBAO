# AI批改系统全面重构方案

## 🔴 当前系统的核心问题

### 1. 提示词管理混乱
- **5个提示词来源**：代码默认值、数据库配置、环境变量、硬编码规则、动态追加
- **无法调试**：看不到最终发给AI的完整prompt
- **配置冲突**：数据库配置可能被代码覆盖（如 disableQueue）
- **无版本管理**：修改后无法回滚，不知道谁改的

### 2. 批改质量问题
- **只打对不打错**：AI不标注错误，只标注得分点
- **验证逻辑不完整**：只验证正向划线，不验证错误划线
- **规则批改太简单**：只做关键词匹配，质量差

### 3. 状态流转混乱
- **重批显示旧数据**：publishedReviewJson 未清空（已修复）
- **状态不清晰**：用户不知道AI是否已批改完成
- **错误处理差**：批改失败后用户看不到原因

### 4. 系统不可观测
- **无监控**：不知道队列积压、失败率、平均耗时
- **无日志**：批改失败了不知道是哪个环节出问题
- **无统计**：不知道AI批改的准确率如何

---

## ✅ 重构目标

1. **提示词清晰可控** - 单一来源、可见可测、版本管理
2. **批改质量提升** - 强制标注错误、完整验证、多轮Review
3. **状态流转清晰** - 明确的状态机、清晰的UI反馈
4. **系统可观测** - 完整日志、实时监控、性能统计

---

## 🏗️ 重构架构设计

### 阶段1：核心重构（1-2周）

#### 1.1 提示词系统重构

**新架构：**
```
┌─────────────────────────────────────────┐
│ Layer 1: 基础框架（代码，不可变）        │
│ - 角色定义（法考阅卷老师）               │
│ - JSON格式要求                          │
│ - 输出字段定义                          │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Layer 2: 批改策略（数据库，可修改）      │
│ - 评分原则                              │
│ - 错误标注要求                          │
│ - 批改风格                              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Layer 3: 题目数据（运行时生成）          │
│ - 题目内容                              │
│ - 采分点                                │
│ - 学生答案                              │
└─────────────────────────────────────────┘
```

**新表结构：**
```sql
CREATE TABLE ai_review_prompt_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  version VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  
  -- 核心Prompt
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  
  -- 批改策略
  require_error_annotation BOOLEAN DEFAULT true,
  require_missed_points BOOLEAN DEFAULT true,
  strict_validation BOOLEAN DEFAULT true,
  
  -- AI配置
  model VARCHAR(50) DEFAULT 'claude-sonnet-4-6',
  temperature DECIMAL(3,2) DEFAULT 0.5,
  max_tokens INT DEFAULT 8000,
  
  -- JSON校对
  json_repair_enabled BOOLEAN DEFAULT true,
  json_repair_model VARCHAR(50) DEFAULT 'claude-haiku-4-5',
  
  -- 元数据
  created_by VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  comment TEXT,
  
  UNIQUE KEY (name, version)
);

CREATE TABLE ai_review_prompt_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  template_id INT,
  action ENUM('create', 'update', 'activate', 'deactivate'),
  changed_by VARCHAR(50),
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  changes JSON,
  FOREIGN KEY (template_id) REFERENCES ai_review_prompt_templates(id)
);
```

**新API：**
```javascript
// 获取当前激活的模板
GET /api/admin/ai-review/prompt-templates/active

// 创建新版本
POST /api/admin/ai-review/prompt-templates
{
  "name": "标准批改v2.0",
  "version": "2.0.0",
  "systemPrompt": "...",
  "userPromptTemplate": "...",
  "requireErrorAnnotation": true,
  "model": "claude-sonnet-4-6"
}

// 激活某个版本
POST /api/admin/ai-review/prompt-templates/:id/activate

// 对比两个版本
GET /api/admin/ai-review/prompt-templates/:id1/compare/:id2

// 调试：查看完整prompt
GET /api/admin/ai-review/records/:recordId/debug-prompt
```

#### 1.2 批改验证系统重构

**新验证器：**
```javascript
class AiReviewValidator {
  constructor(config) {
    this.strict = config.strictValidation;
    this.requireErrors = config.requireErrorAnnotation;
  }

  validate(reviewResult, questionMeta) {
    const errors = [];
    
    // 1. 验证正向标注
    errors.push(...this.validatePositiveMarks(reviewResult));
    
    // 2. 验证错误标注（新增）
    if (this.requireErrors) {
      errors.push(...this.validateErrorMarks(reviewResult));
    }
    
    // 3. 验证遗漏点
    errors.push(...this.validateMissedPoints(reviewResult));
    
    // 4. 验证分数一致性
    errors.push(...this.validateScoreConsistency(reviewResult));
    
    // 5. 验证覆盖度（新增）
    errors.push(...this.validateCoverage(reviewResult));
    
    if (errors.length > 0 && this.strict) {
      throw new ValidationError(errors);
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  // 新增：验证错误标注
  validateErrorMarks(reviewResult) {
    const errors = [];
    const { answerMarks, missedPoints, rubricPoints } = reviewResult;
    
    // 如果有未命中的采分点，必须有错误标注
    const missedCount = rubricPoints.filter(p => !p.hit).length;
    const wrongMarks = answerMarks.filter(m => m.status === 'wrong');
    
    if (missedCount > 0 && wrongMarks.length === 0) {
      errors.push({
        type: 'MISSING_ERROR_MARKS',
        message: `有${missedCount}个未命中的采分点，但没有标注任何错误`,
        severity: 'error'
      });
    }
    
    // 错误标注必须有说明
    wrongMarks.forEach(mark => {
      if (!mark.comment || mark.comment.length < 10) {
        errors.push({
          type: 'INVALID_ERROR_COMMENT',
          message: `错误标注"${mark.highlight}"缺少详细说明`,
          severity: 'warning'
        });
      }
    });
    
    return errors;
  }
  
  // 新增：验证覆盖度
  validateCoverage(reviewResult) {
    const errors = [];
    const { answerMarks, answer } = reviewResult;
    
    // 计算标注覆盖的字符数
    const markedChars = new Set();
    answerMarks.forEach(mark => {
      for (let i = mark.start; i < mark.end; i++) {
        markedChars.add(i);
      }
    });
    
    const coverageRate = markedChars.size / answer.length;
    
    if (coverageRate < 0.3 && answer.length > 100) {
      errors.push({
        type: 'LOW_COVERAGE',
        message: `标注覆盖率仅${(coverageRate * 100).toFixed(1)}%，可能遗漏重要内容`,
        severity: 'warning'
      });
    }
    
    return errors;
  }
}
```

#### 1.3 批改日志系统

**新表结构：**
```sql
CREATE TABLE ai_review_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  record_id VARCHAR(50) NOT NULL,
  question_id VARCHAR(50) NOT NULL,
  
  -- Prompt快照
  prompt_template_id INT,
  prompt_version VARCHAR(20),
  system_prompt_hash VARCHAR(64),
  user_prompt_hash VARCHAR(64),
  
  -- 请求信息
  model VARCHAR(50),
  temperature DECIMAL(3,2),
  request_tokens INT,
  response_tokens INT,
  latency_ms INT,
  
  -- 响应信息
  status ENUM('success', 'validation_failed', 'json_error', 'timeout', 'api_error'),
  validation_errors JSON,
  
  -- JSON校对
  json_repair_attempted BOOLEAN DEFAULT false,
  json_repair_success BOOLEAN,
  
  -- 时间戳
  started_at DATETIME,
  completed_at DATETIME,
  
  -- 原始数据（用于调试）
  raw_request JSON,
  raw_response TEXT,
  
  INDEX idx_record_id (record_id),
  INDEX idx_status (status),
  INDEX idx_started_at (started_at)
);
```

**使用方式：**
```javascript
// 每次批改都记录
const log = await AiReviewLogger.start({
  recordId,
  questionId,
  promptTemplateId,
  model,
  systemPrompt,
  userPrompt
});

try {
  const result = await callAiReview();
  await log.success(result);
} catch (error) {
  await log.fail(error);
}
```

#### 1.4 状态机重构

**新状态定义：**
```javascript
const REVIEW_STATES = {
  // 初始状态
  NOT_REQUIRED: 'not_required',        // 无需批改（无主观题）
  
  // AI批改流程
  AI_PENDING: 'ai_pending',            // 等待AI批改
  AI_PROCESSING: 'ai_processing',      // AI批改中
  AI_COMPLETED: 'ai_completed',        // AI批改完成（新增）
  AI_FAILED: 'ai_failed',              // AI批改失败
  
  // 人工审核流程
  MANUAL_REVIEW: 'manual_review',      // 人工审核中
  MANUAL_COMPLETED: 'manual_completed',// 人工审核完成
  
  // 最终状态
  PUBLISHED: 'published'               // 已发布给学生
};

const STATE_TRANSITIONS = {
  [REVIEW_STATES.AI_PENDING]: [
    REVIEW_STATES.AI_PROCESSING,
    REVIEW_STATES.MANUAL_REVIEW
  ],
  [REVIEW_STATES.AI_PROCESSING]: [
    REVIEW_STATES.AI_COMPLETED,
    REVIEW_STATES.AI_FAILED
  ],
  [REVIEW_STATES.AI_COMPLETED]: [
    REVIEW_STATES.PUBLISHED,           // 直接发布
    REVIEW_STATES.MANUAL_REVIEW,       // 人工审核
    REVIEW_STATES.AI_PENDING           // 重新批改
  ],
  [REVIEW_STATES.AI_FAILED]: [
    REVIEW_STATES.AI_PENDING,          // 重试
    REVIEW_STATES.MANUAL_REVIEW        // 转人工
  ],
  [REVIEW_STATES.MANUAL_REVIEW]: [
    REVIEW_STATES.MANUAL_COMPLETED,
    REVIEW_STATES.AI_PENDING           // 重新AI批改
  ],
  [REVIEW_STATES.MANUAL_COMPLETED]: [
    REVIEW_STATES.PUBLISHED,
    REVIEW_STATES.AI_PENDING           // 重新批改
  ],
  [REVIEW_STATES.PUBLISHED]: [
    REVIEW_STATES.AI_PENDING           // 重新批改
  ]
};
```

**状态转换API：**
```javascript
// 状态转换
async function transitionReviewState(recordId, targetState, options = {}) {
  return await db.$transaction(async (tx) => {
    const record = await tx.mockExamRecord.findUnique({
      where: { id: recordId }
    });
    
    const currentState = record.reviewWorkflowStatus;
    
    // 验证转换是否合法
    if (!STATE_TRANSITIONS[currentState]?.includes(targetState)) {
      throw new Error(
        `Invalid state transition: ${currentState} → ${targetState}`
      );
    }
    
    // 执行转换
    await tx.mockExamRecord.update({
      where: { id: recordId },
      data: {
        reviewWorkflowStatus: targetState,
        ...getStateTransitionData(currentState, targetState, options)
      }
    });
    
    // 记录历史
    await tx.mockExamReviewStateHistory.create({
      data: {
        recordId,
        fromState: currentState,
        toState: targetState,
        changedBy: options.userId,
        reason: options.reason,
        metadata: options.metadata
      }
    });
    
    return getRecordWithPaper(tx, recordId);
  });
}
```

---

### 阶段2：后台管理重构（1周）

#### 2.1 Prompt管理界面

**功能：**
- 查看所有Prompt版本
- 对比不同版本的差异
- 创建/编辑/激活Prompt
- 预览最终发给AI的完整prompt
- A/B测试不同版本

**页面结构：**
```
/admin/ai-review/prompts
  ├── /templates          # Prompt模板列表
  ├── /templates/:id      # 编辑模板
  ├── /templates/new      # 创建新模板
  ├── /templates/compare  # 对比版本
  └── /debug/:recordId    # 调试单个批改
```

#### 2.2 批改监控面板

**实时指标：**
- 队列长度（实时）
- 处理中的任务数
- 最近1小时的批改数/成功率/失败率
- 平均批改耗时
- Token消耗统计

**历史统计：**
- 每日批改量趋势
- 失败原因分类（JSON错误、验证失败、超时、API错误）
- 每个Prompt版本的效果对比
- 成本分析（Token使用量）

**页面结构：**
```
/admin/ai-review/dashboard
  ├── 实时监控
  ├── 历史统计
  ├── 失败分析
  └── 成本分析
```

#### 2.3 批改质量审核

**功能：**
- 查看所有AI批改的结果
- 按质量评分排序（基于验证错误数量）
- 人工复核AI批改
- 标记问题案例
- 反馈给Prompt优化

**页面结构：**
```
/admin/ai-review/quality
  ├── 待审核列表
  ├── 问题案例库
  └── 质量报告
```

---

### 阶段3：Prompt优化（持续）

#### 3.1 强化错误标注

**新Prompt策略：**
```
你是法考阅卷老师，必须同时标注得分点和错误点。

【关键原则】
1. **正向标注**：学生答对的部分 → status:score
2. **错误标注**：学生答错的部分 → status:wrong （必须标注）
3. **遗漏标注**：学生未答的采分点 → missedPoints

【错误标注要求（必须严格执行）】
如果存在以下任一情况，必须生成 status:wrong 的错误标注：
- 法律关系认定错误
- 法律主体写反
- 法律概念误用
- 事实认定错误
- 结论完全相反
- 逻辑推理错误

【错误标注格式】
{
  "id": "mark_x",
  "highlight": "具体错误的那一段原文",
  "status": "wrong",
  "comment": "说明为什么错 + 正确应该是什么"
}

【示例】
学生答案："本案中，甲方应当承担无过错责任。"
采分点：乙方应当承担过错责任

错误标注：
{
  "highlight": "甲方应当承担无过错责任",
  "status": "wrong",
  "comment": "主体和责任类型都错了。正确的是：乙方应当承担过错责任，因为..."
}
```

#### 3.2 多轮Review机制

**流程：**
```
第一轮：快速批改（Sonnet）
  ↓
验证检查
  ↓
如果缺少错误标注 → 第二轮：错误检查（Opus）
  ↓
合并结果 → 最终输出
```

**实现：**
```javascript
async function reviewWithErrorCheck(question, answer, config) {
  // 第一轮：标准批改
  const firstPass = await callAiReview({
    model: 'claude-sonnet-4-6',
    question,
    answer
  });
  
  // 验证
  const validation = validator.validate(firstPass);
  
  // 如果缺少错误标注，进行第二轮
  if (validation.errors.some(e => e.type === 'MISSING_ERROR_MARKS')) {
    const secondPass = await callAiReview({
      model: 'claude-opus-4-8',
      systemPrompt: ERROR_CHECK_PROMPT,
      question,
      answer,
      firstPassResult: firstPass
    });
    
    // 合并结果
    return mergeReviewResults(firstPass, secondPass);
  }
  
  return firstPass;
}
```

---

## 📊 实施计划

### Week 1-2: 核心重构
- [ ] Day 1-2: 数据库表设计和迁移脚本
- [ ] Day 3-4: 新Prompt系统实现
- [ ] Day 5-6: 新验证器实现
- [ ] Day 7-8: 批改日志系统
- [ ] Day 9-10: 状态机重构

### Week 3: 后台管理
- [ ] Day 11-12: Prompt管理界面
- [ ] Day 13-14: 监控面板
- [ ] Day 15: 质量审核界面

### Week 4: 测试和优化
- [ ] Day 16-17: 完整测试
- [ ] Day 18-19: Prompt优化
- [ ] Day 20: 上线准备

---

## 🎯 预期收益

1. **提示词管理**：从混乱 → 清晰可控
2. **批改质量**：错误标注率从 0% → 80%+
3. **系统稳定性**：失败率从 20% → 5%
4. **可观测性**：从黑盒 → 全程可追踪
5. **维护成本**：从难以调试 → 快速定位问题

---

## ⚠️ 风险和注意事项

1. **数据迁移**：需要平滑迁移现有配置
2. **向后兼容**：旧的批改记录仍需能读取
3. **性能影响**：日志记录不能影响批改速度
4. **成本控制**：多轮Review会增加Token消耗

---

这个方案怎么样？我们可以先从哪个模块开始？
