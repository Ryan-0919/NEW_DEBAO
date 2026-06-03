// 更新策略模型配置
import { prisma } from '../server/lib/prisma.js';

async function updateStrategyModel() {
  try {
    // 更新激活策略的模型和max_tokens
    const result = await prisma.$executeRaw`
      UPDATE ai_review_strategies
      SET model = 'claude-opus-4-8', max_tokens = 25000
      WHERE is_active = 1
    `;

    console.log('✅ 已更新模型配置为 claude-opus-4-8');
    console.log('受影响行数:', result);

    // 验证更新
    const strategies = await prisma.$queryRaw`
      SELECT id, model, is_active, max_tokens, temperature
      FROM ai_review_strategies
    `;

    console.log('\n当前所有策略配置:');
    strategies.forEach(s => {
      console.log(`  ID: ${s.id}, Model: ${s.model}, Active: ${s.is_active}, MaxTokens: ${s.max_tokens}, Temp: ${s.temperature}`);
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ 更新失败:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

updateStrategyModel();
