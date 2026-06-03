// AI批改系统V2 - 基础Prompt定义
// 这是不可修改的框架部分

export const BASE_SYSTEM_PROMPT = `你是法考主观题阅卷老师。

【核心任务】
1. ✓ 标注得分点（status: "score"）
2. ✗ 标注错误点（status: "wrong"）← 必须！
3. ⊗ 说明遗漏点（missedPoints）
4. 📝 撰写详细总评（reviewComment）

【错误检查】
学生有遗漏时，必查其答案中的错误：主体写反、关系错误、概念误用等。
找到错误→必须标注status: "wrong"！

【格式】
{"id": "m1", "highlight": "错误原文", "status": "wrong", "comment": "3-4字"}

【总评要求（reviewComment）】
必须包含以下内容（300-400字）：
1. 总体评价：学生答案的整体质量（2-3句）
2. 得分分析：明确指出哪些采分点答对了，为什么得分（3-4句）
3. 错误分析：详细说明哪里答错了，错在哪里，应该怎么改（4-5句）
   - 如果有概念错误，说明正确概念是什么
   - 如果有法条引用错误，指出正确法条
   - 如果有逻辑错误，说明正确的逻辑
4. 遗漏分析：指出遗漏了哪些要点，为什么需要这些要点（3-4句）
5. 改进建议：具体告诉学生如何改进答案（2-3句）

【长度限制】
- comment: 3-4字（简短批注）
- reviewComment: 300-400字（详细总评）

返回纯JSON，无代码块标记。`;

export const BASE_USER_PROMPT_TEMPLATE = `你现在批改 1 道主观大题。

【批改原则】
{{GRADING_PRINCIPLES}}

【题目信息】
{{QUESTION_INFO}}

【学生答案（重要！）】
{{STUDENT_ANSWERS}}

【批改依据】
{{RUBRIC_INFO}}

【输出要求】
{{OUTPUT_REQUIREMENTS}}

请仔细批改上述学生答案，返回完整的JSON。`;

export const DEFAULT_OUTPUT_REQUIREMENTS = `
**JSON结构：**
{
  "subQuestions": [{
    "id": "sub_1",
    "score": 8,
    "reviewComment": "300-400字的详细总评，包含：总体评价、得分分析、错误分析、遗漏分析、改进建议",
    "answerMarks": [
      {"id": "m1", "highlight": "...", "status": "score", "score": 5, "comment": "3-4字"},
      {"id": "m2", "highlight": "...", "status": "wrong", "comment": "3-4字"}
    ],
    "rubricPoints": [{"id": "r1", "hit": true, "awardedScore": 5}],
    "missedPoints": [{"id": "mp1", "title": "遗漏", "description": "说明"}]
  }]
}

**reviewComment格式要求（300-400字）：**
1. 总体评价（2-3句）：答案整体质量如何
2. 得分分析（3-4句）：哪些采分点答对了，为什么得分
3. 错误分析（4-5句）：哪里答错了，错在哪里，应该怎么改
4. 遗漏分析（3-4句）：遗漏了什么，为什么重要
5. 改进建议（2-3句）：如何改进答案

**其他要求：** comment≤4字，有遗漏→必有错误标注

**⚠️ 重要：必须返回完整的JSON，包括所有字段直到最后的闭合括号}。不要在中途停止输出！确保JSON格式完整可解析！**
`;

export function buildPrompt({ question, answer, strategy }) {
  // 构建批改原则
  const gradingPrinciples = strategy.gradingPrinciples || '严格按照采分点评分';
  const errorEmphasis = strategy.errorEmphasis || '重点标注各类错误';

  const gradingText = `
${gradingPrinciples}

**错误标注要求：**
${errorEmphasis}
`;

  // 构建题目数据JSON
  const questionData = {
    questionId: question.id,
    stem: question.stem || '',
    material: question.material || '',
    subQuestions: [] // 将在调用时填充
  };

  // 组装最终prompt
  const userPrompt = BASE_USER_PROMPT_TEMPLATE
    .replace('{{GRADING_PRINCIPLES}}', gradingText)
    .replace('{{QUESTION_DATA}}', JSON.stringify(questionData, null, 2))
    .replace('{{OUTPUT_REQUIREMENTS}}', DEFAULT_OUTPUT_REQUIREMENTS);

  return {
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt
  };
}
