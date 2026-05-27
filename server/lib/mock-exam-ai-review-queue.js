import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { getMockExamAiReviewConfig } from "./mock-exam-ai-review-config.js";
import { autoReviewMockExamRecord } from "./mock-exams.js";

const DEFAULT_MAX_CONCURRENCY = 3;
const DEFAULT_MAX_RETRY_COUNT = 3;
const DEFAULT_RETRY_DELAY_MS = 15000;
const DEFAULT_QUEUE_POLL_INTERVAL_MS = 3000;
const DEFAULT_QUEUE_SCAN_BATCH_SIZE = 20;
const STALE_AI_PROCESSING_MIN_RECOVERY_MS = 5 * 60 * 1000;
const STALE_AI_PROCESSING_EXTRA_BUFFER_MS = 60 * 1000;
const STALE_AI_PROCESSING_ERROR_MESSAGE = "AI批改任务异常中断，已恢复为待处理状态，请重新批改";

const runningRecordIds = new Set();
const forcedAdminQueueMap = new Map();
let queueTimer = null;
let queuePumpPromise = null;
let queueRecoveryPromise = null;
let runtimeConfigCache = null;
let runtimeConfigCacheExpiresAt = 0;

const getRuntimeConfig = async ({ db = prisma } = {}) => {
  const now = Date.now();
  if (runtimeConfigCache && runtimeConfigCacheExpiresAt > now) return runtimeConfigCache;
  runtimeConfigCache = await getMockExamAiReviewConfig({ db });
  runtimeConfigCacheExpiresAt = now + 3000;
  return runtimeConfigCache;
};

const getMaxConcurrency = (runtimeConfig = config.mockExamAiReview) =>
  Math.max(1, Number(runtimeConfig?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY) || DEFAULT_MAX_CONCURRENCY);
const getMaxRetryCount = (runtimeConfig = config.mockExamAiReview) =>
  Math.max(0, Number(runtimeConfig?.maxRetryCount ?? DEFAULT_MAX_RETRY_COUNT) || DEFAULT_MAX_RETRY_COUNT);
const getRetryDelayMs = (runtimeConfig = config.mockExamAiReview) =>
  Math.max(0, Number(runtimeConfig?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS) || DEFAULT_RETRY_DELAY_MS);
const getQueuePollIntervalMs = (runtimeConfig = config.mockExamAiReview) =>
  Math.max(500, Number(runtimeConfig?.queuePollIntervalMs ?? DEFAULT_QUEUE_POLL_INTERVAL_MS) || DEFAULT_QUEUE_POLL_INTERVAL_MS);

const normalizeErrorMessage = (error) => {
  if (error instanceof Error && error.message?.trim()) {
    return error.message.trim();
  }
  return "AI批改失败";
};

const isConflictLikeError = (error) => Number(error?.statusCode ?? 0) === 409;

const hasActiveManualReviewLock = (record, currentTime = new Date()) => {
  const reviewerId = `${record?.manualReviewerId ?? ""}`.trim();
  const lockToken = `${record?.manualReviewLockToken ?? ""}`.trim();
  const expiresAt = record?.manualReviewLockExpiresAt ? new Date(record.manualReviewLockExpiresAt) : null;

  return Boolean(
    reviewerId &&
      lockToken &&
      expiresAt &&
      Number.isFinite(expiresAt.getTime()) &&
      expiresAt.getTime() > currentTime.getTime(),
  );
};

const canQueueAutoReview = ({ retryCount, lastError, runtimeConfig = config.mockExamAiReview }) => {
  const currentRetryCount = Math.max(0, Number(retryCount ?? 0) || 0);
  const maxRetryCount = getMaxRetryCount(runtimeConfig);
  if (currentRetryCount < maxRetryCount) return true;
  return currentRetryCount === 0 && !`${lastError ?? ""}`.trim();
};

const getStaleAiProcessingCutoff = (currentTime = new Date(), runtimeConfig = config.mockExamAiReview) => {
  const timeoutMs = Math.max(0, Number(runtimeConfig?.timeoutMs ?? 0) || 0);
  const staleMs = Math.max(timeoutMs + STALE_AI_PROCESSING_EXTRA_BUFFER_MS, STALE_AI_PROCESSING_MIN_RECOVERY_MS);
  return new Date(currentTime.getTime() - staleMs);
};

