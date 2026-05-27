import { adminDelete, adminPatchJson, adminPostForm, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";
import type { AdminPagedResult } from "./adminContentService";
import type { AdminQuestionBankItemType, AdminQuestionBankOption } from "./adminQuestionBankService";

export type AdminExamQuestionBankPaperType = "objective" | "subjective";
export type AdminExamQuestionBankItemType = AdminQuestionBankItemType | "subjective_case";

export type AdminExamQuestionBankSummary = {
  paperType: AdminExamQuestionBankPaperType;
  folderCount: number;
  itemCount: number;
  referencedItemCount: number;
};

export type AdminExamQuestionBankAssetUploadResult = {
  url: string;
  objectKey: string;
  fileName: string;
};

export type AdminExamQuestionBankFolder = {
  id: string;
  name: string;
  paperType: AdminExamQuestionBankPaperType;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminExamQuestionRubricPoint = {
  id?: string;
  title: string;
  score: number;
  description?: string;
  keywords?: string[];
  abilityLabel?: string;
  referenceAnswer?: string;
  rubricGuidance?: string;
  sortOrder?: number;
};

export type AdminExamQuestionSubQuestion = {
  id?: string;
  title: string;
  placeholder?: string;
  abilityLabel?: string;
  referenceAnswer?: string;
  rubricGuidance?: string;
  rubricPoints?: AdminExamQuestionRubricPoint[];
  sortOrder?: number;
};

export type AdminExamQuestionBankItem = {
  id: string;
  folderId: string;
  folderName: string;
  paperType: AdminExamQuestionBankPaperType;
  title: string;
  questionNo: string;
  yearLabel: string;
  pageLabel: string;
  sectionLabel: string;
  sectionDescription: string;
  tags: string[];
  difficulty: 1 | 2 | 3;
  type: AdminExamQuestionBankItemType;
  stem: string;
  material: string;
  analysis: string;
  lessonAudioUrl: string;
  lessonAudioObjectKey: string;
  lessonAudioDurationSeconds: number;
  score: number;
  sortOrder: number;
  correctAnswer: string[];
  optionCount: number;
  examReferencedCount: number;
  options: AdminQuestionBankOption[];
  subQuestions: AdminExamQuestionSubQuestion[];
  createdAt: string;
  updatedAt: string;
};

export type AdminExamQuestionBankFolderPayload = {
  name: string;
  paperType: AdminExamQuestionBankPaperType;
};

export type AdminExamQuestionBankItemPayload = {
  folderId: string;
  paperType: AdminExamQuestionBankPaperType;
  title?: string;
  questionNo?: string;
  yearLabel?: string;
  pageLabel?: string;
  sectionLabel?: string;
  sectionDescription?: string;
  tags?: string[] | string;
  difficulty: number;
  type: AdminExamQuestionBankItemType;
  stem: string;
  material?: string;
  analysis?: string;
  lessonAudioUrl?: string;
  lessonAudioObjectKey?: string;
  lessonAudioDurationSeconds?: number;
  score: number;
  sortOrder: number;
  correctAnswer?: string[];
  options?: AdminQuestionBankOption[];
  subQuestions?: AdminExamQuestionSubQuestion[];
};

export type AdminExamQuestionBankBatchImportResult = {
  folderId: string;
  paperType: AdminExamQuestionBankPaperType;
  createdCount: number;
  totalCount: number;
};

const base = "/api/admin/content/exam-question-bank";
const encodeId = (id: string) => encodeURIComponent(id);

export const adminExamQuestionBankService = {
  getSummary: (paperType: AdminExamQuestionBankPaperType) =>
    adminRequest<AdminExamQuestionBankSummary>(`${base}/summary${buildAdminQueryString({ paperType })}`),
  uploadLessonAudio: (file: File) => {
    const formData = new FormData();
    formData.set("assetType", "lessonAudio");
    formData.set("file", file);
    return adminRequest<AdminExamQuestionBankAssetUploadResult>(`${base}/assets/upload`, {
      method: "POST",
      body: formData,
    });
  },
  getFolders: (paperType: AdminExamQuestionBankPaperType) =>
    adminRequest<AdminExamQuestionBankFolder[]>(`${base}/folders${buildAdminQueryString({ paperType })}`),
  createFolder: (payload: AdminExamQuestionBankFolderPayload) => adminPostJson<AdminExamQuestionBankFolder>(`${base}/folders`, payload),
  updateFolder: (folderId: string, payload: AdminExamQuestionBankFolderPayload) =>
    adminPatchJson<AdminExamQuestionBankFolder>(`${base}/folders/${encodeId(folderId)}${buildAdminQueryString({ paperType: payload.paperType })}`, payload),
  deleteFolder: (folderId: string, paperType: AdminExamQuestionBankPaperType) =>
    adminDelete<{ success: boolean }>(`${base}/folders/${encodeId(folderId)}${buildAdminQueryString({ paperType })}`),
  getItems: (
    params: {
      page?: number;
      pageSize?: number;
      folderId?: string;
      paperType: AdminExamQuestionBankPaperType;
      type?: AdminExamQuestionBankItemType | "all";
      keyword?: string;
    },
  ) => adminRequest<AdminPagedResult<AdminExamQuestionBankItem>>(`${base}/items${buildAdminQueryString(params)}`),
  createItem: (payload: AdminExamQuestionBankItemPayload) => adminPostJson<AdminExamQuestionBankItem>(`${base}/items`, payload),
  batchImportItems: (payload: { paperType: AdminExamQuestionBankPaperType; folderId: string; json: string; file?: File | null }) => {
    const formData = new FormData();
    formData.set("paperType", payload.paperType);
    formData.set("folderId", payload.folderId);
    if (payload.file) formData.set("file", payload.file);
    else formData.set("json", payload.json);
    return adminPostForm<AdminExamQuestionBankBatchImportResult>(`${base}/items/batch-import`, formData);
  },
  getItem: (itemId: string, paperType: AdminExamQuestionBankPaperType) =>
    adminRequest<AdminExamQuestionBankItem>(`${base}/items/${encodeId(itemId)}${buildAdminQueryString({ paperType })}`),
  updateItem: (itemId: string, payload: AdminExamQuestionBankItemPayload) =>
    adminPatchJson<AdminExamQuestionBankItem>(`${base}/items/${encodeId(itemId)}${buildAdminQueryString({ paperType: payload.paperType })}`, payload),
  deleteItem: (itemId: string, paperType: AdminExamQuestionBankPaperType) =>
    adminDelete<{ success: boolean }>(`${base}/items/${encodeId(itemId)}${buildAdminQueryString({ paperType })}`),
};
