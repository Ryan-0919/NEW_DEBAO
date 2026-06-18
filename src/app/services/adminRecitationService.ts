import { adminDelete, adminPatchJson, adminPostForm, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";
import type { AdminPagedResult } from "./adminContentService";
import type { RecitationChapter, RecitationItem, RecitationSubject } from "./recitationService";

export type AdminRecitationSubject = RecitationSubject;
export type AdminRecitationChapter = RecitationChapter;
export type AdminRecitationItem = RecitationItem;
export type AdminRecitationItemStatus = "draft" | "published";

export type AdminRecitationSubjectPayload = {
  code?: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive?: boolean;
  description?: string;
};

export type AdminRecitationChapterPayload = {
  subjectId: string;
  title: string;
  description?: string;
  sortOrder: number;
  isActive?: boolean;
};

export type AdminRecitationItemPayload = {
  chapterId: string;
  title: string;
  question: string;
  answer: string;
  content?: string;
  source?: string;
  explanation?: string;
  status: AdminRecitationItemStatus;
  sortOrder: number;
};

const base = "/api/admin/recitation";

export const adminRecitationService = {
  seedDefaults: () => adminPostJson<AdminRecitationSubject[]>(`${base}/seed-defaults`),

  getSubjects: () => adminRequest<AdminRecitationSubject[]>(`${base}/subjects`),
  createSubject: (payload: AdminRecitationSubjectPayload) => adminPostJson<AdminRecitationSubject>(`${base}/subjects`, payload),
  updateSubject: (subjectId: string, payload: AdminRecitationSubjectPayload) =>
    adminPatchJson<AdminRecitationSubject>(`${base}/subjects/${encodeURIComponent(subjectId)}`, payload),
  deleteSubject: (subjectId: string) => adminDelete<AdminRecitationSubject>(`${base}/subjects/${encodeURIComponent(subjectId)}`),

  getChapters: (params?: { subjectId?: string }) =>
    adminRequest<AdminRecitationChapter[]>(
      `${base}/chapters${buildAdminQueryString({
        subjectId: params?.subjectId && params.subjectId !== "all" ? params.subjectId : undefined,
      })}`,
    ),
  createChapter: (payload: AdminRecitationChapterPayload) => adminPostJson<AdminRecitationChapter>(`${base}/chapters`, payload),
  updateChapter: (chapterId: string, payload: AdminRecitationChapterPayload) =>
    adminPatchJson<AdminRecitationChapter>(`${base}/chapters/${encodeURIComponent(chapterId)}`, payload),
  deleteChapter: (chapterId: string) => adminDelete<AdminRecitationChapter>(`${base}/chapters/${encodeURIComponent(chapterId)}`),

  getItems: (params?: {
    subjectId?: string;
    chapterId?: string;
    keyword?: string;
    status?: AdminRecitationItemStatus | "all";
    page?: number;
    pageSize?: number;
  }) =>
    adminRequest<AdminPagedResult<AdminRecitationItem>>(
      `${base}/items${buildAdminQueryString({
        subjectId: params?.subjectId && params.subjectId !== "all" ? params.subjectId : undefined,
        chapterId: params?.chapterId && params.chapterId !== "all" ? params.chapterId : undefined,
        keyword: params?.keyword,
        status: params?.status && params.status !== "all" ? params.status : undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      })}`,
    ),
  createItem: (payload: AdminRecitationItemPayload) => adminPostJson<AdminRecitationItem>(`${base}/items`, payload),
  updateItem: (itemId: string, payload: AdminRecitationItemPayload) =>
    adminPatchJson<AdminRecitationItem>(`${base}/items/${encodeURIComponent(itemId)}`, payload),
  deleteItem: (itemId: string) => adminDelete<{ success: boolean }>(`${base}/items/${encodeURIComponent(itemId)}`),
  batchCreateItems: (payload: { chapterId: string; text: string; source?: string; status?: AdminRecitationItemStatus }) =>
    adminPostJson<{ createdCount: number; totalCount: number }>(`${base}/items/batch`, payload),
  importItems: (payload: { chapterId: string; file?: File | null; text?: string; source?: string; status?: AdminRecitationItemStatus }) => {
    const formData = new FormData();
    formData.append("chapterId", payload.chapterId);
    formData.append("status", payload.status ?? "published");
    if (payload.source?.trim()) formData.append("source", payload.source.trim());
    if (payload.text?.trim()) formData.append("text", payload.text.trim());
    if (payload.file) formData.append("file", payload.file);
    return adminPostForm<{ createdCount: number; totalCount: number }>(`${base}/items/import`, formData);
  },
};

