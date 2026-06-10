import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { normalizeDisplayText } from "../lib/text.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";

const CONTENT_MANAGER_ROLES = ["super_admin", "operations_admin"];
const MAX_IMPORT_QUESTIONS = 500;
const SPREADSHEET_FILE_RE = /\.(xlsx|xls|csv)$/i;
const JSON_FILE_RE = /\.json$/i;
export const adminLawPracticeRouter = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
});

adminLawPracticeRouter.use(requireAdminAuth);
adminLawPracticeRouter.use(requireAdminRoles(...CONTENT_MANAGER_ROLES));

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalPositiveInt = (value) => {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toOptionalId = (value) => {
  const text = normalizeDisplayText(value ?? "").trim();
  return text && text !== "all" ? text : null;
};

const toBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = normalizeDisplayText(value).trim().toLowerCase();
  if (["false", "0", "no", "n", "否", "停用", "禁用", "inactive", "disabled"].includes(normalized)) return false;
  if (["true", "1", "yes", "y", "是", "启用", "active", "enabled"].includes(normalized)) return true;
  return Boolean(value);
};

const toTags = (value) => {
  const items = Array.isArray(value) ? value : `${value ?? ""}`.split(/[,，\n]/);
  return [...new Set(items.map((item) => normalizeDisplayText(item).trim()).filter(Boolean))];
};

const parseTags = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readQuestionPayload = (body = {}) => ({
  folderId: toOptionalId(body.folderId),
  title: normalizeDisplayText(body.title ?? "").trim(),
  prompt: normalizeDisplayText(body.prompt ?? "").trim(),
  lawName: normalizeDisplayText(body.lawName ?? "").trim(),
  articleNo: normalizeDisplayText(body.articleNo ?? "").trim(),
  sourceLawId: toOptionalPositiveInt(body.sourceLawId),
  standardText: normalizeDisplayText(body.standardText ?? "").trim(),
  explanation: normalizeDisplayText(body.explanation ?? "").trim() || null,
  tagsJson: JSON.stringify(toTags(body.tags)),
  sortOrder: toInt(body.sortOrder, 0),
  ...(body.isActive !== undefined ? { isActive: toBoolean(body.isActive, true) } : {}),
});

const readFolderPayload = (body = {}) => ({
  name: normalizeDisplayText(body.name ?? "").trim(),
  description: normalizeDisplayText(body.description ?? "").trim() || null,
  sortOrder: toInt(body.sortOrder, 0),
  ...(body.isActive !== undefined ? { isActive: toBoolean(body.isActive, true) } : {}),
});

const readPaperPayload = (body = {}, { create = false } = {}) => ({
  ...(create || body.code !== undefined
    ? { code: normalizeDisplayText(body.code ?? "").trim() || `law-${Date.now().toString(36)}` }
    : {}),
  title: normalizeDisplayText(body.title ?? "").trim(),
  description: normalizeDisplayText(body.description ?? "").trim() || null,
  status: body.status === "published" ? "published" : "draft",
  sortOrder: toInt(body.sortOrder, 0),
});

const validateQuestionPayload = (payload) => {
  if (!payload.title) return "请输入题目标题";
  if (!payload.prompt) return "请输入题干";
  if (!payload.lawName) return "请输入法律名称";
  if (!payload.articleNo) return "请输入标准条文序号";
  if (!payload.sourceLawId && !payload.standardText) return "请输入标准条文原文，或填写法条源ID绑定法条检索库";
  return "";
};

const validatePaperPayload = (payload) => {
  if (!payload.title) return "请输入试卷名称";
  if (!payload.code) return "请输入试卷编码";
  return "";
};

const validateFolderPayload = (payload) => {
  if (!payload.name) return "请输入文件夹名称";
  return "";
};

const serializeFolder = (folder) => ({
  id: folder.id,
  name: folder.name,
  description: folder.description ?? "",
  sortOrder: Number(folder.sortOrder ?? 0),
  isActive: Boolean(folder.isActive),
  questionCount: folder._count?.questions ?? 0,
  createdAt: folder.createdAt,
  updatedAt: folder.updatedAt,
});

