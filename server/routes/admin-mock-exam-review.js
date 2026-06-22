import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { enqueueMockExamAiReview } from "../lib/mock-exam-ai-review-queue.js";
import { fail, ok } from "../lib/response.js";
import { formatDateTime } from "../lib/time.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";

const REVIEW_ADMIN_ROLES = ["super_admin", "operations_admin", "review_admin"];
const SUBJECTIVE_TYPE = "subjective_case";
const LOCK_MINUTES = 120;
const RETURNED_FOR_REDO_STATUS = "returned_for_redo";
const WORKFLOW_STATUSES = new Set(["ai_pending", "ai_processing", "manual_pending", "published"]);
const REVIEW_WORKFLOW_STATUS_VALUES = [...WORKFLOW_STATUSES];

export const adminMockExamReviewRouter = Router();

adminMockExamReviewRouter.use(requireAdminAuth);
adminMockExamReviewRouter.use(requireAdminRoles(...REVIEW_ADMIN_ROLES));

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const clampScore = (value, min = 0, max = 0) => Math.max(min, Math.min(max, Math.round(Number(value ?? 0) || 0)));

const parseJsonSafely = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeText = (value = "") => `${value ?? ""}`.replace(/\r\n/g, "\n").trim();

const isSubjectiveQuestion = (question) => `${question?.type ?? ""}` === SUBJECTIVE_TYPE;

const getAdminName = (req) => req.auth?.admin?.name || req.auth?.admin?.account || "管理员";

const buildLockExpiresAt = (currentTime = new Date()) => new Date(currentTime.getTime() + LOCK_MINUTES * 60 * 1000);

const getPaperTotalScore = (questions = []) => questions.reduce((sum, question) => sum + Number(question.score ?? 0), 0);

const normalizeRubricPoints = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map((item, index) => ({
      id: `${item?.id ?? `rubric_${index + 1}`}`.trim(),
      title: normalizeText(item?.title ?? item?.label ?? ""),
      description: normalizeText(item?.description ?? item?.comment ?? ""),
      score: Number(item?.score ?? item?.awardedScore ?? 0) || 0,
      maxScore: Number(item?.maxScore ?? item?.score ?? 0) || 0,
      awardedScore: Number(item?.awardedScore ?? item?.score ?? 0) || 0,
      hit: Boolean(item?.hit ?? item?.matched ?? false),
      comment: normalizeText(item?.comment ?? item?.description ?? ""),
    }))
    .filter((item) => item.id && (item.title || item.comment || item.description));

const normalizeMissedPoints = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map((item, index) => ({
      id: `${item?.id ?? `missed_${index + 1}`}`.trim(),
      title: normalizeText(item?.title ?? item?.label ?? ""),
      description: normalizeText(item?.description ?? ""),
      score: Number(item?.score ?? 0) || 0,
      comment: normalizeText(item?.comment ?? ""),
      suggestion: normalizeText(item?.suggestion ?? item?.advice ?? ""),
    }))
    .filter((item) => item.id && (item.title || item.comment || item.description || item.suggestion));

const normalizeAnswerMarks = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map((item, index) => ({
      id: `${item?.id ?? `mark_${index + 1}`}`.trim(),
      highlight: normalizeText(item?.highlight ?? item?.text ?? ""),
      comment: normalizeText(item?.comment ?? ""),
      status: item?.status === "wrong" || item?.status === "score" || item?.status === "neutral" ? item.status : "correct",
      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : undefined,
      start: Number.isInteger(Number(item?.start)) ? Number(item.start) : undefined,
      end: Number.isInteger(Number(item?.end)) ? Number(item.end) : undefined,
    }))
    .filter((item) => item.id && item.highlight);

const isPositiveAnswerMark = (mark) => mark?.status === "correct" || mark?.status === "score";

const sumPositiveAnswerMarkScores = (marks = []) =>
  (Array.isArray(marks) ? marks : []).reduce(
    (sum, mark) => sum + (isPositiveAnswerMark(mark) ? Math.max(0, Number(mark.score ?? 0) || 0) : 0),
    0,
  );

const normalizeMarkScore = (value) => Math.max(0, Math.round(Number(value ?? 0) || 0));

const getReviewItemMarkScore = (reviewItem, maxScore = 0) => {
  const answerMarks = normalizeAnswerMarks(reviewItem?.answerMarks);
  return normalizeMarkScore(sumPositiveAnswerMarkScores(answerMarks));
};

const getAnswerReviewMarkScore = ({ answer, question }) => {
  const reviewJson = parseJsonSafely(answer?.reviewJson, null);
  if (!reviewJson || !Array.isArray(reviewJson.subQuestions)) {
    return Number(answer?.score ?? 0) || 0;
  }

  const questionMeta = getQuestionMeta(question);
  return questionMeta.subQuestions.reduce((sum, subQuestion) => {
    const reviewItem = reviewJson.subQuestions.find((item) => `${item?.id ?? ""}` === subQuestion.id);
    const maxScore = getSubjectiveMaxScore(question, subQuestion, questionMeta.subQuestions.length);
    return sum + getReviewItemMarkScore(reviewItem, maxScore);
  }, 0);
};

const getRecordReviewMarkScore = (record) => {
  const paper = getRecordPaper(record);
  const answerMap = new Map((record?.answers ?? []).map((answer) => [answer.questionId, answer]));
  return (paper?.questions ?? []).reduce((sum, question) => {
    const answer = answerMap.get(question.id);
    if (isSubjectiveQuestion(question)) {
      return sum + getAnswerReviewMarkScore({ answer, question });
    }
    return sum + (Number(answer?.score ?? 0) || 0);
  }, 0);
};

const normalizeReviewCommentText = (value = "") =>
  normalizeText(value)
    .replace(/(?:本问|本小问|这一问|这问)?\s*(?:得分|得了|拿到|拿了|取得|获得)\s*[：:为是]?\s*\d+(?:\.\d+)?\s*分[，,。；;、]?\s*/gu, "")
    .replace(/(?:扣分|扣了|丢分|丢了|失分)\s*[：:为是]?\s*\d+(?:\.\d+)?\s*分[，,。；;、]?\s*/gu, "")
    .replace(/(?:给你|给出|评为|评分为|判为|计为)\s*\d+(?:\.\d+)?\s*分[，,。；;、]?\s*/gu, "")
    .replace(/\s{2,}/gu, " ")
    .trim();

const getQuestionMeta = (question) => {
  const raw = parseJsonSafely(question?.questionMetaJson, {});
  const subQuestions = Array.isArray(raw?.subQuestions)
    ? raw.subQuestions
        .map((item, index) => ({
          id: `${item?.id ?? `${question.id}_sub_${index + 1}`}`.trim(),
          title: normalizeText(item?.title ?? `问题(${index + 1})`),
          placeholder: normalizeText(item?.placeholder ?? "请在此输入答案。"),
          abilityLabel: normalizeText(item?.abilityLabel ?? ""),
          referenceAnswer: normalizeText(item?.referenceAnswer ?? ""),
          rubricGuidance: normalizeText(item?.rubricGuidance ?? ""),
          rubricPoints: normalizeRubricPoints(item?.rubricPoints),
          maxScore: Number(item?.maxScore ?? 0) || 0,
          sortOrder: Number(item?.sortOrder ?? index + 1),
        }))
        .filter((item) => item.id && item.title)
        .sort((left, right) => left.sortOrder - right.sortOrder)
    : [];

  return {
    sectionLabel: normalizeText(raw?.sectionLabel ?? "") || (isSubjectiveQuestion(question) ? "主观题" : `${question?.type ?? "题目"}`),
    sectionDescription: normalizeText(raw?.sectionDescription ?? ""),
    subQuestions:
      subQuestions.length > 0 || !isSubjectiveQuestion(question)
        ? subQuestions
        : [
            {
              id: `${question.id}_default`,
              title: question.stem || `第 ${question.sortOrder} 题`,
              placeholder: "请在此输入答案。",
              abilityLabel: "",
              referenceAnswer: "",
              rubricGuidance: "",
              rubricPoints: [],
              maxScore: Number(question.score ?? 0) || 0,
              sortOrder: 1,
            },
          ],
  };
};