const recoverStaleAiProcessingReviews = async ({ db, currentTime = new Date(), runtimeConfig = config.mockExamAiReview }) => {
  const staleCutoff = getStaleAiProcessingCutoff(currentTime, runtimeConfig);
  await db.mockExamRecord.updateMany({
    where: {
      status: "submitted",
      reviewWorkflowStatus: "ai_processing",
      aiReviewStartedAt: {
        lt: staleCutoff,
      },
    },
    data: {
      reviewWorkflowStatus: "ai_pending",
      aiReviewStartedAt: null,
      aiReviewFinishedAt: null,
      aiReviewNextRetryAt: currentTime,
      lastAiReviewError: STALE_AI_PROCESSING_ERROR_MESSAGE,
    },
  });
};

const pruneCompletedRunningRecords = async ({ db }) => {
  if (runningRecordIds.size === 0 || typeof db?.mockExamRecord?.findMany !== "function") return;

  const trackedRecordIds = Array.from(runningRecordIds);
  const activeProcessingRecords = await db.mockExamRecord.findMany({
    where: {
      id: { in: trackedRecordIds },
      reviewWorkflowStatus: "ai_processing",
    },
    select: { id: true },
  });
  const activeProcessingIdSet = new Set(activeProcessingRecords.map((item) => `${item?.id ?? ""}`.trim()).filter(Boolean));

  trackedRecordIds.forEach((recordId) => {
    if (!activeProcessingIdSet.has(recordId)) {
      runningRecordIds.delete(recordId);
    }
  });
};

const ensureRecoveredStaleAiProcessing = async ({ db, currentTime = new Date(), runtimeConfig = config.mockExamAiReview }) => {
  if (queueRecoveryPromise) {
    await queueRecoveryPromise;
    return;
  }

  queueRecoveryPromise = (async () => {
    try {
      await recoverStaleAiProcessingReviews({ db, currentTime, runtimeConfig });
      await pruneCompletedRunningRecords({ db });
    } finally {
      queueRecoveryPromise = null;
    }
  })();

  await queueRecoveryPromise;
};

const buildRetryErrorMessage = (error, nextRetryCount) => `${normalizeErrorMessage(error)}（系统将在稍后自动重试，第 ${nextRetryCount} 次）`;

const buildExhaustedErrorMessage = (error, maxRetryCount) => `${normalizeErrorMessage(error)}（已自动重试 ${maxRetryCount} 次，已退回待批改）`;

