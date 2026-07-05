import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import prismaClientPkg from "../generated/prisma/index.js";
import { config } from "../server/lib/config.js";

const { PrismaClient } = prismaClientPkg;

const createImportPrisma = () => {
  const databaseUrl = new URL(config.databaseUrl);
  const adapter = new PrismaMariaDb({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.replace(/^\/+/, ""),
    connectionLimit: 2,
    connectTimeout: 30_000,
    acquireTimeout: 30_000,
    socketTimeout: 60_000,
  });
  return new PrismaClient({ adapter });
};

const prisma = createImportPrisma();

const SOURCE_DIR = "D:\\Desktop\\刑诉8年真题（批改版）";
const FOLDER_NAME = "刑诉8年真题（批改版）";
const SUBJECT = "刑诉";
const dryRun = process.argv.includes("--dry-run");
const exportJson = process.argv.includes("--export-json");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_JSON_PATH = path.join(scriptDir, "data", "criminal-procedure-subjective-2018-2025.json");

const readArgValue = (flag, fallback = "") => {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
};

const normalize = (value) =>
  `${value ?? ""}`
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();

const stripMarkdownStrong = (value) => normalize(value).replace(/\*\*(.*?)\*\*/g, "$1");
const compactTitle = (value) => stripMarkdownStrong(value).replace(/\s+/g, " ").trim();

const parseYear = (fileName, content) => {
  const match = `${fileName}\n${content}`.match(/(20\d{2})\s*年/);
  return match?.[1] ?? "";
};

const extractBetween = (content, startPattern, endPattern) => {
  const start = content.search(startPattern);
  if (start < 0) return "";
  const afterStart = content.slice(start).replace(startPattern, "");
  const end = afterStart.search(endPattern);
  return normalize(end >= 0 ? afterStart.slice(0, end) : afterStart);
};

