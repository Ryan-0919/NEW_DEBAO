# AI批改系统重建方案

## 🎯 重建目标

从零开始重新设计AI批改系统，解决当前所有问题：
- ✅ AI必须标注错误（解决"只打对不打错"）
- ✅ Prompt清晰可控（单一来源、版本管理）
- ✅ 批改质量可验证（完整的验证体系）
- ✅ 系统可观测（日志、监控、调试）
- ✅ 状态流转清晰（用户体验好）

---

## 🏗️ 新系统架构

### 核心设计原则

1. **简单优先** - 不过度设计，先解决核心问题
2. **质量优先** - 宁可慢一点，也要批改准确
3. **可观测性** - 每个环节都可追踪、可调试
4. **渐进式重构** - 新老系统并存，逐步切换

---

## 📐 Phase 1: 核心批改引擎（Week 1-2）

### 1.1 新的Prompt设计

**设计理念：分离不变的框架和可变的策略**

#### 基础框架（代码，不可修改）

```javascript
// server/lib/ai-review-v2/base-prompt.js

export const BASE_SYSTEM_PROMPT = `你是国家统一法律职业资格考试主观题阅卷老师。

【核心原则】
批改时必须同时完成三件事：
1. ✓ 标注得分点（status: "score"）- 学生答对的部分
2. ✗ 标注错误点（status: "wrong"）- 学生答错的部分  
3. ⊗ 说明遗漏点（missedPoints）- 学生未答的采分点

这三项缺一不可！

【错误标注要求】
当学生答案存在以下情况时，必须生成错误标注：
- 法律主体写反（如把原告义务写成被告义务）
- 法律关系错误（如把合同责任说成侵权责任）
- 法律概念误用（如把过错责任说成无过错责任）
- 事实认定错误（如把材料中的事实张冠李戴）
- 结论完全相反（如应承担责任说成不承担）
- 逻辑推理错误（如前提和结论矛盾）

错误标注必须说明：为什么错 + 正确应该是什么

【JSON格式要求】
只能返回合法JSON对象，不要Markdown，不要代码块。`;

export const BASE_OUTPUT_SCHEMA = {
  type: "object",
  required: ["subQuestions"],
  properties: {
    subQuestions: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "score", "answerMarks", "rubricPoints", "missedPoints"],
        properties: {
          id: { type: "string" },
          score: { type: "integer" },
          reviewComment: { type: "string", minLength: 300, maxLength: 500 },
          answerMarks: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "highlight", "status", "comment"],
              properties: {
                status: { enum: ["score", "wrong", "neutral"] }
              }
            }
          },
          rubricPoints: { type: "array" },
          missedPoints: { type: "array" }
        }
      }
    }
  }
};
```

#### 批改策略（数据库，可修改）

```sql
CREATE TABLE ai_review_strategies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  version VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  
  -- 批改要求
  grading_principles TEXT,           -- 评分原则
  error_emphasis TEXT,                -- 错误标注强调内容
  comment_template TEXT,              -- 点评模板
  
  -- AI配置
  model VARCHAR(50) DEFAULT 'claude-sonnet-4-6',
  temperature DECIMAL(3,2) DEFAULT 0.5,
  max_tokens INT DEFAULT 8000,
  
  -- 验证配置
  require_error_marks BOOLEAN DEFAULT true,
  min_error_marks_count INT DEFAULT 1,
  min_coverage_rate DECIMAL(3,2) DEFAULT 0.30,
  
  -- 元数据
  created_by VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  comment TEXT,
  
  INDEX idx_active (is_active)
);
```

**策略配置示例：**
```json
{
  "name": "严格批改v1.0",
  "gradingPrinciples": "严格按采分点给分，部分正确不给分",
  "errorEmphasis": "重点标注法律主体错误和法律关系错误",
  "requireErrorMarks": true,
  "minErrorMarksCount": 1
}
```

### 1.2 新的批改流程

