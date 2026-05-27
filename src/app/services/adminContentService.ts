import { adminDelete, adminPatchJson, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";

export type AdminCourseType = "audio" | "video";
export type AdminCourseStatus = "open" | "closed" | "scheduled";

export type AdminCourse = {
  id: string;
  name: string;
  cover: string;
  coverObjectKey: string;
  description: string;
  courseType: AdminCourseType;
  status: AdminCourseStatus;
  openTime: string;
  handoutUrl: string;
  handoutObjectKey: string;
  handoutName: string;
  hasHandout: boolean;
  audioCount: number;
  videoCount: number;
  contentCount: number;
  permissionCount?: number;
  createdAt: string;
  sortOrder: number;
};

export type AdminCourseTag = {
  id?: string;
  courseId?: string;
  name: string;
  order?: number;
  contentCount?: number;
};

export type AdminCourseDetail = {
  course: AdminCourse;
  tags: AdminCourseTag[];
};

export type AdminMediaFolder = {
  id: string;
  name: string;
  audioCount?: number;
  videoCount?: number;
};

export type AdminMediaRef = {
  courseId: string;
  courseName: string;
  tagId: string;
  tagName: string;
};

export type AdminMediaItem = {
  id: string;
  name: string;
  folderId: string;
  folderName: string;
  duration: number;
  processStatus?: string;
  processMessage?: string;
  isReady?: boolean;
  hasScript: boolean;
  script?: string;
  handoutUrl: string;
  handoutObjectKey: string;
  handoutName: string;
  hasHandout: boolean;
  uploadedAt: string;
  audioUrl?: string;
  videoUrl?: string;
  objectKey: string;
  objectUrl: string;
  mimeType: string;
  courseRefs: AdminMediaRef[];
};

export type AdminMediaMeta = {
  type: AdminCourseType;
  totalCount: number;
  referencedCount: number;
  pendingScriptCount: number;
  processingCount?: number;
  tagOptions: {
    id: string;
    name: string;
    courseId?: string;
  }[];
};

export type AdminPagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminCourseContent = {
  course: AdminCourse;
  sections: {
    id: string;
    courseId: string;
    name: string;
    order: number;
    items: {
      relationId: string;
      order: number;
      media: AdminMediaItem;
    }[];
  }[];
  generatedAt: string;
};

export type AdminHandoutUploadResult = {
  handoutUrl: string;
  handoutObjectKey: string;
  handoutName: string;
};

export type AdminCourseAssetUploadResult = {
  url: string;
  objectKey: string;
  fileName: string;
};

export type AdminMockExamAssetUploadResult = {
  url: string;
  objectKey: string;
  fileName: string;
};

export type AdminMediaBatchMoveResult = {
  success: boolean;
  updatedCount: number;
};

export type AdminMediaBatchDeleteResult = {
  success: boolean;
  deletedCount: number;
  blocked: string[];
};

export type AdminMockExamPaperType = "objective" | "subjective";
export type AdminMockExamPaperStatus = "draft" | "published";

export type AdminMockExamSeries = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  paperCount: number;
  permissionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminMockExamPaper = {
  id: string;
  code: string;
  seriesId: string;
  seriesName: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  coverObjectKey: string;
  paperType: AdminMockExamPaperType;
  year: number | null;
  phase: string;
  durationMinutes: number;
  maxAttempts: number;
  reviewEnabled: boolean;
  reviewAttemptLimit: number;
  permissionRequired: boolean;
  totalScore: number;
  activeTotalScore: number;
  questionCount: number;
  activeQuestionCount: number;
  subjectiveQuestionCount: number;
  objectiveQuestionCount: number;
  passScore: number;
  description: string;
  status: AdminMockExamPaperStatus;
  openTime: string;
  sortOrder: number;
  recordCount: number;
  permissionCount: number;
  leaderboardCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminMockExamPaperPayload = {
  code?: string;
  seriesId?: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  coverObjectKey?: string;
  paperType: AdminMockExamPaperType;
  year?: number | null;
  phase?: string;
  durationMinutes: number;
  maxAttempts: number;
  reviewEnabled: boolean;
  reviewAttemptLimit: number;
  permissionRequired: boolean;
  totalScore: number;
  questionCount: number;
  passScore: number;
  description?: string;
  status: AdminMockExamPaperStatus;
  openTime?: string;
  sortOrder: number;
};

export const adminContentService = {
  getMockExamSeries: () => adminRequest<AdminMockExamSeries[]>("/api/admin/content/mock-exams/series"),
  createMockExamSeries: (payload: Pick<AdminMockExamSeries, "name" | "description" | "sortOrder">) =>
    adminPostJson<AdminMockExamSeries>("/api/admin/content/mock-exams/series", payload),
  updateMockExamSeries: (seriesId: string, payload: Pick<AdminMockExamSeries, "name" | "description" | "sortOrder">) =>
    adminPatchJson<AdminMockExamSeries>(`/api/admin/content/mock-exams/series/${seriesId}`, payload),
  deleteMockExamSeries: (seriesId: string) => adminDelete<{ success: boolean }>(`/api/admin/content/mock-exams/series/${seriesId}`),
  updateMockExamSeriesOrder: (items: { id: string; sortOrder: number }[]) =>
    adminPatchJson<{ success: boolean }>("/api/admin/content/mock-exams/series/order", { items }),
  getMockExamPapers: (params?: { keyword?: string; seriesId?: string; paperType?: AdminMockExamPaperType | "all"; status?: AdminMockExamPaperStatus | "all" }) =>
    adminRequest<AdminMockExamPaper[]>(
      `/api/admin/content/mock-exams/papers${buildAdminQueryString({
        keyword: params?.keyword,
        seriesId: params?.seriesId,
        paperType: params?.paperType,
        status: params?.status,
      })}`,
    ),
  getMockExamPaper: (paperId: string) => adminRequest<AdminMockExamPaper>(`/api/admin/content/mock-exams/papers/${paperId}`),
  createMockExamPaper: (payload: AdminMockExamPaperPayload) =>
    adminPostJson<AdminMockExamPaper>("/api/admin/content/mock-exams/papers", payload),
  updateMockExamPaper: (paperId: string, payload: AdminMockExamPaperPayload) =>
    adminPatchJson<AdminMockExamPaper>(`/api/admin/content/mock-exams/papers/${paperId}`, payload),
  deleteMockExamPaper: (paperId: string) =>
    adminDelete<{ success: boolean } | AdminMockExamPaper>(`/api/admin/content/mock-exams/papers/${paperId}`),
  updateMockExamPaperOrder: (items: { id: string; sortOrder: number }[]) =>
    adminPatchJson<{ success: boolean }>("/api/admin/content/mock-exams/papers/order", { items }),
  uploadMockExamCover: (file: File) => {
    const formData = new FormData();
    formData.set("file", file);
    return adminRequest<AdminMockExamAssetUploadResult>("/api/admin/content/mock-exams/papers/cover/upload", {
      method: "POST",
      body: formData,
    });
  },
  getCourses: (params?: { type?: AdminCourseType | "all"; status?: AdminCourseStatus | "all"; keyword?: string }) =>
    adminRequest<AdminCourse[]>(
      `/api/admin/content/courses${buildAdminQueryString({
        type: params?.type,
        status: params?.status,
        keyword: params?.keyword,
      })}`,
    ),
  getCourseDetail: (courseId: string) => adminRequest<AdminCourseDetail>(`/api/admin/content/courses/${courseId}`),
  createCourse: (payload: Partial<AdminCourse> & { tags?: string[] }) => adminPostJson<AdminCourse>("/api/admin/content/courses", payload),
  updateCourse: (courseId: string, payload: Partial<AdminCourse>) => adminPatchJson<AdminCourse>(`/api/admin/content/courses/${courseId}`, payload),
  deleteCourse: (courseId: string) => adminDelete<{ success: boolean }>(`/api/admin/content/courses/${courseId}`),
  updateCourseOrder: (items: { id: string; sortOrder: number }[]) => adminPatchJson<{ success: boolean }>("/api/admin/content/courses/order", { items }),
  createTag: (courseId: string, name: string) => adminPostJson<AdminCourseTag>(`/api/admin/content/courses/${courseId}/tags`, { name }),
  updateTag: (tagId: string, name: string) => adminPatchJson<AdminCourseTag>(`/api/admin/content/tags/${tagId}`, { name }),
  deleteTag: (tagId: string) => adminDelete<{ success: boolean }>(`/api/admin/content/tags/${tagId}`),
  getMediaMeta: (type: AdminCourseType) => adminRequest<AdminMediaMeta>(`/api/admin/content/media/meta${buildAdminQueryString({ type })}`),
  getMediaFolders: (type: AdminCourseType) => adminRequest<AdminMediaFolder[]>(`/api/admin/content/media/folders${buildAdminQueryString({ type })}`),
  createMediaFolder: (type: AdminCourseType, name: string) => adminPostJson<AdminMediaFolder>("/api/admin/content/media/folders", { type, name }),
  updateMediaFolder: (type: AdminCourseType, folderId: string, name: string) =>
    adminPatchJson<AdminMediaFolder>(`/api/admin/content/media/folders/${folderId}`, { type, name }),
  deleteMediaFolder: (type: AdminCourseType, folderId: string) =>
    adminDelete<{ success: boolean }>(`/api/admin/content/media/folders/${folderId}${buildAdminQueryString({ type })}`),
  getMediaItems: (params: {
    type: AdminCourseType;
    folderId?: string;
    keyword?: string;
    courseId?: string;
    tagId?: string;
    refFilter?: string;
    scriptFilter?: string;
    processStatus?: string;
    searchScope?: string;
    sortMode?: string;
    page?: number;
    pageSize?: number;
  }) => adminRequest<AdminPagedResult<AdminMediaItem>>(`/api/admin/content/media/items${buildAdminQueryString(params)}`),
  updateMediaItem: (type: AdminCourseType, itemId: string, payload: Partial<AdminMediaItem>) =>
    adminPatchJson<AdminMediaItem>(`/api/admin/content/media/items/${itemId}`, { type, ...payload }),
  batchMoveMediaItems: (type: AdminCourseType, itemIds: string[], folderId: string) =>
    adminPostJson<AdminMediaBatchMoveResult>("/api/admin/content/media/items/batch-move", { type, itemIds, folderId }),
  batchDeleteMediaItems: (type: AdminCourseType, itemIds: string[]) =>
    adminPostJson<AdminMediaBatchDeleteResult>("/api/admin/content/media/items/batch-delete", { type, itemIds }),
  uploadMediaHandout: (type: AdminCourseType, file: File) => {
    const formData = new FormData();
    formData.set("type", type);
    formData.set("file", file);
    return adminRequest<AdminHandoutUploadResult>("/api/admin/content/media/handout/upload", {
      method: "POST",
      body: formData,
    });
  },
  uploadCourseAsset: (assetType: "cover" | "handout", file: File) => {
    const formData = new FormData();
    formData.set("assetType", assetType);
    formData.set("file", file);
    return adminRequest<AdminCourseAssetUploadResult>("/api/admin/content/courses/assets/upload", {
      method: "POST",
      body: formData,
    });
  },
  deleteMediaItem: (type: AdminCourseType, itemId: string) =>
    adminDelete<{ success: boolean }>(`/api/admin/content/media/items/${itemId}${buildAdminQueryString({ type })}`),
  getCourseContent: (courseId: string) => adminRequest<AdminCourseContent>(`/api/admin/content/courses/${courseId}/content`),
  addCourseContent: (courseId: string, tagId: string, mediaIds: string[]) =>
    adminPostJson<AdminCourseContent & { addedCount: number; skippedCount: number }>(
      `/api/admin/content/courses/${courseId}/tags/${tagId}/content`,
      { mediaIds },
    ),
  removeCourseContent: (courseId: string, relationId: string) =>
    adminDelete<AdminCourseContent>(`/api/admin/content/courses/${courseId}/content/${relationId}`),
  updateCourseContentOrder: (courseId: string, tagId: string, items: { relationId: string; order: number }[]) =>
    adminPatchJson<AdminCourseContent>(`/api/admin/content/courses/${courseId}/tags/${tagId}/content/order`, { items }),
};
