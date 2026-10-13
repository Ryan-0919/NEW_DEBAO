// AI批改系统V2 - 分阶段批改器
import { AiReviewer } from './reviewer.js';
import { buildPhase1Prompt, buildPhase2Prompt } from './phase-prompt.js';
import { getPerformanceMonitor } from './performance-monitor.js';

/**
 * 分阶段批改器
 * 阶段1：返回核心批改信息（score, reviewComment, answerMarks）
 * 阶段2：返回补充信息（missedPoints）
 * rubricPoints：前端根据answerMarks计算
 */
export class PhaseReviewer {
  constructor(strategy, runtimeConfig) {
    this.strategy = strategy;
    this.runtimeConfig = runtimeConfig;
    this.reviewer = new AiReviewer(strategy, runtimeConfig);
    this.monitor = getPerformanceMonitor();
  }

  /**
   * 批改单个小问（分阶段）
   */
  async reviewSubQuestion({ question, subQuestion, answer, rubric, onProgress }) {
    const startTime = Date.now();

    try {
      // 阶段1：核心批改
      console.log(`[分阶段批改] 执行阶段1：核心批改`);
      const phase1StartTime = Date.now();
      const phase1Result = await this.executePhase1({
        question,
        subQuestion,
        answer,
        rubric
      });
      await onProgress?.();

      const phase1Time = Date.now() - phase1StartTime;

      if (!phase1Result.success) {
        console.error(`[分阶段批改] 阶段1失败: ${phase1Result.error}`);
        this.monitor.recordPhase1({ timeMs: phase1Time, usage: phase1Result.usage, parseSuccess: false });
        this.monitor.recordRequest({ success: false, totalTimeMs: Date.now() - startTime, subQuestionCount: 1 });
        return {
          success: false,
          error: phase1Result.error,
          usage: phase1Result.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          rawResponse: this.buildRawResponseSnapshot({ phase1Result })
        };
      }

      // 记录阶段1性能
      this.monitor.recordPhase1({ timeMs: phase1Time, usage: phase1Result.usage, parseSuccess: true });

      // 阶段2：补充信息（可选）
      console.log(`[分阶段批改] 执行阶段2：补充信息`);
      const phase2StartTime = Date.now();
      const phase2Result = await this.executePhase2({
        question,
        subQuestion,
        answer,
        rubric,
        phase1Result: phase1Result.data
      });
      await onProgress?.();

      const phase2Time = Date.now() - phase2StartTime;

      // 记录阶段2性能
      this.monitor.recordPhase2({
        timeMs: phase2Time,
        usage: phase2Result.usage,
        parseSuccess: phase2Result.success
      });

      if (!phase2Result.success) {
        const usage = {
          prompt_tokens: (phase1Result.usage?.prompt_tokens || 0) + (phase2Result.usage?.prompt_tokens || 0),
          completion_tokens: (phase1Result.usage?.completion_tokens || 0) + (phase2Result.usage?.completion_tokens || 0),
          total_tokens: (phase1Result.usage?.total_tokens || 0) + (phase2Result.usage?.total_tokens || 0)
        };

        this.monitor.recordRequest({
          success: false,
          totalTimeMs: Date.now() - startTime,
          subQuestionCount: 1
        });

        return {
          success: false,
          error: phase2Result.error || "阶段2批改失败：未能生成划线原文或遗漏点",
          usage,
          rawResponse: this.buildRawResponseSnapshot({ phase1Result, phase2Result })
        };
      }

      // 合并answerMarks和highlight
      const answerMarks = this.mergeAnswerMarks(
        phase1Result.data.answerMarks,
        phase2Result.data.answerMarkHighlights
      );
      const rubricPoints = this.calculateRubricPoints(answerMarks, rubric);
      const normalizedScore = this.calculatePositiveMarkScore(answerMarks, rubric.maxScore);

      // 合并结果
      const finalResult = {
        id: subQuestion.id,
        title: subQuestion.title,
        score: normalizedScore,
        maxScore: rubric.maxScore,
        answer: answer || '',
        reviewComment: phase1Result.data.reviewComment,
        answerMarks: answerMarks,
        rubricPoints,
        missedPoints: phase2Result.data.missedPoints || [],
        referenceAnswer: rubric.referenceAnswer || '',
        rubricGuidance: rubric.guidance || '',
        abilityLabel: subQuestion.abilityLabel || '',
        reviewSource: 'ai-v2-phase',
        reviewProvider: 'openai-compatible'
      };

      // 记录整体请求成功
      this.monitor.recordRequest({
        success: true,
        totalTimeMs: Date.now() - startTime,
        subQuestionCount: 1
      });

      return {
        success: true,
        result: finalResult,
        usage: {
          prompt_tokens: (phase1Result.usage?.prompt_tokens || 0) + (phase2Result.usage?.prompt_tokens || 0),
          completion_tokens: (phase1Result.usage?.completion_tokens || 0) + (phase2Result.usage?.completion_tokens || 0),
          total_tokens: (phase1Result.usage?.total_tokens || 0) + (phase2Result.usage?.total_tokens || 0)
        },
        metrics: {
          latency_ms: Date.now() - startTime,
          phase1_success: phase1Result.success,
          phase2_success: phase2Result.success
        },
        rawResponse: this.buildRawResponseSnapshot({ phase1Result, phase2Result })
      };

    } catch (error) {
      console.error(`[分阶段批改] 异常:`, error);
      return {
        success: false,
        error: error.message,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }
  }

  /**
   * 执行阶段1：核心批改
   */
  async executePhase1({ question, subQuestion, answer, rubric }) {
    try {
      const prompt = buildPhase1Prompt({
        question,
        subQuestion,
        answer,
        rubric,
        strategy: this.strategy
      });

      console.log(`[阶段1] Prompt长度: ${prompt.userPrompt.length} 字符`);

      const response = await this.reviewer.callAi(prompt);

      let parsedData;
      try {
        parsedData = await this.reviewer.parseAndRepairJson(response);
      } catch (parseError) {
        return {
          success: false,
          error: '阶段1 JSON解析失败: ' + parseError.message,
          usage: response.usage,
          rawResponse: response.content
        };
      }

      // 提取第一个小问的结果
      const subQuestionResult = parsedData.subQuestions?.[0];
      if (!subQuestionResult) {
        return {
          success: false,
          error: '阶段1返回数据格式错误',
          usage: response.usage,
          rawResponse: response.content
        };
      }

      return {
        success: true,
        data: {
          score: subQuestionResult.score || 0,
          reviewComment: subQuestionResult.reviewComment || '',
          answerMarks: subQuestionResult.answerMarks || []
        },
        usage: response.usage,
        rawResponse: response.content
      };

    } catch (error) {
      console.error(`[阶段1] 异常:`, error);
      return {
        success: false,
        error: error.message,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        rawResponse: null
      };
    }
  }

  /**
   * 执行阶段2：补充信息
   * 注意：即使学生满分，也要执行阶段2以返回highlight字段
   */
  async executePhase2({ question, subQuestion, answer, rubric, phase1Result }) {
    try {
      // 始终执行阶段2，因为前端需要highlight字段来显示划线标注
      console.log(`[阶段2] 返回highlight和missedPoints`);

      const prompt = buildPhase2Prompt({
        question,
        subQuestion,
        answer,
        rubric,
        phase1Result,
        strategy: this.strategy
      });

      console.log(`[阶段2] Prompt长度: ${prompt.userPrompt.length} 字符`);

      const response = await this.reviewer.callAi(prompt);

      let parsedData;
      try {
        parsedData = await this.reviewer.parseAndRepairJson(response);
      } catch (parseError) {
        console.warn(`[阶段2] JSON解析失败`);
        return {
          success: false,
          error: '阶段2 JSON解析失败: ' + parseError.message,
          data: { answerMarkHighlights: [], missedPoints: [] },
          usage: response.usage,
          rawResponse: response.content
        };
      }

      // 提取第一个小问的结果
      const subQuestionResult = parsedData.subQuestions?.[0];
      if (!subQuestionResult) {
        return {
          success: false,
          error: '阶段2返回数据格式错误',
          data: { answerMarkHighlights: [], missedPoints: [] },
          usage: response.usage,
          rawResponse: response.content
        };
      }

      return {
        success: true,
        data: {
          answerMarkHighlights: subQuestionResult.answerMarkHighlights || [],
          missedPoints: subQuestionResult.missedPoints || []
        },
        usage: response.usage,
        rawResponse: response.content
      };

    } catch (error) {
      console.error(`[阶段2] 异常:`, error);
      return {
        success: false,
        error: error.message,
        data: { answerMarkHighlights: [], missedPoints: [] },
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        rawResponse: null
      };
    }
  }

  /**
   * 合并answerMarks和highlight
   */
  mergeAnswerMarks(phase1Marks, highlights) {
    const highlightMap = {};
    highlights.forEach(h => {
      highlightMap[h.id] = h.highlight;
    });

    return phase1Marks.map(mark => {
      const status = mark.status === 'correct' ? 'score' : mark.status;
      const isPositive = status === 'score';
      return {
        ...mark,
        status,
        score: isPositive ? Math.max(0, Number(mark.score ?? 0) || 0) : undefined,
        highlight: highlightMap[mark.id] || ''
      };
    });
  }

  /**
   * 根据answerMarks计算rubricPoints
   */
  calculateRubricPoints(answerMarks, rubric) {
    const rubricPoints = rubric.points.map(rp => ({
      id: rp.id,
      title: rp.title,
      score: this.getPointScore(rp),
      maxScore: this.getPointScore(rp),
      description: rp.description || '',
      hit: false,
      awardedScore: 0,
      comment: ''
    }));

    // 遍历answerMarks，标记对应的rubricPoint
    answerMarks.forEach(mark => {
      if (mark.status === 'score' && mark.score > 0) {
        // 根据mark.id找到对应的rubricPoint
        // 假设mark.id格式为 "m1", "m2" 等，对应rubricPoints的索引
        const index = parseInt(mark.id.replace(/\D/g, '')) - 1;
        if (index >= 0 && index < rubricPoints.length) {
          rubricPoints[index].hit = true;
          rubricPoints[index].awardedScore = Math.min(mark.score, rubricPoints[index].maxScore || mark.score);
          rubricPoints[index].comment = mark.comment || '';
        }
      }
    });

    return rubricPoints;
  }

  getPointScore(point) {
    return Math.max(0, Number(point?.maxScore ?? point?.score ?? 0) || 0);
  }

  calculatePositiveMarkScore(answerMarks, maxScore) {
    const total = (answerMarks || [])
      .filter(mark => mark.status === 'score' || mark.status === 'correct')
      .reduce((sum, mark) => sum + (Number(mark.score ?? 0) || 0), 0);
    return Math.min(Math.max(0, Math.round(total)), Math.max(0, Number(maxScore ?? 0) || 0));
  }

  buildRawResponseSnapshot({ phase1Result, phase2Result }) {
    return {
      phase1: phase1Result?.rawResponse || null,
      phase2: phase2Result?.rawResponse || null,
    };
  }
}
