// AI批改系统V2 - 核心批改引擎
import { buildPrompt } from './base-prompt.js';
import { ReviewValidator } from './validator.js';

const normalizeBaseUrl = (value = '') => `${value ?? ''}`.trim().replace(/\/+$/, '');
const isGpt5FamilyModel = (model = '') => /^gpt-5(?:$|[-.])/i.test(`${model ?? ''}`.trim());

const extractBalancedJsonCandidates = (value = '') => {
  const text = `${value ?? ''}`.replace(/^\uFEFF/, '').trim();
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
};

const parseJsonCandidates = (content = '') => {
  const text = `${content ?? ''}`.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidates = [fenced, text, ...extractBalancedJsonCandidates(fenced || text)]
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue with the next extraction strategy or the JSON normalizer.
    }
  }
  return null;
};

export class AiReviewer {
  constructor(strategy, runtimeConfig) {
    this.strategy = strategy;
    this.runtimeConfig = runtimeConfig;
    this.validator = new ReviewValidator(strategy);
  }

  /**
   * 执行批改
   */
  async review(question, answer) {
    const startTime = Date.now();
    let result = null;
    let retryCount = 0;
    let validationResult = null;
    let totalUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };

    try {
      // 第一步：构建prompt
      const prompt = this.buildCompletePrompt(question, answer);

      // 第二步：调用AI
      let response = await this.callAi(prompt);
      totalUsage.prompt_tokens += response.usage.prompt_tokens;
      totalUsage.completion_tokens += response.usage.completion_tokens;
      totalUsage.total_tokens += response.usage.total_tokens;

      // 保存原始响应用于日志
      const rawResponse = response.content;

      // 第三步：解析JSON
      result = await this.parseAndRepairJson(response);

      // 第四步：验证
      validationResult = this.validator.validate(result, question, answer);

      // 第五步：如果验证失败且可重试，重试
      if (!validationResult.passed && validationResult.retriable) {
        console.log(`[批改] 验证失败，尝试重试。错误数：${validationResult.errorCount}`);

        result = await this.retryWithFeedback(prompt, result, validationResult.errors);
        retryCount = 1;

        // 累加usage
        totalUsage.prompt_tokens += response.usage.prompt_tokens;
        totalUsage.completion_tokens += response.usage.completion_tokens;
        totalUsage.total_tokens += response.usage.total_tokens;

        // 再次验证
        validationResult = this.validator.validate(result, question, answer);

        if (!validationResult.passed) {
          throw new ValidationError('批改结果验证失败（重试后仍失败）', validationResult.errors);
        }
      }

      // 第六步：检查错误标注（关键新增）
      if (!this.hasErrorMarking(result) && this.shouldHaveErrorMarking(result)) {
        console.log(`[批改] 缺少错误标注，强制重试`);

        // 强制重试，要求生成错误标注
        result = await this.retryForErrorMarking(prompt, result);
        retryCount++;

        // 累加usage
        totalUsage.prompt_tokens += response.usage.prompt_tokens;
        totalUsage.completion_tokens += response.usage.completion_tokens;
        totalUsage.total_tokens += response.usage.total_tokens;

        // 再次验证
        validationResult = this.validator.validate(result, question, answer);
      }

      // 第七步：返回结果
      return {
        success: true,
        result,
        usage: totalUsage,
        rawResponse,  // 包含原始响应
        validation: validationResult,
        metrics: {
          latency_ms: Date.now() - startTime,
          retry_count: retryCount
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        usage: totalUsage,
        rawResponse: null,
        validation: validationResult,
        metrics: {
          latency_ms: Date.now() - startTime,
          retry_count: retryCount
        }
      };
    }
  }

