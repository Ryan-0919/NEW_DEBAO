import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../lib/response.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";
import {
  ensureDefaultDictationSubjects,
  parseBatchDictationItems,
  readChapterPayload,
  readItemPayload,
  readSubjectPayload,
  serializeDictationChapter,
  serializeDictationItem,
  serializeDictationSubject,
  toPositiveInt,
  validateChapterPayload,
  validateItemPayload,
  validateSubjectPayload,
} from "../lib/dictation.js";

const CONTENT_MANAGER_ROLES = ["super_admin", "operations_admin"];
const SPREADSHEET_RE = /\.(xlsx|xls|csv)$/i;
const TEXT_RE = /\.(txt|md)$/i;

export const dictationAdminRouter = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
});

dictationAdminRouter.use(requireAdminAuth);
dictationAdminRouter.use(requireAdminRoles(...CONTENT_MANAGER_ROLES));

const handleError = (res, error, fallbackMessage) => fail(res, error.message || fallbackMessage, error.statusCode || 400);

const subjectInclude = {
  _count: {
    select: {
      chapters: { where: { isActive: true } },
    },
  },
};

const chapterInclude = {
  subject: true,
  _count: {
    select: {
      items: true,
    },
  },
};

const itemInclude = {
  chapter: {
    include: {
      subject: true,
    },
  },
};

const enrichSubjectsWithItemCount = async (subjects) => {
  if (subjects.length === 0) return [];
  const grouped = await prisma.dictationItem.groupBy({
    by: ["chapterId"],
    _count: { _all: true },
    where: {
      chapter: {
        is: {
          subjectId: {
            in: subjects.map((subject) => subject.id),
          },
        },
      },
    },
  });
  const chapterMap = new Map(grouped.map((item) => [item.chapterId, item._count?._all ?? 0]));
  const chapters = await prisma.dictationChapter.findMany({
    where: { subjectId: { in: subjects.map((subject) => subject.id) } },
    select: { id: true, subjectId: true },
  });
  const subjectCountMap = new Map();
  chapters.forEach((chapter) => {
    subjectCountMap.set(chapter.subjectId, (subjectCountMap.get(chapter.subjectId) ?? 0) + (chapterMap.get(chapter.id) ?? 0));
  });
  return subjects.map((subject) => ({ ...subject, itemCount: subjectCountMap.get(subject.id) ?? 0 }));
};

const assertSubjectExists = async (subjectId) => {
  const subject = await prisma.dictationSubject.findUnique({ where: { id: subjectId }, select: { id: true } });
  if (!subject) {
    const error = new Error("科目不存在");
    error.statusCode = 404;
    throw error;
  }
};

const assertChapterExists = async (chapterId) => {
  const chapter = await prisma.dictationChapter.findUnique({ where: { id: chapterId }, select: { id: true } });
  if (!chapter) {
    const error = new Error("章节不存在");
    error.statusCode = 404;
    throw error;
  }
};

const normalizeHeader = (value) =>
  `${value ?? ""}`
    .trim()
    .replace(/^\ufeff/, "")
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .toLowerCase();

const pickField = (rowMap, aliases) => {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (rowMap.has(key)) return `${rowMap.get(key) ?? ""}`.trim();
  }
  return "";
};

