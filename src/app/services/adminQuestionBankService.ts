import { adminDelete, adminPatchJson, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";
import type { AdminPagedResult } from "./adminContentService";

export type AdminQuestionBankStatus = "draft" | "published" | "closed";
export type AdminQuestionBankAccessType = "public" | "authorized";
export type AdminQuestionBankPaperType = "objective" | "subjective";
export type AdminQuestionBankItemType = "single_choice" | "multiple_choice" | "uncertain_choice" | "subjective_case";

export type AdminQuestionBankSummary = {
  totalBooks: number;
  publishedBooks: number;
  draftBooks: number;
  closedBooks: number;
  visibleBooks: number;
  totalSubjects: number;
  totalItems: number;
  activeItems: number;
};

export type AdminQuestionBankAssetUploadResult = {
  url: string;
  objectKey: string;
  fileName: string;
};

export type AdminQuestionBankBook = {
  id: string;
  name: string;
  code: string;
  coverUrl: string;
  coverObjectKey: string;
  description: string;
  status: AdminQuestionBankStatus;
  accessType: AdminQuestionBankAccessType;
  paperType: AdminQuestionBankPaperType;
  isVisible: boolean;
  sortOrder: number;
  subjectCount: number;
  itemCount: number;
  activeItemCount: number;
  permissionCount: number;
  progressCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminQuestionBankSubject = {
  id: string;
  bookId: string;
  name: string;
  code: string;
  description: string;
  sortOrder: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminQuestionBankOption = {
  id?: string;
  optionKey: string;
  content: string;
  sortOrder: number;
};

export type AdminQuestionBankSubQuestion = {
  id?: string;
  title: string;
  prompt?: string;
  placeholder?: string;
  referenceAnswer?: string;
  analysis?: string;
  sortOrder: number;
};

export type AdminQuestionBankItem = {
  id: string;
  bookId: string;
  subjectId: string;
  subjectName: string;
  sourceQuestionId: string;
  sourceType: "practice_library" | "legacy_mock_source" | "manual";
  sourceFolderName: string;
  isReferenced: boolean;
  isSourceMissing: boolean;
  isLegacySource: boolean;
  title: string;
  questionNo: string;
  yearLabel: string;
  pageLabel: string;
  tags: string[];
  type: AdminQuestionBankItemType;
  difficulty: 1 | 2 | 3;
  stem: string;
  material: string;
  analysis: string;
  lessonAudioUrl: string;
  lessonAudioObjectKey: string;
  lessonAudioDurationSeconds: number;
  score: number;
  correctAnswer: string[];
  subQuestions: AdminQuestionBankSubQuestion[];
  sortOrder: number;
  status: boolean;
  optionCount: number;
  userStateCount: number;
  options: AdminQuestionBankOption[];
  createdAt: string;
  updatedAt: string;
};

export type AdminQuestionBankBookDetail = {
  book: AdminQuestionBankBook;
  subjects: AdminQuestionBankSubject[];
};

export type AdminQuestionBankBookPayload = {
  name: string;
  code: string;
  coverUrl?: string;
  coverObjectKey?: string;
  description?: string;
  status: AdminQuestionBankStatus;
  accessType: AdminQuestionBankAccessType;
  paperType: AdminQuestionBankPaperType;
  isVisible: boolean;
  sortOrder: number;
};

export type AdminQuestionBankSubjectPayload = {
  name: string;
  code: string;
  description?: string;
  sortOrder: number;
};

export type AdminQuestionBankItemPayload = {
  subjectId: string;
  title?: string;
  questionNo?: string;
  yearLabel?: string;
  pageLabel?: string;
  tags?: string[] | string;
  type: AdminQuestionBankItemType;
  difficulty: number;
  stem: string;
  material?: string;
  analysis?: string;
  lessonAudioUrl?: string;
  lessonAudioObjectKey?: string;
  lessonAudioDurationSeconds?: number;
  score: number;
  correctAnswer: string[];
  sortOrder: number;
  status: boolean;
  options: AdminQuestionBankOption[];
};

export type AdminQuestionBankSourceItem = {
  id: string;
  folderId: string;
  folderName: string;
  accessType: AdminQuestionBankAccessType;
  paperType: AdminQuestionBankPaperType;
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
  correctAnswer: string[];
  subQuestions: AdminQuestionBankSubQuestion[];
  optionCount: number;
  referencedCount: number;
  options: AdminQuestionBankOption[];
  createdAt: string;
  updatedAt: string;
};

export type AdminQuestionBankImportResult = {
  success: boolean;
  createdCount: number;
  skippedCount: number;
  createdIds: string[];
  skippedIds: string[];
};

const base = "/api/admin/content/question-banks";
const encodeId = (id: string) => encodeURIComponent(id);

export const adminQuestionBankService = {
  getSummary: () => adminRequest<AdminQuestionBankSummary>(`${base}/summary`),
  getSummaryByScope: (params: { accessType: AdminQuestionBankAccessType; paperType: AdminQuestionBankPaperType }) =>
    adminRequest<AdminQuestionBankSummary>(`${base}/summary${buildAdminQueryString(params)}`),
  getBooks: (
    params: {
      keyword?: string;
      status?: AdminQuestionBankStatus | "all";
      visibility?: "all" | "visible" | "hidden";
      accessType?: AdminQuestionBankAccessType;
      paperType?: AdminQuestionBankPaperType;
    } = {},
  ) =>
    adminRequest<AdminQuestionBankBook[]>(`${base}${buildAdminQueryString(params)}`),
  createBook: (payload: AdminQuestionBankBookPayload) => adminPostJson<AdminQuestionBankBook>(base, payload),
  getBook: (bookId: string) => adminRequest<AdminQuestionBankBookDetail>(`${base}/${encodeId(bookId)}`),
  updateBook: (bookId: string, payload: AdminQuestionBankBookPayload) =>
    adminPatchJson<AdminQuestionBankBook>(`${base}/${encodeId(bookId)}`, payload),
  deleteBook: (bookId: string) => adminDelete<{ success: boolean }>(`${base}/${encodeId(bookId)}`),
  uploadBookCover: (file: File) => {
    const formData = new FormData();
    formData.set("assetType", "cover");
    formData.set("file", file);
    return adminRequest<AdminQuestionBankAssetUploadResult>(`${base}/assets/upload`, {
      method: "POST",
      body: formData,
    });
  },
  updateBookOrder: (items: { id: string; sortOrder: number }[]) =>
    adminPatchJson<{ success: boolean }>(`${base}/order/books`, { items }),
  createSubject: (bookId: string, payload: AdminQuestionBankSubjectPayload) =>
    adminPostJson<AdminQuestionBankSubject>(`${base}/${encodeId(bookId)}/subjects`, payload),
  updateSubject: (bookId: string, subjectId: string, payload: AdminQuestionBankSubjectPayload) =>
    adminPatchJson<AdminQuestionBankSubject>(`${base}/${encodeId(bookId)}/subjects/${encodeId(subjectId)}`, payload),
  deleteSubject: (bookId: string, subjectId: string) =>
    adminDelete<{ success: boolean }>(`${base}/${encodeId(bookId)}/subjects/${encodeId(subjectId)}`),
  updateSubjectOrder: (bookId: string, items: { id: string; sortOrder: number }[]) =>
    adminPatchJson<{ success: boolean }>(`${base}/${encodeId(bookId)}/subjects/order`, { items }),
  getItems: (
    bookId: string,
    params: {
      page?: number;
      pageSize?: number;
      subjectId?: string;
      status?: "all" | "enabled" | "disabled";
      type?: AdminQuestionBankItemType | "all";
      keyword?: string;
    } = {},
  ) => adminRequest<AdminPagedResult<AdminQuestionBankItem>>(`${base}/${encodeId(bookId)}/items${buildAdminQueryString(params)}`),
  getSourceItems: (
    bookId: string,
    params: {
      page?: number;
      pageSize?: number;
      folderId?: string;
      type?: AdminQuestionBankItemType | "all";
      keyword?: string;
      excludeExisting?: boolean;
    } = {},
  ) => adminRequest<AdminPagedResult<AdminQuestionBankSourceItem>>(`${base}/${encodeId(bookId)}/source-items${buildAdminQueryString(params)}`),
  importItems: (bookId: string, payload: { subjectId: string; sourceItemIds: string[] }) =>
    adminPostJson<AdminQuestionBankImportResult>(`${base}/${encodeId(bookId)}/items/import`, payload),
  createItem: (bookId: string, payload: AdminQuestionBankItemPayload) =>
    adminPostJson<AdminQuestionBankItem>(`${base}/${encodeId(bookId)}/items`, payload),
  getItem: (bookId: string, itemId: string) =>
    adminRequest<AdminQuestionBankItem>(`${base}/${encodeId(bookId)}/items/${encodeId(itemId)}`),
  updateItem: (bookId: string, itemId: string, payload: AdminQuestionBankItemPayload) =>
    adminPatchJson<AdminQuestionBankItem>(`${base}/${encodeId(bookId)}/items/${encodeId(itemId)}`, payload),
  updateItemStatus: (bookId: string, itemId: string, status: boolean) =>
    adminPatchJson<AdminQuestionBankItem>(`${base}/${encodeId(bookId)}/items/${encodeId(itemId)}/status`, { status }),
  deleteItem: (bookId: string, itemId: string) =>
    adminDelete<{ success: boolean }>(`${base}/${encodeId(bookId)}/items/${encodeId(itemId)}`),
};
