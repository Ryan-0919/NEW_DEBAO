// 完整的端到端测试（带详细日志）
import { reviewWithV2 } from '../server/lib/ai-review-v2/index.js';

// 简单的测试数据
const testQuestion = {
  id: 'test_q_1',
  type: 'subjective_case',
  score: 10,
  stem: '请分析本案的法律关系',
  material: '甲公司与乙签订劳动合同',
  questionMetaJson: JSON.stringify({
    subQuestions: [
      {
        id: 'sq_1',
        title: '本案属于什么法律关系？',
        maxScore: 10,
        referenceAnswer: '劳动关系',
        rubricPoints: [
          {
            id: 'rp_1',
            title: '识别为劳动关系',
            description: '正确识别为劳动关系',
            maxScore: 5
          },
          {
            id: 'rp_2',
            title: '说明劳动关系特征',
            description: '说明劳动关系的人身和财产从属性',
            maxScore: 5
          }
        ]
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

async function test() {
  console.log('🧪 完整端到端测试\n');
  console.log('学生答案（错误）：本案属于雇佣关系...\n');
  console.log('⏳ 开始批改...\n');

  const startTime = Date.now();

  try {
    const result = await reviewWithV2({
      question: testQuestion,
      answer: testAnswer,
      recordId: 'test_' + Date.now()
    });

    const elapsed = Date.now() - startTime;

    console.log(`\n✅ 批改成功！耗时：${elapsed}ms\n`);
    console.log('=' .repeat(60));

    const rj = result.reviewJson;
    const sq = rj.subQuestions[0];

    console.log(`得分：${sq.score} / ${sq.maxScore}`);
    console.log('');

    // 检查错误标注
    const wrongMarks = sq.answerMarks.filter(m => m.status === 'wrong');
    const scoreMarks = sq.answerMarks.filter(m => m.status === 'score');

    console.log(`✓ 正向标注：${scoreMarks.length}个`);
    scoreMarks.forEach(m => {
      console.log(`  "${m.highlight}" [+${m.score}分]`);
    });

    console.log(`\n✗ 错误标注：${wrongMarks.length}个`);
    wrongMarks.forEach(m => {
      console.log(`  "${m.highlight}"`);
      console.log(`  原因：${m.comment.substring(0, 100)}...`);
    });

    console.log(`\n遗漏点：${sq.missedPoints.length}个`);
    sq.missedPoints.forEach(mp => {
      console.log(`  - ${mp.title}`);
    });

    console.log('\n' + '='.repeat(60));

    // 验证结果
    if (result.validation) {
      console.log(`\n验证：${result.validation.passed ? '✅ 通过' : '❌ 失败'}`);
      if (!result.validation.passed) {
        result.validation.errors.forEach(e => {
          console.log(`  [${e.severity}] ${e.message}`);
        });
      }
    }

    // 关键检查
    console.log('\n🎯 关键指标：');
    console.log(`  错误标注数：${wrongMarks.length} ${wrongMarks.length > 0 ? '✅' : '❌ 应该>0'}`);
    console.log(`  日志ID：${result.logId || 'N/A'}`);

    if (wrongMarks.length > 0) {
      console.log('\n🎉 成功！AI正确标注了错误！');
    } else {
      console.log('\n⚠️  失败：AI没有标注错误');
    }

    process.exit(wrongMarks.length > 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ 批改失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
