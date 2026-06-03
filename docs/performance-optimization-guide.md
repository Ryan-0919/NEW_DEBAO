# AI批改系统V2 - 性能监控与优化指南

## 📊 性能监控系统

### 概述

V2系统内置了完整的性能监控功能，实时跟踪：
- ⏱️ 各阶段耗时
- 🪙 Token使用量
- ✅ JSON解析成功率
- 🚀 并发执行情况
- 💯 整体成功率

---

## 🔧 使用性能监控

### 1. API接口

#### 获取性能报告

```bash
GET /api/admin/ai-review-v2/performance
```

**返回示例：**

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRequests": 18,
      "successRate": "100.00%",
      "failureCount": 0
    },
    "phase1": {
      "avgTimeMs": 6500,
      "parseSuccessRate": "88.89%",
      "avgTokensPerRequest": 1650,
      "totalTokens": 29700
    },
    "phase2": {
      "avgTimeMs": 4200,
      "parseSuccessRate": "94.44%",
      "avgTokensPerRequest": 1800,
      "totalTokens": 32400
    },
    "concurrent": {
      "maxConcurrent": 3
    },
    "totalTokenUsage": {
      "prompt": 30500,
      "completion": 31600,
      "total": 62100
    }
  },
  "timestamp": "2024-06-03T10:30:00.000Z"
}
```

#### 重置性能统计

```bash
POST /api/admin/ai-review-v2/performance/reset
```

#### 打印报告到控制台

```bash
POST /api/admin/ai-review-v2/performance/print
```

---

### 2. 在代码中使用

```javascript
import { getPerformanceMonitor } from './server/lib/ai-review-v2/performance-monitor.js';

// 获取监控器实例
const monitor = getPerformanceMonitor();

// 获取报告
const report = monitor.getReport();
console.log('总请求数:', report.summary.totalRequests);
console.log('成功率:', report.summary.successRate);

// 打印完整报告
monitor.printReport();

// 重置统计
monitor.reset();
```

---

## 📈 性能指标说明

### 1. 总体统计（summary）

| 指标 | 说明 | 理想值 |
|------|------|--------|
| totalRequests | 总批改请求数 | - |
| successRate | 成功率 | > 95% |
| failureCount | 失败次数 | < 5% |

### 2. 阶段1统计（phase1）

| 指标 | 说明 | 理想值 |
|------|------|--------|
| avgTimeMs | 平均耗时(毫秒) | < 8000ms |
| parseSuccessRate | JSON解析成功率 | > 85% |
| avgTokensPerRequest | 平均Token消耗 | 1500-2000 |
| totalTokens | 总Token消耗 | - |

### 3. 阶段2统计（phase2）

| 指标 | 说明 | 理想值 |
|------|------|--------|
| avgTimeMs | 平均耗时(毫秒) | < 6000ms |
| parseSuccessRate | JSON解析成功率 | > 90% |
| avgTokensPerRequest | 平均Token消耗 | 1500-2000 |
| totalTokens | 总Token消耗 | - |

### 4. 并发统计（concurrent）

| 指标 | 说明 | 理想值 |
|------|------|--------|
| maxConcurrent | 最大并发数 | 通常为3（3个小问） |

---

## 🚀 性能优化建议

### 1. 响应时间优化

#### 当前性能基准

- **单小问总耗时**: 10-15秒
  - 阶段1: 6-8秒
  - 阶段2: 4-6秒
- **3小问并发**: 15-20秒

#### 优化方向

**a) 调整max_tokens（降低延迟）**

```javascript
// 当前配置
max_tokens: 25000  // 保守配置，确保不截断

// 优化建议
max_tokens: 8000   // 阶段1足够（实际使用~700-1000 tokens）
max_tokens: 5000   // 阶段2足够（实际使用~500-700 tokens）
```

**影响：**
- ✅ 响应时间减少20-30%
- ⚠️ 需确保不会截断复杂案例

**b) 使用更快的模型（降低成本和延迟）**

```javascript
// 当前: claude-opus-4-8 (最强但最慢)
// 优化: claude-sonnet-4-6 (平衡性能和速度)

// 在strategy配置中修改
strategy.model = 'claude-sonnet-4-6';
```

**影响：**
- ✅ 响应时间减少40-50%
- ✅ 成本降低约70%
- ⚠️ 批改质量可能略有下降

---

### 2. Token使用优化

#### 当前Token消耗

- **单小问总计**: ~3000-3500 tokens
  - 阶段1: 1500-1800 tokens
  - 阶段2: 1500-1800 tokens
- **3小问总计**: ~9000-10000 tokens

#### 优化方向

**a) 简化Prompt**

```javascript
// 移除冗余说明
// 合并重复的要求
// 使用更简洁的示例
```

**预期节省:** 10-15% tokens

**b) 缓存参考答案**

```javascript
// 对于相同题目，参考答案可以缓存
// 避免每次都发送完整的参考答案
```

**预期节省:** 5-10% tokens

---

### 3. 并发优化

#### 当前策略

- 3个小问完全并发执行
- 每个小问独立调用AI（阶段1+阶段2）

#### 优化方向

**a) 批量阶段优化**

```javascript
// 当前: 3个小问并发，每个小问2次AI调用 = 6次并发调用
// 优化: 3个小问阶段1先并发，完成后阶段2再并发 = 2轮3次并发

