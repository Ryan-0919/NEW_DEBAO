import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { fail, ok } from "../lib/response.js";
import { formatDateTime } from "../lib/time.js";
import { normalizeDisplayText } from "../lib/text.js";
import { uploadBuffer } from "../lib/upload.js";
import { recomputeBookQuestionBankProgress } from "../lib/question-bank-progress.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";

const CONTENT_MANAGER_ROLES = ["super_admin", "operations_admin"];
const BOOK_STATUSES = new Set(["draft", "published", "closed"]);
const BOOK_ACCESS_TYPES = new Set(["public", "authorized"]);
const PAPER_TYPES = new Set(["objective", "subjective"]);
const QUESTION_TYPES = new Set(["single_choice", "multiple_choice", "uncertain_choice", "subjective_case"]);
const OBJECTIVE_QUESTION_TYPES = new Set(["single_choice", "multiple_choice", "uncertain_choice"]);
const SUBJECTIVE_QUESTION_TYPES = new Set(["subjective_case"]);
const OPTION_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
  },
});

export const adminQuestionBankRouter = Router();

adminQuestionBankRouter.use(requireAdminAuth);
adminQuestionBankRouter.use(requireAdminRoles(...CONTENT_MANAGER_ROLES));

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
};

const toStringArray = (value) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : value ? `${value}`.split(/[,\n，、]/) : [])
        .map((item) => normalizeDisplayText(item).trim())
        .filter(Boolean),
    ),
  ];

const parseJsonSafely = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeAnswerKeys = (value) => {
  const parsed = typeof value === "string" ? parseJsonSafely(value, value) : value;
  return [
    ...new Set(
      (Array.isArray(parsed) ? parsed : parsed ? `${parsed}`.split(/[,\n，、]/) : [])
        .map((item) => `${item ?? ""}`.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
};

const readBookStatus = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return BOOK_STATUSES.has(normalized) ? normalized : "draft";
};

const readBookAccessType = (value, fallback = "authorized") => {
  const normalized = `${value ?? ""}`.trim();
  return BOOK_ACCESS_TYPES.has(normalized) ? normalized : fallback;
};

const readPaperType = (value, fallback = "objective") => {
  const normalized = `${value ?? ""}`.trim();
  return PAPER_TYPES.has(normalized) ? normalized : fallback;
};

const parseBookAccessType = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return BOOK_ACCESS_TYPES.has(normalized) ? normalized : "";
};

const parsePaperType = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return PAPER_TYPES.has(normalized) ? normalized : "";
};

const getQuestionTypesForPaperType = (paperType) =>
  paperType === "subjective" ? SUBJECTIVE_QUESTION_TYPES : OBJECTIVE_QUESTION_TYPES;

const readQuestionType = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return QUESTION_TYPES.has(normalized) ? normalized : "single_choice";
};

const readBookPayload = (body = {}, { includeCode = false } = {}) => {
  const accessType = parseBookAccessType(body.accessType);
  const paperType = parsePaperType(body.paperType);
  const payload = {
    name: normalizeDisplayText(body.name ?? "").trim(),
    description: normalizeDisplayText(body.description ?? "").trim() || null,
    coverUrl: `${body.coverUrl ?? ""}`.trim() || null,
    coverObjectKey: `${body.coverObjectKey ?? ""}`.trim() || null,
    status: readBookStatus(body.status),
    accessType,
    paperType,
    isVisible: toBool(body.isVisible, true),
    sortOrder: toInt(body.sortOrder, 0),
  };

  if (includeCode) payload.code = `${body.code ?? ""}`.trim();
  return payload;
};

const readSubjectPayload = (body = {}) => ({
  name: normalizeDisplayText(body.name ?? "").trim(),
  code: `${body.code ?? ""}`.trim(),
  description: normalizeDisplayText(body.description ?? "").trim() || null,
  sortOrder: toInt(body.sortOrder, 0),
});

const readItemOptions = (value) => {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((option, index) => ({
      optionKey: `${option?.optionKey ?? option?.key ?? OPTION_KEYS[index] ?? ""}`.trim().toUpperCase(),
      content: normalizeDisplayText(option?.content ?? option?.text ?? "").trim(),
      sortOrder: toInt(option?.sortOrder, index),
    }))
    .filter((option) => option.optionKey && option.content)
    .sort((left, right) => left.sortOrder - right.sortOrder);
};

const readQuestionMeta = (body = {}) => {
  const rawMeta = body.questionMetaJson && typeof body.questionMetaJson === "string" ? parseJsonSafely(body.questionMetaJson, {}) : {};
  const meta = rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta) ? rawMeta : {};
  const difficulty = Math.max(1, Math.min(3, toInt(body.difficulty ?? meta.difficulty, 2)));
  return {
    ...meta,
    difficulty,
  };
};

