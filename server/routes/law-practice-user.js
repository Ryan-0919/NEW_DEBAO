import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { normalizeDisplayText } from "../lib/text.js";
import { requireUserAuth } from "../middleware/auth.js";

export const lawPracticeUserRouter = Router();
lawPracticeUserRouter.use(requireUserAuth);

const stripHtml = (value = "") =>
  normalizeDisplayText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");

const normalizeAnswerText = (value = "") => stripHtml(value).replace(/\s+/g, "").trim();

const isArticleNoMatched = (answer = "", standard = "") =>
  normalizeDisplayText(answer).replace(/\s+/g, "").toLowerCase() === normalizeDisplayText(standard).replace(/\s+/g, "").toLowerCase();

const isTextMatched = (answer = "", standard = "") => {
  const normalizedAnswer = normalizeAnswerText(answer);
  const normalizedStandard = normalizeAnswerText(standard);
  return Boolean(normalizedAnswer && normalizedStandard && normalizedAnswer.includes(normalizedStandard));
};

const getCurrentStandardText = (question, sourceLawMap) => {
  const sourceLawId = Number(question?.sourceLawId ?? 0);
  if (sourceLawId > 0) {
    const source = sourceLawMap?.get(sourceLawId);
    if (source?.content) return source.content;
  }
  return question?.standardText ?? "";
};

const serializePaperSummary = (paper) => ({
  id: paper.id,
  code: paper.code,
  title: paper.title,
  description: paper.description ?? "",
  questionCount: paper._count?.questions ?? paper.questions?.length ?? 0,
  latestRecord: paper.records?.[0]
    ? {
        id: paper.records[0].id,
        status: paper.records[0].status,
        startedAt: paper.records[0].startedAt,
        submittedAt: paper.records[0].submittedAt,
      }
    : null,
});

const serializeQuestionForRecord = ({ item, answer, submitted, sourceLawMap }) => {
  const question = item.question ?? item;
  const currentStandardText = getCurrentStandardText(question, sourceLawMap);
  const payload = {
    id: question.id,
    title: question.title,
    prompt: question.prompt,
    lawName: question.lawName,
    sortOrder: Number(item.sortOrder ?? question.sortOrder ?? 0),
    answer: answer
      ? {
          id: answer.id,
          articleNo: answer.articleNo ?? "",
          answerText: answer.answerText ?? "",
          updatedAt: answer.updatedAt,
        }
      : null,
  };

  if (submitted) {
    payload.standardAnswer = {
      articleNo: question.articleNo,
      standardText: currentStandardText,
      explanation: question.explanation ?? "",
    };
    payload.result = {
      articleNoMatched: isArticleNoMatched(answer?.articleNo ?? "", question.articleNo),
      textMatched: isTextMatched(answer?.answerText ?? "", currentStandardText),
    };
  }

  return payload;
};

const buildSourceLawMapForRecord = async (record) => {
  const sourceLawIds = [
    ...new Set(
      (record?.paper?.questions ?? [])
        .map((item) => Number(item.question?.sourceLawId ?? 0))
        .filter((sourceLawId) => Number.isFinite(sourceLawId) && sourceLawId > 0),
    ),
  ];
  if (sourceLawIds.length === 0) return new Map();

  const entries = await prisma.lawEntry.findMany({
    where: { sourceLawId: { in: sourceLawIds } },
    select: { sourceLawId: true, content: true },
  });
  return new Map(entries.map((entry) => [entry.sourceLawId, entry]));
};

const serializeRecord = async (record) => {
  const submitted = record.status === "submitted";
  const answerMap = new Map((record.answers ?? []).map((answer) => [answer.questionId, answer]));
  const paperQuestions = record.paper?.questions ?? [];
  const sourceLawMap = await buildSourceLawMapForRecord(record);

  return {
    id: record.id,
    status: record.status,
    startedAt: record.startedAt,
    submittedAt: record.submittedAt,
    paper: {
      id: record.paper.id,
      code: record.paper.code,
      title: record.paper.title,
      description: record.paper.description ?? "",
      questionCount: paperQuestions.length,
    },
    questions: paperQuestions.map((item) => serializeQuestionForRecord({ item, answer: answerMap.get(item.questionId), submitted, sourceLawMap })),
  };
};