export const enqueueMockExamAiReview = async ({ db = prisma, recordId, adminId = "", currentTime = new Date() }) => {
  const normalizedRecordId = `${recordId ?? ""}`.trim();
  const normalizedAdminId = `${adminId ?? ""}`.trim();
  if (!normalizedRecordId) {
    throw Object.assign(new Error("缺少批改记录参数"), { statusCode: 400 });
  }

  const record = await db.mockExamRecord.findUnique({
    where: { id: normalizedRecordId },
    select: {
      id: true,
      status: true,
      reviewWorkflowStatus: true,
      aiReviewRetryCount: true,
      lastAiReviewError: true,
      manualReviewerId: true,
      manualReviewLockToken: true,
      manualReviewLockExpiresAt: true,
    },
  });

  if (!record) {
    throw Object.assign(new Error("考试记录不存在"), { statusCode: 404 });
  }

  if (`${record.status ?? ""}`.trim() !== "submitted") {
    throw Object.assign(new Error("该考试记录尚未交卷"), { statusCode: 409 });
  }

  const runtimeConfig = await getRuntimeConfig({ db });
  const workflowStatus = `${record.reviewWorkflowStatus ?? ""}`.trim();
  if (!normalizedAdminId && (workflowStatus === "published" || workflowStatus === "manual_pending")) {
    throw Object.assign(new Error("当前试卷已完成批改，无需进入自动批改队列"), { statusCode: 409 });
  }

  if (!normalizedAdminId && !canQueueAutoReview({ retryCount: record.aiReviewRetryCount, lastError: record.lastAiReviewError, runtimeConfig })) {
    throw Object.assign(new Error("当前试卷已达到自动批改次数上限，请转人工处理"), { statusCode: 409 });
  }

  const reviewerId = `${record.manualReviewerId ?? ""}`.trim();
  if (hasActiveManualReviewLock(record, currentTime) && reviewerId !== normalizedAdminId) {
    throw Object.assign(new Error("该试卷已被人工领取，不能进入自动批改队列"), { statusCode: 409 });
  }

  if (normalizedAdminId) {
    forcedAdminQueueMap.set(normalizedRecordId, normalizedAdminId);
  } else {
    forcedAdminQueueMap.delete(normalizedRecordId);
  }

  await db.mockExamRecord.update({
    where: { id: normalizedRecordId },
    data: {
      reviewWorkflowStatus: "ai_pending",
      aiReviewStartedAt: null,
      aiReviewFinishedAt: null,
      aiReviewRetryCount: 0,
      aiReviewNextRetryAt: currentTime,
      lastAiReviewError: null,
      reviewedAt: null,
      publishedAt: null,
      manualReviewerId: null,
      manualReviewerName: null,
      manualReviewLockToken: null,
      manualReviewClaimedAt: null,
      manualReviewLockExpiresAt: null,
      manualReviewVersion: { increment: 1 },
    },
  });

  void pumpMockExamAiReviewQueue({ db });
  return { success: true, recordId: normalizedRecordId };
};

const retryFailedMockExamAiReview = async ({ db, recordId, error, currentTime = new Date() }) => {
  const runtimeConfig = await getRuntimeConfig({ db });
  const latestRecord = await db.mockExamRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      aiReviewRetryCount: true,
      manualReviewerId: true,
      manualReviewLockToken: true,
      manualReviewLockExpiresAt: true,
    },
  });

  if (!latestRecord) {
    forcedAdminQueueMap.delete(recordId);
    return "missing";
  }

  const forcedAdminId = `${forcedAdminQueueMap.get(recordId) ?? ""}`.trim();
  const reviewerId = `${latestRecord.manualReviewerId ?? ""}`.trim();
  if (hasActiveManualReviewLock(latestRecord, currentTime) && reviewerId !== forcedAdminId) {
    await db.mockExamRecord.update({
      where: { id: recordId },
      data: {
        reviewWorkflowStatus: "ai_pending",
        aiReviewStartedAt: null,
        aiReviewFinishedAt: null,
        aiReviewNextRetryAt: null,
        lastAiReviewError: normalizeErrorMessage(error),
      },
    });
    forcedAdminQueueMap.delete(recordId);
    return "blocked";
  }

  const currentRetryCount = Math.max(0, Number(latestRecord.aiReviewRetryCount ?? 0) || 0);
  const maxRetryCount = getMaxRetryCount(runtimeConfig);
  if (currentRetryCount >= maxRetryCount) {
    await db.mockExamRecord.update({
      where: { id: recordId },
      data: {
        reviewWorkflowStatus: "ai_pending",
        aiReviewStartedAt: null,
        aiReviewFinishedAt: null,
        aiReviewNextRetryAt: null,
        aiReviewRetryCount: currentRetryCount,
        lastAiReviewError: buildExhaustedErrorMessage(error, maxRetryCount),
      },
    });
    forcedAdminQueueMap.delete(recordId);
    return "exhausted";
  }

  const nextRetryCount = currentRetryCount + 1;
  await db.mockExamRecord.update({
    where: { id: recordId },
    data: {
      reviewWorkflowStatus: "ai_pending",
      aiReviewStartedAt: null,
      aiReviewFinishedAt: null,
      aiReviewRetryCount: nextRetryCount,
      aiReviewNextRetryAt: new Date(currentTime.getTime() + getRetryDelayMs(runtimeConfig)),
      lastAiReviewError: buildRetryErrorMessage(error, nextRetryCount),
    },
  });
  return "scheduled";
};