const readItemPayload = (body = {}) => {
  const tags = toStringArray(body.tags ?? body.tagsJson);
  const correctAnswer = normalizeAnswerKeys(body.correctAnswer ?? body.correctAnswers ?? body.correctAnswerJson);
  return {
    subjectId: `${body.subjectId ?? ""}`.trim(),
    title: normalizeDisplayText(body.title ?? "").trim() || null,
    questionNo: normalizeDisplayText(body.questionNo ?? "").trim() || null,
    yearLabel: normalizeDisplayText(body.yearLabel ?? "").trim() || null,
    pageLabel: normalizeDisplayText(body.pageLabel ?? "").trim() || null,
    tagsJson: JSON.stringify(tags),
    type: readQuestionType(body.type),
    stem: normalizeDisplayText(body.stem ?? "").trim(),
    material: normalizeDisplayText(body.material ?? "").trim() || null,
    analysis: normalizeDisplayText(body.analysis ?? "").trim() || null,
    lessonAudioUrl: `${body.lessonAudioUrl ?? ""}`.trim() || null,
    lessonAudioObjectKey: `${body.lessonAudioObjectKey ?? ""}`.trim() || null,
    lessonAudioDurationSeconds: Math.max(0, toInt(body.lessonAudioDurationSeconds, 0)),
    score: Math.max(0, toInt(body.score, 2)),
    correctAnswerJson: JSON.stringify(correctAnswer),
    questionMetaJson: JSON.stringify(readQuestionMeta(body)),
    sortOrder: toInt(body.sortOrder, 0),
    status: toBool(body.status, true),
    options: readItemOptions(body.options),
    correctAnswer,
  };
};

const serializeBook = (book, extra = {}) => ({
  id: book.id,
  name: book.name,
  code: book.code,
  coverUrl: book.coverUrl ?? "",
  coverObjectKey: book.coverObjectKey ?? "",
  description: book.description ?? "",
  status: book.status,
  accessType: book.accessType ?? "authorized",
  paperType: book.paperType ?? "objective",
  isVisible: Boolean(book.isVisible),
  sortOrder: Number(book.sortOrder ?? 0),
  subjectCount: extra.subjectCount ?? book._count?.subjects ?? 0,
  itemCount: extra.itemCount ?? book._count?.items ?? 0,
  activeItemCount: extra.activeItemCount ?? 0,
  permissionCount: extra.permissionCount ?? book._count?.permissions ?? 0,
  progressCount: extra.progressCount ?? book._count?.progresses ?? 0,
  createdAt: formatDateTime(book.createdAt),
  updatedAt: formatDateTime(book.updatedAt),
});

const serializeSubject = (subject) => ({
  id: subject.id,
  bookId: subject.bookId,
  name: subject.name,
  code: subject.code,
  description: subject.description ?? "",
  sortOrder: Number(subject.sortOrder ?? 0),
  itemCount:
    subject.practiceItemCount ??
    subject._count?.items ??
    subject.items?.filter((item) => item.bookQuestionLibraryItemId).length ??
    0,
  createdAt: formatDateTime(subject.createdAt),
  updatedAt: formatDateTime(subject.updatedAt),
});

const getItemSource = (item) => item.bookQuestionLibraryItem ?? null;
const getItemSourceId = (item) => item.bookQuestionLibraryItemId ?? "";
const getItemSourceType = (item) => (item.bookQuestionLibraryItemId ? "practice_library" : "manual");

const includeBookQuestionBankItemSource = {
  bookQuestionLibraryItem: {
    include: {
      folder: true,
      options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
    },
  },
};

const readSourceSubQuestions = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item, index) => ({
      id: `${item?.id ?? `sub_${index + 1}`}`.trim() || `sub_${index + 1}`,
      title: normalizeDisplayText(item?.title ?? "").trim(),
      prompt: normalizeDisplayText(item?.prompt ?? item?.stem ?? item?.question ?? "").trim(),
      placeholder: normalizeDisplayText(item?.placeholder ?? "").trim(),
      referenceAnswer: normalizeDisplayText(item?.referenceAnswer ?? "").trim(),
      analysis: normalizeDisplayText(item?.analysis ?? item?.rubricGuidance ?? "").trim(),
      sortOrder: toInt(item?.sortOrder, index + 1),
    }))
    .filter((item) => item.title || item.prompt || item.placeholder || item.referenceAnswer || item.analysis)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));

