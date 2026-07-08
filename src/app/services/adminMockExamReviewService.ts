import { adminPatchJson, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";

export type AdminReviewWorkflowStatus = "ai_pending" | "ai_processing" | "manual_pending" | "published" | "returned_for_redo";

export type AdminMockExamReviewerWorkload = {
  id: string;
  account: string;
  name: string;
  role: string;
  assignedPendingCount: number;
  lastHourCount: number;
  todayCount: number;
  totalCount: number;
  claimedCount: number;
  lastPublishedAt: string;
};

export type AdminMockExamReviewStats = {
  paperCount?: number;
  total: number;
  aiPending: number;
  aiProcessing: number;
  aiProblem: number;
  manualPending: number;
  published: number;
  mine: number;
  locked: number;
};

export type AdminMockExamReviewPaper = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  seriesId: string;
  seriesName: string;
  status: string;
  year: number;
  phase: string;
  durationMinutes: number;
  totalScore: number;
  questionCount: number;
  subjectiveQuestionCount: number;
  reviewEnabled: boolean;
  updatedAt: string;
  stats: AdminMockExamReviewStats;
};

export type AdminMockExamReviewRecord = {
  id: string;
  userId: string;
  userLabel: string;
  userPhone: string;
  attemptNo: number;
  status: string;
  reviewWorkflowStatus: AdminReviewWorkflowStatus;
  totalScore: number;
  answeredCount: number;
  questionCount: number;
  subjectiveQuestionCount: number;
  answeredSubjectiveCount: number;
  reviewedSubjectiveCount: number;
  publishedSubjectiveCount?: number;
  submittedAt: string;
  updatedAt: string;
  reviewedAt: string;
  publishedAt: string;
  assignedReviewerId: string;
  assignedReviewerName: string;
  assignedAt: string;
  assignedByAdminId: string;
  assignedByAdminName: string;
  publishedReviewerId: string;
  publishedReviewerName: string;
  hasPublishedReview?: boolean;
  consumedSeconds: number;
  lastAiReviewError: string;
  manualReviewVersion: number;
  reviewerName: string;
  lock: AdminMockExamReviewLock;
};

export type AdminMockExamReviewGlobalRecord = AdminMockExamReviewRecord & {
  paper: {
    id: string;
    code: string;
    title: string;
    subtitle: string;
    seriesName: string;
    year: number;
    phase: string;
    totalScore: number;
  };
};

export type AdminMockExamReviewLock = {
  active: boolean;
  ownedByMe: boolean;
  expired: boolean;
  canClaim: boolean;
  canEdit: boolean;
  reviewerId: string;
  reviewerName: string;
  claimedAt: string;
  expiresAt: string;
  lockToken: string;
};

export type AdminMockExamReviewSubQuestion = {
  id: string;
  title: string;
  answer: string;
  wordCount: number;
  score: number;
  maxScore: number;
  reviewComment: string;
  referenceAnswer: string;
  abilityLabel: string;
  rubricGuidance: string;
  rubricPoints: {
    id: string;
    title: string;
    description: string;
    score: number;
    maxScore: number;
    awardedScore: number;
    hit: boolean;
    comment: string;
  }[];
  missedPoints: {
    id: string;
    title: string;
    description: string;
    score: number;
    comment: string;
    suggestion: string;
  }[];
  answerMarks: {
    id: string;
    highlight: string;
    comment: string;
    status: "correct" | "wrong" | "score" | "neutral";
    score?: number;
    start?: number;
    end?: number;
  }[];
  skippedReview: boolean;
  skippedReviewReason: string;
  isReviewed: boolean;
};

export type AdminMockExamReviewQuestion = {
  id: string;
  sortOrder: number;
  type: string;
  score: number;
  material: string;
  stem: string;
  analysis: string;
  sectionLabel: string;
  sectionDescription: string;
  earnedScore: number;
  hasReview: boolean;
  subQuestions: AdminMockExamReviewSubQuestion[];
};

export type AdminMockExamReviewDetail = {
  record: AdminMockExamReviewRecord & {
    userStatus: string;
    correctCount: number;
  };
  paper: {
    id: string;
    code: string;
    title: string;
    subtitle: string;
    seriesName: string;
    paperType: string;
    year: number;
    phase: string;
    durationMinutes: number;
    totalScore: number;
    passScore: number;
    reviewEnabled: boolean;
    subjectiveQuestionCount: number;
  };
  questions: AdminMockExamReviewQuestion[];
};

export type AdminMockExamReviewPaged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminMockExamReviewRecordPage = AdminMockExamReviewPaged<AdminMockExamReviewRecord> & {
  paper: Pick<
    AdminMockExamReviewPaper,
    "id" | "code" | "title" | "subtitle" | "seriesName" | "year" | "phase" | "totalScore" | "questionCount" | "subjectiveQuestionCount" | "stats"
  >;
};

