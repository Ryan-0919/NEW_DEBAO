// AI批改系统V2 - 日志记录器
import { prisma } from '../prisma.js';

export class ReviewLogger {
  /**
   * 开始记录一次批改
   */
  static async start({ recordId, questionId, subQuestionId, strategy, model, prompt }) {
    const logId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO ai_review_logs (
          record_id,
          question_id,
          sub_question_id,
          strategy_id,
          strategy_name,
          strategy_version,
          model,
          temperature,
          started_at,
          raw_prompt
        ) VALUES (
          ${recordId},
          ${questionId},
          ${subQuestionId || null},
          ${strategy.id},
          ${strategy.name},
          ${strategy.version},
          ${model},
          ${strategy.temperature},
          NOW(3),
          ${JSON.stringify(prompt)}
        )
      `;
      const rows = await tx.$queryRaw`SELECT LAST_INSERT_ID() as id`;
      return rows[0].id;
    });

    return new ReviewLogEntry(logId);
  }
}

export class ReviewLogEntry {
  constructor(logId) {
    this.logId = logId;
  }

  /**
   * 记录成功
   */
  async success({ result, validation, usage, latency, rawResponse }) {
    // 计算指标
    const positiveMarks = this.countMarks(result, 'score');
    const errorMarks = this.countMarks(result, 'wrong');
    const neutralMarks = this.countMarks(result, 'neutral');
    const coverageRate = this.calculateCoverageRate(result);
    const commentLength = this.calculateCommentLength(result);
    const score = this.calculateTotalScore(result);
    const maxScore = this.calculateMaxScore(result);

    await prisma.$executeRaw`
      UPDATE ai_review_logs
      SET
        status = 'success',
        validation_passed = ${validation.passed},
        validation_errors = ${JSON.stringify(validation.errors)},
        prompt_tokens = ${usage.prompt_tokens},
        completion_tokens = ${usage.completion_tokens},
        total_tokens = ${usage.total_tokens},
        latency_ms = ${latency},
        score = ${score},
        max_score = ${maxScore},
        positive_marks_count = ${positiveMarks},
        error_marks_count = ${errorMarks},
        neutral_marks_count = ${neutralMarks},
        coverage_rate = ${coverageRate},
        comment_length = ${commentLength},
        raw_response = ${rawResponse ? JSON.stringify(rawResponse).substring(0, 50000) : null},
        final_result = ${JSON.stringify(result)},
        completed_at = NOW(3)
      WHERE id = ${this.logId}
    `;
  }

  /**
   * 记录失败
   */
  async fail({ error, validation, usage, latency, retryCount }) {
    await prisma.$executeRaw`
      UPDATE ai_review_logs
      SET
        status = ${this.categorizeError(error)},
        error_message = ${error},
        validation_passed = ${validation?.passed || false},
        validation_errors = ${validation ? JSON.stringify(validation.errors) : null},
        prompt_tokens = ${usage?.prompt_tokens || 0},
        completion_tokens = ${usage?.completion_tokens || 0},
        total_tokens = ${usage?.total_tokens || 0},
        latency_ms = ${latency},
        retry_count = ${retryCount || 0},
        completed_at = NOW(3)
      WHERE id = ${this.logId}
    `;
  }

  // 辅助方法
  countMarks(result, status) {
    let count = 0;
    for (const sq of result.subQuestions || []) {
      count += (sq.answerMarks || []).filter(m => m.status === status).length;
    }
    return count;
  }

  calculateCoverageRate(result) {
    let totalChars = 0;
    let markedChars = 0;

    for (const sq of result.subQuestions || []) {
      const answer = sq.answer || '';
      totalChars += answer.length;

      const marked = new Set();
      for (const mark of sq.answerMarks || []) {
        if (mark.start >= 0 && mark.end > mark.start) {
          for (let i = mark.start; i < mark.end; i++) {
            marked.add(i);
          }
        }
      }
      markedChars += marked.size;
    }

    return totalChars > 0 ? markedChars / totalChars : 0;
  }

  calculateCommentLength(result) {
    let total = 0;
    for (const sq of result.subQuestions || []) {
      total += (sq.reviewComment || '').length;
    }
    return total;
  }

  calculateTotalScore(result) {
    let total = 0;
    for (const sq of result.subQuestions || []) {
      total += sq.score || 0;
    }
    return total;
  }

  calculateMaxScore(result) {
    let total = 0;
    for (const sq of result.subQuestions || []) {
      total += sq.maxScore || 0;
    }
    return total;
  }

  categorizeError(error) {
    const msg = error.toLowerCase();
    if (msg.includes('json')) return 'json_error';
    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('validation')) return 'validation_failed';
    return 'api_error';
  }
}
