import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reviewLayoutSource = fs.readFileSync("src/app/layouts/ReviewLayout.tsx", "utf8");
const reviewRouterSource = fs.readFileSync("src/app/pages/review/ReviewRouter.tsx", "utf8");
const reviewRecordsPageSource = fs.readFileSync("src/app/pages/review/ReviewRecordsPage.tsx", "utf8");

test("批改后台左侧导航包含单独的批改老师目录", () => {
  assert.match(reviewLayoutSource, /\/adminpg\/reviewers/);
  assert.match(reviewLayoutSource, /批改老师/);
});

test("批改后台路由单独挂载批改老师页面", () => {
  assert.match(reviewRouterSource, /ReviewTeacherAssignmentsPage/);
  assert.match(reviewRouterSource, /pathname\.startsWith\(\"\/adminpg\/reviewers\"\)/);
});

test("全局待老师批改页不再内嵌兼职批改老师卡片区", () => {
  assert.doesNotMatch(reviewRecordsPageSource, /兼职批改老师/);
});
