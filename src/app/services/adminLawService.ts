import { adminPatchJson, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";
import type { AdminPagedResult } from "./adminContentService";

export type AdminLawVisibility = "all" | "published" | "hidden";

export type AdminLawRecord = {
  id: string;
  sourceLawId: number;
  topCategoryId: number;
  topCategoryTitle: string;
  bookTitle: string;
  title: string;
  displayTitle: string;
  customTitle: string;
  pathLabels: string[];
  pathString: string;
  isPublished: boolean;
  isPinned: boolean;
  manualSortOrder: number;
  tags: string[];
  operatorNote: string;
  updatedAt: string;
};

export type AdminLawRecordDetail = AdminLawRecord & {
  content: string;
};

export type AdminLawSummary = {
  totalRecords: number;
  publishedRecords: number;
  hiddenRecords: number;
  pinnedRecords: number;
  topCategoryCount: number;
  lastUpdated: string;
  topCategories: {
    id: number;
    title: string;
  }[];
};

export type AdminLawEntryUpdatePayload = {
  isPublished?: boolean;
  isPinned?: boolean;
  manualSortOrder?: number | string;
  customTitle?: string;
  tags?: string[] | string;
  operatorNote?: string;
};

export type AdminLawSyncResult = {
  source: string;
  sourceLabel: string;
  totalRecords: number;
  topCategoryCount: number;
  syncedAt: string;
};

export const adminLawService = {
  getSummary: () => adminRequest<AdminLawSummary>("/api/admin/laws/summary"),
  getEntries: (params?: {
    keyword?: string;
    topCategoryId?: string;
    visibility?: AdminLawVisibility;
    pinnedOnly?: boolean;
    page?: number;
    pageSize?: number;
  }) =>
    adminRequest<AdminPagedResult<AdminLawRecord>>(
      `/api/admin/laws/entries${buildAdminQueryString({
        keyword: params?.keyword,
        topCategoryId: params?.topCategoryId && params.topCategoryId !== "all" ? params.topCategoryId : undefined,
        visibility: params?.visibility && params.visibility !== "all" ? params.visibility : undefined,
        pinnedOnly: params?.pinnedOnly ? "true" : undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      })}`,
    ),
  updateEntry: (sourceLawId: number | string, payload: AdminLawEntryUpdatePayload) =>
    adminPatchJson<AdminLawRecord>(`/api/admin/laws/entries/${sourceLawId}`, payload),
  getEntryDetail: (sourceLawId: number | string) =>
    adminRequest<AdminLawRecordDetail>(`/api/admin/laws/entries/${sourceLawId}`),
  sync: () => adminPostJson<AdminLawSyncResult>("/api/admin/laws/sync", {}),
};
