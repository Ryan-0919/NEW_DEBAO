// 全面测试脚本 - Task 4
import { reviewWithV2 } from '../server/lib/ai-review-v2/index.js';
import { prisma } from '../server/lib/prisma.js';

const RECORD_ID = 'cmptq3yca019r1yscknu6la7g'; // 真实记录ID

async function runAllTests() {
  console.log('🧪 开始全面测试AI批改系统V2\n');
  console.log('='.repeat(70));

  const results = [];

  try {
    // 获取真实数据
    const record = await prisma.mockExamRecord.findUnique({
      where: { id: RECORD_ID },
      include: {
        paper: {
          include: {
            questions: {
              where: {
                isActive: true,
                type: 'subjective_case'
              },
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        answers: true
      }
    });

    if (!record || !record.paper.questions.length) {
      console.log('❌ 未找到测试数据');
      process.exit(1);
    }

    const question = record.paper.questions[0];
    const answer = record.answers.find(a => a.questionId === question.id);
    const questionMeta = JSON.parse(question.questionMetaJson);

    console.log(`\n📋 测试题目信息:`);
    console.log(`   题目ID: ${question.id}`);
    console.log(`   小问数量: ${questionMeta.subQuestions.length}`);
    console.log('');

    // Test 1: 单小问测试
    await runTest({
      name: 'Test 1: 单小问批改',
      question,
      answer,
      subQuestionIndices: [0],
      questionMeta,
      results
    });

    // Test 2: 双小问测试
    if (questionMeta.subQuestions.length >= 2) {
      await runTest({
        name: 'Test 2: 双小问批改',
        question,
        answer,
        subQuestionIndices: [0, 1],
        questionMeta,
        results
      });
    }

    // Test 3: 三小问测试
    if (questionMeta.subQuestions.length >= 3) {
      await runTest({
        name: 'Test 3: 三小问批改（触发逐个批改）',
        question,
        answer,
        subQuestionIndices: [0, 1, 2],
        questionMeta,
        results
      });
    }

    // Test 4: 学生未作答
    await runTest({
      name: 'Test 4: 学生未作答',
      question,
      answer: { ...answer, answerJson: JSON.stringify({}) },
      subQuestionIndices: [0],
      questionMeta,
      results
    });

    // Test 5: 全部小问
    await runTest({
      name: 'Test 5: 全部小问',
      question,
      answer,
      subQuestionIndices: null, // null表示全部
      questionMeta,
      results
    });

  } catch (error) {
    console.error('\n❌ 测试过程异常:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  // 输出测试总结
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 测试总结\n');

  let passCount = 0;
  let failCount = 0;

  results.forEach((result, i) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.name}`);
    console.log(`   耗时: ${(result.latency / 1000).toFixed(1)}s`);

    if (result.success) {
      passCount++;
      console.log(`   得分: ${result.score}/${result.maxScore}`);
      console.log(`   错误标注: ${result.errorMarks}个`);
      console.log(`   正向标注: ${result.positiveMarks}个`);
    } else {
      failCount++;
      console.log(`   错误: ${result.error}`);
    }
    console.log('');
  });

  console.log(`总计: ${results.length}个测试`);
  console.log(`通过: ${passCount}个 ✅`);
  console.log(`失败: ${failCount}个 ❌`);
  console.log(`成功率: ${((passCount / results.length) * 100).toFixed(1)}%`);

  if (passCount === results.length) {
    console.log('\n🎉 所有测试通过！Phase 1 核心引擎达到100%！');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分测试失败，需要进一步优化');
    process.exit(1);
  }
}

async function runTest({ name, question, answer, subQuestionIndices, questionMeta, results }) {
  console.log(`\n${name}`);
  console.log('-'.repeat(70));

  const startTime = Date.now();

  try {
    // 构造测试用的题目
    let testQuestion = question;
    let testAnswer = answer;

    if (subQuestionIndices !== null) {
      // 只保留指定的小问
      const selectedSubQuestions = subQuestionIndices.map(i => questionMeta.subQuestions[i]);
      testQuestion = {
        ...question,
        questionMetaJson: JSON.stringify({
          ...questionMeta,
          subQuestions: selectedSubQuestions
        })
      };

      // 构造对应的答案
      const answerMap = JSON.parse(answer.answerJson || '{}');
      const filteredAnswerMap = {};
      selectedSubQuestions.forEach(sq => {
        filteredAnswerMap[sq.id] = answerMap[sq.id] || '';
      });
      testAnswer = {
        ...answer,
        answerJson: JSON.stringify(filteredAnswerMap)
      };

      console.log(`   测试小问: ${subQuestionIndices.map(i => i + 1).join(', ')}`);
    } else {
      console.log(`   测试小问: 全部（${questionMeta.subQuestions.length}个）`);
    }

    // 执行批改
    const result = await reviewWithV2({
      question: testQuestion,
      answer: testAnswer,
      recordId: `test_${Date.now()}`
    });

    const latency = Date.now() - startTime;

    // 统计结果
    const rj = result.reviewJson;
    const errorMarks = rj.subQuestions.reduce(
      (sum, sq) => sum + sq.answerMarks.filter(m => m.status === 'wrong').length, 0
    );
    const positiveMarks = rj.subQuestions.reduce(
      (sum, sq) => sum + sq.answerMarks.filter(m => m.status === 'score').length, 0
    );

    console.log(`✅ 批改成功`);
    console.log(`   耗时: ${(latency / 1000).toFixed(1)}s`);
    console.log(`   得分: ${rj.totalScore}/${rj.maxScore}`);
    console.log(`   错误标注: ${errorMarks}个`);
    console.log(`   正向标注: ${positiveMarks}个`);

    results.push({
      name,
      success: true,
      latency,
      score: rj.totalScore,
      maxScore: rj.maxScore,
      errorMarks,
      positiveMarks
    });

  } catch (error) {
    const latency = Date.now() - startTime;

    console.log(`❌ 批改失败`);
    console.log(`   错误: ${error.message}`);

    results.push({
      name,
      success: false,
      latency,
      error: error.message
    });
  }
}

runAllTests();
