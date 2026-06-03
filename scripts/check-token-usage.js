// 检查Token使用情况
import prismaClientPkg from '../generated/prisma/index.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from '../server/lib/config.js';

const { PrismaClient } = prismaClientPkg;
const adapter = new PrismaMariaDb(config.databaseUrl);
const prisma = new PrismaClient({ adapter });

async function checkTokenUsage() {
  try {
    const logs = await prisma.aiReviewLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        recordId: true,
        subQuestionId: true,
        success: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        rawResponse: true,
        createdAt: true
      }
    });

    console.log('最近20条AI批改日志的Token使用情况:\n');
    console.log('='.repeat(80));

    logs.forEach((log, index) => {
      console.log(`\n${index + 1}. 记录ID: ${log.recordId}`);
      console.log(`   小问ID: ${log.subQuestionId || '未指定'}`);
      console.log(`   成功: ${log.success ? '✅' : '❌'}`);
      console.log(`   Prompt Tokens: ${log.promptTokens}`);
      console.log(`   Completion Tokens: ${log.completionTokens}`);
      console.log(`   Total Tokens: ${log.totalTokens}`);

      // 如果有rawResponse，显示finish_reason
      if (log.rawResponse) {
        try {
          const raw = JSON.parse(log.rawResponse);
          const finishReason = raw.choices?.[0]?.finish_reason || raw.stop_reason || '未知';
          console.log(`   Finish Reason: ${finishReason}`);
        } catch (e) {
          console.log(`   Finish Reason: 解析失败`);
        }
      }

      console.log(`   时间: ${log.createdAt}`);
    });

    console.log('\n' + '='.repeat(80));

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ 查询失败:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkTokenUsage();
