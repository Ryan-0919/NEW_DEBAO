import { buildQueryString, postJson, putJson, request, requestBlob } from "./apiClient";

export type LegacyCourseType = "audio" | "video";
export type LegacyCourseStatus = "open" | "closed" | "scheduled";

export interface LegacyCourse {
  id: string;
  name: string;
  cover: string;
  coverObjectKey?: string;
  description: string;
  courseType: LegacyCourseType;
  status: LegacyCourseStatus;
  isPublic?: boolean;
  openTime: string;
  handoutUrl?: string;
  handoutObjectKey?: string;
  handoutName?: string;
  hasHandout?: boolean;
  audioCount: number;
  videoCount: number;
  contentCount: number;
  createdAt: string;
  sortOrder: number;
  progressSummary?: LegacyProgressSummary;
}

export interface LegacyRecentCourseProgress {
  courseId: string;
  courseName: string;
  courseType: LegacyCourseType;
  mediaType?: LegacyCourseType;
  mediaId?: string;
  audioId: string | null;
  videoId?: string | null;
  audioName: string;
  videoName?: string;
  mediaName?: string;
  tagName: string;
  progressSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  completed: boolean;
  lastUpdated: string;
}

export interface LegacyRecentMockExam {
  paperId: string;
  paperTitle: string;
  paperSubtitle: string;
  recordId: string;
  status: string;
  totalScore: number;
  answeredCount: number;
  questionCount: number;
  canResume: boolean;
  startedAt: string;
  submittedAt: string;
}

export interface LegacyUserHomeOverview {
  recentCourseProgress: LegacyRecentCourseProgress | null;
  recentMockExam: LegacyRecentMockExam | null;
}

export interface LegacyTag {
  id: string;
  courseId: string;
  name: string;
  order: number;
}

export interface LegacyAudio {
  id: string;
  name: string;
  folderId: string;
  duration: number;
  processStatus?: string;
  processMessage?: string;
  isReady?: boolean;
  hasScript: boolean;
  script?: string;
  handoutUrl?: string;
  handoutObjectKey?: string;
  handoutName?: string;
  hasHandout?: boolean;
  uploadedAt?: string;
  audioUrl?: string;
  progress?: number;
  progressPercent?: number;
  completed?: boolean;
  lastUpdated?: string;
}

export interface LegacyVideo {
  id: string;
  name: string;
  folderId: string;
  duration: number;
  hasScript: boolean;
  script?: string;
  handoutUrl?: string;
  handoutObjectKey?: string;
  handoutName?: string;
  hasHandout?: boolean;
  uploadedAt?: string;
  videoUrl?: string;
  playbackUrl?: string;
  playbackType?: "hls" | "direct";
  progress?: number;
  progressPercent?: number;
  completed?: boolean;
  lastUpdated?: string;
}

export interface LegacyUserProgress {
  userId: string;
  courseId: string;
  audioId: string;
  progress: number;
  completed: boolean;
  lastUpdated: string;
}

export interface LegacyUserVideoProgress {
  userId: string;
  courseId: string;
  videoId: string;
  progress: number;
  lastPosition?: number;
  completed: boolean;
  lastUpdated: string;
}

export interface LegacyTagContent {
  tagId: string;
  audios?: LegacyAudio[];
  videos?: LegacyVideo[];
  progress?: Array<LegacyUserProgress | LegacyUserVideoProgress>;
}

export interface LegacyProgressSummary {
  contentType: LegacyCourseType;
  totalCount: number;
  completedCount: number;
  learnedSeconds: number;
  totalDurationSeconds: number;
  progressPercent: number;
}

export interface LegacyResumeTarget {
  type: LegacyCourseType;
  courseId: string;
  tagId: string;
  audioId?: string;
  videoId?: string;
  progress: LegacyUserProgress | LegacyUserVideoProgress | null;
}

export interface LegacyCourseDetailPayload {
  course: LegacyCourse;
  tags: LegacyTag[];
  selectedTagId?: string;
  tagContents?: LegacyTagContent[];
  initialAudios?: LegacyAudio[];
  initialProgress?: LegacyUserProgress[];
  initialVideos?: LegacyVideo[];
  initialVideoProgress?: LegacyUserVideoProgress[];
  progressSummary?: LegacyProgressSummary;
  resumeTarget?: LegacyResumeTarget | null;
}

export interface LegacyTagAudiosPayload {
  audios: LegacyAudio[];
  progress: LegacyUserProgress[];
}

export interface LegacyTagVideosPayload {
  videos: LegacyVideo[];
  progress: LegacyUserVideoProgress[];
}

export interface LegacyAudioDetailPayload {
  audio: LegacyAudio;
  tag: LegacyTag;
  course: LegacyCourse;
  progress?: LegacyUserProgress | null;
  prev?: LegacyAudio;
  next?: LegacyAudio;
  first?: LegacyAudio;
  last?: LegacyAudio;
}