const splitBlankCell = (value = "") =>
  `${value ?? ""}`
    .split(/[|｜、，,；;\n]+/)
    .map((item) => item.trim())
    .map((item) => item.replace(/^[\s"'“”‘’]*\{\{/, "").replace(/\}\}[\s"'“”‘’]*$/, "").trim())
    .filter(Boolean);

const collectBlankAnswers = (rowMap) => {
  const blanks = [];
  rowMap.forEach((value, key) => {
    if (/^(挖空|挖空词|挖空内容|答案|答案词|blank|answer)\d*$/.test(key)) {
      blanks.push(...splitBlankCell(value));
    }
  });
  return blanks;
};

const isInsideDictationMarker = (content, index) => {
  const openIndex = content.lastIndexOf("{{", index);
  if (openIndex < 0) return false;
  const closeIndex = content.lastIndexOf("}}", index);
  return openIndex > closeIndex;
};

const findUnmarkedIndex = (content, answer) => {
  let start = 0;
  while (start < content.length) {
    const index = content.indexOf(answer, start);
    if (index < 0) return -1;
    if (!isInsideDictationMarker(content, index)) return index;
    start = index + answer.length;
  }
  return -1;
};

const findLooseUnmarkedMatch = (content, answer) => {
  const normalizedAnswer = `${answer ?? ""}`.replace(/\s+/g, "");
  if (!normalizedAnswer) return null;

  for (let start = 0; start < content.length; start += 1) {
    if (isInsideDictationMarker(content, start)) continue;
    let answerIndex = 0;
    let end = start;

    while (end < content.length && answerIndex < normalizedAnswer.length) {
      const char = content[end];
      if (/\s/.test(char)) {
        end += 1;
        continue;
      }
      if (char !== normalizedAnswer[answerIndex]) break;
      answerIndex += 1;
      end += 1;
    }

    if (answerIndex === normalizedAnswer.length) {
      return { start, end };
    }
  }

  return null;
};

const buildContentFromOriginalAndBlanks = (original, blanks) => {
  let content = `${original ?? ""}`.trim();
  if (!content || blanks.length === 0) return content;

  blanks.forEach((blank) => {
    const answer = `${blank ?? ""}`.trim();
    if (!answer) return;
    const index = findUnmarkedIndex(content, answer);
    if (index >= 0) {
      content = `${content.slice(0, index)}{{${content.slice(index, index + answer.length)}}}${content.slice(index + answer.length)}`;
      return;
    }

    const looseMatch = findLooseUnmarkedMatch(content, answer);
    if (!looseMatch) return;
    content = `${content.slice(0, looseMatch.start)}{{${content.slice(looseMatch.start, looseMatch.end)}}}${content.slice(looseMatch.end)}`;
  });

  return content;
};

const parseItemsFromImportFile = (file, { chapterId, status, source }) => {
  if (!file?.buffer?.length) return [];
  const originalName = file.originalname || "";

  if (TEXT_RE.test(originalName) || /^text\//i.test(file.mimetype || "")) {
    return parseBatchDictationItems(file.buffer.toString("utf8"), { chapterId, status, source });
  }

  if (!SPREADSHEET_RE.test(originalName)) {
    const error = new Error("仅支持 xlsx、xls、csv、txt、md 文件");
    error.statusCode = 400;
    throw error;
  }

  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (rows.length === 0) return [];

  return rows.map((row, index) => {
    const rowMap = new Map();
    Object.entries(row).forEach(([key, value]) => {
      rowMap.set(normalizeHeader(key), `${value ?? ""}`.trim());
    });
    const rowValues = Object.values(row).map((value) => `${value ?? ""}`.trim());
    const markedContent = `${(
      pickField(rowMap, ["默写内容", "内容", "题干", "题目", "content", "stem"]) ||
      Object.values(row).find((value) => /\{\{[\s\S]+?\}\}/.test(`${value ?? ""}`)) ||
      ""
    ) ?? ""}`.trim();
    const originalContent = pickField(rowMap, ["原文", "全文", "原始文本", "original", "text"]) || rowValues[1] || "";
    const positionalBlankValues = rowValues.length > 5 ? rowValues.slice(2, -3) : rowValues.slice(2, 3);
    const blankAnswers = collectBlankAnswers(rowMap);
    const resolvedBlankAnswers = blankAnswers.length > 0 ? blankAnswers : positionalBlankValues.flatMap(splitBlankCell);
    const content = /\{\{[\s\S]+?\}\}/.test(markedContent)
      ? markedContent
      : buildContentFromOriginalAndBlanks(originalContent || markedContent, resolvedBlankAnswers) || markedContent;
    return {
      title: pickField(rowMap, ["标题", "题目标题", "title"]) || rowValues[0] || "",
      content: `${content ?? ""}`.trim(),
      source: pickField(rowMap, ["来源", "出处", "source"]) || rowValues.at(-3) || source,
      status: (pickField(rowMap, ["状态", "status"]) || rowValues.at(-2)) === "草稿" ? "draft" : status,
      sortOrder: pickField(rowMap, ["排序", "sortOrder"]) || rowValues.at(-1) || index + 1,
      chapterId,
    };
  }).map(readItemPayload);
};

dictationAdminRouter.post("/seed-defaults", async (_req, res) => {
  try {
    await ensureDefaultDictationSubjects(prisma);
    const subjects = await enrichSubjectsWithItemCount(
      await prisma.dictationSubject.findMany({
        include: subjectInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    );
    return ok(res, subjects.map(serializeDictationSubject), "默认科目已初始化");
  } catch (error) {
    return handleError(res, error, "初始化默认科目失败");
  }
});

dictationAdminRouter.get("/subjects", async (_req, res) => {
  try {
    await ensureDefaultDictationSubjects(prisma);
    const subjects = await enrichSubjectsWithItemCount(
      await prisma.dictationSubject.findMany({
        include: subjectInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    );
    return ok(res, subjects.map(serializeDictationSubject));
  } catch (error) {
    return handleError(res, error, "加载默写本科目失败");
  }
});

dictationAdminRouter.post("/subjects", async (req, res) => {
  try {
    const payload = readSubjectPayload(req.body, { create: true });
    const errorMessage = validateSubjectPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);

    const subject = await prisma.dictationSubject.create({
      data: payload,
      include: subjectInclude,
    });
    await writeAdminAuditLog(req, {
      action: "create_dictation_subject",
      entityType: "dictation_subject",
      entityId: subject.id,
      entityName: subject.name,
      detail: payload,
    });
    return ok(res, serializeDictationSubject({ ...subject, itemCount: 0 }), "科目已创建");
  } catch (error) {
    return handleError(res, error, "创建默写本科目失败");
  }
});

dictationAdminRouter.patch("/subjects/:subjectId", async (req, res) => {
  try {
    const payload = readSubjectPayload(req.body);
    const errorMessage = validateSubjectPayload({ ...payload, code: req.body?.code ?? "keep" });
    if (errorMessage) return fail(res, errorMessage, 400);

    const subject = await prisma.dictationSubject.update({
      where: { id: req.params.subjectId },
      data: payload,
      include: subjectInclude,
    });
    await writeAdminAuditLog(req, {
      action: "update_dictation_subject",
      entityType: "dictation_subject",
      entityId: subject.id,
      entityName: subject.name,
      detail: payload,
    });
    const [enriched] = await enrichSubjectsWithItemCount([subject]);
    return ok(res, serializeDictationSubject(enriched), "科目已更新");
  } catch (error) {
    return handleError(res, error, "更新默写本科目失败");
  }
});

dictationAdminRouter.delete("/subjects/:subjectId", async (req, res) => {
  try {
    const subject = await prisma.dictationSubject.update({
      where: { id: req.params.subjectId },
      data: { isActive: false },
      include: subjectInclude,
    });
    await writeAdminAuditLog(req, {
      action: "disable_dictation_subject",
      entityType: "dictation_subject",
      entityId: subject.id,
      entityName: subject.name,
    });
    const [enriched] = await enrichSubjectsWithItemCount([subject]);
    return ok(res, serializeDictationSubject(enriched), "科目已停用");
  } catch (error) {
    return handleError(res, error, "停用默写本科目失败");
  }
});

dictationAdminRouter.get("/chapters", async (req, res) => {
  try {
    const subjectId = `${req.query?.subjectId ?? ""}`.trim();
    const chapters = await prisma.dictationChapter.findMany({
      where: subjectId && subjectId !== "all" ? { subjectId } : {},
      include: chapterInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return ok(res, chapters.map(serializeDictationChapter));
  } catch (error) {
    return handleError(res, error, "加载默写本章节失败");
  }
});

dictationAdminRouter.post("/chapters", async (req, res) => {
  try {
    const payload = readChapterPayload(req.body);
    const errorMessage = validateChapterPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);
    await assertSubjectExists(payload.subjectId);

    const chapter = await prisma.dictationChapter.create({
      data: payload,
      include: chapterInclude,
    });
    await writeAdminAuditLog(req, {
      action: "create_dictation_chapter",
      entityType: "dictation_chapter",
      entityId: chapter.id,
      entityName: chapter.title,
      detail: payload,
    });
    return ok(res, serializeDictationChapter(chapter), "章节已创建");
  } catch (error) {
    return handleError(res, error, "创建默写本章节失败");
  }
});

dictationAdminRouter.patch("/chapters/:chapterId", async (req, res) => {
  try {
    const payload = readChapterPayload(req.body);
    const errorMessage = validateChapterPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);
    await assertSubjectExists(payload.subjectId);

    const chapter = await prisma.dictationChapter.update({
      where: { id: req.params.chapterId },
      data: payload,
      include: chapterInclude,
    });
    await writeAdminAuditLog(req, {
      action: "update_dictation_chapter",
      entityType: "dictation_chapter",
      entityId: chapter.id,
      entityName: chapter.title,
      detail: payload,
    });
    return ok(res, serializeDictationChapter(chapter), "章节已更新");
  } catch (error) {
    return handleError(res, error, "更新默写本章节失败");
  }
});

dictationAdminRouter.delete("/chapters/:chapterId", async (req, res) => {
  try {
    const chapter = await prisma.dictationChapter.update({
      where: { id: req.params.chapterId },
      data: { isActive: false },
      include: chapterInclude,
    });
    await writeAdminAuditLog(req, {
      action: "disable_dictation_chapter",
      entityType: "dictation_chapter",
      entityId: chapter.id,
      entityName: chapter.title,
    });
    return ok(res, serializeDictationChapter(chapter), "章节已停用");
  } catch (error) {
    return handleError(res, error, "停用默写本章节失败");
  }
});

dictationAdminRouter.get("/items", async (req, res) => {
  try {
    const page = toPositiveInt(req.query?.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
    const keyword = `${req.query?.keyword ?? ""}`.trim();
    const chapterId = `${req.query?.chapterId ?? ""}`.trim();
    const subjectId = `${req.query?.subjectId ?? ""}`.trim();
    const status = `${req.query?.status ?? ""}`.trim();
    const where = {
      ...(chapterId && chapterId !== "all" ? { chapterId } : {}),
      ...(subjectId && subjectId !== "all" && (!chapterId || chapterId === "all") ? { chapter: { is: { subjectId } } } : {}),
      ...(status === "draft" || status === "published" ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { content: { contains: keyword } },
              { source: { contains: keyword } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.dictationItem.count({ where }),
      prisma.dictationItem.findMany({
        where,
        include: itemInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok(res, {
      items: items.map((item) => serializeDictationItem(item)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    return handleError(res, error, "加载默写题失败");
  }
});

dictationAdminRouter.post("/items", async (req, res) => {
  try {
    const payload = readItemPayload(req.body);
    const errorMessage = validateItemPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);
    await assertChapterExists(payload.chapterId);

    const item = await prisma.dictationItem.create({
      data: payload,
      include: itemInclude,
    });
    await writeAdminAuditLog(req, {
      action: "create_dictation_item",
      entityType: "dictation_item",
      entityId: item.id,
      entityName: item.title,
      detail: { chapterId: item.chapterId, blankCount: JSON.parse(item.blanksJson || "[]").length },
    });
    return ok(res, serializeDictationItem(item), "默写题已创建");
  } catch (error) {
    return handleError(res, error, "创建默写题失败");
  }
});

dictationAdminRouter.post("/items/batch", async (req, res) => {
  try {
    const chapterId = `${req.body?.chapterId ?? ""}`.trim();
    if (!chapterId) return fail(res, "请选择导入章节", 400);
    await assertChapterExists(chapterId);

    const items = parseBatchDictationItems(req.body?.text, {
      chapterId,
      status: req.body?.status === "draft" ? "draft" : "published",
      source: req.body?.source,
    }).filter((item) => validateItemPayload(item) === "");

    if (items.length === 0) return fail(res, "没有识别到可导入的默写题，请用 {{答案}} 标记挖空", 400);
    if (items.length > 500) return fail(res, "单次最多导入 500 道默写题", 400);

    await prisma.dictationItem.createMany({ data: items });
    await writeAdminAuditLog(req, {
      action: "batch_create_dictation_items",
      entityType: "dictation_item",
      detail: { chapterId, count: items.length },
    });
    return ok(res, { createdCount: items.length, totalCount: items.length }, "批量导入完成");
  } catch (error) {
    return handleError(res, error, "批量导入默写题失败");
  }
});

dictationAdminRouter.post("/items/import", importUpload.single("file"), async (req, res) => {
  try {
    const chapterId = `${req.body?.chapterId ?? ""}`.trim();
    if (!chapterId) return fail(res, "请选择导入章节", 400);
    await assertChapterExists(chapterId);

    const status = req.body?.status === "draft" ? "draft" : "published";
    const source = req.body?.source;
    const fromFile = req.file ? parseItemsFromImportFile(req.file, { chapterId, status, source }) : [];
    const fromText = parseBatchDictationItems(req.body?.text, { chapterId, status, source });
    const items = [...fromFile, ...fromText].filter((item) => validateItemPayload(item) === "");

    if (items.length === 0) return fail(res, "没有识别到可导入的默写题，请用 {{答案}} 标记挖空", 400);
    if (items.length > 500) return fail(res, "单次最多导入 500 道默写题", 400);

    await prisma.dictationItem.createMany({ data: items });
    await writeAdminAuditLog(req, {
      action: "import_dictation_items",
      entityType: "dictation_item",
      detail: { chapterId, count: items.length, fileName: req.file?.originalname ?? "" },
    });
    return ok(res, { createdCount: items.length, totalCount: items.length }, "导入完成");
  } catch (error) {
    return handleError(res, error, "导入默写题失败");
  }
});

dictationAdminRouter.patch("/items/:itemId", async (req, res) => {
  try {
    const payload = readItemPayload(req.body);
    const errorMessage = validateItemPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);
    await assertChapterExists(payload.chapterId);

    const item = await prisma.dictationItem.update({
      where: { id: req.params.itemId },
      data: payload,
      include: itemInclude,
    });
    await writeAdminAuditLog(req, {
      action: "update_dictation_item",
      entityType: "dictation_item",
      entityId: item.id,
      entityName: item.title,
      detail: { chapterId: item.chapterId, status: item.status },
    });
    return ok(res, serializeDictationItem(item), "默写题已更新");
  } catch (error) {
    return handleError(res, error, "更新默写题失败");
  }
});

dictationAdminRouter.delete("/items/:itemId", async (req, res) => {
  try {
    const item = await prisma.dictationItem.delete({
      where: { id: req.params.itemId },
      include: itemInclude,
    });
    await writeAdminAuditLog(req, {
      action: "delete_dictation_item",
      entityType: "dictation_item",
      entityId: item.id,
      entityName: item.title,
    });
    return ok(res, { success: true }, "默写题已删除");
  } catch (error) {
    return handleError(res, error, "删除默写题失败");
  }
});
