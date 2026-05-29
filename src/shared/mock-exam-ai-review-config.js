const clone = (value) => JSON.parse(JSON.stringify(value));

const toTrimmedString = (value, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized || fallback;
};

const toNonNegativeInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toBool = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  const text = `${value ?? ""}`.trim().toLowerCase();
  if (!text) return fallback;
  return ["1", "true", "yes", "on"].includes(text);
};

const normalizeBaseUrl = (value, fallback = "") => toTrimmedString(value, fallback).replace(/\/+$/, "");

export const AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS = Object.freeze({
  gradingPrinciples: "{{批改原则}}",
  outputRequirements: "{{输出要求}}",
  questionData: "{{题目数据}}",
});

export const AI_REVIEW_GRADING_TEMPLATE_PLACEHOLDERS = Object.freeze({
  questionStem: "{{题目}}",
  material: "{{材料}}",
  analysis: "{{参考解析}}",
  subQuestionRubrics: "{{小问批改依据}}",
});

const LEGACY_AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS = Object.freeze({
  gradingPrinciples: "{{gradingPrinciples}}",
  outputRequirements: "{{outputRequirements}}",
  questionData: "{{questionData}}",
});

const AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDER_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.keys(AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS).map((key) => [
      key,
      [AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS[key], LEGACY_AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS[key]],
    ]),
  ),
);

const normalizePromptTemplatePlaceholders = (value) =>
  Object.entries(AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDER_ALIASES).reduce(
    (result, [key, aliases]) =>
      aliases.reduce(
        (content, placeholder) => content.split(placeholder).join(AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS[key]),
        result,
      ),
    `${value ?? ""}`,
  );

export const DEFAULT_AI_REVIEW_SYSTEM_PROMPT =
  [
    "你是国家统一法律职业资格考试主观题阅卷老师。",
    "你必须严格依据我提供的参考答案、批改说明、采分点和分值批改，不得自行扩展评分标准。",
    "如果我提供的参考答案、批改说明或采分点与通用法学表述不一致，也必须以当前这道题提供的批改依据为准。",
    "你的评语风格要像老师在直接对学生说话，语言自然、明确、专业，不要使用冰冷的机器描述。",
    "你在指出问题时，必须明确说出学生漏了什么、错了什么，以及下一步应该怎么补、怎么改。",
    "你的总点评必须尽量写成老师阅卷后的完整反馈，不要只写一句结论。",
    "你的总点评不要复述学生原答案，不要一味重复学生写了什么。",
    "你的总点评可以有清晰结构，但不要写成生硬模板，不要像机器报告，也不要像公文。",
    "你的表达要像老师在给学生讲题，亲切、自然、有针对性，让学生一眼能看懂自己到底错在哪、下一次该怎么改。",
    "每个小问的 reviewComment 必须写成自然语言老师点评，字数控制在 300 到 400 个中文字符之间。",
    "每个小问的 reviewComment 不要出现具体评分表述，不要写“得了几分”“拿到几分”“扣了几分”“丢了几分”“本问得分为几分”等内容；分数只放在 score 和 answerMarks.score 字段里。",
    "每个小问的 reviewComment 请围绕这几个层次自然展开：核心失分点、答题中哪里错了、为什么错、正确思路应当如何补足、下一次怎么写。",
    "你可以用这些层次来组织内容，但不要机械套话，不要每一段都写得像固定表格。",
    "在建议部分要直接告诉学生下一次该怎么改、怎么补，但不要写成“第一步、第二步、第三步”这种流程卡片式话术。",
    "不要在点评中出现 AI、模型、系统、提示词、算法、自动批改 等暴露机器痕迹的表述。",
    "你只能返回合法 JSON，不要输出任何额外解释、前缀、Markdown 或代码块。",
  ].join("\n");

export const DEFAULT_AI_REVIEW_USER_PROMPT_TEMPLATE =
  [
    "你现在只批改 1 道主观大题，请一次性完成该大题下全部小问的评分。",
    "",
    "【批改原则】",
    AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS.gradingPrinciples,
    "",
    "【输出要求】",
    AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS.outputRequirements,
    "",
    "【题目与考生作答数据】",
    AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS.questionData,
    "",
    "请严格按照以上要求批改，并且只返回 JSON。",
  ].join("\n");

