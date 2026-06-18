import { normalizeDisplayText } from "./text.js";

export const DEFAULT_DICTATION_SUBJECTS = [
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

export const normalizeDictationText = (value = "") => normalizeDisplayText(value ?? "").replace(/\r\n/g, "\n").trim();

const normalizeCode = (value = "") => {
  const normalized = `${value ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return normalized || `subject-${Date.now().toString(36)}`;
};

export const ensureDefaultDictationSubjects = async (db) => {
  await Promise.all(
    DEFAULT_DICTATION_SUBJECTS.map((subject) =>
      db.dictationSubject.upsert({
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

export const parseDictationBlanks = (content = "") => {
  const normalized = normalizeDictationText(content);
  const blanks = [];
  const pattern = /\{\{([\s\S]+?)\}\}/g;
  let match;
  let index = 0;

  while ((match = pattern.exec(normalized))) {
    const rawAnswer = normalizeDictationText(match[1]);
    if (!rawAnswer) continue;
    index += 1;
    blanks.push({
      id: `blank_${index}`,
      index,
      answer: rawAnswer,
    });
  }

  return blanks;
};

export const buildDictationSegments = (content = "") => {
  const normalized = normalizeDictationText(content);
  const segments = [];
  const pattern = /\{\{([\s\S]+?)\}\}/g;
  let lastIndex = 0;
  let blankIndex = 0;
  let match;

  while ((match = pattern.exec(normalized))) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        text: normalized.slice(lastIndex, match.index),
      });
    }

    const answer = normalizeDictationText(match[1]);
    if (answer) {
      blankIndex += 1;
      segments.push({
        type: "blank",
        id: `blank_${blankIndex}`,
        index: blankIndex,
        answer,
      });
    } else {
      segments.push({
        type: "text",
        text: match[0],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalized.length) {
    segments.push({
      type: "text",
      text: normalized.slice(lastIndex),
    });
  }

  return segments.length > 0 ? segments : [{ type: "text", text: normalized }];
};

export const stripDictationMarkers = (content = "") =>
  normalizeDictationText(content)
    .replace(/\{\{([\s\S]+?)\}\}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const parseBlanksJson = (value = "") => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

export const serializeDictationSubject = (subject) => ({
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

export const serializeDictationChapter = (chapter) => ({
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

export const serializeDictationItem = (item, { includeAnswers = true } = {}) => {
  const blanks = parseBlanksJson(item.blanksJson);
  const payload = {
    id: item.id,
    chapterId: item.chapterId,
    chapterTitle: item.chapter?.title ?? "",
    subjectId: item.chapter?.subjectId ?? "",
    subjectName: item.chapter?.subject?.name ?? "",
    title: item.title,
    content: item.content,
    segments: buildDictationSegments(item.content).map((segment) =>
      includeAnswers || segment.type !== "blank" ? segment : { type: "blank", id: segment.id, index: segment.index },
    ),
    blankCount: blanks.length,
    blanks: includeAnswers ? blanks : blanks.map((blank) => ({ id: blank.id, index: blank.index })),
    source: item.source ?? "",
    explanation: item.explanation ?? "",
    status: item.status,
    sortOrder: Number(item.sortOrder ?? 0),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };

  return payload;
};

export const readSubjectPayload = (body = {}, { create = false } = {}) => {
  const name = normalizeDictationText(body.name);
  return {
    ...(create || body.code !== undefined ? { code: normalizeCode(body.code || name) } : {}),
    name,
    color: normalizeDictationText(body.color || "#c9973e") || "#c9973e",
    sortOrder: toInt(body.sortOrder, 0),
    description: normalizeDictationText(body.description) || null,
    ...(body.isActive !== undefined ? { isActive: toBoolean(body.isActive, true) } : {}),
  };
};

export const readChapterPayload = (body = {}) => ({
  subjectId: normalizeDictationText(body.subjectId),
  title: normalizeDictationText(body.title),
  description: normalizeDictationText(body.description) || null,
  sortOrder: toInt(body.sortOrder, 0),
  ...(body.isActive !== undefined ? { isActive: toBoolean(body.isActive, true) } : {}),
});

export const readItemPayload = (body = {}) => {
  const content = normalizeDictationText(body.content);
  const blanks = parseDictationBlanks(content);
  const title = normalizeDictationText(body.title) || stripDictationMarkers(content).slice(0, 48) || "未命名默写题";
  return {
    chapterId: normalizeDictationText(body.chapterId),
    title,
    content,
    blanksJson: JSON.stringify(blanks),
    source: normalizeDictationText(body.source) || null,
    explanation: normalizeDictationText(body.explanation) || null,
    status: body.status === "draft" ? "draft" : "published",
    sortOrder: toInt(body.sortOrder, 0),
  };
};

export const validateSubjectPayload = (payload) => {
  if (!payload.name) return "请输入科目名称";
  if (!payload.code) return "请输入科目编码";
  return "";
};

export const validateChapterPayload = (payload) => {
  if (!payload.subjectId) return "请选择所属科目";
  if (!payload.title) return "请输入章节名称";
  return "";
};

export const validateItemPayload = (payload) => {
  if (!payload.chapterId) return "请选择所属章节";
  if (!payload.title) return "请输入题目标题";
  if (!payload.content) return "请输入默写内容";
  if (parseBlanksJson(payload.blanksJson).length === 0) return "默写内容至少需要包含一个挖空，格式为 {{答案}}";
  return "";
};

export const parseBatchDictationItems = (text = "", { chapterId, status = "published", source = "" } = {}) => {
  const normalized = normalizeDictationText(text);
  if (!normalized) return [];

  return normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const columns = line.split(/\t+/).map((item) => item.trim());
      const contentColumn = columns.find((item) => /\{\{[\s\S]+?\}\}/.test(item)) ?? columns[0] ?? "";
      const titleColumn = columns.length > 1 && contentColumn !== columns[0] ? columns[0] : "";
      const itemSource = columns.length > 1 ? columns.find((item) => item !== contentColumn && item !== titleColumn) ?? "" : "";
      return readItemPayload({
        chapterId,
        title: titleColumn,
        content: contentColumn.replace(/^\d+[\.、]\s*/, ""),
        source: itemSource || source,
        status,
        sortOrder: index + 1,
      });
    });
};
