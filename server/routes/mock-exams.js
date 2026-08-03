import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../lib/response.js";
import {
  finalizeMockExamRecord,
  getUserMockExamLeaderboardDetail,
  getMockExamRecordForUser,
  listUserVisibleMockExamLeaderboardPapers,
  listUserVisibleMockExamPapers,
  listUserVisibleMockExamRecords,
  pauseMockExamRecord,
  saveMockExamAnswer,
  saveMockExamReviewFeedback,
  serializeMockExamRecordDetail,
  startMockExamRecord,
  syncExpiredMockExamRecords,
} from "../lib/mock-exams.js";
import { enqueueMockExamAiReview } from "../lib/mock-exam-ai-review-queue.js";
import { getMockExamLaunchConfig } from "../lib/mock-exam-launch-config.js";

export const mockExamRouter = Router();

const enqueueAutoReviewIfNeeded = (record) => {
  if (`${record?.reviewWorkflowStatus ?? ""}`.trim() !== "ai_pending") {
    return;
  }

  void enqueueMockExamAiReview({
    db: prisma,
    recordId: record.id,
  }).catch((error) => {
    console.error("Auto mock exam review failed:", error);
  });
};

mockExamRouter.get("/launch-config", async (_req, res) => {
  try {
    return ok(res, await getMockExamLaunchConfig(prisma));
  } catch (error) {
    return fail(res, error.message || "加载机考启动页配置失败", error.statusCode || 500);
  }
});

mockExamRouter.get("/papers", async (req, res) => {
  try {
    await syncExpiredMockExamRecords({ db: prisma, userId: req.auth.userId });

    return ok(
      res,
      await listUserVisibleMockExamPapers({
        db: prisma,
        userId: req.auth.userId,
        paperType: req.query.paperType,
      }),
    );
  } catch (error) {
    return fail(res, error.message || "加载模拟考试试卷失败", error.statusCode || 500);
  }
});

mockExamRouter.get("/history", async (req, res) => {
  try {
    await syncExpiredMockExamRecords({ db: prisma, userId: req.auth.userId });

    return ok(
      res,
      await listUserVisibleMockExamRecords({
        db: prisma,
        userId: req.auth.userId,
        paperType: req.query.paperType,
      }),
    );
  } catch (error) {
    return fail(res, error.message || "加载考试记录失败", error.statusCode || 500);
  }
});

mockExamRouter.get("/leaderboard/papers", async (req, res) => {
  try {
    await syncExpiredMockExamRecords({ db: prisma, userId: req.auth.userId });

    return ok(
      res,
      await listUserVisibleMockExamLeaderboardPapers({
        db: prisma,
        userId: req.auth.userId,
      }),
    );
  } catch (error) {
    return fail(res, error.message || "加载考试排行榜试卷失败", error.statusCode || 400);
  }
});

mockExamRouter.get("/leaderboard/:paperId", async (req, res) => {
  try {
    await syncExpiredMockExamRecords({ db: prisma, userId: req.auth.userId });

    return ok(
      res,
      await getUserMockExamLeaderboardDetail({
        db: prisma,
        userId: req.auth.userId,
        paperId: `${req.params.paperId ?? ""}`.trim(),
      }),
    );
  } catch (error) {
    return fail(res, error.message || "加载考试排行榜失败", error.statusCode || 400);
  }
});

mockExamRouter.post("/papers/:paperId/start", async (req, res) => {
  try {
    const record = await startMockExamRecord({
      db: prisma,
      paperId: `${req.params.paperId ?? ""}`.trim(),
      userId: req.auth.userId,
    });

    return ok(res, serializeMockExamRecordDetail(record), "开始答题成功");
  } catch (error) {
    return fail(res, error.message || "开始答题失败", error.statusCode || 400);
  }
});

mockExamRouter.get("/records/:recordId", async (req, res) => {
  try {
    const record = await getMockExamRecordForUser({
      db: prisma,
      recordId: `${req.params.recordId ?? ""}`.trim(),
      userId: req.auth.userId,
    });

    return ok(res, serializeMockExamRecordDetail(record));
  } catch (error) {
    return fail(res, error.message || "加载考试记录失败", error.statusCode || 400);
  }
});

mockExamRouter.post("/records/:recordId/pause", async (req, res) => {
  try {
    const record = await pauseMockExamRecord({
      db: prisma,
      recordId: `${req.params.recordId ?? ""}`.trim(),
      userId: req.auth.userId,
    });

    return ok(res, serializeMockExamRecordDetail(record), "考试已暂停");
  } catch (error) {
    return fail(res, error.message || "暂停考试失败", error.statusCode || 400);
  }
});

mockExamRouter.patch("/records/:recordId/answers", async (req, res) => {
  const questionId = `${req.body?.questionId ?? ""}`.trim();

  if (!questionId) {
    return fail(res, "缺少题目参数", 400);
  }

  try {
    const record = await saveMockExamAnswer({
      db: prisma,
      recordId: `${req.params.recordId ?? ""}`.trim(),
      userId: req.auth.userId,
      questionId,
      answerKeys: req.body?.answerKeys,
      answerText: req.body?.answerText,
      subQuestionId: req.body?.subQuestionId,
    });

    return ok(res, serializeMockExamRecordDetail(record), "答案已保存");
  } catch (error) {
    return fail(res, error.message || "保存答案失败", error.statusCode || 400);
  }
});

mockExamRouter.post("/records/:recordId/review-feedback", async (req, res) => {
  try {
    const record = await saveMockExamReviewFeedback({
      db: prisma,
      recordId: `${req.params.recordId ?? ""}`.trim(),
      userId: req.auth.userId,
      questionId: `${req.body?.questionId ?? ""}`.trim(),
      stars: req.body?.stars,
    });

    return ok(res, serializeMockExamRecordDetail(record), "æ‰¹æ”¹æ»¡æ„åº¦å·²æäº¤");
  } catch (error) {
    return fail(res, error.message || "æäº¤æ‰¹æ”¹æ»¡æ„åº¦å¤±è´¥", error.statusCode || 400);
  }
});

mockExamRouter.post("/records/:recordId/questions/:questionId/review-feedback", async (req, res) => {
  try {
    const record = await saveMockExamReviewFeedback({
      db: prisma,
      recordId: `${req.params.recordId ?? ""}`.trim(),
      userId: req.auth.userId,
      questionId: `${req.params.questionId ?? ""}`.trim(),
      stars: req.body?.stars,
    });

    return ok(res, serializeMockExamRecordDetail(record), "æ‰¹æ”¹æ»¡æ„åº¦å·²æäº¤");
  } catch (error) {
    return fail(res, error.message || "æäº¤æ‰¹æ”¹æ»¡æ„åº¦å¤±è´¥", error.statusCode || 400);
  }
});

mockExamRouter.post("/records/:recordId/submit", async (req, res) => {
  try {
    const record = await finalizeMockExamRecord({
      db: prisma,
      recordId: `${req.params.recordId ?? ""}`.trim(),
      userId: req.auth.userId,
      subjectiveAnswers: req.body?.subjectiveAnswers,
    });

    enqueueAutoReviewIfNeeded(record);

    return ok(res, serializeMockExamRecordDetail(record), "交卷成功");
  } catch (error) {
    return fail(res, error.message || "交卷失败", error.statusCode || 400);
  }
});
