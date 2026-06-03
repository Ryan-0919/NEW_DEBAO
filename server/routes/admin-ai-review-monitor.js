import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../lib/response.js";

const emptyStats = {
  period: "最近1小时",
  total: 0,
  success_count: 0,
  success_rate: 0,
  failed_count: 0,
  failure_breakdown: {
    validation_failed: 0,
    json_error: 0,
    timeout: 0,
    api_error: 0,
  },
  avg_latency_ms: 0,
  avg_total_tokens: 0,
  avg_error_marks: "0.0",
  avg_positive_marks: "0.0",
  avg_coverage_rate: "0.000",
};

const emptyQuality = {
  period: "最近24小时",
  total_reviews: 0,
  error_marking_rate: 0,
  avg_error_marks_per_review: "0.00",
  avg_positive_marks_per_review: "0.00",
  avg_coverage_rate: "0.000",
  avg_comment_length: 0,
  coverage_range: {
    min: "0.000",
    max: "0.000",
  },
};

const isMissingAiReviewTableError = (error) => {
  const message = `${error?.message ?? ""}`;
  return message.includes("ai_review_logs") || message.includes("ai_review_strategies");
};

const handleMonitorError = (res, error, fallbackData) => {
  if (isMissingAiReviewTableError(error)) {
    return ok(res, {
      ...fallbackData,
      migrationRequired: true,
      migrationHint: "AI批改V2数据表尚未创建，请先执行 scripts/migrate-ai-review-v2.js。",
    });
  }

  return fail(res, error instanceof Error ? error.message : "AI批改监控数据加载失败", 500);
};

export const getRealtimeStats = async (_req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stats = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'validation_failed' THEN 1 ELSE 0 END) as validation_failed,
        SUM(CASE WHEN status = 'json_error' THEN 1 ELSE 0 END) as json_error,
        SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout,
        SUM(CASE WHEN status = 'api_error' THEN 1 ELSE 0 END) as api_error,
        AVG(latency_ms) as avg_latency_ms,
        AVG(total_tokens) as avg_total_tokens,
        AVG(CASE WHEN status = 'success' THEN error_marks_count ELSE NULL END) as avg_error_marks,
        AVG(CASE WHEN status = 'success' THEN positive_marks_count ELSE NULL END) as avg_positive_marks,
        AVG(CASE WHEN status = 'success' THEN coverage_rate ELSE NULL END) as avg_coverage_rate
      FROM ai_review_logs
      WHERE started_at > ${oneHourAgo}
    `;

    const result = stats[0] || {};
    const total = Number(result.total) || 0;
    const successCount = Number(result.success_count) || 0;

    return ok(res, {
      period: "最近1小时",
      total,
      success_count: successCount,
      success_rate: total > 0 ? successCount / total : 0,
      failed_count: Math.max(total - successCount, 0),
      failure_breakdown: {
        validation_failed: Number(result.validation_failed) || 0,
        json_error: Number(result.json_error) || 0,
        timeout: Number(result.timeout) || 0,
        api_error: Number(result.api_error) || 0,
      },
      avg_latency_ms: Math.round(Number(result.avg_latency_ms) || 0),
      avg_total_tokens: Math.round(Number(result.avg_total_tokens) || 0),
      avg_error_marks: (Number(result.avg_error_marks) || 0).toFixed(1),
      avg_positive_marks: (Number(result.avg_positive_marks) || 0).toFixed(1),
      avg_coverage_rate: (Number(result.avg_coverage_rate) || 0).toFixed(3),
    });
  } catch (error) {
    console.error("[AI review monitor] Failed to load realtime stats:", error);
    return handleMonitorError(res, error, emptyStats);
  }
};

export const getFailures = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const hours = Math.min(Number(req.query.hours) || 24, 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const failures = await prisma.$queryRaw`
      SELECT
        id,
        record_id,
        question_id,
        status,
        error_message,
        validation_errors,
        started_at,
        latency_ms,
        retry_count,
        strategy_name,
        model
      FROM ai_review_logs
      WHERE started_at >= ${since}
        AND status <> 'success'
      ORDER BY started_at DESC
      LIMIT ${limit}
    `;

    return ok(res, {
      total: failures.length,
      failures: failures.map((failure) => ({
        ...failure,
        id: `${failure.id}`,
        started_at: failure.started_at instanceof Date ? failure.started_at.toISOString() : failure.started_at,
        validation_errors:
          typeof failure.validation_errors === "string"
            ? JSON.parse(failure.validation_errors)
            : failure.validation_errors ?? null,
      })),
    });
  } catch (error) {
    console.error("[AI review monitor] Failed to load failures:", error);
    return handleMonitorError(res, error, { total: 0, failures: [] });
  }
};

export const getQualityMetrics = async (req, res) => {
  try {
    const hours = Math.min(Number(req.query.hours) || 24, 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const quality = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_reviews,
        SUM(CASE WHEN error_marks_count > 0 THEN 1 ELSE 0 END) as reviews_with_errors,
        AVG(error_marks_count) as avg_error_marks,
        AVG(positive_marks_count) as avg_positive_marks,
        AVG(coverage_rate) as avg_coverage,
        AVG(comment_length) as avg_comment_length,
        MIN(coverage_rate) as min_coverage,
        MAX(coverage_rate) as max_coverage
      FROM ai_review_logs
      WHERE started_at > ${since}
        AND status = 'success'
    `;

    const result = quality[0] || {};
    const totalReviews = Number(result.total_reviews) || 0;
    const reviewsWithErrors = Number(result.reviews_with_errors) || 0;

    return ok(res, {
      period: `最近${hours}小时`,
      total_reviews: totalReviews,
      error_marking_rate: totalReviews > 0 ? reviewsWithErrors / totalReviews : 0,
      avg_error_marks_per_review: (Number(result.avg_error_marks) || 0).toFixed(2),
      avg_positive_marks_per_review: (Number(result.avg_positive_marks) || 0).toFixed(2),
      avg_coverage_rate: (Number(result.avg_coverage) || 0).toFixed(3),
      avg_comment_length: Math.round(Number(result.avg_comment_length) || 0),
      coverage_range: {
        min: (Number(result.min_coverage) || 0).toFixed(3),
        max: (Number(result.max_coverage) || 0).toFixed(3),
      },
    });
  } catch (error) {
    console.error("[AI review monitor] Failed to load quality metrics:", error);
    return handleMonitorError(res, error, emptyQuality);
  }
};

export const getTimeseries = async (req, res) => {
  try {
    const hours = Math.min(Number(req.query.hours) || 24, 168);
    const interval = Number(req.query.interval) || 60;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const timeseries = await prisma.$queryRaw`
      SELECT
        DATE_FORMAT(started_at, '%Y-%m-%d %H:00:00') as time_bucket,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        AVG(CASE WHEN status = 'success' THEN error_marks_count ELSE NULL END) as avg_error_marks
      FROM ai_review_logs
      WHERE started_at > ${since}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;

    return ok(res, {
      period: `最近${hours}小时`,
      interval: `${interval}分钟`,
      data: timeseries.map((row) => ({
        time: row.time_bucket,
        total: Number(row.total),
        success: Number(row.success),
        success_rate: Number(row.total) > 0 ? Number(row.success) / Number(row.total) : 0,
        avg_error_marks: (Number(row.avg_error_marks) || 0).toFixed(1),
      })),
    });
  } catch (error) {
    console.error("[AI review monitor] Failed to load timeseries:", error);
    return handleMonitorError(res, error, {
      period: "最近24小时",
      interval: "60分钟",
      data: [],
    });
  }
};
