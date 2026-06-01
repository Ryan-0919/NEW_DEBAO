import { patchJson, postJson, request } from "./apiClient";

export type LegacyUserStatus = "active" | "disabled";

export interface LegacyUser {
  id: string;
  phone: string;
  nickname?: string;
  displayName?: string;
  avatarUrl?: string;
  avatarObjectKey?: string;
  status: LegacyUserStatus;
  registeredAt: string;
  lastLogin: string;
  deviceCount: number;
  coursePermissions: string[];
  mockExamPermissions: string[];
  mockExamAccessiblePaperIds?: string[];
}

export interface AuthResult {
  success: boolean;
  token: string;
  user: LegacyUser;
}

export interface DeviceInfo {
  deviceKey: string;
  type: string;
  model: string;
}

export interface UserStudySummary {
  stats: {
    totalPracticeCount: number;
    correctPracticeCount: number;
    accuracyRate: number | null;
    learnedSeconds: number;
    learnedHours: number;
    learningHoursBeatPercent: number;
    weekLearnedSeconds: number;
    weekLearnedHours: number;
    completedCourseContentCount: number;
    activeCourseProgressCount: number;
    wrongCount: number;
    bookmarkedCount: number;
    authorizedQuestionBankCount: number;
    mockExamRecordCount: number;
    completedObjectiveExamCount: number;
    completedSubjectiveExamCount: number;
    typingPracticeCount: number;
    typingAvgAccuracyRate: number | null;
    typingAvgCpm: number;
    typingBestCpm: number;
    typingBestScore: number;
    typingTotalTypedLength: number;
    orderCount: number;
  };
  weekData: Array<{ day: string; date: string; seconds: number; hours: number }>;
  heatmapDays: Array<{ date: string; count: number }>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    occurredAt: string;
    relativeTime: string;
  }>;
  orders: Array<{
    id: string;
    orderNo: string;
    name: string;
    type: string;
    amount: number;
    totalAmount: number;
    status: string;
    statusLabel: string;
    paymentStatus: string;
    paidAt: string;
    createdAt: string;
    itemCount: number;
  }>;
}

export const userService = {
  login: (phone: string, password: string, deviceInfo: DeviceInfo) =>
    postJson<AuthResult>("/api/auth/user/login", { phone, password, ...deviceInfo }),

  sendLoginSmsCode: (phone: string) =>
    postJson<{ success: boolean; expiresIn: number; retryAfter: number }>("/api/auth/user/sms/send", { phone }),

  loginWithSmsCode: (phone: string, code: string, deviceInfo: DeviceInfo) =>
    postJson<AuthResult>("/api/auth/user/sms/login", { phone, code, ...deviceInfo }),

  register: (phone: string, password: string, confirmPassword: string, agreeTerms: boolean, deviceInfo: DeviceInfo) =>
    postJson<AuthResult>("/api/auth/user/register", {
      phone,
      password,
      confirmPassword,
      agreeTerms,
      ...deviceInfo,
    }),

  getCurrentUser: () => request<LegacyUser>("/api/auth/user/me"),

  getStudySummary: () => request<UserStudySummary>("/api/user/study-summary"),

  updateProfile: (payload: { nickname: string }) => patchJson<LegacyUser>("/api/auth/user/profile", payload),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.set("file", file);
    return request<LegacyUser>("/api/auth/user/profile/avatar", {
      method: "POST",
      body: formData,
    });
  },

  updatePassword: (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
    patchJson<{ success: boolean }>("/api/auth/user/password", payload),

  logout: (_userId: string, deviceKey?: string) => postJson<{ success: boolean }>("/api/auth/user/logout", { deviceKey }),
};