```javascript
// server/lib/ai-review-v2/reviewer.js

export class AiReviewer {
  constructor(strategy) {
    this.strategy = strategy;
    this.validator = new ReviewValidator(strategy);
  }
  
  async review(question, answer) {
    // 第一步：构建prompt
    const prompt = this.buildPrompt(question, answer);
    
    // 第二步：调用AI
    let result = await this.callAi(prompt);
    
    // 第三步：解析和修复JSON
    result = await this.parseAndRepairJson(result);
    
    // 第四步：验证结果
    const validation = await this.validator.validate(result, question, answer);
    
    // 第五步：如果验证失败，重试一次（带错误提示）
    if (!validation.passed && validation.retriable) {
      result = await this.retryWithFeedback(prompt, result, validation.errors);
      const secondValidation = await this.validator.validate(result, question, answer);
      
      if (!secondValidation.passed) {
        throw new ReviewValidationError(secondValidation.errors);
      }
    }
    
    // 第六步：返回结果
    return result;
  }
}
```

### 1.3 完整的验证器

```javascript
// server/lib/ai-review-v2/validator.js

export class ReviewValidator {
  validate(result, question, answer) {
    const errors = [];
    
    // 验证1：基础结构
    errors.push(...this.validateStructure(result));
    
    // 验证2：分数一致性
    errors.push(...this.validateScoreConsistency(result));
    
    // 验证3：正向标注（必须）
    errors.push(...this.validatePositiveMarks(result));
    
    // 验证4：错误标注（新增，必须）
    errors.push(...this.validateErrorMarks(result, question, answer));
    
    // 验证5：遗漏点
    errors.push(...this.validateMissedPoints(result));
    
    // 验证6：覆盖度
    errors.push(...this.validateCoverage(result, answer));
    
    // 验证7：点评质量
    errors.push(...this.validateComment(result));
    
    return {
      passed: errors.length === 0,
      errors,
      retriable: errors.some(e => e.retriable)
    };
  }
  
  validateErrorMarks(result, question, answer) {
    const errors = [];
    const { answerMarks, missedPoints, rubricPoints } = result;
    
    // 如果没配置要求错误标注，跳过
    if (!this.strategy.requireErrorMarks) {
      return errors;
    }
    
    // 计算未命中的采分点数量
    const missedCount = rubricPoints.filter(p => !p.hit).length;
    
    // 如果有遗漏且学生有作答，必须有错误标注
    if (missedCount > 0 && answer.length > 50) {
      const wrongMarks = answerMarks.filter(m => m.status === 'wrong');
      const minRequired = this.strategy.minErrorMarksCount || 1;
      
      if (wrongMarks.length < minRequired) {
        errors.push({
          type: 'MISSING_ERROR_MARKS',
          severity: 'error',
          retriable: true,
          message: `有${missedCount}个未命中的采分点，但只有${wrongMarks.length}个错误标注（最少需要${minRequired}个）`,
          suggestion: '请检查学生答案，标注具体的错误内容'
        });
      }
      
      // 验证错误标注的质量
      wrongMarks.forEach((mark, index) => {
        if (!mark.comment || mark.comment.length < 20) {
          errors.push({
            type: 'INSUFFICIENT_ERROR_COMMENT',
            severity: 'warning',
            retriable: true,
            message: `错误标注#${index + 1}的说明太简单（${mark.comment?.length || 0}字）`,
            suggestion: '错误标注必须说明：为什么错 + 正确应该是什么'
          });
        }
      });
    }
    
    return errors;
  }
  
  validateCoverage(result, answer) {
    const errors = [];
    const { answerMarks } = result;
    
    // 计算标注覆盖的字符
    const markedChars = new Set();
    answerMarks.forEach(mark => {
      if (mark.start >= 0 && mark.end > mark.start) {
        for (let i = mark.start; i < mark.end; i++) {
          markedChars.add(i);
        }
      }
    });
    
    const coverageRate = answer.length > 0 ? markedChars.size / answer.length : 0;
    const minRate = this.strategy.minCoverageRate || 0.3;
    
    if (coverageRate < minRate && answer.length > 100) {
      errors.push({
        type: 'LOW_COVERAGE',
        severity: 'warning',
        retriable: false,
        message: `标注覆盖率仅${(coverageRate * 100).toFixed(1)}%（要求≥${(minRate * 100).toFixed(0)}%）`,
        suggestion: '可能遗漏了重要内容的标注'
      });
    }
    
    return errors;
  }
}
```

### 1.4 带反馈的重试机制

```javascript
// server/lib/ai-review-v2/reviewer.js

