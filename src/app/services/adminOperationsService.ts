import { adminDelete, adminPatchJson, adminPostForm, adminPostJson, adminRequest, adminRequestBlob, buildAdminQueryString } from "./adminApiClient";

export type AdminRoleValue = "super_admin" | "operations_admin" | "user_admin" | "review_admin";

export type AdminPagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminDashboardSummary = {
  users: {
    total: number;
    active: number;
    disabled: number;
    onlineNow: number;
    onlineToday: number;
    registeredToday: number;
    registered7d: number;
    active30d: number;
    onlineWindowMinutes: number;
  };
  content: {
    courseCount: number;
    openCourseCount: number;
    closedCourseCount: number;
    audioCount: number;
    videoCount: number;
    questionBankCount: number;
    typingRecordCount: number;
  };
  exams: {
    paperCount: number;
    objectivePaperCount: number;
    subjectivePaperCount: number;
    submittedRecordCount: number;
    inProgressRecordCount: number;
    pendingReviewCount: number;
    publishedReviewCount: number;
  };
  recentAuditLogs: {
    id: string;
    operatorAccount: string;
    operatorName: string;
    action: string;
    entityType: string;
    entityName: string;
    createdAt: string;
  }[];
  generatedAt: string;
};

export type AdminAccount = {
  id: string;
  account: string;
  name: string;
  role: AdminRoleValue;
  auditCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminLogsSummary = {
  auditTotal: number;
  webhookTotal: number;
  auditToday: number;
  webhookToday: number;
  webhookFailed: number;
  latestAuditAt: string;
  latestWebhookAt: string;
};

export type AdminAuditLog = {
  id: string;
  operatorAccount: string;
  operatorName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  detail: string;
  createdAt: string;
};

export type AdminWebhookLog = {
  id: string;
  scene: string;
  status: "success" | "failed" | "skipped";
  title: string;
  webhookUrl: string;
  messagePreview: string;
  responseCode: number | null;
  errorMessage: string;
  relatedEntityType: string;
  relatedEntityId: string;
  createdAt: string;
};

export type PortalConfig = Record<string, any>;

export type AdminSystemConfig = {
  id: number;
  webhookUrl: string;
  customerServiceUrl: string;
  brandLogoUrl: string;
  brandLogoObjectKey: string;
  playerDiscImageUrl: string;
  playerDiscImageObjectKey: string;
  portalConfig: PortalConfig;
  createdAt: string;
  updatedAt: string;
};

export type AdminSystemImageUploadResult = {
  url: string;
  objectKey: string;
  fileName: string;
};

export type AdminMockExamAiReviewConfig = {
  provider: "rules" | "openai-compatible";
  baseUrl: string;
  apiKey: string;
  apiKeyConfigured: boolean;
  model: string;
  disableQueue: boolean;
  timeoutMs: number;
  maxConcurrency: number;
  maxRetryCount: number;
  retryDelayMs: number;
  retryCooldownMs: number;
  queuePollIntervalMs: number;
  allowRuleFallback: boolean;
  maxTokens: number;
  strictAnswerMarkValidation: boolean;
  temperature: number;
  systemPrompt: string;
  gradingPrinciplesTemplate: string;
  outputRequirementsPrompt: string;
  userPromptTemplate: string;
};

export type AdminLearningAnnouncementItem = {
  id?: string;
  title: string;
  description: string;
  tag: string;
  color: string;
  time: string;
  link: string;
  isVisible: boolean;
  sortOrder: number;
};

export type AdminLearningAnnouncements = {
  title: string;
  subtitle: string;
  badge: string;
  items: AdminLearningAnnouncementItem[];
  updatedAt: string;
};

export type AdminCourseQuestionBankLink = {
  courseId: string;
  bookIds: string[];
};

export type AdminExamRecordSummary = {
  total: number;
  submitted: number;
  inProgress: number;
  pendingReview: number;
  published: number;
  objective: number;
  subjective: number;
  generatedAt: string;
};

export type AdminExamPaperOption = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  seriesId: string;
  seriesName: string;
  paperType: string;
  paperTypeLabel: string;
  year: number | null;
  phase: string;
  status: string;
  totalScore: number;
  passScore: number;
  recordCount: number;
  leaderboardCount: number;
};

export type AdminExamRecord = {
  id: string;
  recordId: string;
  userId: string;
  userPhone: string;
  userNickname: string;
  userStatus: string;
  userLabel: string;
  paperId: string;
  paperCode: string;
  paperTitle: string;
  seriesId: string;
  seriesName: string;
  paperType: string;
  paperTypeLabel: string;
  status: string;
  statusLabel: string;
  reviewWorkflowStatus: string;
  reviewWorkflowStatusLabel: string;
  attemptNo: number;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  score: number;
  paperTotalScore: number;
  passScore: number;
  allottedSeconds: number;
  consumedSeconds: number;
  manualRank: number | null;
  startedAt: string;
  submittedAt: string;
  reviewedAt: string;
  publishedAt: string;
  updatedAt: string;
};

export type AdminExamRecordDetail = AdminExamRecord & {
  answers: {
    id: string;
    questionId: string;
    score: number;
    isCorrect: boolean | null;
    answer: unknown;
    review: unknown;
    updatedAt: string;
  }[];
};

export type AdminExamRecordScorePage = AdminPagedResult<AdminExamRecord> & {
  paper: AdminExamPaperOption;
};

