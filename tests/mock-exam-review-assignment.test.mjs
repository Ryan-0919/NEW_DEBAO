import test from "node:test";
import assert from "node:assert/strict";

import {
  canAssignToPartTimeReviewer,
  canManageReviewAssignments,
  canReassignReviewRecord,
  canUnassignReviewRecord,
  canReviewerAccessAssignedRecord,
  isPartTimeReviewerRole,
  summarizeReviewerStats,
} from "../server/lib/mock-exam-review-assignment.js";

test("角色判断能区分兼职老师与主管分发权限", () => {
  assert.equal(isPartTimeReviewerRole("part_time_reviewer"), true);
  assert.equal(isPartTimeReviewerRole("review_admin"), false);
  assert.equal(canManageReviewAssignments("review_admin"), true);
  assert.equal(canManageReviewAssignments("operations_admin"), true);
  assert.equal(canManageReviewAssignments("part_time_reviewer"), false);
});

test("只有 AI 已完成进入 manual_pending 的试卷才允许分配给兼职老师", () => {
  assert.equal(canAssignToPartTimeReviewer({ reviewWorkflowStatus: "manual_pending", publishedAt: null }), true);
  assert.equal(canAssignToPartTimeReviewer({ reviewWorkflowStatus: "ai_pending", publishedAt: null }), false);
  assert.equal(canAssignToPartTimeReviewer({ reviewWorkflowStatus: "ai_processing", publishedAt: null }), false);
  assert.equal(canAssignToPartTimeReviewer({ reviewWorkflowStatus: "manual_pending", publishedAt: "2026-07-08 12:00:00" }), false);
});

test("只要没发送给学生，主管就可以改派", () => {
  assert.equal(canReassignReviewRecord({ publishedAt: null }), true);
  assert.equal(canReassignReviewRecord({ publishedAt: "" }), true);
  assert.equal(canReassignReviewRecord({ publishedAt: "2026-07-08 12:00:00" }), false);
});

test("收回到公共池仅限未发送且已分配的 manual_pending 试卷", () => {
  assert.equal(
    canUnassignReviewRecord({
      publishedAt: null,
      reviewWorkflowStatus: "manual_pending",
      assignedReviewerId: "reviewer_a",
    }),
    true,
  );
  assert.equal(
    canUnassignReviewRecord({
      publishedAt: null,
      reviewWorkflowStatus: "ai_processing",
      assignedReviewerId: "reviewer_a",
    }),
    false,
  );
  assert.equal(
    canUnassignReviewRecord({
      publishedAt: "2026-07-08 12:00:00",
      reviewWorkflowStatus: "manual_pending",
      assignedReviewerId: "reviewer_a",
    }),
    false,
  );
  assert.equal(
    canUnassignReviewRecord({
      publishedAt: null,
      reviewWorkflowStatus: "manual_pending",
      assignedReviewerId: "",
    }),
    false,
  );
});

test("兼职批改老师只能访问分配给自己的试卷", () => {
  assert.equal(
    canReviewerAccessAssignedRecord({
      adminRole: "part_time_reviewer",
      adminId: "reviewer_a",
      assignedReviewerId: "reviewer_a",
    }),
    true,
  );
  assert.equal(
    canReviewerAccessAssignedRecord({
      adminRole: "part_time_reviewer",
      adminId: "reviewer_a",
      assignedReviewerId: "reviewer_b",
    }),
    false,
  );
  assert.equal(
    canReviewerAccessAssignedRecord({
      adminRole: "review_admin",
      adminId: "manager_a",
      assignedReviewerId: "reviewer_b",
    }),
    true,
  );
});

test("老师统计按最终 publishedReviewer 归属和当前分配待处理量计算", () => {
  const now = new Date("2026-07-08T12:00:00+08:00");
  const stats = summarizeReviewerStats({
    reviewerId: "reviewer_a",
    currentTime: now,
    records: [
      {
        assignedReviewerId: "reviewer_a",
        publishedReviewerId: "reviewer_a",
        publishedAt: "2026-07-08T11:30:00+08:00",
        reviewWorkflowStatus: "published",
      },
      {
        assignedReviewerId: "reviewer_a",
        publishedReviewerId: "reviewer_a",
        publishedAt: "2026-07-08T09:00:00+08:00",
        reviewWorkflowStatus: "published",
      },
      {
        assignedReviewerId: "reviewer_a",
        publishedReviewerId: "reviewer_b",
        publishedAt: "2026-07-07T18:00:00+08:00",
        reviewWorkflowStatus: "published",
      },
      {
        assignedReviewerId: "reviewer_a",
        publishedReviewerId: null,
        publishedAt: null,
        reviewWorkflowStatus: "manual_pending",
      },
      {
        assignedReviewerId: "reviewer_a",
        publishedReviewerId: null,
        publishedAt: null,
        reviewWorkflowStatus: "mine",
      },
    ],
  });

  assert.deepEqual(stats, {
    lastHourCount: 1,
    todayCount: 2,
    totalCount: 2,
    assignedPendingCount: 2,
  });
});
