import test from "node:test";
import assert from "node:assert/strict";
import { MultiSubQuestionHandler } from "../server/lib/ai-review-v2/multi-handler.js";

test("多小问处理器按顺序逐个批改，不再并发 Promise.all", async () => {
  const handler = new MultiSubQuestionHandler(
    { model: "gpt-5.5" },
    { baseUrl: "https://ryanai.cc/v1", apiKey: "test-key" },
  );

  const started = [];
  const finished = [];
  const inFlight = [];

  handler.phaseReviewer.reviewSubQuestion = async ({ subQuestion }) => {
    started.push(subQuestion.id);
    inFlight.push(subQuestion.id);
    assert.equal(inFlight.length, 1, `检测到并发执行: ${inFlight.join(",")}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    finished.push(subQuestion.id);
    inFlight.pop();
    return {
      success: true,
      result: {
        id: subQuestion.id,
        title: subQuestion.title,
        score: 1,
        maxScore: 1,
        answer: "",
        reviewComment: "",
        answerMarks: [],
        rubricPoints: [],
        missedPoints: [],
      },
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
      rawResponse: null,
    };
  };

  const result = await handler.sequentialReview({
    question: {
      id: "q_1",
      score: 4,
      questionMetaJson: JSON.stringify({
        subQuestions: [
          { id: "sub_1", title: "小问1", maxScore: 1, rubricPoints: [] },
          { id: "sub_2", title: "小问2", maxScore: 1, rubricPoints: [] },
          { id: "sub_3", title: "小问3", maxScore: 1, rubricPoints: [] },
        ],
      }),
    },
    answer: {
      answerJson: JSON.stringify({
        sub_1: "a",
        sub_2: "b",
        sub_3: "c",
      }),
    },
    recordId: "record_1",
    questionMeta: {
      subQuestions: [
        { id: "sub_1", title: "小问1", maxScore: 1, rubricPoints: [] },
        { id: "sub_2", title: "小问2", maxScore: 1, rubricPoints: [] },
        { id: "sub_3", title: "小问3", maxScore: 1, rubricPoints: [] },
      ],
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(started, ["sub_1", "sub_2", "sub_3"]);
  assert.deepEqual(finished, ["sub_1", "sub_2", "sub_3"]);
});

test("多小问批改从局部断点继续，并在第一个失败的小问停止", async () => {
  const handler = new MultiSubQuestionHandler(
    { model: "gpt-5.5" },
    { baseUrl: "https://ryanai.cc/v1", apiKey: "test-key" },
  );
  const started = [];
  const checkpoints = [];

  handler.phaseReviewer.reviewSubQuestion = async ({ subQuestion }) => {
    started.push(subQuestion.id);
    if (subQuestion.id === "sub_2") {
      return {
        success: false,
        error: "模拟上游错误",
        result: null,
        usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
      };
    }
    return {
      success: true,
      result: {
        id: subQuestion.id,
        title: subQuestion.title,
        score: 1,
        maxScore: 1,
        answer: "",
        reviewComment: "",
        answerMarks: [],
        rubricPoints: [],
        missedPoints: [],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      rawResponse: null,
    };
  };

  const questionMeta = {
    subQuestions: [
      { id: "sub_1", title: "小问1", maxScore: 1, rubricPoints: [] },
      { id: "sub_2", title: "小问2", maxScore: 1, rubricPoints: [] },
      { id: "sub_3", title: "小问3", maxScore: 1, rubricPoints: [] },
    ],
  };
  const result = await handler.sequentialReview({
    question: { id: "q_1", score: 3, questionMetaJson: JSON.stringify(questionMeta) },
    answer: {
      answerJson: JSON.stringify({ sub_1: "a", sub_2: "b", sub_3: "c" }),
      reviewJson: JSON.stringify({
        subQuestions: [
          {
            id: "sub_1",
            title: "小问1",
            score: 1,
            maxScore: 1,
            answer: "",
            reviewComment: "已保存",
            answerMarks: [],
            rubricPoints: [],
            missedPoints: [],
          },
        ],
        aiReviewCheckpoint: { version: 1, questionId: "q_1", partial: true },
      }),
    },
    recordId: "record_1",
    questionMeta,
    onSubQuestionComplete: ({ completedResults }) => checkpoints.push(completedResults.map((item) => item.id)),
  });

  assert.equal(result.success, false);
  assert.deepEqual(started, ["sub_2"]);
  assert.deepEqual(checkpoints, []);
  assert.match(result.error, /sub_2/);
});

test("小问遇到可恢复的上游错误时在消耗试卷重试次数前自动重试", async () => {
  const handler = new MultiSubQuestionHandler(
    { model: "gpt-5.5" },
    { baseUrl: "https://ryanai.cc/v1", apiKey: "test-key" },
  );
  let attempts = 0;
  handler.phaseReviewer.reviewSubQuestion = async ({ subQuestion }) => {
    attempts += 1;
    if (attempts < 3) {
      return { success: false, error: "AI API错误: 502 Upstream request failed", usage: {} };
    }
    return {
      success: true,
      result: {
        id: subQuestion.id,
        title: subQuestion.title,
        score: 1,
        maxScore: 1,
        answer: "",
        reviewComment: "",
        answerMarks: [],
        rubricPoints: [],
        missedPoints: [],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
  };

  const questionMeta = { subQuestions: [{ id: "sub_1", title: "小问1", maxScore: 1, rubricPoints: [] }] };
  const result = await handler.sequentialReview({
    question: { id: "q_1", score: 1, questionMetaJson: JSON.stringify(questionMeta) },
    answer: { answerJson: JSON.stringify({ sub_1: "a" }) },
    recordId: "record_1",
    questionMeta,
  });

  assert.equal(result.success, true);
  assert.equal(attempts, 3);
});
