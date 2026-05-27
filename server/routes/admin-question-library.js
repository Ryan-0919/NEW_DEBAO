import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { fail, ok } from "../lib/response.js";
import { formatDateTime } from "../lib/time.js";
import { normalizeDisplayText } from "../lib/text.js";
import { parseQuestionImportRoot } from "../lib/question-import.js";
import { uploadBuffer } from "../lib/upload.js";
import { recomputeBookQuestionBankProgress } from "../lib/question-bank-progress.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";

const CONTENT_MANAGER_ROLES = ["super_admin", "operations_admin"];
const BOOK_ACCESS_TYPES = new Set(["public", "authorized"]);
const PAPER_TYPES = new Set(["objective", "subjective"]);
const QUESTION_TYPES = new Set(["single_choice", "multiple_choice", "uncertain_choice", "subjective_case"]);
const OBJECTIVE_QUESTION_TYPES = new Set(["single_choice", "multiple_choice", "uncertain_choice"]);
const SUBJECTIVE_QUESTION_TYPES = new Set(["subjective_case"]);
const OPTION_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024,
    files: 1,
  },
});
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});
const MAX_BATCH_IMPORT_ITEMS = 200;

export const adminQuestionLibraryRouter = Router();

adminQuestionLibraryRouter.use(requireAdminAuth);
adminQuestionLibraryRouter.use(requireAdminRoles(...CONTENT_MANAGER_ROLES));

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const readBatchImportPayload = (req) => {
  const root = parseQuestionImportRoot(req);
  const normalizedRoot = Array.isArray(root) ? { items: root } : root && typeof root === "object" ? root : {};
  const body = req.body && typeof req.body === "object" ? req.body : {};
  return {
    accessType: parseAccessType(body.accessType ?? normalizedRoot.accessType, ""),
    paperType: parsePaperType(body.paperType ?? normalizedRoot.paperType),
    folderId: `${body.folderId ?? normalizedRoot.folderId ?? ""}`.trim(),
    items: Array.isArray(normalizedRoot.items) ? normalizedRoot.items : [],
  };
};

const formatBatchImportErrors = (errors) => {
  const visibleErrors = errors.slice(0, 6).map((error) => `第 ${error.index} 题：${error.message}`);
  const suffix = errors.length > visibleErrors.length ? `；另有 ${errors.length - visibleErrors.length} 个错误` : "";
  return `批量导入校验失败；${visibleErrors.join("；")}${suffix}`;
};

const readPaperType = (value, fallback = "objective") => {
  const normalized = `${value ?? ""}`.trim();
  return PAPER_TYPES.has(normalized) ? normalized : fallback;
};

const readAccessType = (value, fallback = "public") => {
  const normalized = `${value ?? ""}`.trim();
  return BOOK_ACCESS_TYPES.has(normalized) ? normalized : fallback;
};

const parseAccessType = (value, fallback = "") => {
  const normalized = `${value ?? ""}`.trim();
  if (!normalized) return fallback;
  return BOOK_ACCESS_TYPES.has(normalized) ? normalized : "";
};

const parsePaperType = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return PAPER_TYPES.has(normalized) ? normalized : "";
};

const getQuestionTypesForPaperType = (paperType) =>
  paperType === "subjective" ? SUBJECTIVE_QUESTION_TYPES : OBJECTIVE_QUESTION_TYPES;

