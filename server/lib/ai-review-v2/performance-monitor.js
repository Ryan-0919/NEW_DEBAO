// AI批改系统V2 - 性能监控工具

/**
 * 性能监控器
 * 用于记录和分析批改过程的性能数据
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      phase1: {
        totalTime: 0,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        parseSuccessCount: 0,
        parseFailureCount: 0
      },
      phase2: {
        totalTime: 0,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        parseSuccessCount: 0,
        parseFailureCount: 0
      },
      concurrent: {
        maxConcurrent: 0,
        currentConcurrent: 0
      }
    };
    this.requestTimestamps = [];
  }

  /**
   * 记录阶段1的性能数据
   */
  recordPhase1({ timeMs, usage, parseSuccess }) {
    this.metrics.phase1.totalTime += timeMs;
    if (usage) {
      this.metrics.phase1.tokenUsage.prompt += usage.prompt_tokens || 0;
      this.metrics.phase1.tokenUsage.completion += usage.completion_tokens || 0;
      this.metrics.phase1.tokenUsage.total += usage.total_tokens || 0;
    }
    if (parseSuccess) {
      this.metrics.phase1.parseSuccessCount++;
    } else {
      this.metrics.phase1.parseFailureCount++;
    }
  }

  /**
   * 记录阶段2的性能数据
   */
  recordPhase2({ timeMs, usage, parseSuccess }) {
    this.metrics.phase2.totalTime += timeMs;
    if (usage) {
      this.metrics.phase2.tokenUsage.prompt += usage.prompt_tokens || 0;
      this.metrics.phase2.tokenUsage.completion += usage.completion_tokens || 0;
      this.metrics.phase2.tokenUsage.total += usage.total_tokens || 0;
    }
    if (parseSuccess) {
      this.metrics.phase2.parseSuccessCount++;
    } else {
      this.metrics.phase2.parseFailureCount++;
    }
  }

  /**
   * 记录整体请求结果
   */
  recordRequest({ success, totalTimeMs, subQuestionCount }) {
    this.metrics.totalRequests++;
    if (success) {
      this.metrics.successCount++;
    } else {
      this.metrics.failureCount++;
    }
    this.requestTimestamps.push({
      timestamp: Date.now(),
      timeMs: totalTimeMs,
      subQuestionCount
    });
  }

  /**
   * 记录并发数
   */
  recordConcurrent(count) {
    this.metrics.concurrent.currentConcurrent = count;
    if (count > this.metrics.concurrent.maxConcurrent) {
      this.metrics.concurrent.maxConcurrent = count;
    }
  }

  /**
   * 获取统计报告
   */
  getReport() {
    const totalPhase1Requests = this.metrics.phase1.parseSuccessCount + this.metrics.phase1.parseFailureCount;
    const totalPhase2Requests = this.metrics.phase2.parseSuccessCount + this.metrics.phase2.parseFailureCount;

    return {
      summary: {
        totalRequests: this.metrics.totalRequests,
        successRate: this.metrics.totalRequests > 0
          ? (this.metrics.successCount / this.metrics.totalRequests * 100).toFixed(2) + '%'
          : '0%',
        failureCount: this.metrics.failureCount
      },
      phase1: {
        avgTimeMs: totalPhase1Requests > 0
          ? Math.round(this.metrics.phase1.totalTime / totalPhase1Requests)
          : 0,
        parseSuccessRate: totalPhase1Requests > 0
          ? (this.metrics.phase1.parseSuccessCount / totalPhase1Requests * 100).toFixed(2) + '%'
          : '0%',
        avgTokensPerRequest: totalPhase1Requests > 0
          ? Math.round(this.metrics.phase1.tokenUsage.total / totalPhase1Requests)
          : 0,
        totalTokens: this.metrics.phase1.tokenUsage.total
      },
      phase2: {
        avgTimeMs: totalPhase2Requests > 0
          ? Math.round(this.metrics.phase2.totalTime / totalPhase2Requests)
          : 0,
        parseSuccessRate: totalPhase2Requests > 0
          ? (this.metrics.phase2.parseSuccessCount / totalPhase2Requests * 100).toFixed(2) + '%'
          : '0%',
        avgTokensPerRequest: totalPhase2Requests > 0
          ? Math.round(this.metrics.phase2.tokenUsage.total / totalPhase2Requests)
          : 0,
        totalTokens: this.metrics.phase2.tokenUsage.total
      },
      concurrent: {
        maxConcurrent: this.metrics.concurrent.maxConcurrent
      },
      totalTokenUsage: {
        prompt: this.metrics.phase1.tokenUsage.prompt + this.metrics.phase2.tokenUsage.prompt,
        completion: this.metrics.phase1.tokenUsage.completion + this.metrics.phase2.tokenUsage.completion,
        total: this.metrics.phase1.tokenUsage.total + this.metrics.phase2.tokenUsage.total
      }
    };
  }

  /**
   * 重置所有统计数据
   */
  reset() {
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      phase1: {
        totalTime: 0,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        parseSuccessCount: 0,
        parseFailureCount: 0
      },
      phase2: {
        totalTime: 0,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        parseSuccessCount: 0,
        parseFailureCount: 0
      },
      concurrent: {
        maxConcurrent: 0,
        currentConcurrent: 0
      }
    };
    this.requestTimestamps = [];
  }

  /**
   * 打印性能报告到控制台
   */
  printReport() {
    const report = this.getReport();
    console.log('\n' + '='.repeat(60));
    console.log('📊 AI批改系统V2 - 性能报告');
    console.log('='.repeat(60));

    console.log('\n【总体统计】');
    console.log(`  总请求数: ${report.summary.totalRequests}`);
    console.log(`  成功率: ${report.summary.successRate}`);
    console.log(`  失败数: ${report.summary.failureCount}`);

    console.log('\n【阶段1 - 核心批改】');
    console.log(`  平均耗时: ${report.phase1.avgTimeMs}ms`);
    console.log(`  JSON解析成功率: ${report.phase1.parseSuccessRate}`);
    console.log(`  平均Token消耗: ${report.phase1.avgTokensPerRequest}`);
    console.log(`  总Token消耗: ${report.phase1.totalTokens}`);

    console.log('\n【阶段2 - 补充信息】');
    console.log(`  平均耗时: ${report.phase2.avgTimeMs}ms`);
    console.log(`  JSON解析成功率: ${report.phase2.parseSuccessRate}`);
    console.log(`  平均Token消耗: ${report.phase2.avgTokensPerRequest}`);
    console.log(`  总Token消耗: ${report.phase2.totalTokens}`);

    console.log('\n【并发统计】');
    console.log(`  最大并发数: ${report.concurrent.maxConcurrent}`);

    console.log('\n【总Token使用】');
    console.log(`  Prompt: ${report.totalTokenUsage.prompt}`);
    console.log(`  Completion: ${report.totalTokenUsage.completion}`);
    console.log(`  Total: ${report.totalTokenUsage.total}`);

    console.log('='.repeat(60) + '\n');
  }
}

// 全局单例
let globalMonitor = null;

/**
 * 获取全局性能监控器实例
 */
export function getPerformanceMonitor() {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

/**
 * 重置全局性能监控器
 */
export function resetPerformanceMonitor() {
  if (globalMonitor) {
    globalMonitor.reset();
  }
}
