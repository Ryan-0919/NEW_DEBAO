import test from "node:test";
import assert from "node:assert/strict";

import { getMockExamActivityDetail } from "../server/lib/user-study-summary.js";

const buildRecord = (overrides = {}) => ({
  status: "submitted",
  totalScore: 19,
  answeredCount: 1,
  questionCount: 1,
  reviewWorkflowStatus: "manual_pending",
  publishedAt: null,
  paper: { paperType: "subjective" },
  ...overrides,
});

test("subjective activity hides AI score until the teacher publishes it", () => {
  assert.equal(getMockExamActivityDetail(buildRecord()), "待老师批改 / 作答 1/1");
  assert.equal(
    getMockExamActivityDetail(buildRecord({ reviewWorkflowStatus: "ai_processing" })),
    "待老师批改 / 作答 1/1",
  );
});

test("subjective activity shows the final score after publication", () => {
  assert.equal(
    getMockExamActivityDetail(buildRecord({ reviewWorkflowStatus: "published" })),
    "得分 19 / 作答 1/1",
  );
  assert.equal(
    getMockExamActivityDetail(buildRecord({ publishedAt: new Date("2026-09-22T08:00:00.000Z") })),
    "得分 19 / 作答 1/1",
  );
});

test("objective activity continues to show its score immediately", () => {
  assert.equal(
    getMockExamActivityDetail(buildRecord({ paper: { paperType: "objective" }, reviewWorkflowStatus: "not_required" })),
    "得分 19 / 作答 1/1",
  );
});

test("in-progress activity never shows a score", () => {
  assert.equal(getMockExamActivityDetail(buildRecord({ status: "in_progress" })), "已作答 1/1");
});
