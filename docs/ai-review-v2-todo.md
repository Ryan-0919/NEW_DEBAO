# AI批改系统重构 - 待完成清单

## ✅ 已完成（Phase 1 - 80%）

### Phase 1.1: Prompt设计 ✅
- ✅ 基础框架（BASE_SYSTEM_PROMPT）
- ✅ 批改策略数据库表
- ✅ 默认策略插入

### Phase 1.2: 批改流程 ✅
- ✅ AiReviewer 类
- ✅ buildCompletePrompt
- ✅ callAi
- ✅ parseAndRepairJson
- ✅ retryWithFeedback

### Phase 1.3: 验证器 ✅
- ✅ ReviewValidator 类
- ✅ 7项验证（结构、分数、正向、错误、遗漏、覆盖、点评）
- ✅ validateErrorMarks（核心新增）

### Phase 1.4: 重试机制 ✅
- ✅ 带反馈的重试
- ✅ buildFeedback

---

## 🔄 进行中（Phase 1 - 20%）

### Phase 1剩余工作
- 🔄 JSON解析调试（正在进行）
- ⏳ 端到端测试
- ⏳ usage统计完善
- ⏳ 生产环境验证

---

## ❌ 未完成（Phase 2-4）

### Phase 2: 日志和监控（Week 2）- 0%完成

#### 2.1 批改日志 ✅ 50%
- ✅ 数据表创建
- ✅ ReviewLogger 类
- ❌ 日志查询接口
- ❌ 日志导出功能

#### 2.2 实时监控API ❌ 0%
需要创建：
```javascript
// GET /api/admin/ai-review/monitor/stats
// 返回：
{
  total: 125,              // 最近1小时批改总数
  success_count: 121,      // 成功数
  success_rate: 0.968,     // 成功率
  avg_latency_ms: 12300,   // 平均耗时
  avg_total_tokens: 3200,  // 平均token
  avg_error_marks: 2.3,    // 平均错误标注数
  avg_coverage_rate: 0.452 // 平均覆盖率
}

// GET /api/admin/ai-review/monitor/failures
// 返回最近失败记录

// GET /api/admin/ai-review/monitor/quality
// 返回批改质量指标
```

**待创建文件：**
- ❌ `server/routes/admin-ai-review-monitor.js`

#### 2.3 监控面板 ❌ 0%
需要创建前端页面：
- ❌ `/admin/ai-review/monitor` 路由
- ❌ 实时指标卡片
- ❌ 失败原因分布图
- ❌ 批改质量趋势图
- ❌ 最近失败记录列表

**待创建文件：**
- ❌ `src/app/pages/admin/AiReviewMonitor.tsx`
- ❌ 相关组件

---

### Phase 3: 管理界面（Week 3）- 0%完成

#### 3.1 策略管理 ❌ 0%
需要创建：
```javascript
// GET /api/admin/ai-review/strategies
// 获取所有策略列表

// POST /api/admin/ai-review/strategies
// 创建新策略

// POST /api/admin/ai-review/strategies/:id/activate
// 激活某个策略

// GET /api/admin/ai-review/strategies/compare
// 对比两个策略的效果
```

需要前端页面：
- ❌ 策略列表页
- ❌ 策略创建/编辑页
- ❌ 策略效果对比页

**待创建文件：**
- ❌ `server/routes/admin-ai-review-strategies.js`
- ❌ `src/app/pages/admin/AiReviewStrategies.tsx`

#### 3.2 批改调试工具 ❌ 0%
需要创建：
```javascript
// GET /api/admin/ai-review/debug/:recordId
// 返回：
{
  systemPrompt: "...",     // 完整system prompt
  userPrompt: "...",       // 完整user prompt
  response: "...",         // AI原始响应
  parsedResult: {...},     // 解析后的结果
  validation: {...},       // 验证结果
  metrics: {...}           // 性能指标
}

// POST /api/admin/ai-review/debug/:recordId/retry
// 使用不同策略重新批改
```

需要前端页面：
- ❌ 调试工具页面
- ❌ Prompt查看器
- ❌ JSON查看器
- ❌ 验证结果展示

**待创建文件：**
- ❌ `server/routes/admin-ai-review-debug.js`
- ❌ `src/app/pages/admin/AiReviewDebug.tsx`