const parseSubjectiveAnswerMap = (value, question) => {
  const raw = parseJsonSafely(value, {});
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(getQuestionMeta(question).subQuestions.map((item) => [item.id, normalizeText(source[item.id])]));
};

const getSubjectiveMaxScore = (question, subQuestion, subQuestionCount = 1) => {
  const explicit = Number(subQuestion?.maxScore ?? subQuestion?.score ?? 0) || 0;
  if (explicit > 0) return explicit;
  const rubricTotal = normalizeRubricPoints(subQuestion?.rubricPoints).reduce(
    (sum, point) => sum + Math.max(0, Number(point.maxScore ?? point.score ?? 0) || 0),
    0,
  );
  if (rubricTotal > 0) return rubricTotal;
  return Math.max(0, Math.round((Number(question?.score ?? 0) || 0) / Math.max(1, subQuestionCount)));
};

const parseRecordPaperSnapshot = (record) => {
  const raw = parseJsonSafely(record?.paperSnapshotJson, null);
  if (!raw || typeof raw !== "object") return null;

  const paper = raw.paper && typeof raw.paper === "object" ? raw.paper : {};
  const questions = Array.isArray(raw.questions) ? raw.questions : [];

  return {
    id: `${paper.id ?? record?.paperId ?? ""}`.trim(),
    code: `${paper.code ?? ""}`.trim(),
    title: `${paper.title ?? ""}`.trim(),
    subtitle: `${paper.subtitle ?? ""}`.trim(),
    paperType: `${paper.paperType ?? "subjective"}`.trim() || "subjective",
    year: Number(paper.year ?? 0),
    phase: `${paper.phase ?? ""}`.trim(),
    durationMinutes: Number(paper.durationMinutes ?? 0),
    reviewEnabled: typeof paper.reviewEnabled === "boolean" ? paper.reviewEnabled : true,
    totalScore: Number(paper.totalScore ?? 0),
    passScore: Number(paper.passScore ?? 0),
    questions: questions
      .map((question) => ({
        id: `${question?.id ?? ""}`.trim(),
        sortOrder: Number(question?.sortOrder ?? 0),
        type: `${question?.type ?? ""}`.trim(),
        score: Number(question?.score ?? 0),
        material: `${question?.material ?? ""}`,
        stem: `${question?.stem ?? ""}`,
        analysis: `${question?.analysis ?? ""}`,
        correctAnswerJson: `${question?.correctAnswerJson ?? "[]"}`,
        questionMetaJson: question?.questionMetaJson ? `${question.questionMetaJson}` : null,
        options: Array.isArray(question?.options) ? question.options : [],
      }))
      .filter((question) => question.id && question.type)
      .sort((left, right) => left.sortOrder - right.sortOrder),
  };
};

const mergeSnapshotWithLivePaper = (snapshotPaper, livePaper) => {
  if (!snapshotPaper) return livePaper;
  if (!livePaper?.questions) return snapshotPaper;

  const liveQuestionMap = new Map(livePaper.questions.map((question) => [question.id, question]));
  return {
    ...snapshotPaper,
    questions: snapshotPaper.questions.map((question) => {
      const liveQuestion = liveQuestionMap.get(question.id);
      return liveQuestion ? { ...question, lessonAudioUrl: liveQuestion.lessonAudioUrl, lessonAudioObjectKey: liveQuestion.lessonAudioObjectKey } : question;
    }),
  };
};

const getRecordPaper = (record) => mergeSnapshotWithLivePaper(parseRecordPaperSnapshot(record), record?.paper ?? null);

const hasSubjectiveReviewEnabled = (record) => {
  const paper = getRecordPaper(record);
  return Boolean(paper?.reviewEnabled) && (paper?.questions ?? []).some((question) => isSubjectiveQuestion(question));
};

const serializeDate = (value) => (value ? formatDateTime(value) : "");

const hasPublishedReviewSnapshot = (record) =>
  (record?.answers ?? []).some((answer) => Boolean(answer?.publishedReviewJson));

const isRepublishingReviewRecord = (record) => Boolean(record?.publishedAt || hasPublishedReviewSnapshot(record));

const restoreMockExamAttemptQuota = async ({ tx, record }) => {
  if (!record?.userId || !record?.paperId) return;

  await tx.userMockExamPermission.updateMany({
    where: {
      userId: record.userId,
      paperId: record.paperId,
      manualAttemptUsed: { gt: 0 },
    },
    data: {
      manualAttemptUsed: { decrement: 1 },
      currentRecordStartedAt: null,
    },
  });
};

const ensurePublishedReviewSnapshot = async ({ tx, record }) => {
  if (!isRepublishingReviewRecord(record) || hasPublishedReviewSnapshot(record)) return false;
  const subjectiveQuestionIds = new Set((getRecordPaper(record)?.questions ?? []).filter(isSubjectiveQuestion).map((question) => question.id));
  const publishedAnswers = (record.answers ?? []).filter((answer) => subjectiveQuestionIds.has(answer.questionId) && answer.reviewJson);
  if (publishedAnswers.length === 0) return false;
  await Promise.all(
    publishedAnswers.map((answer) =>
      tx.mockExamAnswer.update({
        where: { id: answer.id },
        data: {
          publishedReviewJson: answer.reviewJson,
          publishedScore: Number(answer.score ?? 0) || 0,
        },
      }),
    ),
  );
  return true;
};

const getLockInfo = (record, req, currentTime = new Date()) => {
  const expiresAt = record?.manualReviewLockExpiresAt ? new Date(record.manualReviewLockExpiresAt) : null;
  const active = Boolean(expiresAt && expiresAt.getTime() > currentTime.getTime() && record.manualReviewerId);
  const ownedByMe = active && record.manualReviewerId === req.auth?.adminId;
  const expired = Boolean(expiresAt && expiresAt.getTime() <= currentTime.getTime());

  return {
    active,
    ownedByMe,
    expired,
    canClaim: Boolean(record && (!active || ownedByMe)),
    canEdit: Boolean(record && ownedByMe),
    reviewerId: record?.manualReviewerId ?? "",
    reviewerName: record?.manualReviewerName ?? "",
    claimedAt: serializeDate(record?.manualReviewClaimedAt),
    expiresAt: serializeDate(record?.manualReviewLockExpiresAt),
    lockToken: ownedByMe ? record.manualReviewLockToken ?? "" : "",
  };
};

