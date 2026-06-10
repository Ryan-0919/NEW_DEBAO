import { adminDelete, adminPatchJson, adminPostForm, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";
import type { AdminPagedResult } from "./adminContentService";

export type AdminLawPracticePaperStatus = "draft" | "published";

export type AdminLawPracticeQuestion = {
  id: string;
  folderId: string | null;
  folderName: string;
  title: string;
  prompt: string;
  lawName: string;
  articleNo: string;
  sourceLawId: number | null;
  standardText: string;
  explanation: string;
  tags: string[];
  sortOrder: number;
  isActive: boolean;
  paperCount: number;
  answerCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminLawPracticeQuestionPayload = {
  folderId?: string | null;
  title: string;
  prompt: string;
  lawName: string;
  articleNo: string;
  sourceLawId?: number | null;
  standardText: string;
  explanation?: string;
  tags?: string[] | string;
  sortOrder: number;
  isActive?: boolean;
};

export type AdminLawPracticeFolder = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminLawPracticeFolderPayload = {
  name: string;
  description?: string;
  sortOrder: number;
  isActive?: boolean;
};

export type AdminLawPracticePaper = {
  id: string;
  code: string;
  title: string;
  description: string;
  status: AdminLawPracticePaperStatus;
  sortOrder: number;
  questionCount: number;
  recordCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminLawPracticePaperPayload = {
  code?: string;
  title: string;
  description?: string;
  status: AdminLawPracticePaperStatus;
  sortOrder: number;
};

export type AdminLawPracticePaperQuestion = {
  id: string;
  paperId: string;
  questionId: string;
  sortOrder: number;
  question: AdminLawPracticeQuestion;
};

export type AdminLawPracticePaperQuestionsPayload = {
  paper: AdminLawPracticePaper;
  questions: AdminLawPracticePaperQuestion[];
  availableQuestions: AdminLawPracticeQuestion[];
};

export type AdminLawPracticeImportResult = {
  createdCount: number;
  totalCount: number;
};

const base = "/api/admin/law-practice";

export const adminLawPracticeService = {
  getFolders: () => adminRequest<AdminLawPracticeFolder[]>(`${base}/folders`),
  createFolder: (payload: AdminLawPracticeFolderPayload) =>
    adminPostJson<AdminLawPracticeFolder>(`${base}/folders`, payload),
  updateFolder: (folderId: string, payload: AdminLawPracticeFolderPayload) =>
    adminPatchJson<AdminLawPracticeFolder>(`${base}/folders/${encodeURIComponent(folderId)}`, payload),
  deleteFolder: (folderId: string) =>
    adminDelete<AdminLawPracticeFolder>(`${base}/folders/${encodeURIComponent(folderId)}`),

  getQuestions: (params?: { keyword?: string; folderId?: string; page?: number; pageSize?: number }) =>
    adminRequest<AdminPagedResult<AdminLawPracticeQuestion>>(
      `${base}/questions${buildAdminQueryString({
        keyword: params?.keyword,
        folderId: params?.folderId && params.folderId !== "all" ? params.folderId : undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      })}`,
    ),
  createQuestion: (payload: AdminLawPracticeQuestionPayload) =>
    adminPostJson<AdminLawPracticeQuestion>(`${base}/questions`, payload),
  updateQuestion: (questionId: string, payload: AdminLawPracticeQuestionPayload) =>
    adminPatchJson<AdminLawPracticeQuestion>(`${base}/questions/${encodeURIComponent(questionId)}`, payload),
  importQuestions: (payload: { file?: File | null; json?: string; folderId?: string }) => {
    const formData = new FormData();
    if (payload.file) formData.append("file", payload.file);
    if (payload.json?.trim()) formData.append("json", payload.json.trim());
    if (payload.folderId && payload.folderId !== "all") formData.append("folderId", payload.folderId);
    return adminPostForm<AdminLawPracticeImportResult>(`${base}/questions/import`, formData);
  },
  deleteQuestion: (questionId: string) =>
    adminDelete<AdminLawPracticeQuestion>(`${base}/questions/${encodeURIComponent(questionId)}`),

  getPapers: () => adminRequest<AdminLawPracticePaper[]>(`${base}/papers`),
  createPaper: (payload: AdminLawPracticePaperPayload) =>
    adminPostJson<AdminLawPracticePaper>(`${base}/papers`, payload),
  updatePaper: (paperId: string, payload: AdminLawPracticePaperPayload) =>
    adminPatchJson<AdminLawPracticePaper>(`${base}/papers/${encodeURIComponent(paperId)}`, payload),
  deletePaper: (paperId: string) =>
    adminDelete<{ success: boolean } | AdminLawPracticePaper>(`${base}/papers/${encodeURIComponent(paperId)}`),
  getPaperQuestions: (paperId: string) =>
    adminRequest<AdminLawPracticePaperQuestionsPayload>(`${base}/papers/${encodeURIComponent(paperId)}/questions`),
  addPaperQuestions: (paperId: string, questionIds: string[]) =>
    adminPostJson<AdminLawPracticePaperQuestion[]>(`${base}/papers/${encodeURIComponent(paperId)}/questions`, { questionIds }),
  updatePaperQuestionOrder: (paperId: string, items: Array<{ id: string; sortOrder: number }>) =>
    adminPatchJson<{ success: boolean }>(`${base}/papers/${encodeURIComponent(paperId)}/questions/order`, { items }),
  removePaperQuestion: (paperId: string, linkId: string) =>
    adminDelete<{ success: boolean }>(`${base}/papers/${encodeURIComponent(paperId)}/questions/${encodeURIComponent(linkId)}`),
};