const serializeQuestion = (question, sourceLawMap = new Map()) => ({
  id: question.id,
  folderId: question.folderId ?? null,
  folderName: question.folder?.name ?? "",
  title: question.title,
  prompt: question.prompt,
  lawName: question.lawName,
  articleNo: question.articleNo,
  sourceLawId: question.sourceLawId ?? null,
  standardText: sourceLawMap.get(question.sourceLawId)?.content ?? question.standardText,
  explanation: question.explanation ?? "",
  tags: parseTags(question.tagsJson),
  sortOrder: Number(question.sortOrder ?? 0),
  isActive: Boolean(question.isActive),
  paperCount: question._count?.paperLinks ?? 0,
  answerCount: question._count?.answers ?? 0,
  createdAt: question.createdAt,
  updatedAt: question.updatedAt,
});

const serializePaper = (paper) => ({
  id: paper.id,
  code: paper.code,
  title: paper.title,
  description: paper.description ?? "",
  status: paper.status,
  sortOrder: Number(paper.sortOrder ?? 0),
  questionCount: paper._count?.questions ?? paper.questions?.length ?? 0,
  recordCount: paper._count?.records ?? 0,
  createdAt: paper.createdAt,
  updatedAt: paper.updatedAt,
});

const serializePaperQuestion = (item, sourceLawMap = new Map()) => ({
  id: item.id,
  paperId: item.paperId,
  questionId: item.questionId,
  sortOrder: Number(item.sortOrder ?? 0),
  question: serializeQuestion(item.question, sourceLawMap),
});

const validateExistingFolder = async (folderId) => {
  if (!folderId) return "";
  const folder = await prisma.lawPracticeQuestionFolder.findUnique({
    where: { id: folderId },
    select: { id: true, isActive: true },
  });
  if (!folder || folder.isActive === false) return "题库文件夹不存在或已停用";
  return "";
};

const normalizeHeader = (value) =>
  `${value ?? ""}`
    .trim()
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .toLowerCase();

const normalizeCellText = (value) => normalizeDisplayText(value ?? "").trim();

const normalizeComparableText = (value = "") =>
  normalizeDisplayText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, "")
    .toLowerCase();

const normalizeRowMap = (row = {}) => {
  const map = new Map();
  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = normalizeHeader(key);
    if (normalizedKey) map.set(normalizedKey, normalizeCellText(value));
  });
  return map;
};

const pickImportField = (rowMap, aliases) => {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (rowMap.has(key)) return rowMap.get(key) ?? "";
  }
  return "";
};

const parseImportTags = (value) => {
  if (Array.isArray(value)) return value;
  return `${value ?? ""}`
    .split(/[,，、；;\n]/)
    .map((item) => normalizeCellText(item))
    .filter(Boolean);
};

const normalizeImportQuestion = (raw = {}, rowIndex = 1, defaultFolderId = null) => {
  const rowMap = normalizeRowMap(raw);
  const folderId = pickImportField(rowMap, ["folderId", "文件夹ID", "题库文件夹ID"]) || defaultFolderId;
  const title = pickImportField(rowMap, ["title", "题目标题", "标题"]);
  const prompt = pickImportField(rowMap, ["prompt", "题目要求", "题干", "问题"]);
  const lawName = pickImportField(rowMap, ["lawName", "法律名称", "法规名称", "法条名称"]);
  const articleNo = pickImportField(rowMap, ["articleNo", "条文序号", "标准条号", "条号", "法条序号"]);
  const sourceLawId = pickImportField(rowMap, ["sourceLawId", "法条源ID", "源ID", "法条ID", "法条检索ID"]);
  const standardText = pickImportField(rowMap, ["standardText", "标准条文原文", "标准原文", "条文原文", "答案原文"]);
  const explanation = pickImportField(rowMap, ["explanation", "解析说明", "解析", "定位说明"]);
  const tags = pickImportField(rowMap, ["tags", "标签"]);
  const sortOrder = pickImportField(rowMap, ["sortOrder", "排序", "序号"]);
  const isActive = pickImportField(rowMap, ["isActive", "是否启用", "状态"]);

  return readQuestionPayload({
    folderId,
    title,
    prompt,
    lawName,
    articleNo,
    sourceLawId,
    standardText,
    explanation,
    tags: parseImportTags(tags),
    sortOrder: sortOrder || rowIndex - 1,
    ...(isActive ? { isActive } : {}),
  });
};

