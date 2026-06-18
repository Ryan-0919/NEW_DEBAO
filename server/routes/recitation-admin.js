import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../lib/response.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";
import {
  ensureDefaultRecitationSubjects,
  parseBatchRecitationItems,
  readRecitationChapterPayload,
  readRecitationItemPayload,
  readRecitationSubjectPayload,
  serializeRecitationChapter,
  serializeRecitationItem,
  serializeRecitationSubject,
  toPositiveInt,
  validateRecitationChapterPayload,
  validateRecitationItemPayload,
  validateRecitationSubjectPayload,
} from "../lib/recitation.js";

const CONTENT_MANAGER_ROLES = ["super_admin", "operations_admin"];
const SPREADSHEET_RE = /\.(xlsx|xls|csv)$/i;
const TEXT_RE = /\.(txt|md)$/i;

export const recitationAdminRouter = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
});

recitationAdminRouter.use(requireAdminAuth);
recitationAdminRouter.use(requireAdminRoles(...CONTENT_MANAGER_ROLES));

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
  const grouped = await prisma.recitationItem.groupBy({
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
  const chapters = await prisma.recitationChapter.findMany({
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
  const subject = await prisma.recitationSubject.findUnique({ where: { id: subjectId }, select: { id: true } });
  if (!subject) {
    const error = new Error("科目不存在");
    error.statusCode = 404;
    throw error;
  }
};

const assertChapterExists = async (chapterId) => {
  const chapter = await prisma.recitationChapter.findUnique({ where: { id: chapterId }, select: { id: true } });
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

const parseItemsFromImportFile = (file, { chapterId, status, source }) => {
  if (!file?.buffer?.length) return [];
  const originalName = file.originalname || "";

  if (TEXT_RE.test(originalName) || /^text\//i.test(file.mimetype || "")) {
    return parseBatchRecitationItems(file.buffer.toString("utf8"), { chapterId, status, source });
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
    const question = pickField(rowMap, ["问题", "题目", "题干", "question", "stem"]) || rowValues[0] || "";
    const answer = pickField(rowMap, ["答案", "标准答案", "answer", "standardAnswer"]) || rowValues[1] || "";
    return {
      title: pickField(rowMap, ["标题", "题目标题", "title"]) || question.slice(0, 48),
      question,
      answer,
      source: pickField(rowMap, ["来源", "出处", "source"]) || rowValues[2] || source,
      status: (pickField(rowMap, ["状态", "status"]) || rowValues[3]) === "草稿" ? "draft" : status,
      sortOrder: pickField(rowMap, ["排序", "sortOrder"]) || rowValues[4] || index + 1,
      chapterId,
    };
  }).map(readRecitationItemPayload);
};

recitationAdminRouter.post("/seed-defaults", async (_req, res) => {
  try {
    await ensureDefaultRecitationSubjects(prisma);
    const subjects = await enrichSubjectsWithItemCount(
      await prisma.recitationSubject.findMany({
        include: subjectInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    );
    return ok(res, subjects.map(serializeRecitationSubject), "默认科目已初始化");
  } catch (error) {
    return handleError(res, error, "初始化默认科目失败");
  }
});

recitationAdminRouter.get("/subjects", async (_req, res) => {
  try {
    await ensureDefaultRecitationSubjects(prisma);
    const subjects = await enrichSubjectsWithItemCount(
      await prisma.recitationSubject.findMany({
        include: subjectInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    );
    return ok(res, subjects.map(serializeRecitationSubject));
  } catch (error) {
    return handleError(res, error, "加载抽背科目失败");
  }
});

recitationAdminRouter.post("/subjects", async (req, res) => {
  try {
    const payload = readRecitationSubjectPayload(req.body, { create: true });
    const errorMessage = validateRecitationSubjectPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);

    const subject = await prisma.recitationSubject.create({
      data: payload,
      include: subjectInclude,
    });
    await writeAdminAuditLog(req, {
      action: "create_recitation_subject",
      entityType: "recitation_subject",
      entityId: subject.id,
      entityName: subject.name,
      detail: payload,
    });
    return ok(res, serializeRecitationSubject({ ...subject, itemCount: 0 }), "科目已创建");
  } catch (error) {
    return handleError(res, error, "创建抽背科目失败");
  }
});

recitationAdminRouter.patch("/subjects/:subjectId", async (req, res) => {
  try {
    const payload = readRecitationSubjectPayload(req.body);
    const errorMessage = validateRecitationSubjectPayload({ ...payload, code: req.body?.code ?? "keep" });
    if (errorMessage) return fail(res, errorMessage, 400);

    const subject = await prisma.recitationSubject.update({
      where: { id: req.params.subjectId },
      data: payload,
      include: subjectInclude,
    });
    await writeAdminAuditLog(req, {
      action: "update_recitation_subject",
      entityType: "recitation_subject",
      entityId: subject.id,
      entityName: subject.name,
      detail: payload,
    });
    const [enriched] = await enrichSubjectsWithItemCount([subject]);
    return ok(res, serializeRecitationSubject(enriched), "科目已更新");
  } catch (error) {
    return handleError(res, error, "更新抽背科目失败");
  }
});

recitationAdminRouter.delete("/subjects/:subjectId", async (req, res) => {
  try {
    const subject = await prisma.recitationSubject.update({
      where: { id: req.params.subjectId },
      data: { isActive: false },
      include: subjectInclude,
    });
    await writeAdminAuditLog(req, {
      action: "disable_recitation_subject",
      entityType: "recitation_subject",
      entityId: subject.id,
      entityName: subject.name,
    });
    const [enriched] = await enrichSubjectsWithItemCount([subject]);
    return ok(res, serializeRecitationSubject(enriched), "科目已停用");
  } catch (error) {
    return handleError(res, error, "停用抽背科目失败");
  }
});

recitationAdminRouter.get("/chapters", async (req, res) => {
  try {
    const subjectId = `${req.query?.subjectId ?? ""}`.trim();
    const chapters = await prisma.recitationChapter.findMany({
      where: subjectId && subjectId !== "all" ? { subjectId } : {},
      include: chapterInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return ok(res, chapters.map(serializeRecitationChapter));
  } catch (error) {
    return handleError(res, error, "加载抽背章节失败");
  }
});

recitationAdminRouter.post("/chapters", async (req, res) => {
  try {
    const payload = readRecitationChapterPayload(req.body);
    const errorMessage = validateRecitationChapterPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);
    await assertSubjectExists(payload.subjectId);

    const chapter = await prisma.recitationChapter.create({
      data: payload,
      include: chapterInclude,
    });
    await writeAdminAuditLog(req, {
      action: "create_recitation_chapter",
      entityType: "recitation_chapter",
      entityId: chapter.id,
      entityName: chapter.title,
      detail: payload,
    });
    return ok(res, serializeRecitationChapter(chapter), "章节已创建");
  } catch (error) {
    return handleError(res, error, "创建抽背章节失败");
  }
});

recitationAdminRouter.patch("/chapters/:chapterId", async (req, res) => {
  try {
    const payload = readRecitationChapterPayload(req.body);
    const errorMessage = validateRecitationChapterPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);
    await assertSubjectExists(payload.subjectId);

    const chapter = await prisma.recitationChapter.update({
      where: { id: req.params.chapterId },
      data: payload,
      include: chapterInclude,
    });
    await writeAdminAuditLog(req, {
      action: "update_recitation_chapter",
      entityType: "recitation_chapter",
      entityId: chapter.id,
      entityName: chapter.title,
      detail: payload,
    });
    return ok(res, serializeRecitationChapter(chapter), "章节已更新");
  } catch (error) {
    return handleError(res, error, "更新抽背章节失败");
  }
});

recitationAdminRouter.delete("/chapters/:chapterId", async (req, res) => {
  try {
    const chapter = await prisma.recitationChapter.update({
      where: { id: req.params.chapterId },
      data: { isActive: false },
      include: chapterInclude,
    });
    await writeAdminAuditLog(req, {
      action: "disable_recitation_chapter",
      entityType: "recitation_chapter",
      entityId: chapter.id,
      entityName: chapter.title,
    });
    return ok(res, serializeRecitationChapter(chapter), "章节已停用");
  } catch (error) {
    return handleError(res, error, "停用抽背章节失败");
  }
});

recitationAdminRouter.get("/items", async (req, res) => {
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
      prisma.recitationItem.count({ where }),
      prisma.recitationItem.findMany({
        where,
        include: itemInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok(res, {
      items: items.map((item) => serializeRecitationItem(item)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    return handleError(res, error, "加载抽背题失败");
  }
});

recitationAdminRouter.post("/items", async (req, res) => {
  try {
    const payload = readRecitationItemPayload(req.body);
    const errorMessage = validateRecitationItemPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);
    await assertChapterExists(payload.chapterId);

    const item = await prisma.recitationItem.create({
      data: payload,
      include: itemInclude,
    });
    await writeAdminAuditLog(req, {
      action: "create_recitation_item",
      entityType: "recitation_item",
      entityId: item.id,
      entityName: item.title,
      detail: { chapterId: item.chapterId },
    });
    return ok(res, serializeRecitationItem(item), "抽背题已创建");
  } catch (error) {
    return handleError(res, error, "创建抽背题失败");
  }
});

recitationAdminRouter.post("/items/batch", async (req, res) => {
  try {
    const chapterId = `${req.body?.chapterId ?? ""}`.trim();
    if (!chapterId) return fail(res, "请选择导入章节", 400);
    await assertChapterExists(chapterId);

    const items = parseBatchRecitationItems(req.body?.text, {
      chapterId,
      status: req.body?.status === "draft" ? "draft" : "published",
      source: req.body?.source,
    }).filter((item) => validateRecitationItemPayload(item) === "");

    if (items.length === 0) return fail(res, "没有识别到可导入的抽背题，请按“问题、答案”两列导入", 400);
    if (items.length > 500) return fail(res, "单次最多导入 500 道抽背题", 400);

    await prisma.recitationItem.createMany({ data: items });
    await writeAdminAuditLog(req, {
      action: "batch_create_recitation_items",
      entityType: "recitation_item",
      detail: { chapterId, count: items.length },
    });
    return ok(res, { createdCount: items.length, totalCount: items.length }, "批量导入完成");
  } catch (error) {
    return handleError(res, error, "批量导入抽背题失败");
  }
});

recitationAdminRouter.post("/items/import", importUpload.single("file"), async (req, res) => {
  try {
    const chapterId = `${req.body?.chapterId ?? ""}`.trim();
    if (!chapterId) return fail(res, "请选择导入章节", 400);
    await assertChapterExists(chapterId);

    const status = req.body?.status === "draft" ? "draft" : "published";
    const source = req.body?.source;
    const fromFile = req.file ? parseItemsFromImportFile(req.file, { chapterId, status, source }) : [];
    const fromText = parseBatchRecitationItems(req.body?.text, { chapterId, status, source });
    const items = [...fromFile, ...fromText].filter((item) => validateRecitationItemPayload(item) === "");

    if (items.length === 0) return fail(res, "没有识别到可导入的抽背题，请按“问题、答案”两列导入", 400);
    if (items.length > 500) return fail(res, "单次最多导入 500 道抽背题", 400);

    await prisma.recitationItem.createMany({ data: items });
    await writeAdminAuditLog(req, {
      action: "import_recitation_items",
      entityType: "recitation_item",
      detail: { chapterId, count: items.length, fileName: req.file?.originalname ?? "" },
    });
    return ok(res, { createdCount: items.length, totalCount: items.length }, "导入完成");
  } catch (error) {
    return handleError(res, error, "导入抽背题失败");
  }
});

recitationAdminRouter.patch("/items/:itemId", async (req, res) => {
  try {
    const payload = readRecitationItemPayload(req.body);
    const errorMessage = validateRecitationItemPayload(payload);
    if (errorMessage) return fail(res, errorMessage, 400);
    await assertChapterExists(payload.chapterId);

    const item = await prisma.recitationItem.update({
      where: { id: req.params.itemId },
      data: payload,
      include: itemInclude,
    });
    await writeAdminAuditLog(req, {
      action: "update_recitation_item",
      entityType: "recitation_item",
      entityId: item.id,
      entityName: item.title,
      detail: { chapterId: item.chapterId, status: item.status },
    });
    return ok(res, serializeRecitationItem(item), "抽背题已更新");
  } catch (error) {
    return handleError(res, error, "更新抽背题失败");
  }
});

recitationAdminRouter.delete("/items/:itemId", async (req, res) => {
  try {
    const item = await prisma.recitationItem.delete({
      where: { id: req.params.itemId },
      include: itemInclude,
    });
    await writeAdminAuditLog(req, {
      action: "delete_recitation_item",
      entityType: "recitation_item",
      entityId: item.id,
      entityName: item.title,
    });
    return ok(res, { success: true }, "抽背题已删除");
  } catch (error) {
    return handleError(res, error, "删除抽背题失败");
  }
});

