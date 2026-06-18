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

