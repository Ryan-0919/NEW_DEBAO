import { normalizeDisplayText } from "./text.js";

const DEFAULT_RECITATION_SUBJECTS = [
  { code: "civil", name: "民法", color: "#4e8ef7", sortOrder: 10 },
  { code: "criminal", name: "刑法", color: "#f76e6e", sortOrder: 20 },
  { code: "civil-procedure", name: "民诉", color: "#1dc9a4", sortOrder: 30 },
  { code: "criminal-procedure", name: "刑诉", color: "#c97ef5", sortOrder: 40 },
  { code: "commercial", name: "商法", color: "#f6c15f", sortOrder: 50 },
  { code: "administrative", name: "行政", color: "#22c55e", sortOrder: 60 },
  { code: "international", name: "三国", color: "#38bdf8", sortOrder: 70 },
  { code: "theory", name: "理论", color: "#a78bfa", sortOrder: 80 },
];

export const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const toBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = normalizeDisplayText(value).trim().toLowerCase();
  if (["false", "0", "no", "n", "否", "停用", "禁用", "inactive", "disabled"].includes(normalized)) return false;
  if (["true", "1", "yes", "y", "是", "启用", "active", "enabled"].includes(normalized)) return true;
  return Boolean(value);
};

export const normalizeRecitationText = (value = "") => normalizeDisplayText(value ?? "").replace(/\r\n/g, "\n").trim();

const normalizeAnswer = (value = "") => normalizeRecitationText(value).replace(/\s+/g, "");

const parseBlanksJson = (value = "") => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const normalizeCode = (value = "") => {
  const normalized = `${value ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return normalized || `recitation-${Date.now().toString(36)}`;
};

export const ensureDefaultRecitationSubjects = async (db) => {
  await Promise.all(
    DEFAULT_RECITATION_SUBJECTS.map((subject) =>
      db.recitationSubject.upsert({
        where: { code: subject.code },
        update: {},
        create: {
          code: subject.code,
          name: subject.name,
          color: subject.color,
          sortOrder: subject.sortOrder,
          isActive: true,
        },
      }),
    ),
  );
};

export const serializeRecitationSubject = (subject) => ({
  id: subject.id,
  code: subject.code,
  name: subject.name,
  color: subject.color,
  sortOrder: Number(subject.sortOrder ?? 0),
  isActive: Boolean(subject.isActive),
  description: subject.description ?? "",
  chapterCount: subject._count?.chapters ?? subject.chapterCount ?? subject.chapters?.length ?? 0,
  itemCount: subject.itemCount ?? 0,
  createdAt: subject.createdAt,
  updatedAt: subject.updatedAt,
});

export const serializeRecitationChapter = (chapter) => ({
  id: chapter.id,
  subjectId: chapter.subjectId,
  subjectName: chapter.subject?.name ?? "",
  title: chapter.title,
  description: chapter.description ?? "",
  sortOrder: Number(chapter.sortOrder ?? 0),
  isActive: Boolean(chapter.isActive),
  itemCount: chapter._count?.items ?? chapter.items?.length ?? 0,
  createdAt: chapter.createdAt,
  updatedAt: chapter.updatedAt,
});

export const serializeRecitationItem = (item, { includeAnswers = true } = {}) => {
  const answers = parseBlanksJson(item.blanksJson);
  const answer = normalizeRecitationText(answers[0]?.answer ?? "");
  return {
    id: item.id,
    chapterId: item.chapterId,
    chapterTitle: item.chapter?.title ?? "",
    subjectId: item.chapter?.subjectId ?? "",
    subjectName: item.chapter?.subject?.name ?? "",
    title: item.title,
    question: item.content,
    content: item.content,
    answer: includeAnswers ? answer : "",
    answerLength: includeAnswers ? Array.from(normalizeAnswer(answer)).length : 0,
    source: item.source ?? "",
    explanation: item.explanation ?? "",
    status: item.status,
    sortOrder: Number(item.sortOrder ?? 0),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

export const readRecitationSubjectPayload = (body = {}, { create = false } = {}) => {
  const name = normalizeRecitationText(body.name);
  return {
    ...(create || body.code !== undefined ? { code: normalizeCode(body.code || name) } : {}),
    name,
    color: normalizeRecitationText(body.color || "#c9973e") || "#c9973e",
    sortOrder: toInt(body.sortOrder, 0),
    description: normalizeRecitationText(body.description) || null,
    ...(body.isActive !== undefined ? { isActive: toBoolean(body.isActive, true) } : {}),
  };
};

export const readRecitationChapterPayload = (body = {}) => ({
  subjectId: normalizeRecitationText(body.subjectId),
  title: normalizeRecitationText(body.title),
  description: normalizeRecitationText(body.description) || null,
  sortOrder: toInt(body.sortOrder, 0),
  ...(body.isActive !== undefined ? { isActive: toBoolean(body.isActive, true) } : {}),
});

export const readRecitationItemPayload = (body = {}) => {
  const question = normalizeRecitationText(body.question ?? body.content);
  const answer = normalizeRecitationText(body.answer ?? body.standardAnswer);
  const title = normalizeRecitationText(body.title) || question.replace(/\s+/g, " ").slice(0, 48) || "未命名抽背题";
  return {
    chapterId: normalizeRecitationText(body.chapterId),
    title,
    content: question,
    blanksJson: JSON.stringify(answer ? [{ id: "answer_1", index: 1, answer }] : []),
    source: normalizeRecitationText(body.source) || null,
    explanation: normalizeRecitationText(body.explanation) || null,
    status: body.status === "draft" ? "draft" : "published",
    sortOrder: toInt(body.sortOrder, 0),
  };
};

export const validateRecitationSubjectPayload = (payload) => {
  if (!payload.name) return "请输入学科名称";
  if (!payload.code) return "请输入学科编码";
  return "";
};

export const validateRecitationChapterPayload = (payload) => {
  if (!payload.subjectId) return "请选择所属学科";
  if (!payload.title) return "请输入章节名称";
  return "";
};

export const validateRecitationItemPayload = (payload) => {
  if (!payload.chapterId) return "请选择所属章节";
  if (!payload.title) return "请输入题目标题";
  if (!payload.content) return "请输入抽背问题";
  if (!parseBlanksJson(payload.blanksJson)[0]?.answer) return "请输入标准答案";
  return "";
};

export const parseBatchRecitationItems = (text = "", { chapterId, status = "published", source = "" } = {}) => {
  const normalized = normalizeRecitationText(text);
  if (!normalized) return [];

  return normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const columns = line.includes("\t")
        ? line.split(/\t+/).map((item) => item.trim())
        : line.split(/\s{2,}/).map((item) => item.trim());
      const question = columns[0] ?? "";
      const answer = columns[1] ?? "";
      const itemSource = columns[2] ?? "";
      return readRecitationItemPayload({
        chapterId,
        title: question.replace(/^\d+[\.、]\s*/, "").slice(0, 48),
        question: question.replace(/^\d+[\.、]\s*/, ""),
        answer,
        source: itemSource || source,
        status,
        sortOrder: index + 1,
      });
    });
};
