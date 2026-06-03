import { prisma } from "../server/lib/prisma.js";

const tableName = "ai_review_strategies";

const columns = [
  { name: "system_prompt", definition: "TEXT NULL AFTER is_active" },
  { name: "phase1_output_requirements", definition: "TEXT NULL AFTER comment_template" },
  { name: "phase2_output_requirements", definition: "TEXT NULL AFTER phase1_output_requirements" },
];

const columnExists = async (columnName) => {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND COLUMN_NAME = ${columnName}
  `;
  return Number(rows?.[0]?.count ?? 0) > 0;
};

async function migrate() {
  for (const column of columns) {
    if (await columnExists(column.name)) {
      console.log(`SKIP_${column.name}`);
      continue;
    }

    await prisma.$executeRawUnsafe(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`);
    console.log(`ADDED_${column.name}`);
  }

  console.log("AI review V2 prompt fields migration complete.");
}

migrate()
  .catch((error) => {
    console.error("AI review V2 prompt fields migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
