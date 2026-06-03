// 测试数据库连接
import { prisma } from '../server/lib/prisma.js';

async function testConnection() {
  console.log('Testing database connection...');

  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully!');

    // 简单查询测试
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Query test passed:', result);

    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

testConnection();
