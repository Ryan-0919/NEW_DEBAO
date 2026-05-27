import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";
import { ok, fail } from "../lib/response.js";
import { formatDateTime } from "../lib/time.js";
import { normalizeDisplayText } from "../lib/text.js";
import { validatePasswordOrThrow } from "../lib/security.js";
import { ADMIN_ROLE_VALUES, normalizeAdminRole } from "../lib/admin-role.js";
import { sanitizeAuditDetailText, writeAdminAuditLog } from "../lib/admin-audit.js";
import { cleanupObjectIfReplaced } from "../lib/assets.js";
import { getReadableObjectUrl, uploadBuffer } from "../lib/upload.js";
import { getMockExamAiReviewConfigForAdmin, saveMockExamAiReviewConfig } from "../lib/mock-exam-ai-review-config.js";
import { normalizeCourseQuestionBankLinks, normalizePortalConfig } from "../../src/shared/portal-config.js";

const ALL_ADMIN_ROLES = ["super_admin", "operations_admin", "user_admin", "review_admin"];
const SYSTEM_MANAGER_ROLES = ["super_admin", "operations_admin"];
const EXAM_RECORD_VIEW_ROLES = ["super_admin", "operations_admin", "review_admin", "user_admin"];
const EXAM_RANK_MANAGER_ROLES = ["super_admin", "operations_admin"];
const REVIEW_PENDING_STATUSES = ["ai_pending", "ai_processing", "manual_pending"];
const REVIEW_WORKFLOW_STATUSES = ["not_required", "ai_pending", "ai_processing", "manual_pending", "published"];
const RECORD_STATUSES = ["in_progress", "submitted"];
const PAPER_TYPES = ["objective", "subjective"];

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
  },
});

export const adminOperationsRouter = Router();

