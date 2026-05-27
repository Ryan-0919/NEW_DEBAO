import { buildQueryString, deleteJson, patchJson, postJson, request } from "./apiClient";

export type QuestionBankPracticeMode = "sequence" | "random" | "wrong" | "favorite";

export interface QuestionBankProgress {
  totalCount: number;
  answeredCount: number;
  viewedAnswerCount: number;
  masteredCount: number;
  redoCount: number;
  wrongCount: number;
  bookmarkedCount: number;
  progressPercent: number;
}

export interface QuestionBankSubject {
  id: string;
  bookId: string;
  name: string;
  code: string;
  description: string;
  sortOrder: number;
  color: string;
  progress: QuestionBankProgress;
}

export interface QuestionBankBook {
  id: string;
  name: string;
  code: string;
  coverUrl: string;
  description: string;
  status: string;
  accessType: "public" | "authorized";
  paperType: "objective" | "subjective";
  isVisible: boolean;
  sortOrder: number;
  publisher: string;
  tags: string[];
  color: string;
  progress: QuestionBankProgress;
  subjects: QuestionBankSubject[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionBankOption {
  id: string;
  key: string;
  text: string;
  sortOrder: number;
}

export interface QuestionBankSubQuestion {
  id: string;
  title: string;
  prompt: string;
  placeholder: string;
  referenceAnswer: string;
  analysis: string;
  sortOrder: number;
}

export interface QuestionBankItemState {
  isAnswered: boolean;
  hasViewedAnswer: boolean;
  isMastered: boolean;
  isRedoMarked: boolean;
  isBookmarked: boolean;
  subjectiveDrafts: Record<string, string>;
  selectedAnswers: string[];
  correctAnswer: string[];
  isCorrect: boolean | null;
  answeredAt?: string | null;
  viewedAnswerAt?: string | null;
}

export interface QuestionBankItem {
  id: string;
  bookId: string;
  subjectId: string;
  questionBankItemId: string | null;
  bookQuestionLibraryItemId: string | null;
  title: string;
  questionNo: string;
  yearLabel: string;
  pageLabel: string;
  tags: string[];
  type: string;
  typeLabel: "单选" | "多选" | "案例";
  difficulty: 1 | 2 | 3;
  subjectName: string;
  stem: string;
  material: string;
  analysis: string;
  subQuestions: QuestionBankSubQuestion[];
  lessonAudioUrl: string;
  lessonAudioDurationSeconds: number;
  score: number;
  sortOrder: number;
  options: QuestionBankOption[];
  correctAnswer: string[];
  state: QuestionBankItemState;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionBankAnswerResult {
  isCorrect: boolean;
  selectedAnswers: string[];
  correctAnswer: string[];
  item: QuestionBankItem;
}

export interface QuestionBankItemQuery {
  subjectId?: string;
  mode?: QuestionBankPracticeMode;
  limit?: number;
}

const encodeId = (id: string | number) => encodeURIComponent(`${id}`);

export const questionBankService = {
  getQuestionBanks: () => request<QuestionBankBook[]>("/api/user/question-banks"),
  getPublicQuestionBanks: () => request<QuestionBankBook[]>("/api/user/question-banks?scope=public"),
  getMyQuestionBanks: () => request<QuestionBankBook[]>("/api/user/question-banks?scope=authorized"),
  getQuestionBank: (bookId: string | number) => request<QuestionBankBook>(`/api/user/question-banks/${encodeId(bookId)}`),
  getItems: (bookId: string | number, query: QuestionBankItemQuery = {}) =>
    request<QuestionBankItem[]>(
      `/api/user/question-banks/${encodeId(bookId)}/items${buildQueryString({
        subjectId: query.subjectId,
        mode: query.mode,
        limit: query.limit,
      })}`,
    ),
  getItem: (bookId: string | number, itemId: string | number) =>
    request<QuestionBankItem>(`/api/user/question-banks/${encodeId(bookId)}/items/${encodeId(itemId)}`),
  submitAnswer: (bookId: string | number, itemId: string | number, selectedAnswers: string[]) =>
    postJson<QuestionBankAnswerResult>(`/api/user/question-banks/${encodeId(bookId)}/items/${encodeId(itemId)}/answer`, {
      selectedAnswers,
    }),
  viewAnswer: (bookId: string | number, itemId: string | number) =>
    postJson<QuestionBankItem>(`/api/user/question-banks/${encodeId(bookId)}/items/${encodeId(itemId)}/view-answer`),
  updateItemState: (
    bookId: string | number,
    itemId: string | number,
    state: { isMastered?: boolean; isRedoMarked?: boolean; bookmarked?: boolean; subjectiveDrafts?: Record<string, string> },
  ) => patchJson<QuestionBankItem>(`/api/user/question-banks/${encodeId(bookId)}/items/${encodeId(itemId)}/state`, state),
  clearItemRecord: (bookId: string | number, itemId: string | number) =>
    deleteJson<QuestionBankItem>(`/api/user/question-banks/${encodeId(bookId)}/items/${encodeId(itemId)}/record`),
};