const serializeItem = (item) => {
  const source = getItemSource(item);
  const sourceType = getItemSourceType(item);
  const sourceMeta = parseJsonSafely(source?.questionMetaJson, {});
  const itemTags = parseJsonSafely(item.tagsJson, []);
  const sourceTags = Array.isArray(sourceMeta?.tags) ? sourceMeta.tags : [];
  const meta = parseJsonSafely(item.questionMetaJson, {});
  const tags = Array.isArray(itemTags) && itemTags.length > 0 ? itemTags : sourceTags;
  const correctAnswer = item.correctAnswerJson ? normalizeAnswerKeys(item.correctAnswerJson) : normalizeAnswerKeys(source?.correctAnswerJson);
  const options = item.options?.length > 0 ? item.options : source?.options ?? [];
  const hasOwnAudio = Boolean(item.lessonAudioUrl || item.lessonAudioObjectKey);
  const sourceDifficulty = Math.max(1, Math.min(3, toInt(sourceMeta?.difficulty, 2)));
  const title = item.title || sourceMeta?.title || "";
  const questionNo = item.questionNo || sourceMeta?.questionNo || "";
  const yearLabel = item.yearLabel || sourceMeta?.yearLabel || "";
  const pageLabel = item.pageLabel || sourceMeta?.pageLabel || "";
  const subQuestions = readSourceSubQuestions(meta?.subQuestions?.length ? meta.subQuestions : sourceMeta?.subQuestions);
  return {
    id: item.id,
    bookId: item.bookId,
    subjectId: item.subjectId,
    subjectName: item.subject?.name ?? "",
    sourceQuestionId: source?.id ?? getItemSourceId(item),
    sourceType,
    sourceFolderName: source?.folder?.name ?? "",
    isReferenced: Boolean(item.bookQuestionLibraryItemId),
    isSourceMissing: Boolean(item.bookQuestionLibraryItemId && !source),
    isLegacySource: false,
    title,
    questionNo,
    yearLabel,
    pageLabel,
    tags: Array.isArray(tags) ? tags : [],
    type: item.type ?? source?.type ?? "single_choice",
    difficulty: Math.max(1, Math.min(3, toInt(meta?.difficulty, sourceDifficulty))),
    stem: item.stem ?? source?.stem ?? "",
    material: item.material ?? source?.material ?? "",
    analysis: item.analysis ?? source?.analysis ?? "",
    lessonAudioUrl: item.lessonAudioUrl ?? source?.lessonAudioUrl ?? "",
    lessonAudioObjectKey: item.lessonAudioObjectKey ?? source?.lessonAudioObjectKey ?? "",
    lessonAudioDurationSeconds: Number(hasOwnAudio ? item.lessonAudioDurationSeconds ?? 0 : source?.lessonAudioDurationSeconds ?? item.lessonAudioDurationSeconds ?? 0),
    score: Number(item.score ?? source?.score ?? 0),
    correctAnswer,
    subQuestions,
    sortOrder: Number(item.sortOrder ?? 0),
    status: Boolean(item.status),
    optionCount: options.length,
    userStateCount: item._count?.userStates ?? 0,
    options: options.map((option) => ({
      id: option.id,
      optionKey: option.optionKey,
      content: option.content,
      sortOrder: Number(option.sortOrder ?? 0),
    })),
    createdAt: formatDateTime(item.createdAt),
    updatedAt: formatDateTime(item.updatedAt),
  };
};

const serializeSourceLibraryItem = (item) => {
  const meta = parseJsonSafely(item.questionMetaJson, {});
  const tags = Array.isArray(meta?.tags) ? meta.tags : [];
  const subQuestions = readSourceSubQuestions(meta?.subQuestions);
  return {
    id: item.id,
    folderId: item.folderId,
    folderName: item.folder?.name ?? "",
    accessType: item.folder?.accessType ?? "public",
    paperType: item.folder?.paperType ?? "objective",
    title: meta?.title ?? "",
    questionNo: meta?.questionNo ?? "",
    yearLabel: meta?.yearLabel ?? "",
    pageLabel: meta?.pageLabel ?? "",
    tags,
    difficulty: Math.max(1, Math.min(3, toInt(meta?.difficulty, 2))),
    type: item.type,
    stem: item.stem,
    material: item.material ?? "",
    analysis: item.analysis ?? "",
    lessonAudioUrl: item.lessonAudioUrl ?? "",
    lessonAudioObjectKey: item.lessonAudioObjectKey ?? "",
    lessonAudioDurationSeconds: Number(item.lessonAudioDurationSeconds ?? 0),
    score: Number(item.score ?? 0),
    correctAnswer: normalizeAnswerKeys(item.correctAnswerJson),
    subQuestions,
    optionCount: item.options?.length ?? 0,
    referencedCount: item._count?.bookQuestionBankItems ?? 0,
    options: (item.options ?? []).map((option) => ({
      id: option.id,
      optionKey: option.optionKey,
      content: option.content,
      sortOrder: Number(option.sortOrder ?? 0),
    })),
    createdAt: formatDateTime(item.createdAt),
    updatedAt: formatDateTime(item.updatedAt),
  };
};

const getBookStats = async (bookIds = []) => {
  if (bookIds.length === 0) return new Map();
  const practiceItemWhere = {
    bookId: { in: bookIds },
    bookQuestionLibraryItemId: { not: null },
  };
  const [activeCounts, itemCounts, subjectCounts, permissionCounts, progressCounts] = await Promise.all([
    prisma.bookQuestionBankItem.groupBy({
      by: ["bookId"],
      where: { ...practiceItemWhere, status: true },
      _count: { _all: true },
    }),
    prisma.bookQuestionBankItem.groupBy({
      by: ["bookId"],
      where: practiceItemWhere,
      _count: { _all: true },
    }),
    prisma.bookQuestionBankSubject.groupBy({
      by: ["bookId"],
      where: { bookId: { in: bookIds } },
      _count: { _all: true },
    }),
    prisma.userBookQuestionBankPermission.groupBy({
      by: ["bookId"],
      where: { bookId: { in: bookIds } },
      _count: { _all: true },
    }),
    prisma.userBookQuestionBankProgress.groupBy({
      by: ["bookId"],
      where: { bookId: { in: bookIds } },
      _count: { _all: true },
    }),
  ]);
  const result = new Map(bookIds.map((id) => [id, { activeItemCount: 0, itemCount: 0, subjectCount: 0, permissionCount: 0, progressCount: 0 }]));
  const applyCounts = (rows, key) => {
    rows.forEach((row) => {
      const item = result.get(row.bookId);
      if (item) item[key] = row._count?._all ?? 0;
    });
  };
  applyCounts(activeCounts, "activeItemCount");
  applyCounts(itemCounts, "itemCount");
  applyCounts(subjectCounts, "subjectCount");
  applyCounts(permissionCounts, "permissionCount");
  applyCounts(progressCounts, "progressCount");
  return result;
};

