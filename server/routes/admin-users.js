import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";
import { ok, fail } from "../lib/response.js";
import { serializeCourseWithCounts } from "../lib/course-content.js";
import { serializeDevice, serializeUser } from "../lib/serializers.js";
import { formatDateTime } from "../lib/time.js";
import { isValidPhone, normalizePhone, validatePasswordOrThrow, validatePhoneOrThrow } from "../lib/security.js";
import { sanitizeAuditDetailText, writeAdminAuditLog } from "../lib/admin-audit.js";

const DEFAULT_USER_PASSWORD = "den2024";
const DEVICE_LIMIT = 5;
const USER_MANAGER_ROLES = ["super_admin", "user_admin"];
const SELF_REGISTRATION_SOURCES = ["self_register", "sms_auto_created"];
const USER_REGISTRATION_SOURCE_LABELS = {
  legacy_unknown: "历史未知",
  self_register: "自主注册",
  sms_auto_created: "验证码自动创建",
  admin_created: "后台添加",
  admin_imported: "后台批量导入",
};

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAdminAuth);
adminUsersRouter.use("/users", requireAdminRoles(...USER_MANAGER_ROLES));
adminUsersRouter.use("/devices", requireAdminRoles(...USER_MANAGER_ROLES));

const toStringArray = (value) =>
  [...new Set((Array.isArray(value) ? value : value ? [value] : []).map((item) => `${item}`.trim()).filter(Boolean))];

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toNumber = (value) => {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value.toNumber === "function") return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toMoney = (value) => toNumber(value).toFixed(2);

const formatOptionalDateTime = (value) => (value ? formatDateTime(value) : "");

const getLatestDate = (values = []) => {
  const timestamps = values
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
};

const sanitizeAuditDetail = (value) => sanitizeAuditDetailText(value);

const normalizeRegistrationSource = (value) =>
  Object.prototype.hasOwnProperty.call(USER_REGISTRATION_SOURCE_LABELS, value) ? value : "legacy_unknown";

const parseJsonStringArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? toStringArray(parsed) : [];
  } catch {
    return [];
  }
};

const readCourseIds = (body = {}, addKey = "courseIds") => toStringArray(body[addKey] ?? body.addCourseIds ?? body.addCourses);

const readMockExamSeriesIds = (body = {}, addKey = "mockExamSeriesIds") =>
  toStringArray(body[addKey] ?? body.addMockExamSeriesIds ?? body.addMockExamPapers);

const readQuestionBankBookIds = (body = {}, addKey = "questionBankBookIds") =>
  toStringArray(body[addKey] ?? body.addQuestionBankBookIds ?? body.addQuestionBanks);

const getPaperIdsBySeriesIds = async (seriesIds = []) => {
  const normalizedSeriesIds = toStringArray(seriesIds);
  if (normalizedSeriesIds.length === 0) return [];

  const papers = await prisma.mockExamPaper.findMany({
    where: {
      seriesId: {
        in: normalizedSeriesIds,
      },
    },
    select: {
      id: true,
    },
  });

  return papers.map((paper) => paper.id);
};

const getAuthorizedQuestionBankBookIds = async (bookIds = []) => {
  const normalizedBookIds = toStringArray(bookIds);
  if (normalizedBookIds.length === 0) return [];
  const books = await prisma.bookQuestionBank.findMany({
    where: {
      id: { in: normalizedBookIds },
      accessType: "authorized",
    },
    select: { id: true },
  });
  return books.map((book) => book.id);
};

const createCoursePermissionLinks = async (userId, courseIds) => {
  const normalizedCourseIds = toStringArray(courseIds);
  if (normalizedCourseIds.length === 0) return;

  await prisma.userCoursePermission.createMany({
    data: normalizedCourseIds.map((courseId) => ({
      userId,
      courseId,
    })),
    skipDuplicates: true,
  });
};

const createQuestionBankPermissionLinks = async (userId, bookIds) => {
  const normalizedBookIds = await getAuthorizedQuestionBankBookIds(bookIds);
  if (normalizedBookIds.length === 0) return;

  await prisma.userBookQuestionBankPermission.createMany({
    data: normalizedBookIds.map((bookId) => ({
      userId,
      bookId,
    })),
    skipDuplicates: true,
  });
};

const createMockExamPermissionLinks = async (userId, paperIds) => {
  const normalizedPaperIds = toStringArray(paperIds);
  if (normalizedPaperIds.length === 0) return;

  await prisma.userMockExamPermission.createMany({
    data: normalizedPaperIds.map((paperId) => ({
      userId,
      paperId,
      manualAttemptLimit: null,
      manualAttemptUsed: 0,
      currentRecordStartedAt: null,
    })),
    skipDuplicates: true,
  });
};

const createMockExamSeriesPermissionLinks = async (userId, seriesIds) => {
  const normalizedSeriesIds = toStringArray(seriesIds);
  if (normalizedSeriesIds.length === 0) return;

  await prisma.userMockExamSeriesPermission.createMany({
    data: normalizedSeriesIds.map((seriesId) => ({
      userId,
      seriesId,
    })),
    skipDuplicates: true,
  });

  await createMockExamPermissionLinks(userId, await getPaperIdsBySeriesIds(normalizedSeriesIds));
};