export const DEFAULT_AI_REVIEW_GRADING_PRINCIPLES_TEMPLATE =
  [
    "题目：{{题目}}",
    "{{材料}}",
    "{{参考解析}}",
    "",
    "{{小问批改依据}}",
  ].join("\n");

export const AI_REVIEW_OUTPUT_JSON_EXAMPLE = `{
  "subQuestions": [
    {
      "id": "sub_1",
      "score": 3,
      "reviewComment": "你这一问的基本方向是对的，能够意识到证明责任需要结合具体事实来分配，这一点值得保留。后面再写时，要把每一项事实背后的法律意义说得更清楚：谁主张该事实、该事实服务于哪一方的请求或抗辩、为什么应由该方承担证明责任。尤其是容易混淆的事实，不要只给结论，要补上一句理由，让老师能看出你的判断路径。这样答案会更稳，也更接近主观题阅卷时期待的表达。",
      "abilityLabel": "证明责任",
      "referenceAnswer": "这里填写本小问参考答案。",
      "rubricGuidance": "这里填写本小问批改说明。",
      "answerMarks": [
        {
          "id": "mark_1",
          "highlight": "白云制药厂排放废气",
          "status": "score",
          "score": 2,
          "comment": "命中采分点：赵某应对污染行为承担证明责任。"
        },
        {
          "id": "mark_2",
          "highlight": "由白云制药厂承担证明责任",
          "status": "wrong",
          "comment": "这里把证明责任主体写反了。该事实属于赵某主张污染行为存在的基础事实，应由赵某承担证明责任。"
        }
      ],
      "rubricPoints": [
        {
          "id": "rubric_1",
          "title": "污染行为证明责任",
          "description": "指出白云制药厂排放废气的事实由赵某承担证明责任。",
          "maxScore": 2,
          "awardedScore": 2,
          "hit": true,
          "comment": "已命中。"
        },
        {
          "id": "rubric_2",
          "title": "其他养殖户未受影响",
          "description": "指出山林周边其他养殖户禽类未受影响的事实由白云制药厂承担证明责任。",
          "maxScore": 2,
          "awardedScore": 0,
          "hit": false,
          "comment": "未体现该事实的证明责任分配。"
        }
      ],
      "missedPoints": [
        {
          "id": "missed_1",
          "title": "遗漏其他养殖户未受影响的证明责任",
          "description": "答案没有说明该事实应由白云制药厂承担证明责任。",
          "score": 2,
          "comment": "该点是独立采分点，不能省略。",
          "suggestion": "补充说明该事实属于抗辩或反证方向，应由白云制药厂承担证明责任。"
        }
      ]
    }
  ]
}`;

export const AI_REVIEW_OUTPUT_JSON_EXAMPLE_PROMPT =
  [
    "输出 JSON 示例，请严格参考字段结构；真实批改时必须替换为本题、本小问、本学生答案对应的数据：",
    AI_REVIEW_OUTPUT_JSON_EXAMPLE,
  ].join("\n");

export const DEFAULT_AI_REVIEW_JSON_NORMALIZER_SYSTEM_PROMPT =
  [
    "你是严格的 JSON 标准化器。",
    "你的任务不是重新批改，而是把批改模型输出的内容整理成系统要求的合法 JSON。",
    "不得改变得分、结论、遗漏点含义或老师点评含义。",
    "只能修复 JSON 语法、字段名、字段结构、字符串引号、Markdown 包裹、数组对象格式等问题。",
    "所有引用学生原文、法律概念或关键词的地方，统一使用中文引号“”，不要在字符串内部使用未转义英文双引号。",
    "最终只能返回一个合法 JSON 对象，不要 Markdown，不要解释文字，不要代码块。",
  ].join("\n");