async retryWithFeedback(originalPrompt, failedResult, validationErrors) {
  const feedback = this.buildFeedback(validationErrors);
  
  const retryPrompt = {
    ...originalPrompt,
    messages: [
      ...originalPrompt.messages,
      {
        role: "assistant",
        content: JSON.stringify(failedResult)
      },
      {
        role: "user",
        content: `你的批改结果存在以下问题，请修正：

${feedback}

请返回完整的修正后的JSON。`
      }
    ]
  };
  
  return await this.callAi(retryPrompt);
}

buildFeedback(errors) {
  return errors
    .filter(e => e.severity === 'error')
    .map((e, i) => `${i + 1}. ${e.message}\n   建议：${e.suggestion}`)
    .join('\n\n');
}
```

---

## 📊 Phase 2: 日志和监控（Week 2）

### 2.1 批改日志

```sql
CREATE TABLE ai_review_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  record_id VARCHAR(50) NOT NULL,
  question_id VARCHAR(50) NOT NULL,
  sub_question_id VARCHAR(50),
  
  -- 策略信息
  strategy_id INT,
  strategy_version VARCHAR(20),
  
  -- 请求信息
  model VARCHAR(50),
  temperature DECIMAL(3,2),
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  
  -- 响应信息
  latency_ms INT,
  status ENUM('success', 'validation_failed', 'json_error', 'timeout', 'api_error'),
  retry_count INT DEFAULT 0,
  
  -- 验证结果
  validation_passed BOOLEAN,
  validation_errors JSON,
  
  -- 批改质量指标
  positive_marks_count INT,
  error_marks_count INT,
  coverage_rate DECIMAL(4,3),
  
  -- 时间
  started_at DATETIME(3),
  completed_at DATETIME(3),
  
  -- 原始数据（用于调试，可选）
  raw_prompt TEXT,
  raw_response TEXT,
  
  INDEX idx_record (record_id),
  INDEX idx_status (status),
  INDEX idx_started_at (started_at),
  INDEX idx_strategy (strategy_id)
);
```

### 2.2 实时监控API

```javascript
// server/routes/admin-ai-review-monitor.js

// 获取实时统计
app.get('/api/admin/ai-review/monitor/stats', async (req, res) => {
  const stats = await db.$queryRaw`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'validation_failed' THEN 1 ELSE 0 END) as validation_failed,
      SUM(CASE WHEN status = 'json_error' THEN 1 ELSE 0 END) as json_error,
      AVG(latency_ms) as avg_latency_ms,
      AVG(total_tokens) as avg_total_tokens,
      AVG(error_marks_count) as avg_error_marks,
      AVG(coverage_rate) as avg_coverage_rate
    FROM ai_review_logs
    WHERE started_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
  `;
  
  return ok(res, stats[0]);
});

// 获取失败详情
app.get('/api/admin/ai-review/monitor/failures', async (req, res) => {
  const failures = await db.ai_review_logs.findMany({
    where: {
      status: { not: 'success' },
      started_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    },
    orderBy: { started_at: 'desc' },
    take: 50
  });
  
  return ok(res, failures);
});
```

### 2.3 监控面板

```
/admin/ai-review/monitor

【实时指标】(最近1小时)
┌─────────────┬──────────────┬─────────────┬──────────────┐
│ 批改总数    │ 成功率       │ 平均耗时    │ Token消耗    │
│ 125         │ 96.8%        │ 12.3秒      │ 3.2K/次      │
└─────────────┴──────────────┴─────────────┴──────────────┘

