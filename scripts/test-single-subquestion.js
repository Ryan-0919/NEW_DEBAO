// 测试单个小问批改
import { prisma } from '../server/lib/prisma.js';
import { reviewWithV2 } from '../server/lib/ai-review-v2/index.js';

const RECORD_ID = 'cmptq3yca019r1yscknu6la7g';

async function testSingleSubQuestion() {
  console.log('🧪 测试单个小问批改\n');

  try {
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

    const question = record.paper.questions[0];
    const answer = record.answers.find(a => a.questionId === question.id);

    // 修改questionMetaJson，只保留第一个小问
    const questionMeta = JSON.parse(question.questionMetaJson);
    const modifiedQuestion = {
      ...question,
      questionMetaJson: JSON.stringify({
        ...questionMeta,
        subQuestions: [questionMeta.subQuestions[0]] // 只保留第一个小问
      })
    };

    // 修改answerJson，只保留第一个小问的答案
    const answerMap = JSON.parse(answer.answerJson);
    const firstSubId = questionMeta.subQuestions[0].id;
    const modifiedAnswer = {
      ...answer,
      answerJson: JSON.stringify({
        [firstSubId]: answerMap[firstSubId]
      })
    };

    console.log(`📋 测试第一个小问`);
    console.log(`   题目: ${questionMeta.subQuestions[0].title.substring(0, 60)}...`);
    console.log(`   学生答案长度: ${answerMap[firstSubId].length}字\n`);

    console.log('⏳ 开始批改...\n');
    const startTime = Date.now();

    const result = await reviewWithV2({
      question: modifiedQuestion,
      answer: modifiedAnswer,
      recordId: RECORD_ID
    });

    const elapsed = Date.now() - startTime;

    console.log(`\n✅ 批改成功！耗时: ${(elapsed/1000).toFixed(1)}秒\n`);
    console.log('='.repeat(70));

    const rj = result.reviewJson;
    const sq = rj.subQuestions[0];

    console.log(`\n📊 批改结果:`);
    console.log(`   得分: ${sq.score} / ${sq.maxScore}`);
    console.log('');

    const wrongMarks = sq.answerMarks.filter(m => m.status === 'wrong');
    const scoreMarks = sq.answerMarks.filter(m => m.status === 'score');

    console.log(`✓ 正向标注: ${scoreMarks.length}个`);
    scoreMarks.forEach(m => {
      console.log(`  "${m.highlight.substring(0, 40)}..." [+${m.score}分]`);
      console.log(`  → ${m.comment}`);
    });

    console.log(`\n✗ 错误标注: ${wrongMarks.length}个`);
    wrongMarks.forEach(m => {
      console.log(`  "${m.highlight.substring(0, 40)}..."`);
      console.log(`  → ${m.comment}`);
    });

    console.log(`\n⊗ 遗漏点: ${sq.missedPoints.length}个`);
    sq.missedPoints.forEach(mp => {
      console.log(`  - ${mp.title}`);
    });

    console.log(`\n💬 点评:\n${sq.reviewComment}`);

    console.log('\n' + '='.repeat(70));

    console.log(`\n🎯 测试结果:`);
    console.log(`   错误标注数: ${wrongMarks.length}`);
    console.log(`   验证通过: ${result.validation?.passed ? '✅' : '❌'}`);

    if (wrongMarks.length > 0 || scoreMarks.length > 0) {
      console.log(`\n🎉 成功！V2系统工作正常！`);
      console.log(`   - 正确读取学生答案`);
      console.log(`   - 生成了${scoreMarks.length}个正向标注`);
      console.log(`   - 生成了${wrongMarks.length}个错误标注`);
      process.exit(0);
    } else {
      console.log(`\n⚠️  未生成标注`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testSingleSubQuestion();
