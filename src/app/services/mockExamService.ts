import { patchJson, postJson, request } from "./apiClient";

export type MockExamRecordStatus = "in_progress" | "submitted";
export type MockExamQuestionType = "single_choice" | "multiple_choice" | "uncertain_choice" | "subjective_case";

export interface MockExamRecordSummary {
  id: string;
  status: MockExamRecordStatus;
  attemptNo: number;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  totalScore: number;
  allottedSeconds: number;
  consumedSeconds: number;
  remainingSeconds: number;
  startedAt: string;
  submittedAt: string;
  reviewWorkflowStatus: string;
  returnedForRedo?: boolean;
  canResume: boolean;
}

export interface MockExamPaperSummary {
  id: string;
  code: string;
  seriesId: string;
  seriesName: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  paperType: "objective" | "subjective";
  year: number;
  phase: string;
  durationMinutes: number;
  maxAttempts: number;
  permissionRequired: boolean;
  openTime: string;
  isOpen: boolean;
  totalScore: number;
  questionCount: number;
  passScore: number;
  description: string;
  sections: Array<{ type: MockExamQuestionType; label: string; count: number; totalScore: number }>;
  activeRecord: MockExamRecordSummary | null;
  latestRecord: MockExamRecordSummary | null;
}

export interface MockExamOption {
  id: string;
  key: string;
  content: string;
}

export interface MockExamSubjectiveAnswerMark {
  id: string;
  highlight: string;
  comment: string;
  status?: "correct" | "wrong" | "score" | "neutral";
  score?: number;
  start?: number;
  end?: number;
}

export interface MockExamRubricPoint {
  id: string;
  title: string;
  score?: number;
  maxScore?: number;
  hit?: boolean;
  comment?: string;
}

export interface MockExamMissedPoint {
  id: string;
  title: string;
  score?: number;
  comment?: string;
  suggestion?: string;
}

export interface MockExamSubjectiveSubQuestion {
  id: string;
  title: string;
  placeholder: string;
  answer: string;
  wordCount: number;
  score: number;
  maxScore: number;
  reviewComment: string;
  referenceAnswer: string;
  isReviewed: boolean;
  answerMarks?: MockExamSubjectiveAnswerMark[];
  rubricGuidance?: string;
  rubricPoints?: MockExamRubricPoint[];
  missedPoints?: MockExamMissedPoint[];
  skippedReview?: boolean;
  skippedReviewReason?: string;
}

export interface MockExamQuestion {
  id: string;
  sortOrder: number;
  type: MockExamQuestionType;
  typeLabel: string;
  score: number;
  material: string;
  stem: string;
  analysis: string;
  options: MockExamOption[];
  userAnswerKeys: string[];
  correctAnswerKeys: string[];
  isCorrect: boolean | null;
  earnedScore: number;
  answerState: "unanswered" | "partial" | "answered";
  sectionLabel: string;
  sectionDescription: string;
  subjectiveSubQuestions: MockExamSubjectiveSubQuestion[];
  reviewSource?: "ai" | "rule" | "manual" | "system";
  reviewProvider?: string;
  lessonAudioUrl?: string;
  lessonAudioDurationSeconds?: number;
  reviewVoiceUrl?: string;
  reviewVoiceDurationSeconds?: number;
}

export interface MockExamRecordDetail {
  id: string;
  status: MockExamRecordStatus;
  attemptNo: number;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  totalScore: number;
  allottedSeconds: number;
  consumedSeconds: number;
  remainingSeconds: number;
  startedAt: string;
  submittedAt: string;
  reviewedAt: string;
  publishedAt: string;
  reviewWorkflowStatus: string;
  returnedForRedo?: boolean;
  paper: {
    id: string;
    code: string;
    title: string;
    subtitle: string;
    paperType: "objective" | "subjective";
    year: number;
    phase: string;
    durationMinutes: number;
    maxAttempts: number;
    totalScore: number;
    questionCount: number;
    passScore: number;
    description: string;
  };
  summary: {
    accuracyRate: number;
    wrongCount: number;
    unfinishedCount: number;
    finalScorePending: boolean;
    isPassed: boolean | null;
  };
  questions: MockExamQuestion[];
}

export interface MockExamHistoryItem {
  id: string;
  status: MockExamRecordStatus;
  attemptNo: number;
  totalScore: number;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  consumedSeconds: number;
  reviewStatus: string;
  reviewEnabled: boolean;
  reviewVisibleToUser: boolean;
  submittedAt: string;
  paper: {
    id: string;
    code: string;
    title: string;
    phase: string;
    year: number;
    totalScore: number;
    passScore: number;
    paperType: "objective" | "subjective";
  };
}

const encodeId = (id: string | number) => encodeURIComponent(`${id}`);
const paperTypeQuery = (paperType?: "objective" | "subjective") => (paperType ? `?paperType=${paperType}` : "");

export const mockExamService = {
  getPapers: (paperType?: "objective" | "subjective") => request<MockExamPaperSummary[]>(`/api/user/mock-exams/papers${paperTypeQuery(paperType)}`),
  getHistory: (paperType?: "objective" | "subjective") => request<MockExamHistoryItem[]>(`/api/user/mock-exams/history${paperTypeQuery(paperType)}`),
  startPaper: (paperId: string | number) => postJson<MockExamRecordDetail>(`/api/user/mock-exams/papers/${encodeId(paperId)}/start`),
  getRecord: (recordId: string | number) => request<MockExamRecordDetail>(`/api/user/mock-exams/records/${encodeId(recordId)}`),
  saveAnswer: (
    recordId: string | number,
    payload: { questionId: string; answerKeys?: string[]; answerText?: string; subQuestionId?: string },
  ) => patchJson<MockExamRecordDetail>(`/api/user/mock-exams/records/${encodeId(recordId)}/answers`, payload),
  submitRecord: (recordId: string | number) => postJson<MockExamRecordDetail>(`/api/user/mock-exams/records/${encodeId(recordId)}/submit`),
};