adminOperationsRouter.use(requireAdminAuth);

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toNullablePositiveInt = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(`${value}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toTrimmedString = (value) => normalizeDisplayText(value ?? "").trim();
const toStringArray = (value) =>
  [...new Set((Array.isArray(value) ? value : value ? [value] : []).map((item) => `${item}`.trim()).filter(Boolean))];

const formatOptionalDateTime = (value) => (value ? formatDateTime(value) : "");

const buildPagedResult = ({ items, total, page, pageSize }) => ({
  items,
  total,
  page,
  pageSize,
  totalPages: Math.max(Math.ceil(total / pageSize), 1),
});

const startOfLocalDay = (date = new Date()) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const parseOptionalDate = (value, endOfDay = false) => {
  const text = `${value ?? ""}`.trim();
  if (!text) return null;
  const parsed = new Date(text.length <= 10 ? `${text}T00:00:00` : text.replace(" ", "T"));
  if (!Number.isFinite(parsed.getTime())) return null;
  if (endOfDay) parsed.setHours(23, 59, 59, 999);
  return parsed;
};

const serializeAdmin = (admin, auditCount = 0) => ({
  id: admin.id,
  account: admin.account,
  name: admin.name,
  role: admin.role,
  auditCount,
  createdAt: formatDateTime(admin.createdAt),
  updatedAt: formatDateTime(admin.updatedAt),
});

const readAdminPayload = (body = {}, { requirePassword = false } = {}) => {
  const account = `${body.account ?? ""}`.trim().toLowerCase();
  const name = toTrimmedString(body.name);
  const role = normalizeAdminRole(body.role, "operations_admin");
  const password = `${body.password ?? ""}`.trim();

  if (!account || !/^[a-zA-Z0-9_-]{3,50}$/.test(account)) {
    throw Object.assign(new Error("管理员账号需为 3-50 位字母、数字、下划线或短横线"), { statusCode: 400 });
  }
  if (!name) throw Object.assign(new Error("请输入管理员姓名"), { statusCode: 400 });
  if (requirePassword) validatePasswordOrThrow(password, "管理员密码");
  if (!ADMIN_ROLE_VALUES.includes(role)) throw Object.assign(new Error("管理员角色不正确"), { statusCode: 400 });

  return { account, name, role, password };
};

const ensureSuperAdminCanChange = async ({ adminId, nextRole, deleting = false, req }) => {
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) throw Object.assign(new Error("管理员账号不存在"), { statusCode: 404 });

  if (deleting && admin.id === req.auth.adminId) {
    throw Object.assign(new Error("不能删除当前登录的管理员账号"), { statusCode: 400 });
  }

  const wouldRemoveSuperRole = admin.role === "super_admin" && (deleting || nextRole !== "super_admin");
  if (!wouldRemoveSuperRole) return admin;

  const superAdminCount = await prisma.admin.count({ where: { role: "super_admin" } });
  if (superAdminCount <= 1) {
    throw Object.assign(new Error("系统至少需要保留一个超级管理员"), { statusCode: 400 });
  }

  if (admin.id === req.auth.adminId) {
    throw Object.assign(new Error("不能将当前超级管理员账号降权"), { statusCode: 400 });
  }

  return admin;
};

const safeParsePortalConfig = (config) => {
  if (!config?.portalConfigJson) return null;
  try {
    return JSON.parse(config.portalConfigJson);
  } catch {
    return null;
  }
};

const resolveMemberHomeBannerUrls = (portalConfig) => {
  portalConfig.memberHome.bannerImageUrl = getReadableObjectUrl({
    objectKey: portalConfig.memberHome.bannerImageObjectKey ?? "",
    fallbackUrl: portalConfig.memberHome.bannerImageUrl ?? "",
  });

  portalConfig.memberHome.banners = (portalConfig.memberHome.banners ?? []).map((item) => ({
    ...item,
    imageUrl: getReadableObjectUrl({
      objectKey: item.imageObjectKey ?? "",
      fallbackUrl: item.imageUrl ?? "",
    }),
  }));
};

const serializeSystemConfig = (config) => {
  const portalConfig = normalizePortalConfig(safeParsePortalConfig(config), {
    customerServiceUrl: config?.customerServiceUrl ?? "",
  });

  const brandLogoUrl = getReadableObjectUrl({
    objectKey: config?.brandLogoObjectKey ?? "",
    fallbackUrl: config?.brandLogoUrl ?? "",
  });
  const playerDiscImageUrl = getReadableObjectUrl({
    objectKey: config?.playerDiscImageObjectKey ?? "",
    fallbackUrl: config?.playerDiscImageUrl ?? "",
  });
  resolveMemberHomeBannerUrls(portalConfig);
  portalConfig.founder.imageUrl = getReadableObjectUrl({
    objectKey: portalConfig.founder.imageObjectKey ?? "",
    fallbackUrl: portalConfig.founder.imageUrl ?? "",
  });
  portalConfig.seo.ogImageUrl = getReadableObjectUrl({
    objectKey: portalConfig.seo.ogImageObjectKey ?? "",
    fallbackUrl: portalConfig.seo.ogImageUrl ?? "",
  });

  return {
    id: config?.id ?? 1,
    webhookUrl: config?.webhookUrl ?? "",
    customerServiceUrl: config?.customerServiceUrl ?? "",
    brandLogoUrl,
    brandLogoObjectKey: config?.brandLogoObjectKey ?? "",
    playerDiscImageUrl,
    playerDiscImageObjectKey: config?.playerDiscImageObjectKey ?? "",
    portalConfig,
    createdAt: config?.createdAt ? formatDateTime(config.createdAt) : "",
    updatedAt: config?.updatedAt ? formatDateTime(config.updatedAt) : "",
  };
};

const readNormalizedPortalConfig = (config) =>
  normalizePortalConfig(safeParsePortalConfig(config), {
    customerServiceUrl: config?.customerServiceUrl ?? "",
  });

const serializeLearningAnnouncementConfig = (config) => {
  const portalConfig = readNormalizedPortalConfig(config);
  const announcement = portalConfig.memberHome.announcement;

  return {
    title: announcement.title,
    subtitle: announcement.subtitle,
    badge: announcement.badge,
    items: [...(announcement.items ?? [])]
      .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0))
      .map((item, index) => ({
        id: `${index + 1}`,
        title: item.title ?? "",
        description: item.description ?? "",
        tag: item.tag ?? announcement.badge ?? "公告",
        color: item.color ?? "#4e8ef7",
        time: item.time ?? "",
        link: item.link ?? "",
        isVisible: item.isVisible !== false,
        sortOrder: Number(item.sortOrder ?? index),
      })),
    updatedAt: config?.updatedAt ? formatDateTime(config.updatedAt) : "",
  };
};

const readSystemConfigPayload = (body = {}, currentConfig = null) => {
  const data = {};

  if (body.webhookUrl !== undefined) data.webhookUrl = `${body.webhookUrl ?? ""}`.trim() || null;
  if (body.customerServiceUrl !== undefined) data.customerServiceUrl = `${body.customerServiceUrl ?? ""}`.trim() || null;
  if (body.brandLogoUrl !== undefined) data.brandLogoUrl = `${body.brandLogoUrl ?? ""}`.trim() || null;
  if (body.brandLogoObjectKey !== undefined) data.brandLogoObjectKey = `${body.brandLogoObjectKey ?? ""}`.trim() || null;
  if (body.playerDiscImageUrl !== undefined) data.playerDiscImageUrl = `${body.playerDiscImageUrl ?? ""}`.trim() || null;
  if (body.playerDiscImageObjectKey !== undefined) {
    data.playerDiscImageObjectKey = `${body.playerDiscImageObjectKey ?? ""}`.trim() || null;
  }

  if (body.portalConfig !== undefined) {
    const currentPortalConfig = safeParsePortalConfig(currentConfig);
    const portalConfig = normalizePortalConfig({
      ...(body.portalConfig ?? currentPortalConfig ?? {}),
      courseQuestionBankLinks: currentPortalConfig?.courseQuestionBankLinks,
    }, {
      customerServiceUrl: data.customerServiceUrl ?? currentConfig?.customerServiceUrl ?? "",
    });
    data.portalConfigJson = JSON.stringify(portalConfig);
  }

  return data;
};

const normalizeAnnouncementColor = (value, fallback = "#4e8ef7") => {
  const text = `${value ?? ""}`.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(text) || /^rgba?\(/i.test(text) ? text : fallback;
};

const readLearningAnnouncementPayload = (body = {}, currentConfig = null) => {
  const currentPortalConfig = readNormalizedPortalConfig(currentConfig);
  const currentAnnouncement = currentPortalConfig.memberHome.announcement ?? {};
  const title = toTrimmedString(body.title) || currentAnnouncement.title || "学习公告";
  const subtitle = toTrimmedString(body.subtitle) || currentAnnouncement.subtitle || "Announcement";
  const badge = toTrimmedString(body.badge) || currentAnnouncement.badge || "最新";
  const sourceItems = Array.isArray(body.items) ? body.items : currentAnnouncement.items ?? [];
  const items = sourceItems
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const sortOrder = toNullablePositiveInt(item.sortOrder);
      return {
        title: toTrimmedString(item.title),
        description: toTrimmedString(item.description),
        tag: toTrimmedString(item.tag) || badge,
        color: normalizeAnnouncementColor(item.color, "#4e8ef7"),
        time: toTrimmedString(item.time),
        link: `${item.link ?? ""}`.trim(),
        isVisible: item.isVisible !== false,
        sortOrder: sortOrder === null ? index : sortOrder,
      };
    })
    .filter((item) => item.title || item.description);

  if (items.length === 0) {
    throw Object.assign(new Error("请至少保留一条学习公告"), { statusCode: 400 });
  }

  return normalizePortalConfig(
    {
      ...currentPortalConfig,
      memberHome: {
        ...currentPortalConfig.memberHome,
        announcement: {
          title,
          subtitle,
          badge,
          items,
        },
      },
    },
    {
      customerServiceUrl: currentConfig?.customerServiceUrl ?? "",
    },
  );
};

const getPaperTypeLabel = (value) => (value === "subjective" ? "主观题" : value === "objective" ? "客观题" : "未分类");

const getRecordStatusLabel = (value) => {
  if (value === "in_progress") return "进行中";
  if (value === "submitted") return "已交卷";
  return value || "-";
};

const getReviewStatusLabel = (value) => {
  const labels = {
    not_required: "无需批改",
    ai_pending: "待批改",
    ai_processing: "AI批改中",
    manual_pending: "人工处理中",
    published: "已发布",
  };
  return labels[value] ?? value ?? "-";
};

const buildExamRecordWhere = (query = {}) => {
  const keyword = toTrimmedString(query.keyword);
  const paperId = `${query.paperId ?? "all"}`.trim();
  const seriesId = `${query.seriesId ?? "all"}`.trim();
  const paperType = `${query.paperType ?? "all"}`.trim();
  const status = `${query.status ?? "all"}`.trim();
  const reviewWorkflowStatus = `${query.reviewWorkflowStatus ?? "all"}`.trim();
  const dateFrom = parseOptionalDate(query.dateFrom);
  const dateTo = parseOptionalDate(query.dateTo, true);
  const submittedAt = {};
  if (dateFrom) submittedAt.gte = dateFrom;
  if (dateTo) submittedAt.lte = dateTo;
  const paperWhere = {
    ...(seriesId && seriesId !== "all" ? { seriesId: seriesId === "__none__" ? null : seriesId } : {}),
    ...(paperType && paperType !== "all" && PAPER_TYPES.includes(paperType) ? { paperType } : {}),
  };

  return {
    ...(paperId && paperId !== "all" ? { paperId } : {}),
    ...(status && status !== "all" && RECORD_STATUSES.includes(status) ? { status } : {}),
    ...(reviewWorkflowStatus && reviewWorkflowStatus !== "all" && REVIEW_WORKFLOW_STATUSES.includes(reviewWorkflowStatus)
      ? { reviewWorkflowStatus }
      : {}),
    ...(Object.keys(submittedAt).length > 0 ? { submittedAt } : {}),
    ...(Object.keys(paperWhere).length > 0 ? { paper: paperWhere } : {}),
    ...(keyword
      ? {
          OR: [
            { id: { contains: keyword } },
            { user: { phone: { contains: keyword } } },
            { user: { nickname: { contains: keyword } } },
            { user: { id: { contains: keyword } } },
            { paper: { title: { contains: keyword } } },
            { paper: { code: { contains: keyword } } },
            { paper: { series: { name: { contains: keyword } } } },
          ],
        }
      : {}),
  };
};

const serializeExamPaperOption = (paper) => ({
  id: paper.id,
  code: paper.code,
  title: paper.title,
  subtitle: paper.subtitle ?? "",
  seriesId: paper.seriesId ?? "",
  seriesName: paper.series?.name ?? "",
  paperType: paper.paperType ?? "",
  paperTypeLabel: getPaperTypeLabel(paper.paperType),
  year: paper.year ?? null,
  phase: paper.phase ?? "",
  status: paper.status,
  totalScore: Number(paper.totalScore ?? 0),
  passScore: Number(paper.passScore ?? 0),
  recordCount: Number(paper._count?.records ?? 0),
  leaderboardCount: Number(paper._count?.leaderboardEntries ?? 0),
});

const serializeExamRecord = (record, leaderboardEntry = null) => ({
  id: record.id,
  recordId: record.id,
  userId: record.userId,
  userPhone: record.user?.phone ?? "",
  userNickname: record.user?.nickname ?? "",
  userStatus: record.user?.status ?? "",
  userLabel: record.user?.nickname || record.user?.phone || record.userId,
  paperId: record.paperId,
  paperCode: record.paper?.code ?? "",
  paperTitle: record.paper?.title ?? "",
  seriesId: record.paper?.seriesId ?? "",
  seriesName: record.paper?.series?.name ?? "",
  paperType: record.paper?.paperType ?? "",
  paperTypeLabel: getPaperTypeLabel(record.paper?.paperType),
  status: record.status,
  statusLabel: getRecordStatusLabel(record.status),
  reviewWorkflowStatus: record.reviewWorkflowStatus,
  reviewWorkflowStatusLabel: getReviewStatusLabel(record.reviewWorkflowStatus),
  attemptNo: Number(record.attemptNo ?? 0),
  questionCount: Number(record.questionCount ?? 0),
  answeredCount: Number(record.answeredCount ?? 0),
  correctCount: Number(record.correctCount ?? 0),
  score: Number(record.totalScore ?? 0),
  paperTotalScore: Number(record.paper?.totalScore ?? 0),
  passScore: Number(record.paper?.passScore ?? 0),
  allottedSeconds: Number(record.allottedSeconds ?? 0),
  consumedSeconds: Number(record.consumedSeconds ?? 0),
  manualRank: leaderboardEntry?.manualRank ?? null,
  startedAt: formatOptionalDateTime(record.startedAt),
  submittedAt: formatOptionalDateTime(record.submittedAt),
  reviewedAt: formatOptionalDateTime(record.reviewedAt),
  publishedAt: formatOptionalDateTime(record.publishedAt),
  updatedAt: formatOptionalDateTime(record.updatedAt),
});

const safeParseJson = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const serializeExamRecordDetail = (record) => ({
  ...serializeExamRecord(record, record.paper?.leaderboardEntries?.[0] ?? null),
  answers: (record.answers ?? []).map((answer) => ({
    id: answer.id,
    questionId: answer.questionId,
    score: Number(answer.score ?? 0),
    isCorrect: answer.isCorrect,
    answer: safeParseJson(answer.answerJson, {}),
    review: safeParseJson(answer.reviewJson, {}),
    updatedAt: formatDateTime(answer.updatedAt),
  })),
});

adminOperationsRouter.get("/dashboard/summary", requireAdminRoles(...ALL_ADMIN_ROLES), async (_req, res) => {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const sevenDaysStart = addDays(todayStart, -6);
  const thirtyDaysStart = addDays(todayStart, -29);
  const onlineWindowMinutes = 30;
  const onlineSince = new Date(now.getTime() - onlineWindowMinutes * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    disabledUsers,
    registeredToday,
    registered7d,
    active30d,
    onlineNowDevices,
    onlineTodayDevices,
    courseCount,
    openCourseCount,
    closedCourseCount,
    audioCount,
    videoCount,
    paperCount,
    objectivePaperCount,
    subjectivePaperCount,
    submittedRecordCount,
    inProgressRecordCount,
    pendingReviewCount,
    publishedReviewCount,
    questionBankCount,
    typingRecordCount,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "active" } }),
    prisma.user.count({ where: { status: "disabled" } }),
    prisma.user.count({ where: { registeredAt: { gte: todayStart } } }),
    prisma.user.count({ where: { registeredAt: { gte: sevenDaysStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysStart } } }),
    prisma.userDevice.findMany({ where: { updatedAt: { gte: onlineSince } }, distinct: ["userId"], select: { userId: true } }),
    prisma.userDevice.findMany({ where: { updatedAt: { gte: todayStart } }, distinct: ["userId"], select: { userId: true } }),
    prisma.course.count(),
    prisma.course.count({ where: { status: "open" } }),
    prisma.course.count({ where: { status: "closed" } }),
    prisma.audio.count(),
    prisma.video.count(),
    prisma.mockExamPaper.count(),
    prisma.mockExamPaper.count({ where: { paperType: "objective" } }),
    prisma.mockExamPaper.count({ where: { paperType: "subjective" } }),
    prisma.mockExamRecord.count({ where: { status: "submitted" } }),
    prisma.mockExamRecord.count({ where: { status: "in_progress" } }),
    prisma.mockExamRecord.count({ where: { status: "submitted", reviewWorkflowStatus: { in: REVIEW_PENDING_STATUSES } } }),
    prisma.mockExamRecord.count({ where: { status: "submitted", reviewWorkflowStatus: "published" } }),
    prisma.bookQuestionBank.count(),
    prisma.typingPracticeRecord.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  return ok(res, {
    users: {
      total: totalUsers,
      active: activeUsers,
      disabled: disabledUsers,
      onlineNow: onlineNowDevices.length,
      onlineToday: onlineTodayDevices.length,
      registeredToday,
      registered7d,
      active30d,
      onlineWindowMinutes,
    },
    content: {
      courseCount,
      openCourseCount,
      closedCourseCount,
      audioCount,
      videoCount,
      questionBankCount,
      typingRecordCount,
    },
    exams: {
      paperCount,
      objectivePaperCount,
      subjectivePaperCount,
      submittedRecordCount,
      inProgressRecordCount,
      pendingReviewCount,
      publishedReviewCount,
    },
    recentAuditLogs: recentAuditLogs.map((log) => ({
      id: log.id,
      operatorAccount: log.operatorAccount ?? "",
      operatorName: log.operatorName ?? "",
      action: log.action,
      entityType: log.entityType,
      entityName: log.entityName ?? "",
      createdAt: formatDateTime(log.createdAt),
    })),
    generatedAt: formatDateTime(now),
  });
});

adminOperationsRouter.get("/admins", requireAdminRoles("super_admin"), async (_req, res) => {
  const [admins, auditRows] = await Promise.all([
    prisma.admin.findMany({ orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
    prisma.auditLog.groupBy({ by: ["adminId"], _count: { _all: true } }),
  ]);
  const auditMap = new Map(auditRows.map((row) => [row.adminId, Number(row._count?._all ?? 0)]));
  return ok(res, admins.map((admin) => serializeAdmin(admin, auditMap.get(admin.id) ?? 0)));
});

adminOperationsRouter.post("/admins", requireAdminRoles("super_admin"), async (req, res) => {
  try {
    const payload = readAdminPayload(req.body, { requirePassword: true });
    const admin = await prisma.admin.create({
      data: {
        account: payload.account,
        name: payload.name,
        role: payload.role,
        passwordHash: await hashPassword(payload.password),
      },
    });

    await writeAdminAuditLog(req, {
      action: "create_admin",
      entityType: "admin",
      entityId: admin.id,
      entityName: admin.account,
      detail: { account: admin.account, name: admin.name, role: admin.role },
    });

    return ok(res, serializeAdmin(admin), "管理员账号已创建");
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "管理员账号已存在", 409);
    return fail(res, error.message || "创建管理员失败", error.statusCode || 500);
  }
});

adminOperationsRouter.patch("/admins/:adminId", requireAdminRoles("super_admin"), async (req, res) => {
  try {
    const payload = readAdminPayload(req.body, { requirePassword: false });
    const previous = await ensureSuperAdminCanChange({ adminId: req.params.adminId, nextRole: payload.role, req });
    const admin = await prisma.admin.update({
      where: { id: req.params.adminId },
      data: {
        account: payload.account,
        name: payload.name,
        role: payload.role,
      },
    });

    await writeAdminAuditLog(req, {
      action: "update_admin",
      entityType: "admin",
      entityId: admin.id,
      entityName: admin.account,
      detail: {
        before: { account: previous.account, name: previous.name, role: previous.role },
        after: { account: admin.account, name: admin.name, role: admin.role },
      },
    });

    return ok(res, serializeAdmin(admin), "管理员账号已更新");
  } catch (error) {
    if (error?.code === "P2002") return fail(res, "管理员账号已存在", 409);
    return fail(res, error.message || "更新管理员失败", error.statusCode || 500);
  }
});

adminOperationsRouter.patch("/admins/:adminId/password", requireAdminRoles("super_admin"), async (req, res) => {
  try {
    const password = validatePasswordOrThrow(req.body?.password, "管理员密码");
    const admin = await prisma.admin.update({
      where: { id: req.params.adminId },
      data: { passwordHash: await hashPassword(password) },
    });

    await writeAdminAuditLog(req, {
      action: "reset_admin_password",
      entityType: "admin",
      entityId: admin.id,
      entityName: admin.account,
      detail: { account: admin.account },
    });

    return ok(res, { success: true }, "管理员密码已重置");
  } catch (error) {
    if (error?.code === "P2025") return fail(res, "管理员账号不存在", 404);
    return fail(res, error.message || "重置管理员密码失败", error.statusCode || 500);
  }
});

adminOperationsRouter.delete("/admins/:adminId", requireAdminRoles("super_admin"), async (req, res) => {
  try {
    const admin = await ensureSuperAdminCanChange({ adminId: req.params.adminId, deleting: true, req });
    await prisma.admin.delete({ where: { id: admin.id } });

    await writeAdminAuditLog(req, {
      action: "delete_admin",
      entityType: "admin",
      entityId: admin.id,
      entityName: admin.account,
      detail: { account: admin.account, name: admin.name, role: admin.role },
    });

    return ok(res, { success: true }, "管理员账号已删除");
  } catch (error) {
    return fail(res, error.message || "删除管理员失败", error.statusCode || 500);
  }
});

adminOperationsRouter.get("/logs/summary", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (_req, res) => {
  const todayStart = startOfLocalDay(new Date());
  const [auditTotal, webhookTotal, auditToday, webhookToday, webhookFailed, recentAudit, recentWebhook] = await Promise.all([
    prisma.auditLog.count(),
    prisma.webhookLog.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.webhookLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.webhookLog.count({ where: { status: "failed" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 1 }),
    prisma.webhookLog.findMany({ orderBy: { createdAt: "desc" }, take: 1 }),
  ]);

  return ok(res, {
    auditTotal,
    webhookTotal,
    auditToday,
    webhookToday,
    webhookFailed,
    latestAuditAt: formatOptionalDateTime(recentAudit[0]?.createdAt),
    latestWebhookAt: formatOptionalDateTime(recentWebhook[0]?.createdAt),
  });
});

adminOperationsRouter.get("/logs/audit", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (req, res) => {
  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
  const keyword = toTrimmedString(req.query?.keyword);
  const entityType = `${req.query?.entityType ?? "all"}`.trim();
  const action = `${req.query?.action ?? "all"}`.trim();
  const where = {
    ...(entityType && entityType !== "all" ? { entityType } : {}),
    ...(action && action !== "all" ? { action } : {}),
    ...(keyword
      ? {
          OR: [
            { operatorAccount: { contains: keyword } },
            { operatorName: { contains: keyword } },
            { action: { contains: keyword } },
            { entityType: { contains: keyword } },
            { entityId: { contains: keyword } },
            { entityName: { contains: keyword } },
            { detail: { contains: keyword } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok(
    res,
    buildPagedResult({
      items: items.map((log) => ({
        id: log.id,
        operatorAccount: log.operatorAccount ?? "",
        operatorName: log.operatorName ?? "",
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId ?? "",
        entityName: log.entityName ?? "",
        detail: sanitizeAuditDetailText(log.detail ?? "", 1000),
        createdAt: formatDateTime(log.createdAt),
      })),
      total,
      page,
      pageSize,
    }),
  );
});

adminOperationsRouter.get("/logs/webhooks", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (req, res) => {
  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
  const status = `${req.query?.status ?? "all"}`.trim();
  const scene = toTrimmedString(req.query?.scene);
  const keyword = toTrimmedString(req.query?.keyword);
  const where = {
    ...(status && status !== "all" && ["success", "failed", "skipped"].includes(status) ? { status } : {}),
    ...(scene ? { scene: { contains: scene } } : {}),
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { scene: { contains: keyword } },
            { messagePreview: { contains: keyword } },
            { errorMessage: { contains: keyword } },
            { relatedEntityType: { contains: keyword } },
            { relatedEntityId: { contains: keyword } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.webhookLog.count({ where }),
    prisma.webhookLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok(
    res,
    buildPagedResult({
      items: items.map((log) => ({
        id: log.id,
        scene: log.scene,
        status: log.status,
        title: log.title ?? "",
        webhookUrl: log.webhookUrl ?? "",
        messagePreview: log.messagePreview ?? "",
        responseCode: log.responseCode ?? null,
        errorMessage: log.errorMessage ?? "",
        relatedEntityType: log.relatedEntityType ?? "",
        relatedEntityId: log.relatedEntityId ?? "",
        createdAt: formatDateTime(log.createdAt),
      })),
      total,
      page,
      pageSize,
    }),
  );
});

adminOperationsRouter.get("/system-config", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (_req, res) => {
  const config = await prisma.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, portalConfigJson: JSON.stringify(normalizePortalConfig(null)) },
    update: {},
  });

  return ok(res, serializeSystemConfig(config));
});

adminOperationsRouter.patch("/system-config", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (req, res) => {
  try {
    const currentConfig = await prisma.systemConfig.upsert({
      where: { id: 1 },
      create: { id: 1, portalConfigJson: JSON.stringify(normalizePortalConfig(null)) },
      update: {},
    });
    const data = readSystemConfigPayload(req.body, currentConfig);
    const config = await prisma.systemConfig.update({ where: { id: 1 }, data });

    await Promise.all([
      data.brandLogoObjectKey !== undefined
        ? cleanupObjectIfReplaced({
            previousObjectKey: currentConfig.brandLogoObjectKey,
            nextObjectKey: config.brandLogoObjectKey,
          })
        : null,
      data.playerDiscImageObjectKey !== undefined
        ? cleanupObjectIfReplaced({
            previousObjectKey: currentConfig.playerDiscImageObjectKey,
            nextObjectKey: config.playerDiscImageObjectKey,
          })
        : null,
    ]);

    await writeAdminAuditLog(req, {
      action: "update_system_config",
      entityType: "system_config",
      entityId: "1",
      entityName: "系统与门户配置",
      detail: data,
    });

    return ok(res, serializeSystemConfig(config), "系统配置已保存");
  } catch (error) {
    return fail(res, error.message || "保存系统配置失败", error.statusCode || 500);
  }
});

adminOperationsRouter.get("/course-question-bank-links", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (_req, res) => {
  const config = await prisma.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, portalConfigJson: JSON.stringify(normalizePortalConfig(null)) },
    update: {},
  });
  const portalConfig = readNormalizedPortalConfig(config);
  return ok(res, normalizeCourseQuestionBankLinks(portalConfig.courseQuestionBankLinks));
});

adminOperationsRouter.patch("/course-question-bank-links/:courseId", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (req, res) => {
  try {
    const courseId = `${req.params.courseId ?? ""}`.trim();
    const bookIds = toStringArray(req.body?.bookIds);
    if (!courseId) return fail(res, "课程不存在", 400);

    const [course, books] = await Promise.all([
      prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }),
      bookIds.length === 0
        ? Promise.resolve([])
        : prisma.bookQuestionBank.findMany({
            where: {
              id: { in: bookIds },
              accessType: "authorized",
            },
            select: { id: true },
          }),
    ]);
    if (!course) return fail(res, "课程不存在", 404);
    if (books.length !== bookIds.length) return fail(res, "存在无效的授权题库，请刷新后重试", 400);

    const currentConfig = await prisma.systemConfig.upsert({
      where: { id: 1 },
      create: { id: 1, portalConfigJson: JSON.stringify(normalizePortalConfig(null)) },
      update: {},
    });
    const portalConfig = readNormalizedPortalConfig(currentConfig);
    const currentLinks = normalizeCourseQuestionBankLinks(portalConfig.courseQuestionBankLinks);
    const nextLinks = [
      ...currentLinks.filter((item) => item.courseId !== courseId),
      ...(bookIds.length > 0 ? [{ courseId, bookIds }] : []),
    ];
    const nextPortalConfig = {
      ...portalConfig,
      courseQuestionBankLinks: nextLinks,
    };

    const config = await prisma.systemConfig.update({
      where: { id: 1 },
      data: { portalConfigJson: JSON.stringify(nextPortalConfig) },
    });

    await writeAdminAuditLog(req, {
      action: "update_course_question_bank_links",
      entityType: "course",
      entityId: courseId,
      detail: { courseId, bookIds },
    });

    const savedPortalConfig = readNormalizedPortalConfig(config);
    return ok(res, normalizeCourseQuestionBankLinks(savedPortalConfig.courseQuestionBankLinks), "课程关联题库权限已保存");
  } catch (error) {
    return fail(res, error.message || "保存课程关联题库权限失败", error.statusCode || 500);
  }
});

adminOperationsRouter.get("/learning-announcements", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (_req, res) => {
  const config = await prisma.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, portalConfigJson: JSON.stringify(normalizePortalConfig(null)) },
    update: {},
  });

  return ok(res, serializeLearningAnnouncementConfig(config));
});

adminOperationsRouter.patch("/learning-announcements", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (req, res) => {
  try {
    const currentConfig = await prisma.systemConfig.upsert({
      where: { id: 1 },
      create: { id: 1, portalConfigJson: JSON.stringify(normalizePortalConfig(null)) },
      update: {},
    });
    const portalConfig = readLearningAnnouncementPayload(req.body, currentConfig);
    const config = await prisma.systemConfig.update({
      where: { id: 1 },
      data: {
        portalConfigJson: JSON.stringify(portalConfig),
      },
    });

    await writeAdminAuditLog(req, {
      action: "update_learning_announcements",
      entityType: "learning_announcement",
      entityId: "memberHome.announcement",
      entityName: "学习公告管理",
      detail: {
        title: portalConfig.memberHome.announcement.title,
        itemCount: portalConfig.memberHome.announcement.items.length,
      },
    });

    return ok(res, serializeLearningAnnouncementConfig(config), "学习公告已保存");
  } catch (error) {
    return fail(res, error.message || "保存学习公告失败", error.statusCode || 500);
  }
});

adminOperationsRouter.get("/mock-exam-ai-review-config", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (_req, res) => {
  try {
    return ok(res, await getMockExamAiReviewConfigForAdmin({ db: prisma }));
  } catch (error) {
    return fail(res, error.message || "加载 AI 批改配置失败", error.statusCode || 500);
  }
});

adminOperationsRouter.patch("/mock-exam-ai-review-config", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (req, res) => {
  try {
    const payload = await saveMockExamAiReviewConfig({ db: prisma, input: req.body ?? {} });
    await writeAdminAuditLog(req, {
      action: "update_mock_exam_ai_review_config",
      entityType: "mock_exam_ai_review_config",
      entityId: "1",
      entityName: "AI批改配置",
      detail: {
        provider: payload.provider,
        baseUrl: payload.baseUrl,
        model: payload.model,
        disableQueue: payload.disableQueue,
        timeoutMs: payload.timeoutMs,
        maxConcurrency: payload.maxConcurrency,
        maxRetryCount: payload.maxRetryCount,
        retryDelayMs: payload.retryDelayMs,
        queuePollIntervalMs: payload.queuePollIntervalMs,
        allowRuleFallback: payload.allowRuleFallback,
        apiKeyConfigured: payload.apiKeyConfigured,
      },
    });
    return ok(res, payload, "AI批改配置已保存");
  } catch (error) {
    return fail(res, error.message || "保存 AI 批改配置失败", error.statusCode || 500);
  }
});

adminOperationsRouter.post(
  "/system-config/image/upload",
  requireAdminRoles(...SYSTEM_MANAGER_ROLES),
  imageUpload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) return fail(res, "请选择要上传的图片", 400);
    if (!`${file.mimetype ?? ""}`.startsWith("image/")) return fail(res, "只能上传图片文件", 400);

    const originalName = normalizeDisplayText(file.originalname || "system-image");
    const uploaded = await uploadBuffer({
      fileName: originalName,
      buffer: file.buffer,
      mimeType: file.mimetype,
      folder: "admin/system-images",
    });

    await writeAdminAuditLog(req, {
      action: "upload_system_image",
      entityType: "system_config",
      entityId: uploaded.objectKey,
      entityName: originalName,
      detail: { objectKey: uploaded.objectKey, fileName: originalName, mimeType: file.mimetype },
    });

    return ok(
      res,
      {
        url: uploaded.readableUrl || uploaded.url,
        objectKey: uploaded.objectKey,
        fileName: originalName,
      },
      "图片已上传",
    );
  },
);

adminOperationsRouter.post("/system-config/test-webhook", requireAdminRoles(...SYSTEM_MANAGER_ROLES), async (req, res) => {
  const systemConfig = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  const webhookUrl = `${req.body?.webhookUrl ?? systemConfig?.webhookUrl ?? ""}`.trim();
  if (!webhookUrl) return fail(res, "请先填写 Webhook 地址", 400);

  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    return fail(res, "Webhook 地址格式不正确", 400);
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) return fail(res, "Webhook 地址必须以 http 或 https 开头", 400);

  const title = "得宝后台 Webhook 测试";
  const payload = {
    title,
    text: "这是一条来自得宝后台的测试消息。",
    sentAt: new Date().toISOString(),
  };

  let status = "failed";
  let responseCode = null;
  let errorMessage = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    responseCode = response.status;
    status = response.ok ? "success" : "failed";
    if (!response.ok) errorMessage = `HTTP ${response.status}`;
  } catch (error) {
    errorMessage = error?.name === "AbortError" ? "请求超时" : error.message || "发送失败";
  }

  await prisma.webhookLog.create({
    data: {
      scene: "system_config_test",
      status,
      title,
      webhookUrl,
      messagePreview: JSON.stringify(payload),
      responseCode,
      errorMessage: errorMessage || null,
      relatedEntityType: "system_config",
      relatedEntityId: "1",
    },
  });

  await writeAdminAuditLog(req, {
    action: "test_webhook",
    entityType: "system_config",
    entityId: "1",
    entityName: "Webhook 测试",
    detail: { webhookUrl, status, responseCode, errorMessage },
  });

  if (status !== "success") return fail(res, errorMessage || "Webhook 测试发送失败", 502);
  return ok(res, { success: true, responseCode }, "Webhook 测试发送成功");
});

adminOperationsRouter.get("/exam-records/summary", requireAdminRoles(...EXAM_RECORD_VIEW_ROLES), async (_req, res) => {
  const [total, submitted, inProgress, pendingReview, published, objective, subjective] = await Promise.all([
    prisma.mockExamRecord.count(),
    prisma.mockExamRecord.count({ where: { status: "submitted" } }),
    prisma.mockExamRecord.count({ where: { status: "in_progress" } }),
    prisma.mockExamRecord.count({ where: { status: "submitted", reviewWorkflowStatus: { in: REVIEW_PENDING_STATUSES } } }),
    prisma.mockExamRecord.count({ where: { status: "submitted", reviewWorkflowStatus: "published" } }),
    prisma.mockExamRecord.count({ where: { paper: { paperType: "objective" } } }),
    prisma.mockExamRecord.count({ where: { paper: { paperType: "subjective" } } }),
  ]);

  return ok(res, { total, submitted, inProgress, pendingReview, published, objective, subjective, generatedAt: formatDateTime(new Date()) });
});

adminOperationsRouter.get("/exam-records/papers", requireAdminRoles(...EXAM_RECORD_VIEW_ROLES), async (req, res) => {
  const keyword = toTrimmedString(req.query?.keyword);
  const paperType = `${req.query?.paperType ?? "all"}`.trim();
  const papers = await prisma.mockExamPaper.findMany({
    where: {
      ...(paperType && paperType !== "all" && PAPER_TYPES.includes(paperType) ? { paperType } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { code: { contains: keyword } },
              { subtitle: { contains: keyword } },
              { series: { name: { contains: keyword } } },
            ],
          }
        : {}),
    },
    include: {
      series: { select: { id: true, name: true } },
      _count: { select: { records: true, leaderboardEntries: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return ok(res, papers.map(serializeExamPaperOption));
});

adminOperationsRouter.get("/exam-records", requireAdminRoles(...EXAM_RECORD_VIEW_ROLES), async (req, res) => {
  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
  const where = buildExamRecordWhere(req.query);

  const [total, records] = await Promise.all([
    prisma.mockExamRecord.count({ where }),
    prisma.mockExamRecord.findMany({
      where,
      include: {
        user: { select: { id: true, phone: true, nickname: true, status: true } },
        paper: {
          include: {
            series: { select: { id: true, name: true } },
            leaderboardEntries: { select: { userId: true, manualRank: true } },
          },
        },
      },
      orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok(
    res,
    buildPagedResult({
      items: records.map((record) =>
        serializeExamRecord(
          record,
          (record.paper?.leaderboardEntries ?? []).find((entry) => entry.userId === record.userId) ?? null,
        ),
      ),
      total,
      page,
      pageSize,
    }),
  );
});

adminOperationsRouter.get("/exam-records/:recordId", requireAdminRoles(...EXAM_RECORD_VIEW_ROLES), async (req, res) => {
  const record = await prisma.mockExamRecord.findUnique({
    where: { id: req.params.recordId },
    include: {
      user: { select: { id: true, phone: true, nickname: true, status: true } },
      paper: {
        include: {
          series: { select: { id: true, name: true } },
          leaderboardEntries: { select: { userId: true, manualRank: true } },
        },
      },
      answers: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!record) return fail(res, "考试记录不存在", 404);
  await writeAdminAuditLog(req, {
    action: "view_exam_record_detail",
    entityType: "mock_exam_record",
    entityId: record.id,
    entityName: record.paper?.title ?? "",
    detail: { userId: record.userId, paperId: record.paperId },
  });
  return ok(res, serializeExamRecordDetail(record));
});

adminOperationsRouter.get("/exam-records/papers/:paperId/scores", requireAdminRoles(...EXAM_RECORD_VIEW_ROLES), async (req, res) => {
  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 50), 200);
  const where = buildExamRecordWhere({ ...req.query, paperId: req.params.paperId, status: req.query?.status ?? "submitted" });
  const [paper, total, records] = await Promise.all([
    prisma.mockExamPaper.findUnique({
      where: { id: req.params.paperId },
      include: {
        series: { select: { id: true, name: true } },
        _count: { select: { records: true, leaderboardEntries: true } },
      },
    }),
    prisma.mockExamRecord.count({ where }),
    prisma.mockExamRecord.findMany({
      where,
      include: {
        user: { select: { id: true, phone: true, nickname: true, status: true } },
        paper: {
          include: {
            series: { select: { id: true, name: true } },
            leaderboardEntries: { select: { userId: true, manualRank: true } },
          },
        },
      },
      orderBy: [{ totalScore: "desc" }, { consumedSeconds: "asc" }, { submittedAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  if (!paper) return fail(res, "试卷不存在", 404);

  return ok(res, {
    paper: serializeExamPaperOption(paper),
    ...buildPagedResult({
      items: records.map((record) =>
        serializeExamRecord(
          record,
          (record.paper?.leaderboardEntries ?? []).find((entry) => entry.userId === record.userId) ?? null,
        ),
      ),
      total,
      page,
      pageSize,
    }),
  });
});

adminOperationsRouter.patch(
  "/exam-records/papers/:paperId/leaderboard-ranks",
  requireAdminRoles(...EXAM_RANK_MANAGER_ROLES),
  async (req, res) => {
    try {
      const paper = await prisma.mockExamPaper.findUnique({ where: { id: req.params.paperId }, select: { id: true, title: true } });
      if (!paper) return fail(res, "试卷不存在", 404);

      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const normalizedItems = items
        .map((item) => ({
          userId: `${item?.userId ?? ""}`.trim(),
          manualRank: toNullablePositiveInt(item?.manualRank),
        }))
        .filter((item) => item.userId);

      if (normalizedItems.length === 0) return fail(res, "请提交要调整的排行榜名次", 400);

      const existingUsers = await prisma.user.findMany({
        where: { id: { in: normalizedItems.map((item) => item.userId) } },
        select: { id: true },
      });
      const existingUserIds = new Set(existingUsers.map((user) => user.id));
      if (normalizedItems.some((item) => !existingUserIds.has(item.userId))) return fail(res, "部分用户不存在，无法保存排行榜", 400);

      await prisma.$transaction(
        normalizedItems.map((item) =>
          prisma.mockExamLeaderboardEntry.upsert({
            where: { paperId_userId: { paperId: paper.id, userId: item.userId } },
            create: { paperId: paper.id, userId: item.userId, manualRank: item.manualRank },
            update: { manualRank: item.manualRank },
          }),
        ),
      );

      await writeAdminAuditLog(req, {
        action: "update_exam_leaderboard_ranks",
        entityType: "mock_exam_paper",
        entityId: paper.id,
        entityName: paper.title,
        detail: { items: normalizedItems },
      });

      return ok(res, { success: true, updatedCount: normalizedItems.length }, "排行榜名次已保存");
    } catch (error) {
      return fail(res, error.message || "保存排行榜失败", error.statusCode || 500);
    }
  },
);