export const DEFAULT_AI_REVIEW_JSON_NORMALIZER_USER_PROMPT_TEMPLATE =
  [
    "请将下面的 AI 批改结果标准化为系统可解析的 JSON。",
    "",
    "【必须输出的 JSON 模板】",
    AI_REVIEW_OUTPUT_JSON_EXAMPLE,
    "",
    "【标准化规则】",
    "1. 顶层必须是对象，且必须包含 subQuestions 数组。",
    "2. 每个小问必须包含 id、score、reviewComment、missedPoints、answerMarks、rubricPoints。",
    "3. rubricPoints 必须使用 id、title、description、maxScore、awardedScore、hit、comment。",
    "4. missedPoints 必须是对象数组，使用 id、title、description、score、comment、suggestion；如果原始内容是字符串数组，请转换成对象数组。",
    "5. answerMarks 必须是对象数组，使用 id、segmentId 或 start/end/highlight、status、score、comment。",
    "6. 必须保留原始批改中的 wrong 错误批注，不要把 wrong 改成 score/correct；错误批注 comment 必须说明为什么错。",
    "7. 不要重新批改，不要改变原始得分和点评，只做 JSON 标准化。",
    "8. 如果原始结果缺少某些字段，请按模板补空数组或空字符串。",
    "",
    "【原始 AI 批改输出】",
    "{{原始批改输出}}",
    "",
    "请只返回标准化后的 JSON。",
  ].join("\n");

export const DEFAULT_AI_REVIEW_OUTPUT_REQUIREMENTS_PROMPT =
  [
    "只能返回一个合法 JSON 对象，不要 Markdown，不要 ```json 代码块，不要解释文字、前缀或后缀。",
    "所有字符串内容中禁止直接使用未转义的英文双引号 \"；引用学生原文、法律概念或关键词时必须使用中文引号“”或将英文双引号转义为 \\\"。",
    "JSON 顶层必须包含 subQuestions 数组。",
    "每个小问必须包含 id、score、reviewComment、missedPoints、answerMarks、rubricPoints。",
    "score 必须是整数，不能超过该小问分值。",
    "answerMarks 用于局部批注，status 可用 correct、wrong、score、neutral。",
    "answerMarks 必须同时体现得分点和错误点：命中的有效表达用 status:score 或 correct；学生原文中存在事实错误、法律关系错误、结论错误、逻辑错误、主体写反、概念误用时，必须生成 status:wrong 的错误批注。",
    "wrong 错误批注的 comment 必须直接说明为什么错、正确应如何理解；不要只写“错误”“不准确”“表述有误”。",
    "所有命中的得分点都必须在学生原文中找到对应表达并生成一条正向划线；用户所得分数必须全部体现在正向划线部分。",
    "每个正向划线必须带 score，且该 score 必须等于对应得分点的 awardedScore；每个小问所有正向划线的 score 合计必须严格等于该小问 score。",
    "如果某个采分点没有学生原文可以划线，不得给该采分点 awardedScore，也不得把分数计入小问 score。",
    "划线必须精确，只划最能承载判断的关键词、短语或短句，不要整段划线，不要把多个意思合并成一条划线。",
    "正向得分批注不要只划无意义关键词，也不要划完整大段；优先划 6 到 35 个中文字符左右的关键表达。",
    "错误批注必须划学生原文中具体错误的那一小段，例如错误主体、错误法律关系、错误结论或错误理由。",
    "answerMarks 可以使用 highlight 精确匹配学生原文；只有当 answerSegments 中某个 segment 本身足够精确时才使用 segmentId。使用 start/end/highlight 时，answer.slice(start,end) 必须严格等于 highlight。",
    "同一句学生原文只能生成一条正向划线；同一采分点只能对应一条正向划线；answerMarks 之间不得重复、不得重叠。",
    "answerMarks 中 status 为 correct 或 score 的正向批注必须带整数 score，且 score 必须大于 0。",
    "每个小问 answerMarks 中所有正向批注的 score 合计必须严格等于该小问 score。",
    "如果某个得分点没有学生原文可对应，不要生成正向批注；不得用没有 score 的对勾表示得分。",
    "每个小问 reviewComment 必须是 300 到 400 个中文字符的自然语言老师点评，必须展开说明用户哪里答错了、为什么错、正确思路是什么、下次怎么补。",
    "reviewComment 禁止出现具体评分表达，不要写“得了几分”“拿到几分”“扣了几分”“丢了几分”“本问得分为几分”等内容；分数只允许出现在 score、answerMarks.score、rubricPoints.awardedScore 等结构化字段里。",
    "reviewComment 不要出现 AI、模型、系统、自动批改、算法、提示词 等暴露机器痕迹的表述。",
    "rubricPoints 中采分点编号字段必须使用 id，不要使用 pointId、point_id、rubricId 或其他编号字段。",
    "rubricPoints 中每条采分点必须是对象，并且必须使用 id、title、description、maxScore、awardedScore、hit、comment 字段；不要使用 point、achieved、matched 等替代字段。",
    "rubricPoints 中每个未命中的采分点必须设置 hit:false、awardedScore:0，并且必须在 missedPoints 中生成一条对应遗漏点。",
    "rubricPoints 必须逐条覆盖题目数据里提供的所有采分点，不能遗漏、合并或少返回；未命中的采分点也必须返回。",
    "missedPoints 不是可选装饰字段；只要存在未命中的采分点，missedPoints 必须非空，且每条必须包含 title、description 或 comment/suggestion。",
    "missedPoints 中每条遗漏点必须是对象，并且必须使用 id、title、description、score、comment、suggestion 字段；不要返回字符串数组。",
    "如果没有遗漏点，missedPoints 必须返回空数组 []，不要省略字段。",
    "",
    AI_REVIEW_OUTPUT_JSON_EXAMPLE_PROMPT,
  ].join("\n");

