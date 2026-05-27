import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { fail, ok } from "../lib/response.js";
import { formatDateTime } from "../lib/time.js";
import { normalizeDisplayText } from "../lib/text.js";
import { parseQuestionImportRoot } from "../lib/question-import.js";
import { uploadBuffer } from "../lib/upload.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";

const CONTENT_MANAGER_ROLES = ["super_admin", "operations_admin"];
const PAPER_TYPES = new Set(["objective", "subjective"]);
const OBJECTIVE_TYPES = new Set(["single_choice", "multiple_choice", "uncertain_choice"]);
const QUESTION_TYPES = new Set([...OBJECTIVE_TYPES, "subjective_case"]);
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

export const adminExamQuestionBankRouter = Router();

adminExamQuestionBankRouter.use(requireAdminAuth);
adminExamQuestionBankRouter.use(requireAdminRoles(...CONTENT_MANAGER_ROLES));

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
      (Array.isArray(value) ? value : value ? `${value}`.split(/[,\n，、；;]/) : [])
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

const normalizeAnswerKeys = (value) => {
  const parsed = typeof value === "string" ? parseJsonSafely(value, value) : value;
  return [
    ...new Set(
      (Array.isArray(parsed) ? parsed : parsed ? `${parsed}`.split(/[,\n，、；;]/) : [])
        .map((item) => `${item ?? ""}`.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
};

const parsePaperType = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return PAPER_TYPES.has(normalized) ? normalized : "";
};

const readRequiredPaperType = (value) => {
  const paperType = parsePaperType(value);
  return paperType ? { paperType } : { error: "请提供有效的机考题库类型" };
};

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

const readQuestionType = (paperType, value) => {
  const normalized = normalizeQuestionType(value);
  if (!QUESTION_TYPES.has(normalized)) return { error: "请提供有效的题型" };
  if (paperType === "objective" && !OBJECTIVE_TYPES.has(normalized)) return { error: "客观机考题库不能保存主观题" };
  if (paperType === "subjective" && normalized !== "subjective_case") return { error: "主观机考题库只能保存主观案例题" };
  return { type: normalized };
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

const readRubricPoints = (value) =>
  (Array.isArray(value) ? value : [])
    .map((point, index) => ({
      id: `${point?.id ?? `point_${index + 1}`}`.trim(),
      title: normalizeDisplayText(point?.title ?? "").trim(),
      score: Math.max(0, toInt(point?.score, 0)),
      description: normalizeDisplayText(point?.description ?? "").trim(),
      keywords: toStringArray(point?.keywords),
      abilityLabel: normalizeDisplayText(point?.abilityLabel ?? "").trim(),
      referenceAnswer: normalizeDisplayText(point?.referenceAnswer ?? "").trim(),
      rubricGuidance: normalizeDisplayText(point?.rubricGuidance ?? "").trim(),
      sortOrder: toInt(point?.sortOrder, index + 1),
    }))
    .filter((point) => point.title)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((point, index) => ({ ...point, id: point.id || `point_${index + 1}`, sortOrder: index + 1 }));

const readSubQuestions = (value, stem) => {
  const items = (Array.isArray(value) ? value : [])
    .map((item, index) => ({
      id: `${item?.id ?? `sub_${index + 1}`}`.trim(),
      title: normalizeDisplayText(item?.title ?? "").trim(),
      placeholder: normalizeDisplayText(item?.placeholder ?? "").trim() || "请在此输入本问答案。",
      abilityLabel: normalizeDisplayText(item?.abilityLabel ?? "").trim(),
      referenceAnswer: normalizeDisplayText(item?.referenceAnswer ?? "").trim(),
      rubricGuidance: normalizeDisplayText(item?.rubricGuidance ?? "").trim(),
      rubricPoints: readRubricPoints(item?.rubricPoints),
      sortOrder: toInt(item?.sortOrder, index + 1),
    }))
    .filter((item) => item.title)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item, index) => ({ ...item, id: item.id || `sub_${index + 1}`, sortOrder: index + 1 }));

  if (items.length > 0) return items;
  return [
    {
      id: "sub_1",
      title: stem || "请作答",
      placeholder: "请在此输入本问答案。",
      abilityLabel: "",
      referenceAnswer: "",
      rubricGuidance: "",
      rubricPoints: [],
      sortOrder: 1,
    },
  ];
};

const buildQuestionMetaJson = (paperType, body, stem) => {
  const raw = typeof body.questionMetaJson === "string" ? parseJsonSafely(body.questionMetaJson, {}) : {};
  const meta = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const title = normalizeDisplayText(body.title ?? meta.title ?? "").trim();
  const questionNo = normalizeDisplayText(body.questionNo ?? meta.questionNo ?? "").trim();
  const yearLabel = normalizeDisplayText(body.yearLabel ?? meta.yearLabel ?? "").trim();
  const pageLabel = normalizeDisplayText(body.pageLabel ?? meta.pageLabel ?? "").trim();
  const sectionLabel = normalizeDisplayText(body.sectionLabel ?? meta.sectionLabel ?? "").trim();
  const sectionDescription = normalizeDisplayText(body.sectionDescription ?? meta.sectionDescription ?? "").trim();
  const tags = toStringArray(body.tags ?? meta.tags);
  const difficulty = Math.max(1, Math.min(3, toInt(body.difficulty ?? meta.difficulty, 2)));

  return JSON.stringify({
    ...meta,
    title,
    questionNo,
    yearLabel,
    pageLabel,
    sectionLabel: sectionLabel || (paperType === "subjective" ? "案例分析题" : ""),
    sectionDescription,
    tags,
    difficulty,
    ...(paperType === "subjective" ? { subQuestions: readSubQuestions(body.subQuestions ?? meta.subQuestions, stem) } : {}),
  });
};

const readFolderPayload = (body = {}) => {
  const { paperType, error } = readRequiredPaperType(body.paperType);
  return {
    paperType,
    paperTypeError: error,
    name: normalizeDisplayText(body.name ?? "").trim(),
  };
};

const readItemPayload = (body = {}, paperType) => {
  const stem = normalizeDisplayText(body.stem ?? "").trim();
  const { type, error: typeError } = readQuestionType(paperType, body.type ?? body.questionType);
  return {
    folderId: `${body.folderId ?? ""}`.trim(),
    type,
    typeError,
    stem,
    material: normalizeDisplayText(body.material ?? "").trim() || null,
    analysis: normalizeDisplayText(body.analysis ?? "").trim() || null,
    lessonAudioUrl: `${body.lessonAudioUrl ?? ""}`.trim() || null,
    lessonAudioObjectKey: `${body.lessonAudioObjectKey ?? ""}`.trim() || null,
    lessonAudioDurationSeconds: Math.max(0, toInt(body.lessonAudioDurationSeconds, 0)),
    score: Math.max(0, toInt(body.score, paperType === "subjective" ? 20 : 2)),
    sortOrder: toInt(body.sortOrder, 0),
    correctAnswerJson: JSON.stringify(paperType === "subjective" ? [] : normalizeAnswerKeys(body.correctAnswer ?? body.correctAnswerKeys ?? body.correctAnswerJson)),
    questionMetaJson: buildQuestionMetaJson(paperType, body, stem),
    options: paperType === "subjective" ? [] : readOptions(body.options),
  };
};

const getItemPaperType = (item) => item.folder?.paperType ?? (item.type === "subjective_case" ? "subjective" : "objective");

const serializeFolder = (folder) => ({
  id: folder.id,
  name: folder.name,
  paperType: folder.paperType,
  itemCount: folder._count?.items ?? folder.items?.length ?? 0,
  createdAt: formatDateTime(folder.createdAt),
  updatedAt: formatDateTime(folder.updatedAt),
});

const serializeItem = (item) => {
  const meta = parseJsonSafely(item.questionMetaJson, {});
  const tags = Array.isArray(meta?.tags) ? meta.tags : [];
  const subQuestions = Array.isArray(meta?.subQuestions) ? meta.subQuestions : [];
  const paperType = getItemPaperType(item);

  return {
    id: item.id,
    folderId: item.folderId,
    folderName: item.folder?.name ?? "",
    paperType,
    title: meta?.title ?? "",
    questionNo: meta?.questionNo ?? "",
    yearLabel: meta?.yearLabel ?? "",
    pageLabel: meta?.pageLabel ?? "",
    sectionLabel: meta?.sectionLabel ?? "",
    sectionDescription: meta?.sectionDescription ?? "",
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
    optionCount: item.options?.length ?? 0,
    examReferencedCount: item._count?.sourceQuestions ?? 0,
    options: (item.options ?? []).map((option) => ({
      id: option.id,
      optionKey: option.optionKey,
      content: option.content,
      sortOrder: Number(option.sortOrder ?? 0),
    })),
    subQuestions: subQuestions.map((subQuestion, index) => ({
      id: subQuestion.id ?? `sub_${index + 1}`,
      title: subQuestion.title ?? "",
      placeholder: subQuestion.placeholder ?? "",
      abilityLabel: subQuestion.abilityLabel ?? "",
      referenceAnswer: subQuestion.referenceAnswer ?? "",
      rubricGuidance: subQuestion.rubricGuidance ?? "",
      rubricPoints: Array.isArray(subQuestion.rubricPoints) ? subQuestion.rubricPoints : [],
      sortOrder: Number(subQuestion.sortOrder ?? index + 1),
    })),
    createdAt: formatDateTime(item.createdAt),
    updatedAt: formatDateTime(item.updatedAt),
  };
};

const validateItemPayload = async (payload, paperType) => {
  if (payload.typeError) return payload.typeError;
  if (!payload.folderId) return "请选择题目文件夹";
  const folder = await prisma.questionBankFolder.findUnique({ where: { id: payload.folderId }, select: { id: true, paperType: true } });
  if (!folder) return "题目文件夹不存在";
  if (folder.paperType !== paperType) return paperType === "objective" ? "客观机考题库只能选择客观文件夹" : "主观机考题库只能选择主观文件夹";
  if (paperType === "objective" && !OBJECTIVE_TYPES.has(payload.type)) return "客观机考题库不能保存主观题";
  if (paperType === "subjective" && payload.type !== "subjective_case") return "主观机考题库只能保存主观案例题";
  if (!payload.stem) return "请输入题干";
  if (paperType === "objective") {
    if (payload.options.length < 2) return "客观题至少需要两个选项";
    const optionKeys = new Set(payload.options.map((option) => option.optionKey));
    if (optionKeys.size !== payload.options.length) return "选项标识不能重复";
    const correctAnswer = normalizeAnswerKeys(payload.correctAnswerJson);
    if (correctAnswer.length === 0) return "请配置正确答案";
    if (payload.type === "single_choice" && correctAnswer.length !== 1) return "单选题只能配置一个正确答案";
    if (correctAnswer.some((answer) => !optionKeys.has(answer))) return "正确答案必须来自已配置选项";
  }
  return "";
};

adminExamQuestionBankRouter.get("/summary", async (req, res) => {
  const { paperType, error } = readRequiredPaperType(req.query?.paperType);
  if (error) return fail(res, error, 400);
  const [folderCount, itemCount, referencedItemCount] = await Promise.all([
    prisma.questionBankFolder.count({ where: { paperType } }),
    prisma.questionBankItem.count({ where: { folder: { paperType } } }),
    prisma.questionBankItem.count({ where: { folder: { paperType }, sourceQuestions: { some: {} } } }),
  ]);

  return ok(res, { paperType, folderCount, itemCount, referencedItemCount });
});

adminExamQuestionBankRouter.post("/assets/upload", assetUpload.single("file"), async (req, res) => {
  const assetType = `${req.body?.assetType ?? ""}`.trim();
  const file = req.file;
  if (assetType !== "lessonAudio") return fail(res, "上传类型不正确", 400);
  if (!file) return fail(res, "请选择要上传的音频文件", 400);
  if (!`${file.mimetype ?? ""}`.startsWith("audio/") && !/\.(mp3|m4a|wav|aac|ogg)$/i.test(file.originalname || "")) {
    return fail(res, "配套音频只能上传音频文件", 400);
  }

  const originalName = normalizeDisplayText(file.originalname || "exam-question-audio");
  const uploaded = await uploadBuffer({
    fileName: originalName,
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: "admin/exam-question-bank-audio",
  });

  return ok(
    res,
    {
      url: uploaded.readableUrl || uploaded.url,
      objectKey: uploaded.objectKey,
      fileName: originalName,
    },
    "配套音频已上传",
  );
});

adminExamQuestionBankRouter.get("/folders", async (req, res) => {
  const { paperType, error } = readRequiredPaperType(req.query?.paperType);
  if (error) return fail(res, error, 400);
  const folders = await prisma.questionBankFolder.findMany({
    where: { paperType },
    include: { _count: { select: { items: true } } },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });
  return ok(res, folders.map(serializeFolder));
});

adminExamQuestionBankRouter.post("/folders", async (req, res) => {
  try {
    const payload = readFolderPayload(req.body);
    if (payload.paperTypeError) return fail(res, payload.paperTypeError, 400);
    if (!payload.name) return fail(res, "请输入文件夹名称", 400);
    const folder = await prisma.questionBankFolder.create({
      data: { paperType: payload.paperType, name: payload.name },
      include: { _count: { select: { items: true } } },
    });
    await writeAdminAuditLog(req, {
      action: "create_exam_question_bank_folder",
      entityType: "exam_question_bank_folder",
      entityId: folder.id,
      entityName: folder.name,
      detail: { paperType: folder.paperType },
    });
    return ok(res, serializeFolder(folder));
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "同类型下已存在同名文件夹", 409);
    return fail(res, error.message || "创建文件夹失败", 500);
  }
});