  /**
   * 构建完整的prompt
   */
  buildCompletePrompt(question, answer) {
    const { systemPrompt, userPrompt } = buildPrompt({
      question,
      answer,
      strategy: this.strategy
    });

    // 填充题目数据
    const questionMeta = this.getQuestionMeta(question);
    const answerMap = this.parseSubjectiveAnswerMap(answer?.answerJson, question);

    // 1. 题目信息
    let questionInfo = `题干：${question.stem || ''}\n`;
    if (question.material) {
      questionInfo += `\n材料：${question.material}\n`;
    }

    // 2. 学生答案（明确展示）
    let studentAnswers = '';
    questionMeta.subQuestions.forEach((sq, index) => {
      const studentAnswer = answerMap[sq.id] || '';
      studentAnswers += `\n小问${index + 1}：${sq.title}\n`;
      if (studentAnswer) {
        studentAnswers += `学生答案：\n${studentAnswer}\n`;
      } else {
        studentAnswers += `学生答案：【未作答】\n`;
      }
    });

    // 3. 批改依据（精简版 - 删除rubricGuidance以减少prompt长度）
    let rubricInfo = '';
    questionMeta.subQuestions.forEach((sq, index) => {
      rubricInfo += `\n小问${index + 1}的批改依据：\n`;
      rubricInfo += `满分：${sq.maxScore || 0}分\n`;

      if (sq.referenceAnswer) {
        rubricInfo += `参考答案：${sq.referenceAnswer}\n`;
      }

      // 注意：删除了rubricGuidance（过长，AI不需要详细评分规则）
      // 只保留采分点的核心信息（title + score）

      if (sq.rubricPoints && sq.rubricPoints.length > 0) {
        rubricInfo += `采分点：\n`;
        sq.rubricPoints.forEach((rp, i) => {
          // 只传title和分数，不传description/keywords（节省tokens）
          rubricInfo += `  ${i+1}. ${rp.title}（${rp.maxScore || rp.score || 0}分）\n`;
        });
      }
    });

    // 4. 构建用于JSON输出的元数据
    const questionData = {
      questionId: question.id,
      subQuestions: questionMeta.subQuestions.map((sq, index) => ({
        id: sq.id,
        sequenceId: `sub_${index + 1}`,
        maxScore: sq.maxScore || 0
      }))
    };

    // 替换占位符
    const finalUserPrompt = userPrompt
      .replace('{{QUESTION_INFO}}', questionInfo)
      .replace('{{STUDENT_ANSWERS}}', studentAnswers)
      .replace('{{RUBRIC_INFO}}', rubricInfo);

    console.log('[Prompt长度]', finalUserPrompt.length, '字符');

    return {
      systemPrompt,
      userPrompt: finalUserPrompt,
      questionData
    };
  }

