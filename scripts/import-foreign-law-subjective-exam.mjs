import fs from "node:fs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import prismaClientPkg from "../generated/prisma/index.js";
import { config } from "../server/lib/config.js";

const { PrismaClient } = prismaClientPkg;

const SOURCE_PATH = "D:/wechat/wechat/xwechat_files/wxid_96yqgwj98kth22_d3e1/temp/RWTemp/2026-10/1c8343edb7c6d77a95201575e0e70301/涉外法治押题与评分细则.md";
const FOLDER_NAME = "涉外法治押题";
const QUESTION_NO = "涉外法治押题-坚持统筹推进国内法治和涉外法治";
const dryRun = process.argv.includes("--dry-run");
const jsonPathArgIndex = process.argv.indexOf("--from-json");
const fromJsonPath = jsonPathArgIndex >= 0 ? process.argv[jsonPathArgIndex + 1] : "";
const exportJsonArgIndex = process.argv.indexOf("--export-json");
const exportJsonPath = exportJsonArgIndex >= 0 ? process.argv[exportJsonArgIndex + 1] : "";

const normalize = (value) => `${value ?? ""}`.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
const stripMarkdown = (value) => normalize(value).replace(/\*\*(.*?)\*\*/g, "$1").trim();

const createPrisma = () => {
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

const section = (content, startHeading, endHeading) => {
  const start = content.indexOf(startHeading);
  if (start < 0) throw new Error(`未找到章节：${startHeading}`);
  const from = start + startHeading.length;
  const end = endHeading ? content.indexOf(endHeading, from) : -1;
  return normalize(content.slice(from, end >= 0 ? end : content.length));
};

const parseSource = () => {
  if (fromJsonPath) {
    if (!fs.existsSync(fromJsonPath)) throw new Error(`JSON 文件不存在：${fromJsonPath}`);
    return JSON.parse(fs.readFileSync(fromJsonPath, "utf8"));
  }
  if (!fs.existsSync(SOURCE_PATH)) throw new Error(`文件不存在：${SOURCE_PATH}`);
  const content = normalize(fs.readFileSync(SOURCE_PATH, "utf8"));
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) throw new Error("未找到题目标题");

  const questionBlock = section(content, "## 题目", "## 参考答案");
  const problem = questionBlock.match(/^根据材料，.*$/m)?.[0]?.trim();
  if (!problem) throw new Error("未找到题目问题");
  const maxScore = Number(questionBlock.match(/满分：\s*(\d+)\s*分/)?.[1] ?? 0);
  if (maxScore !== 30) throw new Error(`题目满分应为 30 分，实际为 ${maxScore} 分`);

  const material = normalize(
    questionBlock
      .replace(/^## 题目\s*/m, "")
      .replace(/^### 材料一\s*/m, "材料一：\n")
      .replace(/^### 材料二\s*/m, "材料二：\n")
      .replace(/^### 材料三\s*/m, "材料三：\n")
      .replace(/^### 问题[\s\S]*$/m, "")
      .replace(/满分：\s*\d+\s*分\s*$/m, "")
      .replace(/\n{3,}/g, "\n\n"),
  );

  const referenceAnswer = section(content, "## 参考答案", "## 得分点");
  const rubricBlock = section(content, "## 得分点", "## 阅卷标准与评分细则");
  const guidance = section(content, "## 阅卷标准与评分细则", "");
  const rubricPoints = [];
  let category = "";
  for (const rawLine of rubricBlock.split("\n")) {
    const line = stripMarkdown(rawLine);
    if (!line) continue;
    if (/^###\s*/.test(rawLine)) {
      category = line.replace(/^###\s*/, "").replace(/（\d+分）$/, "").trim();
      continue;
    }
    const match = line.match(/^\d+[.、]\s*(.+?)（(\d+)分）$/);
    if (!match) continue;
    const score = Number(match[2]);
    const titleText = match[1].trim();
    rubricPoints.push({
      id: `point_${rubricPoints.length + 1}`,
      title: category ? `${category}：${titleText}` : titleText,
      score,
      description: titleText,
      keywords: [],
      abilityLabel: category,
      referenceAnswer: "",
      rubricGuidance: "",
      sortOrder: rubricPoints.length + 1,
    });
  }
  const pointTotal = rubricPoints.reduce((sum, point) => sum + point.score, 0);
  if (rubricPoints.length !== 18 || pointTotal !== maxScore) {
    throw new Error(`采分点解析异常：${rubricPoints.length} 个，合计 ${pointTotal} 分；${rubricPoints.map((point) => `${point.title}（${point.score}分）`).join("；")}`);
  }

  const subQuestion = {
    id: "sub_1",
    title: problem,
    prompt: problem,
    placeholder: "请在此输入本问答案。",
    abilityLabel: "综合论述",
    referenceAnswer,
    analysis: guidance,
    rubricGuidance: guidance,
    rubricPoints,
    maxScore,
    sortOrder: 1,
  };

  return {
    questionNo: QUESTION_NO,
    title,
    data: {
      type: "subjective_case",
      stem: problem,
      material,
      analysis: `参考答案：\n${referenceAnswer}\n\n阅卷标准与评分细则：\n${guidance}`,
      lessonAudioUrl: null,
      lessonAudioObjectKey: null,
      lessonAudioDurationSeconds: 0,
      score: maxScore,
      sortOrder: 1,
      correctAnswerJson: "[]",
      questionMetaJson: JSON.stringify({
        title,
        questionNo: QUESTION_NO,
        yearLabel: "2026",
        pageLabel: "涉外法治押题",
        sectionLabel: "案例分析题",
        sectionDescription: "涉外法治主观机考题",
        tags: ["理论", "涉外法治", "主观机考"],
        difficulty: 3,
        subQuestions: [subQuestion],
      }),
    },
  };
};

const main = async () => {
  const item = parseSource();
  if (exportJsonPath) {
    fs.writeFileSync(exportJsonPath, `${JSON.stringify(item, null, 2)}\n`, "utf8");
    console.log(`已导出导入数据：${exportJsonPath}`);
    if (dryRun) return;
  }
  const meta = JSON.parse(item.data.questionMetaJson);
  console.log(JSON.stringify({
    folderName: FOLDER_NAME,
    questionNo: item.questionNo,
    title: item.title,
    score: item.data.score,
    materialLength: item.data.material.length,
    subQuestions: meta.subQuestions.map((question) => ({
      title: question.title,
      maxScore: question.maxScore,
      rubricPointCount: question.rubricPoints.length,
      rubricPointScore: question.rubricPoints.reduce((sum, point) => sum + point.score, 0),
    })),
  }, null, 2));
  if (dryRun) return;

  const prisma = createPrisma();
  try {
    const folder = await prisma.questionBankFolder.upsert({
      where: { paperType_name: { paperType: "subjective", name: FOLDER_NAME } },
      update: { name: FOLDER_NAME },
      create: { paperType: "subjective", name: FOLDER_NAME },
    });
    const existingItems = await prisma.questionBankItem.findMany({ where: { folderId: folder.id }, select: { id: true, questionMetaJson: true } });
    const existing = existingItems.find((candidate) => {
      try { return JSON.parse(candidate.questionMetaJson || "{}").questionNo === QUESTION_NO; } catch { return false; }
    });
    const saved = existing
      ? await prisma.questionBankItem.update({ where: { id: existing.id }, data: { folderId: folder.id, ...item.data }, select: { id: true, score: true } })
      : await prisma.questionBankItem.create({ data: { folderId: folder.id, ...item.data }, select: { id: true, score: true } });
    console.log(JSON.stringify({ action: existing ? "updated" : "created", folderId: folder.id, folderName: FOLDER_NAME, itemId: saved.id, score: saved.score }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error("导入失败：", error);
  process.exitCode = 1;
});