const parseMaterial = (content) => {
  const explicitMaterial = extractBetween(content, /^#?\s*案情\s*$/m, /^(?:#\s*)?问题(?:\s*\d+)?[：:]/m);
  if (explicitMaterial) return explicitMaterial;

  const firstQuestionIndex = content.search(/^(?:#\s*)?问题(?:\s*\d+)?[：:]/m);
  if (firstQuestionIndex < 0) return "";
  return normalize(content.slice(0, firstQuestionIndex))
    .replace(/^#?\s*刑事诉讼法\s*$/m, "")
    .replace(/^##?\s*20\d{2}\s*年真题（回忆版）\s*$/m, "")
    .replace(/^案情\s*[（(]\s*\d+\s*分\s*[）)]\s*/m, "")
    .trim();
};

const parseQuestionHeader = (header, fallbackIndex) => {
  const text = normalize(header).replace(/^#\s*/, "");
  const scoreMatch = text.match(/[（(]\s*(\d+)\s*分\s*[）)]/);
  const maxScore = scoreMatch ? Number(scoreMatch[1]) : 0;
  const cleanTitle = compactTitle(text.replace(/[（(]\s*\d+\s*分\s*[）)]\s*$/, ""));
  const numberMatch = cleanTitle.match(/^问题\s*(\d+)/);
  const number = numberMatch?.[1] ?? `${fallbackIndex + 1}`;
  return { title: cleanTitle, maxScore, number };
};

const getSection = (block, startLabel, endLabels = []) => {
  const escapedLabel = startLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRegex = new RegExp(`^\\s*${escapedLabel}\\s*$`, "m");
  const start = block.search(startRegex);
  if (start < 0) return "";
  let section = block.slice(start).replace(startRegex, "");
  const endPositions = endLabels
    .map((label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const index = section.search(new RegExp(`^\\s*${escaped}\\s*`, "m"));
      return index >= 0 ? index : null;
    })
    .filter((index) => index !== null);
  if (endPositions.length > 0) {
    section = section.slice(0, Math.min(...endPositions));
  }
  return normalize(section);
};

const parseRubricPoints = (block, fallbackScore) => {
  const start = block.search(/^得分点（总分数：.*?分）\s*$/m);
  if (start < 0) {
    return fallbackScore > 0
      ? [
          {
            id: "point_1",
            title: "综合作答要点",
            score: fallbackScore,
            description: "",
            keywords: [],
            abilityLabel: "",
            referenceAnswer: "",
            rubricGuidance: "",
            sortOrder: 1,
          },
        ]
      : [];
  }
  const rubricBlock = block.slice(start).replace(/^得分点（总分数：.*?分）\s*$/m, "");
  const beforeGuidance = rubricBlock.split(/\n阅卷标准与评分细则\s*\n/)[0] ?? rubricBlock;
  const points = [];
  for (const rawLine of beforeGuidance.split("\n")) {
    const line = compactTitle(rawLine);
    if (!line) continue;
    const numberedMatch = line.match(/^(?:\d+[.、]\s*)?(.+?)（\s*(\d+)\s*分\s*）$/);
    if (!numberedMatch) continue;
    const title = compactTitle(numberedMatch[1]);
    const score = Number(numberedMatch[2]) || 0;
    points.push({
      id: `point_${points.length + 1}`,
      title,
      score,
      description: "",
      keywords: [title].filter(Boolean),
      abilityLabel: "",
      referenceAnswer: "",
      rubricGuidance: "",
      sortOrder: points.length + 1,
    });
  }
  return points;
};

const splitQuestionBlocks = (content) => {
  const headerRegex = /^(?:#\s*)?问题(?:\s*\d+)?[：:].*$/gm;
  const headers = [];
  let match;
  while ((match = headerRegex.exec(content))) {
    headers.push({ index: match.index, header: match[0] });
  }
  return headers.map((entry, index) => {
    const next = headers[index + 1]?.index ?? content.length;
    return {
      header: entry.header,
      body: normalize(content.slice(entry.index + entry.header.length, next)),
    };
  });
};

const parseQuestionFile = (filePath) => {
  const fileName = path.basename(filePath);
  const content = normalize(fs.readFileSync(filePath, "utf8"));
  const year = parseYear(fileName, content);
  const material = parseMaterial(content);
  const questionBlocks = splitQuestionBlocks(content);
  if (!year) throw new Error(`${fileName} 未识别到年份`);
  if (!material) throw new Error(`${fileName} 未识别到案情`);
  if (questionBlocks.length === 0) throw new Error(`${fileName} 未识别到问题`);

  const subQuestions = questionBlocks.map((block, index) => {
    const header = parseQuestionHeader(block.header, index);
    const referenceAnswer = stripMarkdownStrong(getSection(block.body, "参考答案", ["得分点", "阅卷标准与评分细则"]));
    const rubricGuidance = stripMarkdownStrong(getSection(block.body, "阅卷标准与评分细则"));
    const rubricPoints = parseRubricPoints(block.body, header.maxScore);
    const pointTotal = rubricPoints.reduce((sum, point) => sum + (Number(point.score) || 0), 0);
    const maxScore = header.maxScore || pointTotal;
    return {
      id: `sub_${index + 1}`,
      title: header.title,
      prompt: header.title,
      placeholder: "请在此输入本问答案。",
      abilityLabel: "",
      referenceAnswer,
      analysis: rubricGuidance,
      rubricGuidance,
      rubricPoints,
      maxScore,
      sortOrder: index + 1,
    };
  });

  const title = `${SUBJECT}${year} 年真题（回忆版）`;
  const totalScore = subQuestions.reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0);
  const stem = subQuestions.map((item) => item.title).join("\n");
  const analysis = subQuestions
    .map((item, index) => `问题${index + 1}参考答案：\n${item.referenceAnswer}\n\n阅卷标准与评分细则：\n${item.rubricGuidance}`)
    .join("\n\n");

  return {
    title,
    year,
    sortOrder: Number(year) || 0,
    data: {
      type: "subjective_case",
      stem,
      material,
      analysis,
      lessonAudioUrl: null,
      lessonAudioObjectKey: null,
      lessonAudioDurationSeconds: 0,
      score: totalScore,
      sortOrder: Number(year) || 0,
      correctAnswerJson: "[]",
      questionMetaJson: JSON.stringify({
        title,
        questionNo: `${SUBJECT}-${year}`,
        yearLabel: year,
        pageLabel: "",
        sectionLabel: "案例分析题",
        sectionDescription: "刑诉历年主观题真题（批改版）",
        tags: [SUBJECT, "真题", year, "批改版"],
        difficulty: 3,
        subQuestions,
      }),
    },
  };
};

const main = async () => {
  const fromJsonPath = readArgValue("--from-json", "");
  let parsedItems = [];
  if (fromJsonPath || !fs.existsSync(SOURCE_DIR)) {
    const jsonPath = fromJsonPath || DEFAULT_JSON_PATH;
    parsedItems = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } else {
    const files = fs
      .readdirSync(SOURCE_DIR)
      .filter((name) => /\.md$/i.test(name))
      .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }))
      .map((name) => path.join(SOURCE_DIR, name));

    if (files.length !== 8) {
      throw new Error(`预期 8 个 md 文件，实际找到 ${files.length} 个`);
    }

    parsedItems = files.map(parseQuestionFile);

    if (exportJson) {
      const jsonPath = readArgValue("--export-json", DEFAULT_JSON_PATH);
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      fs.writeFileSync(jsonPath, `${JSON.stringify(parsedItems, null, 2)}\n`, "utf8");
      console.log(`已导出题库数据：${jsonPath}`);
      if (!process.argv.includes("--also-import")) return;
    }
  }

  if (dryRun) {
    console.log(`解析完成：${fromJsonPath || fs.existsSync(SOURCE_DIR) ? SOURCE_DIR : DEFAULT_JSON_PATH}`);
    console.log(`目标文件夹：${FOLDER_NAME}`);
    for (const parsed of parsedItems) {
      const meta = JSON.parse(parsed.data.questionMetaJson);
      console.log(`- ${meta.title}：${meta.subQuestions.length} 小问，${parsed.data.score} 分`);
      for (const subQuestion of meta.subQuestions) {
        console.log(`  · ${subQuestion.title}：${subQuestion.maxScore} 分，${subQuestion.rubricPoints.length} 个得分点`);
      }
    }
    return;
  }

  const folder = await prisma.questionBankFolder.upsert({
    where: { paperType_name: { paperType: "subjective", name: FOLDER_NAME } },
    update: { name: FOLDER_NAME },
    create: { paperType: "subjective", name: FOLDER_NAME },
  });

  const existingItems = await prisma.questionBankItem.findMany({
    where: { folderId: folder.id },
    select: { id: true, questionMetaJson: true },
  });
  const existingByQuestionNo = new Map();
  for (const item of existingItems) {
    try {
      const meta = JSON.parse(item.questionMetaJson || "{}");
      if (meta.questionNo) existingByQuestionNo.set(meta.questionNo, item.id);
    } catch {
      // ignore malformed rows
    }
  }

  const results = [];
  for (const parsed of parsedItems) {
    const questionNo = `${SUBJECT}-${parsed.year}`;
    const existingId = existingByQuestionNo.get(questionNo);
    if (existingId) {
      const updated = await prisma.questionBankItem.update({
        where: { id: existingId },
        data: parsed.data,
        select: { id: true, score: true, questionMetaJson: true },
      });
      results.push({ action: "updated", item: updated });
    } else {
      const created = await prisma.questionBankItem.create({
        data: {
          folderId: folder.id,
          ...parsed.data,
        },
        select: { id: true, score: true, questionMetaJson: true },
      });
      results.push({ action: "created", item: created });
    }
  }

  const verifyItems = await prisma.questionBankItem.findMany({
    where: { folderId: folder.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, score: true, questionMetaJson: true },
  });

  console.log(`导入完成：${FOLDER_NAME}`);
  console.log(`文件夹ID：${folder.id}`);
  console.log(`本次处理：${results.filter((item) => item.action === "created").length} 新增，${results.filter((item) => item.action === "updated").length} 更新`);
  console.log(`当前文件夹题目数：${verifyItems.length}`);
  for (const item of verifyItems) {
    const meta = JSON.parse(item.questionMetaJson || "{}");
    console.log(`- ${meta.title}：${meta.subQuestions?.length ?? 0} 小问，${item.score} 分，ID=${item.id}`);
  }
};

main()
  .catch((error) => {
    console.error("导入失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