const validateBookPublish = async (bookId) => {
  const [subjectCount, activeItemCount] = await Promise.all([
    prisma.bookQuestionBankSubject.count({ where: { bookId } }),
    prisma.bookQuestionBankItem.count({ where: { bookId, status: true, bookQuestionLibraryItemId: { not: null } } }),
  ]);
  if (subjectCount === 0) return "题库至少需要一个科目后才能发布";
  if (activeItemCount === 0) return "题库至少需要一道已启用题目后才能发布";
  return "";
};

const getBookTypeLockCounts = async (bookId) => {
  const [itemCount, permissionCount, progressCount, itemStateCount] = await Promise.all([
    prisma.bookQuestionBankItem.count({ where: { bookId, bookQuestionLibraryItemId: { not: null } } }),
    prisma.userBookQuestionBankPermission.count({ where: { bookId } }),
    prisma.userBookQuestionBankProgress.count({ where: { bookId } }),
    prisma.userBookQuestionBankItemState.count({ where: { bookId } }),
  ]);
  return { itemCount, permissionCount, progressCount, itemStateCount };
};

const isBookTypeLocked = (counts) =>
  counts.itemCount > 0 || counts.permissionCount > 0 || counts.progressCount > 0 || counts.itemStateCount > 0;

const validateItemPayload = async (bookId, payload) => {
  if (!payload.subjectId) return "请选择题目所属科目";
  const subject = await prisma.bookQuestionBankSubject.findFirst({
    where: {
      id: payload.subjectId,
      bookId,
    },
    select: { id: true },
  });
  if (!subject) return "题目所属科目不存在";
  if (!payload.stem) return "请输入题干";

  const optionKeys = new Set(payload.options.map((option) => option.optionKey));
  if (optionKeys.size !== payload.options.length) return "选项标识不能重复";
  if (payload.status) {
    if (payload.options.length < 2) return "启用题目至少需要两个选项";
    if (payload.correctAnswer.length === 0) return "启用题目必须配置正确答案";
    if (payload.type === "single_choice" && payload.correctAnswer.length !== 1) return "单选题只能配置一个正确答案";
  }
  if (payload.correctAnswer.some((answer) => !optionKeys.has(answer))) return "正确答案必须来自已配置选项";
  return "";
};

adminQuestionBankRouter.get("/summary", async (req, res) => {
  const accessType = parseBookAccessType(req.query?.accessType);
  const paperType = parsePaperType(req.query?.paperType);
  if (!accessType) return fail(res, "请选择题库访问类型", 400);
  if (!paperType) return fail(res, "请选择题库主客观类型", 400);
  const bookWhere = { accessType, paperType };
  const practiceItemWhere = { bookQuestionLibraryItemId: { not: null } };
  const [totalBooks, publishedBooks, draftBooks, closedBooks, visibleBooks, totalSubjects, totalItems, activeItems] = await Promise.all([
    prisma.bookQuestionBank.count({ where: bookWhere }),
    prisma.bookQuestionBank.count({ where: { ...bookWhere, status: "published" } }),
    prisma.bookQuestionBank.count({ where: { ...bookWhere, status: "draft" } }),
    prisma.bookQuestionBank.count({ where: { ...bookWhere, status: "closed" } }),
    prisma.bookQuestionBank.count({ where: { ...bookWhere, isVisible: true } }),
    prisma.bookQuestionBankSubject.count({ where: { book: { is: bookWhere } } }),
    prisma.bookQuestionBankItem.count({ where: { ...practiceItemWhere, book: { is: bookWhere } } }),
    prisma.bookQuestionBankItem.count({ where: { ...practiceItemWhere, status: true, book: { is: bookWhere } } }),
  ]);

  return ok(res, {
    totalBooks,
    publishedBooks,
    draftBooks,
    closedBooks,
    visibleBooks,
    totalSubjects,
    totalItems,
    activeItems,
  });
});

adminQuestionBankRouter.get("/", async (req, res) => {
  const keyword = normalizeDisplayText(req.query?.keyword ?? "").trim();
  const status = `${req.query?.status ?? "all"}`.trim();
  const visibility = `${req.query?.visibility ?? "all"}`.trim();
  const accessType = parseBookAccessType(req.query?.accessType);
  const paperType = parsePaperType(req.query?.paperType);
  if (!accessType) return fail(res, "请选择题库访问类型", 400);
  if (!paperType) return fail(res, "请选择题库主客观类型", 400);
  const where = {
    accessType,
    paperType,
    ...(BOOK_STATUSES.has(status) ? { status } : {}),
    ...(visibility === "visible" ? { isVisible: true } : visibility === "hidden" ? { isVisible: false } : {}),
    ...(keyword
      ? {
          OR: [
            { name: { contains: keyword } },
            { code: { contains: keyword } },
            { description: { contains: keyword } },
          ],
        }
      : {}),
  };

  const books = await prisma.bookQuestionBank.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  const statsMap = await getBookStats(books.map((book) => book.id));
  return ok(res, books.map((book) => serializeBook(book, statsMap.get(book.id))));
});

