// 端到端测试 - 触发真实批改并监控性能
import { prisma } from '../server/lib/prisma.js';
import { autoReviewMockExamRecord } from '../server/lib/mock-exams.js';

async function testE2EWithMonitoring() {
  console.log('🧪 端到端测试 - AI批改V2 + 性能监控\n');

  try {
    // 1. 查找一个已提交但未批改的记录
    console.log('📋 查找测试记录...');
    const testRecord = await prisma.mockExamRecord.findFirst({
      where: {
        submittedAt: { not: null },
        reviewWorkflowStatus: { in: ['ai_pending', 'not_required'] }
      },
      orderBy: { submittedAt: 'desc' }
    });

    if (!testRecord) {
      console.log('❌ 没有找到可用的测试记录');
      console.log('💡 提示：需要有已提交但未批改的模拟考试记录');

      // 列出最近的记录状态
      const recentRecords = await prisma.mockExamRecord.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          examId: true,
          reviewWorkflowStatus: true,
          submittedAt: true
        }
      });

      console.log('\n最近5条记录状态：');
      recentRecords.forEach(r => {
        console.log(`  ID: ${r.id}, 状态: ${r.reviewWorkflowStatus}, 已提交: ${r.submittedAt ? '是' : '否'}`);
      });

      process.exit(0);
    }

    console.log(`✅ 找到测试记录: ${testRecord.id}`);
    console.log(`   考试ID: ${testRecord.examId}`);
    console.log(`   当前状态: ${testRecord.reviewWorkflowStatus}\n`);

    // 2. 检查性能监控初始状态
    console.log('📊 批改前性能数据：');
    const beforeUrl = 'http://localhost:3011/api/admin/ai-review-v2/performance';
    const beforeResponse = await fetch(beforeUrl);
    const beforeData = await beforeResponse.json();
    console.log(`   总请求数: ${beforeData.data.summary.totalRequests}`);
    console.log(`   成功率: ${beforeData.data.summary.successRate}\n`);

    // 3. 触发AI批改
    console.log('🚀 开始AI批改V2...\n');
    const startTime = Date.now();

    const result = await autoReviewMockExamRecord({
      db: prisma,
      recordId: testRecord.id,
      runtimeConfig: {
        openAiCompatible: {
          endpoint: process.env.AI_ENDPOINT || 'https://xcode.best/v1/chat/completions',
          apiKey: process.env.AI_API_KEY || '',
          model: process.env.AI_MODEL || 'claude-opus-4-8'
        }
      }
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n✅ 批改完成！耗时: ${duration}秒\n`);

    // 4. 检查批改结果
    console.log('📝 批改结果：');
    const updatedRecord = await prisma.mockExamRecord.findUnique({
      where: { id: testRecord.id },
      include: {
        answers: {
          include: {
            question: true
          }
        }
      }
    });

    let totalScore = 0;
    let totalQuestions = 0;

    updatedRecord.answers.forEach(answer => {
      if (answer.question.type === 'subjective' && answer.reviewJson) {
        const review = JSON.parse(answer.reviewJson);
        if (review.subQuestions) {
          review.subQuestions.forEach(sq => {
            totalScore += sq.score || 0;
            totalQuestions++;
          });
        }
      }
    });

    console.log(`   总得分: ${totalScore}`);
    console.log(`   批改小问数: ${totalQuestions}`);
    console.log(`   批改来源: ${updatedRecord.answers[0]?.reviewJson ? JSON.parse(updatedRecord.answers[0].reviewJson).reviewSource : 'N/A'}\n`);

    // 5. 等待性能数据更新
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 6. 检查性能监控数据
    console.log('━'.repeat(60));
    console.log('📊 批改后性能监控数据：');
    console.log('━'.repeat(60) + '\n');

    const afterResponse = await fetch(beforeUrl);
    const afterData = await afterResponse.json();
    const stats = afterData.data;

    console.log('【总体统计】');
    console.log(`  总请求数: ${stats.summary.totalRequests}`);
    console.log(`  成功率: ${stats.summary.successRate}`);
    console.log(`  失败数: ${stats.summary.failureCount}\n`);

    console.log('【阶段1 - 核心批改】');
    console.log(`  平均耗时: ${stats.phase1.avgTimeMs}ms`);
    console.log(`  JSON解析成功率: ${stats.phase1.parseSuccessRate}`);
    console.log(`  平均Token: ${stats.phase1.avgTokensPerRequest}`);
    console.log(`  总Token: ${stats.phase1.totalTokens}\n`);

    console.log('【阶段2 - 补充信息】');
    console.log(`  平均耗时: ${stats.phase2.avgTimeMs}ms`);
    console.log(`  JSON解析成功率: ${stats.phase2.parseSuccessRate}`);
    console.log(`  平均Token: ${stats.phase2.avgTokensPerRequest}`);
    console.log(`  总Token: ${stats.phase2.totalTokens}\n`);

    console.log('【并发统计】');
    console.log(`  最大并发数: ${stats.concurrent.maxConcurrent}\n`);

    console.log('【Token使用】');
    console.log(`  Prompt: ${stats.totalTokenUsage.prompt}`);
    console.log(`  Completion: ${stats.totalTokenUsage.completion}`);
    console.log(`  Total: ${stats.totalTokenUsage.total}\n`);

    // 7. 性能评级
    const avgTime = (stats.phase1.avgTimeMs + stats.phase2.avgTimeMs);
    console.log('━'.repeat(60));
    console.log('🎯 性能评级');
    console.log('━'.repeat(60) + '\n');

    console.log(`  ⏱️  平均单小问耗时: ${avgTime}ms ${avgTime < 10000 ? '⭐⭐⭐⭐⭐ 优秀' : avgTime < 15000 ? '⭐⭐⭐⭐ 良好' : '⭐⭐⭐ 一般'}`);

    const successRate = parseFloat(stats.phase1.parseSuccessRate) || 0;
    console.log(`  ✅ JSON解析成功率: ${stats.phase1.parseSuccessRate} ${successRate >= 95 ? '⭐⭐⭐⭐⭐ 优秀' : successRate >= 85 ? '⭐⭐⭐⭐ 良好' : '⭐⭐⭐ 一般'}`);

    console.log(`  🚀 最大并发数: ${stats.concurrent.maxConcurrent}`);

    const totalTokens = stats.totalTokenUsage.total;
    const estimatedCost = (totalTokens * 15 / 1000000).toFixed(4);
    console.log(`  💰 Token消耗: ${totalTokens} (~$${estimatedCost})\n`);

    console.log('✅ 端到端测试完成！');
    console.log('💡 提示：可以访问 http://localhost:5173/admin/ai-review-v2-performance 查看监控面板\n');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testE2EWithMonitoring();
