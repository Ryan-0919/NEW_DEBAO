import { request } from "./apiClient";

export type RecitationSubject = {
  id: string;
  code: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  description: string;
  chapterCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RecitationChapter = {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RecitationItem = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  subjectName: string;
  title: string;
  question: string;
  content: string;
  answer: string;
  answerLength: number;
  source: string;
  explanation: string;
  status: "draft" | "published";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RecitationChapterItemsPayload = {
  subject: RecitationSubject;
  chapter: RecitationChapter;
  chapters: RecitationChapter[];
  items: RecitationItem[];
};

export type RecitationAllItemsPayload = {
  items: RecitationItem[];
  total: number;
};

export const recitationService = {
  getSubjects: () => request<RecitationSubject[]>("/api/user/recitation/subjects"),
  getChapters: (subjectId: string) =>
    request<RecitationChapter[]>(`/api/user/recitation/chapters?subjectId=${encodeURIComponent(subjectId)}`),
  getChapterItems: (chapterId: string) =>
    request<RecitationChapterItemsPayload>(`/api/user/recitation/chapters/${encodeURIComponent(chapterId)}/items`),
  getAllItems: () => request<RecitationAllItemsPayload>("/api/user/recitation/items"),
};