const rowHasContent = (row = {}) => Object.values(row).some((value) => normalizeCellText(value));

const parseSpreadsheetImport = (buffer) => {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
  } catch {
    const error = new Error("无法读取表格文件，请确认文件是 xlsx、xls 或 csv 格式");
    error.statusCode = 400;
    throw error;
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
    blankrows: false,
  });
  return rows.filter(rowHasContent);
};

const parseJsonImportText = (text = "") => {
  const normalized = `${text ?? ""}`.replace(/^\uFEFF/, "").trim();
  if (!normalized) return [];
  try {
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    const error = new Error("导入内容不是有效 JSON，请检查格式");
    error.statusCode = 400;
    throw error;
  }
};

const readImportRows = (req) => {
  const file = req.file;
  if (file?.buffer?.length) {
    const fileName = `${file.originalname ?? ""}`;
    if (SPREADSHEET_FILE_RE.test(fileName)) return parseSpreadsheetImport(file.buffer);
    if (JSON_FILE_RE.test(fileName)) return parseJsonImportText(file.buffer.toString("utf8"));
    const error = new Error("请上传 xlsx、xls、csv 或 json 文件");
    error.statusCode = 400;
    throw error;
  }
  if (typeof req.body?.json === "string" && req.body.json.trim()) return parseJsonImportText(req.body.json);
  if (Array.isArray(req.body?.items)) return req.body.items;
  return [];
};

const getLawEntryDisplayLawName = (entry) => normalizeDisplayText(entry?.bookTitle || entry?.topCategoryTitle || "").trim();
const getLawEntryDisplayArticleNo = (entry) => normalizeDisplayText(entry?.title ?? "").trim();

const resolveLawEntryBySourceId = async (sourceLawId) => {
  if (!sourceLawId) return null;
  return prisma.lawEntry.findUnique({
    where: { sourceLawId },
    select: {
      sourceLawId: true,
      topCategoryTitle: true,
      bookTitle: true,
      title: true,
      pathString: true,
      content: true,
    },
  });
};

const buildQuestionSourceLawMap = async (questions = []) => {
  const sourceLawIds = [
    ...new Set(
      questions
        .map((question) => Number(question?.sourceLawId ?? question?.question?.sourceLawId ?? 0))
        .filter((sourceLawId) => Number.isFinite(sourceLawId) && sourceLawId > 0),
    ),
  ];
  if (sourceLawIds.length === 0) return new Map();

  const entries = await prisma.lawEntry.findMany({
    where: { sourceLawId: { in: sourceLawIds } },
    select: { sourceLawId: true, content: true },
  });
  return new Map(entries.map((entry) => [entry.sourceLawId, entry]));
};

const resolveLawEntryByNameAndArticle = async ({ lawName, articleNo }) => {
  const normalizedLawName = normalizeDisplayText(lawName).trim();
  const normalizedArticleNo = normalizeDisplayText(articleNo).trim();
  if (!normalizedLawName || !normalizedArticleNo) return { entry: null, ambiguousCount: 0 };

  const candidates = await prisma.lawEntry.findMany({
    where: {
      AND: [
        {
          OR: [
            { bookTitle: { contains: normalizedLawName } },
            { topCategoryTitle: { contains: normalizedLawName } },
            { pathString: { contains: normalizedLawName } },
            { title: { contains: normalizedLawName } },
          ],
        },
        {
          OR: [
            { title: { contains: normalizedArticleNo } },
            { content: { contains: normalizedArticleNo } },
          ],
        },
      ],
    },
    select: {
      sourceLawId: true,
      topCategoryTitle: true,
      bookTitle: true,
      title: true,
      pathString: true,
      content: true,
    },
    orderBy: [{ topCategoryId: "asc" }, { position: "asc" }, { sourceLawId: "asc" }],
    take: 20,
  });

  const lawNeedle = normalizeComparableText(normalizedLawName);
  const articleNeedle = normalizeComparableText(normalizedArticleNo);
  const matched = candidates.filter((entry) => {
    const lawScope = normalizeComparableText([entry.bookTitle, entry.topCategoryTitle, entry.pathString, entry.title].filter(Boolean).join(" "));
    const articleScope = normalizeComparableText([entry.title, entry.content].filter(Boolean).join(" "));
    return lawScope.includes(lawNeedle) && articleScope.includes(articleNeedle);
  });

  const unique = Array.from(new Map(matched.map((entry) => [entry.sourceLawId, entry])).values());
  return {
    entry: unique.length === 1 ? unique[0] : null,
    ambiguousCount: unique.length > 1 ? unique.length : 0,
  };
};