adminExamQuestionBankRouter.patch("/folders/:folderId", async (req, res) => {
  try {
    const existing = await prisma.questionBankFolder.findUnique({ where: { id: req.params.folderId } });
    if (!existing) return fail(res, "文件夹不存在", 404);
    const requestedPaperType = parsePaperType(req.body?.paperType ?? req.query?.paperType);
    if (!requestedPaperType) return fail(res, "请提供有效的机考题库类型", 400);
    if (requestedPaperType !== existing.paperType) return fail(res, "不能切换机考题库文件夹的主客观类型", 409);
    const payload = { name: normalizeDisplayText(req.body?.name ?? "").trim() };
    if (!payload.name) return fail(res, "请输入文件夹名称", 400);
    const folder = await prisma.questionBankFolder.update({
      where: { id: existing.id },
      data: { name: payload.name },
      include: { _count: { select: { items: true } } },
    });
    await writeAdminAuditLog(req, {
      action: "update_exam_question_bank_folder",
      entityType: "exam_question_bank_folder",
      entityId: folder.id,
      entityName: folder.name,
      detail: { paperType: folder.paperType },
    });
    return ok(res, serializeFolder(folder));
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "同类型下已存在同名文件夹", 409);
    return fail(res, error.message || "保存文件夹失败", 500);
  }
});

