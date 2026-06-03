import { prisma } from '../prisma.js';
import { MultiSubQuestionHandler } from './multi-handler.js';
import { ReviewLogger } from './logger.js';
import { getMockExamAiReviewConfig } from '../mock-exam-ai-review-config.js';

const numberOr = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanOr = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
};

export const normalizeStrategy = (strategy) => {
  if (!strategy) return null;

  const temperature = numberOr(strategy.temperature, 0.5);
  const maxTokens = numberOr(strategy.maxTokens, 25000);
  const timeoutMs = numberOr(strategy.timeoutMs, 120000);
  const minErrorMarksCount = numberOr(strategy.minErrorMarksCount, 1);
  const minCoverageRate = numberOr(strategy.minCoverageRate, 0.3);
  const requireErrorMarks = booleanOr(strategy.requireErrorMarks, true);
  const strictValidation = booleanOr(strategy.strictValidation, true);

  return {
    ...strategy,
    temperature,
    maxTokens,
    timeoutMs,
    requireErrorMarks,
    minErrorMarksCount,
    minCoverageRate,
    strictValidation,
    // Keep snake_case aliases for older V2 internals.
    max_tokens: maxTokens,
    timeout_ms: timeoutMs,
    require_error_marks: requireErrorMarks,
    min_error_marks_count: minErrorMarksCount,
    min_coverage_rate: minCoverageRate,
    strict_validation: strictValidation,
    is_active: booleanOr(strategy.isActive ?? strategy.is_active, true),
    created_at: strategy.createdAt ?? strategy.created_at ?? null,
    updated_at: strategy.updatedAt ?? strategy.updated_at ?? null,
  };
};

export async function getActiveStrategy() {
  const strategy = await prisma.aiReviewStrategy.findFirst({
    where: { isActive: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  });

  if (!strategy) {
    throw new Error('No active AI review strategy');
  }

  return normalizeStrategy(strategy);
}

export async function reviewWithV2({ question, answer, recordId }) {
  const startTime = Date.now();
  const strategy = await getActiveStrategy();
  const runtimeConfig = await getMockExamAiReviewConfig({ db: prisma });
  const handler = new MultiSubQuestionHandler(strategy, runtimeConfig);
  const logger = await ReviewLogger.start({
    recordId,
    questionId: question.id,
    subQuestionId: null,
    strategy,
    model: strategy.model,
    prompt: {
      system: 'System prompt will be logged by sub-review calls',
      user: 'User prompt will be logged by sub-review calls',
    },
  });

  try {
    const reviewResult = await handler.review({ question, answer, recordId });

    if (reviewResult.success) {
      await logger.success({
        result: reviewResult.result,
        validation: reviewResult.validation,
        usage: reviewResult.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        latency: Date.now() - startTime,
        rawResponse: reviewResult.rawResponse || null,
      });

      return {
        success: true,
        reviewJson: buildReviewJson(reviewResult.result),
        logId: logger.logId,
        validation: reviewResult.validation,
      };
    }

    await logger.fail({
      error: reviewResult.error,
      validation: reviewResult.validation,
      usage: reviewResult.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      latency: Date.now() - startTime,
      retryCount: reviewResult.metrics?.retry_count || 0,
    });

    throw new Error(reviewResult.error);
  } catch (error) {
    await logger.fail({
      error: error.message,
      validation: null,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      latency: Date.now() - startTime,
      retryCount: 0,
    });

    throw error;
  }
}

function buildReviewJson(result) {
  const subQuestions = Array.isArray(result?.subQuestions) ? result.subQuestions : [];

  return {
    source: 'ai',
    reviewSource: 'ai-v2',
    reviewProvider: 'openai-compatible',
    version: 'v2',
    totalScore: subQuestions.reduce((sum, sq) => sum + (sq.score || 0), 0),
    maxScore: subQuestions.reduce((sum, sq) => sum + (sq.maxScore || 0), 0),
    reviewVoiceUrl: '',
    reviewVoiceObjectKey: '',
    reviewVoiceDurationSeconds: 0,
    feedbackStars: 0,
    feedbackSubmittedAt: null,
    subQuestions: subQuestions.map((sq) => ({
      id: sq.id,
      title: sq.title || '',
      answer: sq.answer || '',
      score: sq.score || 0,
      maxScore: sq.maxScore || 0,
      reviewComment: sq.reviewComment || '',
      referenceAnswer: sq.referenceAnswer || '',
      reviewSource: 'ai-v2',
      reviewProvider: 'openai-compatible',
      abilityLabel: sq.abilityLabel || '',
      missedPoints: sq.missedPoints || [],
      answerMarks: sq.answerMarks || [],
      rubricGuidance: sq.rubricGuidance || '',
      rubricPoints: sq.rubricPoints || [],
      skippedReview: false,
      skippedReviewReason: '',
    })),
  };
}

export function shouldUseV2() {
  return true;
}

export async function reviewSubjectiveQuestion({ question, answer, recordId }) {
  console.log(`[AI review V2] recordId=${recordId}, questionId=${question.id}`);
  return reviewWithV2({ question, answer, recordId });
}
