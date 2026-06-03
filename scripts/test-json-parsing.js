// 简化的JSON解析测试
import { getActiveStrategy } from '../server/lib/ai-review-v2/index.js';
import { getMockExamAiReviewConfig } from '../server/lib/mock-exam-ai-review-config.js';
import { prisma } from '../server/lib/prisma.js';

async function testJsonParsing() {
  console.log('🧪 测试JSON解析...\n');

  try {
    // 1. 测试策略读取
    console.log('1. 读取策略...');
    const strategy = await getActiveStrategy();
    console.log(`✓ 策略ID: ${strategy.id}, 名称: ${strategy.name}`);
    console.log(`  model: ${strategy.model}, temp: ${strategy.temperature}\n`);

    // 2. 测试配置读取
    console.log('2. 读取配置...');
    const config = await getMockExamAiReviewConfig({ db: prisma });
    console.log(`✓ baseUrl: ${config.baseUrl}`);
    console.log(`  model: ${config.model}\n`);

    // 3. 模拟AI响应（不同格式）
    console.log('3. 测试JSON解析...');

    const testCases = [
      {
        name: 'Claude格式(content数组)',
        response: {
          content: [{ text: '{"subQuestions":[{"id":"test","score":5}]}' }],
          usage: { input_tokens: 100, output_tokens: 50 }
        }
      },
      {
        name: 'OpenAI格式(choices)',
        response: {
          choices: [{ message: { content: '{"subQuestions":[{"id":"test","score":5}]}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
        }
      },
      {
        name: '带代码块',
        response: {
          content: [{ text: '```json\n{"subQuestions":[{"id":"test","score":5}]}\n```' }]
        }
      }
    ];

    for (const testCase of testCases) {
      console.log(`\n  测试: ${testCase.name}`);

      // 模拟解析逻辑
      let content = testCase.response.content?.[0]?.text ||
                    testCase.response.choices?.[0]?.message?.content || '';

      console.log(`  原始内容: ${content.substring(0, 80)}...`);

      // 尝试解析
      try {
        // 去掉代码块
        const cleaned = content.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
        const parsed = JSON.parse(cleaned);
        console.log(`  ✓ 解析成功: ${JSON.stringify(parsed)}`);
      } catch (e) {
        console.log(`  ✗ 解析失败: ${e.message}`);
      }
    }

    console.log('\n✅ 测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testJsonParsing();
