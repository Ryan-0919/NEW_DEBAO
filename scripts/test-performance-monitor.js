// AI批改系统V2 - 性能监控测试
import { reviewWithV2 } from '../server/lib/ai-review-v2/index.js';
import { getPerformanceMonitor } from '../server/lib/ai-review-v2/performance-monitor.js';
import { prisma } from '../server/lib/prisma.js';

async function testPerformanceMonitoring() {
  console.log('🧪 开始性能监控测试\n');

  try {
    // 获取测试题目
    const question = await prisma.mockExamQuestion.findFirst({
      where: {
        id: 'cmp43ooee0013l9sc835fyoip'
      }
    });

    if (!question) {
      throw new Error('测试题目不存在');
    }

    // 准备测试答案
    const testAnswer = {
      answerJson: JSON.stringify({
        sub_1: "陈某提起的自诉属于法定自诉案件范围。根据刑事诉讼法第210条规定，公安机关或人民检察院不予追究被告人刑事责任的案件，被害人有证据证明的，可以向人民法院提起自诉。在本案中，公安机关认为陈某情节显著轻微，不予立案，陈某有监控录像、伤情鉴定等证据，符合刑事诉讼法210条关于自诉案件的范围。",
        sub_2: "法院在庭审审查中证据充分、事实清楚决定开庭的做法是合法的。根据刑事诉讼法211条规定，人民法院对自诉案件审查后，认为犯罪事实清楚，有足够证据的案件，应当开庭审判。在本案中，该法院决定开庭的做法是合法的。",
        sub_3: "法院以【附带民事诉讼须在立案时一并提起】为由不予受理的做法是不正确。根据刑事诉讼法第101条规定，被害人由于被告人的犯罪行为而遭受物质损失的，在刑事诉讼中，有权提起附带民事诉讼。在根据该法104条规定，附带民事诉讼应当同刑事案件一并审判，可见，被害人提起附带民事诉讼的时间为宣告判决前，在本案中，法院尚未作出判决，因此应当受理被害人提起的附带民事诉讼请求。\n刘某在定期宣判前委托律师的请求应当被准许。\n根据刑事诉讼法第34条规定，被告人有权随时委托辩护人，在本案中，陈某为原告，刘某为被告，法院作出有效判决前，被告刘某有权随时委托律师辩护。"
      })
    };

    const monitor = getPerformanceMonitor();

    console.log('━'.repeat(60));
    console.log('📊 测试场景1: 单次完整批改（3个小问）');
    console.log('━'.repeat(60) + '\n');

    const result1 = await reviewWithV2({
      question,
      answer: testAnswer,
      recordId: 'test-perf-' + Date.now()  // 提供测试用的recordId
    });

    console.log(`\n✅ 批改完成`);
    if (result1 && result1.result && result1.result.subQuestions) {
      console.log(`   总分: ${result1.result.subQuestions.reduce((sum, sq) => sum + sq.score, 0)}`);
      console.log(`   小问数: ${result1.result.subQuestions.length}`);
    } else {
      console.log(`   结果: `, result1);
    }

    // 打印第一次报告
    monitor.printReport();

    console.log('━'.repeat(60));
    console.log('📊 测试场景2: 连续批改5次');
    console.log('━'.repeat(60) + '\n');

    for (let i = 0; i < 5; i++) {
      console.log(`\n[批改 ${i + 1}/5]`);
      await reviewWithV2({
        question,
        answer: testAnswer,
        recordId: 'test-perf-batch-' + Date.now() + '-' + i
      });
    }

    console.log('\n✅ 5次批改完成\n');

    // 打印累积报告
    monitor.printReport();

    console.log('━'.repeat(60));
    console.log('📊 性能分析');
    console.log('━'.repeat(60) + '\n');

    const finalReport = monitor.getReport();

    // 计算性能指标
    const avgTotalTime = (finalReport.phase1.avgTimeMs || 0) + (finalReport.phase2.avgTimeMs || 0);
    const avgTokenPerRequest = Math.round(
      (finalReport.phase1.avgTokensPerRequest || 0) + (finalReport.phase2.avgTokensPerRequest || 0)
    );

    console.log('【关键指标】');
    console.log(`  ⏱️  平均单小问耗时: ${avgTotalTime}ms`);
    console.log(`  📊 平均Token消耗: ${avgTokenPerRequest} tokens`);
    console.log(`  ✅ 阶段1解析成功率: ${finalReport.phase1.parseSuccessRate}`);
    console.log(`  ✅ 阶段2解析成功率: ${finalReport.phase2.parseSuccessRate}`);
    console.log(`  🚀 最大并发数: ${finalReport.concurrent.maxConcurrent}`);
    console.log(`  💯 总体成功率: ${finalReport.summary.successRate}`);

    console.log('\n【成本估算】');
    const totalTokens = finalReport.totalTokenUsage.total;
    const estimatedCost = (totalTokens / 1000000) * 15; // 假设$15/1M tokens
    console.log(`  总Token消耗: ${totalTokens.toLocaleString()}`);
    console.log(`  估算成本: $${estimatedCost.toFixed(4)}`);

    console.log('\n【性能评级】');
    if (avgTotalTime < 10000) {
      console.log(`  速度: ⭐⭐⭐⭐⭐ 优秀 (${avgTotalTime}ms < 10s)`);
    } else if (avgTotalTime < 15000) {
      console.log(`  速度: ⭐⭐⭐⭐ 良好 (${avgTotalTime}ms < 15s)`);
    } else {
      console.log(`  速度: ⭐⭐⭐ 一般 (${avgTotalTime}ms > 15s)`);
    }

    const phase1Success = parseFloat(finalReport.phase1.parseSuccessRate);
    const phase2Success = parseFloat(finalReport.phase2.parseSuccessRate);
    const avgParseSuccess = (phase1Success + phase2Success) / 2;

    if (avgParseSuccess >= 95) {
      console.log(`  稳定性: ⭐⭐⭐⭐⭐ 优秀 (${avgParseSuccess.toFixed(1)}%)`);
    } else if (avgParseSuccess >= 85) {
      console.log(`  稳定性: ⭐⭐⭐⭐ 良好 (${avgParseSuccess.toFixed(1)}%)`);
    } else {
      console.log(`  稳定性: ⭐⭐⭐ 一般 (${avgParseSuccess.toFixed(1)}%)`);
    }

    console.log('\n✅ 性能监控测试完成！\n');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
testPerformanceMonitoring().catch(error => {
  console.error('测试异常:', error);
  process.exit(1);
});
