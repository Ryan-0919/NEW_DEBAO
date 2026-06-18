import { adminDelete, adminPatchJson, adminPostForm, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";
import type { AdminPagedResult } from "./adminContentService";
import type { DictationChapter, DictationItem, DictationSubject } from "./dictationService";

export type AdminDictationSubject = DictationSubject;
export type AdminDictationChapter = DictationChapter;
export type AdminDictationItem = DictationItem;
export type AdminDictationItemStatus = "draft" | "published";

export type AdminDictationSubjectPayload = {
  code?: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive?: boolean;
  description?: string;
};

export type AdminDictationChapterPayload = {
  subjectId: string;
  title: string;
  description?: string;
  sortOrder: number;
  isActive?: boolean;
};

export type AdminDictationItemPayload = {
  chapterId: string;
  title: string;
  content: string;
  source?: string;
  explanation?: string;
  status: AdminDictationItemStatus;
  sortOrder: number;
};

const base = "/api/admin/dictation";

export const adminDictationService = {
  seedDefaults: () => adminPostJson<AdminDictationSubject[]>(`${base}/seed-defaults`),

  getSubjects: () => adminRequest<AdminDictationSubject[]>(`${base}/subjects`),
  createSubject: (payload: AdminDictationSubjectPayload) => adminPostJson<AdminDictationSubject>(`${base}/subjects`, payload),
  updateSubject: (subjectId: string, payload: AdminDictationSubjectPayload) =>
    adminPatchJson<AdminDictationSubject>(`${base}/subjects/${encodeURIComponent(subjectId)}`, payload),
  deleteSubject: (subjectId: string) => adminDelete<AdminDictationSubject>(`${base}/subjects/${encodeURIComponent(subjectId)}`),

  getChapters: (params?: { subjectId?: string }) =>
    adminRequest<AdminDictationChapter[]>(
      `${base}/chapters${buildAdminQueryString({
        subjectId: params?.subjectId && params.subjectId !== "all" ? params.subjectId : undefined,
      })}`,
    ),
  createChapter: (payload: AdminDictationChapterPayload) => adminPostJson<AdminDictationChapter>(`${base}/chapters`, payload),
  updateChapter: (chapterId: string, payload: AdminDictationChapterPayload) =>
    adminPatchJson<AdminDictationChapter>(`${base}/chapters/${encodeURIComponent(chapterId)}`, payload),
  deleteChapter: (chapterId: string) => adminDelete<AdminDictationChapter>(`${base}/chapters/${encodeURIComponent(chapterId)}`),

  getItems: (params?: {
    subjectId?: string;
    chapterId?: string;
    keyword?: string;
    status?: AdminDictationItemStatus | "all";
    page?: number;
    pageSize?: number;
  }) =>
    adminRequest<AdminPagedResult<AdminDictationItem>>(
      `${base}/items${buildAdminQueryString({
        subjectId: params?.subjectId && params.subjectId !== "all" ? params.subjectId : undefined,
        chapterId: params?.chapterId && params.chapterId !== "all" ? params.chapterId : undefined,
        keyword: params?.keyword,
        status: params?.status && params.status !== "all" ? params.status : undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      })}`,
    ),
  createItem: (payload: AdminDictationItemPayload) => adminPostJson<AdminDictationItem>(`${base}/items`, payload),
  updateItem: (itemId: string, payload: AdminDictationItemPayload) =>
    adminPatchJson<AdminDictationItem>(`${base}/items/${encodeURIComponent(itemId)}`, payload),
  deleteItem: (itemId: string) => adminDelete<{ success: boolean }>(`${base}/items/${encodeURIComponent(itemId)}`),
  batchCreateItems: (payload: { chapterId: string; text: string; source?: string; status?: AdminDictationItemStatus }) =>
    adminPostJson<{ createdCount: number; totalCount: number }>(`${base}/items/batch`, payload),
  importItems: (payload: { chapterId: string; file?: File | null; text?: string; source?: string; status?: AdminDictationItemStatus }) => {
    const formData = new FormData();
    formData.append("chapterId", payload.chapterId);
    formData.append("status", payload.status ?? "published");
    if (payload.source?.trim()) formData.append("source", payload.source.trim());
    if (payload.text?.trim()) formData.append("text", payload.text.trim());
    if (payload.file) formData.append("file", payload.file);
    return adminPostForm<{ createdCount: number; totalCount: number }>(`${base}/items/import`, formData);
  },
};