const createOrAppendUser = async ({ phone, courseIds, mockExamSeriesIds, questionBankBookIds, defaultPasswordHash }) => {
  const normalizedPhone = validatePhoneOrThrow(phone);
  const existing = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
  });

  if (existing) {
    await createCoursePermissionLinks(existing.id, courseIds);
    await createMockExamSeriesPermissionLinks(existing.id, mockExamSeriesIds);
    await createQuestionBankPermissionLinks(existing.id, questionBankBookIds);
    return { isNew: false, userId: existing.id, phone: existing.phone };
  }

  const user = await prisma.user.create({
    data: {
      phone: normalizedPhone,
      passwordHash: defaultPasswordHash ?? (await hashPassword(DEFAULT_USER_PASSWORD)),
      status: "active",
      registrationSource: "admin_created",
    },
  });
  await createCoursePermissionLinks(user.id, courseIds);
  await createMockExamSeriesPermissionLinks(user.id, mockExamSeriesIds);
  await createQuestionBankPermissionLinks(user.id, questionBankBookIds);
  return { isNew: true, userId: user.id, phone: user.phone };
};

const batchCreateOrAppendUsers = async ({ phones, courseIds, mockExamSeriesIds, questionBankBookIds }) => {
  const normalizedCourseIds = toStringArray(courseIds);
  const normalizedMockExamSeriesIds = toStringArray(mockExamSeriesIds);
  const normalizedQuestionBankBookIds = toStringArray(questionBankBookIds);
  const uniquePhones = [...new Set((Array.isArray(phones) ? phones : [phones]).map((item) => normalizePhone(item)).filter(Boolean))];
  const failed = [];
  const validPhones = [];

  for (const phone of uniquePhones) {
    if (!isValidPhone(phone)) {
      failed.push(phone);
      continue;
    }
    validPhones.push(phone);
  }

  if (validPhones.length === 0) {
    return { createdCount: 0, appendedCount: 0, failed };
  }

  const existingUsers = await prisma.user.findMany({
    where: {
      phone: {
        in: validPhones,
      },
    },
    select: {
      id: true,
      phone: true,
    },
  });
  const existingPhoneSet = new Set(existingUsers.map((user) => user.phone));
  const newPhones = validPhones.filter((phone) => !existingPhoneSet.has(phone));
  let createdUsers = [];

  if (newPhones.length > 0) {
    const defaultPasswordHash = await hashPassword(DEFAULT_USER_PASSWORD);

    await prisma.user.createMany({
      data: newPhones.map((phone) => ({
        phone,
        passwordHash: defaultPasswordHash,
        status: "active",
        registrationSource: "admin_imported",
      })),
      skipDuplicates: true,
    });

    createdUsers = await prisma.user.findMany({
      where: {
        phone: {
          in: newPhones,
        },
      },
      select: {
        id: true,
        phone: true,
      },
    });
  }

  const allUsers = [...existingUsers];
  const knownPhones = new Set(existingUsers.map((user) => user.phone));
  for (const user of createdUsers) {
    if (knownPhones.has(user.phone)) continue;
    knownPhones.add(user.phone);
    allUsers.push(user);
  }

  if (allUsers.length > 0 && normalizedCourseIds.length > 0) {
    await prisma.userCoursePermission.createMany({
      data: allUsers.flatMap((user) =>
        normalizedCourseIds.map((courseId) => ({
          userId: user.id,
          courseId,
        })),
      ),
      skipDuplicates: true,
    });
  }

  if (allUsers.length > 0 && normalizedMockExamSeriesIds.length > 0) {
    const paperIds = await getPaperIdsBySeriesIds(normalizedMockExamSeriesIds);
    await prisma.userMockExamSeriesPermission.createMany({
      data: allUsers.flatMap((user) =>
        normalizedMockExamSeriesIds.map((seriesId) => ({
          userId: user.id,
          seriesId,
        })),
      ),
      skipDuplicates: true,
    });
    await prisma.userMockExamPermission.createMany({
      data: allUsers.flatMap((user) =>
        paperIds.map((paperId) => ({
          userId: user.id,
          paperId,
          manualAttemptLimit: null,
          manualAttemptUsed: 0,
          currentRecordStartedAt: null,
        })),
      ),
      skipDuplicates: true,
    });
  }

  const authorizedQuestionBankBookIds = await getAuthorizedQuestionBankBookIds(normalizedQuestionBankBookIds);

  if (allUsers.length > 0 && authorizedQuestionBankBookIds.length > 0) {
    await prisma.userBookQuestionBankPermission.createMany({
      data: allUsers.flatMap((user) =>
        authorizedQuestionBankBookIds.map((bookId) => ({
          userId: user.id,
          bookId,
        })),
      ),
      skipDuplicates: true,
    });
  }

  for (const phone of newPhones) {
    if (!knownPhones.has(phone)) failed.push(phone);
  }

  return {
    createdCount: newPhones.filter((phone) => knownPhones.has(phone)).length,
    appendedCount: existingUsers.length,
    failed,
  };
};