export const DEFAULT_MOCK_EXAM_AI_REVIEW_CONFIG = {
  provider: "rules",
  baseUrl: "",
  apiKey: "",
  model: "",
  disableQueue: false,
  timeoutMs: 120000,
  maxConcurrency: 3,
  maxRetryCount: 3,
  retryDelayMs: 15000,
  retryCooldownMs: 2 * 60 * 60 * 1000,
  queuePollIntervalMs: 3000,
  allowRuleFallback: false,
  maxTokens: 8192,
  strictAnswerMarkValidation: true,
  temperature: 0.2,
  jsonNormalizerEnabled: true,
  jsonNormalizerBaseUrl: "",
  jsonNormalizerApiKey: "",
  jsonNormalizerModel: "",
  jsonNormalizerMaxTokens: 16000,
  jsonNormalizerSystemPrompt: DEFAULT_AI_REVIEW_JSON_NORMALIZER_SYSTEM_PROMPT,
  jsonNormalizerUserPromptTemplate: DEFAULT_AI_REVIEW_JSON_NORMALIZER_USER_PROMPT_TEMPLATE,
  systemPrompt: DEFAULT_AI_REVIEW_SYSTEM_PROMPT,
  gradingPrinciplesTemplate: DEFAULT_AI_REVIEW_GRADING_PRINCIPLES_TEMPLATE,
  outputRequirementsPrompt: DEFAULT_AI_REVIEW_OUTPUT_REQUIREMENTS_PROMPT,
  userPromptTemplate: DEFAULT_AI_REVIEW_USER_PROMPT_TEMPLATE,
};

export const createDefaultMockExamAiReviewConfig = () => clone(DEFAULT_MOCK_EXAM_AI_REVIEW_CONFIG);

