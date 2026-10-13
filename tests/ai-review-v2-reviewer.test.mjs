import test from "node:test";
import assert from "node:assert/strict";
import { AiReviewer } from "../server/lib/ai-review-v2/reviewer.js";

const originalFetch = global.fetch;

const createReviewer = (model) =>
  new AiReviewer(
    {
      model,
      temperature: 0.4,
      maxTokens: 4321,
      timeoutMs: 5000,
    },
    {
      baseUrl: "https://ryanai.cc/v1",
      apiKey: "test-key",
    },
  );

const createJsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("gpt-5 family 只走 openai 兼容 chat completions 接口", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return createJsonResponse({
      choices: [
        {
          message: {
            content: "{\"subQuestions\":[]}",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 34,
        total_tokens: 46,
      },
    });
  };

  try {
    const reviewer = createReviewer("gpt-5.5");
    const result = await reviewer.callAi({
      systemPrompt: "system prompt",
      userPrompt: "user prompt",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://ryanai.cc/v1/chat/completions");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.model, "gpt-5.5");
    assert.equal(body.temperature, 0.4);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal("max_tokens" in body, false);
    assert.equal(body.messages.length, 2);
    assert.deepEqual(body.messages[0], {
      role: "developer",
      content: "system prompt",
    });
    assert.equal(body.messages[1].role, "user");
    assert.match(body.messages[1].content, /user prompt/);
    assert.equal(calls[0].options.headers["Content-Type"], "application/json");
    assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
    assert.equal("anthropic-version" in calls[0].options.headers, false);
    assert.equal(result.content, "{\"subQuestions\":[]}");
    assert.deepEqual(result.usage, {
      prompt_tokens: 12,
      completion_tokens: 34,
      total_tokens: 46,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("阶段1返回非法JSON时使用配置的标准化模型修复", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return createJsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              subQuestions: [
                {
                  id: "sub_1",
                  score: 2,
                  reviewComment: "已修复",
                  answerMarks: [],
                },
              ],
            }),
          },
          finish_reason: "stop",
        },
      ],
    });
  };

  try {
    const reviewer = new AiReviewer(
      { model: "gpt-5.5", maxTokens: 1000 },
      {
        baseUrl: "https://ryanai.cc/v1",
        apiKey: "review-key",
        jsonNormalizerEnabled: true,
        jsonNormalizerBaseUrl: "https://normalizer.example/v1",
        jsonNormalizerApiKey: "normalizer-key",
        jsonNormalizerModel: "gpt-5.5",
      },
    );

    const result = await reviewer.parseAndRepairJson({
      content: '{"subQuestions":[{"id":"sub_1","reviewComment":"学生说"错误""}]}',
      finishReason: "stop",
    });

    assert.equal(result.subQuestions[0].id, "sub_1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://normalizer.example/v1/chat/completions");
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal("max_tokens" in body, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("非 gpt-5 模型继续走 chat completions 且不带 anthropic-version 头", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return createJsonResponse({
      choices: [
        {
          message: {
            content: "{\"subQuestions\":[]}",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 9,
        completion_tokens: 10,
        total_tokens: 19,
      },
    });
  };

  try {
    const reviewer = createReviewer("claude-opus-4-1");
    await reviewer.callAi({
      systemPrompt: "system prompt",
      userPrompt: "user prompt",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://ryanai.cc/v1/chat/completions");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.max_tokens, 4321);
    assert.deepEqual(body.messages[0], {
      role: "system",
      content: "system prompt",
    });
    assert.equal("anthropic-version" in calls[0].options.headers, false);
  } finally {
    global.fetch = originalFetch;
  }
});
