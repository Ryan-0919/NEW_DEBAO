import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../lib/response.js";
import {
  ensureDefaultRecitationSubjects,
  serializeRecitationChapter,
  serializeRecitationItem,
  serializeRecitationSubject,
} from "../lib/recitation.js";
import { requireUserAuth } from "../middleware/auth.js";

export const recitationUserRouter = Router();

recitationUserRouter.use(requireUserAuth);

const normalizeAnswerText = (value = "") => `${value ?? ""}`.replace(/\s+/g, "").trim();

const parseAnswerFromBlanksJson = (value = "") => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? `${parsed[0]?.answer ?? ""}` : "";
  } catch (_error) {
    return "";
  }
};

const maskPhone = (phone = "") => {
  const normalized = `${phone ?? ""}`;
  if (normalized.length < 7) return normalized;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
};

const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const serializeLeaderboardRows = async ({ groups, currentUserId }) => {
  const userIds = groups.map((group) => group.userId).filter(Boolean);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, phone: true, nickname: true, avatarUrl: true },
      })
    : [];
  const userMap = new Map(users.map((user) => [user.id, user]));
  return groups.map((group, index) => {
    const user = userMap.get(group.userId);
    const phone = user?.phone ?? "";
    return {
      userId: group.userId,
      phone: maskPhone(phone),
      nickname: user?.nickname || maskPhone(phone) || "得宝学员",
      avatarUrl: user?.avatarUrl ?? "",
      points: Number(group._sum?.points ?? 0) || 0,
      rank: index + 1,
      isMine: group.userId === currentUserId,
    };
  });
};

const buildLeaderboard = async (currentUserId) => {
  const { start, end } = getTodayRange();
  const [totalGroups, todayGroups, myTotal, myToday] = await Promise.all([
    prisma.recitationPracticePoint.groupBy({
      by: ["userId"],
      _sum: { points: true },
      orderBy: [{ _sum: { points: "desc" } }],
      take: 10,
    }),
    prisma.recitationPracticePoint.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: start, lt: end } },
      _sum: { points: true },
      orderBy: [{ _sum: { points: "desc" } }],
      take: 10,
    }),
    prisma.recitationPracticePoint.aggregate({
      where: { userId: currentUserId },
      _sum: { points: true },
    }),
    prisma.recitationPracticePoint.aggregate({
      where: { userId: currentUserId, createdAt: { gte: start, lt: end } },
      _sum: { points: true },
    }),
  ]);

  const [total, today] = await Promise.all([
    serializeLeaderboardRows({ groups: totalGroups, currentUserId }),
    serializeLeaderboardRows({ groups: todayGroups, currentUserId }),
  ]);

  return {
    total,
    today,
    myTotalPoints: Number(myTotal._sum?.points ?? 0) || 0,
    myTodayPoints: Number(myToday._sum?.points ?? 0) || 0,
  };
};

const buildSubjectItemCountMap = async (subjectIds) => {
  if (subjectIds.length === 0) return new Map();
  const chapters = await prisma.recitationChapter.findMany({
    where: {
      subjectId: { in: subjectIds },
      isActive: true,
    },
    select: {
      id: true,
      subjectId: true,
    },
  });
  if (chapters.length === 0) return new Map();

  const itemGroups = await prisma.recitationItem.groupBy({
    by: ["chapterId"],
    where: {
      chapterId: { in: chapters.map((chapter) => chapter.id) },
      status: "published",
    },
    _count: {
      _all: true,
    },
  });
  const chapterCountMap = new Map(itemGroups.map((item) => [item.chapterId, item._count?._all ?? 0]));
  const subjectCountMap = new Map();
  chapters.forEach((chapter) => {
    subjectCountMap.set(chapter.subjectId, (subjectCountMap.get(chapter.subjectId) ?? 0) + (chapterCountMap.get(chapter.id) ?? 0));
  });
  return subjectCountMap;
};

recitationUserRouter.get("/subjects", async (_req, res) => {
  try {
    await ensureDefaultRecitationSubjects(prisma);
    const subjects = await prisma.recitationSubject.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            chapters: { where: { isActive: true } },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const itemCountMap = await buildSubjectItemCountMap(subjects.map((subject) => subject.id));
    return ok(res, subjects.map((subject) => serializeRecitationSubject({ ...subject, itemCount: itemCountMap.get(subject.id) ?? 0 })));
  } catch (error) {
    return fail(res, error.message || "加载抽背科目失败", error.statusCode || 400);
  }
});

