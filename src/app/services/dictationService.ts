import { request } from "./apiClient";

export type DictationSubject = {
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

export type DictationChapter = {
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

export type DictationSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "blank";
      id: string;
      index: number;
      answer?: string;
    };

export type DictationBlank = {
  id: string;
  index: number;
  answer?: string;
};

export type DictationItem = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  subjectName: string;
  title: string;
  content: string;
  segments: DictationSegment[];
  blankCount: number;
  blanks: DictationBlank[];
  source: string;
  explanation: string;
  status: "draft" | "published";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DictationChapterItemsPayload = {
  subject: DictationSubject;
  chapter: DictationChapter;
  chapters: DictationChapter[];
  items: DictationItem[];
};

export const dictationService = {
  getSubjects: () => request<DictationSubject[]>("/api/user/dictation/subjects"),
  getChapters: (subjectId: string) =>
    request<DictationChapter[]>(`/api/user/dictation/chapters?subjectId=${encodeURIComponent(subjectId)}`),
  getChapterItems: (chapterId: string) =>
    request<DictationChapterItemsPayload>(`/api/user/dictation/chapters/${encodeURIComponent(chapterId)}/items`),
};