const consumeQueuedRecord = async ({ db, recordId }) => {
  runningRecordIds.add(recordId);
  try {
    const forcedAdminId = `${forcedAdminQueueMap.get(recordId) ?? ""}`.trim();
    const runtimeConfig = await getRuntimeConfig({ db });
    await autoReviewMockExamRecord({ db, recordId, adminId: forcedAdminId, runtimeConfig });
    forcedAdminQueueMap.delete(recordId);
  } catch (error) {
    if (!isConflictLikeError(error)) {
      const retryOutcome = await retryFailedMockExamAiReview({ db, recordId, error });
      if (retryOutcome !== "scheduled") {
        forcedAdminQueueMap.delete(recordId);
      }
    } else {
      forcedAdminQueueMap.delete(recordId);
    }
  } finally {
    runningRecordIds.delete(recordId);
    void pumpMockExamAiReviewQueue({ db });
  }
};

export const pumpMockExamAiReviewQueue = async ({ db = prisma, currentTime = new Date() } = {}) => {
  if (queuePumpPromise) return queuePumpPromise;

  queuePumpPromise = (async () => {
    try {
      const runtimeConfig = await getRuntimeConfig({ db });
      if (runtimeConfig.disableQueue) return;
      await ensureRecoveredStaleAiProcessing({ db, currentTime, runtimeConfig });

      const availableSlots = Math.max(0, getMaxConcurrency(runtimeConfig) - runningRecordIds.size);
      if (availableSlots <= 0) return;

      const runnableRecordIds = [];
      const seenRecordIds = new Set();
      const scanBatchSize = Math.max(DEFAULT_QUEUE_SCAN_BATCH_SIZE, availableSlots * 4);
      let skip = 0;

      while (runnableRecordIds.length < availableSlots) {
        const queuedRecords = await db.mockExamRecord.findMany({
          where: {
            status: "submitted",
            reviewWorkflowStatus: "ai_pending",
            OR: [{ aiReviewNextRetryAt: null }, { aiReviewNextRetryAt: { lte: currentTime } }],
          },
          orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
          skip,
          take: scanBatchSize,
          select: {
            id: true,
            manualReviewerId: true,
            manualReviewLockToken: true,
            manualReviewLockExpiresAt: true,
            aiReviewRetryCount: true,
            lastAiReviewError: true,
          },
        });

        if (queuedRecords.length === 0) break;

        for (const item of queuedRecords) {
          const recordId = `${item.id ?? ""}`.trim();
          if (!recordId || seenRecordIds.has(recordId) || runningRecordIds.has(recordId)) continue;
          seenRecordIds.add(recordId);

          if (!canQueueAutoReview({ retryCount: item.aiReviewRetryCount, lastError: item.lastAiReviewError, runtimeConfig })) continue;
          if (
            hasActiveManualReviewLock(item, currentTime) &&
            `${forcedAdminQueueMap.get(recordId) ?? ""}`.trim() !== `${item.manualReviewerId ?? ""}`.trim()
          ) {
            continue;
          }

          runnableRecordIds.push(recordId);
          if (runnableRecordIds.length >= availableSlots) break;
        }

        if (queuedRecords.length < scanBatchSize) break;
        skip += queuedRecords.length;
      }

      for (const recordId of runnableRecordIds) {
        void consumeQueuedRecord({ db, recordId });
      }
    } finally {
      queuePumpPromise = null;
    }
  })();

  return queuePumpPromise;
};

export const startMockExamAiReviewQueue = ({ db = prisma } = {}) => {
  if (queueTimer !== null) return;

  const triggerPump = async () => {
    void pumpMockExamAiReviewQueue({ db });
    const runtimeConfig = await getRuntimeConfig({ db }).catch(() => config.mockExamAiReview);
    const nextInterval = getQueuePollIntervalMs(runtimeConfig);
    if (queueTimer !== null) {
      clearTimeout(queueTimer);
      queueTimer = setTimeout(triggerPump, nextInterval);
    }
  };

  queueTimer = setTimeout(triggerPump, 0);
};

export const stopMockExamAiReviewQueue = () => {
  if (queueTimer !== null) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
};
