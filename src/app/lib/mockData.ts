import { buildQueryString, patchJson, postJson, request } from "../services/apiClient";

export type MockExamAiReviewProvider = "rules" | "openai-compatible";
export type AdminMockExamPaperType = "objective" | "subjective";
export type MockExamQuestionType = "single_choice" | "multiple_choice" | "uncertain_choice" | "subjective_case";
export type MockExamRecordStatus = "in_progress" | "submitted";
export type MockExamQuestionAnswerState = "unanswered" | "partial" | "answered";
export type MockExamReviewWorkflowStatus = "not_required" | "ai_pending" | "ai_processing" | "manual_pending" | "published";

export interface MockExamLaunchConfigTab {
  key: "notice" | "rules" | "guide";
  label: string;
  html: string;
}

export interface MockExamLaunchConfig {
  login: {
    ticketLabel: string;
    idCardLabel: string;
    loginButtonText: string;
    resetButtonText: string;
    fullscreenTip: string;
  };
  notice: {
    readSeconds: number;
    beginPromptDelayMs: number;
    beginPromptMessage: string;
    countdownPrefix: string;
    startButtonText: string;
    startingButtonText: string;
    agreementText: string;
    agreePromptMessage: string;
    examOverMessage: string;
    confirmButtonText: string;
    backButtonText: string;
    candidateNameLabel: string;
    candidateGenderLabel: string;
    ticketLabel: string;
    idCardLabel: string;
    defaultCandidateName: string;
    defaultCandidateGender: string;
    avatarUrl: string;
    avatarObjectKey: string;
  };
  tabs: MockExamLaunchConfigTab[];
}

export interface PortalMemberHomeConfig {
  hero: {
    badge: string;
    title: string;
    description: string;
  };
  bannerImageUrl: string;
  bannerImageObjectKey: string;
  banners?: Array<{
    badge: string;
    title: string;
    description: string;
    imageUrl: string;
    imageObjectKey: string;
    primaryButtonText?: string;
    primaryButtonTarget?: string;
    secondaryButtonText?: string;
    secondaryButtonTarget?: string;
    isVisible?: boolean;
    sortOrder?: number;
  }>;
  joinGroup: {
    title: string;
    statusText: string;
    description: string;
    buttonText: string;
    modalTitle: string;
    modalHint: string;
    qrImageUrl: string;
    qrImageObjectKey: string;
  };
  sideAds?: {
    left?: PortalMemberHomeSideAd;
    right?: PortalMemberHomeSideAd;
  };
  announcement: {
    title: string;
    subtitle: string;
    badge: string;
    items: Array<{
      title: string;
      description: string;
      tag?: string;
      color?: string;
      time?: string;
      link?: string;
      isVisible?: boolean;
      sortOrder?: number;
    }>;
  };
  operations: {
    title: string;
    subtitle: string;
    items: Array<{ eyebrow: string; title: string; description: string; path: string }>;
  };
}

export interface PortalMemberHomeSideAd {
  title: string;
  description: string;
  imageUrl: string;
  imageObjectKey: string;
  buttonText: string;
  target: string;
  isVisible: boolean;
}

export interface PortalExamHomeConfig {
  eyebrow: string;
  title: string;
  objectiveModeLabel: string;
  subjectiveModeLabel: string;
  objectiveEmptyText: string;
  subjectiveEmptyText: string;
}

export interface PortalExamCountdownConfig {
  objective: {
    label: string;
    description: string;
    targetDate: string;
  };
  subjective: {
    label: string;
    description: string;
    targetDate: string;
  };
}

export interface PortalAccountCenterConfig {
  eyebrow: string;
  description: string;
  shortcutTitle: string;
  shortcuts: Array<{ title: string; description: string; path: string; accentText: string }>;
}

export interface UserHomeConfig {
  memberHome: PortalMemberHomeConfig;
  examHome: PortalExamHomeConfig;
  examCountdown?: PortalExamCountdownConfig;
  accountCenter: PortalAccountCenterConfig;
  customerServiceUrl?: string;
}

export interface BrandingConfig {
  brandLogoUrl: string;
  customerServiceUrl: string;
  playerDiscImageUrl: string;
  portalConfig?: unknown;
}