// 优点：减少API压力
// 缺点：总耗时略增（串行度增加）
```

**b) 智能并发控制**

```javascript
// 根据小问复杂度动态调整并发数
const complexity = assessComplexity(subQuestion);
const concurrentLimit = complexity === 'high' ? 2 : 3;
```

---

### 4. JSON解析优化

#### 当前问题

- 阶段1解析成功率: ~85-90%
- 阶段2解析成功率: ~90-95%
- 失败原因：AI返回markdown代码块标记

#### 已实施的优化

✅ 在Prompt中多次强调不要返回markdown标记  
✅ 提供错误vs正确格式对比  
✅ 实现parseAndRepairJson兜底机制

#### 进一步优化

**a) 使用工具调用模式（Tool Use）**

```javascript
// 让AI通过structured output返回
// 避免markdown包装问题
{
  "tools": [{
    "name": "submit_review",
    "input_schema": {
      "type": "object",
      "properties": {
        "subQuestions": {...}
      }
    }
  }]
}
```

**预期效果:** 解析成功率提升到99%+

---

## 📊 性能测试

### 运行性能测试

```bash
node scripts/test-performance-monitor.js
```

### 测试场景

1. **单次完整批改（3小问）** - 验证基本功能
2. **连续批改5次** - 验证稳定性
3. **性能分析** - 生成详细报告

### 测试输出示例

```
📊 AI批改系统V2 - 性能报告
============================================================

【总体统计】
  总请求数: 18
  成功率: 100.00%
  失败数: 0

【阶段1 - 核心批改】
  平均耗时: 6500ms
  JSON解析成功率: 88.89%
  平均Token消耗: 1650
  总Token消耗: 29700

【阶段2 - 补充信息】
  平均耗时: 4200ms
  JSON解析成功率: 94.44%
  平均Token消耗: 1800
  总Token消耗: 32400

【并发统计】
  最大并发数: 3

【总Token使用】
  Prompt: 30500
  Completion: 31600
  Total: 62100

============================================================

【关键指标】
  ⏱️  平均单小问耗时: 10700ms
  📊 平均Token消耗: 3450 tokens
  ✅ 阶段1解析成功率: 88.89%
  ✅ 阶段2解析成功率: 94.44%
  🚀 最大并发数: 3
  💯 总体成功率: 100.00%

【成本估算】
  总Token消耗: 62,100
  估算成本: $0.0009

【性能评级】
  速度: ⭐⭐⭐⭐ 良好 (10700ms < 15s)
  稳定性: ⭐⭐⭐⭐⭐ 优秀 (91.7%)
```

---

## 🎯 性能优化优先级

### 高优先级（立即实施）

1. ✅ **性能监控** - 已完成
2. ⏳ **调整max_tokens** - 从25000降到8000/5000
3. ⏳ **简化Prompt** - 移除冗余说明

### 中优先级（按需实施）

1. ⏳ **切换到Sonnet模型** - 如果Opus成本过高
2. ⏳ **实现结果缓存** - 相同题目相同答案
3. ⏳ **参考答案压缩** - 减少重复传输

### 低优先级（长期优化）

1. ⏳ **使用Tool Use模式** - 提升JSON解析成功率
2. ⏳ **智能并发控制** - 根据复杂度调整
3. ⏳ **增量批改** - 只批改修改的部分

---

## 🔍 故障排查

### 问题1: 响应时间过长（>20秒）

**可能原因：**
- AI API响应慢
- 网络延迟
- max_tokens设置过大

**排查步骤：**
1. 查看性能报告中的avgTimeMs
2. 检查网络连接
3. 尝试降低max_tokens

### 问题2: JSON解析失败率高（>20%）

**可能原因：**
- AI返回markdown标记
- 答案过长导致截断
- Prompt不够明确

**排查步骤：**
1. 查看解析失败的原始响应
2. 检查是否有markdown标记
3. 验证parseAndRepairJson是否工作

### 问题3: Token消耗过高

**可能原因：**
- Prompt过长
- 参考答案过长
- max_tokens设置过大

**排查步骤：**
1. 查看avgTokensPerRequest
2. 分析Prompt长度
3. 考虑简化Prompt或压缩参考答案

---

## 📞 监控告警配置

### 建议的告警阈值

```javascript
const ALERT_THRESHOLDS = {
  // 成功率
  successRate: 90,          // 低于90%告警
  
  // 响应时间
  avgTimeMs: 20000,         // 超过20秒告警
  
  // 解析成功率
  parseSuccessRate: 80,     // 低于80%告警
  
  // Token消耗
  avgTokensPerRequest: 5000 // 超过5000告警
};
```

### 告警集成示例

```javascript
import { getPerformanceMonitor } from './performance-monitor.js';

function checkPerformanceAlerts() {
  const report = getPerformanceMonitor().getReport();
  
  // 检查成功率
  const successRate = parseFloat(report.summary.successRate);
  if (successRate < ALERT_THRESHOLDS.successRate) {
    sendAlert(`成功率过低: ${successRate}%`);
  }
  
  // 检查响应时间
  const avgTime = report.phase1.avgTimeMs + report.phase2.avgTimeMs;
  if (avgTime > ALERT_THRESHOLDS.avgTimeMs) {
    sendAlert(`响应时间过长: ${avgTime}ms`);
  }
  
  // ... 其他检查
}

// 定期检查（每小时）
setInterval(checkPerformanceAlerts, 3600000);
```

---

## 🎓 最佳实践

### 1. 定期监控

- 每天查看性能报告
- 关注趋势变化
- 及时发现性能退化

### 2. A/B测试

- 对比不同配置的性能
- 使用相同测试数据
- 记录详细的测试结果

### 3. 成本控制

- 监控Token使用量
- 估算每月成本
- 优化高频场景

### 4. 持续优化

- 根据监控数据优化
- 测试新的优化方案
- 保持系统性能最佳

---

**版本：** V2.0  
**更新时间：** 2024-06-03  
**作者：** AI批改系统开发团队