  /**
   * 调用AI
   */
  async callAi(prompt) {
    const controller = new AbortController();
    const timeoutMs = this.strategy.timeoutMs ?? this.strategy.timeout_ms ?? 120000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const baseUrl = normalizeBaseUrl(this.runtimeConfig.baseUrl);
    const model = this.strategy.model || 'claude-opus-4-8';
    const maxTokens = Number(this.strategy.maxTokens ?? this.strategy.max_tokens) || 25000;
    const temperature = Number(this.strategy.temperature) || 0.5;

    try {
      const requestText = `${prompt.userPrompt}\n\n直接返回JSON，不要\`\`\`json代码块标记。\n\n⚠️ 关键：必须返回完整的JSON结构，包含所有字段直到最后的 }] }。不要中途停止！`;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.runtimeConfig.apiKey}`
      };

      const chatAttempt = await this.sendChatCompletionsRequest({
        baseUrl,
        headers,
        model,
        systemPrompt: prompt.systemPrompt,
        temperature,
        maxTokens,
        requestText,
        signal: controller.signal
      });

      if (!chatAttempt.ok) {
        console.error(`[AI错误] status=${chatAttempt.status}, response=${chatAttempt.responseText.substring(0, 500)}`);
        throw new Error(`AI API错误: ${chatAttempt.status} - ${chatAttempt.responseText.substring(0, 200)}`);
      }

      return chatAttempt.result;

    } finally {
      clearTimeout(timer);
    }
  }

  async sendChatCompletionsRequest({ baseUrl, headers, model, systemPrompt, temperature, maxTokens, requestText, signal }) {
    const endpoint = `${baseUrl}/chat/completions`;
    const isGpt5Family = isGpt5FamilyModel(model);
    const leadingRole = isGpt5Family ? 'developer' : 'system';
    const requestBody = {
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: leadingRole, content: systemPrompt },
        { role: 'user', content: requestText }
      ]
    };

    if (!isGpt5Family) {
      requestBody.max_tokens = maxTokens;
    }

    console.log(`[AI请求] endpoint=${endpoint}, model=${requestBody.model}, temp=${requestBody.temperature}, max_tokens=${requestBody.max_tokens ?? 'omitted'}`);

    let response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal
    });

    // A few OpenAI-compatible gateways do not implement response_format. Keep
    // JSON mode as the first choice, but remain compatible with those gateways.
    if (!response.ok && response.status === 400) {
      const errorText = await response.clone().text();
      if (/response_format|json_object|unsupported parameter/i.test(errorText)) {
        const fallbackBody = { ...requestBody };
        delete fallbackBody.response_format;
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(fallbackBody),
          signal
        });
      }
    }

    const responseText = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        responseText
      };
    }

    const data = JSON.parse(responseText);
    return {
      ok: true,
      status: response.status,
      responseText,
      result: this.normalizeAiResponse({ data, apiType: 'chat' })
    };
  }

  normalizeAiResponse({ data, apiType }) {
    const content = this.extractAiContent(data);
    const finishReason = this.extractFinishReason(data);
    const usage = this.extractUsage(data);

    console.log(`[AI响应] api=${apiType}, finish_reason=${finishReason}, prompt_tokens=${usage.prompt_tokens}, completion_tokens=${usage.completion_tokens}, content_length=${content.length}`);

    return {
      raw: data,
      content,
      usage,
      finishReason
    };
  }

  extractAiContent(data) {
    const directChatContent = data?.choices?.[0]?.message?.content;
    if (typeof directChatContent === 'string') {
      return directChatContent;
    }

    const directAnthropicContent = data?.content?.[0]?.text;
    if (typeof directAnthropicContent === 'string') {
      return directAnthropicContent;
    }

    const outputItems = Array.isArray(data?.output) ? data.output : [];
    for (const item of outputItems) {
      const contents = Array.isArray(item?.content) ? item.content : [];
      for (const part of contents) {
        if (typeof part?.text === 'string' && part.text) {
          return part.text;
        }
        if (typeof part?.output_text === 'string' && part.output_text) {
          return part.output_text;
        }
      }
    }

    if (typeof data?.output_text === 'string') {
      return data.output_text;
    }

    return '';
  }

  extractFinishReason(data) {
    return (
      data?.content?.[0]?.stop_reason ||
      data?.choices?.[0]?.finish_reason ||
      data?.status ||
      'unknown'
    );
  }

  extractUsage(data) {
    const promptTokens = data?.usage?.input_tokens || data?.usage?.prompt_tokens || 0;
    const completionTokens = data?.usage?.output_tokens || data?.usage?.completion_tokens || 0;
    const totalTokens = (promptTokens + completionTokens) || data?.usage?.total_tokens || 0;

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens
    };
  }

  /**
   * 解析和修复JSON
   */
  async parseAndRepairJson(response) {
    const content = typeof response?.content === 'string' ? response.content : '';

    console.log(`[JSON解析] 原始内容长度: ${content.length}`);
    console.log(`[JSON解析] 前500字符: ${content.substring(0, 500)}`);

    const parsed = parseJsonCandidates(content);
    if (parsed) {
      console.log(`[JSON解析] 本地解析成功`);
      return parsed;
    }

    const repaired = await this.repairJsonWithAi(content);
    if (repaired) {
      console.log(`[JSON解析] 标准化模型修复成功`);
      return repaired;
    }

    console.error(`[JSON解析] 所有方法都失败了`);
    console.error(`[JSON解析] 内容预览:`, content.substring(0, 1000));
    throw new Error(`无法解析AI返回的JSON（finish_reason=${response?.finishReason || 'unknown'}）`);
  }

  async repairJsonWithAi(brokenContent) {
    const normalizerEnabled = this.runtimeConfig?.jsonNormalizerEnabled !== false;
    const baseUrl = normalizeBaseUrl(this.runtimeConfig?.jsonNormalizerBaseUrl || this.runtimeConfig?.baseUrl);
    const apiKey = `${this.runtimeConfig?.jsonNormalizerApiKey || this.runtimeConfig?.apiKey || ''}`.trim();
    const model = `${this.runtimeConfig?.jsonNormalizerModel || this.strategy?.model || this.runtimeConfig?.model || ''}`.trim();
    if (!normalizerEnabled || !baseUrl || !apiKey || !model || !brokenContent.trim()) return null;

    const defaultSystemPrompt = [
      '你是 JSON 修复器，不是阅卷老师。',
      '只修复语法问题，不改变原始批改的分数、结论、评语、错误标注或遗漏点。',
      '将 Markdown 包裹、未转义引号、错误逗号、截断括号修复为合法 JSON。',
      '最终只能返回一个 JSON 对象，不要解释、不要 Markdown、不要代码块。',
    ].join('\n');
    const template = `${this.runtimeConfig?.jsonNormalizerUserPromptTemplate || ''}`.trim();
    const userPrompt = template
      ? template.split('{{原始批改输出}}').join(brokenContent)
      : `请修复下面的 AI 批改结果，使其成为合法 JSON，保留原始字段和内容，不要重新批改：\n\n${brokenContent}`;

    const timeoutMs = Number(this.runtimeConfig?.timeoutMs || this.strategy?.timeoutMs || 120000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

    try {
      const response = await this.sendChatCompletionsRequest({
        baseUrl,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        model,
        systemPrompt: `${this.runtimeConfig?.jsonNormalizerSystemPrompt || defaultSystemPrompt}`.trim(),
        temperature: 0,
        maxTokens: Number(this.runtimeConfig?.jsonNormalizerMaxTokens || 16000),
        requestText: userPrompt,
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return parseJsonCandidates(response.result?.content || response.content || '');
    } catch (error) {
      console.warn(`[JSON标准化] 请求失败: ${error.message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 检查是否有错误标注
   */
  hasErrorMarking(result) {
    for (const sq of result.subQuestions || []) {
      const wrongMarks = (sq.answerMarks || []).filter(m => m.status === 'wrong');
      if (wrongMarks.length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * 判断是否应该有错误标注
   */
  shouldHaveErrorMarking(result) {
    // 如果策略不要求错误标注，返回false
    if (!(this.strategy.requireErrorMarks ?? this.strategy.require_error_marks)) {
      return false;
    }

    // 如果有遗漏点且学生有作答，应该有错误标注
    for (const sq of result.subQuestions || []) {
      const missedCount = (sq.missedPoints || []).length;
      const hasAnswer = sq.answer && sq.answer.length > 30;

      if (missedCount > 0 && hasAnswer) {
        return true;
      }
    }

    return false;
  }

  /**
   * 专门为错误标注重试
   */
  async retryForErrorMarking(originalPrompt, failedResult) {
    const feedback = `
【关键错误】你的批改结果缺少错误标注！

学生有遗漏的采分点，说明学生答案有问题。
你必须在学生答案中找到错误，生成 status: "wrong" 的标注。

常见错误：
- 法律主体写反
- 概念误用
- 事实认定错误

立即在 answerMarks 中生成错误标注：
{"id": "mark_x", "highlight": "学生错误原文", "status": "wrong", "comment": "为什么错（5字）"}

返回完整JSON。`;

    const retryPrompt = {
      systemPrompt: originalPrompt.systemPrompt,
      userPrompt: originalPrompt.userPrompt + '\n\n' + feedback
    };

    const response = await this.callAi(retryPrompt);
    return await this.parseAndRepairJson(response);
  }

  async retryWithFeedback(originalPrompt, failedResult, errors) {
    const feedback = this.buildFeedback(errors);

    const retryPrompt = {
      systemPrompt: originalPrompt.systemPrompt,
      userPrompt: originalPrompt.userPrompt + `

【第一次批改结果存在以下问题，请修正】
${feedback}

请返回完整的修正后的JSON。`
    };

    const response = await this.callAi(retryPrompt);
    return await this.parseAndRepairJson(response);
  }

  /**
   * 构建反馈信息
   */
  buildFeedback(errors) {
    const errorList = errors
      .filter(e => e.severity === 'error')
      .map((e, i) => {
        let msg = `${i + 1}. ${e.message}`;
        if (e.suggestion) {
          msg += `\n   建议：${e.suggestion}`;
        }
        return msg;
      });

    return errorList.join('\n\n');
  }

  // 辅助方法（从旧系统复制）
  getQuestionMeta(question) {
    const raw = question.questionMetaJson ? JSON.parse(question.questionMetaJson) : {};
    return {
      subQuestions: Array.isArray(raw.subQuestions) ? raw.subQuestions : []
    };
  }

  parseSubjectiveAnswerMap(answerJson, question) {
    const raw = answerJson ? JSON.parse(answerJson) : {};
    const subQuestions = this.getQuestionMeta(question).subQuestions;
    return Object.fromEntries(
      subQuestions.map(sq => [sq.id, raw[sq.id] || ''])
    );
  }
}

// 自定义错误类
export class ValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
