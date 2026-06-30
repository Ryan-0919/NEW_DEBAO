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

test("gpt-5 family 优先走 responses 接口并使用 max_output_tokens", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return createJsonResponse({
      id: "resp_1",
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "{\"subQuestions\":[]}",
            },
          ],
        },
      ],
      usage: {
        input_tokens: 12,
        output_tokens: 34,
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
    assert.equal(calls[0].url, "https://ryanai.cc/v1/responses");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.model, "gpt-5.5");
    assert.equal(body.max_output_tokens, 4321);
    assert.equal(body.instructions, "system prompt");
    assert.match(body.input, /user prompt/);
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

test("responses 不可用时会自动回退到 chat completions", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return createJsonResponse(
        {
          error: {
            message: "Not Found",
          },
        },
        404,
      );
    }
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
        prompt_tokens: 21,
        completion_tokens: 22,
        total_tokens: 43,
      },
    });
  };

  try {
    const reviewer = createReviewer("gpt-5.5");
    const result = await reviewer.callAi({
      systemPrompt: "system prompt",
      userPrompt: "user prompt",
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://ryanai.cc/v1/responses");
    assert.equal(calls[1].url, "https://ryanai.cc/v1/chat/completions");
    const fallbackBody = JSON.parse(calls[1].options.body);
    assert.equal(fallbackBody.max_tokens, 4321);
    assert.equal(result.content, "{\"subQuestions\":[]}");
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
    assert.equal("anthropic-version" in calls[0].options.headers, false);
  } finally {
    global.fetch = originalFetch;
  }
});
