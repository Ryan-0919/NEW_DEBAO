// 测试AI批改V2系统
import { reviewWithV2 } from '../server/lib/ai-review-v2/index.js';

// 模拟测试数据
const testQuestion = {
  id: 'test_q_1',
  type: 'subjective_case',
  score: 10,
  stem: '请回答以下问题',
  material: '某公司与员工发生劳动纠纷',
  questionMetaJson: JSON.stringify({
    subQuestions: [
      {
        id: 'test_sq_1',
        title: '小问(1)：本案中的证明责任如何分配？',
        maxScore: 10,
        referenceAnswer: '原告应对劳动关系存在承担证明责任',
        rubricGuidance: '重点考察证明责任分配',
        rubricPoints: [
          {
            id: 'rp_1',
            title: '原告证明劳动关系',
            description: '原告应证明劳动关系存在',
            maxScore: 5,
            score: 5
          },
          {
            id: 'rp_2',
            title: '被告证明解除合法',
            description: '被告应证明解除劳动合同合法',
            maxScore: 5,
            score: 5
          }
        ]
      }
    ]
  })
};

const testAnswer = {
  questionId: 'test_q_1',
  answerJson: JSON.stringify({
    'test_sq_1': '本案中，劳动关系的证明责任由被告公司承担，因为用人单位掌握相关证据。'
  })
};

async function test() {
  console.log('🧪 开始测试AI批改V2系统...\n');

  try {
    console.log('📝 测试数据：');
    console.log('题目：', testQuestion.stem);
    console.log('学生答案：', JSON.parse(testAnswer.answerJson)['test_sq_1']);
    console.log('');

    console.log('⏳ 正在调用V2批改系统...\n');

    const result = await reviewWithV2({
      question: testQuestion,
      answer: testAnswer,
      recordId: 'test_record_1'
    });

    console.log('✅ 批改成功！\n');

    console.log('📊 批改结果：');
    console.log('─'.repeat(60));

    const reviewJson = result.reviewJson;
    console.log(`总分：${reviewJson.totalScore} / ${reviewJson.maxScore}`);
    console.log(`版本：${reviewJson.version}`);
    console.log(`来源：${reviewJson.reviewSource}`);
    console.log('');

    for (const sq of reviewJson.subQuestions) {
      console.log(`【${sq.title}】`);
      console.log(`得分：${sq.score} / ${sq.maxScore}`);
      console.log('');

      console.log('正向标注：');
      const positiveMarks = sq.answerMarks.filter(m => m.status === 'score');
      if (positiveMarks.length > 0) {
        positiveMarks.forEach(m => {
          console.log(`  ✓ "${m.highlight}" [+${m.score}分]`);
          console.log(`    ${m.comment}`);
        });
      } else {
        console.log('  无');
      }
      console.log('');

      console.log('错误标注：');
      const wrongMarks = sq.answerMarks.filter(m => m.status === 'wrong');
      if (wrongMarks.length > 0) {
        wrongMarks.forEach(m => {
          console.log(`  ✗ "${m.highlight}"`);
          console.log(`    ${m.comment}`);
        });
      } else {
        console.log('  无');
      }
      console.log('');

      console.log('遗漏点：');
      if (sq.missedPoints.length > 0) {
        sq.missedPoints.forEach(mp => {
          console.log(`  ⊗ ${mp.title}`);
        });
      } else {
        console.log('  无');
      }
      console.log('');

      console.log('点评：');
      console.log(`  ${sq.reviewComment}`);
      console.log('');
    }

    console.log('─'.repeat(60));
    console.log('');

    console.log('🔍 验证结果：');
    if (result.validation) {
      console.log(`验证通过：${result.validation.passed ? '是' : '否'}`);
      console.log(`错误数：${result.validation.errorCount || 0}`);
      console.log(`警告数：${result.validation.warningCount || 0}`);

      if (result.validation.errors && result.validation.errors.length > 0) {
        console.log('');
        console.log('验证问题：');
        result.validation.errors.forEach(e => {
          console.log(`  [${e.severity}] ${e.message}`);
        });
      }
    }
    console.log('');

    console.log('📈 批改指标：');
    const positiveCount = reviewJson.subQuestions.reduce(
      (sum, sq) => sum + sq.answerMarks.filter(m => m.status === 'score').length, 0
    );
    const errorCount = reviewJson.subQuestions.reduce(
      (sum, sq) => sum + sq.answerMarks.filter(m => m.status === 'wrong').length, 0
    );
    console.log(`正向标注数：${positiveCount}`);
    console.log(`错误标注数：${errorCount}`);
    console.log(`日志ID：${result.logId}`);
    console.log('');

    if (errorCount > 0) {
      console.log('✅ 测试通过！AI成功标注了错误点！');
    } else {
      console.log('⚠️  警告：AI没有标注错误点！');
    }

  } catch (error) {
    console.error('❌ 测试失败：', error.message);
    console.error(error);
    process.exit(1);
  }
}

test();