export const normalizeMockExamAiReviewConfig = (value, envFallback = {}) => {
  const fallback = {
    ...createDefaultMockExamAiReviewConfig(),
    ...Object.fromEntries(Object.entries(envFallback ?? {}).filter(([, item]) => item !== undefined && item !== null && item !== "")),
  };
  const source = value && typeof value === "object" ? value : {};
  const provider = toTrimmedString(source.provider, fallback.provider);

  return {
    provider: provider === "openai-compatible" || provider === "rules" ? provider : fallback.provider,
    baseUrl: normalizeBaseUrl(source.baseUrl, fallback.baseUrl),
    apiKey: typeof source.apiKey === "string" ? source.apiKey.trim() : fallback.apiKey,
    model: toTrimmedString(source.model, fallback.model),
    disableQueue: false,
    timeoutMs: toNonNegativeInt(source.timeoutMs, fallback.timeoutMs),
    maxConcurrency: fallback.maxConcurrency,
    maxRetryCount: fallback.maxRetryCount,
    retryDelayMs: fallback.retryDelayMs,
    retryCooldownMs: fallback.retryCooldownMs,
    queuePollIntervalMs: fallback.queuePollIntervalMs,
    allowRuleFallback: false,
    maxTokens: toPositiveInt(source.maxTokens, fallback.maxTokens),
    strictAnswerMarkValidation: toBool(source.strictAnswerMarkValidation, fallback.strictAnswerMarkValidation ?? true),
    temperature: Number.isFinite(Number(source.temperature)) ? Math.min(Math.max(Number(source.temperature), 0), 2) : Number(fallback.temperature ?? 0.2),
    jsonNormalizerEnabled: toBool(source.jsonNormalizerEnabled, fallback.jsonNormalizerEnabled ?? true),
    jsonNormalizerBaseUrl: normalizeBaseUrl(source.jsonNormalizerBaseUrl, fallback.jsonNormalizerBaseUrl),
    jsonNormalizerApiKey: typeof source.jsonNormalizerApiKey === "string" ? source.jsonNormalizerApiKey.trim() : fallback.jsonNormalizerApiKey,
    jsonNormalizerModel: toTrimmedString(source.jsonNormalizerModel, fallback.jsonNormalizerModel),
    jsonNormalizerMaxTokens: toPositiveInt(source.jsonNormalizerMaxTokens, fallback.jsonNormalizerMaxTokens),
    jsonNormalizerSystemPrompt: toTrimmedString(
      source.jsonNormalizerSystemPrompt,
      fallback.jsonNormalizerSystemPrompt || DEFAULT_AI_REVIEW_JSON_NORMALIZER_SYSTEM_PROMPT,
    ),
    jsonNormalizerUserPromptTemplate: toTrimmedString(
      source.jsonNormalizerUserPromptTemplate,
      fallback.jsonNormalizerUserPromptTemplate || DEFAULT_AI_REVIEW_JSON_NORMALIZER_USER_PROMPT_TEMPLATE,
    ),
    systemPrompt: toTrimmedString(source.systemPrompt, fallback.systemPrompt || DEFAULT_AI_REVIEW_SYSTEM_PROMPT),
    gradingPrinciplesTemplate: toTrimmedString(
      source.gradingPrinciplesTemplate,
      fallback.gradingPrinciplesTemplate || DEFAULT_AI_REVIEW_GRADING_PRINCIPLES_TEMPLATE,
    ),
    outputRequirementsPrompt: toTrimmedString(
      source.outputRequirementsPrompt,
      fallback.outputRequirementsPrompt || DEFAULT_AI_REVIEW_OUTPUT_REQUIREMENTS_PROMPT,
    ),
    userPromptTemplate: normalizePromptTemplatePlaceholders(
      toTrimmedString(source.userPromptTemplate, fallback.userPromptTemplate || DEFAULT_AI_REVIEW_USER_PROMPT_TEMPLATE),
    ),
  };
};

export const getMissingMockExamAiReviewPromptTemplatePlaceholders = (value) => {
  const normalized = normalizePromptTemplatePlaceholders(value);
  return Object.values(AI_REVIEW_PROMPT_TEMPLATE_PLACEHOLDERS).filter((placeholder) => !normalized.includes(placeholder));
};

export const serializeMockExamAiReviewConfigForAdmin = (value, envFallback = {}) => {
  const normalized = normalizeMockExamAiReviewConfig(value, envFallback);
  return {
    ...normalized,
    apiKey: normalized.apiKey ? "********" : "",
    apiKeyConfigured: Boolean(normalized.apiKey),
    jsonNormalizerApiKey: normalized.jsonNormalizerApiKey ? "********" : "",
    jsonNormalizerApiKeyConfigured: Boolean(normalized.jsonNormalizerApiKey),
  };
};