adminQuestionBankRouter.post("/", async (req, res) => {
  try {
    const payload = readBookPayload(req.body, { includeCode: true });
    if (!payload.name) return fail(res, "请输入题库名称", 400);
    if (!payload.code) return fail(res, "请输入题库编码", 400);
    if (!payload.accessType) return fail(res, "请选择题库访问类型", 400);
    if (!payload.paperType) return fail(res, "请选择题库主客观类型", 400);
    if (payload.status === "published") return fail(res, "新题库请先保存为草稿，添加科目和题目后再发布", 400);

    const book = await prisma.bookQuestionBank.create({
      data: payload,
    });
    await writeAdminAuditLog(req, {
      action: "create_question_bank_book",
      entityType: "question_bank_book",
      entityId: book.id,
      entityName: book.name,
      detail: { code: book.code, status: book.status },
    });
    return ok(res, serializeBook(book));
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "题库编码已存在", 409);
    return fail(res, error.message || "创建题库失败", 500);
  }
});

adminQuestionBankRouter.post("/assets/upload", imageUpload.single("file"), async (req, res) => {
  const assetType = `${req.body?.assetType ?? ""}`.trim();
  const file = req.file;
  if (assetType !== "cover") return fail(res, "上传类型不正确", 400);
  if (!file) return fail(res, "请选择要上传的封面文件", 400);
  if (!`${file.mimetype ?? ""}`.startsWith("image/")) return fail(res, "题库封面只能上传图片文件", 400);

  const originalName = normalizeDisplayText(file.originalname || "question-bank-cover");
  const uploaded = await uploadBuffer({
    fileName: originalName,
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: "admin/question-bank-covers",
  });

  return ok(
    res,
    {
      url: uploaded.readableUrl || uploaded.url,
      objectKey: uploaded.objectKey,
      fileName: originalName,
    },
    "题库封面已上传",
  );
});

adminQuestionBankRouter.get("/:bookId", async (req, res) => {
  const book = await prisma.bookQuestionBank.findUnique({
    where: { id: req.params.bookId },
    include: {
      subjects: {
        include: {
          _count: {
            select: {
              items: {
                where: { bookQuestionLibraryItemId: { not: null } },
              },
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!book) return fail(res, "题库不存在", 404);
  const statsMap = await getBookStats([book.id]);
  return ok(res, {
    book: serializeBook(book, statsMap.get(book.id)),
    subjects: book.subjects.map(serializeSubject),
  });
});

adminQuestionBankRouter.patch("/:bookId", async (req, res) => {
  try {
    const existing = await prisma.bookQuestionBank.findUnique({ where: { id: req.params.bookId } });
    if (!existing) return fail(res, "题库不存在", 404);

    const payload = readBookPayload(req.body, { includeCode: true });
    if (!payload.name) return fail(res, "请输入题库名称", 400);
    if (!payload.code) return fail(res, "请输入题库编码", 400);
    if (!payload.accessType) return fail(res, "请选择题库访问类型", 400);
    if (!payload.paperType) return fail(res, "请选择题库主客观类型", 400);
    if (payload.accessType !== existing.accessType || payload.paperType !== existing.paperType) {
      const lockCounts = await getBookTypeLockCounts(existing.id);
      if (isBookTypeLocked(lockCounts)) {
        return fail(res, "题库已有题目、授权或练习记录后，不能切换公开/授权或主客观类型", 409);
      }
    }
    if (payload.status === "published") {
      const publishError = await validateBookPublish(existing.id);
      if (publishError) return fail(res, publishError, 400);
    }

    const book = await prisma.bookQuestionBank.update({
      where: { id: existing.id },
      data: payload,
    });
    await writeAdminAuditLog(req, {
      action: "update_question_bank_book",
      entityType: "question_bank_book",
      entityId: book.id,
      entityName: book.name,
      detail: { code: book.code, status: book.status, isVisible: book.isVisible },
    });
    const statsMap = await getBookStats([book.id]);
    return ok(res, serializeBook(book, statsMap.get(book.id)));
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "题库编码已存在", 409);
    return fail(res, error.message || "保存题库失败", 500);
  }
});

adminQuestionBankRouter.delete("/:bookId", async (req, res) => {
  const book = await prisma.bookQuestionBank.findUnique({
    where: { id: req.params.bookId },
    select: { id: true, name: true, code: true },
  });
  if (!book) return fail(res, "题库不存在", 404);

  await prisma.$transaction(async (tx) => {
    await tx.userBookQuestionBankItemState.deleteMany({ where: { bookId: book.id } });
    await tx.userBookQuestionBankProgress.deleteMany({ where: { bookId: book.id } });
    await tx.userBookQuestionBankPermission.deleteMany({ where: { bookId: book.id } });
    await tx.bookQuestionBankItem.deleteMany({ where: { bookId: book.id } });
    await tx.bookQuestionBankSubject.deleteMany({ where: { bookId: book.id } });
    await tx.bookQuestionBank.delete({ where: { id: book.id } });
  });
  await writeAdminAuditLog(req, {
    action: "delete_question_bank_book",
    entityType: "question_bank_book",
    entityId: book.id,
    entityName: book.name,
    detail: { code: book.code },
  });
  return ok(res, { success: true });
});

adminQuestionBankRouter.patch("/order/books", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await prisma.$transaction(
    items
      .map((item, index) => ({ id: `${item?.id ?? ""}`.trim(), sortOrder: toInt(item?.sortOrder ?? item?.order, index) }))
      .filter((item) => item.id)
      .map((item) => prisma.bookQuestionBank.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })),
  );
  await writeAdminAuditLog(req, {
    action: "reorder_question_bank_books",
    entityType: "question_bank_book",
    detail: { count: items.length },
  });
  return ok(res, { success: true });
});

adminQuestionBankRouter.post("/:bookId/subjects", async (req, res) => {
  try {
    const book = await prisma.bookQuestionBank.findUnique({ where: { id: req.params.bookId } });
    if (!book) return fail(res, "题库不存在", 404);
    const payload = readSubjectPayload(req.body);
    if (!payload.name) return fail(res, "请输入科目名称", 400);
    if (!payload.code) return fail(res, "请输入科目编码", 400);

    const subject = await prisma.bookQuestionBankSubject.create({
      data: {
        ...payload,
        bookId: book.id,
      },
      include: { _count: { select: { items: true } } },
    });
    await writeAdminAuditLog(req, {
      action: "create_question_bank_subject",
      entityType: "question_bank_subject",
      entityId: subject.id,
      entityName: subject.name,
      detail: { bookId: book.id, code: subject.code },
    });
    return ok(res, serializeSubject(subject));
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "该题库下已存在同名或同编码科目", 409);
    return fail(res, error.message || "创建科目失败", 500);
  }
});

adminQuestionBankRouter.patch("/:bookId/subjects/:subjectId", async (req, res) => {
  try {
    const subject = await prisma.bookQuestionBankSubject.findFirst({
      where: { id: req.params.subjectId, bookId: req.params.bookId },
    });
    if (!subject) return fail(res, "科目不存在", 404);
    const payload = readSubjectPayload(req.body);
    if (!payload.name) return fail(res, "请输入科目名称", 400);
    if (!payload.code) return fail(res, "请输入科目编码", 400);

    const updated = await prisma.bookQuestionBankSubject.update({
      where: { id: subject.id },
      data: payload,
      include: { _count: { select: { items: true } } },
    });
    await writeAdminAuditLog(req, {
      action: "update_question_bank_subject",
      entityType: "question_bank_subject",
      entityId: updated.id,
      entityName: updated.name,
      detail: { bookId: updated.bookId, code: updated.code },
    });
    return ok(res, serializeSubject(updated));
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "该题库下已存在同名或同编码科目", 409);
    return fail(res, error.message || "保存科目失败", 500);
  }
});