export type AdminExamRecordExportScope = "all" | "paper" | "series" | "filtered";

export const adminOperationsService = {
  getDashboardSummary: () => adminRequest<AdminDashboardSummary>("/api/admin/dashboard/summary"),
  getAdmins: () => adminRequest<AdminAccount[]>("/api/admin/admins"),
  createAdmin: (payload: { account: string; name: string; role: AdminRoleValue; password: string }) =>
    adminPostJson<AdminAccount>("/api/admin/admins", payload),
  updateAdmin: (adminId: string, payload: { account: string; name: string; role: AdminRoleValue }) =>
    adminPatchJson<AdminAccount>(`/api/admin/admins/${encodeURIComponent(adminId)}`, payload),
  resetAdminPassword: (adminId: string, password: string) =>
    adminPatchJson<{ success: boolean }>(`/api/admin/admins/${encodeURIComponent(adminId)}/password`, { password }),
  deleteAdmin: (adminId: string) => adminDelete<{ success: boolean }>(`/api/admin/admins/${encodeURIComponent(adminId)}`),
  getLogsSummary: () => adminRequest<AdminLogsSummary>("/api/admin/logs/summary"),
  getAuditLogs: (params: { page?: number; pageSize?: number; keyword?: string; entityType?: string; action?: string } = {}) =>
    adminRequest<AdminPagedResult<AdminAuditLog>>(`/api/admin/logs/audit${buildAdminQueryString(params)}`),
  getWebhookLogs: (params: { page?: number; pageSize?: number; keyword?: string; scene?: string; status?: string } = {}) =>
    adminRequest<AdminPagedResult<AdminWebhookLog>>(`/api/admin/logs/webhooks${buildAdminQueryString(params)}`),
  getSystemConfig: () => adminRequest<AdminSystemConfig>("/api/admin/system-config"),
  updateSystemConfig: (payload: Partial<AdminSystemConfig>) => adminPatchJson<AdminSystemConfig>("/api/admin/system-config", payload),
  getCourseQuestionBankLinks: () => adminRequest<AdminCourseQuestionBankLink[]>("/api/admin/course-question-bank-links"),
  updateCourseQuestionBankLink: (courseId: string, bookIds: string[]) =>
    adminPatchJson<AdminCourseQuestionBankLink[]>(`/api/admin/course-question-bank-links/${encodeURIComponent(courseId)}`, { bookIds }),
  getLearningAnnouncements: () => adminRequest<AdminLearningAnnouncements>("/api/admin/learning-announcements"),
  updateLearningAnnouncements: (payload: Omit<AdminLearningAnnouncements, "updatedAt">) =>
    adminPatchJson<AdminLearningAnnouncements>("/api/admin/learning-announcements", payload),
  getMockExamAiReviewConfig: () => adminRequest<AdminMockExamAiReviewConfig>("/api/admin/mock-exam-ai-review-config"),
  updateMockExamAiReviewConfig: (payload: AdminMockExamAiReviewConfig) =>
    adminPatchJson<AdminMockExamAiReviewConfig>("/api/admin/mock-exam-ai-review-config", payload),
  uploadSystemImage: (file: File) => {
    const formData = new FormData();
    formData.set("file", file);
    return adminPostForm<AdminSystemImageUploadResult>("/api/admin/system-config/image/upload", formData);
  },
  testWebhook: (webhookUrl?: string) => adminPostJson<{ success: boolean; responseCode: number | null }>("/api/admin/system-config/test-webhook", { webhookUrl }),
  getExamRecordSummary: () => adminRequest<AdminExamRecordSummary>("/api/admin/exam-records/summary"),
  getExamPapers: (params: { keyword?: string; paperType?: string } = {}) =>
    adminRequest<AdminExamPaperOption[]>(`/api/admin/exam-records/papers${buildAdminQueryString(params)}`),
  getExamRecords: (
    params: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      paperId?: string;
      seriesId?: string;
      paperType?: string;
      status?: string;
      reviewWorkflowStatus?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) => adminRequest<AdminPagedResult<AdminExamRecord>>(`/api/admin/exam-records${buildAdminQueryString(params)}`),
  exportExamRecords: (
    params: {
      scope: AdminExamRecordExportScope;
      keyword?: string;
      paperId?: string;
      seriesId?: string;
      paperType?: string;
      status?: string;
      reviewWorkflowStatus?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) => adminRequestBlob(`/api/admin/exam-records/export${buildAdminQueryString(params)}`),
  getExamRecordDetail: (recordId: string) => adminRequest<AdminExamRecordDetail>(`/api/admin/exam-records/${encodeURIComponent(recordId)}`),
  getPaperScores: (
    paperId: string,
    params: { page?: number; pageSize?: number; keyword?: string; status?: string; reviewWorkflowStatus?: string } = {},
  ) => adminRequest<AdminExamRecordScorePage>(`/api/admin/exam-records/papers/${encodeURIComponent(paperId)}/scores${buildAdminQueryString(params)}`),
  updatePaperLeaderboardRanks: (paperId: string, items: { userId: string; manualRank: number | null }[]) =>
    adminPatchJson<{ success: boolean; updatedCount: number }>(`/api/admin/exam-records/papers/${encodeURIComponent(paperId)}/leaderboard-ranks`, {
      items,
    }),
};
