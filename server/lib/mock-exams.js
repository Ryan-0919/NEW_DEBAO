import { getReadableObjectUrl } from "./upload.js";
import { formatDateTime } from "./time.js";
import {
  AI_REVIEW_GRADING_TEMPLATE_PLACEHOLDERS,
  AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS,
  getMissingMockExamAiReviewPromptTemplatePlaceholders,
} from "../../src/shared/mock-exam-ai-review-config.js";

const SUBJECTIVE_TYPE = "subjective_case";
const DEFAULT_OBJECTIVE_COVER = "/mock-exam/default-objective-cover.svg";
const DEFAULT_SUBJECTIVE_COVER = "/mock-exam/default-subjective-cover.svg";

const questionTypeMeta = {
  single_choice: {
    label: "单选题",
    maxSelections: 1,
    sectionDescription: "每题只有一个正确答案。",
  },
  multiple_choice: {
    label: "多选题",
    maxSelections: 99,
    sectionDescription: "每题至少有两个正确答案。",
  },
  uncertain_choice: {
    label: "不定项选择题",
    maxSelections: 99,
    sectionDescription: "每题至少有一个正确答案。",
  },
  subjective_case: {
    label: "主观题",
    maxSelections: 0,
    sectionDescription: "请在答题区域内作答，系统会保存答案。",
  },
};

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseJsonSafely = (value, fallback) => {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeAnswerKeys = (answerKeys = []) =>
  Array.from(
    new Set(
      (Array.isArray(answerKeys) ? answerKeys : [])
        .map((item) => `${item ?? ""}`.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).sort();

const parseObjectiveAnswerJson = (value) => normalizeAnswerKeys(parseJsonSafely(value, []));

const normalizePlainText = (value) => `${value ?? ""}`.replace(/\r\n/g, "\n").trimEnd();

const isSubjectiveQuestionType = (type) => type === SUBJECTIVE_TYPE;
const isSubjectiveQuestion = (question) => isSubjectiveQuestionType(question?.type);

const isSameAnswer = (left, right) => left.length === right.length && left.every((item, index) => item === right[index]);

const isUniqueConstraintError = (error, fieldName = "") => {
  const targets = Array.isArray(error?.meta?.target) ? error.meta.target : [`${error?.meta?.target ?? ""}`];
  return error?.code === "P2002" && (!fieldName || targets.some((target) => `${target}`.includes(fieldName)));
};

const inferPaperTypeFromQuestions = (questions = []) =>
  questions.some((question) => isSubjectiveQuestionType(question?.type)) ? "subjective" : "objective";

const normalizePaperTypeFilter = (paperType = "") => {
  const normalized = `${paperType ?? ""}`.trim();
  return normalized === "objective" || normalized === "subjective" ? normalized : "";
};

const getPaperType = (paper) => paper?.paperType ?? inferPaperTypeFromQuestions(paper?.questions ?? []);

const isMatchingPaperType = (paper, paperType = "") => {
  const filter = normalizePaperTypeFilter(paperType);
  if (!filter) return true;
  return getPaperType(paper) === filter;
};

const getPaperCoverUrl = (paper) => {
  const paperType = paper?.paperType ?? inferPaperTypeFromQuestions(paper?.questions ?? []);
  return (
    getReadableObjectUrl({
      objectKey: paper?.coverObjectKey ?? "",
      fallbackUrl: paper?.coverUrl ?? "",
    }) || (paperType === "subjective" ? DEFAULT_SUBJECTIVE_COVER : DEFAULT_OBJECTIVE_COVER)
  );
};

const getQuestionAudioUrl = (question) =>
  getReadableObjectUrl({
    objectKey: question?.lessonAudioObjectKey ?? "",
    fallbackUrl: question?.lessonAudioUrl ?? "",
  });

const normalizeReviewProvider = (value = "") => {
  const normalized = `${value ?? ""}`.trim();
  return normalized === "openai-compatible" || normalized === "rules" ? normalized : undefined;
};

const normalizeRubricPoints = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map((item, index) => ({
      id: `${item?.id ?? `rubric_${index + 1}`}`.trim(),
      title: `${item?.title ?? item?.label ?? ""}`.trim(),
      description: `${item?.description ?? item?.comment ?? ""}`.trim(),
      score: Number(item?.score ?? item?.awardedScore ?? 0) || 0,
      maxScore: Number(item?.maxScore ?? item?.score ?? 0) || 0,
      awardedScore: Number(item?.awardedScore ?? item?.score ?? 0) || 0,
      hit: Boolean(item?.hit ?? item?.matched ?? false),
      comment: `${item?.comment ?? item?.description ?? ""}`.trim(),
    }))
    .filter((item) => item.id && (item.title || item.comment || item.description));

const normalizeMissedPoints = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map((item, index) => ({
      id: `${item?.id ?? `missed_${index + 1}`}`.trim(),
      title: `${item?.title ?? item?.label ?? ""}`.trim(),
      description: `${item?.description ?? ""}`.trim(),
      score: Number(item?.score ?? 0) || 0,
      comment: `${item?.comment ?? ""}`.trim(),
      suggestion: `${item?.suggestion ?? item?.advice ?? ""}`.trim(),
    }))
    .filter((item) => item.id && (item.title || item.comment || item.description || item.suggestion));

const normalizeAnswerMarks = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map((item, index) => ({
      id: `${item?.id ?? `mark_${index + 1}`}`.trim(),
      highlight: `${item?.highlight ?? item?.text ?? ""}`.trim(),
      comment: `${item?.comment ?? ""}`.trim(),
      status: item?.status === "wrong" || item?.status === "score" || item?.status === "neutral" ? item.status : "correct",
      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : undefined,
      start: Number.isInteger(Number(item?.start)) ? Number(item.start) : undefined,
      end: Number.isInteger(Number(item?.end)) ? Number(item.end) : undefined,
      segmentId: `${item?.segmentId ?? item?.segment_id ?? item?.answerSegmentId ?? item?.answer_segment_id ?? ""}`.trim() || undefined,
    }))
    .filter((item) => item.id && item.highlight);

const dedupeAnswerMarks = (marks = []) => {
  const seen = new Set();
  return (Array.isArray(marks) ? marks : []).filter((mark) => {
    const key = [mark.highlight, mark.status, mark.score ?? "", mark.comment ?? "", mark.start ?? "", mark.end ?? ""].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getPaperTotalScore = (questions = []) => questions.reduce((sum, question) => sum + Number(question.score ?? 0), 0);

const getQuestionMeta = (question) => {
  const raw = parseJsonSafely(question?.questionMetaJson, {});
  const subQuestions = Array.isArray(raw?.subQuestions)
    ? raw.subQuestions
        .map((item, index) => ({
          id: `${item?.id ?? `${question.id}_sub_${index + 1}`}`.trim(),
          title: `${item?.title ?? `问题(${index + 1})`}`.trim(),
          placeholder: `${item?.placeholder ?? "请在此输入答案。"}`.trim(),
          abilityLabel: `${item?.abilityLabel ?? ""}`.trim(),
          referenceAnswer: `${item?.referenceAnswer ?? ""}`.trim(),
          rubricGuidance: `${item?.rubricGuidance ?? ""}`.trim(),
          rubricPoints: normalizeRubricPoints(item?.rubricPoints),
          maxScore: Number(item?.maxScore ?? 0) || 0,
          sortOrder: Number(item?.sortOrder ?? index + 1),
        }))
        .filter((item) => item.id && item.title)
        .sort((left, right) => left.sortOrder - right.sortOrder)
    : [];

  return {
    sectionLabel: `${raw?.sectionLabel ?? ""}`.trim() || questionTypeMeta[question?.type]?.label || `${question?.type ?? "题目"}`,
    sectionDescription: `${raw?.sectionDescription ?? ""}`.trim() || questionTypeMeta[question?.type]?.sectionDescription || "",
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
  return Object.fromEntries(getQuestionMeta(question).subQuestions.map((item) => [item.id, normalizePlainText(source[item.id])]));
};

const getQuestionAnswerState = (question, answerJson) => {
  if (!isSubjectiveQuestion(question)) {
    return parseObjectiveAnswerJson(answerJson).length > 0 ? "answered" : "unanswered";
  }

  const answerMap = parseSubjectiveAnswerMap(answerJson, question);
  const subQuestions = getQuestionMeta(question).subQuestions;
  const filledCount = subQuestions.filter((item) => answerMap[item.id]).length;
  if (filledCount === 0) return "unanswered";
  if (filledCount >= subQuestions.length) return "answered";
  return "partial";
};

const getAnsweredQuestionCount = (questions = [], answers = []) => {
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.answerJson]));
  return questions.filter((question) => getQuestionAnswerState(question, answerMap.get(question.id)) === "answered").length;
};

const getElapsedSeconds = (record, currentTime = new Date()) => {
  if (record.status === "submitted") {
    return Math.max(0, Math.floor(record.consumedSeconds ?? 0));
  }

  const consumedSeconds = Math.max(0, Math.floor(record.consumedSeconds ?? 0));
  if (record.isPaused) return consumedSeconds;

  const elapsed = Math.floor((currentTime.getTime() - new Date(record.startedAt).getTime()) / 1000);
  return Math.max(0, consumedSeconds + elapsed);
};

const getRemainingSeconds = (record, currentTime = new Date()) =>
  Math.max(0, Math.floor(record.allottedSeconds ?? 0) - getElapsedSeconds(record, currentTime));

const getBoundedConsumedSeconds = (record, currentTime = new Date()) =>
  Math.min(Math.max(0, getElapsedSeconds(record, currentTime)), Math.max(0, Math.floor(record.allottedSeconds ?? 0)));

const resumeMockExamRecordIfNeeded = async ({ db, record, currentTime = new Date() }) => {
  if (!record || record.status !== "in_progress" || !record.isPaused) {
    return record;
  }

  await db.mockExamRecord.update({
    where: { id: record.id },
    data: {
      isPaused: false,
      startedAt: currentTime,
    },
  });

  return getRecordWithPaper(db, record.id);
};

const buildMockExamSections = (questions = []) =>
  Object.entries(questionTypeMeta)
    .map(([type, meta]) => {
      const matched = questions.filter((question) => question.type === type);
      return {
        type,
        label: meta.label,
        count: matched.length,
        totalScore: matched.reduce((sum, item) => sum + Number(item.score ?? 0), 0),
      };
    })
    .filter((item) => item.count > 0);

const buildRecordPaperSnapshot = (paper) =>
  JSON.stringify({
    paper: {
      id: paper.id,
      code: paper.code,
      title: paper.title,
      subtitle: paper.subtitle ?? "",
      coverUrl: paper.coverUrl ?? "",
      coverObjectKey: paper.coverObjectKey ?? "",
      paperType: paper.paperType ?? inferPaperTypeFromQuestions(paper.questions ?? []),
      year: Number(paper.year ?? 0),
      phase: paper.phase ?? "",
      durationMinutes: Number(paper.durationMinutes ?? 0),
      maxAttempts: Number(paper.maxAttempts ?? 0),
      reviewEnabled: Boolean(paper.reviewEnabled),
      reviewAttemptLimit: Number(paper.reviewAttemptLimit ?? 0),
      totalScore: getPaperTotalScore(paper.questions ?? []),
      questionCount: (paper.questions ?? []).length,
      passScore: Number(paper.passScore ?? 0),
      description: paper.description ?? "",
    },
    questions: (paper.questions ?? []).map((question) => ({
      id: question.id,
      sortOrder: Number(question.sortOrder ?? 0),
      type: question.type,
      score: Number(question.score ?? 0),
      material: question.material ?? "",
      stem: question.stem,
      analysis: question.analysis ?? "",
      lessonAudioUrl: question.lessonAudioUrl ?? "",
      lessonAudioObjectKey: question.lessonAudioObjectKey ?? "",
      lessonAudioDurationSeconds: Number(question.lessonAudioDurationSeconds ?? 0) || 0,
      correctAnswerJson: question.correctAnswerJson,
      questionMetaJson: question.questionMetaJson ?? null,
      options: (question.options ?? []).map((option) => ({
        id: option.id,
        optionKey: option.optionKey,
        content: option.content,
        sortOrder: Number(option.sortOrder ?? 0),
      })),
    })),
  });

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
    coverUrl: `${paper.coverUrl ?? ""}`.trim(),
    coverObjectKey: `${paper.coverObjectKey ?? ""}`.trim(),
    paperType: `${paper.paperType ?? inferPaperTypeFromQuestions(questions)}`.trim() || inferPaperTypeFromQuestions(questions),
    year: Number(paper.year ?? 0),
    phase: `${paper.phase ?? ""}`.trim(),
    durationMinutes: Number(paper.durationMinutes ?? 0),
    maxAttempts: Number(paper.maxAttempts ?? 0),
    reviewEnabled: typeof paper.reviewEnabled === "boolean" ? paper.reviewEnabled : questions.some((question) => isSubjectiveQuestion(question)),
    reviewAttemptLimit: Number(paper.reviewAttemptLimit ?? 0),
    totalScore: Number(paper.totalScore ?? 0),
    questionCount: Number(paper.questionCount ?? questions.length),
    passScore: Number(paper.passScore ?? 0),
    description: `${paper.description ?? ""}`.trim(),
    questions: questions
      .map((question) => ({
        id: `${question?.id ?? ""}`.trim(),
        sortOrder: Number(question?.sortOrder ?? 0),
        type: `${question?.type ?? ""}`.trim(),
        score: Number(question?.score ?? 0),
        material: `${question?.material ?? ""}`,
        stem: `${question?.stem ?? ""}`,
        analysis: `${question?.analysis ?? ""}`,
        lessonAudioUrl: `${question?.lessonAudioUrl ?? ""}`,
        lessonAudioObjectKey: `${question?.lessonAudioObjectKey ?? ""}`,
        lessonAudioDurationSeconds: Number(question?.lessonAudioDurationSeconds ?? 0) || 0,
        correctAnswerJson: `${question?.correctAnswerJson ?? "[]"}`,
        questionMetaJson: question?.questionMetaJson ? `${question.questionMetaJson}` : null,
        options: Array.isArray(question?.options)
          ? question.options
              .map((option) => ({
                id: `${option?.id ?? ""}`.trim(),
                optionKey: `${option?.optionKey ?? ""}`.trim(),
                content: `${option?.content ?? ""}`,
                sortOrder: Number(option?.sortOrder ?? 0),
              }))
              .sort((left, right) => left.sortOrder - right.sortOrder)
          : [],
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
      if (!liveQuestion) return question;

      return {
        ...question,
        lessonAudioUrl: liveQuestion.lessonAudioUrl || question.lessonAudioUrl,
        lessonAudioObjectKey: liveQuestion.lessonAudioObjectKey || question.lessonAudioObjectKey,
        lessonAudioDurationSeconds: liveQuestion.lessonAudioDurationSeconds || question.lessonAudioDurationSeconds,
      };
    }),
  };
};

const getRecordPaper = (record) => mergeSnapshotWithLivePaper(parseRecordPaperSnapshot(record), record?.paper ?? null);

const getReviewWorkflowStatus = (record) => {
  const explicit = `${record?.reviewWorkflowStatus ?? ""}`.trim();
  if (record?.status !== "submitted") return "not_required";
  if (explicit === "published" || record?.publishedAt) return "published";
  if ((record?.answers ?? []).some((answer) => Boolean(answer?.publishedReviewJson))) return "published";
  if (explicit && explicit !== "not_required") return explicit;

  const paper = getRecordPaper(record);
  const needsReview = Boolean(paper?.reviewEnabled) && (paper?.questions ?? []).some((question) => isSubjectiveQuestion(question));
  if (!needsReview) return "not_required";
  return explicit || "ai_pending";
};

const isRecordPublishedToUser = (record) => ["not_required", "published"].includes(getReviewWorkflowStatus(record));

const getVisibleMockExamTotalScore = (record) => {
  if (!record || !isRecordPublishedToUser(record)) return Number(record?.totalScore ?? 0);
  const publishedSubjectiveScore = (record.answers ?? [])
    .filter((answer) => answer.publishedReviewJson)
    .reduce((sum, answer) => sum + Number(answer.publishedScore ?? answer.score ?? 0), 0);
  if (publishedSubjectiveScore <= 0) return Number(record.totalScore ?? 0);
  const currentSubjectiveScore = (record.answers ?? [])
    .filter((answer) => answer.reviewJson)
    .reduce((sum, answer) => sum + Number(answer.score ?? 0), 0);
  return Math.max(0, Number(record.totalScore ?? 0) - currentSubjectiveScore + publishedSubjectiveScore);
};

const userVisibleReviewStatuses = new Set(["not_required", "ai_pending", "ai_processing", "manual_pending", "published"]);

const isRecordVisibleInUserHistory = (record) => record.status === "in_progress" || userVisibleReviewStatuses.has(getReviewWorkflowStatus(record));

const serializeRecordSummary = (record, currentTime = new Date()) => {
  if (!record) return null;
  const remainingSeconds = getRemainingSeconds(record, currentTime);
  const consumedSeconds =
    record.status === "submitted"
      ? Math.max(0, Math.floor(record.consumedSeconds ?? 0))
      : Math.max(0, Math.floor(record.allottedSeconds ?? 0) - remainingSeconds);

  return {
    id: record.id,
    status: record.status,
    attemptNo: record.attemptNo,
    questionCount: record.questionCount,
    answeredCount: record.answeredCount,
    correctCount: record.correctCount,
    totalScore: getVisibleMockExamTotalScore(record),
    allottedSeconds: record.allottedSeconds,
    consumedSeconds,
    remainingSeconds,
    startedAt: formatDateTime(record.startedAt),
    submittedAt: record.submittedAt ? formatDateTime(record.submittedAt) : "",
    reviewWorkflowStatus: getReviewWorkflowStatus(record),
    canResume: record.status === "in_progress" && remainingSeconds > 0,
  };
};

export const serializeMockExamPaperSummary = ({ paper, activeRecord = null, latestRecord = null, currentTime = new Date() }) => {
  const questions = paper.questions ?? [];
  return {
    id: paper.id,
    code: paper.code,
    seriesId: paper.seriesId ?? "",
    seriesName: paper.series?.name ?? "",
    title: paper.title,
    subtitle: paper.subtitle ?? "",
    coverUrl: getPaperCoverUrl(paper),
    coverObjectKey: paper.coverObjectKey ?? "",
    paperType: paper.paperType ?? inferPaperTypeFromQuestions(questions),
    year: paper.year ?? 0,
    phase: paper.phase ?? "",
    durationMinutes: paper.durationMinutes,
    maxAttempts: Number(paper.maxAttempts ?? 0),
    reviewEnabled: Boolean(paper.reviewEnabled),
    reviewAttemptLimit: Number(paper.reviewAttemptLimit ?? 0),
    permissionRequired: Boolean(paper.permissionRequired),
    openTime: paper.openTime ? formatDateTime(paper.openTime) : "",
    isOpen: !paper.openTime || new Date(paper.openTime).getTime() <= currentTime.getTime(),
    totalScore: getPaperTotalScore(questions) || Number(paper.totalScore ?? 0),
    questionCount: questions.length || Number(paper.questionCount ?? 0),
    passScore: paper.passScore,
    description: paper.description ?? "",
    sections: buildMockExamSections(questions),
    activeRecord: serializeRecordSummary(activeRecord, currentTime),
    latestRecord: serializeRecordSummary(latestRecord, currentTime),
  };
};

const serializeQuestion = (question, answer, revealAnswer) => {
  const questionMeta = getQuestionMeta(question);
  const answerState = getQuestionAnswerState(question, answer?.answerJson);

  if (isSubjectiveQuestion(question)) {
    const answerMap = parseSubjectiveAnswerMap(answer?.answerJson, question);
    const publishedReviewJson = parseJsonSafely(answer?.publishedReviewJson, null);
    const reviewJson = revealAnswer ? publishedReviewJson ?? parseJsonSafely(answer?.reviewJson, null) : null;
    const reviewSource = `${reviewJson?.source ?? "system"}`.trim() || "system";
    const reviewProvider = normalizeReviewProvider(reviewJson?.reviewProvider ?? reviewJson?.provider ?? "");
    return {
      id: question.id,
      sortOrder: question.sortOrder,
      type: question.type,
      typeLabel: questionTypeMeta[question.type]?.label ?? question.type,
      score: question.score,
      material: question.material ?? "",
      stem: question.stem,
      analysis: revealAnswer ? question.analysis ?? "" : "",
      options: [],
      userAnswerKeys: [],
      correctAnswerKeys: [],
      isCorrect: null,
      earnedScore: revealAnswer ? Number(answer?.publishedScore ?? answer?.score ?? 0) : 0,
      answerState,
      sectionLabel: questionMeta.sectionLabel,
      sectionDescription: questionMeta.sectionDescription,
      reviewSource,
      reviewProvider,
      subjectiveSubQuestions: questionMeta.subQuestions.map((item) => {
        const text = answerMap[item.id] ?? "";
        const reviewItem = Array.isArray(reviewJson?.subQuestions)
          ? reviewJson.subQuestions.find((entry) => `${entry?.id ?? ""}` === item.id)
          : null;
        const score = Number(reviewItem?.score ?? 0) || 0;
        const maxScore = Number(reviewItem?.maxScore ?? item.maxScore ?? 0) || 0;

        return {
          id: item.id,
          title: item.title,
          placeholder: item.placeholder,
          answer: text,
          wordCount: text.length,
          score: revealAnswer ? score : 0,
          maxScore,
          reviewComment: revealAnswer ? `${reviewItem?.reviewComment ?? ""}`.trim() : "",
          referenceAnswer: revealAnswer ? `${reviewItem?.referenceAnswer ?? item.referenceAnswer ?? ""}`.trim() : "",
          reviewSource: reviewItem?.reviewSource ?? reviewSource,
          reviewProvider: normalizeReviewProvider(reviewItem?.reviewProvider ?? reviewProvider),
          isReviewed: revealAnswer && Boolean(reviewItem),
          abilityLabel: `${reviewItem?.abilityLabel ?? item.abilityLabel ?? item.title ?? ""}`.trim(),
          abilityScoreRate: revealAnswer && maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(1)) : 0,
          rubricGuidance: revealAnswer ? `${reviewItem?.rubricGuidance ?? item.rubricGuidance ?? ""}`.trim() : "",
          rubricPoints: revealAnswer ? normalizeRubricPoints(reviewItem?.rubricPoints ?? item.rubricPoints) : [],
          missedPoints: revealAnswer ? normalizeMissedPoints(reviewItem?.missedPoints) : [],
          skippedReview: revealAnswer && Boolean(reviewItem?.skippedReview),
          skippedReviewReason: revealAnswer ? `${reviewItem?.skippedReviewReason ?? ""}`.trim() : "",
          answerMarks: revealAnswer ? normalizeAnswerMarks(reviewItem?.answerMarks) : [],
        };
      }),
      reviewFeedbackStars: revealAnswer ? Number(reviewJson?.feedbackStars ?? 0) || 0 : 0,
      reviewFeedbackSubmittedAt: revealAnswer && reviewJson?.feedbackSubmittedAt ? formatDateTime(reviewJson.feedbackSubmittedAt) : "",
      lessonAudioUrl: getQuestionAudioUrl(question),
      lessonAudioObjectKey: `${question.lessonAudioObjectKey ?? ""}`.trim(),
      lessonAudioDurationSeconds: Number(question.lessonAudioDurationSeconds ?? 0) || 0,
      reviewVoiceUrl: getReadableObjectUrl({
        objectKey: revealAnswer ? reviewJson?.reviewVoiceObjectKey ?? "" : "",
        fallbackUrl: revealAnswer ? reviewJson?.reviewVoiceUrl ?? "" : "",
      }),
      reviewVoiceObjectKey: revealAnswer ? `${reviewJson?.reviewVoiceObjectKey ?? ""}`.trim() : "",
      reviewVoiceDurationSeconds: revealAnswer ? Number(reviewJson?.reviewVoiceDurationSeconds ?? 0) || 0 : 0,
    };
  }

  const userAnswerKeys = parseObjectiveAnswerJson(answer?.answerJson);
  return {
    id: question.id,
    sortOrder: question.sortOrder,
    type: question.type,
    typeLabel: questionTypeMeta[question.type]?.label ?? question.type,
    score: question.score,
    material: question.material ?? "",
    stem: question.stem,
    analysis: revealAnswer ? question.analysis ?? "" : "",
    options: (question.options ?? []).map((option) => ({
      id: option.id,
      key: option.optionKey,
      content: option.content,
    })),
    userAnswerKeys,
    correctAnswerKeys: revealAnswer ? parseObjectiveAnswerJson(question.correctAnswerJson) : [],
    isCorrect: revealAnswer ? answer?.isCorrect ?? false : null,
    earnedScore: revealAnswer ? Number(answer?.score ?? 0) : 0,
    answerState,
    sectionLabel: questionMeta.sectionLabel,
    sectionDescription: questionMeta.sectionDescription,
    subjectiveSubQuestions: [],
    reviewSource: "system",
    reviewFeedbackStars: 0,
    reviewFeedbackSubmittedAt: "",
    lessonAudioUrl: getQuestionAudioUrl(question),
    lessonAudioObjectKey: `${question.lessonAudioObjectKey ?? ""}`.trim(),
    lessonAudioDurationSeconds: Number(question.lessonAudioDurationSeconds ?? 0) || 0,
    reviewVoiceUrl: "",
    reviewVoiceObjectKey: "",
    reviewVoiceDurationSeconds: 0,
  };
};

export const serializeMockExamRecordDetail = (record, currentTime = new Date()) => {
  const paper = getRecordPaper(record);
  const answerMap = new Map((record.answers ?? []).map((answer) => [answer.questionId, answer]));
  const revealAnswer = record.status === "submitted" && isRecordPublishedToUser(record);
  const questions = (paper?.questions ?? []).map((question) => serializeQuestion(question, answerMap.get(question.id), revealAnswer));
  const visibleTotalScore = revealAnswer
    ? questions.reduce((sum, question) => sum + Number(question.earnedScore ?? 0), 0)
    : Number(record.totalScore ?? 0);
  const subjectiveQuestionCount = questions.filter((question) => isSubjectiveQuestionType(question.type)).length;
  const objectiveQuestions = questions.filter((question) => !isSubjectiveQuestionType(question.type));
  const objectiveAnsweredCount = objectiveQuestions.filter((question) => question.userAnswerKeys.length > 0).length;
  const remainingSeconds = getRemainingSeconds(record, currentTime);
  const consumedSeconds =
    record.status === "submitted"
      ? Math.max(0, Math.floor(record.consumedSeconds ?? 0))
      : Math.max(0, Math.floor(record.allottedSeconds ?? 0) - remainingSeconds);
  const finalScorePending = record.status === "submitted" && Boolean(paper.reviewEnabled) && subjectiveQuestionCount > 0 && !isRecordPublishedToUser(record);

  return {
    id: record.id,
    status: record.status,
    attemptNo: record.attemptNo,
    questionCount: questions.length,
    answeredCount: questions.filter((question) => question.answerState === "answered").length,
    correctCount: record.correctCount,
    totalScore: visibleTotalScore,
    allottedSeconds: record.allottedSeconds,
    consumedSeconds,
    remainingSeconds,
    startedAt: formatDateTime(record.startedAt),
    submittedAt: record.submittedAt ? formatDateTime(record.submittedAt) : "",
    reviewedAt: record.reviewedAt ? formatDateTime(record.reviewedAt) : "",
    publishedAt: record.publishedAt ? formatDateTime(record.publishedAt) : "",
    reviewWorkflowStatus: getReviewWorkflowStatus(record),
    paper: {
      id: paper.id,
      code: paper.code,
      title: paper.title,
      subtitle: paper.subtitle ?? "",
      coverUrl: getPaperCoverUrl(paper),
      coverObjectKey: paper.coverObjectKey ?? "",
      paperType: paper.paperType ?? inferPaperTypeFromQuestions(paper.questions ?? []),
      year: paper.year ?? 0,
      phase: paper.phase ?? "",
      durationMinutes: paper.durationMinutes,
      maxAttempts: Number(paper.maxAttempts ?? 0),
      reviewEnabled: Boolean(paper.reviewEnabled),
      reviewAttemptLimit: Number(paper.reviewAttemptLimit ?? 0),
      permissionRequired: Boolean(paper.permissionRequired),
      openTime: paper.openTime ? formatDateTime(paper.openTime) : "",
      isOpen: !paper.openTime || new Date(paper.openTime).getTime() <= currentTime.getTime(),
      totalScore: getPaperTotalScore(paper.questions ?? []) || paper.totalScore,
      questionCount: questions.length,
      passScore: paper.passScore,
      description: paper.description ?? "",
      sections: buildMockExamSections(paper.questions ?? []),
    },
    summary: {
      accuracyRate: objectiveQuestions.length > 0 ? Number(((record.correctCount / objectiveQuestions.length) * 100).toFixed(1)) : 0,
      wrongCount: Math.max(0, objectiveAnsweredCount - record.correctCount),
      unfinishedCount: Math.max(0, questions.length - questions.filter((question) => question.answerState === "answered").length),
      pendingReviewCount: finalScorePending ? subjectiveQuestionCount : 0,
      finalScorePending,
      isPassed: record.status === "submitted" && !finalScorePending ? visibleTotalScore >= paper.passScore : null,
    },
    questions,
    reviewEnabled: Boolean(paper.reviewEnabled) && subjectiveQuestionCount > 0,
  };
};

const clampScore = (value, min = 0, max = 0) => Math.max(min, Math.min(max, Math.round(Number(value ?? 0) || 0)));

const getSubjectiveMaxScore = (question, subQuestion, subQuestionCount = 1) => {
  const explicit = Number(subQuestion?.maxScore ?? 0) || 0;
  if (explicit > 0) return explicit;

  return Math.max(0, Math.round((Number(question?.score ?? 0) || 0) / Math.max(1, subQuestionCount)));
};

const getReviewPointText = (point) =>
  [point?.title, point?.description, point?.comment]
    .map((item) => `${item ?? ""}`.trim())
    .filter(Boolean)
    .join(" ");

const scoreSubjectiveByRubric = ({ answerText, rubricPoints = [], maxScore = 0 }) => {
  if (!answerText.trim()) {
    return {
      score: 0,
      rubricPoints: rubricPoints.map((point) => ({ ...point, hit: false, awardedScore: 0 })),
      answerMarks: [],
    };
  }

  if (!rubricPoints.length) {
    const score = clampScore((answerText.length / 180) * maxScore, 0, maxScore);
    return {
      score,
      rubricPoints: [],
      answerMarks: [],
    };
  }

  let score = 0;
  const answerMarks = [];
  const scoredPoints = rubricPoints.map((point, index) => {
    const pointText = getReviewPointText(point);
    const terms = Array.from(
      new Set(
        pointText
          .split(/[\s,，。；;、：:（）()《》"“”]+/)
          .map((term) => term.trim())
          .filter((term) => term.length >= 2),
      ),
    );
    const matchedText = terms.find((term) => answerText.includes(term)) || "";
    const matchedIndex = matchedText ? answerText.indexOf(matchedText) : -1;
    const hit = Boolean(matchedText) || (point.title && answerText.includes(point.title));
    const pointMaxScore = Number(point.maxScore ?? point.score ?? 0) || 0;
    const awardedScore = hit ? clampScore(pointMaxScore || maxScore / Math.max(1, rubricPoints.length), 0, maxScore) : 0;
    score += awardedScore;

    if (hit && matchedText && matchedIndex >= 0) {
      answerMarks.push({
        id: `mark_${index + 1}`,
        highlight: matchedText,
        comment: point.title || point.description || "命中采分点",
        status: "score",
        score: awardedScore,
        start: matchedIndex,
        end: matchedIndex + matchedText.length,
      });
    }

    return {
      ...point,
      hit,
      awardedScore,
      score: pointMaxScore,
      comment: point.comment || point.description || "",
    };
  });

  return {
    score: clampScore(score, 0, maxScore),
    rubricPoints: scoredPoints,
    answerMarks,
  };
};

const buildSubjectiveReviewComment = ({ answerText, score, maxScore, title, missedPoints }) => {
  if (!answerText.trim()) {
    return "本小问没有检测到有效作答，结论、依据和本案分析都需要补齐。重新作答时先写出明确结论，再把对应法律依据和题干事实逐项展开。";
  }

  if (maxScore > 0 && score >= maxScore) {
    return "本小问作答已经覆盖主要采分点，结论、依据和本案分析较完整。继续提升时可以把关键判断之间的衔接写得更紧，避免只罗列观点。";
  }

  const missedText = missedPoints.map((point) => point.title || point.description).filter(Boolean).slice(0, 3).join("、");
  if (missedText) {
    return `本小问已经有一定作答基础，但还没有充分覆盖${missedText}。修改时不要只补概念，要把对应结论、法律依据和本案事实连起来写完整。`;
  }

  return `本小问围绕“${title || "问题"}”的展开还不够充分。建议把答案整理成“结论 + 依据 + 本案分析”的结构，每个判断都落回题干事实。`;
};

const buildRuleBasedSubjectiveReviewJson = ({ question, answer }) => {
  const questionMeta = getQuestionMeta(question);
  const subQuestions = questionMeta.subQuestions;
  const answerMap = parseSubjectiveAnswerMap(answer?.answerJson, question);
  const reviewedSubQuestions = subQuestions.map((subQuestion) => {
    const answerText = answerMap[subQuestion.id] ?? "";
    const maxScore = getSubjectiveMaxScore(question, subQuestion, subQuestions.length);
    const scored = scoreSubjectiveByRubric({
      answerText,
      rubricPoints: subQuestion.rubricPoints ?? [],
      maxScore,
    });
    const missedPoints = (scored.rubricPoints ?? [])
      .filter((point) => !point.hit)
      .map((point, index) => ({
        id: `missed_${index + 1}`,
        title: point.title || `遗漏点 ${index + 1}`,
        description: point.description || point.comment || "",
        score: Number(point.maxScore ?? point.score ?? 0) || 0,
        comment: point.comment || point.description || "",
      }));

    return {
      id: subQuestion.id,
      title: subQuestion.title,
      answer: answerText,
      score: scored.score,
      maxScore,
      reviewComment: buildSubjectiveReviewComment({
        answerText,
        score: scored.score,
        maxScore,
        title: subQuestion.title,
        missedPoints,
      }),
      referenceAnswer:
        subQuestion.referenceAnswer ||
        (scored.rubricPoints ?? []).map((point) => point.title).filter(Boolean).join("；"),
      reviewSource: "rule",
      reviewProvider: "rules",
      abilityLabel: subQuestion.abilityLabel || subQuestion.title,
      missedPoints,
      answerMarks: scored.answerMarks,
      rubricGuidance: subQuestion.rubricGuidance || "",
      rubricPoints: scored.rubricPoints,
      skippedReview: false,
      skippedReviewReason: "",
    };
  });

  return {
    source: "rule",
    reviewSource: "rule",
    reviewProvider: "rules",
    totalScore: reviewedSubQuestions.reduce((sum, item) => sum + Number(item.score ?? 0), 0),
    maxScore: Number(question?.score ?? 0) || reviewedSubQuestions.reduce((sum, item) => sum + Number(item.maxScore ?? 0), 0),
    reviewVoiceUrl: "",
    reviewVoiceObjectKey: "",
    reviewVoiceDurationSeconds: 0,
    feedbackStars: Number(parseJsonSafely(answer?.reviewJson, null)?.feedbackStars ?? 0) || 0,
    feedbackSubmittedAt: parseJsonSafely(answer?.reviewJson, null)?.feedbackSubmittedAt ?? null,
    subQuestions: reviewedSubQuestions,
  };
};

const isOpenAiCompatibleReady = (runtimeConfig) =>
  `${runtimeConfig?.provider ?? ""}`.trim() === "openai-compatible" &&
  Boolean(`${runtimeConfig?.baseUrl ?? ""}`.trim()) &&
  Boolean(`${runtimeConfig?.apiKey ?? ""}`.trim()) &&
  Boolean(`${runtimeConfig?.model ?? ""}`.trim());

const isOpenAiCompatibleProvider = (runtimeConfig) => `${runtimeConfig?.provider ?? ""}`.trim() === "openai-compatible";

const truncateForErrorMessage = (value, maxLength = 800) => {
  const text = `${value ?? ""}`.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const normalizeCompletionContent = (value) => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeCompletionContent(item))
      .join("")
      .trim();
  }
  if (value && typeof value === "object") {
    return normalizeCompletionContent(value.text ?? value.content ?? value.output_text ?? value.contentPreview ?? "");
  }
  return "";
};

const extractCompletionTexts = (payload) => {
  const choice = payload?.choices?.[0] ?? {};
  const candidates = [
    choice?.message?.content,
    choice?.message?.contentPreview,
    choice?.text,
    payload?.output_text,
    payload?.content,
    payload?.contentPreview,
    payload?.text,
    payload?.response,
    payload?.result,
    payload?.data?.content,
    payload?.data?.text,
  ];

  const texts = [];
  for (const candidate of candidates) {
    const text = normalizeCompletionContent(candidate);
    if (text && !texts.includes(text)) texts.push(text);
  }
  return texts;
};

const isAiReviewJsonPayload = (value) =>
  Boolean(value && typeof value === "object" && Array.isArray(value.subQuestions ?? value.sub_questions));

const extractDirectAiReviewPayload = (payload) =>
  [payload, payload?.data, payload?.result, payload?.response].find(isAiReviewJsonPayload) ?? null;

const extractJsonPayload = (text) => {
  const normalized = `${text ?? ""}`.trim();
  if (!normalized) return null;
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || normalized;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  return parseJsonSafely(firstBrace >= 0 && lastBrace >= firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate, null);
};

const normalizeAiAnswerMarkStatus = (value) => {
  const status = `${value ?? ""}`.trim().toLowerCase();
  if (status === "correct" || status === "score" || status === "right" || status === "positive") return "score";
  if (status === "wrong" || status === "incorrect" || status === "error" || status === "negative") return "wrong";
  if (status === "neutral" || status === "comment" || status === "suggestion") return "neutral";
  return "";
};

const getAiAnswerMarkScore = (mark) => mark?.score ?? mark?.awardedScore ?? mark?.awarded_score;

const getAiAnswerMarkSegmentId = (mark) =>
  `${mark?.segmentId ?? mark?.segment_id ?? mark?.answerSegmentId ?? mark?.answer_segment_id ?? ""}`.trim();

const trimWhitespaceRange = (value, start, end) => {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart < nextEnd && /\s/u.test(value[nextStart] ?? "")) nextStart += 1;
  while (nextEnd > nextStart && /\s/u.test(value[nextEnd - 1] ?? "")) nextEnd -= 1;
  return { start: nextStart, end: nextEnd };
};

const buildAnswerSegmentMap = ({ answerSegments = [], answerText = "" }) => {
  const answerValue = `${answerText ?? ""}`;
  const segmentMap = new Map();
  for (const segment of Array.isArray(answerSegments) ? answerSegments : []) {
    const id = `${segment?.id ?? segment?.segmentId ?? ""}`.trim();
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    const text = `${segment?.text ?? ""}`;
    if (!id || !Number.isInteger(start) || !Number.isInteger(end) || end <= start || answerValue.slice(start, end) !== text) {
      continue;
    }
    segmentMap.set(id, { id, start, end, text });
  }
  return segmentMap;
};

const resolveAiAnswerMarkRange = ({ mark, answerText, highlight, answerSegmentMap }) => {
  const segmentId = getAiAnswerMarkSegmentId(mark);
  if (segmentId) {
    const segment = answerSegmentMap.get(segmentId);
    if (segment) {
      return { start: segment.start, end: segment.end, highlight: segment.text, segmentId };
    }
  }

  const answerValue = `${answerText ?? ""}`;
  const trimmedHighlight = `${highlight ?? ""}`.trim();
  if (trimmedHighlight) {
    const explicitStart = Number(mark?.start);
    const explicitEnd = Number(mark?.end);
    if (
      Number.isInteger(explicitStart) &&
      Number.isInteger(explicitEnd) &&
      explicitStart >= 0 &&
      explicitEnd > explicitStart &&
      explicitEnd <= answerValue.length &&
      answerValue.slice(explicitStart, explicitEnd) === trimmedHighlight
    ) {
      return { start: explicitStart, end: explicitEnd, highlight: trimmedHighlight };
    }

    const firstIndex = answerValue.indexOf(trimmedHighlight);
    if (firstIndex >= 0) {
      return { start: firstIndex, end: firstIndex + trimmedHighlight.length, highlight: trimmedHighlight };
    }
  }

  return null;
};

const normalizeAndValidateAiAnswerMarks = ({ rawAnswerMarks, answerText, answerSegments, title }) => {
  if (!Array.isArray(rawAnswerMarks)) {
    throw createHttpError(`批改返回缺少局部批注 answerMarks：${title || "unknown"}`, 502);
  }

  const answerSegmentMap = buildAnswerSegmentMap({ answerSegments, answerText });
  const normalizedMarks = rawAnswerMarks.map((mark, index) => {
      const status = normalizeAiAnswerMarkStatus(mark?.status ?? mark?.type);
      const rawScore = Number(getAiAnswerMarkScore(mark));
      return {
        id: `${mark?.id ?? mark?.markId ?? mark?.mark_id ?? `mark_${index + 1}`}`.trim(),
        highlight: `${mark?.highlight ?? mark?.selectedText ?? mark?.selected_text ?? mark?.text ?? ""}`.trim(),
        comment: `${mark?.comment ?? mark?.reviewComment ?? mark?.review_comment ?? mark?.remark ?? ""}`.trim(),
        status,
        score: (status === "score" || status === "correct") && Number.isFinite(rawScore) ? rawScore : undefined,
        start: Number.isInteger(Number(mark?.start)) ? Number(mark.start) : undefined,
        end: Number.isInteger(Number(mark?.end)) ? Number(mark.end) : undefined,
        segmentId: getAiAnswerMarkSegmentId(mark),
      };
    });

  return dedupeAnswerMarks(
    normalizedMarks.map((mark) => {
      const status = normalizeAiAnswerMarkStatus(mark.status);
      if (!status) {
        throw createHttpError(`批改返回的局部批注类型不合法：${title || "unknown"}`, 502);
      }

      const range = resolveAiAnswerMarkRange({
        mark,
        answerText,
        highlight: mark.highlight,
        answerSegmentMap,
      });
      if (!range) {
        throw createHttpError(`批改返回的局部批注无法对应到考生原文：${title || "unknown"}，${mark.highlight.slice(0, 40)}`, 502);
      }

      return {
        ...mark,
        status,
        highlight: range.highlight,
        start: range.start,
        end: range.end,
        segmentId: range.segmentId,
      };
    }).filter((item) => item.id && item.highlight),
  );
};

const normalizeAiRubricPointsWithFallback = ({ rawRubricPoints, fallbackRubricPoints }) => {
  const fallbackPoints = normalizeRubricPoints(fallbackRubricPoints);
  const returnedPoints = normalizeRubricPoints(rawRubricPoints);
  if (!returnedPoints.length) {
    return fallbackPoints;
  }

  return returnedPoints.map((point, index) => {
    const fallback = fallbackPoints[index] ?? {};
    return {
      ...fallback,
      ...point,
      hit: Boolean(point.hit),
      awardedScore: Number(point.awardedScore ?? point.score ?? 0) || 0,
      maxScore: Number(point.maxScore ?? point.score ?? fallback.maxScore ?? fallback.score ?? 0) || 0,
      score: Number(point.score ?? point.maxScore ?? fallback.score ?? 0) || 0,
    };
  });
};

const sumRubricAwardedScores = (rubricPoints) =>
  normalizeRubricPoints(rubricPoints).reduce((sum, point) => sum + Math.max(0, Number(point.awardedScore ?? 0) || 0), 0);

const syncPositiveAnswerMarkScoresWithRubricPoints = ({ answerMarks, rubricPoints }) => {
  const normalizedMarks = Array.isArray(answerMarks) ? answerMarks : [];
  const positiveMarks = normalizedMarks.filter((mark) => mark.status === "score" || mark.status === "correct");
  if (!positiveMarks.length) {
    return normalizedMarks;
  }

  const awardedScores = normalizeRubricPoints(rubricPoints)
    .filter((point) => point.hit && Number(point.awardedScore ?? 0) > 0)
    .map((point) => Math.max(0, Number(point.awardedScore ?? 0) || 0));
  const totalAwardedScore = awardedScores.reduce((sum, item) => sum + item, 0);
  const totalPositiveScore = positiveMarks.reduce((sum, mark) => sum + Math.max(0, Number(mark.score ?? 0) || 0), 0);

  if (!totalAwardedScore || totalPositiveScore === totalAwardedScore) {
    return normalizedMarks;
  }

  const nextScores = [...awardedScores];
  return normalizedMarks.map((mark) => {
    if (mark.status !== "score" && mark.status !== "correct") {
      return mark;
    }

    const nextScore = nextScores.length > 0 ? nextScores.shift() : 0;
    return {
      ...mark,
      status: "score",
      score: nextScore,
    };
  });
};

const normalizeReturnedAiSubQuestion = ({ item, fallback, index, runtimeConfig }) => {
  const maxScore = Number(fallback.maxScore ?? 0) || 0;
  const rawRubricPoints = Array.isArray(item?.rubricPoints) ? item.rubricPoints : Array.isArray(item?.rubric_points) ? item.rubric_points : [];
  const rawMissedPoints = Array.isArray(item?.missedPoints) ? item.missedPoints : Array.isArray(item?.missed_points) ? item.missed_points : [];
  const rawAnswerMarks = Array.isArray(item?.answerMarks) ? item.answerMarks : Array.isArray(item?.answer_marks) ? item.answer_marks : null;
  const rawScore = Number(item?.score ?? item?.awardedScore ?? item?.awarded_score);
  if (!Number.isInteger(rawScore) || rawScore < 0 || rawScore > maxScore) {
    throw createHttpError(`批改返回的小问分数不合法：${fallback.title || fallback.id || "unknown"}`, 502);
  }
  const score = clampScore(rawScore, 0, maxScore);
  const answerMarks = normalizeAndValidateAiAnswerMarks({
    rawAnswerMarks,
    answerText: fallback.answer,
    answerSegments: fallback.answerSegments,
    title: fallback.title || fallback.id,
  });
  const rubricPoints = normalizeAiRubricPointsWithFallback({ rawRubricPoints, fallbackRubricPoints: fallback.rubricPoints });
  const normalizedScore = clampScore(sumRubricAwardedScores(rubricPoints) || score, 0, maxScore);
  const syncedAnswerMarks = syncPositiveAnswerMarkScoresWithRubricPoints({
    answerMarks,
    rubricPoints,
  });

  return {
    id: fallback.id,
    title: fallback.title,
    answer: fallback.answer,
    score: normalizedScore,
    maxScore,
    reviewComment: `${item?.reviewComment ?? item?.review_comment ?? item?.comment ?? ""}`.trim() || buildSubjectiveReviewComment({
      answerText: fallback.answer,
      score,
      maxScore,
      title: fallback.title,
      missedPoints: normalizeMissedPoints(rawMissedPoints),
    }),
    referenceAnswer: `${item?.referenceAnswer ?? item?.reference_answer ?? fallback.referenceAnswer ?? ""}`.trim(),
    reviewSource: "ai",
    reviewProvider: "openai-compatible",
    abilityLabel: `${item?.abilityLabel ?? item?.ability_label ?? fallback.abilityLabel ?? fallback.title ?? ""}`.trim(),
    missedPoints: normalizeMissedPoints(rawMissedPoints),
    answerMarks: syncedAnswerMarks,
    rubricGuidance: `${item?.rubricGuidance ?? item?.rubric_guidance ?? fallback.rubricGuidance ?? ""}`.trim(),
    rubricPoints,
    skippedReview: Boolean(item?.skippedReview ?? item?.skipped_review ?? false),
    skippedReviewReason: `${item?.skippedReviewReason ?? item?.skipped_review_reason ?? ""}`.trim(),
  };
};

const findReturnedAiSubQuestion = ({ returnedSubQuestions, fallback, index }) => {
  const candidates = new Set([fallback.id, `sub_${index + 1}`, `${index + 1}`].map((item) => `${item ?? ""}`.trim()).filter(Boolean));
  return (
    returnedSubQuestions.find((item) =>
      [`${item?.id ?? ""}`, `${item?.subQuestionId ?? ""}`, `${item?.sub_question_id ?? ""}`, `${item?.questionId ?? ""}`, `${item?.question_id ?? ""}`]
        .map((value) => value.trim())
        .some((value) => candidates.has(value)),
    ) ?? returnedSubQuestions[index] ?? null
  );
};

const buildAnswerReferenceSegments = (answerText) => {
  const answerValue = `${answerText ?? ""}`;
  if (!answerValue.trim()) return [];

  const splitPattern = /[^。！？!?；;\n]+[。！？!?；;]?/gu;
  const segments = [];
  for (const match of answerValue.matchAll(splitPattern)) {
    const rawText = match[0] ?? "";
    const rawStart = match.index ?? 0;
    const rawEnd = rawStart + rawText.length;
    const range = trimWhitespaceRange(answerValue, rawStart, rawEnd);
    const text = answerValue.slice(range.start, range.end);
    if (text) segments.push({ start: range.start, end: range.end, text });
  }

  if (segments.length === 0) {
    const range = trimWhitespaceRange(answerValue, 0, answerValue.length);
    const text = answerValue.slice(range.start, range.end);
    if (text) segments.push({ start: range.start, end: range.end, text });
  }

  const seen = new Set();
  return segments
    .filter((segment) => {
      const key = `${segment.start}:${segment.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80)
    .map((segment, index) => ({ id: `seg_${index + 1}`, ...segment }));
};

const buildAiReviewPrompt = ({ question, answer, runtimeConfig }) => {
  const questionMeta = getQuestionMeta(question);
  const answerMap = parseSubjectiveAnswerMap(answer?.answerJson, question);
  const subQuestionRubrics = questionMeta.subQuestions.map((item, index) =>
    [
      `小问${index + 1}：${item.title}`,
      `分值：${getSubjectiveMaxScore(question, item, questionMeta.subQuestions.length)}`,
      item.referenceAnswer ? `参考答案：${item.referenceAnswer}` : "",
      item.rubricGuidance ? `批改说明：${item.rubricGuidance}` : "",
      item.rubricPoints?.length ? `采分点：${item.rubricPoints.map((point) => `${point.title || point.description || point.id}（${point.score || point.maxScore || 0}分）`).join("；")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  ).join("\n\n");
  const gradingTemplate = `${runtimeConfig?.gradingPrinciplesTemplate ?? ""}`.trim();
  const gradingPrinciples = gradingTemplate
    .split(AI_REVIEW_GRADING_TEMPLATE_PLACEHOLDERS.questionStem)
    .join(question.stem ?? "")
    .split(AI_REVIEW_GRADING_TEMPLATE_PLACEHOLDERS.material)
    .join(question.material ? `材料：${question.material}` : "")
    .split(AI_REVIEW_GRADING_TEMPLATE_PLACEHOLDERS.analysis)
    .join(question.analysis ? `参考解析：${question.analysis}` : "")
    .split(AI_REVIEW_GRADING_TEMPLATE_PLACEHOLDERS.subQuestionRubrics)
    .join(subQuestionRubrics)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const outputRequirements = `${runtimeConfig?.outputRequirementsPrompt ?? ""}`.trim();

  const questionData = JSON.stringify(
    {
      questionId: question.id,
      stem: question.stem,
      material: question.material ?? "",
      subQuestions: questionMeta.subQuestions.map((item, index) => ({
        id: item.id,
        sequenceId: `sub_${index + 1}`,
        title: item.title,
        maxScore: getSubjectiveMaxScore(question, item, questionMeta.subQuestions.length),
        answer: answerMap[item.id] ?? "",
        answerSegments: buildAnswerReferenceSegments(answerMap[item.id] ?? ""),
      })),
    },
    null,
    2,
  );

  const template = `${runtimeConfig?.userPromptTemplate ?? ""}`.trim();
  const missingPlaceholders = getMissingMockExamAiReviewPromptTemplatePlaceholders(template);
  if (missingPlaceholders.length > 0) {
    throw createHttpError(`AI批改提示词模板缺少必要占位符：${missingPlaceholders.join("、")}`, 400);
  }

  return template
    .split(AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS.gradingPrinciples)
    .join(gradingPrinciples)
    .split(AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS.outputRequirements)
    .join(outputRequirements)
    .split(AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS.questionData)
    .join(questionData);
};

const requestOpenAiCompatibleReviewOnce = async ({ runtimeConfig, question, answer }) => {
  const endpoint = `${`${runtimeConfig.baseUrl ?? ""}`.replace(/\/+$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timeoutMs = Math.max(0, Number(runtimeConfig.timeoutMs ?? 120000) || 0);
  const maxTokens = Math.max(0, Number(runtimeConfig.maxTokens ?? 0) || 0);
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const requestBody = {
      model: runtimeConfig.model,
      temperature: Number(runtimeConfig.temperature ?? 0.2),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${runtimeConfig.systemPrompt ?? ""}`.trim(),
        },
        {
          role: "user",
          content: buildAiReviewPrompt({ question, answer, runtimeConfig }),
        },
      ],
    };
    if (maxTokens > 0) {
      requestBody.max_tokens = maxTokens;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtimeConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const rawText = await response.text();
    const contentType = `${response.headers?.get?.("content-type") ?? ""}`.toLowerCase();
    const payload = parseJsonSafely(rawText, null);
    const remoteErrorMessage = payload?.error?.message || payload?.message || payload?.msg || "";
    if (!response.ok) {
      throw createHttpError(remoteErrorMessage ? `批改请求失败：${response.status}，${remoteErrorMessage}` : `批改请求失败：${response.status}`, 502);
    }
    if (contentType.includes("text/html") || rawText.trim().toLowerCase().startsWith("<!doctype html") || rawText.trim().toLowerCase().startsWith("<html")) {
      throw createHttpError("远程批改返回了 HTML 页面，请检查 AI 厂商的 Base URL 是否填写成了 API 地址。", 502);
    }
    if (!payload || typeof payload !== "object") {
      throw createHttpError("远程批改返回的不是合法 JSON，请检查当前厂商接口是否兼容 OpenAI Chat Completions。", 502);
    }

    const completionTexts = extractCompletionTexts(payload);
    let parsed = extractDirectAiReviewPayload(payload);
    if (!parsed) {
      for (const text of completionTexts) {
        const candidate = extractJsonPayload(text);
        if (candidate && Array.isArray(candidate.subQuestions ?? candidate.sub_questions)) {
          parsed = candidate;
          break;
        }
      }
    }
    if (!parsed || !Array.isArray(parsed.subQuestions ?? parsed.sub_questions)) {
      throw createHttpError(
        `批改返回结果不是有效 JSON，缺少 subQuestions。AI返回预览：${truncateForErrorMessage(completionTexts[0] || rawText)}`,
        502,
      );
    }
    return parsed;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createHttpError(`远程批改超时，当前超时设置为 ${timeoutMs}ms，请调大超时时间后重试`, 504);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const requestOpenAiCompatibleReview = async ({ runtimeConfig, question, answer }) => {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestOpenAiCompatibleReviewOnce({ runtimeConfig, question, answer });
    } catch (error) {
      lastError = error;
      const message = `${error instanceof Error ? error.message : String(error)}`.toLowerCase();
      const retriable =
        message.includes("json") ||
        message.includes("unexpected end") ||
        message.includes("fetch failed") ||
        message.includes("terminated");

      if (!retriable || attempt >= 1) {
        throw error;
      }
    }
  }

  throw lastError || createHttpError("远程批改调用失败", 502);
};