adminQuestionBankRouter.delete("/:bookId/subjects/:subjectId", async (req, res) => {
  const subject = await prisma.bookQuestionBankSubject.findFirst({
    where: { id: req.params.subjectId, bookId: req.params.bookId },
  });
  if (!subject) return fail(res, "科目不存在", 404);

  await prisma.$transaction(async (tx) => {
    await tx.userBookQuestionBankItemState.deleteMany({ where: { bookId: subject.bookId, bookItem: { subjectId: subject.id } } });
    await tx.userBookQuestionBankProgress.updateMany({
      where: { bookId: subject.bookId, lastSubjectId: subject.id },
      data: { lastSubjectId: null, lastBookItemId: null },
    });
    await tx.bookQuestionBankItem.deleteMany({ where: { bookId: subject.bookId, subjectId: subject.id } });
    await tx.bookQuestionBankSubject.delete({ where: { id: subject.id } });
    await recomputeBookQuestionBankProgress(tx, [subject.bookId]);
  });
  await writeAdminAuditLog(req, {
    action: "delete_question_bank_subject",
    entityType: "question_bank_subject",
    entityId: subject.id,
    entityName: subject.name,
    detail: { bookId: subject.bookId, code: subject.code },
  });
  return ok(res, { success: true });
});

adminQuestionBankRouter.patch("/:bookId/subjects/order", async (req, res) => {
  const book = await prisma.bookQuestionBank.findUnique({ where: { id: req.params.bookId }, select: { id: true } });
  if (!book) return fail(res, "题库不存在", 404);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await prisma.$transaction(
    items
      .map((item, index) => ({ id: `${item?.id ?? ""}`.trim(), sortOrder: toInt(item?.sortOrder ?? item?.order, index) }))
      .filter((item) => item.id)
      .map((item) =>
        prisma.bookQuestionBankSubject.updateMany({
          where: { id: item.id, bookId: book.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
  );
  await writeAdminAuditLog(req, {
    action: "reorder_question_bank_subjects",
    entityType: "question_bank_subject",
    detail: { bookId: book.id, count: items.length },
  });
  return ok(res, { success: true });
});

adminQuestionBankRouter.get("/:bookId/source-items", async (req, res) => {
  const book = await prisma.bookQuestionBank.findUnique({ where: { id: req.params.bookId }, select: { id: true, accessType: true, paperType: true } });
  if (!book) return fail(res, "题库不存在", 404);

  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
  const folderId = `${req.query?.folderId ?? "all"}`.trim();
  const type = `${req.query?.type ?? "all"}`.trim();
  const keyword = normalizeDisplayText(req.query?.keyword ?? "").trim();
  const excludeExisting = toBool(req.query?.excludeExisting, true);
  const existingLinks = excludeExisting
    ? await prisma.bookQuestionBankItem.findMany({
        where: {
          bookId: book.id,
          bookQuestionLibraryItemId: { not: null },
        },
        select: { bookQuestionLibraryItemId: true },
      })
    : [];
  const existingIds = existingLinks.map((item) => item.bookQuestionLibraryItemId).filter(Boolean);
  const allowedTypes = getQuestionTypesForPaperType(book.paperType);
  const where = {
    folder: { is: { accessType: book.accessType ?? "public", paperType: book.paperType } },
    ...(folderId && folderId !== "all" ? { folderId } : {}),
    ...(allowedTypes.has(type) ? { type } : {}),
    ...(existingIds.length > 0 ? { id: { notIn: existingIds } } : {}),
    ...(keyword
      ? {
          OR: [
            { stem: { contains: keyword } },
            { material: { contains: keyword } },
            { analysis: { contains: keyword } },
            { questionMetaJson: { contains: keyword } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.bookQuestionLibraryItem.count({ where }),
    prisma.bookQuestionLibraryItem.findMany({
      where,
      include: {
        folder: true,
        options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
        _count: { select: { bookQuestionBankItems: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok(res, {
    items: items.map(serializeSourceLibraryItem),
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  });
});

adminQuestionBankRouter.post("/:bookId/items/import", async (req, res) => {
  try {
    const book = await prisma.bookQuestionBank.findUnique({ where: { id: req.params.bookId }, select: { id: true, accessType: true, paperType: true } });
    if (!book) return fail(res, "题库不存在", 404);
    const subjectId = `${req.body?.subjectId ?? ""}`.trim();
    const sourceItemIds = toStringArray(req.body?.sourceItemIds ?? req.body?.itemIds);
    if (!subjectId) return fail(res, "请选择导入到哪个科目", 400);
    if (sourceItemIds.length === 0) return fail(res, "请选择要引用的题目", 400);

    const subject = await prisma.bookQuestionBankSubject.findFirst({
      where: { id: subjectId, bookId: book.id },
      select: { id: true },
    });
    if (!subject) return fail(res, "科目不存在", 404);

    const sourceItems = await prisma.bookQuestionLibraryItem.findMany({
      where: {
        id: { in: sourceItemIds },
        folder: { is: { accessType: book.accessType ?? "public", paperType: book.paperType } },
        type: { in: [...getQuestionTypesForPaperType(book.paperType)] },
      },
      include: {
        folder: true,
        options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    });
    if (sourceItems.length === 0) return fail(res, "所选题目不存在或与当前题库主客观类型不一致", 404);

    const existing = await prisma.bookQuestionBankItem.findMany({
      where: {
        bookId: book.id,
        bookQuestionLibraryItemId: { in: sourceItems.map((item) => item.id) },
      },
      select: { bookQuestionLibraryItemId: true },
    });
    const existingIds = new Set(existing.map((item) => item.bookQuestionLibraryItemId));
    const maxOrder = await prisma.bookQuestionBankItem.aggregate({
      where: { bookId: book.id, subjectId },
      _max: { sortOrder: true },
    });
    let orderCursor = Number(maxOrder._max.sortOrder ?? -1) + 1;
    const createdIds = [];
    const skippedIds = [];

    await prisma.$transaction(async (tx) => {
      for (const source of sourceItems) {
        if (existingIds.has(source.id)) {
          skippedIds.push(source.id);
          continue;
        }
        const meta = parseJsonSafely(source.questionMetaJson, {});
        const created = await tx.bookQuestionBankItem.create({
          data: {
            bookId: book.id,
            subjectId,
            bookQuestionLibraryItemId: source.id,
            title: meta?.title || null,
            questionNo: meta?.questionNo || null,
            yearLabel: meta?.yearLabel || null,
            pageLabel: meta?.pageLabel || null,
            tagsJson: JSON.stringify(Array.isArray(meta?.tags) ? meta.tags : []),
            type: source.type,
            stem: null,
            material: null,
            analysis: null,
            lessonAudioUrl: null,
            lessonAudioObjectKey: null,
            lessonAudioDurationSeconds: 0,
            score: source.score,
            correctAnswerJson: null,
            questionMetaJson: JSON.stringify({
              difficulty: Math.max(1, Math.min(3, toInt(meta?.difficulty, 2))),
            }),
            sortOrder: orderCursor,
            status: true,
          },
        });
        orderCursor += 1;
        createdIds.push(created.id);
      }
    });

    await writeAdminAuditLog(req, {
      action: "import_question_bank_items",
      entityType: "question_bank_item",
      entityId: book.id,
      detail: {
        bookId: book.id,
        subjectId,
        requestedCount: sourceItemIds.length,
        createdCount: createdIds.length,
        skippedCount: skippedIds.length,
      },
    });

    return ok(res, {
      success: true,
      createdCount: createdIds.length,
      skippedCount: skippedIds.length,
      createdIds,
      skippedIds,
    });
  } catch (error) {
    return fail(res, error.message || "引用题目失败", 500);
  }
});

adminQuestionBankRouter.get("/:bookId/items", async (req, res) => {
  const book = await prisma.bookQuestionBank.findUnique({ where: { id: req.params.bookId }, select: { id: true, paperType: true } });
  if (!book) return fail(res, "题库不存在", 404);

  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
  const subjectId = `${req.query?.subjectId ?? "all"}`.trim();
  const status = `${req.query?.status ?? "all"}`.trim();
  const type = `${req.query?.type ?? "all"}`.trim();
  const keyword = normalizeDisplayText(req.query?.keyword ?? "").trim();
  const allowedItemTypes = getQuestionTypesForPaperType(book.paperType);
  const where = {
    bookId: book.id,
    bookQuestionLibraryItemId: { not: null },
    ...(subjectId && subjectId !== "all" ? { subjectId } : {}),
    ...(status === "enabled" ? { status: true } : status === "disabled" ? { status: false } : {}),
    ...(allowedItemTypes.has(type) ? { type } : {}),
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { questionNo: { contains: keyword } },
            { stem: { contains: keyword } },
            { analysis: { contains: keyword } },
            { bookQuestionLibraryItem: { is: { stem: { contains: keyword } } } },
            { bookQuestionLibraryItem: { is: { material: { contains: keyword } } } },
            { bookQuestionLibraryItem: { is: { analysis: { contains: keyword } } } },
            { bookQuestionLibraryItem: { is: { questionMetaJson: { contains: keyword } } } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.bookQuestionBankItem.count({ where }),
    prisma.bookQuestionBankItem.findMany({
      where,
      include: {
        subject: true,
        ...includeBookQuestionBankItemSource,
        options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
        _count: { select: { userStates: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok(res, {
    items: items.map(serializeItem),
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  });
});

adminQuestionBankRouter.post("/:bookId/items", async (req, res) => {
  return fail(res, "练习题库不再直接录入题目，请先到练习原题库维护原题，再通过“从练习原题库选题”引用", 410);
});

adminQuestionBankRouter.get("/:bookId/items/:itemId", async (req, res) => {
  const item = await prisma.bookQuestionBankItem.findFirst({
    where: { id: req.params.itemId, bookId: req.params.bookId, bookQuestionLibraryItemId: { not: null } },
    include: {
      subject: true,
      ...includeBookQuestionBankItemSource,
      options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
      _count: { select: { userStates: true } },
    },
  });
  if (!item) return fail(res, "题目不存在", 404);
  return ok(res, serializeItem(item));
});

adminQuestionBankRouter.patch("/:bookId/items/:itemId", async (req, res) => {
  return fail(res, "练习题库不再直接编辑题目内容；原题内容请到练习原题库维护，启停请使用状态接口", 410);
});

adminQuestionBankRouter.patch("/:bookId/items/:itemId/status", async (req, res) => {
  try {
    const item = await prisma.bookQuestionBankItem.findFirst({
      where: { id: req.params.itemId, bookId: req.params.bookId, bookQuestionLibraryItemId: { not: null } },
      select: { id: true, bookId: true, subjectId: true, status: true, title: true, questionNo: true },
    });
    if (!item) return fail(res, "题目不存在", 404);

    const updated = await prisma.bookQuestionBankItem.update({
      where: { id: item.id },
      data: { status: toBool(req.body?.status, !item.status) },
      include: {
        subject: true,
        ...includeBookQuestionBankItemSource,
        options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
        _count: { select: { userStates: true } },
      },
    });

    await writeAdminAuditLog(req, {
      action: "update_question_bank_item_status",
      entityType: "question_bank_item",
      entityId: updated.id,
      entityName: updated.title || updated.questionNo || updated.id,
      detail: { bookId: updated.bookId, subjectId: updated.subjectId, status: updated.status },
    });
    return ok(res, serializeItem(updated));
  } catch (error) {
    return fail(res, error.message || "更新题目状态失败", 500);
  }
});

adminQuestionBankRouter.delete("/:bookId/items/:itemId", async (req, res) => {
  const item = await prisma.bookQuestionBankItem.findFirst({
    where: { id: req.params.itemId, bookId: req.params.bookId, bookQuestionLibraryItemId: { not: null } },
  });
  if (!item) return fail(res, "题目不存在", 404);

  await prisma.$transaction(async (tx) => {
    await tx.userBookQuestionBankItemState.deleteMany({ where: { bookItemId: item.id } });
    await tx.userBookQuestionBankProgress.updateMany({
      where: { bookId: item.bookId, lastBookItemId: item.id },
      data: { lastBookItemId: null },
    });
    await tx.bookQuestionBankItem.delete({ where: { id: item.id } });
    await recomputeBookQuestionBankProgress(tx, [item.bookId]);
  });
  await writeAdminAuditLog(req, {
    action: "delete_question_bank_item",
    entityType: "question_bank_item",
    entityId: item.id,
    entityName: item.title || item.questionNo || item.id,
    detail: { bookId: item.bookId, subjectId: item.subjectId },
  });
  return ok(res, { success: true });
});