adminUsersRouter.get("/courses", requireAdminRoles("super_admin", "operations_admin", "user_admin"), async (_req, res) => {
  return ok(res, await prisma.course.findMany({
    include: {
      _count: {
        select: {
          courseAudios: true,
          courseVideos: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  }).then((courses) => courses.map(serializeCourseWithCounts)));
});

adminUsersRouter.get("/question-banks", requireAdminRoles(...USER_MANAGER_ROLES), async (_req, res) => {
  const books = await prisma.bookQuestionBank.findMany({
    where: { accessType: "authorized" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      accessType: true,
      paperType: true,
      isVisible: true,
      sortOrder: true,
    },
  });

  return ok(res, books);
});

adminUsersRouter.get("/users/summary", async (_req, res) => {
  const [total, active, disabled, selfRegistered, adminAdded, legacyUnknown, usersWithDeviceCount] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "active" } }),
    prisma.user.count({ where: { status: "disabled" } }),
    prisma.user.count({ where: { registrationSource: { in: SELF_REGISTRATION_SOURCES } } }),
    prisma.user.count({ where: { registrationSource: { in: ["admin_created", "admin_imported"] } } }),
    prisma.user.count({ where: { registrationSource: "legacy_unknown" } }),
    prisma.user.findMany({
      select: {
        id: true,
        _count: {
          select: {
            devices: true,
          },
        },
      },
    }),
  ]);

  return ok(res, {
    total,
    active,
    disabled,
    selfRegistered,
    adminAdded,
    legacyUnknown,
    fullDevices: usersWithDeviceCount.filter((user) => user._count.devices >= DEVICE_LIMIT).length,
  });
});