const buildSubjectiveReviewJson = async ({ question, answer, runtimeConfig }) => {
  if (!isOpenAiCompatibleProvider(runtimeConfig)) {
    return buildRuleBasedSubjectiveReviewJson({ question, answer });
  }
  if (!isOpenAiCompatibleReady(runtimeConfig)) {
    throw createHttpError("远程批改配置不完整，无法执行批改", 400);
  }

  const parsed = await requestOpenAiCompatibleReview({ runtimeConfig, question, answer });
  const questionMeta = getQuestionMeta(question);
  const answerMap = parseSubjectiveAnswerMap(answer?.answerJson, question);
  const returnedSubQuestions = Array.isArray(parsed.subQuestions) ? parsed.subQuestions : parsed.sub_questions;
  const subQuestions = questionMeta.subQuestions.map((item, index) => {
    const fallback = {
      ...item,
      answer: answerMap[item.id] ?? "",
      answerSegments: buildAnswerReferenceSegments(answerMap[item.id] ?? ""),
      maxScore: getSubjectiveMaxScore(question, item, questionMeta.subQuestions.length),
    };
    const returned = findReturnedAiSubQuestion({ returnedSubQuestions, fallback, index });
    if (!returned) {
      throw createHttpError(`批改返回缺少小问结果：${item.title || item.id}`, 502);
    }
    return normalizeReturnedAiSubQuestion({ item: returned, fallback, index, runtimeConfig });
  });

  return {
    source: "ai",
    reviewSource: "ai",
    reviewProvider: "openai-compatible",
    totalScore: subQuestions.reduce((sum, item) => sum + Number(item.score ?? 0), 0),
    maxScore: Number(question?.score ?? 0) || subQuestions.reduce((sum, item) => sum + Number(item.maxScore ?? 0), 0),
    reviewVoiceUrl: "",
    reviewVoiceObjectKey: "",
    reviewVoiceDurationSeconds: 0,
    feedbackStars: Number(parseJsonSafely(answer?.reviewJson, null)?.feedbackStars ?? 0) || 0,
    feedbackSubmittedAt: parseJsonSafely(answer?.reviewJson, null)?.feedbackSubmittedAt ?? null,
    subQuestions,
  };
};