export interface LegacyVideoDetailPayload {
  video: LegacyVideo;
  tag: LegacyTag;
  course: LegacyCourse;
  progress?: LegacyUserVideoProgress | null;
  prev?: LegacyVideo;
  next?: LegacyVideo;
  first?: LegacyVideo;
  last?: LegacyVideo;
}

export interface VideoDanmaku {
  id: string;
  courseId: string;
  videoId: string;
  timeSeconds: number;
  content: string;
  color: string;
  userName: string;
  isMine: boolean;
  createdAt: string;
}

export interface UserCourseNote {
  id: string;
  courseId: string;
  courseName: string;
  mediaType: LegacyCourseType;
  mediaId: string;
  mediaName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const encodeId = (id: string | number) => encodeURIComponent(`${id}`);

export const courseService = {
  getUserCourses: () => request<LegacyCourse[]>("/api/user/courses"),
  getUserHomeOverview: () => request<LegacyUserHomeOverview>("/api/user/home-overview"),
  getCourseNotes: () => request<UserCourseNote[]>("/api/user/course-notes"),
  getCourseDetail: (courseId: string | number) => request<LegacyCourseDetailPayload>(`/api/user/courses/${encodeId(courseId)}/detail`),
  getTagAudios: (tagId: string | number) => request<LegacyTagAudiosPayload>(`/api/user/tags/${encodeId(tagId)}/audios`),
  getTagVideos: (tagId: string | number) => request<LegacyTagVideosPayload>(`/api/user/tags/${encodeId(tagId)}/videos`),
  getAudioDetail: (courseId: string | number, audioId: string | number) =>
    request<LegacyAudioDetailPayload>(`/api/user/courses/${encodeId(courseId)}/audios/${encodeId(audioId)}/detail`),
  getVideoDetail: (courseId: string | number, videoId: string | number) =>
    request<LegacyVideoDetailPayload>(`/api/user/courses/${encodeId(courseId)}/videos/${encodeId(videoId)}/detail`),
  getVideoDanmakus: (courseId: string | number, videoId: string | number) =>
    request<VideoDanmaku[]>(`/api/user/courses/${encodeId(courseId)}/videos/${encodeId(videoId)}/danmaku`),
  sendVideoDanmaku: (courseId: string | number, videoId: string | number, payload: { content: string; timeSeconds: number; color?: string }) =>
    postJson<VideoDanmaku>(`/api/user/courses/${encodeId(courseId)}/videos/${encodeId(videoId)}/danmaku`, payload),
  getAudioProgress: (courseId: string | number, audioId: string | number) =>
    request<LegacyUserProgress | null>(`/api/user/audios/${encodeId(audioId)}/progress${buildQueryString({ courseId: `${courseId}` })}`),
  getVideoProgress: (courseId: string | number, videoId: string | number) =>
    request<LegacyUserVideoProgress | null>(`/api/user/videos/${encodeId(videoId)}/progress${buildQueryString({ courseId: `${courseId}` })}`),
  getCourseNote: (courseId: string | number, mediaType: LegacyCourseType, mediaId: string | number) =>
    request<UserCourseNote | null>(`/api/user/courses/${encodeId(courseId)}/notes/${mediaType}/${encodeId(mediaId)}`),
  saveCourseNote: (courseId: string | number, mediaType: LegacyCourseType, mediaId: string | number, content: string) =>
    putJson<UserCourseNote>(`/api/user/courses/${encodeId(courseId)}/notes/${mediaType}/${encodeId(mediaId)}`, { content }),
  saveAudioProgress: (courseId: string | number, audioId: string | number, progress: number) =>
    postJson<LegacyUserProgress>("/api/user/progress", { courseId, audioId, progress }),
  markAudioCompleted: (courseId: string | number, audioId: string | number, progress?: number) =>
    postJson<LegacyUserProgress>("/api/user/progress/complete", { courseId, audioId, progress }),
  downloadCourseHandout: (courseId: string | number) =>
    requestBlob(`/api/user/courses/${encodeId(courseId)}/handout/download`),
  downloadAudioHandout: (courseId: string | number, audioId: string | number) =>
    requestBlob(`/api/user/courses/${encodeId(courseId)}/audios/${encodeId(audioId)}/handout/download`),
  saveVideoProgress: (courseId: string | number, videoId: string | number, progress: number) =>
    postJson<LegacyUserVideoProgress>("/api/user/video-progress", { courseId, videoId, progress }),
  markVideoCompleted: (courseId: string | number, videoId: string | number, progress?: number) =>
    postJson<LegacyUserVideoProgress>("/api/user/video-progress/complete", { courseId, videoId, progress }),
  downloadVideoHandout: (courseId: string | number, videoId: string | number) =>
    requestBlob(`/api/user/courses/${encodeId(courseId)}/videos/${encodeId(videoId)}/handout/download`),
};
