import { adminDelete, adminPatchJson, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";
import type { AdminPagedResult } from "./adminContentService";
import type { TypingPracticeDifficulty, TypingPracticeTextStatus } from "../lib/mockData";

export type AdminTypingPracticeSummary = {
  totalFolders: number;
  totalTexts: number;
  publishedTexts: number;
  draftTexts: number;
  totalRecords: number;
};

export type AdminTypingPracticeFolder = {
  id: string;
  name: string;
  sortOrder: number;
  textCount: number;
  publishedTextCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminTypingPracticeText = {
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
};

export type AdminTypingPracticeTextPayload = {
  folderId: string;
  title: string;
  difficulty: TypingPracticeDifficulty;
  source?: string;
  tags?: string[] | string;
  content: string;
  note?: string;
  status: TypingPracticeTextStatus;
  sortOrder: number;
};

export type AdminTypingPracticeRecord = {
  id: string;
  textId: string;
  userLabel: string;
  mode: string;
  modeLabel: string;
  difficulty: TypingPracticeDifficulty;
  difficultyLabel: string;
  title: string;
  source: string;
  targetLength: number;
  correctLength: number;
  errorCount: number;
  accuracyRate: number;
  completionRate: number;
  cpm: number;
  score: number;
  durationSeconds: number;
  completedAt: string;
  targetPreview: string;
};

export const adminTypingPracticeService = {
  getSummary: () => adminRequest<AdminTypingPracticeSummary>("/api/admin/typing-practice/summary"),
  getFolders: () => adminRequest<AdminTypingPracticeFolder[]>("/api/admin/typing-practice/folders"),
  createFolder: (payload: { name: string; sortOrder: number }) =>
    adminPostJson<AdminTypingPracticeFolder>("/api/admin/typing-practice/folders", payload),
  updateFolder: (folderId: string, payload: { name: string; sortOrder: number }) =>
    adminPatchJson<AdminTypingPracticeFolder>(`/api/admin/typing-practice/folders/${folderId}`, payload),
  deleteFolder: (folderId: string) => adminDelete<{ success: boolean }>(`/api/admin/typing-practice/folders/${folderId}`),
  getTexts: (params?: {
    folderId?: string;
    keyword?: string;
    status?: TypingPracticeTextStatus | "all";
    page?: number;
    pageSize?: number;
  }) =>
    adminRequest<AdminPagedResult<AdminTypingPracticeText>>(
      `/api/admin/typing-practice/texts${buildAdminQueryString({
        folderId: params?.folderId && params.folderId !== "all" ? params.folderId : undefined,
        keyword: params?.keyword,
        status: params?.status && params.status !== "all" ? params.status : undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      })}`,
    ),
  createText: (payload: AdminTypingPracticeTextPayload) =>
    adminPostJson<AdminTypingPracticeText>("/api/admin/typing-practice/texts", payload),
  updateText: (textId: string, payload: AdminTypingPracticeTextPayload) =>
    adminPatchJson<AdminTypingPracticeText>(`/api/admin/typing-practice/texts/${textId}`, payload),
  deleteText: (textId: string) =>
    adminDelete<{ success: boolean; archived?: boolean }>(`/api/admin/typing-practice/texts/${textId}`),
  getRecords: (params?: { keyword?: string; page?: number; pageSize?: number }) =>
    adminRequest<AdminPagedResult<AdminTypingPracticeRecord>>(
      `/api/admin/typing-practice/records${buildAdminQueryString({
        keyword: params?.keyword,
        page: params?.page,
        pageSize: params?.pageSize,
      })}`,
    ),
};
