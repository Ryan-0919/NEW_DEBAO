// 测试答案解析
import { prisma } from '../server/lib/prisma.js';

const testQuestion = {
  id: 'test_q_1',
  questionMetaJson: JSON.stringify({
    subQuestions: [
      {
        id: 'sq_1',
        title: '本案属于什么法律关系？',
        maxScore: 10
      }
    ]
  })
};

const testAnswer = {
  questionId: 'test_q_1',
  answerJson: JSON.stringify({
    'sq_1': '本案属于雇佣关系，因为乙为甲公司工作并获得报酬。'
  })
};

function getQuestionMeta(question) {
  const raw = question.questionMetaJson ? JSON.parse(question.questionMetaJson) : {};
  return {
    subQuestions: Array.isArray(raw.subQuestions) ? raw.subQuestions : []
  };
}

function parseSubjectiveAnswerMap(answerJson, question) {
  const raw = answerJson ? JSON.parse(answerJson) : {};
  const subQuestions = getQuestionMeta(question).subQuestions;
  return Object.fromEntries(
    subQuestions.map(sq => [sq.id, raw[sq.id] || ''])
  );
}

console.log('测试答案解析逻辑\n');

console.log('1. questionMetaJson:', testQuestion.questionMetaJson);
console.log('');

console.log('2. answerJson:', testAnswer.answerJson);
console.log('');

const meta = getQuestionMeta(testQuestion);
console.log('3. questionMeta:', JSON.stringify(meta, null, 2));
console.log('');

const answerMap = parseSubjectiveAnswerMap(testAnswer.answerJson, testQuestion);
console.log('4. answerMap:', JSON.stringify(answerMap, null, 2));
console.log('');

console.log('5. 学生答案:', answerMap['sq_1']);
console.log('   长度:', answerMap['sq_1'].length);
console.log('');

if (answerMap['sq_1']) {
  console.log('✅ 答案解析成功！');
} else {
  console.log('❌ 答案解析失败！');
}

prisma.$disconnect();