const serializeRecordListItem = (record, req, currentTime = new Date()) => {
  const paper = getRecordPaper(record);
  const questions = paper?.questions ?? [];
  const subjectiveQuestions = questions.filter(isSubjectiveQuestion);
  const answerMap = new Map((record.answers ?? []).map((answer) => [answer.questionId, answer]));
  const answeredSubjectiveCount = subjectiveQuestions.filter((question) => {
    const answer = answerMap.get(question.id);
    const answerMapBySubQuestion = parseSubjectiveAnswerMap(answer?.answerJson, question);
    return Object.values(answerMapBySubQuestion).some((item) => item.trim());
  }).length;
  const reviewedSubjectiveCount = subjectiveQuestions.filter((question) => Boolean(answerMap.get(question.id)?.reviewJson)).length;
  const publishedSubjectiveCount = subjectiveQuestions.filter((question) => Boolean(answerMap.get(question.id)?.publishedReviewJson)).length;
  const lock = getLockInfo(record, req, currentTime);
  const reviewMarkScore = getRecordReviewMarkScore(record);

  return {
    id: record.id,
    userId: record.userId,
    userLabel: record.user?.nickname || record.user?.phone || record.userId,
    userPhone: record.user?.phone ?? "",
    attemptNo: record.attemptNo,
    status: record.status,
    reviewWorkflowStatus: record.reviewWorkflowStatus,
    totalScore: reviewMarkScore,
    answeredCount: record.answeredCount,
    questionCount: record.questionCount || questions.length,
    subjectiveQuestionCount: subjectiveQuestions.length,
    answeredSubjectiveCount,
    reviewedSubjectiveCount,
    publishedSubjectiveCount,
    submittedAt: serializeDate(record.submittedAt),
    updatedAt: serializeDate(record.updatedAt),
    reviewedAt: serializeDate(record.reviewedAt),
    publishedAt: serializeDate(record.publishedAt),
    hasPublishedReview: hasPublishedReviewSnapshot(record),
    consumedSeconds: Number(record.consumedSeconds ?? 0) || 0,
    lastAiReviewError: normalizeText(record.lastAiReviewError ?? ""),
    manualReviewVersion: record.manualReviewVersion,
    reviewerName: record.manualReviewerName ?? "",
    lock,
  };
};

const serializeGlobalRecordListItem = (record, req, currentTime = new Date()) => {
  const paper = getRecordPaper(record);
  return {
    ...serializeRecordListItem(record, req, currentTime),
    paper: {
      id: paper?.id ?? record.paperId,
      code: paper?.code ?? "",
      title: paper?.title ?? "",
      subtitle: paper?.subtitle ?? "",
      seriesName: record.paper?.series?.name ?? "",
      year: Number(paper?.year ?? 0) || 0,
      phase: paper?.phase ?? "",
      totalScore: getPaperTotalScore(paper?.questions ?? []) || Number(paper?.totalScore ?? 0) || 0,
    },
  };
};

const serializeReviewDetail = (record, req, currentTime = new Date()) => {
  const paper = getRecordPaper(record);
  const questions = paper?.questions ?? [];
  const answerMap = new Map((record.answers ?? []).map((answer) => [answer.questionId, answer]));
  const subjectiveQuestions = questions.filter(isSubjectiveQuestion);

  return {
    record: {
      id: record.id,
      userId: record.userId,
      userLabel: record.user?.nickname || record.user?.phone || record.userId,
      userPhone: record.user?.phone ?? "",
      userStatus: record.user?.status ?? "",
      status: record.status,
      reviewWorkflowStatus: record.reviewWorkflowStatus,
      attemptNo: record.attemptNo,
      questionCount: record.questionCount || questions.length,
      answeredCount: record.answeredCount,
      totalScore: record.totalScore,
      correctCount: record.correctCount,
      consumedSeconds: Number(record.consumedSeconds ?? 0) || 0,
      submittedAt: serializeDate(record.submittedAt),
      reviewedAt: serializeDate(record.reviewedAt),
      publishedAt: serializeDate(record.publishedAt),
      hasPublishedReview: hasPublishedReviewSnapshot(record),
      updatedAt: serializeDate(record.updatedAt),
      manualReviewVersion: record.manualReviewVersion,
      lastAiReviewError: normalizeText(record.lastAiReviewError ?? ""),
      lock: getLockInfo(record, req, currentTime),
    },
    paper: {
      id: paper.id,
      code: paper.code ?? "",
      title: paper.title ?? "",
      subtitle: paper.subtitle ?? "",
      seriesName: record.paper?.series?.name ?? "",
      paperType: paper.paperType ?? "subjective",
      year: paper.year ?? 0,
      phase: paper.phase ?? "",
      durationMinutes: paper.durationMinutes ?? 0,
      totalScore: getPaperTotalScore(questions) || Number(paper.totalScore ?? 0),
      passScore: paper.passScore ?? 0,
      reviewEnabled: Boolean(paper.reviewEnabled),
      subjectiveQuestionCount: subjectiveQuestions.length,
    },
    questions: subjectiveQuestions.map((question) => {
      const answer = answerMap.get(question.id);
      const questionMeta = getQuestionMeta(question);
      const answerBySubQuestion = parseSubjectiveAnswerMap(answer?.answerJson, question);
      const reviewJson = parseJsonSafely(answer?.reviewJson, null);
      return {
        id: question.id,
        sortOrder: question.sortOrder,
        type: question.type,
        score: Number(question.score ?? 0) || 0,
        material: question.material ?? "",
        stem: question.stem ?? "",
        analysis: question.analysis ?? "",
        sectionLabel: questionMeta.sectionLabel,
        sectionDescription: questionMeta.sectionDescription,
        earnedScore: Number(answer?.score ?? 0) || 0,
        hasReview: Boolean(answer?.reviewJson),
        subQuestions: questionMeta.subQuestions.map((subQuestion) => {
          const reviewItem = Array.isArray(reviewJson?.subQuestions)
            ? reviewJson.subQuestions.find((item) => `${item?.id ?? ""}` === subQuestion.id)
            : null;
          const maxScore = getSubjectiveMaxScore(question, subQuestion, questionMeta.subQuestions.length);
          const answerText = answerBySubQuestion[subQuestion.id] ?? "";
          const answerMarks = normalizeAnswerMarks(reviewItem?.answerMarks);
          const score = normalizeMarkScore(sumPositiveAnswerMarkScores(answerMarks));
          return {
            id: subQuestion.id,
            title: subQuestion.title,
            answer: answerText,
            wordCount: answerText.length,
            score,
            maxScore,
            reviewComment: normalizeReviewCommentText(reviewItem?.reviewComment ?? ""),
            referenceAnswer: normalizeText(reviewItem?.referenceAnswer ?? subQuestion.referenceAnswer ?? ""),
            abilityLabel: normalizeText(reviewItem?.abilityLabel ?? subQuestion.abilityLabel ?? subQuestion.title),
            rubricGuidance: normalizeText(reviewItem?.rubricGuidance ?? subQuestion.rubricGuidance ?? ""),
            rubricPoints: normalizeRubricPoints(reviewItem?.rubricPoints ?? subQuestion.rubricPoints),
            missedPoints: normalizeMissedPoints(reviewItem?.missedPoints),
            answerMarks,
            skippedReview: Boolean(reviewItem?.skippedReview),
            skippedReviewReason: normalizeText(reviewItem?.skippedReviewReason ?? ""),
            isReviewed: Boolean(reviewItem),
          };
        }),
      };
    }),
  };
};

