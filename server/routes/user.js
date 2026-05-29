import { Router } from "express";
import { Readable } from "node:stream";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { serializeAudio, serializeTag, serializeVideo } from "../lib/serializers.js";
import { formatDateTime } from "../lib/time.js";
import { requireUserAuth } from "../middleware/auth.js";
import { mockExamRouter } from "./mock-exams.js";
import { getRecentMockExamForUser } from "../lib/mock-exams.js";
import {
  buildAudioProgressMap,
  buildAudioTagContent,
  buildVideoProgressMap,
  buildVideoTagContent,
  getOrderedCourseAudios,
  getOrderedCourseVideos,
  readyAudioRelationWhere,
  serializeAudioProgress,
  serializeAudioWithProgress,
  serializeCourseWithCounts,
  serializeVideoProgress,
  serializeVideoWithProgress,
  summarizeAudioCourseProgress,
  summarizeVideoCourseProgress,
} from "../lib/course-content.js";
import { normalizeCourseQuestionBankLinks } from "../../src/shared/portal-config.js";

export const userRouter = Router();

userRouter.use(requireUserAuth);
userRouter.use("/mock-exams", mockExamRouter);

const isUniqueConstraintError = (error) => error && typeof error === "object" && error.code === "P2002";

const saveUserProgressRecord = async ({ userId, courseId, audioId, updateData, createData }) => {
  const where = { userId, courseId, audioId };
  const updated = await prisma.userProgress.updateMany({ where, data: updateData });

  if (updated.count === 0) {
    try {
      return await prisma.userProgress.create({
        data: {
          userId,
          courseId,
          audioId,
          ...createData,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      await prisma.userProgress.updateMany({ where, data: updateData });
    }
  }

  return prisma.userProgress.findUnique({
    where: {
      userId_courseId_audioId: where,
    },
  });
};

const saveUserVideoProgressRecord = async ({ userId, courseId, videoId, updateData, createData }) => {
  const where = { userId, courseId, videoId };
  const updated = await prisma.userVideoProgress.updateMany({ where, data: updateData });

  if (updated.count === 0) {
    try {
      return await prisma.userVideoProgress.create({
        data: {
          userId,
          courseId,
          videoId,
          ...createData,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      await prisma.userVideoProgress.updateMany({ where, data: updateData });
    }
  }

  return prisma.userVideoProgress.findUnique({
    where: {
      userId_courseId_videoId: where,
    },
  });
};

const sanitizeDownloadFileName = (value, fallback = "course-handout") => {
  const normalized = `${value ?? ""}`.trim().replace(/[\\/:*?"<>|]+/g, "-");
  return normalized || fallback;
};

const encodeContentDispositionFileName = (fileName) =>
  encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const buildAttachmentDisposition = (fileName) => {
  const normalized = sanitizeDownloadFileName(fileName);
  const asciiFallback = normalized.replace(/[^\x20-\x7E]+/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeContentDispositionFileName(normalized)}`;
};

const parseNonNegativeProgress = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.floor(numeric));
};

const clampProgressToDuration = (progress, duration) => {
  const durationSeconds = Math.max(0, Number(duration ?? 0));
  if (durationSeconds <= 0) return progress;
  return Math.min(progress, durationSeconds);
};

const mergeLearningProgress = (existingRecord, nextProgress, duration) => {
  const durationSeconds = Math.max(0, Number(duration ?? 0));
  const existingProgress = Math.max(0, Number(existingRecord?.progress ?? 0));
  if (existingRecord?.completed && durationSeconds > 0) return durationSeconds;
  return clampProgressToDuration(Math.max(existingProgress, nextProgress), duration);
};

const getCompletedLearningProgress = (existingRecord, nextProgress, duration) => {
  const durationSeconds = Math.max(0, Number(duration ?? 0));
  if (durationSeconds > 0) return durationSeconds;
  return Math.max(0, Number(existingRecord?.progress ?? 0), nextProgress ?? 0);
};

const statusForCourseAccessError = (error, fallback = 404) => {
  const message = `${error?.message ?? ""}`;
  if (message.includes("无权")) return 403;
  if (message.includes("尚未开放")) return 403;
  return fallback;
};

const buildCourseProgressSummary = ({ course, audioProgressByCourseId, videoProgressByCourseId }) =>
  (course.courseType ?? "audio") === "video"
    ? summarizeVideoCourseProgress({
        courseVideos: course.courseVideos ?? [],
        progressList: videoProgressByCourseId.get(course.id) ?? [],
      })
    : summarizeAudioCourseProgress({
        courseAudios: course.courseAudios ?? [],
        progressList: audioProgressByCourseId.get(course.id) ?? [],
      });

const addProgressSummaryToCourse = ({ course, audioProgressByCourseId, videoProgressByCourseId }) => ({
  ...serializeCourseWithCounts(course),
  progressSummary: buildCourseProgressSummary({
    course,
    audioProgressByCourseId,
    videoProgressByCourseId,
  }),
});

const groupByCourseId = (items = []) => {
  const map = new Map();
  for (const item of items) {
    const list = map.get(item.courseId) ?? [];
    list.push(item);
    map.set(item.courseId, list);
  }
  return map;
};

const getLatestProgressItem = (progressList = []) =>
  progressList.reduce((latest, item) => {
    if (!latest) return item;
    return new Date(item.lastUpdated).getTime() > new Date(latest.lastUpdated).getTime() ? item : latest;
  }, null);

const getDateRange = (days) => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

const formatRelativeDateTime = (date) => {
  if (!date) return "";
  const current = new Date(date);
  if (!Number.isFinite(current.getTime())) return "";
  const diffMs = Date.now() - current.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs >= 0 && diffMs < minute) return "刚刚";
  if (diffMs >= 0 && diffMs < hour) return `${Math.floor(diffMs / minute)}分钟前`;
  if (diffMs >= 0 && diffMs < day) return `${Math.floor(diffMs / hour)}小时前`;
  if (diffMs >= 0 && diffMs < day * 7) return `${Math.floor(diffMs / day)}天前`;
  return formatDateTime(current);
};

const toAmountNumber = (value) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getShopOrderStatusLabel = (status) => {
  const labels = {
    pending_payment: "待支付",
    paid: "已支付",
    partially_fulfilled: "部分交付",
    completed: "已完成",
    cancelled: "已取消",
    refunding: "退款中",
    refunded: "已退款",
  };
  return labels[status] ?? status ?? "-";
};

const normalizeCourseNoteMediaType = (value) => {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  return normalized === "video" ? "video" : "audio";
};

const serializeCourseNote = (note) => ({
  id: note.id,
  courseId: note.courseId,
  courseName: note.course?.name ?? "",
  mediaType: note.mediaType,
  mediaId: note.mediaId,
  mediaName:
    note.mediaType === "video"
      ? note.course?.courseVideos?.find((item) => item.videoId === note.mediaId)?.video?.name ?? ""
      : note.course?.courseAudios?.find((item) => item.audioId === note.mediaId)?.audio?.name ?? "",
  content: note.content ?? "",
  createdAt: formatDateTime(note.createdAt),
  updatedAt: formatDateTime(note.updatedAt),
});

const buildUserStudySummary = async (userId) => {
  const weekRange = getDateRange(7);
  const heatmapRange = getDateRange(35);
  const [
    audioProgress,
    videoProgress,
    questionStates,
    mockRecords,
    typingSummary,
    explicitQuestionBankPermissions,
    activeUserCount,
    recentOrders,
  ] = await Promise.all([
    prisma.userProgress.findMany({ where: { userId } }),
    prisma.userVideoProgress.findMany({ where: { userId } }),
    prisma.userBookQuestionBankItemState.findMany({
      where: { userId },
      select: {
        id: true,
        answerJson: true,
        draftText: true,
        isAnswered: true,
        hasViewedAnswer: true,
        isMastered: true,
        isRedoMarked: true,
        answeredAt: true,
        viewedAnswerAt: true,
        updatedAt: true,
        book: {
          select: {
            name: true,
          },
        },
        bookItem: {
          select: {
            type: true,
            subject: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.mockExamRecord.findMany({
      where: { userId },
      include: {
        paper: {
          select: {
            title: true,
            paperType: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.typingPracticeRecord.aggregate({
      where: { userId },
      _count: { _all: true },
      _avg: {
        accuracyRate: true,
        cpm: true,
      },
      _max: {
        cpm: true,
        score: true,
      },
      _sum: {
        typedLength: true,
      },
    }),
    prisma.userBookQuestionBankPermission.findMany({
      where: {
        userId,
        book: {
          accessType: "authorized",
          status: "published",
          isVisible: true,
        },
      },
      select: { bookId: true },
    }),
    prisma.user.count({ where: { status: "active" } }),
    prisma.shopOrder.findMany({
      where: { userId },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    }),
  ]);

  const courseProgressItems = [
    ...audioProgress.map((item) => ({ ...item, kind: "audio" })),
    ...videoProgress.map((item) => ({ ...item, kind: "video" })),
  ];
  const learnedSeconds = courseProgressItems.reduce((sum, item) => sum + Math.max(0, Number(item.progress ?? 0)), 0);
  const explicitQuestionBankIds = new Set(explicitQuestionBankPermissions.map((permission) => permission.bookId));
  const linkedQuestionBankIds = await getCourseLinkedQuestionBankBookIds(userId);
  const linkedQuestionBankIdList = [...linkedQuestionBankIds].filter((bookId) => !explicitQuestionBankIds.has(bookId));
  const linkedQuestionBanks =
    linkedQuestionBankIdList.length === 0
      ? []
      : await prisma.bookQuestionBank.findMany({
          where: {
            id: { in: linkedQuestionBankIdList },
            accessType: "authorized",
            status: "published",
            isVisible: true,
          },
          select: { id: true },
        });
  const questionBankCount = new Set([...explicitQuestionBankIds, ...linkedQuestionBanks.map((book) => book.id)]).size;
  const [audioProgressByLearner, videoProgressByLearner] = await Promise.all([
    prisma.userProgress.groupBy({
      by: ["userId"],
      _sum: { progress: true },
    }),
    prisma.userVideoProgress.groupBy({
      by: ["userId"],
      _sum: { progress: true },
    }),
  ]);
  const learnedSecondsByUser = new Map();
  for (const item of [...audioProgressByLearner, ...videoProgressByLearner]) {
    learnedSecondsByUser.set(item.userId, (learnedSecondsByUser.get(item.userId) ?? 0) + Math.max(0, Number(item._sum?.progress ?? 0)));
  }
  if (!learnedSecondsByUser.has(userId)) learnedSecondsByUser.set(userId, learnedSeconds);
  const totalLearnerCount = Math.max(activeUserCount, learnedSecondsByUser.size);
  const lowerProgressLearnerCount = [...learnedSecondsByUser.entries()].filter(([otherUserId, seconds]) => otherUserId !== userId && seconds < learnedSeconds).length;
  const zeroProgressLearnerCount = learnedSeconds > 0 ? Math.max(totalLearnerCount - learnedSecondsByUser.size, 0) : 0;
  const lowerLearnerCount = lowerProgressLearnerCount + zeroProgressLearnerCount;
  const learningHoursBeatPercent = totalLearnerCount > 0 ? Math.round((lowerLearnerCount / totalLearnerCount) * 100) : 0;
  const weekLearnedSeconds = courseProgressItems
    .filter((item) => new Date(item.lastUpdated).getTime() >= weekRange.start.getTime())
    .reduce((sum, item) => sum + Math.max(0, Number(item.progress ?? 0)), 0);
  const completedCourseContentCount = courseProgressItems.filter((item) => item.completed).length;

  const answeredStates = questionStates.filter((state) => state.isAnswered);
  const correctStates = answeredStates.filter((state) => answerStateFromJson(state.answerJson).isCorrect === true);
  const wrongStates = questionStates.filter((state) => isBookQuestionStateWrong(state));
  const bookmarkedStates = questionStates.filter((state) => questionBankMetaFromDraft(state.draftText).bookmarked === true);

  const submittedMockRecords = mockRecords.filter((record) => record.status === "submitted");
  const completedObjectiveRecords = submittedMockRecords.filter((record) => record.paper?.paperType === "objective");
  const completedSubjectiveRecords = submittedMockRecords.filter((record) => record.paper?.paperType === "subjective");

  const activityCandidates = [
    ...questionStates.map((state) => ({
      type: "question_bank",
      title: state.isAnswered
        ? `完成${state.bookItem?.subject?.name || state.book?.name || "题库"}练习`
        : `查看${state.bookItem?.subject?.name || state.book?.name || "题库"}解析`,
      detail: state.isAnswered
        ? answerStateFromJson(state.answerJson).isCorrect === false
          ? "结果：需复习"
          : "结果：已作答"
        : "已查看参考解析",
      occurredAt: state.answeredAt ?? state.viewedAnswerAt ?? state.updatedAt,
    })),
    ...courseProgressItems.map((item) => ({
      type: "course",
      title: item.kind === "video" ? "更新视频课程学习进度" : "更新音频课程学习进度",
      detail: item.completed ? "已完成本节" : `学习到 ${Math.floor(Number(item.progress ?? 0) / 60)} 分钟`,
      occurredAt: item.lastUpdated,
    })),
    ...mockRecords.map((record) => ({
      type: record.paper?.paperType === "subjective" ? "subjective_exam" : "objective_exam",
      title: record.status === "submitted" ? `提交${record.paper?.title || "考试"}` : `开始${record.paper?.title || "考试"}`,
      detail:
        record.status === "submitted"
          ? `得分 ${Number(record.totalScore ?? 0)} / 作答 ${Number(record.answeredCount ?? 0)}/${Number(record.questionCount ?? 0)}`
          : `已作答 ${Number(record.answeredCount ?? 0)}/${Number(record.questionCount ?? 0)}`,
      occurredAt: record.submittedAt ?? record.startedAt ?? record.updatedAt,
    })),
  ]
    .filter((item) => item.occurredAt)
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, 8)
    .map((item, index) => ({
      id: `${item.type}-${index}`,
      type: item.type,
      title: item.title,
      detail: item.detail,
      occurredAt: formatDateTime(item.occurredAt),
      relativeTime: formatRelativeDateTime(item.occurredAt),
    }));

  const heatmapDays = [];
  for (let index = 0; index < 35; index += 1) {
    const day = new Date(heatmapRange.start);
    day.setDate(heatmapRange.start.getDate() + index);
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const count = questionStates.filter((state) => {
      const occurredAt = state.answeredAt ?? state.viewedAnswerAt ?? state.updatedAt;
      const timestamp = occurredAt ? new Date(occurredAt).getTime() : 0;
      return timestamp >= dayStart.getTime() && timestamp <= dayEnd.getTime();
    }).length;
    heatmapDays.push({
      date: formatDateTime(day).slice(0, 10),
      count,
    });
  }

  return {
    stats: {
      totalPracticeCount: answeredStates.length,
      correctPracticeCount: correctStates.length,
      accuracyRate: answeredStates.length > 0 ? Math.round((correctStates.length / answeredStates.length) * 1000) / 10 : null,
      learnedSeconds,
      learnedHours: Math.round((learnedSeconds / 3600) * 10) / 10,
      learningHoursBeatPercent,
      weekLearnedSeconds,
      weekLearnedHours: Math.round((weekLearnedSeconds / 3600) * 10) / 10,
      completedCourseContentCount,
      activeCourseProgressCount: courseProgressItems.length,
      wrongCount: wrongStates.length,
      bookmarkedCount: bookmarkedStates.length,
      authorizedQuestionBankCount: questionBankCount,
      mockExamRecordCount: mockRecords.length,
      completedObjectiveExamCount: completedObjectiveRecords.length,
      completedSubjectiveExamCount: completedSubjectiveRecords.length,
      typingPracticeCount: Number(typingSummary._count?._all ?? 0),
      typingAvgAccuracyRate: typingSummary._avg?.accuracyRate === null ? null : Math.round(Number(typingSummary._avg?.accuracyRate ?? 0) * 10) / 10,
      typingAvgCpm: typingSummary._avg?.cpm === null ? 0 : Math.round(Number(typingSummary._avg?.cpm ?? 0)),
      typingBestCpm: Number(typingSummary._max?.cpm ?? 0),
      typingBestScore: Number(typingSummary._max?.score ?? 0),
      typingTotalTypedLength: Number(typingSummary._sum?.typedLength ?? 0),
      orderCount: recentOrders.length,
    },
    weekData: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(weekRange.start);
      day.setDate(weekRange.start.getDate() + index);
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      const seconds = courseProgressItems
        .filter((item) => {
          const timestamp = new Date(item.lastUpdated).getTime();
          return timestamp >= dayStart.getTime() && timestamp <= dayEnd.getTime();
        })
        .reduce((sum, item) => sum + Math.max(0, Number(item.progress ?? 0)), 0);
      return {
        day: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][day.getDay()],
        date: formatDateTime(day).slice(0, 10),
        seconds,
        hours: Math.round((seconds / 3600) * 10) / 10,
      };
    }),
    heatmapDays,
    recentActivity: activityCandidates,
    orders: recentOrders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      name: order.items?.[0]?.productNameSnapshot ?? "得宝订单",
      type: order.items?.map((item) => item.productTypeSnapshot).filter(Boolean).join(" / ") || "订单",
      amount: toAmountNumber(order.payAmount),
      totalAmount: toAmountNumber(order.totalAmount),
      status: order.status,
      statusLabel: getShopOrderStatusLabel(order.status),
      paymentStatus: order.paymentStatus,
      paidAt: order.paidAt ? formatDateTime(order.paidAt) : "",
      createdAt: formatDateTime(order.createdAt),
      itemCount: order.items?.length ?? 0,
    })),
  };
};

const assertCoursePermission = async (userId, courseId) => {
  const permission = await prisma.userCoursePermission.findFirst({
    where: {
      userId,
      courseId,
    },
    include: {
      course: {
        include: {
          tags: {
            orderBy: { order: "asc" },
          },
          courseAudios: {
            where: readyAudioRelationWhere,
            include: {
              audio: {
                select: {
                  duration: true,
                },
              },
            },
          },
          courseVideos: {
            include: {
              video: {
                select: {
                  duration: true,
                },
              },
            },
          },
          _count: {
            select: {
              courseAudios: true,
              courseVideos: true,
            },
          },
        },
      },
    },
  });

  if (!permission) {
    throw new Error("无权访问该课程");
  }

  if (permission.course.status !== "open") {
    throw new Error("课程尚未开放");
  }

  return permission.course;
};

const getTagAudiosWithProgress = async ({ tagId, userId, courseId, courseAudios }) => {
  const resolvedCourseAudios =
    courseAudios ??
    (
      await prisma.tag.findUnique({
        where: { id: tagId },
        include: {
          courseAudios: {
            where: readyAudioRelationWhere,
            orderBy: { order: "asc" },
            include: {
              audio: true,
            },
          },
        },
      })
    )?.courseAudios;

  if (!resolvedCourseAudios) return null;

  const audioIds = resolvedCourseAudios.map((item) => item.audioId);
  const progressList =
    audioIds.length === 0
      ? []
      : await prisma.userProgress.findMany({
          where: {
            userId,
            courseId,
            audioId: { in: audioIds },
          },
        });

  return buildAudioTagContent(resolvedCourseAudios, buildAudioProgressMap(progressList));
};

const getTagVideosWithProgress = async ({ tagId, userId, courseId, courseVideos }) => {
  const resolvedCourseVideos =
    courseVideos ??
    (
      await prisma.tag.findUnique({
        where: { id: tagId },
        include: {
          courseVideos: {
            orderBy: { order: "asc" },
            include: {
              video: true,
            },
          },
        },
      })
    )?.courseVideos;

  if (!resolvedCourseVideos) return null;

  const videoIds = resolvedCourseVideos.map((item) => item.videoId);
  const progressList =
    videoIds.length === 0
      ? []
      : await prisma.userVideoProgress.findMany({
          where: {
            userId,
            courseId,
            videoId: { in: videoIds },
          },
        });

  return buildVideoTagContent(resolvedCourseVideos, buildVideoProgressMap(progressList));
};

userRouter.get("/courses", async (req, res) => {
  const permissions = await prisma.userCoursePermission.findMany({
    where: { userId: req.auth.userId },
    include: {
      course: {
        include: {
          courseAudios: {
            where: readyAudioRelationWhere,
          },
          courseVideos: true,
          _count: {
            select: {
              courseAudios: true,
              courseVideos: true,
            },
          },
        },
      },
    },
    orderBy: {
      course: {
        openTime: "desc",
      },
    },
  });

  const courses = permissions
    .map((item) => item.course)
    .filter((course) => course.status === "open")
    .sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());

  const courseIds = courses.map((course) => course.id);
  const audioProgressList =
    courseIds.length === 0
      ? []
      : await prisma.userProgress.findMany({
          where: {
            userId: req.auth.userId,
            courseId: { in: courseIds },
          },
        });
  const videoProgressList =
    courseIds.length === 0
      ? []
      : await prisma.userVideoProgress.findMany({
          where: {
            userId: req.auth.userId,
            courseId: { in: courseIds },
          },
        });
  const audioProgressByCourseId = groupByCourseId(audioProgressList);
  const videoProgressByCourseId = groupByCourseId(videoProgressList);
  const list = courses.map((course) =>
    addProgressSummaryToCourse({
      course,
      audioProgressByCourseId,
      videoProgressByCourseId,
    }),
  );

  return ok(res, list);
});

userRouter.get("/course-notes", async (req, res) => {
  const notes = await prisma.userCourseNote.findMany({
    where: { userId: req.auth.userId },
    include: {
      course: {
        include: {
          courseAudios: {
            include: { audio: true },
          },
          courseVideos: {
            include: { video: true },
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });

  return ok(res, notes.map(serializeCourseNote));
});

userRouter.get("/courses/:courseId/notes/:mediaType/:mediaId", async (req, res) => {
  const mediaType = normalizeCourseNoteMediaType(req.params.mediaType);
  const mediaId = `${req.params.mediaId ?? ""}`.trim();
  if (!mediaId) return fail(res, "缺少课时参数", 400);

  try {
    const course = await assertCoursePermission(req.auth.userId, req.params.courseId);
    const relation =
      mediaType === "video"
        ? await prisma.courseVideo.findFirst({ where: { courseId: course.id, videoId: mediaId } })
        : await prisma.courseAudio.findFirst({ where: { courseId: course.id, audioId: mediaId, ...readyAudioRelationWhere } });
    if (!relation) return fail(res, "课程课时不存在", 404);

    const note = await prisma.userCourseNote.findUnique({
      where: {
        userId_courseId_mediaType_mediaId: {
          userId: req.auth.userId,
          courseId: course.id,
          mediaType,
          mediaId,
        },
      },
      include: {
        course: {
          include: {
            courseAudios: { include: { audio: true } },
            courseVideos: { include: { video: true } },
          },
        },
      },
    });

    return ok(res, note ? serializeCourseNote(note) : null);
  } catch (error) {
    return fail(res, error.message || "课程笔记加载失败", statusForCourseAccessError(error, 500));
  }
});

userRouter.put("/courses/:courseId/notes/:mediaType/:mediaId", async (req, res) => {
  const mediaType = normalizeCourseNoteMediaType(req.params.mediaType);
  const mediaId = `${req.params.mediaId ?? ""}`.trim();
  const content = `${req.body?.content ?? ""}`.trim();
  if (!mediaId) return fail(res, "缺少课时参数", 400);
  if (content.length > 20000) return fail(res, "笔记内容过长", 400);

  try {
    const course = await assertCoursePermission(req.auth.userId, req.params.courseId);
    const relation =
      mediaType === "video"
        ? await prisma.courseVideo.findFirst({ where: { courseId: course.id, videoId: mediaId } })
        : await prisma.courseAudio.findFirst({ where: { courseId: course.id, audioId: mediaId, ...readyAudioRelationWhere } });
    if (!relation) return fail(res, "课程课时不存在", 404);

    const saved = await prisma.userCourseNote.upsert({
      where: {
        userId_courseId_mediaType_mediaId: {
          userId: req.auth.userId,
          courseId: course.id,
          mediaType,
          mediaId,
        },
      },
      update: { content },
      create: {
        userId: req.auth.userId,
        courseId: course.id,
        mediaType,
        mediaId,
        content,
      },
      include: {
        course: {
          include: {
            courseAudios: { include: { audio: true } },
            courseVideos: { include: { video: true } },
          },
        },
      },
    });

    return ok(res, serializeCourseNote(saved), "学习笔记已保存");
  } catch (error) {
    return fail(res, error.message || "学习笔记保存失败", statusForCourseAccessError(error, 500));
  }
});

userRouter.get("/home-overview", async (req, res) => {
  const userId = req.auth.userId;
  const recentProgress = await prisma.userProgress.findFirst({
    where: {
      userId,
    },
    orderBy: {
      lastUpdated: "desc",
    },
    include: {
      audio: true,
    },
  });
  const recentVideoProgress = await prisma.userVideoProgress.findFirst({
    where: {
      userId,
    },
    orderBy: {
      lastUpdated: "desc",
    },
    include: {
      video: true,
    },
  });

  let recentCourseProgress = null;
  if (recentProgress?.audio || recentVideoProgress?.video) {
    const useVideo =
      recentVideoProgress?.video &&
      (!recentProgress?.audio || new Date(recentVideoProgress.lastUpdated).getTime() > new Date(recentProgress.lastUpdated).getTime());
    const targetProgress = useVideo ? recentVideoProgress : recentProgress;
    const targetMedia = useVideo ? recentVideoProgress.video : recentProgress.audio;
    const targetMediaId = useVideo ? recentVideoProgress.videoId : recentProgress.audioId;
    const course = await prisma.course.findFirst({
      where: {
        id: targetProgress.courseId,
      },
      include: {
        permissions: {
          where: {
            userId,
          },
        },
        tags: {
          orderBy: {
            order: "asc",
          },
        },
        ...(useVideo
          ? {
              courseVideos: {
                where: {
                  videoId: targetMediaId,
                },
                include: {
                  tag: true,
                },
                take: 1,
              },
            }
          : {
              courseAudios: {
                where: {
                  audioId: targetMediaId,
                },
                include: {
                  tag: true,
                },
                take: 1,
              },
            }),
      },
    });

    if (course?.status === "open" && (course.permissions?.length ?? 0) > 0) {
      const relation = useVideo ? course.courseVideos?.[0] : course.courseAudios?.[0];
      const tagName = relation?.tag?.name ?? course.tags[0]?.name ?? "";
      const durationSeconds = Math.max(0, Number(targetMedia.duration ?? 0));
      const progressSeconds = Math.max(0, Number(targetProgress.progress ?? 0));

      recentCourseProgress = {
        courseId: course.id,
        courseName: course.name,
        courseType: course.courseType ?? "audio",
        mediaType: useVideo ? "video" : "audio",
        mediaId: targetMediaId,
        audioId: useVideo ? null : targetMediaId,
        videoId: useVideo ? targetMediaId : null,
        mediaName: targetMedia.name,
        audioName: useVideo ? "" : targetMedia.name,
        videoName: useVideo ? targetMedia.name : "",
        tagName,
        progressSeconds,
        durationSeconds,
        progressPercent: durationSeconds > 0 ? Math.min(100, Math.round((progressSeconds / durationSeconds) * 100)) : 0,
        completed: Boolean(targetProgress.completed),
        lastUpdated: formatDateTime(targetProgress.lastUpdated),
      };
    }
  }

  let recentMockExam = null;
  try {
    recentMockExam = await getRecentMockExamForUser({ db: prisma, userId });
  } catch (error) {
    console.warn("[home-overview] failed to load recent mock exam:", error);
  }

  return ok(res, {
    recentCourseProgress,
    recentMockExam,
  });
});

userRouter.get("/study-summary", async (req, res) => {
  try {
    const summary = await buildUserStudySummary(req.auth.userId);
    return ok(res, summary);
  } catch (error) {
    console.error("[study-summary] failed to load user summary:", error);
    return fail(res, error.message || "学习数据加载失败", 500);
  }
});

userRouter.get("/courses/:courseId/detail", async (req, res) => {
  try {
    const course = await assertCoursePermission(req.auth.userId, req.params.courseId);
    const tags = course.tags ?? [];
    const selectedTagId = tags[0]?.id ?? "";

    if ((course.courseType ?? "audio") === "video") {
      const tagDetails =
        tags.length === 0
          ? []
          : await prisma.tag.findMany({
              where: { courseId: course.id },
              orderBy: { order: "asc" },
              include: {
                courseVideos: {
                  orderBy: { order: "asc" },
                  include: {
                    video: true,
                  },
                },
              },
            });

      const videoIds = tagDetails.flatMap((tag) => tag.courseVideos.map((item) => item.videoId));
      const progressList =
        videoIds.length === 0
          ? []
          : await prisma.userVideoProgress.findMany({
              where: {
                userId: req.auth.userId,
                courseId: course.id,
                videoId: { in: videoIds },
              },
            });
      const progressMap = buildVideoProgressMap(progressList);
      const rawProgressMap = new Map(progressList.map((item) => [item.videoId, item]));

      const tagContents = tagDetails.map((tag) => ({
        tagId: tag.id,
        ...buildVideoTagContent(tag.courseVideos, progressMap),
      }));
      const initialTagContent = tagContents.find((item) => item.tagId === selectedTagId) ?? null;
      const progressSummary = summarizeVideoCourseProgress({
        courseVideos: tagDetails.flatMap((tag) => tag.courseVideos),
        progressList,
      });
      const playableRelations = tagDetails.flatMap((tag) => tag.courseVideos);
      const latestProgress = getLatestProgressItem(progressList);
      const resumeRelation =
        playableRelations.find((item) => item.videoId === latestProgress?.videoId) ?? playableRelations[0] ?? null;

      return ok(res, {
        course: {
          ...serializeCourseWithCounts(course),
          progressSummary,
        },
        tags: tags.map(serializeTag),
        selectedTagId,
        tagContents,
        initialVideos: initialTagContent?.videos ?? [],
        initialVideoProgress: initialTagContent?.progress ?? [],
        progressSummary,
        resumeTarget: resumeRelation
          ? {
              type: "video",
              courseId: course.id,
              tagId: resumeRelation.tagId,
              videoId: resumeRelation.videoId,
              progress: serializeVideoProgress(rawProgressMap.get(resumeRelation.videoId)) ?? null,
            }
          : null,
      });
    }

    const tagDetails =
      tags.length === 0
        ? []
        : await prisma.tag.findMany({
            where: { courseId: course.id },
            orderBy: { order: "asc" },
            include: {
              courseAudios: {
                where: readyAudioRelationWhere,
                orderBy: { order: "asc" },
                include: {
                  audio: true,
                },
              },
            },
          });

    const audioIds = tagDetails.flatMap((tag) => tag.courseAudios.map((item) => item.audioId));
    const progressList =
      audioIds.length === 0
        ? []
        : await prisma.userProgress.findMany({
            where: {
              userId: req.auth.userId,
              courseId: course.id,
              audioId: { in: audioIds },
            },
          });
    const progressMap = buildAudioProgressMap(progressList);
    const rawProgressMap = new Map(progressList.map((item) => [item.audioId, item]));

    const tagContents = tagDetails.map((tag) => ({
      tagId: tag.id,
      ...buildAudioTagContent(tag.courseAudios, progressMap),
    }));
    const initialTagContent = tagContents.find((item) => item.tagId === selectedTagId) ?? null;
    const progressSummary = summarizeAudioCourseProgress({
      courseAudios: tagDetails.flatMap((tag) => tag.courseAudios),
      progressList,
    });
    const playableRelations = tagDetails.flatMap((tag) => tag.courseAudios);
    const latestProgress = getLatestProgressItem(progressList);
    const resumeRelation =
      playableRelations.find((item) => item.audioId === latestProgress?.audioId) ?? playableRelations[0] ?? null;

    return ok(res, {
      course: {
        ...serializeCourseWithCounts(course),
        progressSummary,
      },
      tags: tags.map(serializeTag),
      selectedTagId,
      tagContents,
      initialAudios: initialTagContent?.audios ?? [],
      initialProgress: initialTagContent?.progress ?? [],
      progressSummary,
      resumeTarget: resumeRelation
        ? {
            type: "audio",
            courseId: course.id,
            tagId: resumeRelation.tagId,
            audioId: resumeRelation.audioId,
            progress: serializeAudioProgress(rawProgressMap.get(resumeRelation.audioId)) ?? null,
          }
        : null,
    });
  } catch (error) {
    return fail(res, error.message || "课程不存在", statusForCourseAccessError(error, 404));
  }
});

userRouter.get("/tags/:tagId/audios", async (req, res) => {
  const tag = await prisma.tag.findUnique({
    where: { id: req.params.tagId },
    include: {
      course: {
        include: {
          permissions: true,
        },
      },
      courseAudios: {
        where: readyAudioRelationWhere,
        orderBy: { order: "asc" },
        include: {
          audio: true,
        },
      },
    },
  });

  if (!tag) return fail(res, "标签不存在", 404);

  const hasPermission = tag.course.permissions.some((item) => item.userId === req.auth.userId);
  if (!hasPermission || tag.course.status !== "open") {
    return fail(res, "无权访问该标签内容", 403);
  }

  const payload = await getTagAudiosWithProgress({
    tagId: tag.id,
    userId: req.auth.userId,
    courseId: tag.courseId,
    courseAudios: tag.courseAudios,
  });

  return ok(res, {
    audios: payload?.audios ?? [],
    progress: payload?.progress ?? [],
  });
});

userRouter.get("/tags/:tagId/videos", async (req, res) => {
  const tag = await prisma.tag.findUnique({
    where: { id: req.params.tagId },
    include: {
      course: {
        include: {
          permissions: true,
        },
      },
      courseVideos: {
        orderBy: { order: "asc" },
        include: {
          video: true,
        },
      },
    },
  });

  if (!tag) return fail(res, "标签不存在", 404);

  const hasPermission = tag.course.permissions.some((item) => item.userId === req.auth.userId);
  if (!hasPermission || tag.course.status !== "open") {
    return fail(res, "无权访问该标签内容", 403);
  }

  const payload = await getTagVideosWithProgress({
    tagId: tag.id,
    userId: req.auth.userId,
    courseId: tag.courseId,
    courseVideos: tag.courseVideos,
  });

  return ok(res, {
    videos: payload?.videos ?? [],
    progress: payload?.progress ?? [],
  });
});

userRouter.get("/courses/:courseId/audios/:audioId/detail", async (req, res) => {
  try {
    const course = await assertCoursePermission(req.auth.userId, req.params.courseId);
    const relation = await prisma.courseAudio.findFirst({
      where: {
        courseId: course.id,
        audioId: req.params.audioId,
        ...readyAudioRelationWhere,
      },
      include: {
        audio: true,
        tag: true,
      },
    });

    if (!relation) return fail(res, "音频不存在", 404);

    const ordered = await getOrderedCourseAudios(course.id);
    const currentIndex = ordered.findIndex((item) => item.audio.id === req.params.audioId);
    const prev = currentIndex > 0 ? ordered[currentIndex - 1].audio : undefined;
    const next = currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1].audio : undefined;
    const first = ordered.length > 0 ? ordered[0].audio : undefined;
    const last = ordered.length > 0 ? ordered[ordered.length - 1].audio : undefined;
    const progress = await prisma.userProgress.findUnique({
      where: {
        userId_courseId_audioId: {
          userId: req.auth.userId,
          courseId: course.id,
          audioId: req.params.audioId,
        },
      },
    });

    return ok(res, {
      audio: serializeAudioWithProgress(relation.audio, progress),
      tag: serializeTag(relation.tag),
      course: serializeCourseWithCounts(course),
      prev: prev ? serializeAudio(prev) : undefined,
      next: next ? serializeAudio(next) : undefined,
      first: first ? serializeAudio(first) : undefined,
      last: last ? serializeAudio(last) : undefined,
      progress: serializeAudioProgress(progress) ?? null,
    });
  } catch (error) {
    return fail(res, error.message || "音频不存在", statusForCourseAccessError(error, 500));
  }
});

userRouter.get("/audios/:audioId/progress", async (req, res) => {
  const courseId = req.query?.courseId ? `${req.query.courseId}` : undefined;
  if (courseId) {
    try {
      await assertCoursePermission(req.auth.userId, courseId);
    } catch (error) {
      return fail(res, error.message || "无权访问该课程进度", 403);
    }
  }

  const record = await prisma.userProgress.findFirst({
    where: {
      userId: req.auth.userId,
      audioId: req.params.audioId,
      ...(courseId ? { courseId } : {}),
    },
    orderBy: {
      lastUpdated: "desc",
    },
  });

  return ok(res, serializeAudioProgress(record));
});

userRouter.get("/courses/:courseId/videos/:videoId/detail", async (req, res) => {
  try {
    const course = await assertCoursePermission(req.auth.userId, req.params.courseId);
    const relation = await prisma.courseVideo.findFirst({
      where: {
        courseId: course.id,
        videoId: req.params.videoId,
      },
      include: {
        video: true,
        tag: true,
      },
    });

    if (!relation) return fail(res, "视频不存在", 404);

    const ordered = await getOrderedCourseVideos(course.id);
    const currentIndex = ordered.findIndex((item) => item.video.id === req.params.videoId);
    const prev = currentIndex > 0 ? ordered[currentIndex - 1].video : undefined;
    const next = currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1].video : undefined;
    const first = ordered.length > 0 ? ordered[0].video : undefined;
    const last = ordered.length > 0 ? ordered[ordered.length - 1].video : undefined;
    const progress = await prisma.userVideoProgress.findUnique({
      where: {
        userId_courseId_videoId: {
          userId: req.auth.userId,
          courseId: course.id,
          videoId: req.params.videoId,
        },
      },
    });

    return ok(res, {
      video: serializeVideoWithProgress(relation.video, progress),
      tag: serializeTag(relation.tag),
      course: serializeCourseWithCounts(course),
      prev: prev ? serializeVideo(prev) : undefined,
      next: next ? serializeVideo(next) : undefined,
      first: first ? serializeVideo(first) : undefined,
      last: last ? serializeVideo(last) : undefined,
      progress: serializeVideoProgress(progress) ?? null,
    });
  } catch (error) {
    return fail(res, error.message || "视频不存在", statusForCourseAccessError(error, 500));
  }
});

userRouter.get("/videos/:videoId/progress", async (req, res) => {
  const courseId = req.query?.courseId ? `${req.query.courseId}` : undefined;
  if (courseId) {
    try {
      await assertCoursePermission(req.auth.userId, courseId);
    } catch (error) {
      return fail(res, error.message || "无权访问该课程进度", 403);
    }
  }

  const record = await prisma.userVideoProgress.findFirst({
    where: {
      userId: req.auth.userId,
      videoId: req.params.videoId,
      ...(courseId ? { courseId } : {}),
    },
    orderBy: {
      lastUpdated: "desc",
    },
  });

  return ok(res, serializeVideoProgress(record));
});

userRouter.post("/progress", async (req, res) => {
  const { courseId, audioId, progress = 0 } = req.body ?? {};
  if (!courseId || !audioId) return fail(res, "缺少进度参数", 400);

  try {
    await assertCoursePermission(req.auth.userId, courseId);
  } catch (error) {
    return fail(res, error.message || "无权保存该课程进度", 403);
  }

  const relation = await prisma.courseAudio.findFirst({
    where: {
      courseId,
      audioId,
      ...readyAudioRelationWhere,
    },
  });

  if (!relation) return fail(res, "课程音频不存在", 404);

  const parsedProgress = parseNonNegativeProgress(progress);
  if (parsedProgress === null) return fail(res, "invalid progress", 400);

  const audio = await prisma.audio.findUnique({
    where: { id: audioId },
    select: { duration: true },
  });
  const existingRecord = await prisma.userProgress.findUnique({
    where: {
      userId_courseId_audioId: {
        userId: req.auth.userId,
        courseId,
        audioId,
      },
    },
  });
  const normalizedProgress = mergeLearningProgress(existingRecord, parsedProgress, audio?.duration);
  const timestamp = new Date();
  const record = await saveUserProgressRecord({
    userId: req.auth.userId,
    courseId,
    audioId,
    updateData: {
      progress: normalizedProgress,
      ...(existingRecord?.completed ? { completed: true } : {}),
      lastUpdated: timestamp,
    },
    createData: {
      progress: normalizedProgress,
      lastUpdated: timestamp,
    },
  });

  return ok(res, serializeAudioProgress(record), "进度已保存");
});

userRouter.post("/progress/complete", async (req, res) => {
  const { courseId, audioId, progress } = req.body ?? {};
  if (!courseId || !audioId) return fail(res, "缺少完成参数", 400);

  try {
    await assertCoursePermission(req.auth.userId, courseId);
  } catch (error) {
    return fail(res, error.message || "无权更新该课程进度", 403);
  }

  const relation = await prisma.courseAudio.findFirst({
    where: {
      courseId,
      audioId,
      ...readyAudioRelationWhere,
    },
  });

  if (!relation) return fail(res, "课程音频不存在", 404);

  const parsedProgress = progress === undefined ? undefined : parseNonNegativeProgress(progress);
  if (parsedProgress === null) return fail(res, "invalid progress", 400);

  const audio = await prisma.audio.findUnique({
    where: { id: audioId },
    select: { duration: true },
  });
  const existingRecord = await prisma.userProgress.findUnique({
    where: {
      userId_courseId_audioId: {
        userId: req.auth.userId,
        courseId,
        audioId,
      },
    },
  });
  const normalizedProgress = getCompletedLearningProgress(existingRecord, parsedProgress, audio?.duration);
  const timestamp = new Date();
  const record = await saveUserProgressRecord({
    userId: req.auth.userId,
    courseId,
    audioId,
    updateData: {
      completed: true,
      progress: normalizedProgress,
      lastUpdated: timestamp,
    },
    createData: {
      progress: normalizedProgress,
      completed: true,
      lastUpdated: timestamp,
    },
  });

  return ok(res, serializeAudioProgress(record), "已标记学完");
});

userRouter.post("/video-progress", async (req, res) => {
  const { courseId, videoId, progress = 0 } = req.body ?? {};
  if (!courseId || !videoId) return fail(res, "缺少进度参数", 400);

  try {
    await assertCoursePermission(req.auth.userId, courseId);
  } catch (error) {
    return fail(res, error.message || "无权保存该课程进度", 403);
  }

  const relation = await prisma.courseVideo.findFirst({
    where: {
      courseId,
      videoId,
    },
  });

  if (!relation) return fail(res, "课程视频不存在", 404);

  const parsedProgress = parseNonNegativeProgress(progress);
  if (parsedProgress === null) return fail(res, "invalid progress", 400);

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { duration: true },
  });
  const existingRecord = await prisma.userVideoProgress.findUnique({
    where: {
      userId_courseId_videoId: {
        userId: req.auth.userId,
        courseId,
        videoId,
      },
    },
  });
  const normalizedProgress = mergeLearningProgress(existingRecord, parsedProgress, video?.duration);
  const timestamp = new Date();
  const record = await saveUserVideoProgressRecord({
    userId: req.auth.userId,
    courseId,
    videoId,
    updateData: {
      progress: normalizedProgress,
      ...(existingRecord?.completed ? { completed: true } : {}),
      lastUpdated: timestamp,
    },
    createData: {
      progress: normalizedProgress,
      lastUpdated: timestamp,
    },
  });

  return ok(res, serializeVideoProgress(record), "进度已保存");
});

userRouter.post("/video-progress/complete", async (req, res) => {
  const { courseId, videoId, progress } = req.body ?? {};
  if (!courseId || !videoId) return fail(res, "缺少完成参数", 400);

  try {
    await assertCoursePermission(req.auth.userId, courseId);
  } catch (error) {
    return fail(res, error.message || "无权更新该课程进度", 403);
  }

  const relation = await prisma.courseVideo.findFirst({
    where: {
      courseId,
      videoId,
    },
  });

  if (!relation) return fail(res, "课程视频不存在", 404);

  const parsedProgress = progress === undefined ? undefined : parseNonNegativeProgress(progress);
  if (parsedProgress === null) return fail(res, "invalid progress", 400);

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { duration: true },
  });
  const existingRecord = await prisma.userVideoProgress.findUnique({
    where: {
      userId_courseId_videoId: {
        userId: req.auth.userId,
        courseId,
        videoId,
      },
    },
  });
  const normalizedProgress = getCompletedLearningProgress(existingRecord, parsedProgress, video?.duration);
  const timestamp = new Date();
  const record = await saveUserVideoProgressRecord({
    userId: req.auth.userId,
    courseId,
    videoId,
    updateData: {
      completed: true,
      progress: normalizedProgress,
      lastUpdated: timestamp,
    },
    createData: {
      progress: normalizedProgress,
      completed: true,
      lastUpdated: timestamp,
    },
  });

  return ok(res, serializeVideoProgress(record), "已标记学完");
});

const QUESTION_BANK_COLORS = ["#c9973e", "#f76e6e", "#4e8ef7", "#1dc9a4", "#c97ef5", "#f7a94e"];

const safeParseJson = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeAnswerKeys = (value) => {
  const parsed = typeof value === "string" ? safeParseJson(value, value) : value;
  const source =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed.selected ??
        parsed.selectedAnswers ??
        parsed.answer ??
        parsed.answers ??
        parsed.correctAnswer ??
        parsed.correctAnswers ??
        parsed.keys ??
        parsed.value
      : parsed;

  const rawItems = Array.isArray(source) ? source : typeof source === "string" ? source.split(/[\s,，、|/;；]+/) : [source];
  return Array.from(
    new Set(
      rawItems
        .flatMap((item) => {
          if (item && typeof item === "object") return [item.optionKey ?? item.key ?? item.value ?? item.label];
          return [item];
        })
        .map((item) => `${item ?? ""}`.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).sort();
};

const answersEqual = (left, right) => {
  const normalizedLeft = normalizeAnswerKeys(left);
  const normalizedRight = normalizeAnswerKeys(right);
  return (
    normalizedLeft.length > 0 &&
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((item, index) => item === normalizedRight[index])
  );
};

const answerStateFromJson = (answerJson) => {
  const parsed = safeParseJson(answerJson, null);
  if (!parsed || typeof parsed !== "object") {
    return {
      selectedAnswers: [],
      correctAnswer: [],
      isCorrect: null,
    };
  }

  return {
    selectedAnswers: normalizeAnswerKeys(parsed.selectedAnswers ?? parsed.selected ?? parsed.answer),
    correctAnswer: normalizeAnswerKeys(parsed.correctAnswer ?? parsed.correctAnswers),
    isCorrect: typeof parsed.isCorrect === "boolean" ? parsed.isCorrect : null,
    answeredAt: parsed.answeredAt ?? null,
  };
};

const questionBankMetaFromDraft = (draftText) => {
  const parsed = safeParseJson(draftText, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const coerceQuestionBankSubjectiveDrafts = (value) => {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, text]) => [`${key ?? ""}`.trim(), typeof text === "string" ? text : ""])
      .filter(([key, text]) => key && text.trim()),
  );
};

const normalizeQuestionBankSubjectiveDrafts = (value) => {
  if (!isPlainObject(value)) {
    const error = new Error("主观题草稿格式不正确");
    error.statusCode = 400;
    throw error;
  }

  const entries = Object.entries(value);
  if (entries.length > 50) {
    const error = new Error("主观题草稿小问数量超出限制");
    error.statusCode = 400;
    throw error;
  }

  let totalLength = 0;
  const drafts = {};
  for (const [rawKey, rawText] of entries) {
    const key = `${rawKey ?? ""}`.trim();
    if (!key || key.length > 191) {
      const error = new Error("主观题草稿小问标识不正确");
      error.statusCode = 400;
      throw error;
    }
    if (typeof rawText !== "string") {
      const error = new Error("主观题草稿内容必须为文本");
      error.statusCode = 400;
      throw error;
    }
    if (rawText.length > 20000) {
      const error = new Error("单个小问草稿内容过长");
      error.statusCode = 400;
      throw error;
    }
    totalLength += rawText.length;
    if (totalLength > 50000) {
      const error = new Error("本题草稿内容过长");
      error.statusCode = 400;
      throw error;
    }
    if (rawText.trim()) drafts[key] = rawText;
  }

  return drafts;
};

const questionBankDraftFromMeta = (meta) => (meta && Object.keys(meta).length > 0 ? JSON.stringify(meta) : null);

const isBookQuestionStateWrong = (state) => {
  const answer = answerStateFromJson(state?.answerJson);
  return state?.isRedoMarked || answer.isCorrect === false;
};

const questionBankModeFromQuery = (value) => {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  if (["random", "随机练习"].includes(normalized)) return "random";
  if (["wrong", "只看错题", "错题"].includes(normalized)) return "wrong";
  if (["favorite", "bookmark", "收藏题目", "收藏"].includes(normalized)) return "favorite";
  return "sequence";
};

const parseQuestionBankLimit = (value, fallback = 50) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(numeric)));
};

const getQuestionBankColor = (index = 0) => QUESTION_BANK_COLORS[index % QUESTION_BANK_COLORS.length];

const serializeQuestionBankProgress = (stats) => ({
  totalCount: stats.totalCount,
  answeredCount: stats.answeredCount,
  viewedAnswerCount: stats.viewedAnswerCount,
  masteredCount: stats.masteredCount,
  redoCount: stats.redoCount,
  wrongCount: stats.wrongCount,
  bookmarkedCount: stats.bookmarkedCount,
  progressPercent: stats.totalCount > 0 ? Math.round((stats.answeredCount / stats.totalCount) * 100) : 0,
});

const buildQuestionBankStats = async ({ userId, bookId }) => {
  const [items, states] = await Promise.all([
    prisma.bookQuestionBankItem.findMany({
      where: {
        bookId,
        status: true,
        bookQuestionLibraryItemId: { not: null },
      },
      select: {
        id: true,
        subjectId: true,
      },
    }),
    prisma.userBookQuestionBankItemState.findMany({
      where: {
        userId,
        bookId,
      },
      select: {
        bookItemId: true,
        answerJson: true,
        draftText: true,
        isAnswered: true,
        hasViewedAnswer: true,
        isMastered: true,
        isRedoMarked: true,
        bookItem: {
          select: {
            subjectId: true,
            status: true,
            bookQuestionLibraryItemId: true,
          },
        },
      },
    }),
  ]);

  const activeItems = new Map(items.map((item) => [item.id, item]));
  const subjectStats = new Map();
  const ensureSubjectStats = (subjectId) => {
    const existing = subjectStats.get(subjectId);
    if (existing) return existing;
    const next = {
      totalCount: 0,
      answeredCount: 0,
      viewedAnswerCount: 0,
      masteredCount: 0,
      redoCount: 0,
      wrongCount: 0,
      bookmarkedCount: 0,
    };
    subjectStats.set(subjectId, next);
    return next;
  };

  for (const item of items) {
    ensureSubjectStats(item.subjectId).totalCount += 1;
  }

  const totals = {
    totalCount: items.length,
    answeredCount: 0,
    viewedAnswerCount: 0,
    masteredCount: 0,
    redoCount: 0,
    wrongCount: 0,
    bookmarkedCount: 0,
    subjectStats,
  };

  for (const state of states) {
    const activeItem = activeItems.get(state.bookItemId);
    if (!activeItem || state.bookItem?.status === false || !state.bookItem?.bookQuestionLibraryItemId) continue;

    const subject = ensureSubjectStats(activeItem.subjectId);
    const meta = questionBankMetaFromDraft(state.draftText);
    const bookmarked = meta.bookmarked === true;
    const wrong = isBookQuestionStateWrong(state);

    if (state.isAnswered) {
      totals.answeredCount += 1;
      subject.answeredCount += 1;
    }
    if (state.hasViewedAnswer) {
      totals.viewedAnswerCount += 1;
      subject.viewedAnswerCount += 1;
    }
    if (state.isMastered) {
      totals.masteredCount += 1;
      subject.masteredCount += 1;
    }
    if (state.isRedoMarked) {
      totals.redoCount += 1;
      subject.redoCount += 1;
    }
    if (wrong) {
      totals.wrongCount += 1;
      subject.wrongCount += 1;
    }
    if (bookmarked) {
      totals.bookmarkedCount += 1;
      subject.bookmarkedCount += 1;
    }
  }

  return totals;
};

const serializeQuestionBankSubject = (subject, stats, index = 0) => ({
  id: subject.id,
  bookId: subject.bookId,
  name: subject.name,
  code: subject.code,
  description: subject.description ?? "",
  sortOrder: subject.sortOrder,
  color: getQuestionBankColor(index),
  progress: serializeQuestionBankProgress({
    totalCount: stats?.totalCount ?? 0,
    answeredCount: stats?.answeredCount ?? 0,
    viewedAnswerCount: stats?.viewedAnswerCount ?? 0,
    masteredCount: stats?.masteredCount ?? 0,
    redoCount: stats?.redoCount ?? 0,
    wrongCount: stats?.wrongCount ?? 0,
    bookmarkedCount: stats?.bookmarkedCount ?? 0,
  }),
});

const serializeQuestionBankBook = ({ book, stats, index = 0 }) => ({
  id: book.id,
  name: book.name,
  code: book.code,
  coverUrl: book.coverUrl ?? "",
  description: book.description ?? "",
  status: book.status,
  accessType: book.accessType ?? "authorized",
  paperType: book.paperType ?? "objective",
  isVisible: book.isVisible,
  sortOrder: book.sortOrder,
  publisher: "得恩法考教研中心",
  tags: [book.paperType === "subjective" ? "主观题" : "客观题", book.accessType === "public" ? "免费练习" : "已授权"],
  color: getQuestionBankColor(index),
  progress: serializeQuestionBankProgress(stats),
  subjects: (book.subjects ?? []).map((subject, subjectIndex) =>
    serializeQuestionBankSubject(subject, stats.subjectStats.get(subject.id), subjectIndex),
  ),
  createdAt: formatDateTime(book.createdAt),
  updatedAt: formatDateTime(book.updatedAt),
});

const assertQuestionBankPermission = async (userId, bookId, include = {}) => {
  const shouldIncludeBookRelations = Object.keys(include).length > 0;
  const book = await prisma.bookQuestionBank.findUnique({
    where: { id: bookId },
    ...(shouldIncludeBookRelations ? { include } : {}),
  });

  if (!book) throw new Error("题库不存在");
  if (book.status !== "published" || !book.isVisible) {
    throw new Error("题库尚未开放");
  }

  if (book.accessType === "public") return book;

  const permission = await prisma.userBookQuestionBankPermission.findUnique({
    where: {
      userId_bookId: {
        userId,
        bookId,
      },
    },
    select: { id: true },
  });

  if (!permission) {
    const linkedBookIds = await getCourseLinkedQuestionBankBookIds(userId);
    if (!linkedBookIds.has(bookId)) {
      throw new Error("无权访问该题库");
    }
  }

  return book;
};

const getCourseLinkedQuestionBankBookIds = async (userId) => {
  const coursePermissions = await prisma.userCoursePermission.findMany({
    where: { userId },
    select: {
      course: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });
  const courseIdSet = new Set(
    coursePermissions
      .filter((item) => item.course?.status === "open")
      .map((item) => item.course.id),
  );
  if (courseIdSet.size === 0) return new Set();

  const config = await prisma.systemConfig.findUnique({
    where: { id: 1 },
    select: { portalConfigJson: true },
  });
  let portalConfig = null;
  try {
    portalConfig = config?.portalConfigJson ? JSON.parse(config.portalConfigJson) : null;
  } catch {
    portalConfig = null;
  }

  return new Set(
    normalizeCourseQuestionBankLinks(portalConfig?.courseQuestionBankLinks)
      .filter((item) => courseIdSet.has(item.courseId))
      .flatMap((item) => item.bookIds),
  );
};

const serializeBookQuestionBankItemState = (state) => {
  const answer = answerStateFromJson(state?.answerJson);
  const meta = questionBankMetaFromDraft(state?.draftText);
  const subjectiveDrafts = coerceQuestionBankSubjectiveDrafts(meta.subjectiveDrafts);

  return {
    isAnswered: state?.isAnswered ?? false,
    hasViewedAnswer: state?.hasViewedAnswer ?? false,
    isMastered: state?.isMastered ?? false,
    isRedoMarked: state?.isRedoMarked ?? false,
    isBookmarked: meta.bookmarked === true,
    subjectiveDrafts,
    selectedAnswers: answer.selectedAnswers,
    correctAnswer: answer.correctAnswer,
    isCorrect: answer.isCorrect,
    answeredAt: state?.answeredAt ? formatDateTime(state.answeredAt) : answer.answeredAt ?? null,
    viewedAnswerAt: state?.viewedAnswerAt ? formatDateTime(state.viewedAnswerAt) : null,
  };
};

const questionBankItemTypeLabel = (type) => {
  if (type === "multiple_choice" || type === "uncertain_choice") return "多选";
  if (type === "subjective_case") return "案例";
  return "单选";
};

const questionBankDifficulty = (meta) => {
  const raw = Number(meta?.difficulty ?? meta?.difficultyLevel ?? meta?.level ?? 2);
  if (!Number.isFinite(raw)) return 2;
  return Math.max(1, Math.min(3, Math.round(raw)));
};

const getBookQuestionSource = (item) => item.bookQuestionLibraryItem ?? null;

const serializeQuestionBankSubQuestions = (items, shouldExposeAnswer) =>
  (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: `${item?.id ?? `sub_${index + 1}`}`.trim() || `sub_${index + 1}`,
      title: `${item?.title ?? ""}`.trim(),
      prompt: `${item?.prompt ?? item?.stem ?? item?.question ?? ""}`.trim(),
      placeholder: `${item?.placeholder ?? ""}`.trim(),
      referenceAnswer: shouldExposeAnswer ? `${item?.referenceAnswer ?? ""}`.trim() : "",
      analysis: shouldExposeAnswer ? `${item?.analysis ?? item?.rubricGuidance ?? ""}`.trim() : "",
      sortOrder: Number(item?.sortOrder ?? index + 1) || index + 1,
    }))
    .filter((item) => item.title || item.prompt || item.placeholder || item.referenceAnswer || item.analysis)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));

const serializeQuestionBankItem = (item, options = {}) => {
  const source = getBookQuestionSource(item);
  const state = item.userStates?.[0] ?? item.userState ?? null;
  const itemMeta = safeParseJson(item.questionMetaJson, null);
  const sourceMeta = safeParseJson(source?.questionMetaJson, null);
  const meta = {
    ...(sourceMeta && typeof sourceMeta === "object" && !Array.isArray(sourceMeta) ? sourceMeta : {}),
    ...(itemMeta && typeof itemMeta === "object" && !Array.isArray(itemMeta) ? itemMeta : {}),
  };
  const tags = safeParseJson(item.tagsJson, []);
  const type = item.type ?? source?.type ?? "single_choice";
  const correctAnswer = normalizeAnswerKeys(item.correctAnswerJson ?? source?.correctAnswerJson);
  const serializedState = serializeBookQuestionBankItemState(state);
  const shouldExposeAnswer = options.includeCorrectAnswer || serializedState.isAnswered || serializedState.hasViewedAnswer;
  const answerOptions =
    item.options?.length > 0 ? item.options : source?.options?.length > 0 ? source.options : [];
  const subQuestions = serializeQuestionBankSubQuestions(meta.subQuestions, shouldExposeAnswer);

  return {
    id: item.id,
    bookId: item.bookId,
    subjectId: item.subjectId,
    questionBankItemId: null,
    bookQuestionLibraryItemId: item.bookQuestionLibraryItemId ?? null,
    title: item.title ?? "",
    questionNo: item.questionNo ?? "",
    yearLabel: item.yearLabel ?? meta.year ?? "",
    pageLabel: item.pageLabel ?? "",
    tags: Array.isArray(tags) ? tags : [],
    type,
    typeLabel: questionBankItemTypeLabel(type),
    difficulty: questionBankDifficulty(meta),
    subjectName: item.subject?.name ?? "",
    stem: item.stem ?? source?.stem ?? "",
    material: item.material ?? source?.material ?? "",
    analysis: shouldExposeAnswer ? item.analysis ?? source?.analysis ?? "" : "",
    subQuestions,
    lessonAudioUrl: item.lessonAudioUrl ?? source?.lessonAudioUrl ?? "",
    lessonAudioDurationSeconds: item.lessonAudioDurationSeconds ?? source?.lessonAudioDurationSeconds ?? 0,
    score: item.score ?? source?.score ?? 0,
    sortOrder: item.sortOrder,
    options: answerOptions.map((option) => ({
      id: option.id,
      key: option.optionKey,
      text: option.content,
      sortOrder: option.sortOrder,
    })),
    correctAnswer: shouldExposeAnswer ? correctAnswer : [],
    state: serializedState,
    createdAt: formatDateTime(item.createdAt),
    updatedAt: formatDateTime(item.updatedAt),
  };
};

const getQuestionBankItemForUser = async ({ userId, bookId, itemId }) => {
  await assertQuestionBankPermission(userId, bookId);

  return prisma.bookQuestionBankItem.findFirst({
    where: {
      id: itemId,
      bookId,
      status: true,
      bookQuestionLibraryItemId: { not: null },
    },
    include: {
      subject: true,
      options: {
        orderBy: { sortOrder: "asc" },
      },
      bookQuestionLibraryItem: {
        include: {
          options: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      userStates: {
        where: { userId },
        take: 1,
      },
    },
  });
};

const updateQuestionBankProgress = async ({ userId, bookId, lastSubjectId, lastBookItemId }) => {
  const stats = await buildQuestionBankStats({ userId, bookId });
  const timestamp = new Date();

  return prisma.userBookQuestionBankProgress.upsert({
    where: {
      userId_bookId: {
        userId,
        bookId,
      },
    },
    update: {
      answeredCount: stats.answeredCount,
      viewedAnswerCount: stats.viewedAnswerCount,
      masteredCount: stats.masteredCount,
      redoCount: stats.redoCount,
      ...(lastSubjectId ? { lastSubjectId } : {}),
      ...(lastBookItemId ? { lastBookItemId } : {}),
      lastPracticedAt: timestamp,
    },
    create: {
      userId,
      bookId,
      answeredCount: stats.answeredCount,
      viewedAnswerCount: stats.viewedAnswerCount,
      masteredCount: stats.masteredCount,
      redoCount: stats.redoCount,
      lastSubjectId: lastSubjectId ?? null,
      lastBookItemId: lastBookItemId ?? null,
      lastPracticedAt: timestamp,
    },
  });
};

userRouter.get("/question-banks", async (req, res) => {
  const scope = `${req.query?.scope ?? "authorized"}`.trim();
  if (scope === "public") {
    const publicBooks = await prisma.bookQuestionBank.findMany({
      where: {
        accessType: "public",
        status: "published",
        isVisible: true,
      },
      include: {
        subjects: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const books = await Promise.all(
      publicBooks.map(async (book, index) => {
        const stats = await buildQuestionBankStats({
          userId: req.auth.userId,
          bookId: book.id,
        });
        return serializeQuestionBankBook({ book, stats, index });
      }),
    );

    return ok(res, books);
  }

  const [permissions, linkedBookIds] = await Promise.all([
    prisma.userBookQuestionBankPermission.findMany({
      where: {
        userId: req.auth.userId,
        book: {
          accessType: "authorized",
          status: "published",
          isVisible: true,
        },
      },
      include: {
        book: {
          include: {
            subjects: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getCourseLinkedQuestionBankBookIds(req.auth.userId),
  ]);

  const explicitBookIds = new Set(permissions.map((permission) => permission.bookId));
  const courseLinkedBookIds = [...linkedBookIds].filter((bookId) => !explicitBookIds.has(bookId));
  const courseLinkedBooks =
    courseLinkedBookIds.length === 0
      ? []
      : await prisma.bookQuestionBank.findMany({
          where: {
            id: { in: courseLinkedBookIds },
            accessType: "authorized",
            status: "published",
            isVisible: true,
          },
          include: {
            subjects: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        });

  const books = await Promise.all(
    [...permissions.map((permission) => permission.book), ...courseLinkedBooks].map(async (book, index) => {
      const stats = await buildQuestionBankStats({
        userId: req.auth.userId,
        bookId: book.id,
      });
      return serializeQuestionBankBook({ book, stats, index });
    }),
  );

  return ok(res, books);
});

userRouter.get("/question-banks/:bookId", async (req, res) => {
  try {
    const book = await assertQuestionBankPermission(req.auth.userId, req.params.bookId, {
      subjects: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    });
    const stats = await buildQuestionBankStats({
      userId: req.auth.userId,
      bookId: book.id,
    });

    return ok(res, serializeQuestionBankBook({ book, stats }));
  } catch (error) {
    return fail(res, error.message || "题库不存在", error.message?.includes("无权") || error.message?.includes("尚未开放") ? 403 : 404);
  }
});

userRouter.get("/question-banks/:bookId/items", async (req, res) => {
  try {
    await assertQuestionBankPermission(req.auth.userId, req.params.bookId);

    const mode = questionBankModeFromQuery(req.query.mode);
    const limit = parseQuestionBankLimit(req.query.limit);
    const subjectId = `${req.query.subjectId ?? ""}`.trim();
    const where = {
      bookId: req.params.bookId,
      status: true,
      bookQuestionLibraryItemId: { not: null },
      ...(subjectId ? { subjectId } : {}),
    };

    if (mode === "wrong" || mode === "favorite") {
      const states = await prisma.userBookQuestionBankItemState.findMany({
        where: {
          userId: req.auth.userId,
          bookId: req.params.bookId,
          bookItem: {
            is: {
              status: true,
              bookQuestionLibraryItemId: { not: null },
              ...(subjectId ? { subjectId } : {}),
            },
          },
        },
        select: {
          bookItemId: true,
          answerJson: true,
          draftText: true,
          isAnswered: true,
          isRedoMarked: true,
        },
      });
      const itemIds = states
        .filter((state) =>
          mode === "wrong"
            ? state.isAnswered && isBookQuestionStateWrong(state)
            : questionBankMetaFromDraft(state.draftText).bookmarked === true,
        )
        .map((state) => state.bookItemId);

      if (itemIds.length === 0) return ok(res, []);
      where.id = { in: itemIds };
    }

    let items = await prisma.bookQuestionBankItem.findMany({
      where,
      include: {
        subject: true,
        options: {
          orderBy: { sortOrder: "asc" },
        },
        bookQuestionLibraryItem: {
          include: {
            options: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
        userStates: {
          where: { userId: req.auth.userId },
          take: 1,
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    if (mode === "random") {
      items = [...items].sort(() => Math.random() - 0.5);
    }

    return ok(res, items.slice(0, limit).map((item) => serializeQuestionBankItem(item)));
  } catch (error) {
    return fail(res, error.message || "题目加载失败", error.message?.includes("无权") || error.message?.includes("尚未开放") ? 403 : 500);
  }
});

userRouter.get("/question-banks/:bookId/items/:itemId", async (req, res) => {
  try {
    const item = await getQuestionBankItemForUser({
      userId: req.auth.userId,
      bookId: req.params.bookId,
      itemId: req.params.itemId,
    });

    if (!item) return fail(res, "题目不存在", 404);
    return ok(res, serializeQuestionBankItem(item));
  } catch (error) {
    return fail(res, error.message || "题目加载失败", error.message?.includes("无权") || error.message?.includes("尚未开放") ? 403 : 500);
  }
});

userRouter.post("/question-banks/:bookId/items/:itemId/answer", async (req, res) => {
  const selectedAnswers = normalizeAnswerKeys(req.body?.selectedAnswers ?? req.body?.selected);
  if (selectedAnswers.length === 0) return fail(res, "请选择答案", 400);

  try {
    const item = await getQuestionBankItemForUser({
      userId: req.auth.userId,
      bookId: req.params.bookId,
      itemId: req.params.itemId,
    });

    if (!item) return fail(res, "题目不存在", 404);

    const source = getBookQuestionSource(item);
    const correctAnswer = normalizeAnswerKeys(item.correctAnswerJson ?? source?.correctAnswerJson);
    if (correctAnswer.length === 0) return fail(res, "题目答案尚未配置", 422);

    const isCorrect = answersEqual(selectedAnswers, correctAnswer);
    const timestamp = new Date();
    const existingState = item.userStates?.[0] ?? null;
    const savedState = await prisma.userBookQuestionBankItemState.upsert({
      where: {
        userId_bookItemId: {
          userId: req.auth.userId,
          bookItemId: item.id,
        },
      },
      update: {
        answerJson: JSON.stringify({
          selectedAnswers,
          correctAnswer,
          isCorrect,
          answeredAt: timestamp.toISOString(),
        }),
        isAnswered: true,
        hasViewedAnswer: true,
        isRedoMarked: isCorrect ? existingState?.isRedoMarked ?? false : true,
        answeredAt: timestamp,
        viewedAnswerAt: timestamp,
      },
      create: {
        userId: req.auth.userId,
        bookId: item.bookId,
        bookItemId: item.id,
        bookQuestionLibraryItemId: item.bookQuestionLibraryItemId,
        answerJson: JSON.stringify({
          selectedAnswers,
          correctAnswer,
          isCorrect,
          answeredAt: timestamp.toISOString(),
        }),
        isAnswered: true,
        hasViewedAnswer: true,
        isRedoMarked: !isCorrect,
        answeredAt: timestamp,
        viewedAnswerAt: timestamp,
      },
    });

    await updateQuestionBankProgress({
      userId: req.auth.userId,
      bookId: item.bookId,
      lastSubjectId: item.subjectId,
      lastBookItemId: item.id,
    });

    return ok(
      res,
      {
        isCorrect,
        selectedAnswers,
        correctAnswer,
        item: serializeQuestionBankItem({ ...item, userStates: [savedState] }, { includeCorrectAnswer: true }),
      },
      "答案已提交",
    );
  } catch (error) {
    return fail(res, error.message || "答案提交失败", error.message?.includes("无权") || error.message?.includes("尚未开放") ? 403 : 500);
  }
});

userRouter.post("/question-banks/:bookId/items/:itemId/view-answer", async (req, res) => {
  try {
    const item = await getQuestionBankItemForUser({
      userId: req.auth.userId,
      bookId: req.params.bookId,
      itemId: req.params.itemId,
    });

    if (!item) return fail(res, "题目不存在", 404);

    const timestamp = new Date();
    const savedState = await prisma.userBookQuestionBankItemState.upsert({
      where: {
        userId_bookItemId: {
          userId: req.auth.userId,
          bookItemId: item.id,
        },
      },
      update: {
        hasViewedAnswer: true,
        viewedAnswerAt: timestamp,
      },
      create: {
        userId: req.auth.userId,
        bookId: item.bookId,
        bookItemId: item.id,
        bookQuestionLibraryItemId: item.bookQuestionLibraryItemId,
        hasViewedAnswer: true,
        viewedAnswerAt: timestamp,
      },
    });

    await updateQuestionBankProgress({
      userId: req.auth.userId,
      bookId: item.bookId,
      lastSubjectId: item.subjectId,
      lastBookItemId: item.id,
    });

    return ok(res, serializeQuestionBankItem({ ...item, userStates: [savedState] }, { includeCorrectAnswer: true }));
  } catch (error) {
    return fail(res, error.message || "解析加载失败", error.message?.includes("无权") || error.message?.includes("尚未开放") ? 403 : 500);
  }
});

userRouter.patch("/question-banks/:bookId/items/:itemId/state", async (req, res) => {
  try {
    const item = await getQuestionBankItemForUser({
      userId: req.auth.userId,
      bookId: req.params.bookId,
      itemId: req.params.itemId,
    });

    if (!item) return fail(res, "题目不存在", 404);

    const existingState = item.userStates?.[0] ?? null;
    const nextMeta = questionBankMetaFromDraft(existingState?.draftText);
    if (typeof req.body?.bookmarked === "boolean") nextMeta.bookmarked = req.body.bookmarked;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "subjectiveDrafts")) {
      nextMeta.subjectiveDrafts = normalizeQuestionBankSubjectiveDrafts(req.body.subjectiveDrafts);
    }

    const data = {
      ...(typeof req.body?.isMastered === "boolean" ? { isMastered: req.body.isMastered } : {}),
      ...(typeof req.body?.isRedoMarked === "boolean" ? { isRedoMarked: req.body.isRedoMarked } : {}),
      draftText: questionBankDraftFromMeta(nextMeta),
    };

    const savedState = await prisma.userBookQuestionBankItemState.upsert({
      where: {
        userId_bookItemId: {
          userId: req.auth.userId,
          bookItemId: item.id,
        },
      },
      update: data,
      create: {
        userId: req.auth.userId,
        bookId: item.bookId,
        bookItemId: item.id,
        bookQuestionLibraryItemId: item.bookQuestionLibraryItemId,
        ...data,
      },
    });

    await updateQuestionBankProgress({
      userId: req.auth.userId,
      bookId: item.bookId,
      lastSubjectId: item.subjectId,
      lastBookItemId: item.id,
    });

    return ok(res, serializeQuestionBankItem({ ...item, userStates: [savedState] }), "题目状态已更新");
  } catch (error) {
    return fail(res, error.message || "题目状态更新失败", error.statusCode || (error.message?.includes("无权") || error.message?.includes("尚未开放") ? 403 : 500));
  }
});

userRouter.delete("/question-banks/:bookId/items/:itemId/record", async (req, res) => {
  try {
    const item = await getQuestionBankItemForUser({
      userId: req.auth.userId,
      bookId: req.params.bookId,
      itemId: req.params.itemId,
    });

    if (!item) return fail(res, "题目不存在", 404);

    const existingState = item.userStates?.[0] ?? null;
    if (!existingState) return ok(res, serializeQuestionBankItem({ ...item, userStates: [] }), "本题暂无练习记录");

    const meta = questionBankMetaFromDraft(existingState.draftText);
    const bookmarked = meta.bookmarked === true;
    const resetData = {
      answerJson: null,
      draftText: questionBankDraftFromMeta(bookmarked ? { bookmarked: true } : {}),
      isAnswered: false,
      hasViewedAnswer: false,
      isMastered: false,
      isRedoMarked: false,
      answeredAt: null,
      viewedAnswerAt: null,
    };

    const savedState = await prisma.userBookQuestionBankItemState.update({
      where: {
        userId_bookItemId: {
          userId: req.auth.userId,
          bookItemId: item.id,
        },
      },
      data: resetData,
    });

    await updateQuestionBankProgress({
      userId: req.auth.userId,
      bookId: item.bookId,
      lastSubjectId: item.subjectId,
      lastBookItemId: item.id,
    });

    return ok(res, serializeQuestionBankItem({ ...item, userStates: [savedState] }), "本题练习记录已清除");
  } catch (error) {
    return fail(res, error.message || "练习记录清除失败", error.message?.includes("无权") || error.message?.includes("尚未开放") ? 403 : 500);
  }
});

const downloadRemoteFile = async ({ res, url, fileName, fallbackError }) => {
  if (!url) return fail(res, fallbackError, 404);

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return fail(res, "讲义下载失败", 502);
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", buildAttachmentDisposition(fileName));
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (contentLength) res.setHeader("Content-Length", contentLength);

  const stream = Readable.fromWeb(upstream.body);
  stream.on("error", (error) => {
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy(error);
    }
  });
  stream.pipe(res);
};

userRouter.get("/courses/:courseId/handout/download", async (req, res) => {
  try {
    const course = await assertCoursePermission(req.auth.userId, req.params.courseId);
    const serializedCourse = serializeCourseWithCounts(course);

    return downloadRemoteFile({
      res,
      url: serializedCourse.handoutUrl,
      fileName: course.handoutName || `${course.name}-course-handout`,
      fallbackError: "handout not found",
    });
  } catch (error) {
    return fail(res, error.message || "handout download failed", statusForCourseAccessError(error, 500));
  }
});

userRouter.get("/courses/:courseId/audios/:audioId/handout/download", async (req, res) => {
  try {
    await assertCoursePermission(req.auth.userId, req.params.courseId);
    const relation = await prisma.courseAudio.findFirst({
      where: {
        courseId: req.params.courseId,
        audioId: req.params.audioId,
        ...readyAudioRelationWhere,
      },
      include: {
        audio: true,
      },
    });

    if (!relation) return fail(res, "音频不存在", 404);

    return downloadRemoteFile({
      res,
      url: serializeAudio(relation.audio).handoutUrl,
      fileName: relation.audio.handoutName || `${relation.audio.name}-讲义`,
      fallbackError: "讲义不存在",
    });
  } catch (error) {
    return fail(res, error.message || "讲义下载失败", statusForCourseAccessError(error, 500));
  }
});

userRouter.get("/courses/:courseId/videos/:videoId/handout/download", async (req, res) => {
  try {
    await assertCoursePermission(req.auth.userId, req.params.courseId);
    const relation = await prisma.courseVideo.findFirst({
      where: {
        courseId: req.params.courseId,
        videoId: req.params.videoId,
      },
      include: {
        video: true,
      },
    });

    if (!relation) return fail(res, "视频不存在", 404);

    return downloadRemoteFile({
      res,
      url: serializeVideo(relation.video).handoutUrl,
      fileName: relation.video.handoutName || `${relation.video.name}-讲义`,
      fallbackError: "讲义不存在",
    });
  } catch (error) {
    return fail(res, error.message || "讲义下载失败", statusForCourseAccessError(error, 500));
  }
});
