import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { prisma } from "../lib/prisma.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";
import { ok, fail } from "../lib/response.js";
import { serializeAudio, serializeFolder, serializeTag, serializeVideo, serializeVideoFolder } from "../lib/serializers.js";
import { serializeCourseWithCounts } from "../lib/course-content.js";
import { formatDateTime } from "../lib/time.js";
import { deleteObjectPrefix, uploadBuffer } from "../lib/upload.js";
import { cleanupObjectIfReplaced, cleanupObjectIfUnused } from "../lib/assets.js";
import { normalizeDisplayText } from "../lib/text.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import {
  cleanupStagedMediaUploadFile,
  enqueueMediaProcessing,
  getMediaUploadTempRoot,
  promoteMediaUploadSource,
  restageMediaSourceFromObject,
} from "../lib/media-processing.js";

const CONTENT_MANAGER_ROLES = ["super_admin", "operations_admin"];
const MEDIA_TYPES = new Set(["audio", "video"]);
const MOCK_EXAM_OBJECTIVE_QUESTION_TYPES = new Set(["single_choice", "multiple_choice", "uncertain_choice"]);
const MOCK_EXAM_QUESTION_TYPES = new Set([...MOCK_EXAM_OBJECTIVE_QUESTION_TYPES, "subjective_case"]);
const MB = 1024 * 1024;
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);
const AUDIO_MIME_PREFIX = "audio/";
const VIDEO_MIME_PREFIX = "video/";

const buildUploadValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      callback(null, getMediaUploadTempRoot());
    },
    filename(_req, file, callback) {
      callback(null, `${Date.now()}-${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: {
    fileSize: 2048 * MB,
    files: 20,
  },
  fileFilter(req, file, callback) {
    const type = readMediaType(req.body?.type);
    const extension = extname(file.originalname).toLowerCase();
    const mimeType = `${file.mimetype ?? ""}`.toLowerCase();
    const extensionAllowed = type === "video" ? VIDEO_EXTENSIONS.has(extension) : AUDIO_EXTENSIONS.has(extension);
    const mimeAllowed =
      type === "video"
        ? mimeType.startsWith(VIDEO_MIME_PREFIX) || !mimeType || mimeType === "application/octet-stream"
        : mimeType.startsWith(AUDIO_MIME_PREFIX) || !mimeType || mimeType === "application/octet-stream";

    if (extensionAllowed && mimeAllowed) {
      callback(null, true);
      return;
    }

    callback(buildUploadValidationError(`${type === "video" ? "视频" : "音频"}文件格式不支持，请重新选择后上传`));
  },
});

const handoutUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024,
    files: 1,
  },
});
const courseAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024,
    files: 1,
  },
});
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
  },
});

export const adminContentRouter = Router();

adminContentRouter.use(requireAdminAuth);
adminContentRouter.use(requireAdminRoles(...CONTENT_MANAGER_ROLES));

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toStringArray = (value) =>
  [...new Set((Array.isArray(value) ? value : value ? [value] : []).map((item) => `${item}`.trim()).filter(Boolean))];

const readMediaType = (value) => (MEDIA_TYPES.has(`${value ?? ""}`.trim()) ? `${value}`.trim() : "audio");
const readStrictMediaType = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return MEDIA_TYPES.has(normalized) ? normalized : null;
};

const getMediaModel = (type) => (type === "video" ? prisma.video : prisma.audio);
const getMediaFolderModel = (type) => (type === "video" ? prisma.videoFolder : prisma.audioFolder);
const getCourseMediaModel = (type) => (type === "video" ? prisma.courseVideo : prisma.courseAudio);
const getMediaRefField = (type) => (type === "video" ? "videoId" : "audioId");

const getDisplayNameFromUpload = (fileName = "", fallback = "未命名素材") => {
  const normalized = normalizeDisplayText(fileName || "").replace(/\.[^.]+$/, "").trim();
  return normalized || fallback;
};

const includeMediaLibraryRelations = (type) => ({
  folder: true,
  [type === "video" ? "courseVideos" : "courseAudios"]: {
    include: {
      course: { select: { name: true } },
      tag: { select: { name: true } },
    },
  },
});

const serializeMediaLibraryItem = (type, item) => (type === "video" ? serializeVideoLibraryItem(item) : serializeAudioLibraryItem(item));

const cleanupMediaObjectKeys = async (items = []) => {
  const keys = [...new Set(items.flatMap((item) => [item?.objectKey, item?.handoutObjectKey]).map((item) => `${item ?? ""}`.trim()).filter(Boolean))];
  await Promise.all(
    keys.map((key) =>
      key.endsWith("/index.m3u8")
        ? deleteObjectPrefix(key.slice(0, -"index.m3u8".length)).catch(() => cleanupObjectIfUnused(key))
        : cleanupObjectIfUnused(key),
    ),
  );
};

const parseOpenTime = (value) => {
  if (!value) return new Date();
  const normalized = `${value}`.trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : new Date();
};

const parseNullableDateTime = (value) => {
  if (!value) return null;
  const normalized = `${value}`.trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
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

const parseJsonSafely = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const readMockExamPaperType = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return normalized === "objective" || normalized === "subjective" ? normalized : null;
};

const readMockExamPaperStatus = (value) => {
  const normalized = `${value ?? ""}`.trim();
  return normalized === "published" || normalized === "draft" ? normalized : "draft";
};

const readMockExamSeriesPayload = (body = {}) => ({
  name: normalizeDisplayText(body.name ?? body.title ?? "").trim(),
  description: normalizeDisplayText(body.description ?? "").trim() || null,
  sortOrder: toInt(body.sortOrder, 0),
});

const readMockExamPaperPayload = (body = {}, { includeCode = false } = {}) => {
  const payload = {
    seriesId: `${body.seriesId ?? ""}`.trim() || null,
    title: normalizeDisplayText(body.title ?? "").trim(),
    subtitle: normalizeDisplayText(body.subtitle ?? "").trim() || null,
    coverUrl: `${body.coverUrl ?? ""}`.trim() || null,
    coverObjectKey: `${body.coverObjectKey ?? ""}`.trim() || null,
    paperType: readMockExamPaperType(body.paperType),
    year: body.year === "" || body.year === null || body.year === undefined ? null : toInt(body.year, 0),
    phase: normalizeDisplayText(body.phase ?? "").trim() || null,
    durationMinutes: Math.max(1, toInt(body.durationMinutes, 180)),
    maxAttempts: Math.max(0, toInt(body.maxAttempts, 0)),
    reviewEnabled: toBool(body.reviewEnabled, true),
    reviewAttemptLimit: Math.max(0, toInt(body.reviewAttemptLimit, 0)),
    permissionRequired: toBool(body.permissionRequired, false),
    totalScore: Math.max(0, toInt(body.totalScore, 0)),
    questionCount: Math.max(0, toInt(body.questionCount, 0)),
    passScore: Math.max(0, toInt(body.passScore, 0)),
    description: normalizeDisplayText(body.description ?? "").trim() || null,
    status: readMockExamPaperStatus(body.status),
    openTime: parseNullableDateTime(body.openTime),
    sortOrder: toInt(body.sortOrder, 0),
  };

  if (includeCode) payload.code = `${body.code ?? ""}`.trim();
  return payload;
};

const serializeAdminMockExamSeries = (series) => ({
  id: series.id,
  name: series.name,
  description: series.description ?? "",
  sortOrder: Number(series.sortOrder ?? 0),
  paperCount: series._count?.papers ?? series.papers?.length ?? 0,
  permissionCount: series._count?.permissions ?? 0,
  createdAt: formatDateTime(series.createdAt),
  updatedAt: formatDateTime(series.updatedAt),
});

const serializeAdminMockExamPaper = (paper) => {
  const activeQuestions = paper.questions ?? [];
  const activeQuestionCount = activeQuestions.length;
  const activeTotalScore = activeQuestions.reduce((sum, question) => sum + Number(question.score ?? 0), 0);
  const subjectiveQuestionCount = activeQuestions.filter((question) => question.type === "subjective_case").length;
  const objectiveQuestionCount = activeQuestionCount - subjectiveQuestionCount;

  return {
    id: paper.id,
    code: paper.code,
    seriesId: paper.seriesId ?? "",
    seriesName: paper.series?.name ?? "",
    title: paper.title,
    subtitle: paper.subtitle ?? "",
    coverUrl: paper.coverUrl ?? "",
    coverObjectKey: paper.coverObjectKey ?? "",
    paperType: paper.paperType ?? (subjectiveQuestionCount > 0 ? "subjective" : "objective"),
    year: paper.year ?? null,
    phase: paper.phase ?? "",
    durationMinutes: Number(paper.durationMinutes ?? 0),
    maxAttempts: Number(paper.maxAttempts ?? 0),
    reviewEnabled: Boolean(paper.reviewEnabled),
    reviewAttemptLimit: Number(paper.reviewAttemptLimit ?? 0),
    permissionRequired: Boolean(paper.permissionRequired),
    totalScore: Number(paper.totalScore ?? 0),
    activeTotalScore,
    questionCount: Number(paper.questionCount ?? 0),
    activeQuestionCount,
    subjectiveQuestionCount,
    objectiveQuestionCount,
    passScore: Number(paper.passScore ?? 0),
    description: paper.description ?? "",
    status: paper.status,
    openTime: paper.openTime ? formatDateTime(paper.openTime) : "",
    sortOrder: Number(paper.sortOrder ?? 0),
    recordCount: paper._count?.records ?? 0,
    permissionCount: paper._count?.permissions ?? 0,
    leaderboardCount: paper._count?.leaderboardEntries ?? 0,
    createdAt: formatDateTime(paper.createdAt),
    updatedAt: formatDateTime(paper.updatedAt),
  };
};

const getMockExamPaperQuestionStats = (questions = []) => {
  const activeQuestions = Array.isArray(questions) ? questions : [];
  const subjectiveQuestionCount = activeQuestions.filter((question) => question.type === "subjective_case").length;
  return {
    activeQuestionCount: activeQuestions.length,
    subjectiveQuestionCount,
    objectiveQuestionCount: activeQuestions.length - subjectiveQuestionCount,
  };
};

const validateMockExamPaperPublish = ({ payload, questions }) => {
  if (payload.status !== "published") return null;

  const stats = getMockExamPaperQuestionStats(questions);
  if (stats.activeQuestionCount === 0) return "试卷没有题目，不能发布";
  if (payload.paperType === "objective" && stats.subjectiveQuestionCount > 0) return "客观题模考不能包含主观题题目";
  if (payload.paperType === "subjective" && stats.subjectiveQuestionCount === 0) return "主观题批改必须至少包含一道主观题";
  return null;
};

const isMockExamQuestionAllowedForPaper = (paperType, questionType) => {
  if (!MOCK_EXAM_QUESTION_TYPES.has(questionType)) return false;
  if (paperType === "objective") return MOCK_EXAM_OBJECTIVE_QUESTION_TYPES.has(questionType);
  if (paperType === "subjective") return questionType === "subjective_case";
  return false;
};

const mockExamQuestionInclude = {
  options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
  sourceBankItem: {
    include: {
      folder: { select: { id: true, name: true, paperType: true } },
    },
  },
};

const serializeAdminMockExamQuestion = (question) => {
  const meta = parseJsonSafely(question.questionMetaJson, {});
  const tags = Array.isArray(meta?.tags) ? meta.tags : [];
  return {
    id: question.id,
    paperId: question.paperId,
    sourceBankItemId: question.sourceBankItemId ?? "",
    sourceFolderId: question.sourceBankItem?.folderId ?? "",
    sourceFolderName: question.sourceBankItem?.folder?.name ?? "",
    sourcePaperType: question.sourceBankItem?.folder?.paperType ?? "",
    title: meta?.title ?? "",
    questionNo: meta?.questionNo ?? "",
    yearLabel: meta?.yearLabel ?? "",
    pageLabel: meta?.pageLabel ?? "",
    sectionLabel: meta?.sectionLabel ?? "",
    tags,
    type: question.type,
    stem: question.stem,
    material: question.material ?? "",
    analysis: question.analysis ?? "",
    lessonAudioUrl: question.lessonAudioUrl ?? "",
    lessonAudioObjectKey: question.lessonAudioObjectKey ?? "",
    lessonAudioDurationSeconds: Number(question.lessonAudioDurationSeconds ?? 0),
    score: Number(question.score ?? 0),
    sortOrder: Number(question.sortOrder ?? 0),
    correctAnswerJson: question.correctAnswerJson ?? "[]",
    questionMetaJson: question.questionMetaJson ?? "",
    optionCount: question.options?.length ?? 0,
    options: (question.options ?? []).map((option) => ({
      id: option.id,
      optionKey: option.optionKey,
      content: option.content,
      sortOrder: Number(option.sortOrder ?? 0),
    })),
    createdAt: formatDateTime(question.createdAt),
    updatedAt: formatDateTime(question.updatedAt),
  };
};

const getAdminMockExamQuestions = (db, paperId) =>
  db.mockExamQuestion.findMany({
    where: { paperId, isActive: true },
    include: mockExamQuestionInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

const syncMockExamPaperQuestionStats = async (db, paperId) => {
  const questions = await db.mockExamQuestion.findMany({
    where: { paperId, isActive: true },
    select: { score: true },
  });
  const questionCount = questions.length;
  const totalScore = questions.reduce((sum, question) => sum + Number(question.score ?? 0), 0);
  await db.mockExamPaper.update({
    where: { id: paperId },
    data: { questionCount, totalScore },
  });
  return { questionCount, totalScore };
};

const getAdminMockExamPaperForResponse = (db, paperId) =>
  db.mockExamPaper.findUnique({
    where: { id: paperId },
    include: {
      series: { select: { id: true, name: true } },
      questions: {
        where: { isActive: true },
        select: { id: true, type: true, score: true },
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: {
          records: true,
          permissions: true,
          leaderboardEntries: true,
        },
      },
    },
  });

const getAdminMockExamQuestionPayload = async (db, paperId) => {
  const [paper, questions] = await Promise.all([getAdminMockExamPaperForResponse(db, paperId), getAdminMockExamQuestions(db, paperId)]);
  return {
    paper: paper ? serializeAdminMockExamPaper(paper) : null,
    questions: questions.map(serializeAdminMockExamQuestion),
  };
};

const readCoursePayload = (body = {}) => {
  const courseType = readMediaType(body.courseType);
  const status = ["open", "closed", "scheduled"].includes(`${body.status ?? ""}`) ? `${body.status}` : "closed";
  return {
    name: `${body.name ?? ""}`.trim(),
    coverUrl: `${body.coverUrl ?? body.cover ?? ""}`.trim(),
    coverObjectKey: `${body.coverObjectKey ?? ""}`.trim() || null,
    handoutUrl: `${body.handoutUrl ?? ""}`.trim() || null,
    handoutObjectKey: `${body.handoutObjectKey ?? ""}`.trim() || null,
    handoutName: `${body.handoutName ?? ""}`.trim() || null,
    description: `${body.description ?? ""}`.trim(),
    courseType,
    status,
    openTime: parseOpenTime(body.openTime),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
  };
};

const buildAudioWhere = (query = {}) => {
  const folderId = `${query.folderId ?? ""}`.trim();
  const keyword = `${query.keyword ?? ""}`.trim();
  const courseId = `${query.courseId ?? ""}`.trim();
  const tagId = `${query.tagId ?? ""}`.trim();
  const processStatus = `${query.processStatus ?? "all"}`.trim();
  const searchScope = `${query.searchScope ?? "current"}` === "all" ? "all" : "current";
  const refFilter = `${query.refFilter ?? "all"}`;
  const scriptFilter = `${query.scriptFilter ?? "all"}`;
  const relationFilter = {
    ...(courseId && courseId !== "all" ? { courseId } : {}),
    ...(tagId && tagId !== "all" ? { tagId } : {}),
  };
  const relationConditions = [];

  if (refFilter === "unreferenced") {
    relationConditions.push({ courseAudios: { none: {} } });
  } else if (refFilter === "referenced" || relationFilter.courseId || relationFilter.tagId) {
    relationConditions.push({ courseAudios: { some: relationFilter } });
  }

  return {
    ...(searchScope === "current" && folderId ? { folderId } : {}),
    ...(keyword ? { name: { contains: keyword } } : {}),
    ...(processStatus === "pending" || processStatus === "processing" || processStatus === "ready" || processStatus === "failed"
      ? { processStatus }
      : {}),
    ...(scriptFilter === "scripted" ? { scriptText: { not: null } } : {}),
    ...(scriptFilter === "unscripted" ? { scriptText: null } : {}),
    ...(relationConditions.length === 1 ? relationConditions[0] : relationConditions.length > 1 ? { AND: relationConditions } : {}),
  };
};

const buildVideoWhere = (query = {}) => {
  const folderId = `${query.folderId ?? ""}`.trim();
  const keyword = `${query.keyword ?? ""}`.trim();
  const courseId = `${query.courseId ?? ""}`.trim();
  const tagId = `${query.tagId ?? ""}`.trim();
  const processStatus = `${query.processStatus ?? "all"}`.trim();
  const searchScope = `${query.searchScope ?? "current"}` === "all" ? "all" : "current";
  const refFilter = `${query.refFilter ?? "all"}`;
  const scriptFilter = `${query.scriptFilter ?? "all"}`;
  const relationFilter = {
    ...(courseId && courseId !== "all" ? { courseId } : {}),
    ...(tagId && tagId !== "all" ? { tagId } : {}),
  };
  const relationConditions = [];

  if (refFilter === "unreferenced") {
    relationConditions.push({ courseVideos: { none: {} } });
  } else if (refFilter === "referenced" || relationFilter.courseId || relationFilter.tagId) {
    relationConditions.push({ courseVideos: { some: relationFilter } });
  }

  return {
    ...(searchScope === "current" && folderId ? { folderId } : {}),
    ...(keyword ? { name: { contains: keyword } } : {}),
    ...(processStatus === "pending" || processStatus === "processing" || processStatus === "ready" || processStatus === "failed"
      ? { processStatus }
      : {}),
    ...(scriptFilter === "scripted" ? { scriptText: { not: null } } : {}),
    ...(scriptFilter === "unscripted" ? { scriptText: null } : {}),
    ...(relationConditions.length === 1 ? relationConditions[0] : relationConditions.length > 1 ? { AND: relationConditions } : {}),
  };
};

const serializeAudioLibraryItem = (audio) => ({
  ...serializeAudio(audio),
  objectKey: audio.objectKey ?? "",
  objectUrl: audio.objectUrl ?? "",
  mimeType: audio.mimeType ?? "",
  folderName: audio.folder?.name ?? "",
  courseRefs: (audio.courseAudios ?? []).map((item) => ({
    courseId: item.courseId,
    courseName: item.course?.name ?? "",
    tagId: item.tagId,
    tagName: item.tag?.name ?? "",
  })),
});

const serializeVideoLibraryItem = (video) => ({
  ...serializeVideo(video),
  objectKey: video.objectKey ?? "",
  objectUrl: video.objectUrl ?? "",
  mimeType: video.mimeType ?? "",
  folderName: video.folder?.name ?? "",
  courseRefs: (video.courseVideos ?? []).map((item) => ({
    courseId: item.courseId,
    courseName: item.course?.name ?? "",
    tagId: item.tagId,
    tagName: item.tag?.name ?? "",
  })),
});

const buildCourseContentPayload = async (courseId) => {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      tags: {
        orderBy: { order: "asc" },
        include: {
          courseAudios: {
            orderBy: { order: "asc" },
            include: { audio: { include: { folder: true } } },
          },
          courseVideos: {
            orderBy: { order: "asc" },
            include: { video: { include: { folder: true } } },
          },
        },
      },
      _count: {
        select: {
          courseAudios: true,
          courseVideos: true,
          permissions: true,
        },
      },
    },
  });

  if (!course) return null;

  return {
    course: { ...serializeCourseWithCounts(course), permissionCount: course._count.permissions },
    sections: course.tags.map((tag) => ({
      ...serializeTag(tag),
      items:
        (course.courseType ?? "audio") === "video"
          ? tag.courseVideos.map((item) => ({
              relationId: item.id,
              order: item.order,
              media: serializeVideoLibraryItem(item.video),
            }))
          : tag.courseAudios.map((item) => ({
              relationId: item.id,
              order: item.order,
              media: serializeAudioLibraryItem(item.audio),
            })),
    })),
    generatedAt: formatDateTime(new Date()),
  };
};

const loadCourseAndTag = async (courseId, tagId) => {
  const [course, tag] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, courseType: true } }),
    prisma.tag.findFirst({ where: { id: tagId, courseId }, select: { id: true, courseId: true } }),
  ]);

  return { course, tag };
};

const normalizeTagContentOrder = async (courseId, tagId, courseType) => {
  const model = courseType === "video" ? prisma.courseVideo : prisma.courseAudio;
  const items = await model.findMany({
    where: { courseId, tagId },
    select: { id: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  await prisma.$transaction(items.map((item, index) => model.update({ where: { id: item.id }, data: { order: index } })));
};

adminContentRouter.get("/courses", async (req, res) => {
  const type = `${req.query?.type ?? "all"}`;
  const status = `${req.query?.status ?? "all"}`;
  const keyword = `${req.query?.keyword ?? ""}`.trim();
  const where = {
    ...(type === "audio" || type === "video" ? { courseType: type } : {}),
    ...(status === "open" || status === "closed" || status === "scheduled" ? { status } : {}),
    ...(keyword ? { name: { contains: keyword } } : {}),
  };

  const courses = await prisma.course.findMany({
    where,
    include: {
      _count: {
        select: {
          courseAudios: true,
          courseVideos: true,
          permissions: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return ok(
    res,
    courses.map((course) => ({
      ...serializeCourseWithCounts(course),
      permissionCount: course._count.permissions,
    })),
  );
});

adminContentRouter.get("/mock-exams/series", async (_req, res) => {
  const seriesList = await prisma.mockExamSeries.findMany({
    include: {
      _count: {
        select: {
          papers: true,
          permissions: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return ok(res, seriesList.map(serializeAdminMockExamSeries));
});

adminContentRouter.get("/mock-exams/papers", async (req, res) => {
  const keyword = normalizeDisplayText(req.query?.keyword ?? "").trim();
  const seriesId = `${req.query?.seriesId ?? "all"}`.trim();
  const paperType = `${req.query?.paperType ?? "all"}`.trim();
  const status = `${req.query?.status ?? "all"}`.trim();
  const where = {
    ...(seriesId && seriesId !== "all" ? { seriesId: seriesId === "__none__" ? null : seriesId } : {}),
    ...(paperType === "objective" || paperType === "subjective" ? { paperType } : {}),
    ...(status === "draft" || status === "published" ? { status } : {}),
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { subtitle: { contains: keyword } },
            { code: { contains: keyword } },
            { phase: { contains: keyword } },
            { series: { name: { contains: keyword } } },
          ],
        }
      : {}),
  };

  const papers = await prisma.mockExamPaper.findMany({
    where,
    include: {
      series: { select: { id: true, name: true } },
      questions: {
        where: { isActive: true },
        select: { id: true, type: true, score: true },
      },
      _count: {
        select: {
          records: true,
          permissions: true,
          leaderboardEntries: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return ok(res, papers.map(serializeAdminMockExamPaper));
});

adminContentRouter.get("/mock-exams/papers/:paperId", async (req, res) => {
  const paper = await prisma.mockExamPaper.findUnique({
    where: { id: req.params.paperId },
    include: {
      series: { select: { id: true, name: true } },
      questions: {
        where: { isActive: true },
        select: { id: true, type: true, score: true },
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: {
          records: true,
          permissions: true,
          leaderboardEntries: true,
        },
      },
    },
  });

  if (!paper) return fail(res, "试卷不存在", 404);
  return ok(res, serializeAdminMockExamPaper(paper));
});

adminContentRouter.post("/mock-exams/series", async (req, res) => {
  const payload = readMockExamSeriesPayload(req.body);
  if (!payload.name) return fail(res, "请输入套卷名称", 400);

  const series = await prisma.mockExamSeries.create({
    data: payload,
    include: {
      _count: { select: { papers: true, permissions: true } },
    },
  });

  await writeAdminAuditLog(req, {
    action: "create_mock_exam_series",
    entityType: "mock_exam_series",
    entityId: series.id,
    entityName: series.name,
    detail: payload,
  });

  return ok(res, serializeAdminMockExamSeries(series), "套卷已创建");
});

adminContentRouter.patch("/mock-exams/series/order", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await prisma.$transaction(
    items
      .map((item, index) => ({
        id: `${item.id ?? ""}`.trim(),
        sortOrder: toInt(item.sortOrder ?? item.order, index),
      }))
      .filter((item) => item.id)
      .map((item) => prisma.mockExamSeries.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })),
  );

  await writeAdminAuditLog(req, {
    action: "reorder_mock_exam_series",
    entityType: "mock_exam_series",
    detail: { itemCount: items.length, items },
  });
  return ok(res, { success: true }, "套卷顺序已更新");
});

adminContentRouter.patch("/mock-exams/series/:seriesId", async (req, res) => {
  const payload = readMockExamSeriesPayload(req.body);
  if (!payload.name) return fail(res, "请输入套卷名称", 400);

  const series = await prisma.mockExamSeries.update({
    where: { id: req.params.seriesId },
    data: payload,
    include: {
      _count: { select: { papers: true, permissions: true } },
    },
  });

  await writeAdminAuditLog(req, {
    action: "update_mock_exam_series",
    entityType: "mock_exam_series",
    entityId: series.id,
    entityName: series.name,
    detail: payload,
  });

  return ok(res, serializeAdminMockExamSeries(series), "套卷已更新");
});

adminContentRouter.delete("/mock-exams/series/:seriesId", async (req, res) => {
  const series = await prisma.mockExamSeries.findUnique({
    where: { id: req.params.seriesId },
    include: {
      _count: { select: { papers: true, permissions: true } },
    },
  });
  if (!series) return fail(res, "套卷不存在", 404);
  if (series._count.papers > 0) return fail(res, "该套卷下还有试卷，不能删除。请先转移或下架试卷。", 409);
  if (series._count.permissions > 0) return fail(res, "该套卷已有用户授权，不能删除。", 409);

  await prisma.mockExamSeries.delete({ where: { id: series.id } });
  await writeAdminAuditLog(req, {
    action: "delete_mock_exam_series",
    entityType: "mock_exam_series",
    entityId: series.id,
    entityName: series.name,
    detail: { name: series.name },
  });

  return ok(res, { success: true }, "套卷已删除");
});

adminContentRouter.post("/mock-exams/papers", async (req, res) => {
  const payload = readMockExamPaperPayload(req.body, { includeCode: true });
  if (!payload.code) return fail(res, "请输入试卷编码", 400);
  if (!payload.title) return fail(res, "请输入试卷名称", 400);
  if (!payload.paperType) return fail(res, "请选择试卷类型", 400);
  const publishError = validateMockExamPaperPublish({ payload, questions: [] });
  if (publishError) return fail(res, publishError, 409);

  const paper = await prisma.mockExamPaper.create({
    data: payload,
    include: {
      series: { select: { id: true, name: true } },
      questions: {
        where: { isActive: true },
        select: { id: true, type: true, score: true },
      },
      _count: { select: { records: true, permissions: true, leaderboardEntries: true } },
    },
  });

  await writeAdminAuditLog(req, {
    action: "create_mock_exam_paper",
    entityType: "mock_exam_paper",
    entityId: paper.id,
    entityName: paper.title,
    detail: payload,
  });

  return ok(res, serializeAdminMockExamPaper(paper), "试卷已创建");
});

adminContentRouter.post("/mock-exams/papers/cover/upload", imageUpload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return fail(res, "请选择要上传的试卷封面", 400);
  if (!`${file.mimetype ?? ""}`.startsWith("image/")) return fail(res, "试卷封面只能上传图片文件", 400);

  const originalName = normalizeDisplayText(file.originalname || "mock-exam-cover");
  const uploaded = await uploadBuffer({
    fileName: originalName,
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: "admin/mock-exam-covers",
  });

  return ok(
    res,
    {
      url: uploaded.readableUrl || uploaded.url,
      objectKey: uploaded.objectKey,
      fileName: originalName,
    },
    "试卷封面已上传",
  );
});

adminContentRouter.patch("/mock-exams/papers/order", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await prisma.$transaction(
    items
      .map((item, index) => ({
        id: `${item.id ?? ""}`.trim(),
        sortOrder: toInt(item.sortOrder ?? item.order, index),
      }))
      .filter((item) => item.id)
      .map((item) => prisma.mockExamPaper.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })),
  );

  await writeAdminAuditLog(req, {
    action: "reorder_mock_exam_papers",
    entityType: "mock_exam_paper",
    detail: { itemCount: items.length, items },
  });
  return ok(res, { success: true }, "试卷顺序已更新");
});

adminContentRouter.get("/mock-exams/papers/:paperId/questions", async (req, res) => {
  const paper = await getAdminMockExamPaperForResponse(prisma, req.params.paperId);
  if (!paper) return fail(res, "试卷不存在", 404);

  const questions = await getAdminMockExamQuestions(prisma, paper.id);
  return ok(res, {
    paper: serializeAdminMockExamPaper(paper),
    questions: questions.map(serializeAdminMockExamQuestion),
  });
});

adminContentRouter.post("/mock-exams/papers/:paperId/questions/import-from-bank", async (req, res) => {
  const sourceBankItemIds = toStringArray(req.body?.sourceBankItemIds ?? req.body?.itemIds ?? req.body?.ids);
  if (sourceBankItemIds.length === 0) return fail(res, "请选择要引用的机考题库题目", 400);
  if (sourceBankItemIds.length > 200) return fail(res, "单次最多引用 200 道题，请分批操作", 400);

  const paper = await prisma.mockExamPaper.findUnique({
    where: { id: req.params.paperId },
    select: { id: true, title: true, paperType: true },
  });
  if (!paper) return fail(res, "试卷不存在", 404);
  if (!paper.paperType) return fail(res, "请先设置试卷类型", 400);

  const sourceItems = await prisma.questionBankItem.findMany({
    where: { id: { in: sourceBankItemIds } },
    include: {
      folder: { select: { id: true, name: true, paperType: true } },
      options: { orderBy: [{ sortOrder: "asc" }, { optionKey: "asc" }] },
    },
  });
  const sourceItemMap = new Map(sourceItems.map((item) => [item.id, item]));
  const missingIds = sourceBankItemIds.filter((id) => !sourceItemMap.has(id));
  if (missingIds.length > 0) return fail(res, `有 ${missingIds.length} 道题不存在或已删除`, 404);

  const invalidItem = sourceItems.find(
    (item) => item.folder?.paperType !== paper.paperType || !isMockExamQuestionAllowedForPaper(paper.paperType, item.type),
  );
  if (invalidItem) {
    return fail(
      res,
      paper.paperType === "objective" ? "客观题模考只能引用客观机考题库中的选择题" : "主观题批改只能引用主观机考题库中的主观案例题",
      409,
    );
  }

  const existingSourceIds = new Set(
    (
      await prisma.mockExamQuestion.findMany({
        where: { paperId: paper.id, isActive: true, sourceBankItemId: { in: sourceBankItemIds } },
        select: { sourceBankItemId: true },
      })
    )
      .map((item) => item.sourceBankItemId)
      .filter(Boolean),
  );
  const orderedSourceItems = sourceBankItemIds.map((id) => sourceItemMap.get(id)).filter((item) => item && !existingSourceIds.has(item.id));
  if (orderedSourceItems.length === 0) {
    const payload = await getAdminMockExamQuestionPayload(prisma, paper.id);
    return ok(res, { ...payload, importedCount: 0, skippedCount: sourceBankItemIds.length }, "所选题目已在当前试卷中");
  }

  const maxSortQuestion = await prisma.mockExamQuestion.findFirst({
    where: { paperId: paper.id, isActive: true },
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });
  const nextSortOrder = Number(maxSortQuestion?.sortOrder ?? -1) + 1;

  await prisma.$transaction(async (tx) => {
    for (const [index, item] of orderedSourceItems.entries()) {
      const created = await tx.mockExamQuestion.create({
        data: {
          paperId: paper.id,
          sourceBankItemId: item.id,
          isActive: true,
          type: item.type,
          stem: item.stem,
          material: item.material,
          analysis: item.analysis,
          lessonAudioUrl: item.lessonAudioUrl,
          lessonAudioObjectKey: item.lessonAudioObjectKey,
          lessonAudioDurationSeconds: Number(item.lessonAudioDurationSeconds ?? 0) || 0,
          score: Number(item.score ?? 0) || 0,
          sortOrder: nextSortOrder + index,
          correctAnswerJson: item.correctAnswerJson || "[]",
          questionMetaJson: item.questionMetaJson,
        },
      });

      if (item.options.length > 0) {
        await tx.mockExamQuestionOption.createMany({
          data: item.options.map((option) => ({
            questionId: created.id,
            optionKey: option.optionKey,
            content: option.content,
            sortOrder: Number(option.sortOrder ?? 0) || 0,
          })),
        });
      }
    }
    await syncMockExamPaperQuestionStats(tx, paper.id);
  });

  await writeAdminAuditLog(req, {
    action: "import_mock_exam_questions_from_bank",
    entityType: "mock_exam_paper",
    entityId: paper.id,
    entityName: paper.title,
    detail: {
      paperType: paper.paperType,
      requestedCount: sourceBankItemIds.length,
      importedCount: orderedSourceItems.length,
      skippedCount: sourceBankItemIds.length - orderedSourceItems.length,
      sourceBankItemIds,
    },
  });

  const payload = await getAdminMockExamQuestionPayload(prisma, paper.id);
  return ok(
    res,
    { ...payload, importedCount: orderedSourceItems.length, skippedCount: sourceBankItemIds.length - orderedSourceItems.length },
    orderedSourceItems.length > 0 ? "题目已引用到试卷" : "所选题目已在当前试卷中",
  );
});

adminContentRouter.patch("/mock-exams/papers/:paperId/questions/order", async (req, res) => {
  const paper = await prisma.mockExamPaper.findUnique({
    where: { id: req.params.paperId },
    select: { id: true, title: true },
  });
  if (!paper) return fail(res, "试卷不存在", 404);

  const items = (Array.isArray(req.body?.items) ? req.body.items : [])
    .map((item, index) => ({
      id: `${item.id ?? ""}`.trim(),
      sortOrder: toInt(item.sortOrder ?? item.order, index),
    }))
    .filter((item) => item.id);
  if (items.length === 0) return fail(res, "请提供要排序的题目", 400);

  const existingCount = await prisma.mockExamQuestion.count({
    where: { paperId: paper.id, isActive: true, id: { in: items.map((item) => item.id) } },
  });
  if (existingCount !== items.length) return fail(res, "有题目不属于当前试卷或已被移除", 409);

  await prisma.$transaction(
    items.map((item) =>
      prisma.mockExamQuestion.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );

  await writeAdminAuditLog(req, {
    action: "reorder_mock_exam_questions",
    entityType: "mock_exam_paper",
    entityId: paper.id,
    entityName: paper.title,
    detail: { itemCount: items.length, items },
  });

  return ok(res, await getAdminMockExamQuestionPayload(prisma, paper.id), "试题顺序已更新");
});

adminContentRouter.delete("/mock-exams/papers/:paperId/questions/:questionId", async (req, res) => {
  const question = await prisma.mockExamQuestion.findFirst({
    where: { id: req.params.questionId, paperId: req.params.paperId, isActive: true },
    include: { paper: { select: { id: true, title: true } } },
  });
  if (!question) return fail(res, "题目不存在或已被移除", 404);

  await prisma.$transaction(async (tx) => {
    await tx.mockExamQuestion.update({
      where: { id: question.id },
      data: { isActive: false },
    });
    await syncMockExamPaperQuestionStats(tx, question.paperId);
  });

  await writeAdminAuditLog(req, {
    action: "remove_mock_exam_question",
    entityType: "mock_exam_paper",
    entityId: question.paperId,
    entityName: question.paper?.title ?? question.paperId,
    detail: { questionId: question.id, sourceBankItemId: question.sourceBankItemId, type: question.type },
  });

  return ok(res, await getAdminMockExamQuestionPayload(prisma, question.paperId), "题目已从试卷移除");
});

adminContentRouter.post("/mock-exams/papers/:paperId/recall", async (req, res) => {
  const paper = await prisma.mockExamPaper.findUnique({
    where: { id: req.params.paperId },
    include: {
      series: { select: { id: true, name: true } },
      questions: {
        where: { isActive: true },
        select: { id: true, type: true, score: true },
      },
      _count: { select: { records: true, permissions: true, leaderboardEntries: true } },
    },
  });
  if (!paper) return fail(res, "试卷不存在", 404);

  if (paper.status === "draft") {
    return ok(res, serializeAdminMockExamPaper(paper), "试卷已处于收回状态");
  }

  const updated = await prisma.mockExamPaper.update({
    where: { id: paper.id },
    data: { status: "draft" },
    include: {
      series: { select: { id: true, name: true } },
      questions: {
        where: { isActive: true },
        select: { id: true, type: true, score: true },
      },
      _count: { select: { records: true, permissions: true, leaderboardEntries: true } },
    },
  });

  await writeAdminAuditLog(req, {
    action: "recall_mock_exam_paper",
    entityType: "mock_exam_paper",
    entityId: updated.id,
    entityName: updated.title,
    detail: { previousStatus: paper.status, nextStatus: updated.status },
  });

  return ok(res, serializeAdminMockExamPaper(updated), "试卷已收回，学生端不可见");
});

adminContentRouter.patch("/mock-exams/papers/:paperId", async (req, res) => {
  const current = await prisma.mockExamPaper.findUnique({
    where: { id: req.params.paperId },
    include: {
      questions: {
        where: { isActive: true },
        select: { id: true, type: true, score: true },
      },
      _count: {
        select: {
          records: true,
          permissions: true,
          leaderboardEntries: true,
        },
      },
    },
  });
  if (!current) return fail(res, "试卷不存在", 404);

  const payload = readMockExamPaperPayload(req.body);
  if (!payload.title) return fail(res, "请输入试卷名称", 400);
  if (!payload.paperType) return fail(res, "请选择试卷类型", 400);
  if (
    payload.paperType !== current.paperType &&
    (current._count.records > 0 || current._count.permissions > 0 || current._count.leaderboardEntries > 0)
  ) {
    return fail(res, "试卷已有考试记录、授权或排行榜配置，不能切换客观/主观类型", 409);
  }
  const publishError = validateMockExamPaperPublish({ payload, questions: current.questions });
  if (publishError) return fail(res, publishError, 409);

  const paper = await prisma.mockExamPaper.update({
    where: { id: current.id },
    data: payload,
    include: {
      series: { select: { id: true, name: true } },
      questions: {
        where: { isActive: true },
        select: { id: true, type: true, score: true },
      },
      _count: { select: { records: true, permissions: true, leaderboardEntries: true } },
    },
  });

  await cleanupObjectIfReplaced({
    previousObjectKey: current.coverObjectKey,
    nextObjectKey: paper.coverObjectKey,
  });

  await writeAdminAuditLog(req, {
    action: "update_mock_exam_paper",
    entityType: "mock_exam_paper",
    entityId: paper.id,
    entityName: paper.title,
    detail: payload,
  });

  return ok(res, serializeAdminMockExamPaper(paper), "试卷已更新");
});

adminContentRouter.delete("/mock-exams/papers/:paperId", async (req, res) => {
  const paper = await prisma.mockExamPaper.findUnique({
    where: { id: req.params.paperId },
    include: {
      _count: {
        select: {
          records: true,
          permissions: true,
          leaderboardEntries: true,
        },
      },
    },
  });
  if (!paper) return fail(res, "试卷不存在", 404);

  if (paper._count.records > 0 || paper._count.permissions > 0 || paper._count.leaderboardEntries > 0) {
    const updated = await prisma.mockExamPaper.update({
      where: { id: paper.id },
      data: { status: "draft" },
      include: {
        series: { select: { id: true, name: true } },
        questions: {
          where: { isActive: true },
          select: { id: true, type: true, score: true },
        },
        _count: { select: { records: true, permissions: true, leaderboardEntries: true } },
      },
    });
    await writeAdminAuditLog(req, {
      action: "archive_mock_exam_paper",
      entityType: "mock_exam_paper",
      entityId: paper.id,
      entityName: paper.title,
      detail: { reason: "has_records_or_permissions" },
    });
    return ok(res, serializeAdminMockExamPaper(updated), "试卷已有用户数据，已安全下架为草稿");
  }

  await prisma.mockExamPaper.delete({ where: { id: paper.id } });
  await cleanupObjectIfUnused(paper.coverObjectKey);
  await writeAdminAuditLog(req, {
    action: "delete_mock_exam_paper",
    entityType: "mock_exam_paper",
    entityId: paper.id,
    entityName: paper.title,
    detail: { title: paper.title },
  });

  return ok(res, { success: true }, "试卷已删除");
});

adminContentRouter.get("/courses/:courseId", async (req, res) => {
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    include: {
      tags: {
        orderBy: { order: "asc" },
        include: {
          _count: {
            select: {
              courseAudios: true,
              courseVideos: true,
            },
          },
        },
      },
      _count: {
        select: {
          courseAudios: true,
          courseVideos: true,
          permissions: true,
        },
      },
    },
  });

  if (!course) return fail(res, "课程不存在", 404);

  return ok(res, {
    course: {
      ...serializeCourseWithCounts(course),
      permissionCount: course._count.permissions,
    },
    tags: course.tags.map((tag) => ({
      ...serializeTag(tag),
      contentCount: (course.courseType ?? "audio") === "video" ? tag._count.courseVideos : tag._count.courseAudios,
    })),
  });
});

adminContentRouter.post("/courses/assets/upload", courseAssetUpload.single("file"), async (req, res) => {
  const assetType = `${req.body?.assetType ?? ""}`.trim();
  const file = req.file;
  if (assetType !== "cover" && assetType !== "handout") return fail(res, "上传类型不正确", 400);
  if (!file) return fail(res, "请选择要上传的文件", 400);
  if (assetType === "cover" && !`${file.mimetype ?? ""}`.startsWith("image/")) {
    return fail(res, "课程封面只能上传图片文件", 400);
  }

  const originalName = normalizeDisplayText(file.originalname || (assetType === "cover" ? "cover" : "handout"));
  const uploaded = await uploadBuffer({
    fileName: originalName,
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: assetType === "cover" ? "admin/course-covers" : "admin/course-handouts",
  });

  return ok(
    res,
    {
      url: uploaded.readableUrl || uploaded.url,
      objectKey: uploaded.objectKey,
      fileName: originalName,
    },
    assetType === "cover" ? "课程封面已上传" : "课程讲义已上传",
  );
});

adminContentRouter.post("/courses", async (req, res) => {
  const payload = readCoursePayload(req.body);
  const tags = toStringArray(req.body?.tags);
  if (!payload.name) return fail(res, "请输入课程名称", 400);
  if (!payload.coverUrl) return fail(res, "请填写课程封面", 400);
  if (!payload.description) return fail(res, "请输入课程简介", 400);

  const course = await prisma.course.create({
    data: {
      ...payload,
      tags: {
        create: tags.map((name, index) => ({
          name,
          order: index,
        })),
      },
    },
    include: {
      _count: {
        select: {
          courseAudios: true,
          courseVideos: true,
          permissions: true,
        },
      },
    },
  });

  await writeAdminAuditLog(req, {
    action: "create_course",
    entityType: "course",
    entityId: course.id,
    entityName: course.name,
    detail: { ...payload, tags },
  });

  return ok(res, { ...serializeCourseWithCounts(course), permissionCount: course._count.permissions }, "课程已创建");
});

adminContentRouter.patch("/courses/:courseId", async (req, res) => {
  const payload = readCoursePayload(req.body);
  if (!payload.name) return fail(res, "请输入课程名称", 400);
  if (!payload.coverUrl) return fail(res, "请填写课程封面", 400);
  if (!payload.description) return fail(res, "请输入课程简介", 400);

  const previous = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    select: {
      coverObjectKey: true,
      handoutObjectKey: true,
      courseType: true,
      _count: {
        select: {
          courseAudios: true,
          courseVideos: true,
        },
      },
    },
  });
  if (!previous) return fail(res, "课程不存在", 404);
  if (
    payload.courseType !== previous.courseType &&
    (previous._count.courseAudios > 0 || previous._count.courseVideos > 0)
  ) {
    return fail(res, "课程已有编排内容，不能直接切换音频/视频类型", 400);
  }

  const course = await prisma.course.update({
    where: { id: req.params.courseId },
    data: payload,
    include: {
      _count: {
        select: {
          courseAudios: true,
          courseVideos: true,
          permissions: true,
        },
      },
    },
  });

  await Promise.all([
    cleanupObjectIfReplaced({
      previousObjectKey: previous.coverObjectKey,
      nextObjectKey: course.coverObjectKey,
    }),
    cleanupObjectIfReplaced({
      previousObjectKey: previous.handoutObjectKey,
      nextObjectKey: course.handoutObjectKey,
    }),
  ]);

  await writeAdminAuditLog(req, {
    action: "update_course",
    entityType: "course",
    entityId: course.id,
    entityName: course.name,
    detail: payload,
  });

  return ok(res, { ...serializeCourseWithCounts(course), permissionCount: course._count.permissions }, "课程已更新");
});

adminContentRouter.delete("/courses/:courseId", async (req, res) => {
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    select: {
      id: true,
      name: true,
      coverObjectKey: true,
      handoutObjectKey: true,
      _count: {
        select: {
          permissions: true,
          shopProducts: true,
          courseAudios: true,
          courseVideos: true,
        },
      },
    },
  });
  if (!course) return fail(res, "课程不存在", 404);
  if (course._count.permissions > 0 || course._count.shopProducts > 0) {
    return fail(res, "课程已有用户权限或商品关联，不能直接删除", 400);
  }
  if (course._count.courseAudios > 0 || course._count.courseVideos > 0) {
    return fail(res, "课程还有已编排内容，请先移除内容后再删除", 400);
  }

  await prisma.course.delete({ where: { id: req.params.courseId } });
  await Promise.all([cleanupObjectIfUnused(course.coverObjectKey), cleanupObjectIfUnused(course.handoutObjectKey)]);
  await writeAdminAuditLog(req, {
    action: "delete_course",
    entityType: "course",
    entityId: course.id,
    entityName: course.name,
    detail: { name: course.name },
  });
  return ok(res, { success: true }, "课程已删除");
});

adminContentRouter.patch("/courses/order", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await prisma.$transaction(
    items
      .map((item, index) => ({
        id: `${item.id ?? ""}`.trim(),
        sortOrder: Number.isFinite(Number(item.sortOrder ?? item.order)) ? Number(item.sortOrder ?? item.order) : index,
      }))
      .filter((item) => item.id)
      .map((item) => prisma.course.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })),
  );

  await writeAdminAuditLog(req, {
    action: "reorder_courses",
    entityType: "course",
    detail: { itemCount: items.length, items },
  });

  return ok(res, { success: true }, "课程顺序已更新");
});

adminContentRouter.post("/courses/:courseId/tags", async (req, res) => {
  const name = `${req.body?.name ?? ""}`.trim();
  if (!name) return fail(res, "请输入标签名称", 400);
  const lastTag = await prisma.tag.findFirst({
    where: { courseId: req.params.courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const tag = await prisma.tag.create({
    data: {
      courseId: req.params.courseId,
      name,
      order: Number(lastTag?.order ?? -1) + 1,
    },
  });

  await writeAdminAuditLog(req, {
    action: "create_course_tag",
    entityType: "tag",
    entityId: tag.id,
    entityName: tag.name,
    detail: { courseId: req.params.courseId, name },
  });

  return ok(res, { ...serializeTag(tag), contentCount: 0 }, "标签已创建");
});

adminContentRouter.patch("/tags/:tagId", async (req, res) => {
  const name = `${req.body?.name ?? ""}`.trim();
  if (!name) return fail(res, "请输入标签名称", 400);
  const tag = await prisma.tag.update({
    where: { id: req.params.tagId },
    data: { name },
  });

  await writeAdminAuditLog(req, {
    action: "update_course_tag",
    entityType: "tag",
    entityId: tag.id,
    entityName: tag.name,
    detail: { name },
  });

  return ok(res, serializeTag(tag), "标签已更新");
});

adminContentRouter.delete("/tags/:tagId", async (req, res) => {
  const tag = await prisma.tag.findUnique({
    where: { id: req.params.tagId },
    include: {
      _count: {
        select: {
          courseAudios: true,
          courseVideos: true,
        },
      },
    },
  });
  if (!tag) return fail(res, "标签不存在", 404);
  if (tag._count.courseAudios > 0 || tag._count.courseVideos > 0) {
    return fail(res, "标签下还有课程内容，请先移除内容后再删除标签", 400);
  }
  await prisma.tag.delete({ where: { id: req.params.tagId } });
  await writeAdminAuditLog(req, {
    action: "delete_course_tag",
    entityType: "tag",
    entityId: tag.id,
    entityName: tag.name,
    detail: { courseId: tag.courseId, name: tag.name },
  });
  return ok(res, { success: true }, "标签已删除");
});

adminContentRouter.get("/media/meta", async (req, res) => {
  const type = readMediaType(req.query?.type);
  if (type === "video") {
    const [totalCount, referencedCount, pendingScriptCount, processingCount, tagOptions] = await Promise.all([
      prisma.video.count(),
      prisma.video.count({ where: { courseVideos: { some: {} } } }),
      prisma.video.count({ where: { scriptText: null } }),
      prisma.video.count({ where: { processStatus: { in: ["pending", "processing", "failed"] } } }),
      prisma.tag.findMany({
        where: { course: { courseType: "video" } },
        select: { id: true, name: true, courseId: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return ok(res, { type, totalCount, referencedCount, pendingScriptCount, processingCount, tagOptions });
  }

  const [totalCount, referencedCount, pendingScriptCount, processingCount, tagOptions] = await Promise.all([
    prisma.audio.count(),
    prisma.audio.count({ where: { courseAudios: { some: {} } } }),
    prisma.audio.count({ where: { scriptText: null } }),
    prisma.audio.count({ where: { processStatus: { in: ["pending", "processing", "failed"] } } }),
    prisma.tag.findMany({
      where: { course: { courseType: "audio" } },
      select: { id: true, name: true, courseId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return ok(res, { type, totalCount, referencedCount, pendingScriptCount, processingCount, tagOptions });
});

adminContentRouter.get("/media/folders", async (req, res) => {
  const type = readMediaType(req.query?.type);
  if (type === "video") {
    const folders = await prisma.videoFolder.findMany({
      include: { _count: { select: { videos: true } } },
      orderBy: { createdAt: "asc" },
    });
    return ok(res, folders.map((folder) => serializeVideoFolder(folder, folder._count.videos)));
  }

  const folders = await prisma.audioFolder.findMany({
    include: { _count: { select: { audios: true } } },
    orderBy: { createdAt: "asc" },
  });
  return ok(res, folders.map((folder) => serializeFolder(folder, folder._count.audios)));
});

adminContentRouter.post("/media/folders", async (req, res) => {
  const type = readMediaType(req.body?.type);
  const name = `${req.body?.name ?? ""}`.trim();
  if (!name) return fail(res, "请输入文件夹名称", 400);

  if (type === "video") {
    const folder = await prisma.videoFolder.create({ data: { name } });
    await writeAdminAuditLog(req, {
      action: "create_media_folder",
      entityType: "video_folder",
      entityId: folder.id,
      entityName: folder.name,
      detail: { type, name },
    });
    return ok(res, serializeVideoFolder(folder, 0), "视频文件夹已创建");
  }

  const folder = await prisma.audioFolder.create({ data: { name } });
  await writeAdminAuditLog(req, {
    action: "create_media_folder",
    entityType: "audio_folder",
    entityId: folder.id,
    entityName: folder.name,
    detail: { type, name },
  });
  return ok(res, serializeFolder(folder, 0), "音频文件夹已创建");
});

adminContentRouter.patch("/media/folders/:folderId", async (req, res) => {
  const type = readMediaType(req.body?.type);
  const name = `${req.body?.name ?? ""}`.trim();
  if (!name) return fail(res, "请输入文件夹名称", 400);

  if (type === "video") {
    const folder = await prisma.videoFolder.update({ where: { id: req.params.folderId }, data: { name } });
    await writeAdminAuditLog(req, {
      action: "update_media_folder",
      entityType: "video_folder",
      entityId: folder.id,
      entityName: folder.name,
      detail: { type, name },
    });
    return ok(res, serializeVideoFolder(folder, 0), "视频文件夹已更新");
  }

  const folder = await prisma.audioFolder.update({ where: { id: req.params.folderId }, data: { name } });
  await writeAdminAuditLog(req, {
    action: "update_media_folder",
    entityType: "audio_folder",
    entityId: folder.id,
    entityName: folder.name,
    detail: { type, name },
  });
  return ok(res, serializeFolder(folder, 0), "音频文件夹已更新");
});

adminContentRouter.delete("/media/folders/:folderId", async (req, res) => {
  const type = readMediaType(req.query?.type);
  const count =
    type === "video"
      ? await prisma.video.count({ where: { folderId: req.params.folderId } })
      : await prisma.audio.count({ where: { folderId: req.params.folderId } });
  if (count > 0) return fail(res, "非空文件夹不能删除", 400);

  if (type === "video") {
    await prisma.videoFolder.delete({ where: { id: req.params.folderId } });
  } else {
    await prisma.audioFolder.delete({ where: { id: req.params.folderId } });
  }

  await writeAdminAuditLog(req, {
    action: "delete_media_folder",
    entityType: type === "video" ? "video_folder" : "audio_folder",
    entityId: req.params.folderId,
    detail: { type },
  });

  return ok(res, { success: true }, "文件夹已删除");
});

adminContentRouter.get("/media/items", async (req, res) => {
  const type = readMediaType(req.query?.type);
  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
  const sortMode = `${req.query?.sortMode ?? "uploaded-desc"}`;
  const orderBy = sortMode === "name-asc" ? [{ name: "asc" }, { uploadedAt: "desc" }] : [{ uploadedAt: "desc" }, { id: "desc" }];

  if (type === "video") {
    const where = buildVideoWhere(req.query);
    const [total, items] = await Promise.all([
      prisma.video.count({ where }),
      prisma.video.findMany({
        where,
        include: {
          folder: true,
          courseVideos: {
            include: {
              course: { select: { name: true } },
              tag: { select: { name: true } },
            },
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return ok(res, {
      items: items.map(serializeVideoLibraryItem),
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    });
  }

  const where = buildAudioWhere(req.query);
  const [total, items] = await Promise.all([
    prisma.audio.count({ where }),
    prisma.audio.findMany({
      where,
      include: {
        folder: true,
        courseAudios: {
          include: {
            course: { select: { name: true } },
            tag: { select: { name: true } },
          },
        },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return ok(res, {
    items: items.map(serializeAudioLibraryItem),
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  });
});

adminContentRouter.post("/media/items/upload", mediaUpload.array("files"), async (req, res) => {
  const type = readMediaType(req.body?.type);
  const folderId = `${req.body?.folderId ?? ""}`.trim();
  const script = `${req.body?.script ?? ""}`;
  const files = req.files;

  if (!folderId) {
    await Promise.all((Array.isArray(files) ? files : []).map((file) => cleanupStagedMediaUploadFile(file.path)));
    return fail(res, "请选择目标文件夹", 400);
  }
  if (!Array.isArray(files) || files.length === 0) return fail(res, `请选择要上传的${type === "video" ? "视频" : "音频"}文件`, 400);

  const folder = await getMediaFolderModel(type).findUnique({ where: { id: folderId }, select: { id: true, name: true } });
  if (!folder) {
    await Promise.all(files.map((file) => cleanupStagedMediaUploadFile(file.path)));
    return fail(res, "目标文件夹不存在", 404);
  }

  const mediaModel = getMediaModel(type);
  const created = [];

  try {
    for (const [index, file] of files.entries()) {
      const item = await mediaModel.create({
        data: {
          name: getDisplayNameFromUpload(file.originalname, type === "video" ? "未命名视频" : "未命名音频"),
          folderId,
          duration: 0,
          scriptText: files.length === 1 ? script.trim() || null : index === 0 ? script.trim() || null : null,
          mimeType: file.mimetype || null,
          processStatus: "pending",
          processMessage: "已进入后台处理队列",
        },
        include: includeMediaLibraryRelations(type),
      });

      try {
        await promoteMediaUploadSource({
          type,
          itemId: item.id,
          tempPath: file.path,
          originalName: file.originalname,
        });
      } catch (error) {
        await mediaModel.delete({ where: { id: item.id } }).catch(() => {});
        throw error;
      }

      enqueueMediaProcessing(type, item.id);
      created.push(serializeMediaLibraryItem(type, item));
    }
  } catch (error) {
    await Promise.all(files.map((file) => cleanupStagedMediaUploadFile(file.path)));
    return fail(res, error instanceof Error ? error.message : "素材上传失败", 500);
  }

  await writeAdminAuditLog(req, {
    action: "upload_media_items",
    entityType: type,
    entityName: folder.name,
    detail: {
      type,
      folderId,
      uploadedCount: created.length,
      fileNames: files.map((file) => normalizeDisplayText(file.originalname || "")),
    },
  });

  return ok(res, created, `${type === "video" ? "视频" : "音频"}已上传，正在后台处理`);
});

adminContentRouter.post("/media/items/:itemId/reprocess", async (req, res) => {
  const type = readStrictMediaType(req.body?.type);
  if (!type) return fail(res, "素材类型不正确", 400);
  if (type !== "video") return fail(res, "当前仅支持视频重新转 HLS", 400);

  const item = await prisma.video.findUnique({
    where: { id: req.params.itemId },
    select: {
      id: true,
      name: true,
      objectKey: true,
      processStatus: true,
    },
  });
  if (!item) return fail(res, "视频不存在", 404);
  if (!item.objectKey) return fail(res, "该视频没有可重新处理的文件", 400);
  if (item.objectKey.endsWith("/index.m3u8")) return fail(res, "该视频已经是 HLS 分片格式", 400);
  if (item.processStatus === "pending" || item.processStatus === "processing") return fail(res, "该视频正在处理中，请稍后再试", 400);

  try {
    await restageMediaSourceFromObject({
      type: "video",
      itemId: item.id,
      objectKey: item.objectKey,
      originalName: item.name,
    });
    const nextItem = await prisma.video.update({
      where: { id: item.id },
      data: {
        processStatus: "pending",
        processMessage: "已加入 HLS 重新处理队列",
      },
      include: includeMediaLibraryRelations("video"),
    });
    enqueueMediaProcessing("video", item.id);

    await writeAdminAuditLog(req, {
      action: "reprocess_video_hls",
      entityType: "video",
      entityId: item.id,
      entityName: item.name,
      detail: {
        previousObjectKey: item.objectKey,
      },
    });

    return ok(res, serializeVideoLibraryItem(nextItem), "视频已加入 HLS 重新处理队列");
  } catch (error) {
    return fail(res, error instanceof Error ? error.message : "视频重新处理失败", 500);
  }
});

adminContentRouter.post("/media/handout/upload", handoutUpload.single("file"), async (req, res) => {
  const type = readMediaType(req.body?.type);
  const file = req.file;
  if (!file) return fail(res, "请选择要上传的讲义文件", 400);

  const originalName = normalizeDisplayText(file.originalname || "handout");
  const uploaded = await uploadBuffer({
    fileName: originalName,
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: `admin/${type}-handouts`,
  });

  return ok(
    res,
    {
      handoutUrl: uploaded.readableUrl || uploaded.url,
      handoutObjectKey: uploaded.objectKey,
      handoutName: originalName,
    },
    "讲义已上传",
  );
});

adminContentRouter.patch("/media/items/:itemId", async (req, res) => {
  const type = readMediaType(req.body?.type);
  const data = {
    ...(req.body?.name !== undefined ? { name: `${req.body.name}`.trim() } : {}),
    ...(req.body?.folderId !== undefined ? { folderId: `${req.body.folderId}`.trim() } : {}),
    ...(req.body?.scriptText !== undefined || req.body?.script !== undefined
      ? { scriptText: `${req.body.scriptText ?? req.body.script ?? ""}`.trim() || null }
      : {}),
    ...(req.body?.handoutUrl !== undefined ? { handoutUrl: `${req.body.handoutUrl ?? ""}`.trim() || null } : {}),
    ...(req.body?.handoutObjectKey !== undefined ? { handoutObjectKey: `${req.body.handoutObjectKey ?? ""}`.trim() || null } : {}),
    ...(req.body?.handoutName !== undefined ? { handoutName: `${req.body.handoutName ?? ""}`.trim() || null } : {}),
  };

  if (data.name !== undefined && !data.name) return fail(res, "请输入素材名称", 400);

  const mediaModel = getMediaModel(type);
  const previous = await mediaModel.findUnique({
    where: { id: req.params.itemId },
    select: { handoutObjectKey: true },
  });
  if (!previous) return fail(res, "素材不存在", 404);

  if (type === "video") {
    const item = await prisma.video.update({
      where: { id: req.params.itemId },
      data,
      include: includeMediaLibraryRelations(type),
    });
    if (data.handoutObjectKey !== undefined) {
      await cleanupObjectIfReplaced({
        previousObjectKey: previous.handoutObjectKey,
        nextObjectKey: item.handoutObjectKey,
      });
    }
    await writeAdminAuditLog(req, {
      action: "update_media_item",
      entityType: "video",
      entityId: item.id,
      entityName: item.name,
      detail: { type, data },
    });
    return ok(res, serializeVideoLibraryItem(item), "视频已更新");
  }

  const item = await prisma.audio.update({
    where: { id: req.params.itemId },
    data,
    include: includeMediaLibraryRelations(type),
  });
  if (data.handoutObjectKey !== undefined) {
    await cleanupObjectIfReplaced({
      previousObjectKey: previous.handoutObjectKey,
      nextObjectKey: item.handoutObjectKey,
    });
  }
  await writeAdminAuditLog(req, {
    action: "update_media_item",
    entityType: "audio",
    entityId: item.id,
    entityName: item.name,
    detail: { type, data },
  });
  return ok(res, serializeAudioLibraryItem(item), "音频已更新");
});

adminContentRouter.post("/media/items/batch-move", async (req, res) => {
  const type = readStrictMediaType(req.body?.type);
  if (!type) return fail(res, "素材类型不正确", 400);

  const itemIds = toStringArray(req.body?.itemIds);
  const folderId = `${req.body?.folderId ?? ""}`.trim();
  if (itemIds.length === 0) return fail(res, "请选择要移动的素材", 400);
  if (!folderId) return fail(res, "请选择目标文件夹", 400);

  const folder = await getMediaFolderModel(type).findUnique({ where: { id: folderId }, select: { id: true } });
  if (!folder) return fail(res, "目标文件夹不存在", 404);

  const mediaModel = getMediaModel(type);
  const existingItems = await mediaModel.findMany({ where: { id: { in: itemIds } }, select: { id: true } });
  if (existingItems.length !== itemIds.length) return fail(res, "部分素材不存在，无法移动", 400);

  const result = await mediaModel.updateMany({
    where: { id: { in: itemIds } },
    data: { folderId },
  });

  await writeAdminAuditLog(req, {
    action: "batch_move_media_items",
    entityType: type,
    entityId: folderId,
    detail: { type, folderId, itemIds, updatedCount: result.count },
  });

  return ok(res, { success: true, updatedCount: result.count }, `已移动 ${result.count} 个素材`);
});

adminContentRouter.post("/media/items/batch-delete", async (req, res) => {
  const type = readStrictMediaType(req.body?.type);
  if (!type) return fail(res, "素材类型不正确", 400);

  const itemIds = toStringArray(req.body?.itemIds);
  if (itemIds.length === 0) return fail(res, "请选择要删除的素材", 400);

  const mediaModel = getMediaModel(type);
  const refModel = getCourseMediaModel(type);
  const refField = getMediaRefField(type);

  const [items, refs] = await Promise.all([
    mediaModel.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true, objectKey: true, handoutObjectKey: true },
    }),
    refModel.findMany({
      where: { [refField]: { in: itemIds } },
      select: { [refField]: true },
    }),
  ]);

  if (items.length !== itemIds.length) return fail(res, "部分素材不存在，无法删除", 400);

  const blockedIds = [...new Set(refs.map((ref) => ref[refField]))];
  if (blockedIds.length > 0) {
    const blockedNames = items.filter((item) => blockedIds.includes(item.id)).map((item) => item.name);
    return fail(
      res,
      `有 ${blockedIds.length} 个素材已被课程引用，不能删除：${blockedNames.slice(0, 5).join("、")}${blockedNames.length > 5 ? "等" : ""}`,
      400,
    );
  }

  const result = await mediaModel.deleteMany({ where: { id: { in: itemIds } } });
  await cleanupMediaObjectKeys(items);

  await writeAdminAuditLog(req, {
    action: "batch_delete_media_items",
    entityType: type,
    detail: {
      type,
      itemIds,
      deletedCount: result.count,
      itemNames: items.map((item) => item.name),
    },
  });

  return ok(res, { success: true, deletedCount: result.count, blocked: [] }, `已删除 ${result.count} 个素材`);
});

adminContentRouter.delete("/media/items/:itemId", async (req, res) => {
  const type = readMediaType(req.query?.type);
  const mediaModel = getMediaModel(type);
  const item = await mediaModel.findUnique({
    where: { id: req.params.itemId },
    select: { id: true, objectKey: true, handoutObjectKey: true },
  });
  if (!item) return fail(res, "素材不存在", 404);

  if (type === "video") {
    const refCount = await prisma.courseVideo.count({ where: { videoId: req.params.itemId } });
    if (refCount > 0) return fail(res, "该视频已被课程引用，不能直接删除", 400);
    await prisma.video.delete({ where: { id: req.params.itemId } });
    await cleanupMediaObjectKeys([item]);
    await writeAdminAuditLog(req, {
      action: "delete_media_item",
      entityType: "video",
      entityId: item.id,
      detail: { type },
    });
    return ok(res, { success: true }, "视频已删除");
  }

  const refCount = await prisma.courseAudio.count({ where: { audioId: req.params.itemId } });
  if (refCount > 0) return fail(res, "该音频已被课程引用，不能直接删除", 400);
  await prisma.audio.delete({ where: { id: req.params.itemId } });
  await cleanupMediaObjectKeys([item]);
  await writeAdminAuditLog(req, {
    action: "delete_media_item",
    entityType: "audio",
    entityId: item.id,
    detail: { type },
  });
  return ok(res, { success: true }, "音频已删除");
});

adminContentRouter.post("/courses/:courseId/tags/:tagId/content", async (req, res) => {
  const mediaIds = toStringArray(req.body?.mediaIds);
  if (mediaIds.length === 0) return fail(res, "请选择要添加的内容", 400);

  const { course, tag } = await loadCourseAndTag(req.params.courseId, req.params.tagId);
  if (!course) return fail(res, "课程不存在", 404);
  if (!tag) return fail(res, "标签不存在或不属于该课程", 404);

  if ((course.courseType ?? "audio") === "video") {
    const mediaItems = await prisma.video.findMany({
      where: { id: { in: mediaIds }, processStatus: "ready" },
      select: { id: true },
    });
    if (mediaItems.length !== mediaIds.length) return fail(res, "部分视频不存在或尚未处理完成，无法添加", 400);

    const existing = await prisma.courseVideo.findMany({
      where: { courseId: course.id, videoId: { in: mediaIds } },
      select: { videoId: true },
    });
    const existingIds = new Set(existing.map((item) => item.videoId));
    const idsToCreate = mediaIds.filter((id) => !existingIds.has(id));

    if (idsToCreate.length > 0) {
      const maxOrder = await prisma.courseVideo.aggregate({
        where: { courseId: course.id, tagId: tag.id },
        _max: { order: true },
      });
      const startOrder = Number(maxOrder._max.order ?? -1) + 1;
      await prisma.courseVideo.createMany({
        data: idsToCreate.map((videoId, index) => ({
          courseId: course.id,
          tagId: tag.id,
          videoId,
          order: startOrder + index,
        })),
        skipDuplicates: true,
      });
    }

    const payload = await buildCourseContentPayload(course.id);
    await writeAdminAuditLog(req, {
      action: "add_course_content",
      entityType: "course_video",
      entityId: course.id,
      entityName: course.name,
      detail: {
        courseId: course.id,
        tagId: tag.id,
        mediaIds,
        addedIds: idsToCreate,
        addedCount: idsToCreate.length,
        skippedCount: mediaIds.length - idsToCreate.length,
      },
    });
    return ok(
      res,
      { ...payload, addedCount: idsToCreate.length, skippedCount: mediaIds.length - idsToCreate.length },
      idsToCreate.length > 0 ? "内容已添加" : "选中的内容已在课程中",
    );
  }

  const mediaItems = await prisma.audio.findMany({
    where: { id: { in: mediaIds }, processStatus: "ready" },
    select: { id: true },
  });
  if (mediaItems.length !== mediaIds.length) return fail(res, "部分音频不存在或尚未处理完成，无法添加", 400);

  const existing = await prisma.courseAudio.findMany({
    where: { courseId: course.id, audioId: { in: mediaIds } },
    select: { audioId: true },
  });
  const existingIds = new Set(existing.map((item) => item.audioId));
  const idsToCreate = mediaIds.filter((id) => !existingIds.has(id));

  if (idsToCreate.length > 0) {
    const maxOrder = await prisma.courseAudio.aggregate({
      where: { courseId: course.id, tagId: tag.id },
      _max: { order: true },
    });
    const startOrder = Number(maxOrder._max.order ?? -1) + 1;
    await prisma.courseAudio.createMany({
      data: idsToCreate.map((audioId, index) => ({
        courseId: course.id,
        tagId: tag.id,
        audioId,
        order: startOrder + index,
      })),
      skipDuplicates: true,
    });
  }

  const payload = await buildCourseContentPayload(course.id);
  await writeAdminAuditLog(req, {
    action: "add_course_content",
    entityType: "course_audio",
    entityId: course.id,
    entityName: course.name,
    detail: {
      courseId: course.id,
      tagId: tag.id,
      mediaIds,
      addedIds: idsToCreate,
      addedCount: idsToCreate.length,
      skippedCount: mediaIds.length - idsToCreate.length,
    },
  });
  return ok(
    res,
    { ...payload, addedCount: idsToCreate.length, skippedCount: mediaIds.length - idsToCreate.length },
    idsToCreate.length > 0 ? "内容已添加" : "选中的内容已在课程中",
  );
});

adminContentRouter.delete("/courses/:courseId/content/:relationId", async (req, res) => {
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    select: { id: true, name: true, courseType: true },
  });
  if (!course) return fail(res, "课程不存在", 404);

  if ((course.courseType ?? "audio") === "video") {
    const relation = await prisma.courseVideo.findFirst({
      where: { id: req.params.relationId, courseId: course.id },
      select: { id: true, tagId: true },
    });
    if (!relation) return fail(res, "课程内容不存在", 404);
    await prisma.courseVideo.delete({ where: { id: relation.id } });
    await normalizeTagContentOrder(course.id, relation.tagId, "video");
    await writeAdminAuditLog(req, {
      action: "remove_course_content",
      entityType: "course_video",
      entityId: relation.id,
      detail: { courseId: course.id, relationId: relation.id, tagId: relation.tagId },
    });
  } else {
    const relation = await prisma.courseAudio.findFirst({
      where: { id: req.params.relationId, courseId: course.id },
      select: { id: true, tagId: true },
    });
    if (!relation) return fail(res, "课程内容不存在", 404);
    await prisma.courseAudio.delete({ where: { id: relation.id } });
    await normalizeTagContentOrder(course.id, relation.tagId, "audio");
    await writeAdminAuditLog(req, {
      action: "remove_course_content",
      entityType: "course_audio",
      entityId: relation.id,
      detail: { courseId: course.id, relationId: relation.id, tagId: relation.tagId },
    });
  }

  const payload = await buildCourseContentPayload(course.id);
  return ok(res, payload, "内容已移除");
});

adminContentRouter.patch("/courses/:courseId/tags/:tagId/content/order", async (req, res) => {
  const { course, tag } = await loadCourseAndTag(req.params.courseId, req.params.tagId);
  if (!course) return fail(res, "课程不存在", 404);
  if (!tag) return fail(res, "标签不存在或不属于该课程", 404);

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const normalized = items
    .map((item, index) => ({
      relationId: `${item.relationId ?? item.id ?? ""}`.trim(),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
    }))
    .filter((item) => item.relationId);

  if (normalized.length === 0) return fail(res, "请提交有效的排序内容", 400);

  const model = (course.courseType ?? "audio") === "video" ? prisma.courseVideo : prisma.courseAudio;
  const existing = await model.findMany({
    where: { courseId: course.id, tagId: tag.id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((item) => item.id));
  if (normalized.some((item) => !existingIds.has(item.relationId))) return fail(res, "排序内容不属于该课程标签", 400);

  await prisma.$transaction(
    normalized.map((item) =>
      model.update({
        where: { id: item.relationId },
        data: { order: item.order },
      }),
    ),
  );
  await normalizeTagContentOrder(course.id, tag.id, course.courseType ?? "audio");

  const payload = await buildCourseContentPayload(course.id);
  await writeAdminAuditLog(req, {
    action: "reorder_course_content",
    entityType: (course.courseType ?? "audio") === "video" ? "course_video" : "course_audio",
    entityId: course.id,
    entityName: course.name,
    detail: { courseId: course.id, tagId: tag.id, items: normalized },
  });
  return ok(res, payload, "内容顺序已更新");
});

adminContentRouter.get("/courses/:courseId/content", async (req, res) => {
  const payload = await buildCourseContentPayload(req.params.courseId);
  if (!payload) return fail(res, "课程不存在", 404);
  return ok(res, payload);
});