const getAdminReviewRecord = (db, recordId) =>
  db.mockExamRecord.findUnique({
    where: { id: recordId },
    include: {
      user: { select: { id: true, phone: true, nickname: true, status: true } },
      paper: {
        include: {
          series: { select: { id: true, name: true } },
          questions: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            include: { options: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
      answers: true,
    },
  });

const assertReviewableRecord = (record) => {
  if (!record) {
    const error = new Error("批改记录不存在");
    error.statusCode = 404;
    throw error;
  }
  if (record.status !== "submitted") {
    const error = new Error("该记录尚未交卷，不能批改");
    error.statusCode = 409;
    throw error;
  }
  if (!hasSubjectiveReviewEnabled(record)) {
    const error = new Error("该记录不是已开启批改的主观题记录");
    error.statusCode = 400;
    throw error;
  }
  if (!WORKFLOW_STATUSES.has(`${record.reviewWorkflowStatus ?? ""}`)) {
    const error = new Error("该记录不在批改流程中");
    error.statusCode = 400;
    throw error;
  }
};

const assertEditableLock = (record, req, { lockToken, version, currentTime = new Date() } = {}) => {
  const lock = getLockInfo(record, req, currentTime);
  const parsedVersion = typeof version === "number" ? version : Number.NaN;
  if (!lock.ownedByMe || !record.manualReviewLockToken || record.manualReviewLockToken !== `${lockToken ?? ""}`.trim()) {
    const error = new Error("请先领取该记录，或刷新页面后重试");
    error.statusCode = 409;
    throw error;
  }
  if (!Number.isInteger(parsedVersion)) {
    const error = new Error("缺少有效的批改版本，请刷新后再继续");
    error.statusCode = 400;
    throw error;
  }
  if (parsedVersion !== Number(record.manualReviewVersion ?? 0)) {
    const error = new Error("批改内容已被更新，请刷新后再继续");
    error.statusCode = 409;
    throw error;
  }
};

const normalizeReviewPayload = ({ record, payloadAnswers = [] }) => {
  const paper = getRecordPaper(record);
  const questionMap = new Map((paper?.questions ?? []).filter(isSubjectiveQuestion).map((question) => [question.id, question]));
  const payloadMap = new Map((Array.isArray(payloadAnswers) ? payloadAnswers : []).map((item) => [`${item?.questionId ?? ""}`.trim(), item]));

  return [...questionMap.values()].map((question) => {
    const questionMeta = getQuestionMeta(question);
    const payload = payloadMap.get(question.id) ?? {};
    const payloadSubQuestionMap = new Map((Array.isArray(payload?.subQuestions) ? payload.subQuestions : []).map((item) => [`${item?.id ?? ""}`.trim(), item]));
    const existingAnswer = (record.answers ?? []).find((answer) => answer.questionId === question.id);
    const existingReviewJson = parseJsonSafely(existingAnswer?.reviewJson, null);

    const subQuestions = questionMeta.subQuestions.map((subQuestion, index) => {
      const existingReviewItem = Array.isArray(existingReviewJson?.subQuestions)
        ? existingReviewJson.subQuestions.find((item) => `${item?.id ?? ""}` === subQuestion.id)
        : null;
      const item = payloadSubQuestionMap.get(subQuestion.id) ?? existingReviewItem ?? {};
      const maxScore = getSubjectiveMaxScore(question, subQuestion, questionMeta.subQuestions.length);
      const missedPoints = normalizeMissedPoints(item?.missedPoints).map((point, missedIndex) => ({
        ...point,
        id: point.id || `missed_${index + 1}_${missedIndex + 1}`,
      }));
      const answerMarks = normalizeAnswerMarks(item?.answerMarks).map((mark, markIndex) => ({
        ...mark,
        id: mark.id || `mark_${index + 1}_${markIndex + 1}`,
      }));
      const score = normalizeMarkScore(sumPositiveAnswerMarkScores(answerMarks));

      return {
        id: subQuestion.id,
        title: subQuestion.title,
        score,
        maxScore,
        reviewComment: normalizeReviewCommentText(item?.reviewComment ?? ""),
        referenceAnswer: normalizeText(item?.referenceAnswer ?? subQuestion.referenceAnswer ?? ""),
        reviewSource: "manual",
        reviewProvider: "manual",
        abilityLabel: normalizeText(item?.abilityLabel ?? subQuestion.abilityLabel ?? subQuestion.title),
        rubricGuidance: normalizeText(item?.rubricGuidance ?? subQuestion.rubricGuidance ?? ""),
        rubricPoints: normalizeRubricPoints(item?.rubricPoints ?? subQuestion.rubricPoints),
        missedPoints,
        answerMarks,
        skippedReview: Boolean(item?.skippedReview),
        skippedReviewReason: normalizeText(item?.skippedReviewReason ?? ""),
      };
    });
    const totalScore = normalizeMarkScore(subQuestions.reduce((sum, item) => sum + Number(item.score ?? 0), 0));

    return {
      question,
      existingAnswer,
      score: totalScore,
      reviewJson: {
        source: "manual",
        reviewSource: "manual",
        reviewProvider: "manual",
        totalScore,
        maxScore: Number(question.score ?? 0) || subQuestions.reduce((sum, item) => sum + Number(item.maxScore ?? 0), 0),
        reviewVoiceUrl: normalizeText(existingReviewJson?.reviewVoiceUrl ?? ""),
        reviewVoiceObjectKey: normalizeText(existingReviewJson?.reviewVoiceObjectKey ?? ""),
        reviewVoiceDurationSeconds: Number(existingReviewJson?.reviewVoiceDurationSeconds ?? 0) || 0,
        feedbackStars: Number(existingReviewJson?.feedbackStars ?? 0) || 0,
        feedbackSubmittedAt: existingReviewJson?.feedbackSubmittedAt ?? null,
        subQuestions,
      },
    };
  });
};

const saveReviewPayload = async ({ tx, record, payloadAnswers }) => {
  const normalized = normalizeReviewPayload({ record, payloadAnswers });
  for (const item of normalized) {
    const data = {
      score: item.score,
      isCorrect: null,
      reviewJson: JSON.stringify(item.reviewJson),
    };
    if (item.existingAnswer) {
      await tx.mockExamAnswer.update({ where: { id: item.existingAnswer.id }, data });
    } else {
      await tx.mockExamAnswer.create({
        data: {
          recordId: record.id,
          questionId: item.question.id,
          answerJson: "{}",
          ...data,
        },
      });
    }
  }
  return normalized;
};

const countPaperStats = async ({ paperIds, currentAdminId, currentTime = new Date() }) => {
  if (!paperIds.length) return new Map();
  const [statusRows, mineRows, lockedRows, aiProblemRows] = await Promise.all([
    prisma.mockExamRecord.groupBy({
      by: ["paperId", "reviewWorkflowStatus"],
      where: { paperId: { in: paperIds }, status: "submitted", reviewWorkflowStatus: { in: REVIEW_WORKFLOW_STATUS_VALUES } },
      _count: { _all: true },
    }),
    prisma.mockExamRecord.groupBy({
      by: ["paperId"],
      where: {
        paperId: { in: paperIds },
        status: "submitted",
        reviewWorkflowStatus: { in: REVIEW_WORKFLOW_STATUS_VALUES },
        manualReviewerId: currentAdminId,
        manualReviewLockExpiresAt: { gt: currentTime },
      },
      _count: { _all: true },
    }),
    prisma.mockExamRecord.groupBy({
      by: ["paperId"],
      where: {
        paperId: { in: paperIds },
        status: "submitted",
        reviewWorkflowStatus: { in: REVIEW_WORKFLOW_STATUS_VALUES },
        manualReviewLockExpiresAt: { gt: currentTime },
      },
      _count: { _all: true },
    }),
    prisma.mockExamRecord.groupBy({
      by: ["paperId"],
      where: {
        paperId: { in: paperIds },
        status: "submitted",
        reviewWorkflowStatus: { in: REVIEW_WORKFLOW_STATUS_VALUES },
        lastAiReviewError: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const statsMap = new Map(paperIds.map((paperId) => [paperId, { total: 0, aiPending: 0, aiProcessing: 0, aiProblem: 0, manualPending: 0, published: 0, mine: 0, locked: 0 }]));
  statusRows.forEach((row) => {
    const stats = statsMap.get(row.paperId);
    if (!stats) return;
    const count = Number(row._count?._all ?? 0);
    stats.total += count;
    if (row.reviewWorkflowStatus === "ai_pending") stats.aiPending += count;
    if (row.reviewWorkflowStatus === "ai_processing") stats.aiProcessing += count;
    if (row.reviewWorkflowStatus === "manual_pending") stats.manualPending += count;
    if (row.reviewWorkflowStatus === "published") stats.published += count;
  });
  mineRows.forEach((row) => {
    const stats = statsMap.get(row.paperId);
    if (stats) stats.mine = Number(row._count?._all ?? 0);
  });
  lockedRows.forEach((row) => {
    const stats = statsMap.get(row.paperId);
    if (stats) stats.locked = Number(row._count?._all ?? 0);
  });
  aiProblemRows.forEach((row) => {
    const stats = statsMap.get(row.paperId);
    if (stats) stats.aiProblem = Number(row._count?._all ?? 0);
  });
  return statsMap;
};

const buildReviewPaperWhere = (keyword = "") => {
  const trimmedKeyword = normalizeText(keyword);
  return {
    reviewEnabled: true,
    OR: [{ paperType: "subjective" }, { questions: { some: { isActive: true, type: SUBJECTIVE_TYPE } } }],
    ...(trimmedKeyword
      ? {
          AND: [
            {
              OR: [
                { title: { contains: trimmedKeyword } },
                { code: { contains: trimmedKeyword } },
                { phase: { contains: trimmedKeyword } },
                { series: { name: { contains: trimmedKeyword } } },
              ],
            },
          ],
        }
      : {}),
  };
};

adminMockExamReviewRouter.get("/summary", async (req, res) => {
  try {
    const currentTime = new Date();
    const papers = await prisma.mockExamPaper.findMany({
      where: buildReviewPaperWhere(""),
      select: { id: true },
    });
    const paperIds = papers.map((paper) => paper.id);
    const statsMap = await countPaperStats({ paperIds, currentAdminId: req.auth.adminId, currentTime });
    const stats = [...statsMap.values()].reduce(
      (summary, item) => ({
        paperCount: summary.paperCount,
        total: summary.total + item.total,
        aiPending: summary.aiPending + item.aiPending,
        aiProcessing: summary.aiProcessing + item.aiProcessing,
        aiProblem: summary.aiProblem + item.aiProblem,
        manualPending: summary.manualPending + item.manualPending,
        published: summary.published + item.published,
        mine: summary.mine + item.mine,
        locked: summary.locked + item.locked,
      }),
      { paperCount: paperIds.length, total: 0, aiPending: 0, aiProcessing: 0, aiProblem: 0, manualPending: 0, published: 0, mine: 0, locked: 0 },
    );
    return ok(res, stats);
  } catch (error) {
    return fail(res, error.message || "加载批改概览失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.get("/papers", async (req, res) => {
  try {
    const page = toPositiveInt(req.query?.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
    const where = buildReviewPaperWhere(req.query?.keyword);
    const [total, papers] = await Promise.all([
      prisma.mockExamPaper.count({ where }),
      prisma.mockExamPaper.findMany({
        where,
        include: {
          series: { select: { id: true, name: true } },
          questions: { where: { isActive: true }, select: { id: true, type: true, score: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const statsMap = await countPaperStats({ paperIds: papers.map((paper) => paper.id), currentAdminId: req.auth.adminId });

    return ok(res, {
      items: papers.map((paper) => {
        const questions = paper.questions ?? [];
        return {
          id: paper.id,
          code: paper.code,
          title: paper.title,
          subtitle: paper.subtitle ?? "",
          seriesId: paper.seriesId ?? "",
          seriesName: paper.series?.name ?? "",
          status: paper.status,
          year: paper.year ?? 0,
          phase: paper.phase ?? "",
          durationMinutes: paper.durationMinutes,
          totalScore: getPaperTotalScore(questions) || Number(paper.totalScore ?? 0),
          questionCount: questions.length,
          subjectiveQuestionCount: questions.filter(isSubjectiveQuestion).length,
          reviewEnabled: Boolean(paper.reviewEnabled),
          updatedAt: serializeDate(paper.updatedAt),
          stats: statsMap.get(paper.id) ?? { total: 0, aiPending: 0, aiProcessing: 0, aiProblem: 0, manualPending: 0, published: 0, mine: 0, locked: 0 },
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    return fail(res, error.message || "加载批改试卷失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.get("/records", async (req, res) => {
  try {
    const page = toPositiveInt(req.query?.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
    const statusGroup = `${req.query?.status ?? "teacher"}`.trim();
    const keyword = normalizeText(req.query?.keyword);
    const currentTime = new Date();
    const baseWhere = {
      status: "submitted",
      reviewWorkflowStatus: { in: REVIEW_WORKFLOW_STATUS_VALUES },
      paper: buildReviewPaperWhere(""),
    };
    const statusWhere =
      WORKFLOW_STATUSES.has(statusGroup)
        ? { reviewWorkflowStatus: statusGroup }
        : statusGroup === "ai"
        ? { reviewWorkflowStatus: { in: ["ai_pending", "ai_processing"] } }
        : statusGroup === "teacher"
          ? { reviewWorkflowStatus: "manual_pending" }
          : statusGroup === "published"
            ? { reviewWorkflowStatus: "published" }
            : statusGroup === "mine"
              ? { manualReviewerId: req.auth.adminId, manualReviewLockExpiresAt: { gt: currentTime } }
              : statusGroup === "locked"
                ? { manualReviewLockExpiresAt: { gt: currentTime } }
                : statusGroup === "ai_problem"
                  ? { lastAiReviewError: { not: null } }
                  : {};
    const keywordWhere = keyword
      ? {
          OR: [
            { user: { phone: { contains: keyword } } },
            { user: { nickname: { contains: keyword } } },
            { user: { id: { contains: keyword } } },
            { paper: { title: { contains: keyword } } },
            { paper: { code: { contains: keyword } } },
            { paper: { series: { name: { contains: keyword } } } },
          ],
        }
      : {};
    const where = { ...baseWhere, ...statusWhere, ...keywordWhere };
    const [total, records, statusRows, mineCount, lockedCount, aiProblemCount] = await Promise.all([
      prisma.mockExamRecord.count({ where }),
      prisma.mockExamRecord.findMany({
        where,
        include: {
          user: { select: { id: true, phone: true, nickname: true, status: true } },
          paper: {
            include: {
              series: { select: { id: true, name: true } },
              questions: {
                where: { isActive: true },
                orderBy: { sortOrder: "asc" },
                include: { options: { orderBy: { sortOrder: "asc" } } },
              },
            },
          },
          answers: true,
        },
        orderBy: [{ submittedAt: statusGroup === "published" ? "desc" : "asc" }, { createdAt: statusGroup === "published" ? "desc" : "asc" }, { updatedAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.mockExamRecord.groupBy({
        by: ["reviewWorkflowStatus"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.mockExamRecord.count({
        where: {
          ...baseWhere,
          manualReviewerId: req.auth.adminId,
          manualReviewLockExpiresAt: { gt: currentTime },
        },
      }),
      prisma.mockExamRecord.count({
        where: {
          ...baseWhere,
          manualReviewLockExpiresAt: { gt: currentTime },
        },
      }),
      prisma.mockExamRecord.count({
        where: {
          ...baseWhere,
          lastAiReviewError: { not: null },
        },
      }),
    ]);
    const stats = statusRows.reduce(
      (summary, row) => {
        const count = Number(row._count?._all ?? 0);
        summary.total += count;
        if (row.reviewWorkflowStatus === "ai_pending") summary.aiPending += count;
        if (row.reviewWorkflowStatus === "ai_processing") summary.aiProcessing += count;
        if (row.reviewWorkflowStatus === "manual_pending") summary.manualPending += count;
        if (row.reviewWorkflowStatus === "published") summary.published += count;
        return summary;
      },
      { total: 0, aiPending: 0, aiProcessing: 0, aiProblem: aiProblemCount, manualPending: 0, published: 0, mine: mineCount, locked: lockedCount },
    );

    return ok(res, {
      items: records.map((record) => serializeGlobalRecordListItem(record, req, currentTime)),
      stats,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    return fail(res, error.message || "加载全局批改记录失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.get("/papers/:paperId/records", async (req, res) => {
  try {
    const paperId = `${req.params.paperId ?? ""}`.trim();
    const page = toPositiveInt(req.query?.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
    const status = `${req.query?.status ?? "all"}`.trim();
    const keyword = normalizeText(req.query?.keyword);
    const currentTime = new Date();
    const paper = await prisma.mockExamPaper.findUnique({
      where: { id: paperId },
      include: {
        series: { select: { id: true, name: true } },
        questions: { where: { isActive: true }, select: { id: true, type: true, score: true } },
      },
    });
    if (!paper || !paper.reviewEnabled || !(paper.paperType === "subjective" || paper.questions.some(isSubjectiveQuestion))) {
      return fail(res, "批改试卷不存在或未开启批改", 404);
    }

    const where = {
      paperId,
      status: "submitted",
      reviewWorkflowStatus: { in: REVIEW_WORKFLOW_STATUS_VALUES },
      ...(WORKFLOW_STATUSES.has(status) ? { reviewWorkflowStatus: status } : {}),
      ...(status === "mine" ? { manualReviewerId: req.auth.adminId, manualReviewLockExpiresAt: { gt: currentTime } } : {}),
      ...(status === "locked" ? { manualReviewLockExpiresAt: { gt: currentTime } } : {}),
      ...(status === "ai_problem" ? { lastAiReviewError: { not: null } } : {}),
      ...(keyword
        ? {
            user: {
              OR: [{ phone: { contains: keyword } }, { nickname: { contains: keyword } }, { id: { contains: keyword } }],
            },
          }
        : {}),
    };

    const [total, records, statsMap] = await Promise.all([
      prisma.mockExamRecord.count({ where }),
      prisma.mockExamRecord.findMany({
        where,
        include: {
          user: { select: { id: true, phone: true, nickname: true, status: true } },
          paper: {
            include: {
              series: { select: { id: true, name: true } },
              questions: {
                where: { isActive: true },
                orderBy: { sortOrder: "asc" },
                include: { options: { orderBy: { sortOrder: "asc" } } },
              },
            },
          },
          answers: true,
        },
        orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }, { updatedAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      countPaperStats({ paperIds: [paperId], currentAdminId: req.auth.adminId, currentTime }),
    ]);

    return ok(res, {
      paper: {
        id: paper.id,
        code: paper.code,
        title: paper.title,
        subtitle: paper.subtitle ?? "",
        seriesName: paper.series?.name ?? "",
        year: paper.year ?? 0,
        phase: paper.phase ?? "",
        totalScore: getPaperTotalScore(paper.questions) || paper.totalScore,
        questionCount: paper.questions.length,
        subjectiveQuestionCount: paper.questions.filter(isSubjectiveQuestion).length,
        stats: statsMap.get(paperId) ?? { total: 0, aiPending: 0, aiProcessing: 0, aiProblem: 0, manualPending: 0, published: 0, mine: 0, locked: 0 },
      },
      items: records.map((record) => serializeRecordListItem(record, req, currentTime)),
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    return fail(res, error.message || "加载批改队列失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.get("/records/:recordId", async (req, res) => {
  try {
    const record = await getAdminReviewRecord(prisma, `${req.params.recordId ?? ""}`.trim());
    assertReviewableRecord(record);
    return ok(res, serializeReviewDetail(record, req));
  } catch (error) {
    return fail(res, error.message || "加载批改详情失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.post("/records/:recordId/claim", async (req, res) => {
  try {
    const recordId = `${req.params.recordId ?? ""}`.trim();
    const currentTime = new Date();
    const lockToken = crypto.randomUUID();
    const lockExpiresAt = buildLockExpiresAt(currentTime);
    const updatedRecord = await prisma.$transaction(async (tx) => {
      const record = await getAdminReviewRecord(tx, recordId);
      assertReviewableRecord(record);
      const wasPublished = record.reviewWorkflowStatus === "published";
      await ensurePublishedReviewSnapshot({ tx, record });

      const lock = getLockInfo(record, req, currentTime);
      if (lock.active && !lock.ownedByMe) {
        const error = new Error(`该记录已被 ${record.manualReviewerName || "其他老师"} 领取，请稍后再试`);
        error.statusCode = 409;
        throw error;
      }

      const claimResult = await tx.mockExamRecord.updateMany({
        where: {
          id: record.id,
          OR: [
            { manualReviewerId: req.auth.adminId },
            { manualReviewLockExpiresAt: null },
            { manualReviewLockExpiresAt: { lte: currentTime } },
          ],
        },
        data: {
          reviewWorkflowStatus: wasPublished ? "published" : "manual_pending",
          manualReviewerId: req.auth.adminId,
          manualReviewerName: getAdminName(req),
          manualReviewLockToken: lockToken,
          manualReviewClaimedAt: currentTime,
          manualReviewLockExpiresAt: lockExpiresAt,
        },
      });
      if (claimResult.count !== 1) {
        const error = new Error("该记录刚刚被其他老师领取，请刷新队列后重试");
        error.statusCode = 409;
        throw error;
      }
      return getAdminReviewRecord(tx, record.id);
    });

    await writeAdminAuditLog(req, {
      action: "claim_mock_exam_review",
      entityType: "mock_exam_record",
      entityId: recordId,
      entityName: updatedRecord?.paper?.title ?? "",
      detail: { recordId, paperId: updatedRecord?.paperId, lockExpiresAt },
    });

    return ok(res, serializeReviewDetail(updatedRecord, req, currentTime), "已领取批改记录");
  } catch (error) {
    return fail(res, error.message || "领取批改失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.post("/records/:recordId/ai-review", async (req, res) => {
  const recordId = `${req.params.recordId ?? ""}`.trim();
  const currentTime = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const record = await getAdminReviewRecord(tx, recordId);
      assertReviewableRecord(record);

      const lock = getLockInfo(record, req, currentTime);
      if (lock.active && !lock.ownedByMe) {
        const error = new Error(`该记录已被 ${record.manualReviewerName || "其他老师"} 领取，不能重新批改`);
        error.statusCode = 409;
        throw error;
      }

      // AI重批时清空已发布的批改快照，避免显示旧数据
      const subjectiveQuestionIds = new Set(
        (getRecordPaper(record)?.questions ?? [])
          .filter(isSubjectiveQuestion)
          .map((question) => question.id)
      );

      const subjectiveAnswers = (record.answers ?? []).filter((answer) =>
        subjectiveQuestionIds.has(answer.questionId)
      );

      if (subjectiveAnswers.length > 0) {
        await Promise.all(
          subjectiveAnswers.map((answer) =>
            tx.mockExamAnswer.update({
              where: { id: answer.id },
              data: {
                publishedReviewJson: null,
                publishedScore: null,
              },
            })
          )
        );
      }

      return record.id;
    });

    await enqueueMockExamAiReview({
      db: prisma,
      recordId,
      adminId: req.auth.adminId,
      currentTime,
    });

    const queuedRecord = await getAdminReviewRecord(prisma, recordId);

    await writeAdminAuditLog(req, {
      action: "rerun_mock_exam_ai_review",
      entityType: "mock_exam_record",
      entityId: recordId,
      entityName: queuedRecord?.paper?.title ?? "",
      detail: { recordId, paperId: queuedRecord?.paperId },
    });

    return ok(res, serializeReviewDetail(queuedRecord, req, currentTime), "已加入自动批改队列");
  } catch (error) {
    return fail(res, error.message || "AI重批失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.post("/records/batch-ai-review", async (req, res) => {
  const recordIds = [
    ...new Set((Array.isArray(req.body?.recordIds) ? req.body.recordIds : []).map((item) => `${item ?? ""}`.trim()).filter(Boolean)),
  ];
  const currentTime = new Date();

  if (recordIds.length === 0) {
    return fail(res, "请选择需要重批的试卷", 400);
  }

  const results = [];
  for (const recordId of recordIds) {
    try {
      await prisma.$transaction(async (tx) => {
        const record = await getAdminReviewRecord(tx, recordId);
        assertReviewableRecord(record);

        const lock = getLockInfo(record, req, currentTime);
        if (lock.active && !lock.ownedByMe) {
          const error = new Error(`该记录已被 ${record.manualReviewerName || "其他老师"} 领取，不能重新批改`);
          error.statusCode = 409;
          throw error;
        }

        // AI重批时清空已发布的批改快照，避免显示旧数据
        const subjectiveQuestionIds = new Set(
          (getRecordPaper(record)?.questions ?? [])
            .filter(isSubjectiveQuestion)
            .map((question) => question.id)
        );

        const subjectiveAnswers = (record.answers ?? []).filter((answer) =>
          subjectiveQuestionIds.has(answer.questionId)
        );

        if (subjectiveAnswers.length > 0) {
          await Promise.all(
            subjectiveAnswers.map((answer) =>
              tx.mockExamAnswer.update({
                where: { id: answer.id },
                data: {
                  publishedReviewJson: null,
                  publishedScore: null,
                },
              })
            )
          );
        }

        return record.id;
      });

      await enqueueMockExamAiReview({
        db: prisma,
        recordId,
        adminId: req.auth.adminId,
        currentTime,
      });

      results.push({ recordId, success: true, message: "已加入AI批改队列" });
    } catch (error) {
      results.push({ recordId, success: false, message: error.message || "AI重批失败" });
    }
  }

  const successCount = results.filter((item) => item.success).length;
  const failedCount = results.length - successCount;

  if (successCount > 0) {
    await writeAdminAuditLog(req, {
      action: "batch_rerun_mock_exam_ai_review",
      entityType: "mock_exam_record",
      detail: { recordIds, successCount, failedCount, results },
    });
  }

  return ok(res, { successCount, failedCount, results }, successCount > 0 ? "已批量加入AI批改队列" : "没有试卷加入AI批改队列");
});

adminMockExamReviewRouter.post("/records/:recordId/release", async (req, res) => {
  try {
    const recordId = `${req.params.recordId ?? ""}`.trim();
    const currentTime = new Date();
    const updatedRecord = await prisma.$transaction(async (tx) => {
      const record = await getAdminReviewRecord(tx, recordId);
      assertReviewableRecord(record);
      const lock = getLockInfo(record, req, currentTime);
      if (lock.active && !lock.ownedByMe) {
        const error = new Error("只能释放自己领取的批改记录");
        error.statusCode = 409;
        throw error;
      }
      await tx.mockExamRecord.update({
        where: { id: record.id },
        data: {
          manualReviewLockToken: null,
          manualReviewLockExpiresAt: null,
        },
      });
      return getAdminReviewRecord(tx, record.id);
    });

    await writeAdminAuditLog(req, {
      action: "release_mock_exam_review",
      entityType: "mock_exam_record",
      entityId: recordId,
      entityName: updatedRecord?.paper?.title ?? "",
      detail: { recordId, paperId: updatedRecord?.paperId },
    });

    return ok(res, serializeReviewDetail(updatedRecord, req, currentTime), "已释放批改记录");
  } catch (error) {
    return fail(res, error.message || "释放批改失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.post("/records/:recordId/recall-published-review", async (req, res) => {
  try {
    const recordId = `${req.params.recordId ?? ""}`.trim();
    const currentTime = new Date();
    const updatedRecord = await prisma.$transaction(async (tx) => {
      const record = await getAdminReviewRecord(tx, recordId);
      assertReviewableRecord(record);

      if (!isRepublishingReviewRecord(record)) {
        const error = new Error("这份试卷还没有发送给学生，无需收回");
        error.statusCode = 409;
        throw error;
      }

      const lock = getLockInfo(record, req, currentTime);
      if (lock.active && !lock.ownedByMe) {
        const error = new Error(`该记录已被 ${record.manualReviewerName || "其他老师"} 领取，暂时不能收回`);
        error.statusCode = 409;
        throw error;
      }

      const paper = getRecordPaper(record);
      const subjectiveQuestionIds = new Set((paper?.questions ?? []).filter(isSubjectiveQuestion).map((question) => question.id));
      const subjectiveAnswers = (record.answers ?? []).filter((answer) => subjectiveQuestionIds.has(answer.questionId));

      await Promise.all(
        subjectiveAnswers.map((answer) =>
          tx.mockExamAnswer.update({
            where: { id: answer.id },
            data: {
              publishedReviewJson: null,
              publishedScore: null,
            },
          }),
        ),
      );

      await tx.mockExamRecord.update({
        where: { id: record.id },
        data: {
          reviewWorkflowStatus: "manual_pending",
          publishedAt: null,
          manualReviewVersion: { increment: 1 },
        },
      });

      return getAdminReviewRecord(tx, record.id);
    });

    await writeAdminAuditLog(req, {
      action: "recall_mock_exam_published_review",
      entityType: "mock_exam_record",
      entityId: recordId,
      entityName: updatedRecord?.paper?.title ?? "",
      detail: { recordId, paperId: updatedRecord?.paperId },
    });

    return ok(res, serializeReviewDetail(updatedRecord, req, currentTime), "已收回学生端可见的批改结果");
  } catch (error) {
    return fail(res, error.message || "收回批改结果失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.post("/records/:recordId/return-for-redo", async (req, res) => {
  try {
    const recordId = `${req.params.recordId ?? ""}`.trim();
    const reason = normalizeText(req.body?.reason ?? "");
    const currentTime = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const record = await getAdminReviewRecord(tx, recordId);
      assertReviewableRecord(record);

      if (!isRepublishingReviewRecord(record)) {
        const error = new Error("这份试卷还没有发送给学生，不能返还重做");
        error.statusCode = 409;
        throw error;
      }

      const lock = getLockInfo(record, req, currentTime);
      if (lock.active && !lock.ownedByMe) {
        const error = new Error(`该记录已被 ${record.manualReviewerName || "其他老师"} 领取，暂时不能返还重做`);
        error.statusCode = 409;
        throw error;
      }

      const paper = getRecordPaper(record);
      const subjectiveQuestionIds = new Set((paper?.questions ?? []).filter(isSubjectiveQuestion).map((question) => question.id));
      const subjectiveAnswers = (record.answers ?? []).filter((answer) => subjectiveQuestionIds.has(answer.questionId));

      await Promise.all(
        subjectiveAnswers.map((answer) =>
          tx.mockExamAnswer.update({
            where: { id: answer.id },
            data: {
              publishedReviewJson: null,
              publishedScore: null,
            },
          }),
        ),
      );

      await restoreMockExamAttemptQuota({ tx, record });

      await tx.mockExamRecord.update({
        where: { id: record.id },
        data: {
          activeKey: null,
          reviewWorkflowStatus: RETURNED_FOR_REDO_STATUS,
          publishedAt: null,
          manualReviewerId: null,
          manualReviewerName: null,
          manualReviewLockToken: null,
          manualReviewClaimedAt: null,
          manualReviewLockExpiresAt: null,
          manualReviewVersion: { increment: 1 },
          lastAiReviewError: reason ? `返还重做：${reason}` : "返还重做",
        },
      });

      return {
        record: await getAdminReviewRecord(tx, record.id),
        paperTitle: paper?.title ?? "",
      };
    });

    await writeAdminAuditLog(req, {
      action: "return_mock_exam_review_for_redo",
      entityType: "mock_exam_record",
      entityId: recordId,
      entityName: result.paperTitle,
      detail: { recordId, paperId: result.record?.paperId, userId: result.record?.userId, reason },
    });

    return ok(res, { recordId, reviewWorkflowStatus: RETURNED_FOR_REDO_STATUS }, "已返还给学生重新作答，旧批改记录将不再占用次数");
  } catch (error) {
    return fail(res, error.message || "返还重做失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.patch("/records/:recordId/review-draft", async (req, res) => {
  try {
    const recordId = `${req.params.recordId ?? ""}`.trim();
    const currentTime = new Date();
    const updatedRecord = await prisma.$transaction(async (tx) => {
      const record = await getAdminReviewRecord(tx, recordId);
      assertReviewableRecord(record);
      assertEditableLock(record, req, {
        lockToken: req.body?.lockToken,
        version: req.body?.manualReviewVersion,
        currentTime,
      });
      const normalized = await saveReviewPayload({ tx, record, payloadAnswers: req.body?.answers });
      await tx.mockExamRecord.update({
        where: { id: record.id },
        data: {
          reviewWorkflowStatus: "manual_pending",
          publishedAt: null,
          manualReviewVersion: { increment: 1 },
          manualReviewLockExpiresAt: buildLockExpiresAt(currentTime),
        },
      });
      return { record: await getAdminReviewRecord(tx, record.id), normalized };
    });

    await writeAdminAuditLog(req, {
      action: "save_mock_exam_review_draft",
      entityType: "mock_exam_record",
      entityId: recordId,
      entityName: updatedRecord.record?.paper?.title ?? "",
      detail: {
        recordId,
        paperId: updatedRecord.record?.paperId,
        questionCount: updatedRecord.normalized.length,
        totalDraftScore: updatedRecord.normalized.reduce((sum, item) => sum + Number(item.score ?? 0), 0),
      },
    });

    return ok(res, serializeReviewDetail(updatedRecord.record, req, currentTime), "批改草稿已保存");
  } catch (error) {
    return fail(res, error.message || "保存批改草稿失败", error.statusCode || 500);
  }
});

adminMockExamReviewRouter.post("/records/:recordId/publish", async (req, res) => {
  try {
    const recordId = `${req.params.recordId ?? ""}`.trim();
    const currentTime = new Date();
    const updatedRecord = await prisma.$transaction(async (tx) => {
      const record = await getAdminReviewRecord(tx, recordId);
      assertReviewableRecord(record);
      assertEditableLock(record, req, {
        lockToken: req.body?.lockToken,
        version: req.body?.manualReviewVersion,
        currentTime,
      });

      const normalized = await saveReviewPayload({ tx, record, payloadAnswers: req.body?.answers });
      const missingCommentCount = normalized.reduce(
        (sum, item) => sum + item.reviewJson.subQuestions.filter((subQuestion) => !normalizeText(subQuestion.reviewComment)).length,
        0,
      );
      if (missingCommentCount > 0) {
        const error = new Error(`还有 ${missingCommentCount} 个小问没有填写老师点评，不能发送给学生`);
        error.statusCode = 400;
        throw error;
      }
      const paper = getRecordPaper(record);
      const subjectiveQuestionIds = new Set((paper?.questions ?? []).filter(isSubjectiveQuestion).map((question) => question.id));
      const objectiveScore = (record.answers ?? [])
        .filter((answer) => !subjectiveQuestionIds.has(answer.questionId))
        .reduce((sum, answer) => sum + Number(answer.score ?? 0), 0);
      const subjectiveScore = normalized.reduce((sum, item) => sum + Number(item.score ?? 0), 0);

      await Promise.all(
        normalized.map((item) =>
          tx.mockExamAnswer.update({
            where: { id: item.existingAnswer.id },
            data: {
              publishedReviewJson: JSON.stringify(item.reviewJson),
              publishedScore: item.score,
            },
          }),
        ),
      );

      await tx.mockExamRecord.update({
        where: { id: record.id },
        data: {
          totalScore: objectiveScore + subjectiveScore,
          reviewWorkflowStatus: "published",
          reviewedAt: currentTime,
          publishedAt: currentTime,
          manualReviewVersion: { increment: 1 },
          manualReviewLockToken: null,
          manualReviewLockExpiresAt: null,
          lastAiReviewError: null,
        },
      });
      return { record: await getAdminReviewRecord(tx, record.id), normalized, totalScore: objectiveScore + subjectiveScore };
    });

    await writeAdminAuditLog(req, {
      action: "publish_mock_exam_review",
      entityType: "mock_exam_record",
      entityId: recordId,
      entityName: updatedRecord.record?.paper?.title ?? "",
      detail: {
        recordId,
        paperId: updatedRecord.record?.paperId,
        questionCount: updatedRecord.normalized.length,
        totalScore: updatedRecord.totalScore,
      },
    });

    return ok(res, serializeReviewDetail(updatedRecord.record, req, currentTime), "批改结果已发送给学生");
  } catch (error) {
    return fail(res, error.message || "发送批改结果失败", error.statusCode || 500);
  }
});
