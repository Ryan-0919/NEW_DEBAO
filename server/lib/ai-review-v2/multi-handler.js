// AI批改系统V2 - 多小问处理器
import { AiReviewer } from './reviewer.js';
import { PhaseReviewer } from './phase-reviewer.js';
import { getPerformanceMonitor } from './performance-monitor.js';

/**
 * 智能多小问批改处理器
 * 根据小问数量决定是一次性批改还是逐个批改
 */
export class MultiSubQuestionHandler {
  constructor(strategy, runtimeConfig) {
    this.strategy = strategy;
    this.runtimeConfig = runtimeConfig;
    this.reviewer = new AiReviewer(strategy, runtimeConfig);
    this.phaseReviewer = new PhaseReviewer(strategy, runtimeConfig);
    this.monitor = getPerformanceMonitor();
  }

  /**
   * 智能批改入口
   */
  async review({ question, answer, recordId }) {
    const questionMeta = this.getQuestionMeta(question);
    const subQuestionCount = questionMeta.subQuestions.length;

    console.log(`[多小问处理] 题目有${subQuestionCount}个小问`);

    // 策略：所有情况都逐个批改，确保JSON不会过长
    console.log(`[多小问处理] 使用逐个批改（避免JSON截断）`);
    return await this.sequentialReview({ question, answer, recordId, questionMeta });
  }

  /**
   * 一次性批改所有小问
   */
  async batchReview({ question, answer, recordId }) {
    return await this.reviewer.review(question, answer);
  }

  /**
   * 逐个小问批改（真正串行执行，降低上游限流与 502 概率）
   */
  async sequentialReview({ question, answer, recordId, questionMeta }) {
    const startTime = Date.now();
    const answerMap = this.parseSubjectiveAnswerMap(answer?.answerJson, question);

    let totalUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };

    console.log(`[多小问处理] 开始串行批改 ${questionMeta.subQuestions.length} 个小问`);

    // 记录当前链路按 1 路串行执行
    this.monitor.recordConcurrent(1);

    const results = [];
    for (let i = 0; i < questionMeta.subQuestions.length; i += 1) {
      const sq = questionMeta.subQuestions[i];
      console.log(`[多小问处理] 启动小问${i + 1}/${questionMeta.subQuestions.length}: ${sq.id}`);
      const maxScore = this.getSubQuestionMaxScore(question, sq, questionMeta.subQuestions.length);
      try {
        const result = await this.phaseReviewer.reviewSubQuestion({
          question,
          subQuestion: sq,
          answer: answerMap[sq.id] || '',
          rubric: {
            maxScore,
            points: sq.rubricPoints || [],
            referenceAnswer: sq.referenceAnswer || '',
            guidance: sq.rubricGuidance || ''
          }
        });
        results.push({
          ...result,
          index: i,
          subQuestionId: sq.id
        });
      } catch (error) {
        console.error(`[多小问处理] 小问${i + 1}异常:`, error);
        results.push({
          success: false,
          index: i,
          subQuestionId: sq.id,
          error: error.message,
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        });
      }
    }

    results.forEach((result) => {
      if (result.usage) {
        totalUsage.prompt_tokens += result.usage.prompt_tokens || 0;
        totalUsage.completion_tokens += result.usage.completion_tokens || 0;
        totalUsage.total_tokens += result.usage.total_tokens || 0;
      }
    });

    const failedResults = results.filter((result) => !result.success);
    if (failedResults.length > 0) {
      const failedMessages = failedResults.map(
        (result) => `小问${(result.index ?? 0) + 1}(${result.subQuestionId}): ${result.error || "批改失败"}`,
      );
      console.error(`[多小问处理] 批改失败: ${failedMessages.join("; ")}`);

      return {
        success: false,
        error: `V2批改失败：${failedMessages.join("；")}`,
        usage: totalUsage,
        metrics: {
          latency_ms: Date.now() - startTime,
          retry_count: 0,
          sub_question_count: questionMeta.subQuestions.length,
          failed_sub_question_count: failedResults.length
        },
        validation: {
          passed: false,
          retriable: true,
          errorCount: failedResults.length,
          warningCount: 0,
          errors: failedResults.map((result) => ({
            type: "SUBQUESTION_REVIEW_FAILED",
            severity: "error",
            retriable: true,
            subQuestionId: result.subQuestionId,
            message: result.error || "小问批改失败"
          }))
        },
        rawResponse: this.buildRawResponseSnapshot(results)
      };
    }

    // 处理结果
    const allResults = results.map((result) => result.result);

    // 合并结果
    const mergedResult = {
      subQuestions: allResults
    };

    // 计算总分
    const totalScore = allResults.reduce((sum, sq) => sum + (sq.score || 0), 0);
    const maxScore = allResults.reduce((sum, sq) => sum + (sq.maxScore || 0), 0);

    console.log(`[多小问处理] 完成，总分: ${totalScore}/${maxScore}`);

    return {
      success: true,
      result: mergedResult,
      usage: totalUsage,
      rawResponse: this.buildRawResponseSnapshot(results),
      metrics: {
        latency_ms: Date.now() - startTime,
        retry_count: 0,
        sub_question_count: questionMeta.subQuestions.length
      },
      validation: {
        passed: true,
        errors: [],
        errorCount: 0,
        warningCount: 0
      }
    };
  }

  // 辅助方法
  getQuestionMeta(question) {
    const raw = question.questionMetaJson ? JSON.parse(question.questionMetaJson) : {};
    return {
      subQuestions: Array.isArray(raw.subQuestions) ? raw.subQuestions : []
    };
  }

  getPointScore(point) {
    return Math.max(0, Number(point?.maxScore ?? point?.score ?? 0) || 0);
  }

  getSubQuestionMaxScore(question, subQuestion, subQuestionCount = 1) {
    const explicit = Math.max(0, Number(subQuestion?.maxScore ?? subQuestion?.score ?? 0) || 0);
    if (explicit > 0) return explicit;

    const rubricTotal = (subQuestion?.rubricPoints || []).reduce((sum, point) => sum + this.getPointScore(point), 0);
    if (rubricTotal > 0) return rubricTotal;

    return Math.max(0, Math.round((Number(question?.score ?? 0) || 0) / Math.max(1, subQuestionCount)));
  }

  buildRawResponseSnapshot(results = []) {
    const items = results
      .map((result) => ({
        subQuestionId: result.subQuestionId,
        success: Boolean(result.success),
        error: result.error || null,
        rawResponse: result.rawResponse || null,
      }))
      .filter((item) => item.rawResponse || item.error);

    return items.length > 0 ? { mode: "phase", items } : null;
  }

  parseSubjectiveAnswerMap(answerJson, question) {
    const raw = answerJson ? JSON.parse(answerJson) : {};
    const subQuestions = this.getQuestionMeta(question).subQuestions;
    return Object.fromEntries(
      subQuestions.map(sq => [sq.id, raw[sq.id] || ''])
    );
  }
}