export const autoReviewMockExamRecord = async ({ db, recordId, adminId = "", currentTime = new Date(), runtimeConfig = {} }) => {
  const normalizedAdminId = `${adminId ?? ""}`.trim();
  const record = await getRecordWithPaper(db, recordId);
  if (!record) {
    throw createHttpError("è€ƒè¯•è®°å½•ä¸å­˜åœ¨", 404);
  }

  if (record.status !== "submitted") {
    throw createHttpError("è¯¥è€ƒè¯•è®°å½•å°šæœªäº¤å·", 409);
  }

  const paper = getRecordPaper(record);
  const subjectiveQuestions = (paper?.questions ?? []).filter((question) => isSubjectiveQuestion(question));
  if (!subjectiveQuestions.length) {
    if (["ai_pending", "ai_processing"].includes(`${record.reviewWorkflowStatus ?? ""}`.trim())) {
      await db.mockExamRecord.update({
        where: { id: record.id },
        data: {
          reviewWorkflowStatus: "not_required",
          aiReviewStartedAt: null,
          aiReviewFinishedAt: currentTime,
          aiReviewNextRetryAt: null,
          aiReviewRetryCount: 0,
          lastAiReviewError: null,
          publishedAt: record.publishedAt ?? currentTime,
        },
      });
    }
    return record;
  }

  const workflowStatus = `${record.reviewWorkflowStatus ?? ""}`.trim();
  if (!["ai_pending", "ai_processing"].includes(workflowStatus)) {
    return record;
  }
  const hasPublishedSnapshot = (record.answers ?? []).some((answer) => answer.publishedReviewJson);

  await db.$transaction(async (tx) => {
    const latestRecord = await tx.mockExamRecord.findUnique({
      where: { id: record.id },
      select: {
        id: true,
        status: true,
        reviewWorkflowStatus: true,
        manualReviewerId: true,
        manualReviewLockToken: true,
        manualReviewLockExpiresAt: true,
      },
    });

    if (!latestRecord) {
      throw createHttpError("è€ƒè¯•è®°å½•ä¸å­˜åœ¨", 404);
    }
    if (latestRecord.status !== "submitted") {
      throw createHttpError("è¯¥è€ƒè¯•è®°å½•çŠ¶æ€å·²å˜åŒ–ï¼Œè¯·åˆ·æ–°åŽé‡è¯•", 409);
    }
    if (!["ai_pending", "ai_processing"].includes(`${latestRecord.reviewWorkflowStatus ?? ""}`.trim())) {
      throw createHttpError("è¯¥è®°å½•ä¸åœ¨AI批改队列中", 409);
    }

    const lockToken = `${latestRecord.manualReviewLockToken ?? ""}`.trim();
    const reviewerId = `${latestRecord.manualReviewerId ?? ""}`.trim();
    const lockExpiresAt = latestRecord.manualReviewLockExpiresAt ? new Date(latestRecord.manualReviewLockExpiresAt) : null;
    const hasActiveLock = Boolean(
      lockToken &&
        reviewerId &&
        lockExpiresAt &&
        Number.isFinite(lockExpiresAt.getTime()) &&
        lockExpiresAt.getTime() > currentTime.getTime(),
    );
    if (hasActiveLock && reviewerId !== normalizedAdminId) {
      throw createHttpError("该试卷已被人工领取，本次自动批改已终止", 409);
    }

    await tx.mockExamRecord.update({
      where: { id: record.id },
      data: {
        reviewWorkflowStatus: "ai_processing",
        aiReviewStartedAt: currentTime,
        aiReviewFinishedAt: null,
        aiReviewNextRetryAt: null,
        lastAiReviewError: null,
      },
    });
  });

  const answerMap = new Map((record.answers ?? []).map((answer) => [answer.questionId, answer]));
  const reviewUpdates = [];
  let subjectiveTotalScore = 0;
  for (const question of subjectiveQuestions) {
    const existingAnswer = answerMap.get(question.id) ?? null;
    const reviewJson = await buildSubjectiveReviewJson({ question, answer: existingAnswer, runtimeConfig });
    const score = clampScore(reviewJson.totalScore, 0, Number(question.score ?? reviewJson.maxScore ?? 0) || 0);
    subjectiveTotalScore += score;
    reviewUpdates.push({
      questionId: question.id,
      answerId: existingAnswer?.id ?? "",
      score,
      reviewJson: JSON.stringify(reviewJson),
    });
  }

  const objectiveScore = (paper?.questions ?? [])
    .filter((question) => !isSubjectiveQuestion(question))
    .reduce((sum, question) => sum + Number(answerMap.get(question.id)?.score ?? 0), 0);

  await db.$transaction(async (tx) => {
    const latestRecord = await tx.mockExamRecord.findUnique({
      where: { id: record.id },
      select: {
        id: true,
        status: true,
        manualReviewerId: true,
        manualReviewLockToken: true,
        manualReviewLockExpiresAt: true,
      },
    });

    if (!latestRecord) {
      throw createHttpError("è€ƒè¯•è®°å½•ä¸å­˜åœ¨", 404);
    }
    if (latestRecord.status !== "submitted") {
      throw createHttpError("è¯¥è€ƒè¯•è®°å½•çŠ¶æ€å·²å˜åŒ–ï¼Œè¯·åˆ·æ–°åŽé‡è¯•", 409);
    }
    const lockToken = `${latestRecord.manualReviewLockToken ?? ""}`.trim();
    const reviewerId = `${latestRecord.manualReviewerId ?? ""}`.trim();
    const lockExpiresAt = latestRecord.manualReviewLockExpiresAt ? new Date(latestRecord.manualReviewLockExpiresAt) : null;
    const hasActiveLock = Boolean(
      lockToken &&
        reviewerId &&
        lockExpiresAt &&
        Number.isFinite(lockExpiresAt.getTime()) &&
        lockExpiresAt.getTime() > currentTime.getTime(),
    );
    if (hasActiveLock && reviewerId !== normalizedAdminId) {
      throw createHttpError("该试卷已被人工领取，本次自动批改已终止", 409);
    }

    for (const item of reviewUpdates) {
      if (item.answerId) {
        const existingAnswer = answerMap.get(item.questionId);
        const shouldSeedPublishedSnapshot = !hasPublishedSnapshot && Boolean(record.publishedAt && existingAnswer?.reviewJson);
        await tx.mockExamAnswer.update({
          where: { id: item.answerId },
          data: {
            score: item.score,
            reviewJson: item.reviewJson,
            ...(shouldSeedPublishedSnapshot
              ? {
                  publishedReviewJson: existingAnswer.reviewJson,
                  publishedScore: Number(existingAnswer.score ?? 0) || 0,
                }
              : {}),
          },
        });
      } else {
        await tx.mockExamAnswer.create({
          data: {
            recordId: record.id,
            questionId: item.questionId,
            answerJson: "{}",
            score: item.score,
            reviewJson: item.reviewJson,
          },
        });
      }
    }

    await tx.mockExamRecord.update({
      where: { id: record.id },
      data: {
        totalScore: objectiveScore + subjectiveTotalScore,
        reviewWorkflowStatus: "manual_pending",
        reviewedAt: currentTime,
        publishedAt: null,
        aiReviewFinishedAt: currentTime,
        aiReviewNextRetryAt: null,
        aiReviewRetryCount: 0,
        lastAiReviewError: null,
        manualReviewVersion: {
          increment: 1,
        },
      },
    });

    return getRecordWithPaper(tx, record.id);
  });
};

