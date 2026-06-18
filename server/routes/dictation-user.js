import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../lib/response.js";
import {
  ensureDefaultDictationSubjects,
  serializeDictationChapter,
  serializeDictationItem,
  serializeDictationSubject,
} from "../lib/dictation.js";
import { requireUserAuth } from "../middleware/auth.js";

export const dictationUserRouter = Router();

dictationUserRouter.use(requireUserAuth);

const buildSubjectItemCountMap = async (subjectIds) => {
  if (subjectIds.length === 0) return new Map();
  const chapters = await prisma.dictationChapter.findMany({
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

  const itemGroups = await prisma.dictationItem.groupBy({
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

dictationUserRouter.get("/subjects", async (_req, res) => {
  try {
    await ensureDefaultDictationSubjects(prisma);
    const subjects = await prisma.dictationSubject.findMany({
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
    return ok(res, subjects.map((subject) => serializeDictationSubject({ ...subject, itemCount: itemCountMap.get(subject.id) ?? 0 })));
  } catch (error) {
    return fail(res, error.message || "加载默写本科目失败", error.statusCode || 400);
  }
});

dictationUserRouter.get("/chapters", async (req, res) => {
  try {
    const subjectId = `${req.query?.subjectId ?? ""}`.trim();
    if (!subjectId) return fail(res, "请选择科目", 400);

    const chapters = await prisma.dictationChapter.findMany({
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
    return ok(res, chapters.map(serializeDictationChapter));
  } catch (error) {
    return fail(res, error.message || "加载默写本章节失败", error.statusCode || 400);
  }
});

dictationUserRouter.get("/chapters/:chapterId/items", async (req, res) => {
  try {
    const chapter = await prisma.dictationChapter.findFirst({
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
      prisma.dictationChapter.findMany({
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
      prisma.dictationItem.findMany({
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
      subject: serializeDictationSubject({ ...chapter.subject, chapterCount: chapters.length, itemCount: items.length }),
      chapter: serializeDictationChapter(chapter),
      chapters: chapters.map(serializeDictationChapter),
      items: items.map((item) => serializeDictationItem(item, { includeAnswers: true })),
    });
  } catch (error) {
    return fail(res, error.message || "加载默写题失败", error.statusCode || 400);
  }
});