const resolveQuestionLawSource = async (payload) => {
  if (payload.sourceLawId) {
    const entry = await resolveLawEntryBySourceId(payload.sourceLawId);
    if (!entry) {
      return { payload, error: `法条源ID ${payload.sourceLawId} 不存在，请先在法条检索库确认` };
    }
    return {
      payload: {
        ...payload,
        lawName: payload.lawName || getLawEntryDisplayLawName(entry),
        articleNo: payload.articleNo || getLawEntryDisplayArticleNo(entry),
        standardText: entry.content ?? "",
      },
      sourceEntry: entry,
      error: "",
    };
  }

  if (payload.lawName && payload.articleNo) {
    const { entry, ambiguousCount } = await resolveLawEntryByNameAndArticle(payload);
    if (entry) {
      return {
        payload: {
          ...payload,
          sourceLawId: entry.sourceLawId,
          standardText: entry.content ?? "",
        },
        sourceEntry: entry,
        error: "",
      };
    }
    if (ambiguousCount > 0 && !payload.standardText) {
      return {
        payload,
        error: `法律名称和条号匹配到 ${ambiguousCount} 条法条，请填写法条源ID后再导入`,
      };
    }
  }

  return { payload, sourceEntry: null, error: "" };
};

adminLawPracticeRouter.get("/folders", async (_req, res) => {
  const folders = await prisma.lawPracticeQuestionFolder.findMany({
    where: { isActive: true },
    include: { _count: { select: { questions: true } } },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });
  return ok(res, folders.map(serializeFolder));
});

adminLawPracticeRouter.post("/folders", async (req, res) => {
  const payload = readFolderPayload(req.body);
  const error = validateFolderPayload(payload);
  if (error) return fail(res, error, 400);

  const folder = await prisma.lawPracticeQuestionFolder.create({
    data: payload,
    include: { _count: { select: { questions: true } } },
  });
  await writeAdminAuditLog(req, {
    action: "create_law_practice_question_folder",
    entityType: "law_practice_question_folder",
    entityId: folder.id,
    entityName: folder.name,
    detail: payload,
  });
  return ok(res, serializeFolder(folder), "题库文件夹已创建");
});

adminLawPracticeRouter.patch("/folders/:folderId", async (req, res) => {
  const payload = readFolderPayload(req.body);
  const error = validateFolderPayload(payload);
  if (error) return fail(res, error, 400);

  const folder = await prisma.lawPracticeQuestionFolder.update({
    where: { id: req.params.folderId },
    data: payload,
    include: { _count: { select: { questions: true } } },
  });
  await writeAdminAuditLog(req, {
    action: "update_law_practice_question_folder",
    entityType: "law_practice_question_folder",
    entityId: folder.id,
    entityName: folder.name,
    detail: payload,
  });
  return ok(res, serializeFolder(folder), "题库文件夹已更新");
});

adminLawPracticeRouter.delete("/folders/:folderId", async (req, res) => {
  const folder = await prisma.lawPracticeQuestionFolder.update({
    where: { id: req.params.folderId },
    data: { isActive: false },
    include: { _count: { select: { questions: true } } },
  });
  await writeAdminAuditLog(req, {
    action: "disable_law_practice_question_folder",
    entityType: "law_practice_question_folder",
    entityId: folder.id,
    entityName: folder.name,
  });
  return ok(res, serializeFolder(folder), "题库文件夹已停用，题目不会被删除");
});