const getRecordWithPaper = (db, recordId) =>
  db.mockExamRecord.findUnique({
    where: { id: recordId },
    include: {
      answers: true,
      paper: {
        include: {
          questions: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            include: {
              options: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
  });

const assertMockExamPaperPermission = async ({ db, userId, paperId }) => {
  const paper = await db.mockExamPaper.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      seriesId: true,
      permissionRequired: true,
    },
  });

  if (!paper) throw createHttpError("试卷不存在", 404);
  if (!paper.permissionRequired) return null;

  const [paperPermission, seriesPermission] = await Promise.all([
    db.userMockExamPermission.findUnique({
      where: {
        userId_paperId: {
          userId,
          paperId,
        },
      },
    }),
    paper.seriesId
      ? db.userMockExamSeriesPermission.findUnique({
          where: {
            userId_seriesId: {
              userId,
              seriesId: paper.seriesId,
            },
          },
        })
      : null,
  ]);

  if (!paperPermission && !seriesPermission) {
    throw createHttpError("你暂未开通这张试卷", 403);
  }

  return paperPermission;
};

const assertPaperOpened = (paper, currentTime = new Date()) => {
  if (!paper?.openTime) return;
  if (new Date(paper.openTime).getTime() > currentTime.getTime()) {
    throw createHttpError(`该试卷开放时间为 ${formatDateTime(paper.openTime)}，暂未开放`, 403);
  }
};

const buildActiveKey = (paperId, userId) => `${paperId}:${userId}`;

export const syncExpiredMockExamRecords = async ({ db, userId, currentTime = new Date() }) => {
  const records = await db.mockExamRecord.findMany({
    where: {
      userId,
      status: "in_progress",
    },
  });

  for (const record of records) {
    if (getRemainingSeconds(record, currentTime) <= 0) {
      await finalizeMockExamRecord({ db, recordId: record.id, userId, currentTime });
    }
  }
};

export const getMockExamRecordForUser = async ({
  db,
  recordId,
  userId,
  currentTime = new Date(),
  finalizeExpired = true,
  resumePaused = true,
}) => {
  let record = await getRecordWithPaper(db, recordId);

  if (!record || record.userId !== userId) {
    throw createHttpError("考试记录不存在", 404);
  }

  await assertMockExamPaperPermission({ db, userId, paperId: record.paperId });

  if (finalizeExpired && record.status === "in_progress" && getRemainingSeconds(record, currentTime) <= 0) {
    record = await finalizeMockExamRecord({ db, recordId, userId, currentTime });
  }

  if (resumePaused && record.status === "in_progress" && record.isPaused) {
    record = await resumeMockExamRecordIfNeeded({ db, record, currentTime });
  }

  return record;
};

export const pauseMockExamRecord = async ({ db, recordId, userId, currentTime = new Date() }) => {
  const record = await getMockExamRecordForUser({ db, recordId, userId, currentTime, finalizeExpired: true, resumePaused: false });

  if (record.status !== "in_progress") {
    return record;
  }

  if (record.isPaused) {
    return record;
  }

  const consumedSeconds = getBoundedConsumedSeconds(record, currentTime);
  await db.mockExamRecord.update({
    where: { id: record.id },
    data: {
      consumedSeconds,
      isPaused: true,
      startedAt: currentTime,
    },
  });

  return getMockExamRecordForUser({ db, recordId, userId, currentTime, finalizeExpired: false, resumePaused: false });
};

export const startMockExamRecord = async ({ db, paperId, userId, currentTime = new Date() }) => {
  await syncExpiredMockExamRecords({ db, userId, currentTime });

  const permission = await assertMockExamPaperPermission({ db, userId, paperId });
  const paper = await db.mockExamPaper.findFirst({
    where: {
      id: paperId,
      status: "published",
    },
    include: {
      questions: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          options: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  if (!paper) throw createHttpError("试卷不存在", 404);
  assertPaperOpened(paper, currentTime);
  if (!paper.questions.length) {
    throw createHttpError("该试卷暂未配置题目，暂不能开考", 409);
  }

  const activeRecord = await db.mockExamRecord.findFirst({
    where: {
      paperId,
      userId,
      status: "in_progress",
    },
    orderBy: { updatedAt: "desc" },
  });

  if (activeRecord) {
    return getMockExamRecordForUser({ db, recordId: activeRecord.id, userId, currentTime });
  }

  const attemptCount = await db.mockExamRecord.count({ where: { paperId, userId } });
  const permissionAttemptLimit = Number(permission?.manualAttemptLimit ?? 0);
  const permissionAttemptUsed = Number(permission?.manualAttemptUsed ?? 0);
  const maxAttempts = permissionAttemptLimit > 0 ? permissionAttemptLimit : Number(paper.maxAttempts ?? 0);
  const effectiveAttemptCount = permissionAttemptLimit > 0 ? permissionAttemptUsed : attemptCount;

  if (maxAttempts > 0 && effectiveAttemptCount >= maxAttempts) {
    throw createHttpError("该试卷已达到最大考试次数，不能再次进入", 403);
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const record = await tx.mockExamRecord.create({
        data: {
          paperId,
          userId,
          activeKey: buildActiveKey(paperId, userId),
          attemptNo: attemptCount + 1,
          paperSnapshotJson: buildRecordPaperSnapshot(paper),
          questionCount: paper.questions.length,
          allottedSeconds: Math.max(0, Number(paper.durationMinutes ?? 0) * 60),
          startedAt: currentTime,
          isPaused: false,
        },
      });

      if (permission) {
        await tx.userMockExamPermission.update({
          where: {
            userId_paperId: {
              userId,
              paperId,
            },
          },
          data: {
            manualAttemptUsed: permissionAttemptLimit > 0 ? effectiveAttemptCount + 1 : 0,
            currentRecordStartedAt: currentTime,
          },
        });
      }

      return record;
    });

    return getMockExamRecordForUser({ db, recordId: created.id, userId, currentTime });
  } catch (error) {
    if (!isUniqueConstraintError(error, "activeKey")) throw error;

    const existing = await db.mockExamRecord.findFirst({
      where: {
        activeKey: buildActiveKey(paperId, userId),
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!existing) throw error;
    return getMockExamRecordForUser({ db, recordId: existing.id, userId, currentTime });
  }
};

export const saveMockExamAnswer = async ({ db, recordId, userId, questionId, answerKeys, answerText, subQuestionId, currentTime = new Date() }) => {
  const currentRecord = await getMockExamRecordForUser({ db, recordId, userId, currentTime, finalizeExpired: true });

  if (currentRecord.status !== "in_progress") {
    throw createHttpError("本次考试已交卷，不能继续作答", 409);
  }

  return db.$transaction(async (tx) => {
    const record = await getRecordWithPaper(tx, recordId);
    if (!record || record.userId !== userId) {
      throw createHttpError("考试记录不存在", 404);
    }

    const paper = getRecordPaper(record);
    const question = (paper.questions ?? []).find((item) => item.id === questionId);
    if (!question) throw createHttpError("题目不存在", 404);

    const existingAnswer = (record.answers ?? []).find((item) => item.questionId === questionId);

    if (isSubjectiveQuestion(question)) {
      const questionMeta = getQuestionMeta(question);
      const targetSubQuestionId = `${subQuestionId ?? questionMeta.subQuestions[0]?.id ?? ""}`.trim();
      if (!targetSubQuestionId) throw createHttpError("缺少主观题小问参数", 400);
      if (!questionMeta.subQuestions.some((item) => item.id === targetSubQuestionId)) {
        throw createHttpError("主观题小问不存在", 404);
      }

      const nextAnswerMap = parseSubjectiveAnswerMap(existingAnswer?.answerJson, question);
      const nextText = normalizePlainText(answerText);
      if (nextText) nextAnswerMap[targetSubQuestionId] = nextText;
      else delete nextAnswerMap[targetSubQuestionId];

      if (Object.values(nextAnswerMap).some(Boolean)) {
        if (existingAnswer) {
          await tx.mockExamAnswer.update({
            where: { id: existingAnswer.id },
            data: {
              answerJson: JSON.stringify(nextAnswerMap),
              isCorrect: null,
            },
          });
        } else {
          await tx.mockExamAnswer.create({
            data: {
              recordId,
              questionId,
              answerJson: JSON.stringify(nextAnswerMap),
            },
          });
        }
      } else if (existingAnswer) {
        await tx.mockExamAnswer.delete({ where: { id: existingAnswer.id } });
      }
    } else {
      const nextAnswerKeys = normalizeAnswerKeys(answerKeys);
      const validOptionKeys = new Set((question.options ?? []).map((item) => item.optionKey));

      if (questionTypeMeta[question.type]?.maxSelections === 1 && nextAnswerKeys.length > 1) {
        throw createHttpError("单选题只能选择一个答案", 400);
      }

      if (nextAnswerKeys.some((item) => !validOptionKeys.has(item))) {
        throw createHttpError("答案选项不合法", 400);
      }

      if (nextAnswerKeys.length === 0) {
        if (existingAnswer) await tx.mockExamAnswer.delete({ where: { id: existingAnswer.id } });
      } else if (existingAnswer) {
        await tx.mockExamAnswer.update({
          where: { id: existingAnswer.id },
          data: {
            answerJson: JSON.stringify(nextAnswerKeys),
            isCorrect: null,
            score: 0,
          },
        });
      } else {
        await tx.mockExamAnswer.create({
          data: {
            recordId,
            questionId,
            answerJson: JSON.stringify(nextAnswerKeys),
          },
        });
      }
    }

    const refreshedRecord = await getRecordWithPaper(tx, record.id);
    const answeredCount = getAnsweredQuestionCount(getRecordPaper(refreshedRecord)?.questions ?? [], refreshedRecord.answers ?? []);
    await tx.mockExamRecord.update({
      where: { id: record.id },
      data: { answeredCount },
    });

    return getRecordWithPaper(tx, record.id);
  });
};

export const finalizeMockExamRecord = async ({ db, recordId, userId, currentTime = new Date() }) =>
  db.$transaction(async (tx) => {
    const record = await getRecordWithPaper(tx, recordId);
    if (!record || record.userId !== userId) {
      throw createHttpError("考试记录不存在", 404);
    }

    if (record.status === "submitted") {
      return record;
    }

    const paper = getRecordPaper(record);
    const answerMap = new Map((record.answers ?? []).map((item) => [item.questionId, item]));
    let answeredCount = 0;
    let correctCount = 0;
    let totalScore = 0;

    for (const question of paper.questions ?? []) {
      const currentAnswer = answerMap.get(question.id);
      const answerState = getQuestionAnswerState(question, currentAnswer?.answerJson);
      if (answerState === "answered") answeredCount += 1;

      if (isSubjectiveQuestion(question)) {
        if (currentAnswer) {
          await tx.mockExamAnswer.update({
            where: { id: currentAnswer.id },
            data: {
              isCorrect: null,
              score: Number(currentAnswer.score ?? 0),
            },
          });
          totalScore += Number(currentAnswer.score ?? 0);
        }
        continue;
      }

      const userAnswerKeys = parseObjectiveAnswerJson(currentAnswer?.answerJson);
      const correctAnswerKeys = parseObjectiveAnswerJson(question.correctAnswerJson);
      const isCorrect = userAnswerKeys.length > 0 && isSameAnswer(userAnswerKeys, correctAnswerKeys);
      const score = isCorrect ? Number(question.score ?? 0) : 0;
      if (isCorrect) {
        correctCount += 1;
        totalScore += score;
      }

      if (currentAnswer) {
        await tx.mockExamAnswer.update({
          where: { id: currentAnswer.id },
          data: {
            isCorrect,
            score,
          },
        });
      }
    }

    const reviewAttemptLimit = Number(paper.reviewAttemptLimit ?? 0);
    const requiresReview =
      Boolean(paper.reviewEnabled) &&
      (paper.questions ?? []).some((question) => isSubjectiveQuestion(question)) &&
      (reviewAttemptLimit <= 0 || Number(record.attemptNo ?? 0) <= reviewAttemptLimit);
    const nextReviewWorkflowStatus = requiresReview ? "ai_pending" : "not_required";

    await tx.mockExamRecord.update({
      where: { id: record.id },
      data: {
        activeKey: null,
        status: "submitted",
        reviewWorkflowStatus: nextReviewWorkflowStatus,
        isPaused: false,
        answeredCount,
        correctCount,
        totalScore,
        consumedSeconds: getBoundedConsumedSeconds(record, currentTime),
        submittedAt: currentTime,
        publishedAt: nextReviewWorkflowStatus === "not_required" ? currentTime : null,
      },
    });

    await tx.userMockExamPermission.updateMany({
      where: {
        userId,
        paperId: record.paperId,
      },
      data: {
        currentRecordStartedAt: null,
      },
    });

    return getRecordWithPaper(tx, record.id);
  });

export const saveMockExamReviewFeedback = async ({ db, recordId, userId, questionId, stars, currentTime = new Date() }) =>
  db.$transaction(async (tx) => {
    const record = await getRecordWithPaper(tx, recordId);
    if (!record || record.userId !== userId) {
      throw createHttpError("è€ƒè¯•è®°å½•ä¸å­˜åœ¨", 404);
    }

    if (record.status !== "submitted") {
      throw createHttpError("è¯¥è€ƒè¯•è®°å½•å°šæœªäº¤å·", 409);
    }

    if (!isRecordPublishedToUser(record)) {
      throw createHttpError("批改结果尚未发送，不能提交满意度", 409);
    }

    const paper = getRecordPaper(record);
    const question = (paper?.questions ?? []).find((item) => item.id === questionId);
    if (!question || !isSubjectiveQuestion(question)) {
      throw createHttpError("åªèƒ½å¯¹ä¸»è§‚é¢˜æäº¤æ‰¹æ”¹æ»¡æ„åº¦", 400);
    }

    const normalizedStars = Number(stars);
    if (!Number.isInteger(normalizedStars) || normalizedStars < 1 || normalizedStars > 5) {
      throw createHttpError("æ»¡æ„åº¦è¯„åˆ†å¿…é¡»åœ¨ 1 åˆ° 5 ä¹‹é—´", 400);
    }

    const answer = (record.answers ?? []).find((item) => item.questionId === questionId);
    if (!answer) {
      throw createHttpError("è¯¥é¢˜æš‚æ— ä½œç­”è®°å½•", 404);
    }

    const existingReviewJson = parseJsonSafely(answer.reviewJson, null) ?? {};
    const existingPublishedReviewJson = parseJsonSafely(answer.publishedReviewJson, null) ?? existingReviewJson;
    const nextReviewJson = {
      ...existingReviewJson,
      feedbackStars: normalizedStars,
      feedbackSubmittedAt: currentTime.toISOString(),
    };
    const nextPublishedReviewJson = {
      ...existingPublishedReviewJson,
      feedbackStars: normalizedStars,
      feedbackSubmittedAt: currentTime.toISOString(),
    };

    await tx.mockExamAnswer.update({
      where: { id: answer.id },
      data: {
        reviewJson: JSON.stringify(nextReviewJson),
        publishedReviewJson: JSON.stringify(nextPublishedReviewJson),
      },
    });

    return getRecordWithPaper(tx, record.id);
  });

export const listUserVisibleMockExamPapers = async ({ db, userId, paperType = "", currentTime = new Date() }) => {
  const [seriesPermissionRows, paperPermissionRows] = await Promise.all([
    db.userMockExamSeriesPermission.findMany({
      where: { userId },
      select: { seriesId: true },
    }),
    db.userMockExamPermission.findMany({
      where: { userId },
      select: { paperId: true },
    }),
  ]);
  const visibleSeriesIds = seriesPermissionRows.map((item) => item.seriesId);
  const visiblePaperIds = paperPermissionRows.map((item) => item.paperId);

  const papers = await db.mockExamPaper.findMany({
    where: {
      status: "published",
      OR: [
        { permissionRequired: false },
        {
          permissionRequired: true,
          OR: [
            { id: { in: visiblePaperIds.length > 0 ? visiblePaperIds : ["__no_permission__"] } },
            { seriesId: { in: visibleSeriesIds.length > 0 ? visibleSeriesIds : ["__no_permission__"] } },
          ],
        },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      series: {
        select: {
          id: true,
          name: true,
        },
      },
      questions: {
        where: { isActive: true },
        select: {
          id: true,
          type: true,
          score: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const paperIds = papers.map((paper) => paper.id);
  const records =
    paperIds.length > 0
      ? await db.mockExamRecord.findMany({
          where: {
            userId,
            paperId: { in: paperIds },
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          include: { answers: true },
        })
      : [];

  return papers
    .filter((paper) => isMatchingPaperType(paper, paperType))
    .map((paper) => {
      const paperRecords = records.filter((record) => record.paperId === paper.id);
      const activeRecord = paperRecords.find((record) => record.status === "in_progress") ?? null;
      const latestRecord = paperRecords.find((record) => record.status === "submitted") ?? null;
      return serializeMockExamPaperSummary({ paper, activeRecord, latestRecord, currentTime });
    })
    .filter((paper) => paper.isOpen);
};

export const serializeUserMockExamHistoryItem = (record) => {
  const paper = getRecordPaper(record);
  const subjectiveQuestionCount = (paper?.questions ?? []).filter((question) => isSubjectiveQuestionType(question.type)).length;
  const reviewStatus = getReviewWorkflowStatus(record);
  const reviewEnabled = Boolean(paper?.reviewEnabled) && subjectiveQuestionCount > 0;
  const visibleTotalScore = getVisibleMockExamTotalScore(record);
  return {
    id: record.id,
    status: record.status,
    attemptNo: record.attemptNo,
    totalScore: visibleTotalScore,
    questionCount: Number(record.questionCount ?? 0),
    subjectiveQuestionCount,
    answeredCount: Number(record.answeredCount ?? 0),
    correctCount: Number(record.correctCount ?? 0),
    consumedSeconds: Number(record.consumedSeconds ?? 0),
    reviewStatus,
    reviewEnabled,
    reviewVisibleToUser: record.status === "submitted" && reviewEnabled && reviewStatus !== "published" && reviewStatus !== "not_required",
    submittedAt: record.submittedAt ? formatDateTime(record.submittedAt) : "",
    reviewedAt: record.reviewedAt ? formatDateTime(record.reviewedAt) : "",
    publishedAt: record.publishedAt ? formatDateTime(record.publishedAt) : "",
    paper: {
      id: paper?.id ?? "",
      code: paper?.code ?? "",
      title: paper?.title ?? "",
      coverUrl: getPaperCoverUrl(paper),
      phase: paper?.phase ?? "",
      year: Number(paper?.year ?? 0),
      totalScore: Number(paper?.totalScore ?? 0),
      passScore: Number(paper?.passScore ?? 0),
      paperType: paper?.paperType ?? inferPaperTypeFromQuestions(paper?.questions ?? []),
    },
  };
};

export const listUserVisibleMockExamRecords = async ({ db, userId, paperType = "", currentTime = new Date() }) => {
  const records = await db.mockExamRecord.findMany({
    where: {
      userId,
      status: { in: ["in_progress", "submitted"] },
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    include: {
      answers: true,
      paper: {
        include: {
          questions: {
            where: { isActive: true },
            select: {
              id: true,
              type: true,
              score: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  return records.filter((record) => isMatchingPaperType(getRecordPaper(record), paperType)).filter(isRecordVisibleInUserHistory).map(serializeUserMockExamHistoryItem);
};

const createLeaderboardPaperPayload = (paper) => ({
  id: paper?.id ?? "",
  code: paper?.code ?? "",
  title: paper?.title ?? "",
  phase: paper?.phase ?? "",
  year: Number(paper?.year ?? 0),
  coverUrl: getPaperCoverUrl(paper),
  totalScore: Number(paper?.totalScore ?? 0),
  passScore: Number(paper?.passScore ?? 0),
  questionCount: Number(paper?.questionCount ?? 0) || (paper?.questions ?? []).length,
  paperType: paper?.paperType ?? inferPaperTypeFromQuestions(paper?.questions ?? []),
});

const normalizeManualRankValue = (value) => {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const buildMockExamLeaderboardRows = (records = [], leaderboardEntries = [], currentUserId = "") => {
  const bestByUser = new Map();

  records.forEach((record) => {
    const userId = `${record?.userId ?? record?.user?.id ?? ""}`.trim();
    if (!userId) return;

    const existing = bestByUser.get(userId);
    const nextScore = Number(record?.totalScore ?? 0);
    const nextSubmittedAt = record?.submittedAt ? new Date(record.submittedAt).getTime() : 0;
    const existingScore = existing ? Number(existing.totalScore ?? 0) : Number.NEGATIVE_INFINITY;
    const existingSubmittedAt = existing?.submittedAt ? new Date(existing.submittedAt).getTime() : Number.POSITIVE_INFINITY;

    if (!existing || nextScore > existingScore || (nextScore === existingScore && nextSubmittedAt < existingSubmittedAt)) {
      bestByUser.set(userId, record);
    }
  });

  const manualRankMap = new Map(
    (Array.isArray(leaderboardEntries) ? leaderboardEntries : []).map((item) => [`${item?.userId ?? ""}`.trim(), normalizeManualRankValue(item?.manualRank)]),
  );

  return Array.from(bestByUser.values())
    .map((record) => {
      const userId = `${record?.userId ?? record?.user?.id ?? ""}`.trim();
      return {
        userId,
        userPhone: `${record?.user?.phone ?? ""}`.trim(),
        score: getVisibleMockExamTotalScore(record),
        submittedAt: record?.submittedAt ? formatDateTime(record.submittedAt) : "",
        submittedAtMs: record?.submittedAt ? new Date(record.submittedAt).getTime() : Number.MAX_SAFE_INTEGER,
        attemptNo: Number(record?.attemptNo ?? 0),
        manualRank: manualRankMap.get(userId) ?? null,
        isCurrentUser: Boolean(currentUserId) && userId === currentUserId,
      };
    })
    .sort((left, right) => {
      const leftManualRank = left.manualRank ?? Number.MAX_SAFE_INTEGER;
      const rightManualRank = right.manualRank ?? Number.MAX_SAFE_INTEGER;
      if (leftManualRank !== rightManualRank) return leftManualRank - rightManualRank;
      if (left.score !== right.score) return right.score - left.score;
      if (left.submittedAtMs !== right.submittedAtMs) return left.submittedAtMs - right.submittedAtMs;
      return left.userId.localeCompare(right.userId);
    })
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
};

export const listUserVisibleMockExamLeaderboardPapers = async ({ db, userId }) => {
  const records = await db.mockExamRecord.findMany({
    where: {
      userId,
      status: "submitted",
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    include: {
      answers: true,
      paper: {
        include: {
          questions: {
            where: { isActive: true },
            select: { id: true, type: true, score: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  const paperMap = new Map();
  records.forEach((record) => {
    if (!isRecordPublishedToUser(record)) return;
    const paper = getRecordPaper(record);
    if (!paper?.id || paperMap.has(paper.id)) return;
    paperMap.set(paper.id, createLeaderboardPaperPayload(paper));
  });

  return Array.from(paperMap.values()).sort((left, right) => {
    if ((left.year ?? 0) !== (right.year ?? 0)) return Number(right.year ?? 0) - Number(left.year ?? 0);
    return `${left.title ?? ""}`.localeCompare(`${right.title ?? ""}`, "zh-CN");
  });
};

export const getUserMockExamLeaderboardDetail = async ({ db, userId, paperId }) => {
  const normalizedPaperId = `${paperId ?? ""}`.trim();
  if (!normalizedPaperId) throw createHttpError("缺少排行榜参数", 400);

  const paper = await db.mockExamPaper.findUnique({
    where: { id: normalizedPaperId },
    include: {
      questions: {
        where: { isActive: true },
        select: { id: true, type: true, score: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!paper) throw createHttpError("试卷不存在", 404);

  const records = await db.mockExamRecord.findMany({
    where: {
      paperId: normalizedPaperId,
      status: "submitted",
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    include: {
      answers: true,
      user: {
        select: {
          id: true,
          phone: true,
        },
      },
      paper: {
        include: {
          questions: {
            where: { isActive: true },
            select: { id: true, type: true, score: true },
          },
        },
      },
    },
  });

  const currentUserRecords = records.filter((record) => record.userId === userId);
  if (currentUserRecords.length === 0) {
    throw createHttpError("你还没有参加过该试卷，暂时无法进入排行榜", 403);
  }

  const leaderboardEntries = await db.mockExamLeaderboardEntry.findMany({
    where: { paperId: normalizedPaperId },
    select: {
      userId: true,
      manualRank: true,
    },
  });

  const leaderboard = buildMockExamLeaderboardRows(records.filter(isRecordPublishedToUser), leaderboardEntries, userId);
  const currentUserEntry = leaderboard.find((item) => item.userId === userId) ?? null;

  return {
    paper: createLeaderboardPaperPayload(paper),
    currentUserBestScore: currentUserEntry ? Number(currentUserEntry.score ?? 0) : null,
    currentUserBestRank: currentUserEntry ? Number(currentUserEntry.rank ?? 0) : null,
    totalParticipants: leaderboard.length,
    leaderboard: leaderboard.map((item) => ({
      rank: item.rank,
      manualRank: item.manualRank,
      userId: item.userId,
      userPhone: item.userPhone,
      score: item.score,
      submittedAt: item.submittedAt,
      attemptNo: item.attemptNo,
      isCurrentUser: item.isCurrentUser,
    })),
  };
};

export const getRecentMockExamForUser = async ({ db, userId, currentTime = new Date() }) => {
  const record = await db.mockExamRecord.findFirst({
    where: {
      userId,
      OR: [{ status: "in_progress" }, { status: "submitted" }],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      answers: true,
      paper: {
        include: {
          questions: {
            where: { isActive: true },
            select: {
              id: true,
              type: true,
              score: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!record) return null;

  const paper = getRecordPaper(record);
  return {
    paperId: record.paperId,
    paperTitle: paper?.title ?? "",
    paperSubtitle: paper?.subtitle ?? "",
    recordId: record.id,
    status: record.status,
    totalScore: getVisibleMockExamTotalScore(record),
    answeredCount: Number(record.answeredCount ?? 0),
    questionCount: Number(record.questionCount ?? 0),
    canResume: record.status === "in_progress" && getRemainingSeconds(record, currentTime) > 0,
    startedAt: record.startedAt ? formatDateTime(record.startedAt) : "",
    submittedAt: record.submittedAt ? formatDateTime(record.submittedAt) : "",
  };
};
