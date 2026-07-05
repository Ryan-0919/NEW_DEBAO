import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldStartMockExamSubmit,
  trackMockExamSaveTask,
  waitForMockExamSaveTasks,
} from "../src/app/lib/mockExamSubmitHelpers.mjs";

test("shouldStartMockExamSubmit 在 ref 已锁定时阻止重复交卷", () => {
  assert.equal(
    shouldStartMockExamSubmit({
      hasActiveRecord: true,
      submitting: false,
      submittingRefCurrent: true,
    }),
    false,
  );
  assert.equal(
    shouldStartMockExamSubmit({
      hasActiveRecord: true,
      submitting: false,
      submittingRefCurrent: false,
    }),
    true,
  );
});

test("trackMockExamSaveTask 对同一小问同一文本只保留一个并发保存请求", async () => {
  const taskMap = {};
  let callCount = 0;

  const createTask = () =>
    trackMockExamSaveTask({
      taskMap,
      key: "q1:sub1",
      text: "第一版答案",
      run: async () => {
        callCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "saved";
      },
    });

  const first = createTask();
  const second = createTask();

  assert.equal(first, second);
  const result = await first;
  assert.equal(result, "saved");
  assert.equal(callCount, 1);
  assert.deepEqual(taskMap, {});
});

test("waitForMockExamSaveTasks 会等待当前进行中的保存任务完成", async () => {
  const taskMap = {};
  let finished = false;

  trackMockExamSaveTask({
    taskMap,
    key: "q1:sub1",
    text: "待保存答案",
    run: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished = true;
    },
  });

  await waitForMockExamSaveTasks(taskMap);
  assert.equal(finished, true);
  assert.deepEqual(taskMap, {});
});