recitationUserRouter.get("/chapters", async (req, res) => {
  try {
    const subjectId = `${req.query?.subjectId ?? ""}`.trim();
    if (!subjectId) return fail(res, "请选择科目", 400);

    const chapters = await prisma.recitationChapter.findMany({
      where: {
        subjectId,
        isActive: true,
        subject: { is: { isActive: true } },
      },
      include: {
        subject: true,
        _count: {
          select: {
            items: {
              where: {
                status: "published",
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return ok(res, chapters.map(serializeRecitationChapter));
  } catch (error) {
    return fail(res, error.message || "加载抽背章节失败", error.statusCode || 400);
  }
});

recitationUserRouter.get("/items", async (_req, res) => {
  try {
    const items = await prisma.recitationItem.findMany({
      where: {
        status: "published",
        chapter: {
          is: {
            isActive: true,
            subject: { is: { isActive: true } },
          },
        },
      },
      include: {
        chapter: {
          include: {
            subject: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return ok(res, {
      items: items.map((item) => serializeRecitationItem(item, { includeAnswers: true })),
      total: items.length,
    });
  } catch (error) {
    return fail(res, error.message || "加载乱序抽背题失败", error.statusCode || 400);
  }
});

recitationUserRouter.get("/leaderboard", async (req, res) => {
  try {
    return ok(res, await buildLeaderboard(req.auth.userId));
  } catch (error) {
    return fail(res, error.message || "加载抽背排行榜失败", error.statusCode || 400);
  }
});

recitationUserRouter.post("/items/:itemId/answer", async (req, res) => {
  try {
    const item = await prisma.recitationItem.findFirst({
      where: {
        id: req.params.itemId,
        status: "published",
        chapter: {
          is: {
            isActive: true,
            subject: { is: { isActive: true } },
          },
        },
      },
      select: { id: true, blanksJson: true },
    });
    if (!item) return fail(res, "抽背题不存在或未开放", 404);

    const correctAnswer = parseAnswerFromBlanksJson(item.blanksJson);
    const submittedAnswer = `${req.body?.answer ?? ""}`;
    const correct = Boolean(correctAnswer) && normalizeAnswerText(submittedAnswer) === normalizeAnswerText(correctAnswer);
    let pointsAwarded = 0;

    if (correct) {
      await prisma.recitationPracticePoint.create({
        data: {
          userId: req.auth.userId,
          itemId: item.id,
          points: 1,
        },
      });
      pointsAwarded = 1;
    }

    const leaderboard = await buildLeaderboard(req.auth.userId);
    return ok(res, {
      correct,
      pointsAwarded,
      totalPoints: leaderboard.myTotalPoints,
      todayPoints: leaderboard.myTodayPoints,
      leaderboard,
    });
  } catch (error) {
    return fail(res, error.message || "提交抽背答案失败", error.statusCode || 400);
  }
});

recitationUserRouter.get("/chapters/:chapterId/items", async (req, res) => {
  try {
    const chapter = await prisma.recitationChapter.findFirst({
      where: {
        id: req.params.chapterId,
        isActive: true,
        subject: { is: { isActive: true } },
      },
      include: {
        subject: true,
        _count: {
          select: {
            items: {
              where: { status: "published" },
            },
          },
        },
      },
    });
    if (!chapter) return fail(res, "章节不存在或未开放", 404);

    const [chapters, items] = await Promise.all([
      prisma.recitationChapter.findMany({
        where: {
          subjectId: chapter.subjectId,
          isActive: true,
          subject: { is: { isActive: true } },
        },
        include: {
          subject: true,
          _count: {
            select: {
              items: {
                where: { status: "published" },
              },
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.recitationItem.findMany({
        where: {
          chapterId: chapter.id,
          status: "published",
        },
        include: {
          chapter: {
            include: {
              subject: true,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    return ok(res, {
      subject: serializeRecitationSubject({ ...chapter.subject, chapterCount: chapters.length, itemCount: items.length }),
      chapter: serializeRecitationChapter(chapter),
      chapters: chapters.map(serializeRecitationChapter),
      items: items.map((item) => serializeRecitationItem(item, { includeAnswers: true })),
    });
  } catch (error) {
    return fail(res, error.message || "加载抽背题失败", error.statusCode || 400);
  }
});