export interface MockExamSection {
  type: MockExamQuestionType;
  label: string;
  count: number;
  totalScore: number;
}

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
  reviewedAt?: string;
  reviewWorkflowStatus: MockExamReviewWorkflowStatus;
  canResume: boolean;
}

export interface MockExamPaper {
  id: string;
  code: string;
  seriesId?: string;
  seriesName?: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  coverObjectKey: string;
  paperType?: AdminMockExamPaperType;
  year: number;
  phase: string;
  durationMinutes: number;
  maxAttempts: number;
  reviewEnabled: boolean;
  reviewAttemptLimit: number;
  permissionRequired: boolean;
  openTime: string;
  isOpen: boolean;
  totalScore: number;
  questionCount: number;
  passScore: number;
  description: string;
  sections: MockExamSection[];
  activeRecord: MockExamRecordSummary | null;
  latestRecord: MockExamRecordSummary | null;
}

export interface MockExamQuestionOption {
  id: string;
  key: string;
  content: string;
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

export interface MockExamSubjectiveAnswerMark {
  id: string;
  highlight: string;
  comment: string;
  status?: "correct" | "wrong" | "score" | "neutral";
  score?: number;
  start?: number;
  end?: number;
}

export interface MockExamSubjectiveSubQuestion {
  id: string;
  title: string;
  placeholder: string;
  answer: string;
  wordCount: number;
  maxScore?: number;
  score?: number;
  reviewComment?: string;
  referenceAnswer?: string;
  reviewSource?: "ai" | "rule" | "manual" | "system";
  reviewProvider?: MockExamAiReviewProvider;
  isReviewed?: boolean;
  abilityLabel?: string;
  abilityScoreRate?: number;
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
  options: MockExamQuestionOption[];
  userAnswerKeys: string[];
  correctAnswerKeys: string[];
  isCorrect: boolean | null;
  earnedScore: number;
  answerState: MockExamQuestionAnswerState;
  sectionLabel: string;
  sectionDescription: string;
  subjectiveSubQuestions: MockExamSubjectiveSubQuestion[];
  reviewSource?: "ai" | "rule" | "manual" | "system";
  reviewProvider?: MockExamAiReviewProvider;
  reviewFeedbackStars?: number;
  reviewFeedbackSubmittedAt?: string;
  lessonAudioUrl?: string;
  lessonAudioObjectKey?: string;
  lessonAudioDurationSeconds?: number;
  reviewVoiceUrl?: string;
  reviewVoiceObjectKey?: string;
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
  reviewWorkflowStatus: MockExamReviewWorkflowStatus;
  paper: Omit<MockExamPaper, "activeRecord" | "latestRecord">;
  summary: {
    accuracyRate: number;
    wrongCount: number;
    unfinishedCount: number;
    pendingReviewCount: number;
    finalScorePending: boolean;
    isPassed: boolean | null;
  };
  questions: MockExamQuestion[];
  reviewEnabled: boolean;
}

export interface UserMockExamHistoryItem {
  id: string;
  status: MockExamRecordStatus;
  attemptNo: number;
  totalScore: number;
  questionCount: number;
  subjectiveQuestionCount: number;
  reviewStatus: "published" | "ai_pending" | "ai_processing" | "manual_pending" | "not_required";
  reviewEnabled: boolean;
  reviewVisibleToUser: boolean;
  submittedAt: string;
  reviewedAt: string;
  publishedAt: string;
  paper: {
    id: string;
    code: string;
    title: string;
    coverUrl: string;
    coverObjectKey: string;
    phase: string;
    year: number;
    totalScore: number;
    passScore: number;
    paperType?: AdminMockExamPaperType;
  };
}

export interface MockExamLeaderboardPaperOption {
  id: string;
  code: string;
  title: string;
  phase: string;
  year: number;
  coverUrl: string;
  paperType: AdminMockExamPaperType;
}

export interface MockExamLeaderboardEntry {
  rank: number;
  manualRank: number | null;
  userId: string;
  userPhone: string;
  score: number;
  submittedAt: string;
  attemptNo: number;
  isCurrentUser: boolean;
}

export interface MockExamLeaderboardDetail {
  paper: {
    id: string;
    code: string;
    title: string;
    phase: string;
    year: number;
    coverUrl: string;
    totalScore: number;
    passScore: number;
    questionCount: number;
    paperType: AdminMockExamPaperType;
  };
  currentUserBestScore: number | null;
  currentUserBestRank: number | null;
  totalParticipants: number;
  leaderboard: MockExamLeaderboardEntry[];
}

export type TypingPracticeTextStatus = "draft" | "published";
export type TypingPracticeDifficulty = "easy" | "medium" | "hard";
export type TypingPracticeMode = "guided" | "sprint" | "memorize";

export interface TypingPracticeDifficultyConfig {
  difficulty: TypingPracticeDifficulty;
  label: string;
  initialLives: number;
  baseStageTimeSeconds: number;
  extraTimePer20Chars: number;
  minStageTimeSeconds: number;
  levelTimeReductionSeconds: number;
  thiefSpeedBase: number;
  thiefSpeedStepLevels: number;
  scorePerChar: number;
  errorPenalty: number;
  captureBonus: number;
  lifeBonus: number;
  memorizePreviewSeconds: number;
}

export interface TypingPracticeFolder {
  id: string;
  name: string;
  sortOrder: number;
  textCount: number;
  publishedTextCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TypingPracticeText {
  id: string;
  folderId: string;
  folderName: string;
  title: string;
  difficulty: TypingPracticeDifficulty;
  difficultyLabel: string;
  source: string;
  tags: string[];
  content: string;
  note: string;
  status: TypingPracticeTextStatus;
  statusLabel: string;
  sortOrder: number;
  contentLength: number;
  preview: string;
  createdAt: string;
  updatedAt: string;
  difficultyConfig?: TypingPracticeDifficultyConfig | null;
  playTicket?: string;
}

export interface TypingPracticeRecord {
  id: string;
  textId: string;
  mode: TypingPracticeMode;
  modeLabel: string;
  difficulty: TypingPracticeDifficulty;
  difficultyLabel: string;
  title: string;
  source: string;
  targetLength: number;
  typedLength: number;
  correctLength: number;
  errorCount: number;
  backspaceCount: number;
  comboMax: number;
  accuracyRate: number;
  completionRate: number;
  cpm: number;
  score: number;
  durationSeconds: number;
  timeLimitSeconds: number | null;
  previewSeconds: number | null;
  createdAt: string;
  completedAt: string;
  targetPreview: string;
  typedPreview: string;
  contentSnapshot: string;
  typedContent: string;
}

export interface TypingPracticeRecordListPayload {
  items: TypingPracticeRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TypingPracticeLeaderboardEntry {
  rank: number;
  userId: string;
  userLabel: string;
  bestScore: number;
  bestCpm: number;
  practiceCount: number;
  avgAccuracyRate: number;
  lastCompletedAt: string;
}

export interface TypingPracticeHomeConfig {
  hero: {
    title: string;
    englishTitle: string;
    description: string;
    topNotice: string;
    policeImageUrl: string;
    policeImageObjectKey: string;
    thiefImageUrl: string;
    thiefImageObjectKey: string;
  };
  modeHints: Record<TypingPracticeMode, string>;
  rules: {
    paragraphs: Array<{ text: string }>;
    cards: Array<{ title: string; description: string }>;
  };
}

export interface TypingPracticeHomePayload {
  homeConfig: TypingPracticeHomeConfig;
  summary: {
    totalFolders: number;
    totalTexts: number;
    practiceCount: number;
    avgAccuracyRate: number;
    avgCpm: number;
    bestCpm: number;
    bestScore: number;
    totalTypedLength: number;
  };
  folders: TypingPracticeFolder[];
  texts: TypingPracticeText[];
  recentRecords: TypingPracticeRecord[];
}

export interface TypingPracticeRecordPayload {
  textId?: string;
  mode: TypingPracticeMode;
  difficulty: TypingPracticeDifficulty;
  title: string;
  sourceSnapshot?: string;
  contentSnapshot: string;
  typedContent: string;
  playTicket?: string;
  errorCount: number;
  backspaceCount: number;
  comboMax: number;
  capturedStageCount?: number;
  livesRemaining?: number;
  durationSeconds: number;
  timeLimitSeconds?: number;
  previewSeconds?: number;
}

const encodeId = (id: string | number) => encodeURIComponent(`${id}`);

const postJsonWithOptions = <T>(path: string, body: unknown, options?: RequestInit) =>
  request<T>(path, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify(body ?? {}),
  });

export const mockApi = {
  getBrandingConfig: () => request<BrandingConfig>("/api/auth/branding"),
  getUserHomeConfig: () => request<UserHomeConfig>("/api/auth/user-home-config"),
  getMockExamPapers: () => request<MockExamPaper[]>("/api/user/mock-exams/papers"),
  getMockExamLaunchConfig: () => request<MockExamLaunchConfig>("/api/user/mock-exams/launch-config"),
  getUserMockExamHistory: () => request<UserMockExamHistoryItem[]>("/api/user/mock-exams/history"),
  getUserMockExamLeaderboardPapers: () => request<MockExamLeaderboardPaperOption[]>("/api/user/mock-exams/leaderboard/papers"),
  getUserMockExamLeaderboard: (paperId: string) =>
    request<MockExamLeaderboardDetail>(`/api/user/mock-exams/leaderboard/${encodeId(paperId)}`),
  startMockExam: (paperId: string) => postJson<MockExamRecordDetail>(`/api/user/mock-exams/papers/${encodeId(paperId)}/start`, {}),
  getMockExamRecord: (recordId: string) => request<MockExamRecordDetail>(`/api/user/mock-exams/records/${encodeId(recordId)}`),
  pauseMockExam: (recordId: string, options?: { keepalive?: boolean }) =>
    postJsonWithOptions<MockExamRecordDetail>(
      `/api/user/mock-exams/records/${encodeId(recordId)}/pause`,
      {},
      options?.keepalive ? { keepalive: true } : undefined,
    ),
  saveMockExamAnswer: (
    recordId: string,
    payload:
      | { questionId: string; answerKeys: string[] }
      | { questionId: string; subQuestionId: string; answerText: string },
  ) => patchJson<MockExamRecordDetail>(`/api/user/mock-exams/records/${encodeId(recordId)}/answers`, payload),
  submitMockExam: (recordId: string) => postJson<MockExamRecordDetail>(`/api/user/mock-exams/records/${encodeId(recordId)}/submit`, {}),
  submitMockExamReviewFeedback: (recordId: string, questionId: string, payload: { stars: number }) =>
    postJson<MockExamRecordDetail>(
      `/api/user/mock-exams/records/${encodeId(recordId)}/questions/${encodeId(questionId)}/review-feedback`,
      payload,
    ),
  getTypingPracticeHome: () => request<TypingPracticeHomePayload>("/api/user/typing-practice/home"),
  getTypingPracticeText: (textId: string, params?: { mode?: TypingPracticeMode; difficulty?: TypingPracticeDifficulty; timeLimitSeconds?: number }) =>
    request<TypingPracticeText>(
      `/api/user/typing-practice/texts/${encodeId(textId)}${buildQueryString({
        mode: params?.mode,
        difficulty: params?.difficulty,
        limit: params?.timeLimitSeconds,
      })}`,
    ),
  createTypingPracticeRecord: (payload: TypingPracticeRecordPayload) =>
    postJson<TypingPracticeRecord>("/api/user/typing-practice/records", payload),
  getTypingPracticeRecords: (params?: { page?: number; pageSize?: number }) =>
    request<TypingPracticeRecordListPayload>(
      `/api/user/typing-practice/records${buildQueryString({
        page: params?.page,
        pageSize: params?.pageSize,
      })}`,
    ),
  getTypingPracticeLeaderboard: (params?: { limit?: number }) =>
    request<TypingPracticeLeaderboardEntry[]>(
      `/api/user/typing-practice/leaderboard${buildQueryString({
        limit: params?.limit,
      })}`,
    ),
  getTypingPracticeRecord: (recordId: string) =>
    request<TypingPracticeRecord>(`/api/user/typing-practice/records/${encodeId(recordId)}`),
};

export { buildQueryString };
