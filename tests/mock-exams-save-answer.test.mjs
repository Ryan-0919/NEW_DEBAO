import test from "node:test";
import assert from "node:assert/strict";

import { saveMockExamAnswer } from "../server/lib/mock-exams.js";

const buildSubjectiveQuestion = () => ({
  id: "question_1",
  type: "subjective_case",
  score: 10,
  stem: "题干",
  material: "材料",
  analysis: "",
  questionMetaJson: JSON.stringify({
    subQuestions: [
      {
        id: "sub_1",
        title: "小问1",
        maxScore: 10,
        rubricPoints: [],
      },
    ],
  }),
  options: [],
  correctAnswerJson: "[]",
});

const buildRecord = (status) => ({
  id: "record_1",
  userId: "user_1",
  paperId: "paper_1",
  status,
  isPaused: false,
  consumedSeconds: 0,
  allottedSeconds: 3600,
  startedAt: new Date("2026-07-05T10:00:00.000Z"),
  reviewWorkflowStatus: status === "submitted" ? "ai_pending" : "not_required",
  answers: [],
  paperSnapshotJson: "",
  paper: {
    id: "paper_1",
    status: "published",
    permissionRequired: false,
    paperType: "subjective",
    durationMinutes: 60,
    maxAttempts: 0,
    reviewEnabled: true,
    reviewAttemptLimit: 0,
    title: "主观题测试卷",
    subtitle: "",
    code: "SJ001",
    year: 2026,
    phase: "主观题",
    passScore: 0,
    description: "",
    questions: [buildSubjectiveQuestion()],
  },
});

test("saveMockExamAnswer 在交卷事务开始后发现记录已提交时应阻止继续保存", async () => {
  const currentRecord = buildRecord("in_progress");
  const submittedRecord = buildRecord("submitted");

  const tx = {
    mockExamRecord: {
      findUnique: async () => submittedRecord,
      update: async () => {
        throw new Error("不应该在已交卷记录上继续更新 record");
      },
    },
    mockExamAnswer: {
      create: async () => {
        throw new Error("不应该在已交卷记录上继续创建答案");
      },
      update: async () => {
        throw new Error("不应该在已交卷记录上继续更新答案");
      },
      delete: async () => {
        throw new Error("不应该在已交卷记录上继续删除答案");
      },
    },
    mockExamPaper: {
      findUnique: async () => ({ id: "paper_1", status: "published", permissionRequired: false }),
    },
  };

  const db = {
    mockExamRecord: {
      findUnique: async () => currentRecord,
    },
    mockExamPaper: {
      findUnique: async () => ({ id: "paper_1", status: "published", permissionRequired: false }),
    },
    $transaction: async (callback) => callback(tx),
  };

  await assert.rejects(
    saveMockExamAnswer({
      db,
      recordId: "record_1",
      userId: "user_1",
      questionId: "question_1",
      answerText: "新的主观题答案",
      subQuestionId: "sub_1",
    }),
    (error) => {
      assert.equal(error?.statusCode, 409);
      assert.match(error?.message ?? "", /已交卷/);
      return true;
    },
  );
});
