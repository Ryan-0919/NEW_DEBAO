// 用真实数据测试V2批改系统
import { prisma } from '../server/lib/prisma.js';
import { reviewWithV2 } from '../server/lib/ai-review-v2/index.js';

const RECORD_ID = 'cmptq3yca019r1yscknu6la7g';

async function testWithRealData() {
  console.log('🧪 使用真实数据测试V2批改系统\n');
  console.log(`📝 记录ID: ${RECORD_ID}\n`);

  try {
    // 1. 读取完整记录
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
              include: {
                options: true
              },
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        answers: true
      }
    });

    if (!record) {
      console.log('❌ 记录不存在');
      process.exit(1);
    }

    console.log(`✅ 记录状态: ${record.reviewWorkflowStatus}`);
    console.log(`   主观题数量: ${record.paper.questions.length}`);
    console.log('');

    // 2. 选择第一道主观题测试
    const question = record.paper.questions[0];
    const answer = record.answers.find(a => a.questionId === question.id);

    if (!question) {
      console.log('❌ 没有主观题');
      process.exit(1);
    }

    console.log(`📋 测试题目: ${question.stem?.substring(0, 80)}...`);
    console.log(`   题目ID: ${question.id}`);
    console.log('');

    if (answer?.answerJson) {
      const answerMap = JSON.parse(answer.answerJson);
      const firstAnswer = Object.values(answerMap)[0];
      console.log(`📝 学生答案预览: ${firstAnswer?.substring(0, 100)}...`);
    } else {
      console.log('⚠️  学生未作答');
    }
    console.log('');

    // 3. 执行V2批改
    console.log('⏳ 开始V2批改...\n');
    const startTime = Date.now();

    const result = await reviewWithV2({
      question,
      answer,
      recordId: RECORD_ID
    });

    const elapsed = Date.now() - startTime;

    console.log(`\n✅ 批改成功！耗时: ${(elapsed/1000).toFixed(1)}秒\n`);
    console.log('='.repeat(70));

    // 4. 显示结果
    const rj = result.reviewJson;
    console.log(`\n📊 批改结果:`);
    console.log(`   总分: ${rj.totalScore} / ${rj.maxScore}`);
    console.log(`   小问数: ${rj.subQuestions.length}`);
    console.log('');

    rj.subQuestions.forEach((sq, i) => {
      console.log(`【小问${i+1}】 ${sq.title?.substring(0, 50)}...`);
      console.log(`   得分: ${sq.score} / ${sq.maxScore}`);

      const wrongMarks = sq.answerMarks.filter(m => m.status === 'wrong');
      const scoreMarks = sq.answerMarks.filter(m => m.status === 'score');

      console.log(`   ✓ 正向标注: ${scoreMarks.length}个`);
      console.log(`   ✗ 错误标注: ${wrongMarks.length}个`);
      console.log(`   ⊗ 遗漏点: ${sq.missedPoints.length}个`);
      console.log('');
    });

    console.log('='.repeat(70));

    // 5. 验证关键指标
    const totalWrongMarks = rj.subQuestions.reduce(
      (sum, sq) => sum + sq.answerMarks.filter(m => m.status === 'wrong').length, 0
    );

    console.log(`\n🎯 关键指标:`);
    console.log(`   错误标注总数: ${totalWrongMarks}`);
    console.log(`   日志ID: ${result.logId || 'N/A'}`);
    console.log(`   验证通过: ${result.validation?.passed ? '✅' : '❌'}`);

    if (result.validation?.errors?.length > 0) {
      console.log(`\n⚠️  验证问题:`);
      result.validation.errors.forEach(e => {
        console.log(`   [${e.severity}] ${e.message}`);
      });
    }

    if (totalWrongMarks > 0) {
      console.log(`\n🎉 成功！V2系统正确标注了${totalWrongMarks}个错误！`);
      process.exit(0);
    } else {
      console.log(`\n⚠️  V2系统没有标注错误`);
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

testWithRealData();
