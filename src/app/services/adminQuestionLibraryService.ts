import { adminDelete, adminPatchJson, adminPostForm, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";
import type { AdminPagedResult } from "./adminContentService";
import type { AdminQuestionBankAccessType, AdminQuestionBankItemType, AdminQuestionBankOption } from "./adminQuestionBankService";

export type AdminQuestionLibraryAccessType = AdminQuestionBankAccessType;
export type AdminQuestionLibraryPaperType = "objective" | "subjective";

export type AdminQuestionLibrarySummary = {
  folderCount: number;
  itemCount: number;
  referencedItemCount: number;
  objectiveItemCount: number;
  subjectiveItemCount: number;
};

export type AdminQuestionLibraryAssetUploadResult = {
  url: string;
  objectKey: string;
  fileName: string;
};

export type AdminQuestionLibraryFolder = {
  id: string;
  name: string;
  accessType: AdminQuestionLibraryAccessType;
  paperType: AdminQuestionLibraryPaperType;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminQuestionLibrarySubQuestion = {
  id?: string;
  title: string;
  prompt?: string;
  placeholder?: string;
  referenceAnswer?: string;
  analysis?: string;
  sortOrder: number;
};

export type AdminQuestionLibraryItem = {
  id: string;
  folderId: string;
  folderName: string;
  accessType: AdminQuestionLibraryAccessType;
  paperType: AdminQuestionLibraryPaperType;
  title: string;
  questionNo: string;
  yearLabel: string;
  pageLabel: string;
  tags: string[];
  difficulty: 1 | 2 | 3;
  type: AdminQuestionBankItemType;
  stem: string;
  material: string;
  analysis: string;
  lessonAudioUrl: string;
  lessonAudioObjectKey: string;
  lessonAudioDurationSeconds: number;
  score: number;
  sortOrder: number;
  correctAnswer: string[];
  subQuestions: AdminQuestionLibrarySubQuestion[];
  optionCount: number;
  referencedCount: number;
  examReferencedCount: number;
  userStateCount: number;
  options: AdminQuestionBankOption[];
  createdAt: string;
  updatedAt: string;
};

export type AdminQuestionLibraryFolderPayload = {
  name: string;
  accessType: AdminQuestionLibraryAccessType;
  paperType: AdminQuestionLibraryPaperType;
};

export type AdminQuestionLibraryItemPayload = {
  folderId: string;
  title?: string;
  questionNo?: string;
  yearLabel?: string;
  pageLabel?: string;
  tags?: string[] | string;
  difficulty: number;
  type: AdminQuestionBankItemType;
  stem: string;
  material?: string;
  analysis?: string;
  lessonAudioUrl?: string;
  lessonAudioObjectKey?: string;
  lessonAudioDurationSeconds?: number;
  score: number;
  sortOrder: number;
  correctAnswer: string[];
  options: AdminQuestionBankOption[];
  subQuestions?: AdminQuestionLibrarySubQuestion[];
};

export type AdminQuestionLibraryBatchImportResult = {
  folderId: string;
  accessType: AdminQuestionLibraryAccessType;
  paperType: AdminQuestionLibraryPaperType;
  createdCount: number;
  totalCount: number;
};

const base = "/api/admin/content/question-library";
const encodeId = (id: string) => encodeURIComponent(id);

export const adminQuestionLibraryService = {
  getSummary: (paperType: AdminQuestionLibraryPaperType = "objective", accessType: AdminQuestionLibraryAccessType = "public") =>
    adminRequest<AdminQuestionLibrarySummary>(`${base}/summary${buildAdminQueryString({ accessType, paperType })}`),
  getFolders: (paperType: AdminQuestionLibraryPaperType = "objective", accessType: AdminQuestionLibraryAccessType = "public") =>
    adminRequest<AdminQuestionLibraryFolder[]>(`${base}/folders${buildAdminQueryString({ accessType, paperType })}`),
  createFolder: (payload: AdminQuestionLibraryFolderPayload) => adminPostJson<AdminQuestionLibraryFolder>(`${base}/folders`, payload),
  updateFolder: (folderId: string, payload: AdminQuestionLibraryFolderPayload) =>
    adminPatchJson<AdminQuestionLibraryFolder>(`${base}/folders/${encodeId(folderId)}`, payload),
  deleteFolder: (folderId: string) => adminDelete<{ success: boolean }>(`${base}/folders/${encodeId(folderId)}`),
  uploadLessonAudio: (file: File) => {
    const formData = new FormData();
    formData.set("assetType", "lessonAudio");
    formData.set("file", file);
    return adminRequest<AdminQuestionLibraryAssetUploadResult>(`${base}/assets/upload`, {
      method: "POST",
      body: formData,
    });
  },
  getItems: (
    params: {
      page?: number;
      pageSize?: number;
      folderId?: string;
      accessType?: AdminQuestionLibraryAccessType;
      paperType?: AdminQuestionLibraryPaperType;
      type?: AdminQuestionBankItemType | "all";
      keyword?: string;
    } = {},
  ) => adminRequest<AdminPagedResult<AdminQuestionLibraryItem>>(`${base}/items${buildAdminQueryString({ accessType: "public", paperType: "objective", ...params })}`),
  createItem: (payload: AdminQuestionLibraryItemPayload) => adminPostJson<AdminQuestionLibraryItem>(`${base}/items`, payload),
  batchImportItems: (payload: {
    accessType: AdminQuestionLibraryAccessType;
    paperType: AdminQuestionLibraryPaperType;
    folderId: string;
    json: string;
    file?: File | null;
  }) => {
    const formData = new FormData();
    formData.set("accessType", payload.accessType);
    formData.set("paperType", payload.paperType);
    formData.set("folderId", payload.folderId);
    if (payload.file) formData.set("file", payload.file);
    else formData.set("json", payload.json);
    return adminPostForm<AdminQuestionLibraryBatchImportResult>(`${base}/items/batch-import`, formData);
  },
  getItem: (itemId: string) => adminRequest<AdminQuestionLibraryItem>(`${base}/items/${encodeId(itemId)}`),
  updateItem: (itemId: string, payload: AdminQuestionLibraryItemPayload) =>
    adminPatchJson<AdminQuestionLibraryItem>(`${base}/items/${encodeId(itemId)}`, payload),
  deleteItem: (itemId: string) => adminDelete<{ success: boolean }>(`${base}/items/${encodeId(itemId)}`),
};
