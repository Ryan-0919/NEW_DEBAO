import { adminDelete, adminPatchJson, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";

export type AdminUserStatus = "active" | "disabled";
export type AdminUserRegistrationSource = "legacy_unknown" | "self_register" | "sms_auto_created" | "admin_created" | "admin_imported";
export type AdminUserRegistrationSourceFilter = "all" | "self_registered" | AdminUserRegistrationSource;

export type AdminPagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminUserSummary = {
  total: number;
  active: number;
  disabled: number;
  selfRegistered: number;
  adminAdded: number;
  legacyUnknown: number;
  fullDevices: number;
};

export type AdminCourse = {
  id: string;
  name: string;
  courseType?: "audio" | "video";
  status?: string;
  audioCount?: number;
  videoCount?: number;
  contentCount?: number;
};

export type AdminMockExamSeriesOption = {
  id: string;
  title: string;
  description: string;
  paperCount: number;
  paperTitles: string[];
};

export type AdminMockExamPaperSummary = {
  id: string;
  title: string;
  subtitle?: string;
  year?: number | null;
  phase?: string;
  seriesId?: string;
  seriesName?: string;
  maxAttempts?: number;
};

export type AdminQuestionBank = {
  id: string;
  name: string;
  code: string;
  status: string;
  isVisible: boolean;
  sortOrder: number;
};

export type AdminUser = {
  id: string;
  userCode?: string;
  phone: string;
  nickname: string;
  displayName: string;
  avatarUrl: string;
  status: AdminUserStatus;
  registrationSource: AdminUserRegistrationSource;
  registrationSourceLabel: string;
  registeredAt: string;
  lastLogin: string;
  deviceCount: number;
  deviceLimit?: number;
  deviceFull?: boolean;
  lastDevice?: {
    type: string;
    model: string;
    ip: string;
    loginTime: string;
  } | null;
  permissionCounts?: {
    courses: number;
    mockExamSeries: number;
    mockExamPapers: number;
    questionBanks: number;
    total: number;
  };
  coursePermissions: string[];
  questionBankPermissions: string[];
  mockExamPermissions: string[];
  mockExamAccessiblePaperIds: string[];
  mockExamPermissionConfigs: {
    paperId: string;
    manualAttemptLimit: number | null;
    manualAttemptUsed: number;
    currentRecordStartedAt: string;
  }[];
};

export type AdminDevice = {
  id: string;
  userId: string;
  deviceKey: string;
  type: string;
  model: string;
  loginTime: string;
  ip: string;
};

export type AdminUserDetail = {
  user: {
    id: string;
    userCode: string;
    phone: string;
    nickname: string;
    status: AdminUserStatus;
    registrationSource: AdminUserRegistrationSource;
    registrationSourceLabel: string;
    registeredAt: string;
    lastLogin: string;
  };
  learning: {
    summary: {
      courseCount: number;
      audioProgressCount: number;
      audioCompletedCount: number;
      videoProgressCount: number;
      videoCompletedCount: number;
      lastLearningAt: string;
    };
    courses: {
      courseId: string;
      courseName: string;
      courseType: "audio" | "video";
      status: string;
      totalContentCount: number;
      progressCount: number;
      completedCount: number;
      completionRate: number;
      lastLearningAt: string;
      lastContentName: string;
    }[];
  };
  questionBanks: {
    summary: {
      bookCount: number;
      answeredCount: number;
      masteredCount: number;
      redoCount: number;
      lastPracticedAt: string;
    };
    items: {
      bookId: string;
      bookName: string;
      code: string;
      status: string;
      isVisible: boolean;
      answeredCount: number;
      viewedAnswerCount: number;
      masteredCount: number;
      redoCount: number;
      lastPracticedAt: string;
      lastSubjectName: string;
      lastItemTitle: string;
    }[];
  };
  mockExams: {
    summary: {
      recordCount: number;
      submittedCount: number;
      inProgressCount: number;
      accessiblePaperCount: number;
      lastExamAt: string;
    };
    permissions: {
      paperId: string;
      title: string;
      seriesName: string;
      year: number | null;
      phase: string;
      paperType: string;
      totalScore: number;
      passScore: number;
      maxAttempts: number;
      manualAttemptLimit: number | null;
      manualAttemptUsed: number;
      remainingAttempts: number | null;
      currentRecordStartedAt: string;
    }[];
    records: {
      recordId: string;
      paperId: string;
      title: string;
      seriesName: string;
      year: number | null;
      phase: string;
      paperType: string;
      status: string;
      reviewWorkflowStatus: string;
      attemptNo: number;
      questionCount: number;
      answeredCount: number;
      correctCount: number;
      score: number;
      totalScore: number;
      allottedSeconds: number;
      consumedSeconds: number;
      startedAt: string;
      submittedAt: string;
      reviewedAt: string;
      publishedAt: string;
      updatedAt: string;
    }[];
  };
  orders: {
    summary: {
      orderCount: number;
      paidOrderCount: number;
      totalPaidAmount: string;
      lastPaidAt: string;
    };
    items: {
      id: string;
      orderNo: string;
      status: string;
      paymentStatus: string;
      totalAmount: string;
      payAmount: string;
      paidAt: string;
      cancelledAt: string;
      completedAt: string;
      createdAt: string;
      updatedAt: string;
      productNames: string[];
      items: {
        id: string;
        productName: string;
        productType: string;
        price: string;
        quantity: number;
        courseIds: string[];
      }[];
    }[];
  };
  auditLogs: {
    summary: {
      count: number;
    };
    items: {
      id: string;
      operatorAccount: string;
      operatorName: string;
      action: string;
      entityType: string;
      entityId: string;
      entityName: string;
      detail: string;
      createdAt: string;
    }[];
  };
};

export type BatchImportResult = {
  createdCount: number;
  appendedCount: number;
  failed: string[];
  parsedCount?: number;
};

export const adminUserService = {
  getSummary: () => adminRequest<AdminUserSummary>("/api/admin/users/summary"),
  getUsers: (params?: { keyword?: string; status?: AdminUserStatus | "all"; registrationSource?: AdminUserRegistrationSourceFilter; courseId?: string; page?: number; pageSize?: number }) =>
    adminRequest<AdminPagedResult<AdminUser>>(
      `/api/admin/users${buildAdminQueryString({
        keyword: params?.keyword,
        status: params?.status && params.status !== "all" ? params.status : undefined,
        registrationSource: params?.registrationSource && params.registrationSource !== "all" ? params.registrationSource : undefined,
        courseId: params?.courseId && params.courseId !== "all" ? params.courseId : undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      })}`,
    ),
  getCourses: () => adminRequest<AdminCourse[]>("/api/admin/courses"),
  getMockExamSeriesOptions: () => adminRequest<AdminMockExamSeriesOption[]>("/api/admin/users/mock-exam-papers"),
  getMockExamPapers: () => adminRequest<AdminMockExamPaperSummary[]>("/api/admin/mock-exam-papers"),
  getQuestionBanks: () => adminRequest<AdminQuestionBank[]>("/api/admin/question-banks"),
  getUserDetail: (userId: string) => adminRequest<AdminUserDetail>(`/api/admin/users/${userId}/detail`),
  createUser: (payload: { phone: string; courseIds: string[]; mockExamSeriesIds: string[]; questionBankBookIds: string[] }) =>
    adminPostJson<{ isNew: boolean; userId: string; phone: string }>("/api/admin/users", payload),
  batchImportUsers: (payload: { phones: string[]; courseIds: string[]; mockExamSeriesIds: string[]; questionBankBookIds: string[] }) =>
    adminPostJson<BatchImportResult>("/api/admin/users/batch-import", payload),
  updateUserPermissions: (
    userId: string,
    payload: {
      addCourses?: string[];
      removeCourses?: string[];
      addMockExamSeriesIds?: string[];
      removeMockExamSeriesIds?: string[];
      addQuestionBankBookIds?: string[];
      removeQuestionBankBookIds?: string[];
    },
  ) => adminPatchJson<{ success: boolean }>(`/api/admin/users/${userId}/permissions`, payload),
  batchAddPermissions: (payload: { userIds: string[]; courseIds: string[]; mockExamSeriesIds: string[]; questionBankBookIds: string[] }) =>
    adminPostJson<{ success: boolean }>("/api/admin/users/batch-permissions", payload),
  updatePassword: (userId: string, password: string) =>
    adminPatchJson<{ success: boolean }>(`/api/admin/users/${userId}/password`, { password }),
  updateStatus: (userId: string, status: AdminUserStatus) =>
    adminPatchJson<{ success: boolean }>(`/api/admin/users/${userId}/status`, { status }),
  batchUpdateStatus: (userIds: string[], status: AdminUserStatus) =>
    adminPostJson<{ success: boolean }>("/api/admin/users/batch-status", { userIds, status }),
  deleteUser: (userId: string) => adminDelete<{ success: boolean }>(`/api/admin/users/${userId}`),
  batchDeleteUsers: (userIds: string[]) => adminPostJson<{ success: boolean }>("/api/admin/users/batch-delete", { userIds }),
  getDevices: (userId: string) => adminRequest<AdminDevice[]>(`/api/admin/users/${userId}/devices`),
  removeDevice: (deviceId: string) => adminDelete<{ success: boolean }>(`/api/admin/devices/${deviceId}`),
  clearDevices: (userId: string) => adminDelete<{ success: boolean }>(`/api/admin/users/${userId}/devices`),
  resetMockExamAttempts: (userId: string, paperId: string) =>
    adminPostJson<{ paperId: string; manualAttemptLimit: number | null; manualAttemptUsed: number }>(
      `/api/admin/users/${userId}/mock-exam-permissions/${paperId}/reset-attempts`,
      {},
    ),
  resetMockExamTime: (userId: string, paperId: string) =>
    adminPostJson<{ paperId: string; recordId: string; currentRecordStartedAt: string }>(
      `/api/admin/users/${userId}/mock-exam-permissions/${paperId}/reset-time`,
      {},
    ),
};