const normalizeQuestionType = (value) => {
  const normalized = normalizeDisplayText(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .toLowerCase();
  const map = {
    singlechoice: "single_choice",
    single_choice: "single_choice",
    单选: "single_choice",
    单项选择: "single_choice",
    单项选择题: "single_choice",
    multiplechoice: "multiple_choice",
    multiple_choice: "multiple_choice",
    多选: "multiple_choice",
    多项选择: "multiple_choice",
    多项选择题: "multiple_choice",
    uncertainchoice: "uncertain_choice",
    uncertain_choice: "uncertain_choice",
    不定项: "uncertain_choice",
    不定项选择: "uncertain_choice",
    不定项选择题: "uncertain_choice",
    subjectivecase: "subjective_case",
    subjective_case: "subjective_case",
    主观: "subjective_case",
    主观题: "subjective_case",
    主观案例: "subjective_case",
    主观案例题: "subjective_case",
    案例分析: "subjective_case",
    案例分析题: "subjective_case",
  };
  return map[normalized] ?? normalized;
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

const readQuestionType = (value) => {
  const normalized = normalizeQuestionType(value);
  return QUESTION_TYPES.has(normalized) ? normalized : "single_choice";
};

const parseQuestionType = (value) => {
  const normalized = normalizeQuestionType(value);
  return QUESTION_TYPES.has(normalized) ? normalized : "";
};

const readFolderPayload = (body = {}) => ({
  name: normalizeDisplayText(body.name ?? "").trim(),
  accessType: parseAccessType(body.accessType, "public"),
  paperType: parsePaperType(body.paperType),
});

const hasDuplicateFolderName = async ({ name, accessType, paperType, excludeId = "" }) => {
  const duplicate = await prisma.bookQuestionLibraryFolder.findFirst({
    where: {
      name,
      accessType,
      paperType,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(duplicate);
};

const readOptions = (value) =>
  (Array.isArray(value) ? value : [])
    .map((option, index) => ({
      optionKey: `${option?.optionKey ?? option?.key ?? OPTION_KEYS[index] ?? ""}`.trim().toUpperCase(),
      content: normalizeDisplayText(option?.content ?? option?.text ?? "").trim(),
      sortOrder: toInt(option?.sortOrder, index),
    }))
    .filter((option) => option.optionKey && option.content)
    .sort((left, right) => left.sortOrder - right.sortOrder);

const readSubjectiveSubQuestions = (value) => {
  const parsed = typeof value === "string" ? parseJsonSafely(value, []) : value;
  return (Array.isArray(parsed) ? parsed : [])
    .map((item, index) => {
      const prompt = normalizeDisplayText(item?.prompt ?? item?.stem ?? item?.question ?? "").trim();
      const rubricGuidance = normalizeDisplayText(item?.rubricGuidance ?? "").trim();
      const analysis = normalizeDisplayText(item?.analysis ?? item?.explanation ?? item?.answerAnalysis ?? rubricGuidance).trim();
      return {
        id: normalizeDisplayText(item?.id ?? `sub_${index + 1}`).trim() || `sub_${index + 1}`,
        title: normalizeDisplayText(item?.title ?? item?.name ?? "").trim(),
        prompt,
        placeholder: normalizeDisplayText(item?.placeholder ?? item?.answerPlaceholder ?? "").trim(),
        referenceAnswer: normalizeDisplayText(item?.referenceAnswer ?? item?.answer ?? item?.standardAnswer ?? "").trim(),
        analysis,
        ...(rubricGuidance ? { rubricGuidance } : {}),
        ...(Array.isArray(item?.rubricPoints) ? { rubricPoints: item.rubricPoints } : {}),
        sortOrder: toInt(item?.sortOrder, index + 1),
      };
    })
    .filter((item) => item.title || item.prompt || item.placeholder || item.referenceAnswer || item.analysis || item.rubricGuidance || item.rubricPoints?.length)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));
};

const readItemMeta = (body = {}) => {
  const raw = body.questionMetaJson && typeof body.questionMetaJson === "string" ? parseJsonSafely(body.questionMetaJson, {}) : {};
  const meta = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    ...meta,
    title: normalizeDisplayText(body.title ?? meta.title ?? "").trim(),
    questionNo: normalizeDisplayText(body.questionNo ?? meta.questionNo ?? "").trim(),
    yearLabel: normalizeDisplayText(body.yearLabel ?? meta.yearLabel ?? "").trim(),
    pageLabel: normalizeDisplayText(body.pageLabel ?? meta.pageLabel ?? "").trim(),
    tags: toStringArray(body.tags ?? meta.tags),
    difficulty: Math.max(1, Math.min(3, toInt(body.difficulty ?? meta.difficulty, 2))),
  };
};

const readItemPayload = (body = {}) => {
  const requestedType = parseQuestionType(body.type);
  const correctAnswer = normalizeAnswerKeys(body.correctAnswer ?? body.correctAnswers ?? body.correctAnswerJson);
  const meta = readItemMeta(body);
  const subQuestions = requestedType === "subjective_case" ? readSubjectiveSubQuestions(body.subQuestions ?? meta.subQuestions) : [];
  if (requestedType === "subjective_case") {
    meta.subQuestions = subQuestions;
  } else {
    delete meta.subQuestions;
  }
  return {
    folderId: `${body.folderId ?? ""}`.trim(),
    type: requestedType,
    stem: normalizeDisplayText(body.stem ?? "").trim(),
    material: normalizeDisplayText(body.material ?? "").trim() || null,
    analysis: normalizeDisplayText(body.analysis ?? "").trim() || null,
    lessonAudioUrl: `${body.lessonAudioUrl ?? ""}`.trim() || null,
    lessonAudioObjectKey: `${body.lessonAudioObjectKey ?? ""}`.trim() || null,
    lessonAudioDurationSeconds: Math.max(0, toInt(body.lessonAudioDurationSeconds, 0)),
    score: Math.max(0, toInt(body.score, 2)),
    sortOrder: toInt(body.sortOrder, 0),
    correctAnswerJson: JSON.stringify(correctAnswer),
    questionMetaJson: JSON.stringify(meta),
    options: readOptions(body.options),
    correctAnswer,
    subQuestions,
  };
};

const serializeFolder = (folder) => ({
  id: folder.id,
  name: folder.name,
  accessType: folder.accessType ?? "public",
  paperType: folder.paperType ?? "objective",
  itemCount: folder._count?.items ?? folder.items?.length ?? 0,
  createdAt: formatDateTime(folder.createdAt),
  updatedAt: formatDateTime(folder.updatedAt),
});

const serializeItem = (item) => {
  const meta = parseJsonSafely(item.questionMetaJson, {});
  const tags = Array.isArray(meta?.tags) ? meta.tags : [];
  const subQuestions = readSubjectiveSubQuestions(meta?.subQuestions);
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
    sortOrder: Number(item.sortOrder ?? 0),
    correctAnswer: normalizeAnswerKeys(item.correctAnswerJson),
    subQuestions,
    optionCount: item.options?.length ?? 0,
    referencedCount: item._count?.bookQuestionBankItems ?? 0,
    examReferencedCount: 0,
    userStateCount: item._count?.bookQuestionBankItemStates ?? 0,
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

const validateItemPayload = async (payload) => {
  if (!payload.folderId) return "请选择题目文件夹";
  if (!payload.type) return "请选择有效题型";
  const folder = await prisma.bookQuestionLibraryFolder.findUnique({ where: { id: payload.folderId }, select: { id: true, accessType: true, paperType: true } });
  if (!folder) return "题目文件夹不存在";
  const allowedTypes = getQuestionTypesForPaperType(folder.paperType);
  if (!allowedTypes.has(payload.type)) return folder.paperType === "subjective" ? "主观题文件夹只能录入主观案例题" : "客观题文件夹只能录入选择题";
  if (!payload.stem) return "请输入题干";
  if (folder.paperType === "subjective") {
    if (payload.subQuestions.length === 0) return "主观题原题至少需要配置一个小问";
    if (payload.subQuestions.some((item) => !item.title && !item.prompt)) return "每个小问需要填写小问标题或小问题干";
    if (payload.subQuestions.some((item) => !item.referenceAnswer && !item.analysis)) return "每个小问需要填写参考答案或本问解析";
    if (payload.options.length > 0 || payload.correctAnswer.length > 0) return "主观题原题不需要客观选项或正确答案";
    return "";
  }
  if (payload.options.length < 2) return "题目至少需要两个选项";
  const optionKeys = new Set(payload.options.map((option) => option.optionKey));
  if (optionKeys.size !== payload.options.length) return "选项标识不能重复";
  if (payload.correctAnswer.length === 0) return "请配置正确答案";
  if (payload.type === "single_choice" && payload.correctAnswer.length !== 1) return "单选题只能配置一个正确答案";
  if (payload.correctAnswer.some((answer) => !optionKeys.has(answer))) return "正确答案必须来自已配置选项";
  return "";
};

adminQuestionLibraryRouter.get("/summary", async (req, res) => {
  const accessType = parseAccessType(req.query?.accessType, "public");
  if (!accessType) return fail(res, "请选择有效的免费/授权原题库范围", 400);
  const paperType = readPaperType(req.query?.paperType);
  const paperTypeWhere = { folder: { is: { accessType, paperType } } };
  const [folderCount, itemCount, referencedItemCount, objectiveItemCount, subjectiveItemCount] = await Promise.all([
    prisma.bookQuestionLibraryFolder.count({ where: { accessType, paperType } }),
    prisma.bookQuestionLibraryItem.count({ where: paperTypeWhere }),
    prisma.bookQuestionLibraryItem.count({
      where: {
        ...paperTypeWhere,
        bookQuestionBankItems: {
          some: {},
        },
      },
    }),
    prisma.bookQuestionLibraryItem.count({ where: { folder: { is: { accessType, paperType: "objective" } } } }),
    prisma.bookQuestionLibraryItem.count({ where: { folder: { is: { accessType, paperType: "subjective" } } } }),
  ]);
  return ok(res, {
    folderCount,
    itemCount,
    referencedItemCount,
    objectiveItemCount,
    subjectiveItemCount,
  });
});

adminQuestionLibraryRouter.get("/folders", async (req, res) => {
  const accessType = parseAccessType(req.query?.accessType, "public");
  if (!accessType) return fail(res, "请选择有效的免费/授权原题库范围", 400);
  const paperType = readPaperType(req.query?.paperType);
  const folders = await prisma.bookQuestionLibraryFolder.findMany({
    where: { accessType, paperType },
    include: { _count: { select: { items: true } } },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });
  return ok(res, folders.map(serializeFolder));
});

adminQuestionLibraryRouter.post("/folders", async (req, res) => {
  try {
    const payload = readFolderPayload(req.body);
    if (!payload.accessType) return fail(res, "请选择免费/授权原题库范围", 400);
    if (!payload.name) return fail(res, "请输入文件夹名称", 400);
    if (!payload.paperType) return fail(res, "请选择题库主客观类型", 400);
    if (await hasDuplicateFolderName(payload)) return fail(res, "同类型下已存在同名文件夹", 409);
    const folder = await prisma.bookQuestionLibraryFolder.create({
      data: payload,
      include: { _count: { select: { items: true } } },
    });
    await writeAdminAuditLog(req, {
      action: "create_book_question_library_folder",
      entityType: "book_question_library_folder",
      entityId: folder.id,
      entityName: folder.name,
    });
    return ok(res, serializeFolder(folder));
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "已存在同名文件夹", 409);
    return fail(res, error.message || "创建题目文件夹失败", 500);
  }
});

adminQuestionLibraryRouter.patch("/folders/:folderId", async (req, res) => {
  try {
    const existing = await prisma.bookQuestionLibraryFolder.findUnique({ where: { id: req.params.folderId } });
    if (!existing) return fail(res, "文件夹不存在", 404);
    const payload = readFolderPayload(req.body);
    if (!payload.name) return fail(res, "请输入文件夹名称", 400);
    if (!payload.paperType) return fail(res, "请选择题库主客观类型", 400);
    const itemCount = await prisma.bookQuestionLibraryItem.count({ where: { folderId: existing.id } });
    if (itemCount > 0 && (existing.paperType !== payload.paperType || (existing.accessType ?? "public") !== payload.accessType)) return fail(res, "文件夹下已有题目，不能更改免费/授权范围或主客观类型", 409);
    if (await hasDuplicateFolderName({ ...payload, excludeId: existing.id })) return fail(res, "同类型下已存在同名文件夹", 409);
    const folder = await prisma.bookQuestionLibraryFolder.update({
      where: { id: existing.id },
      data: payload,
      include: { _count: { select: { items: true } } },
    });
    await writeAdminAuditLog(req, {
      action: "update_book_question_library_folder",
      entityType: "book_question_library_folder",
      entityId: folder.id,
      entityName: folder.name,
    });
    return ok(res, serializeFolder(folder));
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "已存在同名文件夹", 409);
    return fail(res, error.message || "保存题目文件夹失败", 500);
  }
});

adminQuestionLibraryRouter.delete("/folders/:folderId", async (req, res) => {
  const folder = await prisma.bookQuestionLibraryFolder.findUnique({
    where: { id: req.params.folderId },
    select: { id: true, name: true },
  });
  if (!folder) return fail(res, "文件夹不存在", 404);

  const items = await prisma.bookQuestionLibraryItem.findMany({
    where: { folderId: folder.id },
    select: { id: true },
  });
  const itemIds = items.map((item) => item.id);
  const linkedItems = itemIds.length > 0
    ? await prisma.bookQuestionBankItem.findMany({
        where: { bookQuestionLibraryItemId: { in: itemIds } },
        select: { id: true, bookId: true },
      })
    : [];
  const linkedBookIds = [...new Set(linkedItems.map((item) => item.bookId))];
  const linkedItemIds = linkedItems.map((item) => item.id);

  await prisma.$transaction(async (tx) => {
    if (linkedItemIds.length > 0) {
      await tx.userBookQuestionBankItemState.deleteMany({ where: { bookItemId: { in: linkedItemIds } } });
      await tx.bookQuestionBankItem.deleteMany({ where: { id: { in: linkedItemIds } } });
    }
    if (itemIds.length > 0) {
      await tx.userBookQuestionBankItemState.deleteMany({ where: { bookQuestionLibraryItemId: { in: itemIds } } });
      await tx.bookQuestionLibraryItem.deleteMany({ where: { id: { in: itemIds } } });
    }
    await tx.bookQuestionLibraryFolder.delete({ where: { id: folder.id } });
    await recomputeBookQuestionBankProgress(tx, linkedBookIds);
  });
  await writeAdminAuditLog(req, {
    action: "delete_book_question_library_folder",
    entityType: "book_question_library_folder",
    entityId: folder.id,
    entityName: folder.name,
  });
  return ok(res, { success: true });
});

adminQuestionLibraryRouter.post("/assets/upload", assetUpload.single("file"), async (req, res) => {
  const assetType = `${req.body?.assetType ?? ""}`.trim();
  const file = req.file;
  if (assetType !== "lessonAudio") return fail(res, "上传类型不正确", 400);
  if (!file) return fail(res, "请选择要上传的文件", 400);
  if (!`${file.mimetype ?? ""}`.startsWith("audio/") && !/\.(mp3|m4a|wav|aac|ogg)$/i.test(file.originalname || "")) {
    return fail(res, "音频微课只能上传音频文件", 400);
  }

  const originalName = normalizeDisplayText(file.originalname || "lesson-audio");
  const uploaded = await uploadBuffer({
    fileName: originalName,
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: "admin/question-library-audio",
  });

  return ok(
    res,
    {
      url: uploaded.readableUrl || uploaded.url,
      objectKey: uploaded.objectKey,
      fileName: originalName,
    },
    "音频微课已上传",
  );
});

adminQuestionLibraryRouter.get("/items", async (req, res) => {
  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
  const folderId = `${req.query?.folderId ?? "all"}`.trim();
  const accessType = parseAccessType(req.query?.accessType, "public");
  if (!accessType) return fail(res, "请选择有效的免费/授权原题库范围", 400);
  const paperType = readPaperType(req.query?.paperType);
  const type = `${req.query?.type ?? "all"}`.trim();
  const keyword = normalizeDisplayText(req.query?.keyword ?? "").trim();
  const where = {
    folder: { is: { accessType, paperType } },
    ...(folderId && folderId !== "all" ? { folderId } : {}),
    ...(getQuestionTypesForPaperType(paperType).has(type) ? { type } : {}),
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
        _count: {
          select: {
            bookQuestionBankItems: true,
            bookQuestionBankItemStates: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
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

adminQuestionLibraryRouter.post("/items", async (req, res) => {
  try {
    const payload = readItemPayload(req.body);
    const validationError = await validateItemPayload(payload);
    if (validationError) return fail(res, validationError, 400);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.bookQuestionLibraryItem.create({
        data: {
          folderId: payload.folderId,
          type: payload.type,
          stem: payload.stem,
          material: payload.material,
          analysis: payload.analysis,
          lessonAudioUrl: payload.lessonAudioUrl,
          lessonAudioObjectKey: payload.lessonAudioObjectKey,
          lessonAudioDurationSeconds: payload.lessonAudioDurationSeconds,
          score: payload.score,
          sortOrder: payload.sortOrder,
          correctAnswerJson: payload.correctAnswerJson,
          questionMetaJson: payload.questionMetaJson,
        },
      });
      if (payload.options.length > 0) {
        await tx.bookQuestionLibraryItemOption.createMany({
          data: payload.options.map((option) => ({
            itemId: created.id,
            optionKey: option.optionKey,
            content: option.content,
            sortOrder: option.sortOrder,
          })),
        });
      }
      return tx.bookQuestionLibraryItem.findUnique({
        where: { id: created.id },
        include: {
          folder: true,
          options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
          _count: { select: { bookQuestionBankItems: true, bookQuestionBankItemStates: true } },
        },
      });
    });
    await writeAdminAuditLog(req, {
      action: "create_book_question_library_item",
      entityType: "book_question_library_item",
      entityId: item.id,
      entityName: parseJsonSafely(item.questionMetaJson, {})?.title || item.id,
      detail: { folderId: item.folderId, type: item.type, optionCount: item.options.length },
    });
    return ok(res, serializeItem(item));
  } catch (error) {
    return fail(res, error.message || "创建题目失败", 500);
  }
});

adminQuestionLibraryRouter.post("/items/batch-import", importUpload.single("file"), async (req, res) => {
  try {
    const batch = readBatchImportPayload(req);
    if (!batch.accessType) return fail(res, "请选择免费/授权原题库范围", 400);
    if (!batch.paperType) return fail(res, "请选择题库主客观类型", 400);
    if (!batch.folderId) return fail(res, "请选择要导入的题目文件夹", 400);
    if (batch.items.length === 0) return fail(res, "请上传或粘贴包含题目数据的 JSON、Excel 或 CSV", 400);
    if (batch.items.length > MAX_BATCH_IMPORT_ITEMS) return fail(res, `单次最多导入 ${MAX_BATCH_IMPORT_ITEMS} 道题，请分批上传`, 400);

    const folder = await prisma.bookQuestionLibraryFolder.findUnique({
      where: { id: batch.folderId },
      select: { id: true, name: true, accessType: true, paperType: true },
    });
    if (!folder) return fail(res, "题目文件夹不存在", 404);
    if ((folder.accessType ?? "public") !== batch.accessType || folder.paperType !== batch.paperType) {
      return fail(res, "导入文件夹不属于当前免费/授权范围或主客观类型", 409);
    }

    const existingCount = await prisma.bookQuestionLibraryItem.count({ where: { folderId: folder.id } });
    const errors = [];
    const payloads = [];
    for (const [index, rawItem] of batch.items.entries()) {
      const rowIndex = index + 1;
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        errors.push({ index: rowIndex, message: "每道题必须是一行表格数据或一个 JSON 对象" });
        continue;
      }
      const sortOrderMissing = rawItem.sortOrder === undefined || rawItem.sortOrder === null || rawItem.sortOrder === "";
      const payload = readItemPayload({
        ...rawItem,
        folderId: folder.id,
        type: batch.paperType === "subjective" ? rawItem.type ?? "subjective_case" : rawItem.type,
        sortOrder: sortOrderMissing ? existingCount + rowIndex : rawItem.sortOrder,
      });
      if (batch.paperType === "subjective" && ((Array.isArray(rawItem.options) && rawItem.options.length > 0) || normalizeAnswerKeys(rawItem.correctAnswer ?? rawItem.correctAnswers ?? rawItem.correctAnswerJson).length > 0)) {
        errors.push({ index: rowIndex, message: "主观题原题不需要客观选项或正确答案" });
        continue;
      }
      const validationError = await validateItemPayload(payload);
      if (validationError) {
        errors.push({ index: rowIndex, message: validationError });
        continue;
      }
      payloads.push(payload);
    }

    if (errors.length > 0) return fail(res, formatBatchImportErrors(errors), 400);

    await prisma.$transaction(async (tx) => {
      for (const payload of payloads) {
        const created = await tx.bookQuestionLibraryItem.create({
          data: {
            folderId: payload.folderId,
            type: payload.type,
            stem: payload.stem,
            material: payload.material,
            analysis: payload.analysis,
            lessonAudioUrl: payload.lessonAudioUrl,
            lessonAudioObjectKey: payload.lessonAudioObjectKey,
            lessonAudioDurationSeconds: payload.lessonAudioDurationSeconds,
            score: payload.score,
            sortOrder: payload.sortOrder,
            correctAnswerJson: payload.correctAnswerJson,
            questionMetaJson: payload.questionMetaJson,
          },
        });
        if (payload.options.length > 0) {
          await tx.bookQuestionLibraryItemOption.createMany({
            data: payload.options.map((option) => ({
              itemId: created.id,
              optionKey: option.optionKey,
              content: option.content,
              sortOrder: option.sortOrder,
            })),
          });
        }
      }
    });

    await writeAdminAuditLog(req, {
      action: "batch_import_book_question_library_items",
      entityType: "book_question_library_folder",
      entityId: folder.id,
      entityName: folder.name,
      detail: { accessType: batch.accessType, paperType: batch.paperType, createdCount: payloads.length },
    });

    return ok(
      res,
      {
        folderId: folder.id,
        accessType: batch.accessType,
        paperType: batch.paperType,
        createdCount: payloads.length,
        totalCount: batch.items.length,
      },
      "批量导入完成",
    );
  } catch (error) {
    if (error instanceof SyntaxError) return fail(res, "导入文件不是有效 JSON，请检查格式", 400);
    return fail(res, error.message || "批量导入题目失败", 500);
  }
});

adminQuestionLibraryRouter.get("/items/:itemId", async (req, res) => {
  const item = await prisma.bookQuestionLibraryItem.findUnique({
    where: { id: req.params.itemId },
    include: {
      folder: true,
      options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
      _count: { select: { bookQuestionBankItems: true, bookQuestionBankItemStates: true } },
    },
  });
  if (!item) return fail(res, "题目不存在", 404);
  return ok(res, serializeItem(item));
});

adminQuestionLibraryRouter.patch("/items/:itemId", async (req, res) => {
  try {
    const existing = await prisma.bookQuestionLibraryItem.findUnique({
      where: { id: req.params.itemId },
      include: {
        folder: { select: { paperType: true } },
        _count: { select: { bookQuestionBankItems: true, bookQuestionBankItemStates: true } },
      },
    });
    if (!existing) return fail(res, "题目不存在", 404);
    const payload = readItemPayload(req.body);
    const validationError = await validateItemPayload(payload);
    if (validationError) return fail(res, validationError, 400);
    if (existing._count.bookQuestionBankItems > 0 || existing._count.bookQuestionBankItemStates > 0) {
      const nextFolder = await prisma.bookQuestionLibraryFolder.findUnique({
        where: { id: payload.folderId },
        select: { paperType: true },
      });
      if (payload.folderId !== existing.folderId || payload.type !== existing.type || nextFolder?.paperType !== existing.folder.paperType) {
        return fail(res, "原题已被题库引用或已有练习记录后，不能更改文件夹、题型或主客观类型", 409);
      }
    }
    const item = await prisma.$transaction(async (tx) => {
      await tx.bookQuestionLibraryItem.update({
        where: { id: existing.id },
        data: {
          folderId: payload.folderId,
          type: payload.type,
          stem: payload.stem,
          material: payload.material,
          analysis: payload.analysis,
          lessonAudioUrl: payload.lessonAudioUrl,
          lessonAudioObjectKey: payload.lessonAudioObjectKey,
          lessonAudioDurationSeconds: payload.lessonAudioDurationSeconds,
          score: payload.score,
          sortOrder: payload.sortOrder,
          correctAnswerJson: payload.correctAnswerJson,
          questionMetaJson: payload.questionMetaJson,
        },
      });
      await tx.bookQuestionLibraryItemOption.deleteMany({ where: { itemId: existing.id } });
      if (payload.options.length > 0) {
        await tx.bookQuestionLibraryItemOption.createMany({
          data: payload.options.map((option) => ({
            itemId: existing.id,
            optionKey: option.optionKey,
            content: option.content,
            sortOrder: option.sortOrder,
          })),
        });
      }
      return tx.bookQuestionLibraryItem.findUnique({
        where: { id: existing.id },
        include: {
          folder: true,
          options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
          _count: { select: { bookQuestionBankItems: true, bookQuestionBankItemStates: true } },
        },
      });
    });
    await writeAdminAuditLog(req, {
      action: "update_book_question_library_item",
      entityType: "book_question_library_item",
      entityId: item.id,
      entityName: parseJsonSafely(item.questionMetaJson, {})?.title || item.id,
      detail: { folderId: item.folderId, type: item.type, optionCount: item.options.length },
    });
    return ok(res, serializeItem(item));
  } catch (error) {
    return fail(res, error.message || "保存题目失败", 500);
  }
});

adminQuestionLibraryRouter.delete("/items/:itemId", async (req, res) => {
  const item = await prisma.bookQuestionLibraryItem.findUnique({
    where: { id: req.params.itemId },
  });
  if (!item) return fail(res, "题目不存在", 404);
  const linkedItems = await prisma.bookQuestionBankItem.findMany({
    where: { bookQuestionLibraryItemId: item.id },
    select: { id: true, bookId: true },
  });
  const linkedBookIds = [...new Set(linkedItems.map((linkedItem) => linkedItem.bookId))];
  const linkedItemIds = linkedItems.map((linkedItem) => linkedItem.id);

  await prisma.$transaction(async (tx) => {
    if (linkedItemIds.length > 0) {
      await tx.userBookQuestionBankItemState.deleteMany({ where: { bookItemId: { in: linkedItemIds } } });
      await tx.bookQuestionBankItem.deleteMany({ where: { id: { in: linkedItemIds } } });
    }
    await tx.userBookQuestionBankItemState.deleteMany({ where: { bookQuestionLibraryItemId: item.id } });
    await tx.bookQuestionLibraryItem.delete({ where: { id: item.id } });
    await recomputeBookQuestionBankProgress(tx, linkedBookIds);
  });
  await writeAdminAuditLog(req, {
    action: "delete_book_question_library_item",
    entityType: "book_question_library_item",
    entityId: item.id,
    entityName: item.id,
    detail: { folderId: item.folderId, type: item.type },
  });
  return ok(res, { success: true });
});