---

### Phase 4: 状态管理优化（Week 3）- 0%完成

#### 4.1 新的状态定义 ❌ 0%
需要修改：
```javascript
// 当前状态
const STATES = {
  NOT_REQUIRED: 'not_required',
  AI_PENDING: 'ai_pending',
  AI_PROCESSING: 'ai_processing',
  MANUAL_PENDING: 'manual_pending',
  PUBLISHED: 'published'
};

// 新增状态（可选）
const NEW_STATES = {
  AI_COMPLETED: 'ai_completed',  // AI批改完成（新增）
  AI_FAILED: 'ai_failed',        // AI批改失败（新增）
  MANUAL_REVIEW: 'manual_review' // 人工审核中
};
```

**待修改文件：**
- ❌ `server/lib/mock-exams.js` - 状态定义
- ❌ 前端状态显示逻辑

#### 4.2 用户体验改进 ❌ 0%
学生端状态显示优化：
```javascript
// 当前：都显示"正在等待老师批改"
// 优化后：
'ai_queued' → '正在排队批改（预计2-5分钟）'
'ai_processing' → 'AI正在批改（约30秒）'
'ai_completed' → '批改完成，等待审核'
'ai_failed' → '批改遇到问题，正在重试'
```

**待修改文件：**
- ❌ 前端状态展示组件

---

## 📊 完成度统计

### 总体进度：约30%

- ✅ **Phase 1 核心引擎：80%**（4-5天 → 已完成1天）
  - ✅ Prompt设计：100%
  - ✅ 批改流程：100%
  - ✅ 验证器：100%
  - ✅ 重试机制：100%
  - 🔄 调试和测试：20%

- ❌ **Phase 2 日志监控：0%**（2-3天 → 未开始）
  - ✅ 日志表：100%
  - ✅ Logger类：100%
  - ❌ 监控API：0%
  - ❌ 监控面板：0%

- ❌ **Phase 3 管理界面：0%**（3-4天 → 未开始）
  - ❌ 策略管理：0%
  - ❌ 调试工具：0%

- ❌ **Phase 4 状态优化：0%**（1-2天 → 未开始）
  - ❌ 状态定义：0%
  - ❌ 用户体验：0%

---

## 🎯 优先级排序

### 🔴 高优先级（必须完成才能上线）
1. ✅ Phase 1核心引擎（80%）
2. 🔄 JSON解析调试和测试（20%）
3. ❌ 监控API（用于观测系统）
4. ❌ 策略管理基础接口（用于切换策略）

### 🟡 中优先级（建议完成）
5. ❌ 监控面板（提升可观测性）
6. ❌ 调试工具（方便排查问题）
7. ❌ 状态优化（改善用户体验）

### 🟢 低优先级（可以后续迭代）
8. ❌ 策略对比功能
9. ❌ 日志导出功能
10. ❌ 高级调试功能

---

## ⏱️ 时间估算

### 最小可用版本（MVP）
完成高优先级1-4项：
- 🔄 JSON调试：0.5天
- ❌ 监控API：1天
- ❌ 策略管理API：0.5天
- **总计：2天**

### 完整功能版本
完成所有Phase 1-4：
- Phase 1剩余：1天
- Phase 2：2-3天
- Phase 3：3-4天
- Phase 4：1-2天
- **总计：7-10天**

---

## 🚀 建议的推进策略

### 方案A：快速上线（推荐）
1. **明天**：完成Phase 1（JSON调试）
2. **后天**：简单监控API
3. **第3天**：生产环境灰度测试
4. **之后**：逐步补充Phase 2-4功能

### 方案B：完整开发
1. 继续按Phase 1-4顺序完成
2. 完整测试后再上线
3. 预计7-10天

---

## 💡 当前建议

**核心问题已解决（强制错误标注）✅**

剩余工作主要是**辅助功能**，不影响核心批改质量。

**建议：**
- 今晚/明天：修复JSON解析问题
- 后天：直接在生产环境小流量测试V2
- 根据测试结果决定是否需要Phase 2-4

**理由：**
1. 核心批改逻辑已完成
2. V1作为回退保障
3. 先验证效果，再补充监控
4. 快速迭代，而不是等全部完成

---

你觉得应该继续完成Phase 2-4，还是先快速上线测试效果？
