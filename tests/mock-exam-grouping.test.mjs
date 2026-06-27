import test from "node:test";
import assert from "node:assert/strict";

import { buildStableQuestionGroups } from "../src/app/lib/mockExamGrouping.mjs";

const createObjectiveQuestion = (id, type, sectionLabel, sectionDescription = "") => ({
  id,
  type,
  sectionLabel,
  sectionDescription,
});

test("客观题答题卡按题型固定合并为三组", () => {
  const groups = buildStableQuestionGroups([
    createObjectiveQuestion("q1", "single_choice", "单项选择题"),
    createObjectiveQuestion("q2", "multiple_choice", "多项选择题"),
    createObjectiveQuestion("q3", "uncertain_choice", "不定项选择题"),
    createObjectiveQuestion("q4", "single_choice", "单项选择题"),
    createObjectiveQuestion("q5", "multiple_choice", "多项选择题"),
    createObjectiveQuestion("q6", "uncertain_choice", "不定项选择题"),
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      key: group.key,
      label: group.label,
      questionIds: group.questions.map((question) => question.id),
    })),
    [
      { key: "single_choice", label: "单项选择题", questionIds: ["q1", "q4"] },
      { key: "multiple_choice", label: "多项选择题", questionIds: ["q2", "q5"] },
      { key: "uncertain_choice", label: "不定项选择题", questionIds: ["q3", "q6"] },
    ],
  );
});

test("主观题仍保持原有顺序分组", () => {
  const groups = buildStableQuestionGroups([
    createObjectiveQuestion("q1", "subjective_case", "案例分析一"),
    createObjectiveQuestion("q2", "subjective_case", "案例分析一"),
    createObjectiveQuestion("q3", "subjective_case", "案例分析二"),
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      label: group.label,
      questionIds: group.questions.map((question) => question.id),
    })),
    [
      { label: "案例分析一", questionIds: ["q1", "q2"] },
      { label: "案例分析二", questionIds: ["q3"] },
    ],
  );
});
