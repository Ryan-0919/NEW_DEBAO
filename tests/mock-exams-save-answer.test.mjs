import test from "node:test";
import assert from "node:assert/strict";

import { finalizeMockExamRecord, saveMockExamAnswer, startMockExamRecord } from "../server/lib/mock-exams.js";

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

test("finalizeMockExamRecord restores subjective review quota after return-for-redo", async () => {
  const baseRecord = buildRecord("in_progress");
  const currentRecord = {
    ...baseRecord,
    id: "redo_record_2",
    attemptNo: 2,
    createdAt: new Date("2026-07-18T11:28:08.000Z"),
    updatedAt: new Date("2026-07-18T11:58:08.000Z"),
    answers: [
      {
        id: "answer_1",
        questionId: "question_1",
        answerJson: JSON.stringify({ sub_1: "redo answer" }),
        score: 0,
      },
    ],
    paper: {
      ...baseRecord.paper,
      reviewAttemptLimit: 1,
    },
  };
  const returnedRecord = {
    id: "returned_record_1",
    userId: "user_1",
    paperId: "paper_1",
    reviewWorkflowStatus: "returned_for_redo",
    createdAt: new Date("2026-07-17T06:48:47.000Z"),
    updatedAt: new Date("2026-07-18T11:04:10.000Z"),
  };
  const recordUpdates = [];

  const tx = {
    mockExamRecord: {
      findUnique: async () => currentRecord,
      findMany: async () => [returnedRecord],
      update: async ({ data }) => {
        recordUpdates.push(data);
        return { ...currentRecord, ...data };
      },
    },
    mockExamAnswer: {
      update: async () => ({}),
    },
    userMockExamPermission: {
      updateMany: async () => ({}),
    },
  };
  const db = {
    $transaction: async (callback) => callback(tx),
  };

  await finalizeMockExamRecord({
    db,
    recordId: "redo_record_2",
    userId: "user_1",
    currentTime: new Date("2026-07-18T12:00:00.000Z"),
  });

  const submitUpdate = recordUpdates.find((item) => item.status === "submitted");
  assert.equal(submitUpdate?.reviewWorkflowStatus, "ai_pending");
  assert.equal(submitUpdate?.publishedAt, null);
});

test("startMockExamRecord resets displayed attempt number after return-for-redo", async () => {
  const paper = {
    ...buildRecord("in_progress").paper,
    id: "paper_1",
    questions: [buildSubjectiveQuestion()],
  };
  const returnedRecord = {
    id: "returned_record_1",
    userId: "user_1",
    paperId: "paper_1",
    reviewWorkflowStatus: "returned_for_redo",
    createdAt: new Date("2026-07-17T06:48:47.000Z"),
    updatedAt: new Date("2026-07-18T11:04:10.000Z"),
  };
  const staleRecordBeforeReturn = {
    id: "stale_record_2",
    userId: "user_1",
    paperId: "paper_1",
    reviewWorkflowStatus: "not_required",
    createdAt: new Date("2026-07-17T06:49:33.000Z"),
    updatedAt: new Date("2026-07-17T08:14:22.000Z"),
  };
  let createdRecord = null;

  const db = {
    course: {
      findMany: async () => [],
    },
    systemConfig: {
      findUnique: async () => null,
    },
    mockExamPaper: {
      findUnique: async () => ({ id: "paper_1", status: "published", permissionRequired: false }),
      findFirst: async () => paper,
    },
    mockExamRecord: {
      findMany: async ({ where }) => {
        if (where?.status === "in_progress") return [];
        return [returnedRecord, staleRecordBeforeReturn];
      },
      findFirst: async () => null,
      findUnique: async () => ({
        ...createdRecord,
        answers: [],
        paper,
      }),
    },
    $transaction: async (callback) =>
      callback({
        mockExamRecord: {
          create: async ({ data }) => {
            createdRecord = {
              id: "created_record",
              status: "in_progress",
              reviewWorkflowStatus: "not_required",
              answers: [],
              createdAt: data.startedAt,
              updatedAt: data.startedAt,
              ...data,
            };
            return createdRecord;
          },
        },
      }),
  };

  const record = await startMockExamRecord({
    db,
    paperId: "paper_1",
    userId: "user_1",
    currentTime: new Date("2026-07-18T12:00:00.000Z"),
  });

  assert.equal(record.attemptNo, 1);
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
