import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../server/lib/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const splitSqlStatements = (sql) =>
  sql
    .replace(/^\s*--.*$/gm, "")
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement && !/^SELECT\b/i.test(statement));

async function migrate() {
  const migrationPath = path.resolve(__dirname, "../prisma/migrations/add_ai_review_v2_tables.sql");
  const sql = await readFile(migrationPath, "utf8");
  const statements = splitSqlStatements(sql);

  console.log(`Running AI review V2 migration: ${migrationPath}`);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  const strategies = await prisma.$queryRaw`SELECT COUNT(*) AS count FROM ai_review_strategies WHERE is_active = true`;
  const logs = await prisma.$queryRaw`SELECT COUNT(*) AS count FROM ai_review_logs`;
  console.log(`AI review V2 migration complete. activeStrategies=${strategies[0]?.count ?? 0}, logs=${logs[0]?.count ?? 0}`);
}

migrate()
  .catch((error) => {
    console.error("AI review V2 migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