adminExamQuestionBankRouter.delete("/folders/:folderId", async (req, res) => {
  const { paperType, error } = readRequiredPaperType(req.query?.paperType);
  if (error) return fail(res, error, 400);
  const folder = await prisma.questionBankFolder.findUnique({
    where: { id: req.params.folderId },
  });
  if (!folder) return fail(res, "文件夹不存在", 404);
  if (folder.paperType !== paperType) return fail(res, "文件夹不属于当前机考题库", 404);
  const items = await prisma.questionBankItem.findMany({
    where: { folderId: folder.id },
    select: { id: true },
  });
  const itemIds = items.map((item) => item.id);
  await prisma.$transaction(async (tx) => {
    if (itemIds.length > 0) {
      await tx.mockExamQuestion.updateMany({
        where: { sourceBankItemId: { in: itemIds } },
        data: { sourceBankItemId: null },
      });
      await tx.bookQuestionBankItem.updateMany({
        where: { questionBankItemId: { in: itemIds } },
        data: { questionBankItemId: null },
      });
      await tx.userBookQuestionBankItemState.updateMany({
        where: { questionBankItemId: { in: itemIds } },
        data: { questionBankItemId: null },
      });
      await tx.questionBankItem.deleteMany({ where: { id: { in: itemIds } } });
    }
    await tx.questionBankFolder.delete({ where: { id: folder.id } });
  });
  await writeAdminAuditLog(req, {
    action: "delete_exam_question_bank_folder",
    entityType: "exam_question_bank_folder",
    entityId: folder.id,
    entityName: folder.name,
    detail: { paperType: folder.paperType },
  });
  return ok(res, { success: true });
});