adminLawPracticeRouter.get("/questions", async (req, res) => {
  const keyword = normalizeDisplayText(req.query?.keyword ?? "").trim();
  const folderId = toOptionalId(req.query?.folderId);
  const page = Math.max(1, toInt(req.query?.page, 1));
  const pageSize = Math.min(Math.max(1, toInt(req.query?.pageSize, 20)), 100);
  const where = {
    ...(folderId ? { folderId } : {}),
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { prompt: { contains: keyword } },
            { lawName: { contains: keyword } },
            { articleNo: { contains: keyword } },
            { standardText: { contains: keyword } },
            ...(toOptionalPositiveInt(keyword) ? [{ sourceLawId: toOptionalPositiveInt(keyword) }] : []),
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.lawPracticeQuestion.count({ where }),
    prisma.lawPracticeQuestion.findMany({
      where,
      include: { folder: true, _count: { select: { paperLinks: true, answers: true } } },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const sourceLawMap = await buildQuestionSourceLawMap(items);
  return ok(res, { items: items.map((item) => serializeQuestion(item, sourceLawMap)), total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) });
});

adminLawPracticeRouter.post("/questions", async (req, res) => {
  const resolved = await resolveQuestionLawSource(readQuestionPayload(req.body));
  if (resolved.error) return fail(res, resolved.error, 400);
  const payload = resolved.payload;
  const error = validateQuestionPayload(payload);
  if (error) return fail(res, error, 400);
  const folderError = await validateExistingFolder(payload.folderId);
  if (folderError) return fail(res, folderError, 400);

  const question = await prisma.lawPracticeQuestion.create({
    data: payload,
    include: { folder: true, _count: { select: { paperLinks: true, answers: true } } },
  });
  await writeAdminAuditLog(req, {
    action: "create_law_practice_question",
    entityType: "law_practice_question",
    entityId: question.id,
    entityName: question.title,
    detail: payload,
  });
  const sourceLawMap = await buildQuestionSourceLawMap([question]);
  return ok(res, serializeQuestion(question, sourceLawMap), "题目已创建");
});

adminLawPracticeRouter.post("/questions/import", importUpload.single("file"), async (req, res) => {
  try {
    const rows = readImportRows(req);
    if (rows.length === 0) return fail(res, "请上传或粘贴包含题目数据的 Excel、CSV 或 JSON", 400);
    if (rows.length > MAX_IMPORT_QUESTIONS) return fail(res, `单次最多导入 ${MAX_IMPORT_QUESTIONS} 道题，请分批上传`, 400);

    const defaultFolderId = toOptionalId(req.body?.folderId);
    const defaultFolderError = await validateExistingFolder(defaultFolderId);
    if (defaultFolderError) return fail(res, defaultFolderError, 400);

    const errors = [];
    const payloads = [];
    for (const [index, row] of rows.entries()) {
      const rowIndex = index + 1;
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        errors.push({ index: rowIndex, message: "每道题必须是一行表格数据或一个 JSON 对象" });
        continue;
      }

      const resolved = await resolveQuestionLawSource(normalizeImportQuestion(row, rowIndex, defaultFolderId));
      if (resolved.error) {
        errors.push({ index: rowIndex, message: resolved.error });
        continue;
      }
      const validationError = validateQuestionPayload(resolved.payload);
      if (validationError) {
        errors.push({ index: rowIndex, message: validationError });
        continue;
      }
      const folderError = await validateExistingFolder(resolved.payload.folderId);
      if (folderError) {
        errors.push({ index: rowIndex, message: folderError });
        continue;
      }
      payloads.push(resolved.payload);
    }

    if (errors.length > 0) {
      const preview = errors.slice(0, 10).map((item) => `第 ${item.index} 行：${item.message}`).join("；");
      const suffix = errors.length > 10 ? `；另有 ${errors.length - 10} 条错误` : "";
      return fail(res, `${preview}${suffix}`, 400);
    }

    await prisma.$transaction(
      payloads.map((payload) =>
        prisma.lawPracticeQuestion.create({
          data: payload,
        }),
      ),
    );

    await writeAdminAuditLog(req, {
      action: "import_law_practice_questions",
      entityType: "law_practice_question",
      entityId: "batch",
      entityName: "法条练习题目批量导入",
      detail: { createdCount: payloads.length, totalCount: rows.length },
    });

    return ok(
      res,
      {
        createdCount: payloads.length,
        totalCount: rows.length,
      },
      "批量导入完成",
    );
  } catch (error) {
    return fail(res, error.message || "批量导入题目失败", error.statusCode ?? 500);
  }
});

adminLawPracticeRouter.patch("/questions/:questionId", async (req, res) => {
  const resolved = await resolveQuestionLawSource(readQuestionPayload(req.body));
  if (resolved.error) return fail(res, resolved.error, 400);
  const payload = resolved.payload;
  const error = validateQuestionPayload(payload);
  if (error) return fail(res, error, 400);
  const folderError = await validateExistingFolder(payload.folderId);
  if (folderError) return fail(res, folderError, 400);

  const question = await prisma.lawPracticeQuestion.update({
    where: { id: req.params.questionId },
    data: payload,
    include: { folder: true, _count: { select: { paperLinks: true, answers: true } } },
  });
  await writeAdminAuditLog(req, {
    action: "update_law_practice_question",
    entityType: "law_practice_question",
    entityId: question.id,
    entityName: question.title,
    detail: payload,
  });
  const sourceLawMap = await buildQuestionSourceLawMap([question]);
  return ok(res, serializeQuestion(question, sourceLawMap), "题目已更新");
});

adminLawPracticeRouter.delete("/questions/:questionId", async (req, res) => {
  const question = await prisma.lawPracticeQuestion.update({
    where: { id: req.params.questionId },
    data: { isActive: false },
    include: { folder: true, _count: { select: { paperLinks: true, answers: true } } },
  });
  await writeAdminAuditLog(req, {
    action: "disable_law_practice_question",
    entityType: "law_practice_question",
    entityId: question.id,
    entityName: question.title,
  });
  const sourceLawMap = await buildQuestionSourceLawMap([question]);
  return ok(res, serializeQuestion(question, sourceLawMap), "题目已停用");
});

adminLawPracticeRouter.get("/papers", async (_req, res) => {
  const papers = await prisma.lawPracticePaper.findMany({
    include: { _count: { select: { questions: true, records: true } } },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });
  return ok(res, papers.map(serializePaper));
});

adminLawPracticeRouter.post("/papers", async (req, res) => {
  const payload = readPaperPayload(req.body, { create: true });
  const error = validatePaperPayload(payload);
  if (error) return fail(res, error, 400);

  const paper = await prisma.lawPracticePaper.create({
    data: payload,
    include: { _count: { select: { questions: true, records: true } } },
  });
  await writeAdminAuditLog(req, {
    action: "create_law_practice_paper",
    entityType: "law_practice_paper",
    entityId: paper.id,
    entityName: paper.title,
    detail: payload,
  });
  return ok(res, serializePaper(paper), "练习试卷已创建");
});

adminLawPracticeRouter.patch("/papers/:paperId", async (req, res) => {
  const payload = readPaperPayload(req.body);
  const error = validatePaperPayload({ ...payload, code: payload.code ?? "skip" });
  if (error) return fail(res, error, 400);

  const paper = await prisma.lawPracticePaper.update({
    where: { id: req.params.paperId },
    data: payload,
    include: { _count: { select: { questions: true, records: true } } },
  });
  await writeAdminAuditLog(req, {
    action: "update_law_practice_paper",
    entityType: "law_practice_paper",
    entityId: paper.id,
    entityName: paper.title,
    detail: payload,
  });
  return ok(res, serializePaper(paper), "练习试卷已更新");
});

adminLawPracticeRouter.delete("/papers/:paperId", async (req, res) => {
  const paper = await prisma.lawPracticePaper.findUnique({
    where: { id: req.params.paperId },
    include: { _count: { select: { records: true } } },
  });
  if (!paper) return fail(res, "练习试卷不存在", 404);

  if (paper._count.records > 0) {
    const updated = await prisma.lawPracticePaper.update({
      where: { id: paper.id },
      data: { status: "draft" },
      include: { _count: { select: { questions: true, records: true } } },
    });
    return ok(res, serializePaper(updated), "已有学员记录，已安全下架为草稿");
  }

  await prisma.lawPracticePaper.delete({ where: { id: paper.id } });
  await writeAdminAuditLog(req, {
    action: "delete_law_practice_paper",
    entityType: "law_practice_paper",
    entityId: paper.id,
    entityName: paper.title,
  });
  return ok(res, { success: true }, "练习试卷已删除");
});

adminLawPracticeRouter.get("/papers/:paperId/questions", async (req, res) => {
  const paper = await prisma.lawPracticePaper.findUnique({
    where: { id: req.params.paperId },
    include: { _count: { select: { questions: true, records: true } } },
  });
  if (!paper) return fail(res, "练习试卷不存在", 404);

  const [paperQuestions, availableQuestions] = await Promise.all([
    prisma.lawPracticePaperQuestion.findMany({
      where: { paperId: paper.id },
      include: { question: { include: { folder: true, _count: { select: { paperLinks: true, answers: true } } } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.lawPracticeQuestion.findMany({
      where: { isActive: true },
      include: { folder: true, _count: { select: { paperLinks: true, answers: true } } },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      take: 300,
    }),
  ]);
  const sourceLawMap = await buildQuestionSourceLawMap([
    ...paperQuestions.map((item) => item.question),
    ...availableQuestions,
  ]);

  return ok(res, {
    paper: serializePaper(paper),
    questions: paperQuestions.map((item) => serializePaperQuestion(item, sourceLawMap)),
    availableQuestions: availableQuestions.map((item) => serializeQuestion(item, sourceLawMap)),
  });
});

adminLawPracticeRouter.post("/papers/:paperId/questions", async (req, res) => {
  const questionIds = [...new Set((Array.isArray(req.body?.questionIds) ? req.body.questionIds : []).map((id) => `${id}`.trim()).filter(Boolean))];
  if (questionIds.length === 0) return fail(res, "请选择要加入试卷的题目", 400);

  const paper = await prisma.lawPracticePaper.findUnique({ where: { id: req.params.paperId } });
  if (!paper) return fail(res, "练习试卷不存在", 404);

  const maxSort = await prisma.lawPracticePaperQuestion.findFirst({
    where: { paperId: paper.id },
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });
  const startSort = Number(maxSort?.sortOrder ?? -1) + 1;

  await prisma.lawPracticePaperQuestion.createMany({
    data: questionIds.map((questionId, index) => ({
      paperId: paper.id,
      questionId,
      sortOrder: startSort + index,
    })),
    skipDuplicates: true,
  });

  await writeAdminAuditLog(req, {
    action: "add_law_practice_paper_questions",
    entityType: "law_practice_paper",
    entityId: paper.id,
    entityName: paper.title,
    detail: { questionIds },
  });

  const paperQuestions = await prisma.lawPracticePaperQuestion.findMany({
    where: { paperId: paper.id },
    include: { question: { include: { folder: true, _count: { select: { paperLinks: true, answers: true } } } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const sourceLawMap = await buildQuestionSourceLawMap(paperQuestions.map((item) => item.question));
  return ok(res, paperQuestions.map((item) => serializePaperQuestion(item, sourceLawMap)), "题目已加入试卷");
});

adminLawPracticeRouter.patch("/papers/:paperId/questions/order", async (req, res) => {
  const items = (Array.isArray(req.body?.items) ? req.body.items : [])
    .map((item, index) => ({ id: `${item.id ?? ""}`.trim(), sortOrder: toInt(item.sortOrder ?? index, index) }))
    .filter((item) => item.id);
  await prisma.$transaction(items.map((item) => prisma.lawPracticePaperQuestion.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })));
  return ok(res, { success: true }, "顺序已更新");
});

adminLawPracticeRouter.delete("/papers/:paperId/questions/:linkId", async (req, res) => {
  await prisma.lawPracticePaperQuestion.delete({ where: { id: req.params.linkId } });
  return ok(res, { success: true }, "题目已移出试卷");
});