export type AdminMockExamReviewGlobalRecordPage = AdminMockExamReviewPaged<AdminMockExamReviewGlobalRecord> & {
  stats: AdminMockExamReviewStats;
};

export type AdminMockExamReviewSavePayload = {
  lockToken: string;
  manualReviewVersion: number;
  answers: {
    questionId: string;
    subQuestions: Partial<AdminMockExamReviewSubQuestion>[];
  }[];
};

export type AdminMockExamReviewBatchAiReviewResult = {
  successCount: number;
  failedCount: number;
  results: {
    recordId: string;
    success: boolean;
    message: string;
  }[];
};

export type AdminMockExamReviewBatchAssignResult = {
  successCount: number;
  failedCount: number;
  results: {
    recordId: string;
    success: boolean;
    message: string;
  }[];
};

export type AdminMockExamReviewReturnForRedoResult = {
  recordId: string;
  reviewWorkflowStatus: "returned_for_redo";
};

export const adminMockExamReviewService = {
  getSummary: () => adminRequest<AdminMockExamReviewStats>("/api/admin/mock-exam-reviews/summary"),
  getPapers: (params: { page?: number; pageSize?: number; keyword?: string } = {}) =>
    adminRequest<AdminMockExamReviewPaged<AdminMockExamReviewPaper>>(`/api/admin/mock-exam-reviews/papers${buildAdminQueryString(params)}`),
  getRecords: (params: { page?: number; pageSize?: number; status?: string; keyword?: string } = {}) =>
    adminRequest<AdminMockExamReviewGlobalRecordPage>(`/api/admin/mock-exam-reviews/records${buildAdminQueryString(params)}`),
  getPaperRecords: (
    paperId: string,
    params: { page?: number; pageSize?: number; status?: string; keyword?: string } = {},
  ) => adminRequest<AdminMockExamReviewRecordPage>(`/api/admin/mock-exam-reviews/papers/${encodeURIComponent(paperId)}/records${buildAdminQueryString(params)}`),
  getRecord: (recordId: string) => adminRequest<AdminMockExamReviewDetail>(`/api/admin/mock-exam-reviews/records/${encodeURIComponent(recordId)}`),
  getReviewers: () => adminRequest<AdminMockExamReviewerWorkload[]>("/api/admin/mock-exam-reviews/reviewers"),
  assignReviewer: (recordId: string, reviewerId: string) =>
    adminPostJson<AdminMockExamReviewDetail>(`/api/admin/mock-exam-reviews/records/${encodeURIComponent(recordId)}/assign-reviewer`, { reviewerId }),
  batchAssignReviewer: (recordIds: string[], reviewerId: string) =>
    adminPostJson<AdminMockExamReviewBatchAssignResult>("/api/admin/mock-exam-reviews/records/batch-assign-reviewer", { recordIds, reviewerId }),
  claimRecord: (recordId: string) => adminPostJson<AdminMockExamReviewDetail>(`/api/admin/mock-exam-reviews/records/${encodeURIComponent(recordId)}/claim`),
  runAiReview: (recordId: string) => adminPostJson<AdminMockExamReviewDetail>(`/api/admin/mock-exam-reviews/records/${encodeURIComponent(recordId)}/ai-review`),
  batchRunAiReview: (recordIds: string[]) =>
    adminPostJson<AdminMockExamReviewBatchAiReviewResult>("/api/admin/mock-exam-reviews/records/batch-ai-review", { recordIds }),
  recallPublishedReview: (recordId: string) =>
    adminPostJson<AdminMockExamReviewDetail>(`/api/admin/mock-exam-reviews/records/${encodeURIComponent(recordId)}/recall-published-review`),
  returnForRedo: (recordId: string, payload: { reason?: string } = {}) =>
    adminPostJson<AdminMockExamReviewReturnForRedoResult>(`/api/admin/mock-exam-reviews/records/${encodeURIComponent(recordId)}/return-for-redo`, payload),
  releaseRecord: (recordId: string) => adminPostJson<AdminMockExamReviewDetail>(`/api/admin/mock-exam-reviews/records/${encodeURIComponent(recordId)}/release`),
  saveDraft: (recordId: string, payload: AdminMockExamReviewSavePayload) =>
    adminPatchJson<AdminMockExamReviewDetail>(`/api/admin/mock-exam-reviews/records/${encodeURIComponent(recordId)}/review-draft`, payload),
  publish: (recordId: string, payload: AdminMockExamReviewSavePayload) =>
    adminPostJson<AdminMockExamReviewDetail>(`/api/admin/mock-exam-reviews/records/${encodeURIComponent(recordId)}/publish`, payload),
};