adminExamQuestionBankRouter.get("/items", async (req, res) => {
  const { paperType, error } = readRequiredPaperType(req.query?.paperType);
  if (error) return fail(res, error, 400);
  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
  const folderId = `${req.query?.folderId ?? "all"}`.trim();
  const type = `${req.query?.type ?? "all"}`.trim();
  if (type !== "all") {
    const { error: typeError } = readQuestionType(paperType, type);
    if (typeError) return fail(res, typeError, 400);
  }
  const keyword = normalizeDisplayText(req.query?.keyword ?? "").trim();
  const where = {
    folder: { paperType, ...(folderId && folderId !== "all" ? { id: folderId } : {}) },
    ...(QUESTION_TYPES.has(type) ? { type } : {}),
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
    prisma.questionBankItem.count({ where }),
    prisma.questionBankItem.findMany({
      where,
      include: {
        folder: true,
        options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
        _count: { select: { sourceQuestions: true } },
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

adminExamQuestionBankRouter.post("/items", async (req, res) => {
  try {
    const { paperType, error } = readRequiredPaperType(req.body?.paperType);
    if (error) return fail(res, error, 400);
    const payload = readItemPayload(req.body, paperType);
    const validationError = await validateItemPayload(payload, paperType);
    if (validationError) return fail(res, validationError, 400);

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.questionBankItem.create({
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
        await tx.questionBankItemOption.createMany({
          data: payload.options.map((option) => ({
            itemId: created.id,
            optionKey: option.optionKey,
            content: option.content,
            sortOrder: option.sortOrder,
          })),
        });
      }
      return tx.questionBankItem.findUnique({
        where: { id: created.id },
        include: {
          folder: true,
          options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
          _count: { select: { sourceQuestions: true } },
        },
      });
    });

    await writeAdminAuditLog(req, {
      action: "create_exam_question_bank_item",
      entityType: "exam_question_bank_item",
      entityId: item.id,
      entityName: parseJsonSafely(item.questionMetaJson, {})?.title || item.id,
      detail: { paperType, folderId: item.folderId, type: item.type },
    });
    return ok(res, serializeItem(item));
  } catch (error) {
    return fail(res, error.message || "创建题目失败", 500);
  }
});

adminExamQuestionBankRouter.post("/items/batch-import", importUpload.single("file"), async (req, res) => {
  try {
    const batch = readBatchImportPayload(req);
    if (!batch.paperType) return fail(res, "请选择有效的机考题库类型", 400);
    if (!batch.folderId) return fail(res, "请选择要导入的题目文件夹", 400);
    if (batch.items.length === 0) return fail(res, "请上传或粘贴包含题目数据的 JSON、Excel 或 CSV", 400);
    if (batch.items.length > MAX_BATCH_IMPORT_ITEMS) return fail(res, `单次最多导入 ${MAX_BATCH_IMPORT_ITEMS} 道题，请分批上传`, 400);

    const folder = await prisma.questionBankFolder.findUnique({
      where: { id: batch.folderId },
      select: { id: true, name: true, paperType: true },
    });
    if (!folder) return fail(res, "题目文件夹不存在", 404);
    if (folder.paperType !== batch.paperType) {
      return fail(res, batch.paperType === "objective" ? "客观机考题库只能导入客观文件夹" : "主观机考题库只能导入主观文件夹", 409);
    }

    const existingCount = await prisma.questionBankItem.count({ where: { folderId: folder.id } });
    const errors = [];
    const payloads = [];
    for (const [index, rawItem] of batch.items.entries()) {
      const rowIndex = index + 1;
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        errors.push({ index: rowIndex, message: "每道题必须是一行表格数据或一个 JSON 对象" });
        continue;
      }
      const sortOrderMissing = rawItem.sortOrder === undefined || rawItem.sortOrder === null || rawItem.sortOrder === "";
      const payload = readItemPayload(
        {
          ...rawItem,
          folderId: folder.id,
          paperType: batch.paperType,
          type: batch.paperType === "subjective" ? rawItem.type ?? "subjective_case" : rawItem.type,
          sortOrder: sortOrderMissing ? existingCount + rowIndex : rawItem.sortOrder,
        },
        batch.paperType,
      );
      if (batch.paperType === "subjective" && ((Array.isArray(rawItem.options) && rawItem.options.length > 0) || normalizeAnswerKeys(rawItem.correctAnswer ?? rawItem.correctAnswerKeys ?? rawItem.correctAnswerJson).length > 0)) {
        errors.push({ index: rowIndex, message: "主观机考题不需要客观选项或正确答案" });
        continue;
      }
      const validationError = await validateItemPayload(payload, batch.paperType);
      if (validationError) {
        errors.push({ index: rowIndex, message: validationError });
        continue;
      }
      payloads.push(payload);
    }

    if (errors.length > 0) return fail(res, formatBatchImportErrors(errors), 400);

    await prisma.$transaction(async (tx) => {
      for (const payload of payloads) {
        const created = await tx.questionBankItem.create({
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
          await tx.questionBankItemOption.createMany({
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
      action: "batch_import_exam_question_bank_items",
      entityType: "exam_question_bank_folder",
      entityId: folder.id,
      entityName: folder.name,
      detail: { paperType: batch.paperType, createdCount: payloads.length },
    });

    return ok(
      res,
      {
        folderId: folder.id,
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

adminExamQuestionBankRouter.get("/items/:itemId", async (req, res) => {
  const { paperType, error } = readRequiredPaperType(req.query?.paperType);
  if (error) return fail(res, error, 400);
  const item = await prisma.questionBankItem.findUnique({
    where: { id: req.params.itemId },
    include: {
      folder: true,
      options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
      _count: { select: { sourceQuestions: true } },
    },
  });
  if (!item) return fail(res, "题目不存在", 404);
  if (getItemPaperType(item) !== paperType) return fail(res, "题目不属于当前机考题库", 404);
  return ok(res, serializeItem(item));
});

adminExamQuestionBankRouter.patch("/items/:itemId", async (req, res) => {
  try {
    const existing = await prisma.questionBankItem.findUnique({
      where: { id: req.params.itemId },
      include: { folder: true, _count: { select: { sourceQuestions: true } } },
    });
    if (!existing) return fail(res, "题目不存在", 404);
    const paperType = existing.folder.paperType;
    const requestedPaperType = parsePaperType(req.body?.paperType ?? req.query?.paperType);
    if (!requestedPaperType) return fail(res, "请提供有效的机考题库类型", 400);
    if (requestedPaperType !== paperType) return fail(res, "不能切换机考题目的主客观类型", 409);
    const payload = readItemPayload(req.body, paperType);
    const validationError = await validateItemPayload(payload, paperType);
    if (validationError) return fail(res, validationError, 400);

    const item = await prisma.$transaction(async (tx) => {
      await tx.questionBankItem.update({
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
      await tx.questionBankItemOption.deleteMany({ where: { itemId: existing.id } });
      if (payload.options.length > 0) {
        await tx.questionBankItemOption.createMany({
          data: payload.options.map((option) => ({
            itemId: existing.id,
            optionKey: option.optionKey,
            content: option.content,
            sortOrder: option.sortOrder,
          })),
        });
      }
      return tx.questionBankItem.findUnique({
        where: { id: existing.id },
        include: {
          folder: true,
          options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
          _count: { select: { sourceQuestions: true } },
        },
      });
    });

    await writeAdminAuditLog(req, {
      action: "update_exam_question_bank_item",
      entityType: "exam_question_bank_item",
      entityId: item.id,
      entityName: parseJsonSafely(item.questionMetaJson, {})?.title || item.id,
      detail: { paperType, folderId: item.folderId, type: item.type },
    });
    return ok(res, serializeItem(item));
  } catch (error) {
    return fail(res, error.message || "保存题目失败", 500);
  }
});

adminExamQuestionBankRouter.delete("/items/:itemId", async (req, res) => {
  const { paperType, error } = readRequiredPaperType(req.query?.paperType);
  if (error) return fail(res, error, 400);
  const item = await prisma.questionBankItem.findUnique({
    where: { id: req.params.itemId },
    include: { folder: true },
  });
  if (!item) return fail(res, "题目不存在", 404);
  if (item.folder.paperType !== paperType) return fail(res, "题目不属于当前机考题库", 404);
  await prisma.$transaction(async (tx) => {
    await tx.mockExamQuestion.updateMany({
      where: { sourceBankItemId: item.id },
      data: { sourceBankItemId: null },
    });
    await tx.bookQuestionBankItem.updateMany({
      where: { questionBankItemId: item.id },
      data: { questionBankItemId: null },
    });
    await tx.userBookQuestionBankItemState.updateMany({
      where: { questionBankItemId: item.id },
      data: { questionBankItemId: null },
    });
    await tx.questionBankItem.delete({ where: { id: item.id } });
  });
  await writeAdminAuditLog(req, {
    action: "delete_exam_question_bank_item",
    entityType: "exam_question_bank_item",
    entityId: item.id,
    entityName: parseJsonSafely(item.questionMetaJson, {})?.title || item.id,
    detail: { paperType: item.folder.paperType, folderId: item.folderId, type: item.type },
  });
  return ok(res, { success: true });
});
