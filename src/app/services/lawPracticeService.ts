import { postJson, putJson, request } from "./apiClient";

export type LawPracticePaperSummary = {
  id: string;
  code: string;
  title: string;
  description: string;
  questionCount: number;
  latestRecord: {
    id: string;
    status: LawPracticeRecordStatus;
    startedAt: string;
    submittedAt: string | null;
  } | null;
};

export type LawPracticeRecordStatus = "in_progress" | "submitted";

export type LawPracticeQuestionAnswer = {
  id: string;
  articleNo: string;
  answerText: string;
  updatedAt: string;
};

export type LawPracticeQuestionResult = {
  articleNoMatched: boolean;
  textMatched: boolean;
};

export type LawPracticeQuestionForRecord = {
  id: string;
  title: string;
  prompt: string;
  lawName: string;
  sortOrder: number;
  answer: LawPracticeQuestionAnswer | null;
  standardAnswer?: {
    articleNo: string;
    standardText: string;
    explanation: string;
  };
  result?: LawPracticeQuestionResult;
};

export type LawPracticeRecord = {
  id: string;
  status: LawPracticeRecordStatus;
  startedAt: string;
  submittedAt: string | null;
  paper: {
    id: string;
    code: string;
    title: string;
    description: string;
    questionCount: number;
  };
  questions: LawPracticeQuestionForRecord[];
};

export const lawPracticeService = {
  getPapers: () => request<LawPracticePaperSummary[]>("/api/user/law-practice/papers"),
  startPaper: (paperId: string) => postJson<LawPracticeRecord>(`/api/user/law-practice/papers/${encodeURIComponent(paperId)}/start`),
  getRecord: (recordId: string) => request<LawPracticeRecord>(`/api/user/law-practice/records/${encodeURIComponent(recordId)}`),
  saveAnswer: (recordId: string, questionId: string, payload: { articleNo: string; answerText: string }) =>
    putJson<LawPracticeQuestionAnswer>(
      `/api/user/law-practice/records/${encodeURIComponent(recordId)}/answers/${encodeURIComponent(questionId)}`,
      payload,
    ),
  submitRecord: (recordId: string) => postJson<LawPracticeRecord>(`/api/user/law-practice/records/${encodeURIComponent(recordId)}/submit`),
};