【批改质量】(最近1小时)
┌─────────────┬──────────────┬─────────────┐
│ 错误标注    │ 覆盖率       │ 验证失败    │
│ 平均2.3个   │ 平均45.2%    │ 4次(3.2%)   │
└─────────────┴──────────────┴─────────────┘

【失败原因分布】(最近24小时)
缺少错误标注: ████████ 8次 (50%)
JSON格式错误:  ████ 4次 (25%)
API超时:       ██ 2次 (12.5%)
覆盖率过低:    ██ 2次 (12.5%)

【最近失败记录】
时间        记录ID    失败原因              详情
10:25:33   rec_123   缺少错误标注          有3个遗漏点但0个错误标注
10:23:11   rec_124   JSON格式错误          JSON修复也失败
10:20:45   rec_125   覆盖率过低            覆盖率仅15.2%
```

---

## 🎨 Phase 3: 管理界面（Week 3）

### 3.1 策略管理

```
/admin/ai-review/strategies

【批改策略列表】

当前激活：严格批改v1.0 (创建时间: 2024-01-15)

┌────────┬────────────────┬────────┬──────────┬────────┐
│ 名称   │ 版本           │ 状态   │ 创建时间 │ 操作   │
├────────┼────────────────┼────────┼──────────┼────────┤
│ 严格批改│ v1.0          │ 激活   │ 01-15    │ 查看   │
│ 宽松批改│ v1.0          │ 未激活 │ 01-10    │ 激活   │
│ 测试版本│ v0.9          │ 未激活 │ 01-05    │ 删除   │
└────────┴────────────────┴────────┴──────────┴────────┘

[+ 创建新策略]

【策略效果对比】

策略          成功率  错误标注率  平均耗时  用户满意度
严格批改v1.0  96.8%   98.5%      12.3s    4.2/5.0
宽松批改v1.0  99.2%   45.2%      10.1s    3.1/5.0
```

### 3.2 批改调试工具

```
/admin/ai-review/debug/:recordId

【批改调试】记录：rec_123

[1. 完整Prompt]
┌─────────────────────────────────────────────────┐
│ System Prompt (1523字符):                       │
│ 你是国家统一法律职业资格考试主观题阅卷老师...  │
│                                                  │
│ User Prompt (8934字符):                          │
│ 【批改原则】                                     │
│ 题目：某公司与员工...                            │
│ ...                                              │
└─────────────────────────────────────────────────┘

[复制Prompt] [在Playground测试]

[2. AI响应]
耗时: 12.3秒
Token: 3245 (prompt: 2134, completion: 1111)
状态: 成功

[3. 验证结果]
✓ 基础结构验证通过
✓ 分数一致性验证通过
✓ 正向标注验证通过
✓ 错误标注验证通过 (2个错误标注)
✓ 遗漏点验证通过
⚠ 覆盖率验证警告 (35.2%, 建议≥40%)
✓ 点评质量验证通过

[4. 批改结果预览]
小问(1) 得分: 5/10

正向标注:
• "污染行为应由赵某证明" [+5分]

错误标注:
• "因果关系无需证明" [错误：因果关系仍需证明]

遗漏点:
• 其他养殖户未受影响的证明责任 (-5分)