const getRecordForUser = async ({ userId, recordId }) =>
  prisma.lawPracticeRecord.findFirst({
    where: { id: recordId, userId },
    include: {
      paper: {
        include: {
          questions: {
            include: { question: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
      answers: true,
    },
  });

lawPracticeUserRouter.get("/papers", async (req, res) => {
  const papers = await prisma.lawPracticePaper.findMany({
    where: { status: "published", questions: { some: {} } },
    include: {
      _count: { select: { questions: true } },
      records: {
        where: { userId: req.auth.userId },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });

  return ok(res, papers.map(serializePaperSummary));
});

lawPracticeUserRouter.post("/papers/:paperId/start", async (req, res) => {
  const paper = await prisma.lawPracticePaper.findFirst({
    where: { id: req.params.paperId, status: "published" },
    include: { questions: { select: { id: true }, take: 1 } },
  });
  if (!paper || paper.questions.length === 0) return fail(res, "法条练习试卷不存在或未发布", 404);

  const existing = await prisma.lawPracticeRecord.findFirst({
    where: { userId: req.auth.userId, paperId: paper.id, status: "in_progress" },
    orderBy: { updatedAt: "desc" },
  });

  const record =
    existing ??
    (await prisma.lawPracticeRecord.create({
      data: {
        userId: req.auth.userId,
        paperId: paper.id,
      },
    }));

  const fullRecord = await getRecordForUser({ userId: req.auth.userId, recordId: record.id });
  return ok(res, await serializeRecord(fullRecord), existing ? "继续练习" : "练习已开始");
});

lawPracticeUserRouter.get("/records/:recordId", async (req, res) => {
  const record = await getRecordForUser({ userId: req.auth.userId, recordId: req.params.recordId });
  if (!record) return fail(res, "练习记录不存在", 404);
  return ok(res, await serializeRecord(record));
});

lawPracticeUserRouter.put("/records/:recordId/answers/:questionId", async (req, res) => {
  const record = await getRecordForUser({ userId: req.auth.userId, recordId: req.params.recordId });
  if (!record) return fail(res, "练习记录不存在", 404);
  if (record.status === "submitted") return fail(res, "练习已提交，不能继续修改答案", 409);

  const questionIds = new Set(record.paper.questions.map((item) => item.questionId));
  if (!questionIds.has(req.params.questionId)) return fail(res, "题目不属于当前练习试卷", 404);

  const answer = await prisma.lawPracticeAnswer.upsert({
    where: {
      recordId_questionId: {
        recordId: record.id,
        questionId: req.params.questionId,
      },
    },
    update: {
      articleNo: normalizeDisplayText(req.body?.articleNo ?? "").trim() || null,
      answerText: normalizeDisplayText(req.body?.answerText ?? "").trim() || null,
    },
    create: {
      recordId: record.id,
      questionId: req.params.questionId,
      articleNo: normalizeDisplayText(req.body?.articleNo ?? "").trim() || null,
      answerText: normalizeDisplayText(req.body?.answerText ?? "").trim() || null,
    },
  });

  await prisma.lawPracticeRecord.update({ where: { id: record.id }, data: { updatedAt: new Date() } });
  return ok(res, {
    id: answer.id,
    articleNo: answer.articleNo ?? "",
    answerText: answer.answerText ?? "",
    updatedAt: answer.updatedAt,
  });
});

lawPracticeUserRouter.post("/records/:recordId/submit", async (req, res) => {
  const record = await getRecordForUser({ userId: req.auth.userId, recordId: req.params.recordId });
  if (!record) return fail(res, "练习记录不存在", 404);
  if (record.status === "submitted") return ok(res, await serializeRecord(record), "练习已提交");

  const answerMap = new Map(record.answers.map((answer) => [answer.questionId, answer]));
  const missing = record.paper.questions.filter((item) => {
    const answer = answerMap.get(item.questionId);
    return !normalizeDisplayText(answer?.articleNo ?? "").trim() || !normalizeDisplayText(answer?.answerText ?? "").trim();
  });
  if (missing.length > 0) return fail(res, `还有 ${missing.length} 道题未填写条文序号或原文`, 400);

  await prisma.lawPracticeRecord.update({
    where: { id: record.id },
    data: { status: "submitted", submittedAt: new Date() },
  });

  const nextRecord = await getRecordForUser({ userId: req.auth.userId, recordId: record.id });
  return ok(res, await serializeRecord(nextRecord), "练习已提交");
});
