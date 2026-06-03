// AI批改系统V2 - 验证器
// 完整验证批改结果的质量

export class ReviewValidator {
  constructor(strategy) {
    this.strategy = strategy;
  }

  /**
   * 验证批改结果
   * @returns {Object} { passed: boolean, errors: [], retriable: boolean }
   */
  validate(result, question, answer) {
    const errors = [];

    for (const subQuestion of result.subQuestions || []) {
      // 验证1：基础结构
      errors.push(...this.validateStructure(subQuestion));

      // 验证2：分数一致性
      errors.push(...this.validateScoreConsistency(subQuestion));

      // 验证3：正向标注
      errors.push(...this.validatePositiveMarks(subQuestion));

      // 验证4：错误标注（核心新增）
      errors.push(...this.validateErrorMarks(subQuestion));

      // 验证5：遗漏点
      errors.push(...this.validateMissedPoints(subQuestion));

      // 验证6：覆盖度
      errors.push(...this.validateCoverage(subQuestion));

      // 验证7：点评质量
      errors.push(...this.validateComment(subQuestion));
    }

    // 按严重程度分类
    const errorCount = errors.filter(e => e.severity === 'error').length;
    const warningCount = errors.filter(e => e.severity === 'warning').length;

    return {
      passed: errorCount === 0,
      errors,
      retriable: errors.some(e => e.retriable),
      errorCount,
      warningCount
    };
  }

  validateStructure(subQuestion) {
    const errors = [];
    const required = ['id', 'score', 'answerMarks', 'rubricPoints', 'missedPoints'];

    for (const field of required) {
      if (!(field in subQuestion)) {
        errors.push({
          type: 'MISSING_FIELD',
          severity: 'error',
          retriable: true,
          field,
          message: `缺少必需字段：${field}`
        });
      }
    }

    return errors;
  }

  validateScoreConsistency(subQuestion) {
    const errors = [];
    const { score, maxScore, answerMarks } = subQuestion;

    // 验证分数范围
    if (score < 0 || score > maxScore) {
      errors.push({
        type: 'INVALID_SCORE',
        severity: 'error',
        retriable: true,
        message: `分数${score}超出范围[0, ${maxScore}]`
      });
    }

    // 验证正向标注分数总和
    const positiveMarks = (answerMarks || []).filter(
      m => m.status === 'score' || m.status === 'correct'
    );
    const positiveScore = positiveMarks.reduce(
      (sum, m) => sum + (m.score || 0), 0
    );

    if (Math.abs(positiveScore - score) > 0.01) {
      errors.push({
        type: 'SCORE_MISMATCH',
        severity: 'error',
        retriable: true,
        message: `正向标注分数总和(${positiveScore})与小问得分(${score})不一致`
      });
    }

    return errors;
  }

  validatePositiveMarks(subQuestion) {
    const errors = [];
    const { score, answerMarks } = subQuestion;

    if (score > 0) {
      const positiveMarks = (answerMarks || []).filter(
        m => m.status === 'score' || m.status === 'correct'
      );

      if (positiveMarks.length === 0) {
        errors.push({
          type: 'MISSING_POSITIVE_MARKS',
          severity: 'error',
          retriable: true,
          message: `小问得分${score}分，但没有正向标注`
        });
      }

      // 验证每个正向标注是否有分数
      positiveMarks.forEach((mark, i) => {
        if (!mark.score || mark.score <= 0) {
          errors.push({
            type: 'MISSING_MARK_SCORE',
            severity: 'error',
            retriable: true,
            message: `正向标注#${i + 1}缺少分数`
          });
        }
      });
    }

    return errors;
  }

  validateErrorMarks(subQuestion) {
    const errors = [];

    // 如果策略不要求错误标注，跳过
    if (!(this.strategy.requireErrorMarks ?? this.strategy.require_error_marks)) {
      return errors;
    }

    const { answerMarks, missedPoints, answer } = subQuestion;
    const missedCount = (missedPoints || []).length;

    // 如果有遗漏且学生有作答，必须有错误标注
    if (missedCount > 0 && answer && answer.length > 50) {
      const wrongMarks = (answerMarks || []).filter(m => m.status === 'wrong');
      const minRequired = this.strategy.minErrorMarksCount ?? this.strategy.min_error_marks_count ?? 1;

      if (wrongMarks.length < minRequired) {
        errors.push({
          type: 'MISSING_ERROR_MARKS',
          severity: 'error',
          retriable: true,
          message: `有${missedCount}个遗漏点，但只有${wrongMarks.length}个错误标注（最少需要${minRequired}个）`,
          suggestion: '请检查学生答案，标注具体的错误内容，说明为什么错、正确应该是什么'
        });
      }

      // 验证错误标注的质量
      wrongMarks.forEach((mark, i) => {
        if (!mark.comment || mark.comment.length < 20) {
          errors.push({
            type: 'INSUFFICIENT_ERROR_COMMENT',
            severity: 'warning',
            retriable: true,
            message: `错误标注#${i + 1}的说明太简单（${mark.comment?.length || 0}字）`,
            suggestion: '错误标注必须说明：为什么错 + 正确应该是什么'
          });
        }

        // 错误标注不应该有score
        if (mark.score) {
          errors.push({
            type: 'INVALID_ERROR_MARK',
            severity: 'error',
            retriable: true,
            message: `错误标注#${i + 1}不应该有score字段`
          });
        }
      });
    }

    return errors;
  }

  validateMissedPoints(subQuestion) {
    const errors = [];
    const { rubricPoints, missedPoints } = subQuestion;

    // 计算未命中的采分点
    const missedRubrics = (rubricPoints || []).filter(p => !p.hit);

    if (missedRubrics.length > 0 && (!missedPoints || missedPoints.length === 0)) {
      errors.push({
        type: 'MISSING_MISSED_POINTS',
        severity: 'error',
        retriable: true,
        message: `有${missedRubrics.length}个未命中的采分点，但missedPoints为空`
      });
    }

    return errors;
  }

  validateCoverage(subQuestion) {
    const errors = [];
    const { answerMarks, answer } = subQuestion;

    if (!answer || answer.length === 0) {
      return errors;
    }

    // 计算标注覆盖的字符
    const markedChars = new Set();
    (answerMarks || []).forEach(mark => {
      if (mark.start >= 0 && mark.end > mark.start) {
        for (let i = mark.start; i < mark.end; i++) {
          markedChars.add(i);
        }
      }
    });

    const coverageRate = markedChars.size / answer.length;
    const minRate = this.strategy.minCoverageRate ?? this.strategy.min_coverage_rate ?? 0.3;

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

  validateComment(subQuestion) {
    const errors = [];
    const { reviewComment } = subQuestion;

    if (!reviewComment || reviewComment.trim().length < 200) {
      errors.push({
        type: 'SHORT_COMMENT',
        severity: 'warning',
        retriable: true,
        message: `点评过短（${reviewComment?.length || 0}字，建议300-400字）`
      });
    }

    if (reviewComment && reviewComment.length > 600) {
      errors.push({
        type: 'LONG_COMMENT',
        severity: 'warning',
        retriable: false,
        message: `点评过长（${reviewComment.length}字，建议300-400字）`
      });
    }

    return errors;
  }
}