[5. 重批]
[使用当前策略重批] [使用其他策略重批]
```

---

## 🔄 Phase 4: 状态管理优化（Week 3）

### 4.1 新的状态定义

```javascript
const REVIEW_STATES = {
  NOT_REQUIRED: 'not_required',    // 无需批改
  AI_QUEUED: 'ai_queued',          // 队列中
  AI_PROCESSING: 'ai_processing',  // 批改中
  AI_COMPLETED: 'ai_completed',    // AI完成（新增）
  AI_FAILED: 'ai_failed',          // AI失败（新增）
  MANUAL_REVIEW: 'manual_review',  // 人工审核中
  PUBLISHED: 'published'           // 已发布
};
```

### 4.2 用户体验改进

**学生端状态显示：**

```javascript
// 根据状态显示不同内容
const STATUS_DISPLAY = {
  'ai_queued': {
    title: '正在排队批改',
    message: '你的试卷在批改队列中，预计等待时间：2-5分钟',
    icon: 'clock'
  },
  'ai_processing': {
    title: 'AI正在批改',
    message: '批改大约需要30秒，请稍候...',
    icon: 'loading'
  },
  'ai_completed': {
    title: '批改完成，等待审核',
    message: 'AI已完成批改，老师正在审核中',
    icon: 'check'
  },
  'ai_failed': {
    title: '批改遇到问题',
    message: '系统正在重试，或将转由老师人工批改',
    icon: 'warning'
  }
};
```

---

## 📋 实施计划

### Week 1: 核心引擎
- [ ] Day 1-2: 新的Prompt设计和策略表
- [ ] Day 3-4: 新的批改流程和验证器
- [ ] Day 5: 带反馈的重试机制
- [ ] Day 6-7: 完整测试

### Week 2: 日志监控
- [ ] Day 8-9: 批改日志表和记录逻辑
- [ ] Day 10: 监控API
- [ ] Day 11-12: 监控面板前端

### Week 3: 管理界面
- [ ] Day 13-14: 策略管理界面
- [ ] Day 15: 批改调试工具
- [ ] Day 16-17: 状态管理优化

### Week 4: 测试上线
- [ ] Day 18-19: 完整测试
- [ ] Day 20: 灰度发布
- [ ] Day 21: 全量上线

---

## 🎯 关键指标

### 上线前目标

- **错误标注率**：≥ 90%（有遗漏点的批改中，90%有错误标注）
- **批改成功率**：≥ 95%
- **验证通过率**：≥ 95%
- **平均耗时**：≤ 20秒
- **覆盖率**：≥ 40%

### 上线后监控

- **用户满意度**：≥ 4.0/5.0
- **人工修改率**：≤ 30%（AI批改后管理员需要修改的比例）
- **重批率**：≤ 10%

---

## 🚀 部署策略

### 灰度发布

**第一阶段（10%流量）：**
- 随机选择10%的批改使用新系统
- 其余90%使用旧系统
- 监控新系统指标
- 收集管理员反馈

**第二阶段（50%流量）：**
- 如果第一阶段指标达标，扩大到50%
- 持续监控对比

**第三阶段（100%流量）：**
- 如果第二阶段稳定，全量切换
- 保留旧系统1周作为回滚备份

### 回滚方案

```javascript
// 配置开关
const AI_REVIEW_VERSION = process.env.AI_REVIEW_VERSION || 'v2';

if (AI_REVIEW_VERSION === 'v2') {
  // 使用新系统
  result = await newAiReviewer.review(question, answer);
} else {
  // 回滚到旧系统
  result = await buildSubjectiveReviewJson({ question, answer, runtimeConfig });
}
```

---

## 💰 成本估算

### Token消耗

**单次批改：**
- Prompt: ~2000 tokens
- Completion: ~1500 tokens
- 总计: ~3500 tokens/次

**失败重试（5%）：**
- 额外: ~3500 tokens/次

**JSON修复（10%）：**
- 额外: ~2000 tokens/次

**平均每次批改：**
- 3500 + 0.05 * 3500 + 0.1 * 2000 = ~3850 tokens

**每日成本（假设100次批改）：**
- 100 * 3850 = 385,000 tokens
- 使用Claude Sonnet: ~$1.5/天
- 每月: ~$45

---

这是我设计的全新AI批改系统方案。

**核心改进点：**
1. ✅ 强制错误标注 + 验证
2. ✅ 策略配置分离
3. ✅ 完整的日志和监控
4. ✅ 调试工具
5. ✅ 灰度发布

**你觉得这个方案怎么样？需要调整哪些部分？**