adminUsersRouter.get("/users", async (req, res) => {
  const keyword = `${req.query?.keyword ?? ""}`.trim();
  const status = `${req.query?.status ?? "all"}`.trim();
  const registrationSource = `${req.query?.registrationSource ?? "all"}`.trim();
  const courseId = `${req.query?.courseId ?? ""}`.trim();
  const page = toPositiveInt(req.query?.page, 1);
  const pageSize = Math.min(toPositiveInt(req.query?.pageSize, 20), 100);
  const where = {
    ...(keyword
      ? {
          OR: [{ phone: { contains: keyword } }, { nickname: { contains: keyword } }, { id: { contains: keyword } }],
        }
      : {}),
    ...(status === "active" || status === "disabled" ? { status } : {}),
    ...(registrationSource === "self_registered"
      ? { registrationSource: { in: SELF_REGISTRATION_SOURCES } }
      : Object.prototype.hasOwnProperty.call(USER_REGISTRATION_SOURCE_LABELS, registrationSource)
        ? { registrationSource }
        : {}),
    ...(courseId && courseId !== "all"
      ? {
          permissions: {
            some: {
              courseId,
            },
          },
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        devices: {
          orderBy: { loginAt: "desc" },
          take: 1,
        },
        permissions: true,
        mockExamSeriesPermissions: true,
        mockExamPermissions: true,
        bookQuestionBankPermissions: true,
        _count: {
          select: {
            devices: true,
          },
        },
      },
      orderBy: { registeredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const participatedRows =
    users.length > 0
      ? await prisma.mockExamRecord.findMany({
          where: {
            userId: {
              in: users.map((user) => user.id),
            },
          },
          select: {
            userId: true,
            paperId: true,
          },
          distinct: ["userId", "paperId"],
        })
      : [];
  const participatedPaperIdsByUserId = new Map();
  for (const row of participatedRows) {
    const current = participatedPaperIdsByUserId.get(row.userId) ?? [];
    current.push(row.paperId);
    participatedPaperIdsByUserId.set(row.userId, current);
  }

  return ok(res, {
    items: users.map((user) =>
      serializeUser({
        ...user,
        mockExamParticipatedPaperIds: participatedPaperIdsByUserId.get(user.id) ?? [],
      }),
    ),
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  });
});

adminUsersRouter.get("/users/:userId/detail", async (req, res) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      nickname: true,
      status: true,
      registrationSource: true,
      registeredAt: true,
      lastLoginAt: true,
    },
  });

  if (!user) return fail(res, "用户不存在", 404);

  const [
    coursePermissions,
    audioProgresses,
    videoProgresses,
    questionBankPermissions,
    questionBankProgresses,
    mockExamPermissions,
    mockExamRecords,
    orders,
    auditLogs,
  ] = await Promise.all([
    prisma.userCoursePermission.findMany({
      where: { userId },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            courseType: true,
            status: true,
            _count: {
              select: {
                courseAudios: true,
                courseVideos: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userProgress.findMany({
      where: { userId },
      select: {
        courseId: true,
        audioId: true,
        progress: true,
        completed: true,
        lastUpdated: true,
        audio: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { lastUpdated: "desc" },
      take: 500,
    }),
    prisma.userVideoProgress.findMany({
      where: { userId },
      select: {
        courseId: true,
        videoId: true,
        progress: true,
        completed: true,
        lastUpdated: true,
        video: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { lastUpdated: "desc" },
      take: 500,
    }),
    prisma.userBookQuestionBankPermission.findMany({
      where: {
        userId,
        book: {
          accessType: "authorized",
        },
      },
      include: {
        book: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            isVisible: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userBookQuestionBankProgress.findMany({
      where: { userId },
      include: {
        book: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            isVisible: true,
          },
        },
        lastSubject: {
          select: {
            name: true,
          },
        },
        lastBookItem: {
          select: {
            title: true,
            questionNo: true,
          },
        },
      },
      orderBy: [{ lastPracticedAt: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    prisma.userMockExamPermission.findMany({
      where: { userId },
      include: {
        paper: {
          select: {
            id: true,
            title: true,
            year: true,
            phase: true,
            totalScore: true,
            passScore: true,
            maxAttempts: true,
            paperType: true,
            series: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.mockExamRecord.findMany({
      where: { userId },
      select: {
        id: true,
        paperId: true,
        status: true,
        reviewWorkflowStatus: true,
        attemptNo: true,
        questionCount: true,
        allottedSeconds: true,
        consumedSeconds: true,
        totalScore: true,
        correctCount: true,
        answeredCount: true,
        startedAt: true,
        submittedAt: true,
        reviewedAt: true,
        publishedAt: true,
        updatedAt: true,
        paper: {
          select: {
            id: true,
            title: true,
            year: true,
            phase: true,
            totalScore: true,
            passScore: true,
            maxAttempts: true,
            paperType: true,
            series: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.shopOrder.findMany({
      where: { userId },
      select: {
        id: true,
        orderNo: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        payAmount: true,
        paidAt: true,
        cancelledAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            productNameSnapshot: true,
            productTypeSnapshot: true,
            priceSnapshot: true,
            quantity: true,
            courseIdsSnapshot: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [{ entityId: userId }, { detail: { contains: userId } }, { detail: { contains: user.phone } }],
      },
      select: {
        id: true,
        operatorAccount: true,
        operatorName: true,
        action: true,
        entityType: true,
        entityId: true,
        entityName: true,
        detail: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const courseMap = new Map();
  for (const permission of coursePermissions) {
    const course = permission.course;
    courseMap.set(course.id, {
      courseId: course.id,
      courseName: course.name,
      courseType: course.courseType,
      status: course.status,
      totalContentCount: Number(course._count.courseAudios ?? 0) + Number(course._count.courseVideos ?? 0),
      progressCount: 0,
      completedCount: 0,
      completionRate: 0,
      lastLearningAt: "",
      lastContentName: "",
    });
  }

  const allProgresses = [
    ...audioProgresses.map((item) => ({
      courseId: item.courseId,
      contentName: item.audio?.name ?? "",
      progress: Number(item.progress ?? 0),
      completed: Boolean(item.completed),
      lastUpdated: item.lastUpdated,
    })),
    ...videoProgresses.map((item) => ({
      courseId: item.courseId,
      contentName: item.video?.name ?? "",
      progress: Number(item.progress ?? 0),
      completed: Boolean(item.completed),
      lastUpdated: item.lastUpdated,
    })),
  ];

  for (const progress of allProgresses) {
    if (!courseMap.has(progress.courseId)) {
      courseMap.set(progress.courseId, {
        courseId: progress.courseId,
        courseName: "未授权课程",
        courseType: "audio",
        status: "closed",
        totalContentCount: 0,
        progressCount: 0,
        completedCount: 0,
        completionRate: 0,
        lastLearningAt: "",
        lastContentName: "",
      });
    }

    const course = courseMap.get(progress.courseId);
    course.progressCount += 1;
    if (progress.completed) course.completedCount += 1;

    const currentLatest = course.lastLearningAt ? new Date(course.lastLearningAt).getTime() : 0;
    const nextLatest = new Date(progress.lastUpdated).getTime();
    if (Number.isFinite(nextLatest) && nextLatest >= currentLatest) {
      course.lastLearningAt = formatDateTime(progress.lastUpdated);
      course.lastContentName = progress.contentName;
    }
  }

  const learningCourses = [...courseMap.values()]
    .map((course) => ({
      ...course,
      completionRate:
        course.totalContentCount > 0 ? Number(((course.completedCount / course.totalContentCount) * 100).toFixed(1)) : 0,
    }))
    .sort((left, right) => {
      const rightTime = right.lastLearningAt ? new Date(right.lastLearningAt).getTime() : 0;
      const leftTime = left.lastLearningAt ? new Date(left.lastLearningAt).getTime() : 0;
      return rightTime - leftTime;
    });

  const questionBankProgressMap = new Map(questionBankProgresses.map((item) => [item.bookId, item]));
  const questionBankBookMap = new Map();
  for (const permission of questionBankPermissions) questionBankBookMap.set(permission.bookId, permission.book);
  for (const progress of questionBankProgresses) questionBankBookMap.set(progress.bookId, progress.book);

  const questionBankItems = [...questionBankBookMap.entries()]
    .map(([bookId, book]) => {
      const progress = questionBankProgressMap.get(bookId);
      return {
        bookId,
        bookName: book?.name ?? "未知题库",
        code: book?.code ?? "",
        status: book?.status ?? "",
        isVisible: Boolean(book?.isVisible ?? false),
        answeredCount: Number(progress?.answeredCount ?? 0),
        viewedAnswerCount: Number(progress?.viewedAnswerCount ?? 0),
        masteredCount: Number(progress?.masteredCount ?? 0),
        redoCount: Number(progress?.redoCount ?? 0),
        lastPracticedAt: formatOptionalDateTime(progress?.lastPracticedAt ?? progress?.updatedAt),
        lastSubjectName: progress?.lastSubject?.name ?? "",
        lastItemTitle: progress?.lastBookItem?.title ?? progress?.lastBookItem?.questionNo ?? "",
      };
    })
    .sort((left, right) => {
      const rightTime = right.lastPracticedAt ? new Date(right.lastPracticedAt).getTime() : 0;
      const leftTime = left.lastPracticedAt ? new Date(left.lastPracticedAt).getTime() : 0;
      return rightTime - leftTime;
    });

  const mockExamPermissionItems = mockExamPermissions.map((permission) => {
    const maxAttempts = Number(permission.paper?.maxAttempts ?? 0);
    const manualLimit = permission.manualAttemptLimit == null ? null : Number(permission.manualAttemptLimit);
    const limit = manualLimit ?? (maxAttempts > 0 ? maxAttempts : null);
    const used = Number(permission.manualAttemptUsed ?? 0);
    return {
      paperId: permission.paperId,
      title: permission.paper?.title ?? "未知试卷",
      seriesName: permission.paper?.series?.name ?? "",
      year: permission.paper?.year ?? null,
      phase: permission.paper?.phase ?? "",
      paperType: permission.paper?.paperType ?? "",
      totalScore: Number(permission.paper?.totalScore ?? 0),
      passScore: Number(permission.paper?.passScore ?? 0),
      maxAttempts,
      manualAttemptLimit: manualLimit,
      manualAttemptUsed: used,
      remainingAttempts: limit == null ? null : Math.max(0, limit - used),
      currentRecordStartedAt: formatOptionalDateTime(permission.currentRecordStartedAt),
    };
  });

  const mockExamRecordItems = mockExamRecords.map((record) => ({
    recordId: record.id,
    paperId: record.paperId,
    title: record.paper?.title ?? "未知试卷",
    seriesName: record.paper?.series?.name ?? "",
    year: record.paper?.year ?? null,
    phase: record.paper?.phase ?? "",
    paperType: record.paper?.paperType ?? "",
    status: record.status,
    reviewWorkflowStatus: record.reviewWorkflowStatus,
    attemptNo: Number(record.attemptNo ?? 0),
    questionCount: Number(record.questionCount ?? 0),
    answeredCount: Number(record.answeredCount ?? 0),
    correctCount: Number(record.correctCount ?? 0),
    score: Number(record.totalScore ?? 0),
    totalScore: Number(record.paper?.totalScore ?? 0),
    allottedSeconds: Number(record.allottedSeconds ?? 0),
    consumedSeconds: Number(record.consumedSeconds ?? 0),
    startedAt: formatOptionalDateTime(record.startedAt),
    submittedAt: formatOptionalDateTime(record.submittedAt),
    reviewedAt: formatOptionalDateTime(record.reviewedAt),
    publishedAt: formatOptionalDateTime(record.publishedAt),
    updatedAt: formatOptionalDateTime(record.updatedAt),
  }));

  const orderItems = orders.map((order) => ({
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalAmount: toMoney(order.totalAmount),
    payAmount: toMoney(order.payAmount),
    paidAt: formatOptionalDateTime(order.paidAt),
    cancelledAt: formatOptionalDateTime(order.cancelledAt),
    completedAt: formatOptionalDateTime(order.completedAt),
    createdAt: formatDateTime(order.createdAt),
    updatedAt: formatDateTime(order.updatedAt),
    productNames: order.items.map((item) => item.productNameSnapshot).filter(Boolean),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productNameSnapshot,
      productType: item.productTypeSnapshot,
      price: toMoney(item.priceSnapshot),
      quantity: Number(item.quantity ?? 0),
      courseIds: parseJsonStringArray(item.courseIdsSnapshot),
    })),
  }));

  const totalPaidAmount = orders
    .filter((order) => order.paymentStatus === "paid" || order.paidAt)
    .reduce((sum, order) => sum + toNumber(order.payAmount), 0);

  return ok(res, {
    user: {
      id: user.id,
      userCode: user.id.slice(-8),
      phone: user.phone,
      nickname: user.nickname ?? "",
      status: user.status,
      registrationSource: normalizeRegistrationSource(user.registrationSource),
      registrationSourceLabel: USER_REGISTRATION_SOURCE_LABELS[normalizeRegistrationSource(user.registrationSource)],
      registeredAt: formatDateTime(user.registeredAt),
      lastLogin: formatOptionalDateTime(user.lastLoginAt),
    },
    learning: {
      summary: {
        courseCount: learningCourses.length,
        audioProgressCount: audioProgresses.length,
        audioCompletedCount: audioProgresses.filter((item) => item.completed).length,
        videoProgressCount: videoProgresses.length,
        videoCompletedCount: videoProgresses.filter((item) => item.completed).length,
        lastLearningAt: formatOptionalDateTime(getLatestDate(allProgresses.map((item) => item.lastUpdated))),
      },
      courses: learningCourses,
    },
    questionBanks: {
      summary: {
        bookCount: questionBankItems.length,
        answeredCount: questionBankItems.reduce((sum, item) => sum + item.answeredCount, 0),
        masteredCount: questionBankItems.reduce((sum, item) => sum + item.masteredCount, 0),
        redoCount: questionBankItems.reduce((sum, item) => sum + item.redoCount, 0),
        lastPracticedAt: formatOptionalDateTime(getLatestDate(questionBankProgresses.map((item) => item.lastPracticedAt ?? item.updatedAt))),
      },
      items: questionBankItems,
    },
    mockExams: {
      summary: {
        recordCount: mockExamRecords.length,
        submittedCount: mockExamRecords.filter((item) => item.status === "submitted").length,
        inProgressCount: mockExamRecords.filter((item) => item.status === "in_progress").length,
        accessiblePaperCount: mockExamPermissionItems.length,
        lastExamAt: formatOptionalDateTime(getLatestDate(mockExamRecords.map((item) => item.updatedAt))),
      },
      permissions: mockExamPermissionItems,
      records: mockExamRecordItems,
    },
    orders: {
      summary: {
        orderCount: orders.length,
        paidOrderCount: orders.filter((order) => order.paymentStatus === "paid" || order.paidAt).length,
        totalPaidAmount: totalPaidAmount.toFixed(2),
        lastPaidAt: formatOptionalDateTime(getLatestDate(orders.map((item) => item.paidAt))),
      },
      items: orderItems,
    },
    auditLogs: {
      summary: {
        count: auditLogs.length,
      },
      items: auditLogs.map((log) => ({
        id: log.id,
        operatorAccount: log.operatorAccount ?? "",
        operatorName: log.operatorName ?? "",
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId ?? "",
        entityName: log.entityName ?? "",
        detail: sanitizeAuditDetail(log.detail),
        createdAt: formatDateTime(log.createdAt),
      })),
    },
  });
});

adminUsersRouter.get("/users/mock-exam-papers", requireAdminRoles(...USER_MANAGER_ROLES), async (_req, res) => {
  const seriesList = await prisma.mockExamSeries.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      papers: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: {
          title: true,
        },
      },
    },
  });

  return ok(
    res,
    seriesList.map((series) => ({
      id: series.id,
      title: series.name,
      description: series.description ?? "",
      paperCount: series.papers.length,
      paperTitles: series.papers.map((paper) => paper.title),
    })),
  );
});

adminUsersRouter.get("/mock-exam-papers", requireAdminRoles(...USER_MANAGER_ROLES), async (_req, res) => {
  const papers = await prisma.mockExamPaper.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      subtitle: true,
      year: true,
      phase: true,
      seriesId: true,
      maxAttempts: true,
      series: {
        select: {
          name: true,
        },
      },
    },
  });

  return ok(
    res,
    papers.map((paper) => ({
      id: paper.id,
      title: paper.title,
      subtitle: paper.subtitle ?? "",
      year: paper.year ?? null,
      phase: paper.phase ?? "",
      seriesId: paper.seriesId ?? "",
      seriesName: paper.series?.name ?? "",
      maxAttempts: Number(paper.maxAttempts ?? 0),
    })),
  );
});

adminUsersRouter.post("/users", async (req, res, next) => {
  try {
    const { phone } = req.body ?? {};
    if (!phone) return fail(res, "请输入手机号", 400);

    const courseIds = readCourseIds(req.body);
    const mockExamSeriesIds = readMockExamSeriesIds(req.body);
    const questionBankBookIds = readQuestionBankBookIds(req.body);

    const result = await createOrAppendUser({
      phone,
      courseIds,
      mockExamSeriesIds,
      questionBankBookIds,
    });
    await writeAdminAuditLog(req, {
      action: result.isNew ? "create_user" : "append_user_permissions",
      entityType: "user",
      entityId: result.userId,
      entityName: result.phone,
      detail: {
        phone: result.phone,
        isNew: result.isNew,
        courseIds,
        mockExamSeriesIds,
        questionBankBookIds,
      },
    });

    return ok(res, result, result.isNew ? "用户已新增" : "已为现有用户追加权限");
  } catch (error) {
    return next(error);
  }
});

adminUsersRouter.post("/users/batch-import", async (req, res) => {
  const phones = Array.isArray(req.body?.phones)
    ? req.body.phones
    : `${req.body?.phones ?? ""}`
        .split(/\r?\n|,|，|\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
  const courseIds = readCourseIds(req.body);
  const mockExamSeriesIds = readMockExamSeriesIds(req.body);
  const questionBankBookIds = readQuestionBankBookIds(req.body);
  const result = await batchCreateOrAppendUsers({
    phones,
    courseIds,
    mockExamSeriesIds,
    questionBankBookIds,
  });
  await writeAdminAuditLog(req, {
    action: "batch_import_users",
    entityType: "user",
    entityName: "batch_import",
    detail: {
      parsedCount: phones.length,
      createdCount: result.createdCount,
      appendedCount: result.appendedCount,
      failed: result.failed,
      courseIds,
      mockExamSeriesIds,
      questionBankBookIds,
    },
  });

  return ok(res, result, "批量导入完成");
});

adminUsersRouter.patch("/users/:userId/permissions", async (req, res) => {
  const { userId } = req.params;
  const addCourses = toStringArray(req.body?.addCourses ?? req.body?.addCourseIds);
  const removeCourses = toStringArray(req.body?.removeCourses ?? req.body?.removeCourseIds);
  const addMockExamSeries = toStringArray(req.body?.addMockExamSeriesIds ?? req.body?.addMockExamPapers);
  const removeMockExamSeries = toStringArray(req.body?.removeMockExamSeriesIds ?? req.body?.removeMockExamPapers);
  const addQuestionBanks = await getAuthorizedQuestionBankBookIds(req.body?.addQuestionBankBookIds ?? req.body?.addQuestionBanks);
  const removeQuestionBanks = toStringArray(req.body?.removeQuestionBankBookIds ?? req.body?.removeQuestionBanks);

  await createCoursePermissionLinks(userId, addCourses);
  await createMockExamSeriesPermissionLinks(userId, addMockExamSeries);
  await createQuestionBankPermissionLinks(userId, addQuestionBanks);

  if (removeCourses.length > 0) {
    await prisma.userCoursePermission.deleteMany({
      where: {
        userId,
        courseId: { in: removeCourses },
      },
    });
  }

  if (removeMockExamSeries.length > 0) {
    const paperIdsToRemove = await getPaperIdsBySeriesIds(removeMockExamSeries);
    await prisma.userMockExamSeriesPermission.deleteMany({
      where: {
        userId,
        seriesId: { in: removeMockExamSeries },
      },
    });
    await prisma.userMockExamPermission.deleteMany({
      where: {
        userId,
        paperId: { in: paperIdsToRemove },
      },
    });
  }

  if (removeQuestionBanks.length > 0) {
    await prisma.userBookQuestionBankPermission.deleteMany({
      where: {
        userId,
        bookId: { in: removeQuestionBanks },
      },
    });
  }
  await writeAdminAuditLog(req, {
    action: "update_user_permissions",
    entityType: "user",
    entityId: userId,
    detail: {
      addCourses,
      removeCourses,
      addMockExamSeries,
      removeMockExamSeries,
      addQuestionBanks,
      removeQuestionBanks,
    },
  });

  return ok(res, { success: true }, "权限已更新");
});

adminUsersRouter.post("/users/batch-permissions", async (req, res) => {
  const userIds = toStringArray(req.body?.userIds);
  const courseIds = readCourseIds(req.body);
  const mockExamSeriesIds = readMockExamSeriesIds(req.body);
  const questionBankBookIds = await getAuthorizedQuestionBankBookIds(readQuestionBankBookIds(req.body));

  if (userIds.length === 0) return fail(res, "请选择用户", 400);
  if (courseIds.length === 0 && mockExamSeriesIds.length === 0 && questionBankBookIds.length === 0) {
    return fail(res, "请至少选择一种权限", 400);
  }

  if (courseIds.length > 0) {
    await prisma.userCoursePermission.createMany({
      data: userIds.flatMap((userId) =>
        courseIds.map((courseId) => ({
          userId,
          courseId,
        })),
      ),
      skipDuplicates: true,
    });
  }

  if (mockExamSeriesIds.length > 0) {
    const paperIds = await getPaperIdsBySeriesIds(mockExamSeriesIds);
    await prisma.userMockExamSeriesPermission.createMany({
      data: userIds.flatMap((userId) =>
        mockExamSeriesIds.map((seriesId) => ({
          userId,
          seriesId,
        })),
      ),
      skipDuplicates: true,
    });
    await prisma.userMockExamPermission.createMany({
      data: userIds.flatMap((userId) =>
        paperIds.map((paperId) => ({
          userId,
          paperId,
          manualAttemptLimit: null,
          manualAttemptUsed: 0,
          currentRecordStartedAt: null,
        })),
      ),
      skipDuplicates: true,
    });
  }

  if (questionBankBookIds.length > 0) {
    await prisma.userBookQuestionBankPermission.createMany({
      data: userIds.flatMap((userId) =>
        questionBankBookIds.map((bookId) => ({
          userId,
          bookId,
        })),
      ),
      skipDuplicates: true,
    });
  }
  await writeAdminAuditLog(req, {
    action: "batch_add_user_permissions",
    entityType: "user",
    entityName: "batch_permissions",
    detail: {
      userIds,
      userCount: userIds.length,
      courseIds,
      mockExamSeriesIds,
      questionBankBookIds,
    },
  });

  return ok(res, { success: true }, "批量加权限完成");
});


adminUsersRouter.patch("/users/:userId/password", async (req, res, next) => {
  try {
    const password = validatePasswordOrThrow(req.body?.password, "用户密码");
    await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        passwordHash: await hashPassword(password),
      },
    });
    await writeAdminAuditLog(req, {
      action: "reset_user_password",
      entityType: "user",
      entityId: req.params.userId,
      detail: { password: "***" },
    });

    return ok(res, { success: true }, "密码已修改");
  } catch (error) {
    return next(error);
  }
});

adminUsersRouter.patch("/users/:userId/status", async (req, res) => {
  const status = `${req.body?.status ?? ""}`.trim();
  if (status !== "active" && status !== "disabled") return fail(res, "用户状态不正确", 400);

  await prisma.user.update({
    where: { id: req.params.userId },
    data: { status },
  });
  await writeAdminAuditLog(req, {
    action: "update_user_status",
    entityType: "user",
    entityId: req.params.userId,
    detail: { status },
  });

  return ok(res, { success: true }, "状态已更新");
});

adminUsersRouter.post("/users/batch-status", async (req, res) => {
  const userIds = toStringArray(req.body?.userIds);
  const status = `${req.body?.status ?? ""}`.trim();
  if (userIds.length === 0) return fail(res, "请选择用户", 400);
  if (status !== "active" && status !== "disabled") return fail(res, "用户状态不正确", 400);

  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { status },
  });
  await writeAdminAuditLog(req, {
    action: "batch_update_user_status",
    entityType: "user",
    entityName: "batch_status",
    detail: { userIds, userCount: userIds.length, status },
  });

  return ok(res, { success: true }, "批量状态已更新");
});

adminUsersRouter.delete("/users/:userId", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { id: true, phone: true, nickname: true, status: true },
  });
  if (!user) return fail(res, "ç”¨æˆ·ä¸å­˜åœ¨", 404);

  await prisma.user.delete({
    where: { id: req.params.userId },
  });
  await writeAdminAuditLog(req, {
    action: "delete_user",
    entityType: "user",
    entityId: user.id,
    entityName: user.phone,
    detail: user,
  });

  return ok(res, { success: true }, "用户已删除");
});

adminUsersRouter.post("/users/batch-delete", async (req, res) => {
  const userIds = toStringArray(req.body?.userIds);
  if (userIds.length === 0) return fail(res, "请选择用户", 400);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, phone: true, nickname: true, status: true },
  });

  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
  await writeAdminAuditLog(req, {
    action: "batch_delete_users",
    entityType: "user",
    entityName: "batch_delete",
    detail: {
      userIds,
      requestedCount: userIds.length,
      deletedCount: users.length,
      users: users.slice(0, 20),
    },
  });

  return ok(res, { success: true }, "批量删除完成");
});

adminUsersRouter.get("/users/:userId/devices", async (req, res) => {
  const list = await prisma.userDevice.findMany({
    where: { userId: req.params.userId },
    orderBy: { loginAt: "desc" },
  });

  return ok(res, list.map(serializeDevice));
});

adminUsersRouter.delete("/devices/:deviceId", async (req, res) => {
  const device = await prisma.userDevice.findUnique({
    where: { id: req.params.deviceId },
    select: { id: true, userId: true, type: true, model: true, ip: true, loginAt: true },
  });
  if (!device) return fail(res, "设备不存在", 404);

  await prisma.userDevice.delete({
    where: { id: req.params.deviceId },
  });
  await writeAdminAuditLog(req, {
    action: "remove_user_device",
    entityType: "user_device",
    entityId: device.id,
    entityName: device.model,
    detail: device,
  });

  return ok(res, { success: true }, "设备已退出");
});

adminUsersRouter.delete("/users/:userId/devices", async (req, res) => {
  const devices = await prisma.userDevice.findMany({
    where: { userId: req.params.userId },
    select: { id: true, type: true, model: true, ip: true, loginAt: true },
  });
  await prisma.userDevice.deleteMany({
    where: { userId: req.params.userId },
  });
  await writeAdminAuditLog(req, {
    action: "clear_user_devices",
    entityType: "user",
    entityId: req.params.userId,
    detail: { deviceCount: devices.length, devices: devices.slice(0, 20) },
  });

  return ok(res, { success: true }, "设备已清空");
});

adminUsersRouter.post("/users/:userId/mock-exam-permissions/:paperId/reset-attempts", async (req, res) => {
  const { userId, paperId } = req.params;
  const paper = await prisma.mockExamPaper.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      title: true,
      maxAttempts: true,
    },
  });

  if (!paper) return fail(res, "试卷不存在", 404);

  const permission = await prisma.userMockExamPermission.findUnique({
    where: {
      userId_paperId: {
        userId,
        paperId,
      },
    },
  });

  if (!permission) {
    const participated = await prisma.mockExamRecord.findFirst({
      where: {
        userId,
        paperId,
      },
      select: {
        id: true,
      },
    });
    if (!participated) return fail(res, "该用户还没有这张试卷的考试记录", 404);

    const created = await prisma.userMockExamPermission.create({
      data: {
        userId,
        paperId,
        manualAttemptLimit: Number(paper.maxAttempts ?? 0) > 0 ? Number(paper.maxAttempts) : null,
        manualAttemptUsed: 0,
        currentRecordStartedAt: null,
      },
    });
    await writeAdminAuditLog(req, {
      action: "reset_mock_exam_attempts",
      entityType: "user_mock_exam_permission",
      entityId: `${userId}:${paperId}`,
      entityName: paper.title,
      detail: {
        userId,
        paperId,
        paperTitle: paper.title,
        previous: null,
        next: {
          manualAttemptLimit: created.manualAttemptLimit ?? null,
          manualAttemptUsed: Number(created.manualAttemptUsed ?? 0),
        },
      },
    });

    return ok(
      res,
      {
        paperId,
        manualAttemptLimit: created.manualAttemptLimit ?? null,
        manualAttemptUsed: Number(created.manualAttemptUsed ?? 0),
      },
      "考试次数已重置",
    );
  }

  const updated = await prisma.userMockExamPermission.update({
    where: {
      userId_paperId: {
        userId,
        paperId,
      },
    },
    data: {
      manualAttemptUsed: 0,
      manualAttemptLimit: Number(paper.maxAttempts ?? 0) > 0 ? Number(paper.maxAttempts) : null,
    },
  });
  await writeAdminAuditLog(req, {
    action: "reset_mock_exam_attempts",
    entityType: "user_mock_exam_permission",
    entityId: `${userId}:${paperId}`,
    entityName: paper.title,
    detail: {
      userId,
      paperId,
      paperTitle: paper.title,
      previous: {
        manualAttemptLimit: permission.manualAttemptLimit ?? null,
        manualAttemptUsed: Number(permission.manualAttemptUsed ?? 0),
      },
      next: {
        manualAttemptLimit: updated.manualAttemptLimit ?? null,
        manualAttemptUsed: Number(updated.manualAttemptUsed ?? 0),
      },
    },
  });

  return ok(
    res,
    {
      paperId,
      manualAttemptLimit: updated.manualAttemptLimit ?? null,
      manualAttemptUsed: Number(updated.manualAttemptUsed ?? 0),
    },
    "考试次数已重置",
  );
});

adminUsersRouter.post("/users/:userId/mock-exam-permissions/:paperId/reset-time", async (req, res) => {
  const { userId, paperId } = req.params;
  const currentTime = new Date();
  const activeRecord = await prisma.mockExamRecord.findFirst({
    where: {
      userId,
      paperId,
      status: "in_progress",
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
    },
  });

  if (!activeRecord) return fail(res, "当前没有可重置时间的进行中考试", 400);

  await prisma.mockExamRecord.update({
    where: {
      id: activeRecord.id,
    },
    data: {
      consumedSeconds: 0,
      startedAt: currentTime,
      isPaused: false,
    },
  });

  await prisma.userMockExamPermission.updateMany({
    where: {
      userId,
      paperId,
    },
    data: {
      currentRecordStartedAt: currentTime,
    },
  });
  await writeAdminAuditLog(req, {
    action: "reset_mock_exam_time",
    entityType: "mock_exam_record",
    entityId: activeRecord.id,
    detail: {
      userId,
      paperId,
      recordId: activeRecord.id,
      currentRecordStartedAt: formatDateTime(currentTime),
    },
  });

  return ok(
    res,
    {
      paperId,
      recordId: activeRecord.id,
      currentRecordStartedAt: formatDateTime(currentTime),
    },
    "考试时间已重置",
  );
});
