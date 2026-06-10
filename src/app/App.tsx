import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, ReactNode, SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
import {
  Bell, BookOpen, BarChart2, MessageCircle, Trophy,
  Scale, Swords, ChevronRight, FileText, Target,
  Flame, Clock, TrendingUp, Play, Star, ChevronLeft, Zap,
  Search, Users, CheckCircle2, Lock, Download, PenLine,
  ChevronDown, Loader2, PlayCircle, Volume2, Maximize2, SkipForward,
  SkipBack, AlignLeft, Paperclip, ListVideo,
  Bookmark, Flag, RotateCcw, CheckCheck, X, Shuffle, Trash2,
  ListFilter, Circle, Menu, House, UserRound, Moon, Sun, QrCode,
} from "lucide-react";
import { ApiRequestError, USER_SESSION_EXPIRED_EVENT } from "./services/apiClient";
import { courseService } from "./services/courseService";
import type {
  LegacyAudio,
  LegacyCourse,
  LegacyCourseDetailPayload,
  LegacyTagContent,
  LegacyUserHomeOverview,
  LegacyUserProgress,
  LegacyUserVideoProgress,
  LegacyVideo,
  UserCourseNote,
  VideoDanmaku,
} from "./services/courseService";
import { questionBankService } from "./services/questionBankService";
import type { QuestionBankBook, QuestionBankItem, QuestionBankPracticeMode, QuestionBankSubject } from "./services/questionBankService";
import { mockExamService } from "./services/mockExamService";
import type { MockExamHistoryItem, MockExamPaperSummary } from "./services/mockExamService";
import { LegacyMockExamRouter } from "./pages/user/LegacyMockExamRouter";
import { DebaoMyExamRecordPage, getMyExamRecordRouteFromPath } from "./pages/user/DebaoMyExamRecordPage";
import { DebaoLawSearchPage } from "./pages/user/DebaoLawSearchPage";
import { LawPracticeRouter } from "./pages/user/LawPracticeRouter";
import { TypingPracticeRouter } from "./pages/user/TypingPracticeRouter";
import { DesktopOnlyNotice, type DesktopOnlyFeature, useMockExamDesktopGuard } from "./pages/user/mockExamDesktopGuard";
import { AdminRouter } from "./pages/admin/AdminRouter";
import { ReviewRouter } from "./pages/review/ReviewRouter";
import mockExamOfficialCss from "../styles/mock-exam-official.css?raw";
import {
  clearUserSession,
  ensureUserDeviceKey,
  getUserDeviceKey,
  getUserToken,
  saveUserSession,
  updateUserProfileSession,
} from "./services/session";
import { userService } from "./services/userService";
import type { LegacyUser, UserStudySummary } from "./services/userService";
import { mockApi, type UserHomeConfig } from "./lib/mockData";
import { AppLogo } from "./components/branding/AppLogo";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const buildApiUrl = (path = "") => (path && API_BASE_URL && path.startsWith("/") ? `${API_BASE_URL}${path}` : path);
const IMAGE_TARGET_PREVIEW_PATH = "/image-preview";

const isSafePreviewImageUrl = (value = "") => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed, typeof window === "undefined" ? "https://denlaw.cn" : window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const buildImageTargetPreviewUrl = (imageUrl = "") => {
  const src = imageUrl.trim();
  if (!src) return "";
  if (typeof window === "undefined") return `${IMAGE_TARGET_PREVIEW_PATH}?src=${encodeURIComponent(src)}`;
  const previewUrl = new URL(IMAGE_TARGET_PREVIEW_PATH, window.location.origin);
  previewUrl.searchParams.set("src", src);
  return previewUrl.toString();
};

const getImageTargetPreviewSource = () => {
  if (typeof window === "undefined") return "";
  const src = new URLSearchParams(window.location.search).get("src")?.trim() || "";
  return isSafePreviewImageUrl(src) ? src : "";
};

/* ══════════════════════ SHARED DATA ══════════════════════ */

const navItems = ["首页", "课程中心", "题库", "我的"];
const navIcons = [House, PlayCircle, BookOpen, UserRound];
type DebaoThemeMode = "dark" | "light";
const DEBAO_THEME_STORAGE_KEY = "debao:theme-mode";

const getInitialDebaoTheme = (): DebaoThemeMode => {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(DEBAO_THEME_STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
};

const modules = [
  { id: 1, title: "课程学习", sub: "名师精讲 · 系统备考", icon: Play, color: "#c9973e", glow: "rgba(201,151,62,0.2)", page: "courses" },
  { id: 2, title: "题库", sub: "海量真题 · 专项练习", icon: BookOpen, color: "#4e8ef7", glow: "rgba(78,142,247,0.2)", hot: true },
  { id: 3, title: "进入主观批改", sub: "人工精批 · 要点解析", icon: FileText, color: "#1dc9a4", glow: "rgba(29,201,164,0.2)", desktopOnly: true },
  { id: 4, title: "客观题模考", sub: "全真仿真 · 限时测验", icon: Target, color: "#c97ef5", glow: "rgba(201,126,245,0.2)", desktopOnly: true },
  { id: 6, title: "法条练习", sub: "定位条文 · 抄录训练", icon: Scale, color: "#f6c15f", glow: "rgba(246,193,95,0.2)", desktopOnly: true },
  { id: 7, title: "打字练习", sub: "法律术语 · 答题提速", icon: Swords, color: "#f76e6e", glow: "rgba(247,110,110,0.2)", desktopOnly: true },
];

/* ══════════════════════ COURSES PAGE DATA ══════════════════════ */

const courseCategories = ["音频课程", "视频课程"];

type CourseDataSource = "legacy" | "static";
type AppCourse = {
  id: string | number;
  title: string;
  teacher: string;
  initials: string;
  category: string;
  color: string;
  lessons: number;
  enrolled: boolean;
  progress: number;
  tag: string;
  type: MediaKind;
  source?: CourseDataSource;
};
type HomeCourse = {
  id: string | number;
  title: string;
  teacher: string;
  initials: string;
  tag: string;
  color: string;
  progress: number;
  total: number;
  done: number;
};
type LegacyMedia = LegacyAudio | LegacyVideo;
type LegacyMediaProgress = LegacyUserProgress | LegacyUserVideoProgress;
type MediaKind = "audio" | "video";
type RouteCourseAccessState = { status: "idle" | "checking" | "not_found" | "forbidden" | "closed" | "error"; message?: string };
type LessonModel = {
  id: string;
  title: string;
  duration: string;
  durationSeconds: number;
  done: boolean;
  current: boolean;
  progressSeconds: number;
  savedProgressSeconds?: number;
  lastPositionSeconds?: number;
  tagId?: string;
  tagName?: string;
  script?: string;
  handoutUrl?: string;
  handoutName?: string;
  hasHandout?: boolean;
  mediaUrl?: string;
  mediaKind?: MediaKind;
  source?: "legacy" | "static";
};
type ChapterModel = {
  id: string;
  title: string;
  total: number;
  done: number;
  expanded?: boolean;
  lessons: LessonModel[];
};
type CourseMaterial = {
  id: string;
  name: string;
  size: string;
  type: string;
  url?: string;
  courseId?: AppCourse["id"];
  lessonId?: string;
  mediaKind?: MediaKind;
  source?: "legacy" | "static";
};
type ResolvedCourseDetail = Omit<ReturnType<typeof makeCourseDetail>, "chapters" | "materials"> & {
  description?: string;
  chapters: ChapterModel[];
  materials: CourseMaterial[];
  source: "legacy" | "static";
};

type LessonDirection = "prev" | "next";
type AudioRepeatMode = "none" | "list" | "single";

const courseColors = ["#c9973e", "#4e8ef7", "#1dc9a4", "#c97ef5", "#f76e6e", "#f7a94e"];
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.1";

const EMPTY_USER_HOME_CONFIG: UserHomeConfig = {
  memberHome: {
    hero: {
      badge: "",
      title: "",
      description: "",
    },
    bannerImageUrl: "",
    bannerImageObjectKey: "",
    joinGroup: {
      title: "进群",
      statusText: "可加入",
      description: "扫码加入26法考资料分享群，获取备考资料、考点汇总和学习交流。",
      buttonText: "扫码进群",
      modalTitle: "扫码加入26法考资料分享群",
      modalHint: "长按或截图后使用微信扫码加入",
      qrImageUrl: "",
      qrImageObjectKey: "",
    },
    sideAds: {
      left: {
        title: "",
        description: "",
        imageUrl: "",
        imageObjectKey: "",
        buttonText: "",
        target: "",
        isVisible: false,
      },
      right: {
        title: "",
        description: "",
        imageUrl: "",
        imageObjectKey: "",
        buttonText: "",
        target: "",
        isVisible: false,
      },
    },
    announcement: {
      title: "学习公告",
      subtitle: "Announcement",
      badge: "公告",
      items: [],
    },
    operations: {
      title: "",
      subtitle: "",
      items: [],
    },
  },
  examHome: {
    eyebrow: "",
    title: "",
    objectiveModeLabel: "",
    subjectiveModeLabel: "",
    objectiveEmptyText: "",
    subjectiveEmptyText: "",
  },
  examCountdown: {
    objective: {
      label: "法考客观题倒计时",
      description: "距 2026 年客观题考试还有",
      targetDate: "2026-09-13",
    },
    subjective: {
      label: "法考主观题倒计时",
      description: "距 2026 年主观题考试还有",
      targetDate: "2026-10-11",
    },
  },
  accountCenter: {
    eyebrow: "",
    description: "",
    shortcutTitle: "",
    shortcuts: [],
  },
  customerServiceUrl: "",
};

const parseCountdownDate = (value: string | undefined, fallback: string) => {
  const text = `${value || fallback}`.trim();
  const parsed = new Date(text.length <= 10 ? `${text}T00:00:00` : text.replace(" ", "T"));
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(`${fallback}T00:00:00`);
};

const EMPTY_STUDY_SUMMARY: UserStudySummary = {
  stats: {
    totalPracticeCount: 0,
    correctPracticeCount: 0,
    accuracyRate: null,
    learnedSeconds: 0,
    learnedHours: 0,
    learningHoursBeatPercent: 0,
    weekLearnedSeconds: 0,
    weekLearnedHours: 0,
    completedCourseContentCount: 0,
    activeCourseProgressCount: 0,
    wrongCount: 0,
    bookmarkedCount: 0,
    authorizedQuestionBankCount: 0,
    mockExamRecordCount: 0,
    completedObjectiveExamCount: 0,
    completedSubjectiveExamCount: 0,
    typingPracticeCount: 0,
    typingAvgAccuracyRate: null,
    typingAvgCpm: 0,
    typingBestCpm: 0,
    typingBestScore: 0,
    typingTotalTypedLength: 0,
    orderCount: 0,
  },
  weekData: [],
  heatmapDays: [],
  recentActivity: [],
  orders: [],
};

const formatDuration = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
};

const parseDurationToSeconds = (duration: string) => {
  const parts = duration.split(":").map(part => Number(part));
  if (parts.some(part => Number.isNaN(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
};

const triggerBlobDownload = (blob: Blob, filename: string) => {
  if (typeof document === "undefined") return;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "debao-handout";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

const progressMediaId = (item: LegacyMediaProgress) => ("audioId" in item ? item.audioId : item.videoId);

const buildProgressMap = (progressList: LegacyMediaProgress[] = []) => new Map(progressList.map(item => [progressMediaId(item), item]));

const getMediaUrl = (media: LegacyMedia) => ("audioUrl" in media ? media.audioUrl : media.videoUrl);

const mapLessonFromLegacy = (media: LegacyMedia, progress?: LegacyMediaProgress, options?: { current?: boolean; tagId?: string; tagName?: string }): LessonModel => {
  const savedProgressSeconds = Math.max(0, Number(progress?.progress ?? 0));
  const lastPositionSeconds = "videoId" in (progress ?? {}) ? Math.max(0, Number((progress as LegacyUserVideoProgress | undefined)?.lastPosition ?? savedProgressSeconds)) : savedProgressSeconds;
  const completed = Boolean(progress?.completed);

  return {
    id: media.id,
    title: media.name,
    duration: formatDuration(media.duration),
    durationSeconds: Math.max(0, Number(media.duration ?? 0)),
    done: completed,
    current: Boolean(options?.current),
    progressSeconds: completed ? 0 : lastPositionSeconds,
    savedProgressSeconds,
    lastPositionSeconds,
    tagId: options?.tagId,
    tagName: options?.tagName,
    script: media.script,
    handoutUrl: media.handoutUrl,
    handoutName: media.handoutName,
    hasHandout: Boolean(media.hasHandout || media.handoutUrl || media.handoutObjectKey),
    mediaUrl: getMediaUrl(media),
    mediaKind: "audioUrl" in media ? "audio" : "video",
    source: "legacy",
  };
};

const getTagContentMedia = (tagContent: LegacyTagContent, courseType: LegacyCourse["courseType"]) =>
  (courseType === "video" ? tagContent.videos ?? [] : tagContent.audios ?? []) as LegacyMedia[];

const buildEmptyCourseChapters = (
  chapterTitle = "暂无可学习内容",
  lessonTitle = "当前课程暂未配置章节内容",
): ChapterModel[] => [
  {
    id: "__empty__",
    title: chapterTitle,
    total: 1,
    done: 0,
    expanded: true,
    lessons: [
      {
        id: "__empty__",
        title: lessonTitle,
        duration: "00:00",
        durationSeconds: 0,
        done: false,
        current: true,
        progressSeconds: 0,
        savedProgressSeconds: 0,
        mediaKind: "video",
        source: "static",
      },
    ],
  },
];

const makeCourseShellDetail = (
  appCourse: AppCourse,
  chapterTitle: string,
  lessonTitle: string,
  intro: string,
): ResolvedCourseDetail => {
  const base = makeCourseDetail(appCourse);
  return {
    ...base,
    lessons: 0,
    progress: appCourse.progress,
    intro,
    description: intro,
    chapters: buildEmptyCourseChapters(chapterTitle, lessonTitle),
    materials: [],
    source: appCourse.source === "legacy" ? "legacy" : "static",
  };
};

const mapLegacyCourseDetail = (payload: LegacyCourseDetailPayload, appCourse: AppCourse): ResolvedCourseDetail => {
  const base = makeCourseDetail(appCourse);
  const fallbackProgress = payload.course.courseType === "video" ? payload.initialVideoProgress ?? [] : payload.initialProgress ?? [];
  const tagContents = payload.tagContents ?? [];
  let hasCurrent = false;

  const chapters = payload.tags.map((tag, index) => {
    const tagContent = tagContents.find(item => item.tagId === tag.id);
    const mediaItems = tagContent ? getTagContentMedia(tagContent, payload.course.courseType) : [];
    const progressMap = buildProgressMap((tagContent?.progress as LegacyMediaProgress[] | undefined) ?? (index === 0 ? fallbackProgress : []));
    const lessons = mediaItems.map((media) => {
      const progress = progressMap.get(media.id);
      const current = !hasCurrent && !progress?.completed;
      if (current) hasCurrent = true;
      return mapLessonFromLegacy(media, progress, { current, tagId: tag.id, tagName: tag.name });
    });

    return {
      id: tag.id,
      title: tag.name,
      total: lessons.length,
      done: lessons.filter(item => item.done).length,
      expanded: index === 0,
      lessons,
    };
  }).filter(chapter => chapter.lessons.length > 0);

  const resumeMediaId = payload.resumeTarget?.type === "video" ? payload.resumeTarget.videoId : payload.resumeTarget?.audioId;
  if (resumeMediaId) {
    chapters.forEach(chapter => {
      chapter.expanded = chapter.lessons.some(lesson => lesson.id === resumeMediaId) || chapter.expanded;
      chapter.lessons.forEach(lesson => {
        lesson.current = lesson.id === resumeMediaId;
      });
    });
    hasCurrent = true;
  }

  if (!hasCurrent) {
    const firstLesson = chapters[0]?.lessons[0];
    if (firstLesson) firstLesson.current = true;
  }

  const lessonMaterials = chapters.flatMap(chapter =>
    chapter.lessons
      .filter(lesson => lesson.hasHandout || lesson.handoutUrl)
      .map(lesson => ({
        id: `${chapter.id}-${lesson.id}`,
        name: lesson.handoutName || `${lesson.title}讲义`,
        size: "得恩法考课程资料",
        type: "pdf",
        url: lesson.handoutUrl,
        courseId: payload.course.id,
        lessonId: lesson.id,
        mediaKind: payload.course.courseType,
        source: "legacy" as const,
      })),
  );
  const courseMaterial =
    payload.course.hasHandout || payload.course.handoutUrl || payload.course.handoutObjectKey
      ? {
          id: `${payload.course.id}-course-handout`,
          name: payload.course.handoutName || `${payload.course.name}讲义`,
          size: "得恩法考课程资料",
          type: "pdf",
          url: payload.course.handoutUrl,
          courseId: payload.course.id,
          mediaKind: payload.course.courseType,
          source: "legacy" as const,
        }
      : null;
  const materials = courseMaterial ? [courseMaterial, ...lessonMaterials] : lessonMaterials;

  return {
    ...base,
    lessons: payload.course.contentCount || base.lessons,
    progress: appCourse.progress,
    intro: payload.course.description || base.intro,
    description: payload.course.description,
    chapters: chapters.length > 0 ? chapters : buildEmptyCourseChapters(),
    materials,
    source: "legacy",
  };
};

const getFirstLesson = (chapters: ChapterModel[]) => chapters.flatMap(chapter => chapter.lessons)[0] ?? null;

const getCurrentLesson = (chapters: ChapterModel[]) =>
  chapters.flatMap(chapter => chapter.lessons).find(lesson => lesson.current) ?? getFirstLesson(chapters);

const markCurrentLesson = (chapters: ChapterModel[], lessonId: string) =>
  chapters.map(chapter => ({
    ...chapter,
    lessons: chapter.lessons.map(lesson => ({ ...lesson, current: lesson.id === lessonId })),
  }));

const patchLessonInChapters = (chapters: ChapterModel[], lessonId: string, patch: Partial<LessonModel>) =>
  chapters.map(chapter => {
    const lessons = chapter.lessons.map(lesson => lesson.id === lessonId ? { ...lesson, ...patch } : lesson);
    return {
      ...chapter,
      done: lessons.filter(lesson => lesson.done).length,
      lessons,
    };
  });

const findAdjacentLesson = (chapters: ChapterModel[], lessonId: string, direction: LessonDirection) => {
  const lessons = chapters.flatMap(chapter => chapter.lessons);
  const currentIndex = lessons.findIndex(lesson => lesson.id === lessonId);
  if (currentIndex < 0) return null;

  const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
  return lessons[nextIndex] ?? null;
};

const getPlayableLessons = (chapters: ChapterModel[]) =>
  chapters.flatMap(chapter => chapter.lessons).filter(lesson => lesson.id !== "__empty__");

const findLoopLesson = (chapters: ChapterModel[], lessonId: string, direction: LessonDirection) => {
  const lessons = getPlayableLessons(chapters);
  const currentIndex = lessons.findIndex(lesson => lesson.id === lessonId);
  if (currentIndex < 0 || lessons.length === 0) return null;

  const nextIndex = direction === "next"
    ? (currentIndex + 1) % lessons.length
    : (currentIndex - 1 + lessons.length) % lessons.length;
  return lessons[nextIndex] ?? null;
};

const updateLessonProgressInChapters = (chapters: ChapterModel[], lessonId: string, progressSeconds: number, completed = false, savedProgressSeconds?: number) =>
  chapters.map(chapter => {
    const lessons = chapter.lessons.map(lesson => lesson.id === lessonId
      ? {
        ...lesson,
        progressSeconds,
        savedProgressSeconds: Math.max(savedProgressSeconds ?? progressSeconds, lesson.savedProgressSeconds ?? 0),
        lastPositionSeconds: progressSeconds,
        done: completed ? true : lesson.done,
      }
      : lesson);

    return {
      ...chapter,
      done: lessons.filter(lesson => lesson.done).length,
      lessons,
    };
  });

const calcLessonPercent = (lesson: LessonModel | null) => {
  if (!lesson || lesson.durationSeconds <= 0) return lesson?.done ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((lesson.progressSeconds / lesson.durationSeconds) * 100)));
};

const getLessonLearnedSeconds = (lesson: LessonModel) => {
  const savedSeconds = Math.max(0, lesson.savedProgressSeconds ?? 0);
  const playbackSeconds = Math.max(0, lesson.progressSeconds ?? 0);
  const durationSeconds = Math.max(0, lesson.durationSeconds ?? parseDurationToSeconds(lesson.duration));
  if (lesson.done && durationSeconds > 0) return durationSeconds;
  const learnedSeconds = Math.max(savedSeconds, playbackSeconds);
  return durationSeconds > 0 ? Math.min(learnedSeconds, durationSeconds) : learnedSeconds;
};

const calcCourseLearningProgress = (chapters: ChapterModel[]) => {
  const lessons = chapters.flatMap(chapter => chapter.lessons).filter(lesson => lesson.id !== "__empty__");
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter(lesson => lesson.done).length;
  const totalDurationSeconds = lessons.reduce((sum, lesson) => sum + Math.max(0, lesson.durationSeconds ?? parseDurationToSeconds(lesson.duration)), 0);
  const learnedSeconds = lessons.reduce((sum, lesson) => sum + getLessonLearnedSeconds(lesson), 0);
  const percent = totalDurationSeconds > 0
    ? Math.max(0, Math.min(100, Math.round((learnedSeconds / totalDurationSeconds) * 100)))
    : totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;
  return { totalLessons, completedLessons, percent };
};

const inferCourseCategory = (course: LegacyCourse) => {
  if (course.courseType === "audio") return "音频课程";
  if (course.courseType === "video") return "视频课程";
  if (course.name.includes("全程")) return "全程班";
  if (course.name.includes("主观")) return "主观题精讲";
  if (course.name.includes("真题")) return "真题解析班";
  if (course.name.includes("冲刺") || course.name.includes("押题")) return "冲刺押题班";
  if (course.name.includes("专项")) return "专项突破";
  return "客观题精讲";
};

const getCourseProgress = (course: LegacyCourse, overview: LegacyUserHomeOverview | null) => {
  const summaryProgress = course.progressSummary?.progressPercent;
  if (summaryProgress !== undefined) return Math.max(0, Math.min(100, Number(summaryProgress ?? 0)));

  const recent = overview?.recentCourseProgress;
  if (recent?.courseId !== course.id) return 0;
  return Math.max(0, Math.min(100, Number(recent.progressPercent ?? 0)));
};

const mapLegacyCourse = (course: LegacyCourse, index: number, overview: LegacyUserHomeOverview | null): AppCourse => {
  const color = courseColors[index % courseColors.length];
  const category = inferCourseCategory(course);
  const lessons = Math.max(0, Number(course.contentCount || course.audioCount || course.videoCount || 0));
  const progress = getCourseProgress(course, overview);

  return {
    id: course.id,
    title: course.name,
    teacher: "得恩法考",
    initials: course.name.trim().slice(0, 1) || "得",
    category,
    color,
    lessons,
    enrolled: true,
    progress,
    tag: course.courseType === "audio" ? "音频" : "已开通",
    type: course.courseType,
    source: "legacy",
  };
};

const mapHomeCourse = (course: AppCourse): HomeCourse => ({
  id: course.id,
  title: course.title,
  teacher: course.teacher,
  initials: course.initials,
  tag: course.category,
  color: course.color,
  progress: course.progress,
  total: course.lessons,
  done: Math.round((course.lessons * course.progress) / 100),
});

const categoryGrad: Record<string, string> = {
  全程班:    "linear-gradient(135deg,#2a1e0a,#3d2c10)",
  客观题精讲: "linear-gradient(135deg,#0a1430,#0f2248)",
  主观题精讲: "linear-gradient(135deg,#0a2420,#0f3530)",
  真题解析班: "linear-gradient(135deg,#1a0a2a,#281040)",
  冲刺押题班: "linear-gradient(135deg,#2a0e0e,#3d1515)",
  专项突破:  "linear-gradient(135deg,#2a1c08,#3d2a10)",
  音频课程: "linear-gradient(135deg,#2a1e0a,#3d2c10)",
  视频课程: "linear-gradient(135deg,#0a1430,#0f2248)",
};

const tagBadge: Record<string, { bg: string; color: string }> = {
  热门: { bg: "rgba(247,110,110,0.15)", color: "#f76e6e" },
  精品: { bg: "rgba(201,151,62,0.15)", color: "#c9973e" },
  新课: { bg: "rgba(29,201,164,0.15)", color: "#1dc9a4" },
  必备: { bg: "rgba(201,126,245,0.15)", color: "#c97ef5" },
  限时: { bg: "rgba(247,169,78,0.15)", color: "#f7a94e" },
};

type ToastType = "info" | "success" | "warning";
type ToastState = { text: string; type?: ToastType } | null;
type Notify = (text: string, type?: ToastType) => void;
type AuthMode = "login" | "register";
type LoginMethod = "password" | "sms";
type MockExamMode = "objective" | "subjective";
type MockExamSessionTarget = { recordId?: string; paperId?: string; mode?: MockExamMode } | null;
const OFFICIAL_EXAM_SCOPE = { "data-v-6e05b77a": "" };
const OFFICIAL_EXAM_SHADOW_RESET = ":host{all:initial;display:block}:host,:host *,:host *::before,:host *::after{box-sizing:content-box}:host img{display:inline-block;max-width:none}:host button,:host input,:host textarea,:host select{font:inherit;letter-spacing:normal}:host textarea{resize:none}";
const OFFICIAL_EXAM_EXTRA_CSS = `
[data-v-6e05b77a] .debao-extra-footer-actions{display:inline-flex;gap:6px;align-items:center;margin-right:16px;vertical-align:middle}
[data-v-6e05b77a] .debao-extra-footer-actions button{height:25px;min-width:58px;padding:0 9px;border:1px solid #0d5f9c;background:linear-gradient(#fff,#c6e2f5);color:#063e68;font-size:12px;font-family:"微软雅黑","宋体";font-weight:bold;cursor:pointer;border-radius:0}
[data-v-6e05b77a] .debao-extra-footer-actions button.active{background:#fb0;color:#000;border-color:#c60}
[data-v-6e05b77a] .submitbutton.debao-analysis-button{display:inline-block;box-sizing:border-box;width:98px;height:31px;line-height:29px;padding:0;border:1px solid #c60;background-repeat:no-repeat;background-size:100% 100%;background-position:center;color:#000;appearance:none;-webkit-appearance:none}
[data-v-6e05b77a] .debao-analysis-dialog-body{position:absolute;left:0;right:0;top:41px;bottom:0;background:#fff;overflow-y:auto;padding:14px 18px;color:#222;font-family:"宋体","微软雅黑";font-size:15px;line-height:1.8;text-align:left}
[data-v-6e05b77a] .debao-analysis-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px;padding-bottom:10px;border-bottom:1px solid #cfd8e3}
[data-v-6e05b77a] .debao-analysis-tabs button{height:28px;min-width:58px;padding:0 10px;border:1px solid #7aa7ca;background:linear-gradient(#fff,#d8edf9);color:#06436e;font-size:12px;font-family:"微软雅黑","宋体";font-weight:bold;cursor:pointer;border-radius:0}
[data-v-6e05b77a] .debao-analysis-tabs button.active{background:#fb0;color:#000;border-color:#c60}
[data-v-6e05b77a] .debao-analysis-dialog-body h4{margin:0 0 8px;font-size:15px;color:#075f9a;font-family:"微软雅黑","宋体"}
[data-v-6e05b77a] .debao-analysis-dialog-body .analysis-section{border-bottom:1px solid #d8d8d8;padding-bottom:12px;margin-bottom:12px}
[data-v-6e05b77a] .debao-analysis-dialog-body .analysis-section:last-child{border-bottom:none;margin-bottom:0}
[data-v-6e05b77a] .debao-analysis-dialog-body .analysis-empty{color:#777;font-size:14px}
[data-v-6e05b77a] .debao-analysis-audio{padding:10px 12px;background:#f4f8fb;border:1px solid #c7d8e7;margin-bottom:12px}
[data-v-6e05b77a] .debao-analysis-audio audio{display:block;width:100%;height:34px}
[data-v-6e05b77a] .debao-resizable-dialog{min-width:360px;min-height:260px}
[data-v-6e05b77a] .debao-resize-edge-right{position:absolute;top:0;right:0;width:7px;height:100%;cursor:ew-resize;z-index:220}
[data-v-6e05b77a] .debao-resize-edge-bottom{position:absolute;left:0;bottom:0;width:100%;height:7px;cursor:ns-resize;z-index:220}
[data-v-6e05b77a] .debao-resize-grip{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;z-index:230;background:linear-gradient(135deg, transparent 0 48%, rgba(64,64,64,.32) 48% 55%, transparent 55% 65%, rgba(64,64,64,.32) 65% 72%, transparent 72%)}
[data-v-6e05b77a] .mock-stem-highlight{background:#fff59d;color:inherit}
`;
type OfficialThemeId = 1 | 2 | 3 | 4 | 5;
type OfficialSubjectivePanelHeight = "300px" | "100%";
type OfficialAnswerPanelHeight = "340px" | "100%";
type OfficialDialogRect = { left: number; top: number; width: number; height: number };
type OfficialHighlightBlock = "prompt" | "subjective-block";
type OfficialHighlightSelection = { block: OfficialHighlightBlock; key: string; start: number; end: number };
const OFFICIAL_THEME_BG: Record<OfficialThemeId, string> = { 1: "#ddebf6", 2: "#cae0e0", 3: "#f5e9dc", 4: "#f5dce4", 5: "#deddf6" };
const OFFICIAL_SECTION_ORDERS = ["一、", "二、", "三、", "四、", "五、", "六、"];
const OFFICIAL_STEM_HIGHLIGHT_CLASS = "mock-stem-highlight";
const officialOrderText = (index: number) => OFFICIAL_SECTION_ORDERS[index] ?? `${index + 1}. `;
const officialToHtml = (text: string) => (!text ? "" : text.includes("<") ? text : text.replace(/\n/g, "<br />"));
const getOfficialSelectionFromNode = (node?: Node | null) => {
  const root = node?.getRootNode?.();
  const rootSelection =
    root && "getSelection" in root
      ? (root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() ?? null
      : null;
  return rootSelection ?? window.getSelection?.() ?? null;
};
const getOfficialTextOffsetWithin = (root: Node, container: Node, offset: number) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  let total = 0;

  while (current) {
    const textLength = current.textContent?.length ?? 0;
    if (current === container) return total + Math.min(offset, textLength);
    total += textLength;
    current = walker.nextNode();
  }

  return total;
};
const locateOfficialTextBoundary = (root: HTMLElement, targetOffset: number) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode() as Text | null;
  let remaining = Math.max(0, targetOffset);
  let lastTextNode: Text | null = null;

  while (current) {
    const textLength = current.textContent?.length ?? 0;
    lastTextNode = current;
    if (remaining <= textLength) return { node: current, offset: remaining };
    remaining -= textLength;
    current = walker.nextNode() as Text | null;
  }

  return lastTextNode ? { node: lastTextNode, offset: lastTextNode.textContent?.length ?? 0 } : null;
};
const unwrapOfficialHighlightElement = (element: Element) => {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
  parent.normalize();
};
const cleanupOfficialHighlightContainer = (container: HTMLElement) => {
  Array.from(container.querySelectorAll(`span.${OFFICIAL_STEM_HIGHLIGHT_CLASS}`)).forEach((element) => {
    if (!element.textContent) element.remove();
  });
  container.normalize();
};
const applyOfficialHighlightToHtml = (html: string, start: number, end: number) => {
  if (start >= end) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  const startBoundary = locateOfficialTextBoundary(container, start);
  const endBoundary = locateOfficialTextBoundary(container, end);
  if (!startBoundary || !endBoundary) return html;

  const range = document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  if (range.collapsed) return html;

  const highlight = document.createElement("span");
  highlight.className = OFFICIAL_STEM_HIGHLIGHT_CLASS;
  highlight.setAttribute("style", "background:#fff59d;");
  highlight.appendChild(range.extractContents());
  range.insertNode(highlight);
  cleanupOfficialHighlightContainer(container);
  return container.innerHTML;
};
const clearOfficialHighlightInHtml = (html: string, start?: number, end?: number) => {
  const container = document.createElement("div");
  container.innerHTML = html;
  const highlightElements = Array.from(container.querySelectorAll(`span.${OFFICIAL_STEM_HIGHLIGHT_CLASS}`));
  if (highlightElements.length === 0) return html;

  if (typeof start !== "number" || typeof end !== "number" || start >= end) {
    highlightElements.forEach((element) => unwrapOfficialHighlightElement(element));
    cleanupOfficialHighlightContainer(container);
    return container.innerHTML;
  }

  const startBoundary = locateOfficialTextBoundary(container, start);
  const endBoundary = locateOfficialTextBoundary(container, end);
  if (!startBoundary || !endBoundary) {
    highlightElements.forEach((element) => unwrapOfficialHighlightElement(element));
    cleanupOfficialHighlightContainer(container);
    return container.innerHTML;
  }

  const range = document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  highlightElements.forEach((element) => {
    if (range.intersectsNode(element)) unwrapOfficialHighlightElement(element);
  });
  cleanupOfficialHighlightContainer(container);
  return container.innerHTML;
};
const createOfficialDialogRect = (): OfficialDialogRect => {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  return {
    left: Math.round(viewportWidth * 0.25),
    top: Math.round(viewportHeight * 0.15),
    width: Math.round(viewportWidth * 0.5),
    height: Math.round(viewportHeight * 0.7),
  };
};

const createOfficialLawDialogMaxRect = (): OfficialDialogRect => {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  return {
    left: 0,
    top: 0,
    width: viewportWidth,
    height: viewportHeight,
  };
};

function OfficialExamShadowRoot({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  useLayoutEffect(() => {
    if (!hostRef.current) return;
    const root = hostRef.current.shadowRoot ?? hostRef.current.attachShadow({ mode: "open" });
    setShadowRoot(root);
  }, []);

  return (
    <div ref={hostRef} style={{ display: "block", minHeight: "100vh" }}>
      {shadowRoot
        ? createPortal(
            <>
              <style>{OFFICIAL_EXAM_SHADOW_RESET}</style>
              <style>{mockExamOfficialCss + OFFICIAL_EXAM_EXTRA_CSS}</style>
              {children}
            </>,
            shadowRoot,
          )
        : null}
    </div>
  );
}

const pageToPath: Record<string, string> = {
  home: "/",
  courses: "/courses",
  audioDetail: "/courses/audio",
  courseDetail: "/courses/video",
  questionBankHome: "/question-bank",
  myQuestionBank: "/question-bank/my",
  questionBank: "/question-bank/practice",
  mockExamHome: "/user/objective-mock-exams",
  mockExamRoom: "/user/mock-exams/records",
  lawSearch: "/user/laws",
  lawPractice: "/user/law-practice",
  typingPractice: "/user/typing-practice",
  myProfile: "/profile",
  myNotes: "/profile/notes",
  editProfile: "/profile/edit",
  subjectiveGrading: "/user/mock-exams",
  settings: "/settings",
};

const isLegacyMockExamPath = (pathname: string) =>
  pathname !== "/login" &&
  (pathname.startsWith("/user/mock-exams/papers") ||
    pathname.startsWith("/user/mock-exams/records") ||
    pathname.startsWith("/user/exam-leaderboard") ||
    pathname.startsWith("/mock-exams") ||
    pathname.startsWith("/grading"));

const pathToPage = (pathname: string) => {
  if (pathname === "/" || pathname === "") return "home";
  if (pathname.startsWith("/courses/audio")) return "audioDetail";
  if (pathname.startsWith("/courses/video")) return "courseDetail";
  if (pathname.startsWith("/courses/")) return "courseDetail";
  if (pathname === "/courses") return "courses";
  if (pathname.startsWith("/question-bank/my")) return "myQuestionBank";
  if (pathname.startsWith("/question-bank/practice")) return "questionBank";
  if (pathname.startsWith("/question-bank")) return "questionBankHome";
  if (pathname.startsWith("/user/objective-mock-exams")) return "mockExamHome";
  if (pathname.startsWith("/user/laws")) return "lawSearch";
  if (pathname.startsWith("/user/law-practice")) return "lawPractice";
  if (pathname.startsWith("/user/typing-practice")) return "typingPractice";
  if (pathname.match(/^\/user\/mock-exams\/records\/[^/]+\/?$/)) return "mockExamRoom";
  if (pathname.startsWith("/user/mock-exams")) return "subjectiveGrading";
  if (pathname.startsWith("/mock-exams/room")) return "mockExamRoom";
  if (pathname.startsWith("/mock-exams")) return "mockExamHome";
  if (pathname.startsWith("/user/my-exams")) return "myProfile";
  if (pathname.startsWith("/profile/notes")) return "myNotes";
  if (pathname.startsWith("/profile/edit")) return "editProfile";
  if (pathname.startsWith("/profile")) return "myProfile";
  if (pathname.startsWith("/grading")) return "subjectiveGrading";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
};

const getRouteCourseIdFromPath = (pathname: string) => {
  const match = pathname.match(/^\/courses\/([^/]+)$/);
  const courseId = match ? decodeURIComponent(match[1]) : null;
  if (courseId === "audio" || courseId === "video") return null;
  return courseId;
};

const getRouteCourseId = () => {
  if (typeof window === "undefined") return null;
  return getRouteCourseIdFromPath(window.location.pathname);
};

const getRouteMockExamTarget = (): MockExamSessionTarget => {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") === "subjective" ? "subjective" : "objective";
  const recordId = params.get("recordId")?.trim();
  if (recordId) return { recordId, mode };

  const paperId = params.get("paperId")?.trim();
  if (paperId) return { paperId, mode };

  return null;
};

const getRouteMockExamMode = (): MockExamMode => {
  if (typeof window === "undefined") return "objective";
  const pathname = window.location.pathname;
  if (pathname.startsWith("/grading") || pathname.startsWith("/user/mock-exams")) return "subjective";
  if (pathname.startsWith("/user/objective-mock-exams")) return "objective";
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "subjective" ? "subjective" : "objective";
};

const getDesktopOnlyFeatureForPage = (
  page: string,
  pathname: string,
  questionTarget?: QuestionPracticeTarget,
  mockMode?: MockExamMode,
): DesktopOnlyFeature | null => {
  if (page === "typingPractice" || pathname.startsWith("/user/typing-practice")) return "typingPractice";
  if (page === "lawPractice" || pathname.startsWith("/user/law-practice")) return "lawPractice";
  if (page === "myQuestionBank" || pathname.startsWith("/question-bank/my")) return "myQuestionBank";
  if (page === "questionBank" || pathname.startsWith("/question-bank/practice")) {
    if (questionTarget?.source === "my" || questionTarget?.layout === "officialSubjective") return "myQuestionBank";
    return null;
  }
  if (page === "subjectiveGrading" || pathname.startsWith("/user/mock-exams")) return "subjectiveReview";
  if (page === "mockExamHome" || pathname.startsWith("/user/objective-mock-exams")) return "objectiveMock";
  if (page === "mockExamRoom") return mockMode === "subjective" ? "subjectiveReview" : "objectiveMock";
  return null;
};

const buildMockExamRoomPath = (target: MockExamSessionTarget) => {
  if (target?.recordId) return `/user/mock-exams/records/${encodeURIComponent(target.recordId)}`;
  if (target?.paperId) return `/user/mock-exams/papers/${encodeURIComponent(target.paperId)}`;
  return target?.mode === "subjective" ? "/user/mock-exams" : "/user/objective-mock-exams";
};

const navIndexForPage = (page: string) => {
  if (page === "courses" || page === "audioDetail" || page === "courseDetail") return 1;
  if (page === "questionBankHome" || page === "myQuestionBank" || page === "questionBank" || page === "mockExamHome" || page === "subjectiveGrading" || page === "mockExamRoom" || page === "lawSearch" || page === "lawPractice" || page === "typingPractice") return 2;
  if (page === "myProfile" || page === "myNotes" || page === "editProfile" || page === "settings") return 3;
  return 0;
};

const AUTH_REQUIRED_PAGES = new Set([
  "audioDetail",
  "courseDetail",
  "questionBankHome",
  "myQuestionBank",
  "questionBank",
  "mockExamHome",
  "subjectiveGrading",
  "mockExamRoom",
  "lawSearch",
  "lawPractice",
  "typingPractice",
  "myProfile",
  "myNotes",
  "editProfile",
  "settings",
]);

const isPageAuthRequired = (page: string) => AUTH_REQUIRED_PAGES.has(page);

const getDisplayName = (user: LegacyUser | null) => user?.displayName || user?.nickname || "得宝用户";
const getUserInitial = (user: LegacyUser | null) => getDisplayName(user).trim().slice(0, 1) || "得";
const USER_AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
const USER_AVATAR_MAX_FILE_SIZE = 2 * 1024 * 1024;
const USER_AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function UserAvatar({
  user,
  size,
  fontSize,
  boxShadow,
}: {
  user: LegacyUser | null;
  size: number;
  fontSize: number;
  boxShadow?: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(145deg,#4e8ef7,#1dc9a4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Noto Serif SC',serif",
        fontWeight: 700,
        fontSize,
        color: "#fff",
        overflow: "hidden",
        boxShadow,
      }}
    >
      <span style={{ position: "relative", zIndex: 0 }}>{getUserInitial(user)}</span>
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt="头像"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 1,
          }}
        />
      ) : null}
    </div>
  );
}

const maskPhone = (phone = "") => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 11) return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  return phone || "未绑定";
};

const formatCount = (value: number | null | undefined) => Math.max(0, Number(value ?? 0)).toLocaleString("zh-CN");
const formatHours = (value: number | null | undefined) => {
  const numeric = Math.max(0, Number(value ?? 0));
  return Number.isInteger(numeric) ? `${numeric}` : numeric.toFixed(1);
};
const formatCurrency = (value: number | null | undefined) =>
  Math.max(0, Number(value ?? 0)).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDateOnly = (value: string | null | undefined) => {
  if (!value) return "-";
  return value.includes(" ") ? value.split(" ")[0] : value.slice(0, 10);
};
const getStudyStreak = (days: { date: string; count: number }[]) => {
  const activeDates = new Set(days.filter(day => Number(day.count ?? 0) > 0).map(day => day.date.slice(0, 10)));
  let cursor = new Date();
  let streak = 0;

  while (streak < 365) {
    const key = [
      cursor.getFullYear(),
      String(cursor.getMonth() + 1).padStart(2, "0"),
      String(cursor.getDate()).padStart(2, "0"),
    ].join("-");
    if (!activeDates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};
const getAccountDays = (registeredAt: string | undefined) => {
  if (!registeredAt) return 0;
  const timestamp = new Date(registeredAt).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(1, Math.floor((Date.now() - timestamp) / 86400000) + 1);
};
const getActivityIconMeta = (type: string) => {
  if (type === "course") return { icon: Play, color: "#c9973e" };
  if (type === "objective_exam") return { icon: Target, color: "#c97ef5" };
  if (type === "subjective_exam") return { icon: FileText, color: "#1dc9a4" };
  if (type === "typing") return { icon: Swords, color: "#f76e6e" };
  return { icon: BookOpen, color: "#4e8ef7" };
};
  const clearLocalLearningCache = () => {
  if (typeof window === "undefined") return;

  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("mock-exam-official-marks:") || key === "mock-exam-official-view")
      .forEach((key) => window.localStorage.removeItem(key));
    Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith("debao:lastMockExamSeries:"))
      .forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Browser privacy modes can block storage access; the caller only needs best-effort cleanup.
  }
};

const getDeviceInfo = () => {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const deviceKey = ensureUserDeviceKey();
  let type = "Web";
  let model = "Browser";

  if (/iPhone/i.test(userAgent)) {
    type = "iPhone";
    model = "iPhone Safari";
  } else if (/iPad/i.test(userAgent)) {
    type = "iPad";
    model = "iPad Safari";
  } else if (/Android/i.test(userAgent)) {
    type = "Android";
    model = "Android Browser";
  } else if (/Windows/i.test(userAgent)) {
    type = "Windows";
    model = "Windows Browser";
  } else if (/Macintosh/i.test(userAgent)) {
    type = "Mac";
    model = "Mac Browser";
  } else if (/Linux/i.test(userAgent)) {
    type = "Linux";
    model = "Linux Browser";
  }

  return { deviceKey, type, model };
};

function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null;

  const color = toast.type === "success" ? "#1dc9a4" : toast.type === "warning" ? "#f7a94e" : "#4e8ef7";

  return (
    <div style={{ position: "fixed", top: 74, left: "50%", transform: "translateX(-50%)", zIndex: 120, padding: "11px 18px", borderRadius: 12, background: "rgba(15,24,38,0.96)", border: `1px solid ${color}55`, color, boxShadow: "0 10px 32px rgba(0,0,0,0.35)", backdropFilter: "blur(18px)", fontSize: 13, fontWeight: 600 }}>
      {toast.text}
    </div>
  );
}

function makeCourseDetail(course: AppCourse) {
  return {
    id: course.id,
    title: course.title,
    teacher: course.teacher,
    initials: course.initials,
    color: course.color,
    category: course.category,
    lessons: course.lessons,
    progress: course.progress,
    enrolled: course.enrolled,
    intro: `${course.title} 是得恩法考为 ${course.category} 阶段配置的系统课程，由 ${course.teacher} 主讲。课程围绕法考高频考点、历年真题和配套练习展开，帮助学员完成“听课理解、刷题巩固、错题复盘、主观表达”的完整学习闭环。`,
    chapters: [] as ChapterModel[],
    materials: [] as CourseMaterial[],
  };
}

/* ══════════════════════ NAV (shared) ══════════════════════ */

function Nav({ activeNav, setActiveNav, setPage, currentUser, studySummary, themeMode, onToggleTheme, onRequestAuth }: {
  activeNav: number;
  setActiveNav: (i: number) => void;
  setPage: (p: string) => void;
  currentUser: LegacyUser | null;
  studySummary: UserStudySummary;
  themeMode: DebaoThemeMode;
  onToggleTheme: () => void;
  onRequestAuth: () => void;
}) {
  const displayName = getDisplayName(currentUser);
  const studyStreak = getStudyStreak(studySummary.heatmapDays);
  const isLightTheme = themeMode === "light";

  return (
    <header className="debao-nav-shell" style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,12,24,0.96)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="debao-nav-inner" style={{ maxWidth: 1340, margin: "0 auto", padding: "0 36px", height: 58, display: "flex", alignItems: "center", gap: 40 }}>
        <div
          className="debao-nav-brand"
          style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0, cursor: "pointer" }}
          onClick={() => { setActiveNav(0); setPage("home"); }}
        >
          <AppLogo compact className="debao-nav-logo" />
        </div>
        <nav className="debao-nav-tabs" style={{ display: "flex", gap: 2 }}>
          {navItems.map((item, i) => {
            const NavIcon = navIcons[i] ?? Circle;
            return (
              <button key={item} onClick={() => { setPage(i === 1 ? "courses" : i === 2 ? "questionBankHome" : i === 3 ? "myProfile" : "home"); }} style={{ padding: "7px 18px", borderRadius: 9, fontSize: 13, border: "none", cursor: "pointer", background: activeNav === i ? "rgba(201,151,62,0.1)" : "transparent", color: activeNav === i ? "#c9973e" : "#5a7898", fontWeight: activeNav === i ? 600 : 400, transition: "all 0.15s" }}>
                <span className="debao-nav-tab-icon"><NavIcon size={20} /></span>
                <span className="debao-nav-tab-label">{item}</span>
              </button>
            );
          })}
        </nav>
        <div className="debao-nav-actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            className="debao-theme-toggle"
            aria-label={isLightTheme ? "切换到黑夜模式" : "切换到白天模式"}
            title={isLightTheme ? "切换到黑夜模式" : "切换到白天模式"}
            onClick={onToggleTheme}
          >
            {isLightTheme ? <Moon size={15} /> : <Sun size={15} />}
            <span>{isLightTheme ? "黑夜" : "白天"}</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 20, background: "rgba(247,110,110,0.08)", border: "1px solid rgba(247,110,110,0.18)" }}>
            <Flame size={13} color="#f76e6e" />
            <span style={{ fontSize: 12, color: "#f76e6e", fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{studyStreak}天连续</span>
          </div>
          <button style={{ position: "relative", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, cursor: "pointer", color: "#5e7898", padding: "7px 9px", display: "flex", alignItems: "center" }}>
            <Bell size={16} />
            <span style={{ position: "absolute", top: 7, right: 7, width: 6, height: 6, borderRadius: "50%", background: "#f76e6e", border: "1.5px solid #090e1a" }} />
          </button>
          {currentUser ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 14, borderLeft: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ position: "relative" }}>
                <UserAvatar user={currentUser} size={36} fontSize={14} />
                <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", background: "#1dc9a4", border: "2px solid #090e1a" }} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#c8d8ee", fontWeight: 600 }}>{displayName}</div>
                <div style={{ fontSize: 10, color: "#3a5570" }}>{maskPhone(currentUser?.phone)}</div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onRequestAuth}
              style={{ padding: "8px 15px", borderRadius: 10, border: "1px solid rgba(201,151,62,0.32)", background: "rgba(201,151,62,0.12)", color: "#e8c46a", cursor: "pointer", fontSize: 13, fontWeight: 800 }}
            >
              登录 / 注册
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function AuthPage({
  onAuthenticated,
  notify,
  variant = "page",
  onClose,
}: {
  onAuthenticated: (user: LegacyUser) => void;
  notify: Notify;
  variant?: "page" | "modal";
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customerServiceUrl, setCustomerServiceUrl] = useState("");
  const authSubtitle =
    mode === "register"
      ? "使用手机号创建得宝账号，注册后会自动进入学习中心。"
      : loginMethod === "sms"
        ? "输入手机号和短信验证码，快速进入得宝学习中心。"
        : "使用手机号和密码登录得宝，继续学习课程、题库和模考。";

  const title = mode === "register" ? "注册得宝账号" : "登录得宝";
  const subtitle = mode === "register" ? "使用手机号创建得宝账号，注册后会自动进入学习中心。" : "使用手机号和密码登录得宝，继续学习课程、题库和模考。";
  const isModal = variant === "modal";

  useEffect(() => {
    if (smsCountdown <= 0) return;
    const timer = window.setTimeout(() => setSmsCountdown((current) => Math.max(current - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [smsCountdown]);

  useEffect(() => {
    let active = true;
    mockApi.getBrandingConfig()
      .then((config) => {
        if (active) setCustomerServiceUrl(config.customerServiceUrl?.trim() ?? "");
      })
      .catch(() => {
        if (active) setCustomerServiceUrl("");
      });
    return () => {
      active = false;
    };
  }, []);

  const openLoginSupport = () => {
    if (!customerServiceUrl) {
      notify("暂未配置客服链接，请联系教务老师处理登录问题", "warning");
      return;
    }
    window.open(customerServiceUrl, "_blank", "noopener,noreferrer");
  };

  const handleSendSmsCode = async () => {
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) {
      setError("请输入手机号");
      return;
    }

    setSmsSending(true);
    setError("");

    try {
      const result = await userService.sendLoginSmsCode(normalizedPhone, mode === "register" ? "register" : "login");
      setSmsCountdown(Math.max(Number(result.retryAfter ?? 60), 1));
      notify("验证码已发送，请注意查收", "success");
    } catch (err) {
      const message = err instanceof ApiRequestError || err instanceof Error ? err.message : "验证码发送失败，请稍后重试";
      setError(message);
      notify(message, "warning");
    } finally {
      setSmsSending(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedPhone = phone.trim();
    const normalizedPassword = password.trim();
    const normalizedSmsCode = smsCode.trim();

    if (!normalizedPhone) {
      setError("请输入手机号");
      return;
    }

    if ((mode === "register" || loginMethod === "sms") && !normalizedSmsCode) {
      setError("请输入短信验证码");
      return;
    }

    if ((mode === "register" || loginMethod === "password") && !normalizedPassword) {
      setError("请输入手机号和密码");
      return;
    }

    if (mode === "register") {
      if (normalizedPassword !== confirmPassword.trim()) {
        setError("两次输入的密码不一致");
        return;
      }
      if (!agreeTerms) {
        setError("请先同意用户协议与隐私政策");
        return;
      }
    }

    setLoading(true);
    setError("");

    try {
      const result =
        mode === "register"
          ? await userService.register(normalizedPhone, normalizedSmsCode, normalizedPassword, confirmPassword.trim(), agreeTerms, getDeviceInfo())
          : loginMethod === "sms"
            ? await userService.loginWithSmsCode(normalizedPhone, normalizedSmsCode, getDeviceInfo())
            : await userService.login(normalizedPhone, normalizedPassword, getDeviceInfo());

      saveUserSession({
        token: result.token,
        userId: result.user.id,
        phone: result.user.phone,
        displayName: getDisplayName(result.user),
        avatarUrl: result.user.avatarUrl || "",
      });
      onAuthenticated(result.user);
      notify(mode === "register" ? "注册成功，已进入得宝" : "登录成功，已进入得宝", "success");
    } catch (err) {
      const message = err instanceof ApiRequestError || err instanceof Error ? err.message : "登录失败，请稍后重试";
      setError(message);
      notify(message, "warning");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="debao-auth-page debao-themed-page"
      style={{
        minHeight: isModal ? "auto" : "100vh",
        position: isModal ? "fixed" : "static",
        inset: isModal ? 0 : undefined,
        zIndex: isModal ? 140 : undefined,
        display: "grid",
        placeItems: "center",
        padding: isModal ? 18 : 24,
        background: isModal ? "rgba(3,7,18,0.72)" : "radial-gradient(circle at 20% 15%,rgba(78,142,247,0.16),transparent 28%),radial-gradient(circle at 80% 20%,rgba(29,201,164,0.12),transparent 26%),#090e1a",
        backdropFilter: isModal ? "blur(16px)" : undefined,
      }}
    >
      <div style={{ width: "100%", maxWidth: 430, maxHeight: isModal ? "calc(100vh - 36px)" : undefined, overflowY: isModal ? "auto" : undefined, position: "relative", background: "#0f1826", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: "28px 30px", boxShadow: "0 22px 70px rgba(0,0,0,0.35)" }}>
        {isModal && (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭登录弹窗"
            style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#8fa3be", cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <X size={16} />
          </button>
        )}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <AppLogo className="debao-auth-logo" />
        </div>

        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 24, color: "#dde4f0", margin: "0 0 8px" }}>{title}</h1>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: "#5a7898", margin: 0 }}>{authSubtitle || subtitle}</p>
        </div>

        {mode === "login" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 4, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }}>
            {(["password", "sms"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setLoginMethod(item);
                  setError("");
                }}
                style={{ padding: "8px 10px", borderRadius: 9, border: "none", cursor: "pointer", background: loginMethod === item ? "rgba(78,142,247,0.16)" : "transparent", color: loginMethod === item ? "#8ab4ff" : "#5a7898", fontSize: 12, fontWeight: 800 }}
              >
                {item === "password" ? "密码登录" : "验证码登录"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, color: "#3a5570", fontWeight: 700 }}>
            手机号
            <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="numeric" autoComplete="tel" style={{ padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.09)", background: "#0a1020", color: "#dde4f0", outline: "none", fontSize: 14 }} />
          </label>
          {mode === "register" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, color: "#3a5570", fontWeight: 700 }}>
              短信验证码
              <span style={{ display: "grid", gridTemplateColumns: "1fr 118px", gap: 8 }}>
                <input value={smsCode} onChange={(event) => setSmsCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" style={{ minWidth: 0, padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.09)", background: "#0a1020", color: "#dde4f0", outline: "none", fontSize: 14 }} />
                <button type="button" disabled={smsSending || smsCountdown > 0} onClick={handleSendSmsCode} style={{ borderRadius: 11, border: "1px solid rgba(78,142,247,0.25)", background: smsSending || smsCountdown > 0 ? "rgba(78,142,247,0.08)" : "rgba(78,142,247,0.16)", color: smsSending || smsCountdown > 0 ? "#5a7898" : "#8ab4ff", cursor: smsSending || smsCountdown > 0 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 800 }}>
                  {smsSending ? "发送中" : smsCountdown > 0 ? `${smsCountdown}s` : "获取验证码"}
                </button>
              </span>
            </label>
          )}
          {(mode === "register" || loginMethod === "password") ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, color: "#3a5570", fontWeight: 700 }}>
              密码
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} style={{ padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.09)", background: "#0a1020", color: "#dde4f0", outline: "none", fontSize: 14 }} />
            </label>
          ) : (
            <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, color: "#3a5570", fontWeight: 700 }}>
              短信验证码
              <span style={{ display: "grid", gridTemplateColumns: "1fr 118px", gap: 8 }}>
                <input value={smsCode} onChange={(event) => setSmsCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" style={{ minWidth: 0, padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.09)", background: "#0a1020", color: "#dde4f0", outline: "none", fontSize: 14 }} />
                <button type="button" disabled={smsSending || smsCountdown > 0} onClick={handleSendSmsCode} style={{ borderRadius: 11, border: "1px solid rgba(78,142,247,0.25)", background: smsSending || smsCountdown > 0 ? "rgba(78,142,247,0.08)" : "rgba(78,142,247,0.16)", color: smsSending || smsCountdown > 0 ? "#5a7898" : "#8ab4ff", cursor: smsSending || smsCountdown > 0 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 800 }}>
                  {smsSending ? "发送中" : smsCountdown > 0 ? `${smsCountdown}s` : "获取验证码"}
                </button>
              </span>
            </label>
          )}
          {mode === "register" && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, color: "#3a5570", fontWeight: 700 }}>
                确认密码
                <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" style={{ padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.09)", background: "#0a1020", color: "#dde4f0", outline: "none", fontSize: 14 }} />
              </label>
              <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12, lineHeight: 1.7, color: "#5a7898" }}>
                <input checked={agreeTerms} onChange={(event) => setAgreeTerms(event.target.checked)} type="checkbox" style={{ marginTop: 4 }} />
                <span>我已同意得宝用户协议与隐私政策</span>
              </label>
            </>
          )}

          {error && <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(247,110,110,0.08)", border: "1px solid rgba(247,110,110,0.2)", color: "#f76e6e", fontSize: 12, lineHeight: 1.6 }}>{error}</div>}

          <button disabled={loading} type="submit" style={{ marginTop: 4, padding: "12px", borderRadius: 12, border: "none", cursor: loading ? "wait" : "pointer", background: loading ? "rgba(201,151,62,0.45)" : "linear-gradient(90deg,#c9973e,#e8c46a)", color: "#090e1a", fontSize: 14, fontWeight: 800 }}>
            {loading ? "正在处理..." : mode === "register" ? "注册并进入得宝" : loginMethod === "sms" ? "验证码登录并进入得宝" : "登录并进入得宝"}
          </button>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
            <span style={{ fontSize: 12, color: "#5a7898" }}>默认密码为 <strong style={{ color: "#e8c46a", fontFamily: "'JetBrains Mono',monospace" }}>den2024</strong></span>
            <button type="button" onClick={openLoginSupport} style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid rgba(78,142,247,0.24)", background: "rgba(78,142,247,0.08)", color: "#8ab4ff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              处理登录问题
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                const nextMode = mode === "register" ? "login" : "register";
                setMode(nextMode);
                setLoginMethod("password");
                setError("");
              }}
              style={{ border: "none", background: "transparent", color: "#e8c46a", cursor: "pointer", fontSize: 12, fontWeight: 800, padding: "4px 0" }}
            >
              {mode === "register" ? "返回登录" : "注册新账号"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

/* ══════════════════════ HOME PAGE ══════════════════════ */

function HomePage({
  setPage,
  setActiveNav,
  goToCourse,
  notify,
  courses,
  homeConfig,
  studySummary,
  loadingStudySummary,
}: {
  setPage: (p: string) => void;
  setActiveNav: (i: number) => void;
  goToCourse: (c: AppCourse) => void;
  notify: Notify;
  courses: AppCourse[];
  homeConfig: UserHomeConfig;
  studySummary: UserStudySummary;
  loadingStudySummary: boolean;
}) {
  const [bannerIdx, setBannerIdx] = useState(0);
  const [joinGroupOpen, setJoinGroupOpen] = useState(false);
  const [joinGroupQrLoadFailed, setJoinGroupQrLoadFailed] = useState(false);
  const [closedSideAds, setClosedSideAds] = useState<Record<string, boolean>>({});
  const bannerTouchRef = useRef<{ startX: number; startY: number } | null>(null);
  const activeCourses = courses;
  const activeHomeCourses = activeCourses.slice(0, 3).map(mapHomeCourse);
  const memberBanners = (homeConfig.memberHome.banners || [])
    .filter((item) => item.isVisible !== false && (item.title || item.description || item.imageUrl))
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0));
  const visibleMemberBanners = memberBanners.length > 0
    ? memberBanners
    : [{
        badge: homeConfig.memberHome.hero.badge,
        title: homeConfig.memberHome.hero.title,
        description: homeConfig.memberHome.hero.description,
        imageUrl: homeConfig.memberHome.bannerImageUrl,
        imageObjectKey: homeConfig.memberHome.bannerImageObjectKey,
        primaryButtonText: "继续学习",
        primaryButtonTarget: "/courses",
        secondaryButtonText: "进入题库",
        secondaryButtonTarget: "/question-bank",
        isVisible: true,
        sortOrder: 0,
      }];
  const activeBannerIndex = Math.min(bannerIdx, Math.max(visibleMemberBanners.length - 1, 0));
  const memberHero = visibleMemberBanners[activeBannerIndex] || visibleMemberBanners[0];
  const memberBannerImageUrl = memberHero?.imageUrl || "/portal/home-hero-banner.png";
  const joinGroupConfig = homeConfig.memberHome.joinGroup;
  const joinGroupQrImageUrl = joinGroupConfig?.qrImageUrl?.trim() || "";
  const sideAds = homeConfig.memberHome.sideAds ?? {};
  const visibleSideAds = ([
    ["left", sideAds.left],
    ["right", sideAds.right],
  ] as const).flatMap(([position, item]) =>
    item?.isVisible && item.imageUrl && !closedSideAds[position] ? [{ position, item }] : [],
  );
  const homeStats = [
    { label: "累计练题", value: formatCount(studySummary.stats.totalPracticeCount), unit: "题", icon: Target, color: "#4e8ef7" },
    { label: "答题正确率", value: studySummary.stats.accuracyRate === null ? "-" : `${studySummary.stats.accuracyRate}`, unit: studySummary.stats.accuracyRate === null ? "" : "%", icon: TrendingUp, color: "#1dc9a4" },
    { label: "累计学习", value: formatHours(studySummary.stats.learnedHours), unit: "小时", icon: Clock, color: "#c9973e" },
    { label: "学习超越", value: formatCount(studySummary.stats.learningHoursBeatPercent ?? 0), unit: "%", icon: Trophy, color: "#c97ef5" },
  ];
  const diagnosisText = studySummary.stats.totalPracticeCount > 0
    ? `已完成 ${formatCount(studySummary.stats.totalPracticeCount)} 题，错题 ${formatCount(studySummary.stats.wrongCount)} 道，收藏 ${formatCount(studySummary.stats.bookmarkedCount)} 道。`
    : "完成练习后，这里会根据练习记录提示错题和收藏复习重点。";
  const goQuestionBank = () => { setPage("questionBankHome"); };
  const goSubjective = () => { setPage("subjectiveGrading"); };
  const openBannerTarget = (target = "", targetType: "link" | "image" = "link", imageUrl = "") => {
    const normalizedTarget = (targetType === "image" ? imageUrl || target : target).trim();
    if (!normalizedTarget) return;
    if (targetType === "image") {
      window.open(buildImageTargetPreviewUrl(normalizedTarget), "_blank", "noopener,noreferrer");
      return;
    }
    if (/^(https?:)?\/\//i.test(normalizedTarget) || /^www\./i.test(normalizedTarget)) {
      const url = /^www\./i.test(normalizedTarget) ? `https://${normalizedTarget}` : normalizedTarget;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const nextPath = normalizedTarget.startsWith("/") ? normalizedTarget : `/${normalizedTarget}`;
    window.history.pushState({ page: pathToPage(nextPath) }, "", nextPath);
    setPage(pathToPage(nextPath));
  };
  const openSideAdTarget = (item: UserHomeConfig["memberHome"]["sideAds"]["left"]) => {
    if (!item) return;
    openBannerTarget(item.target || "", item.targetType === "image" ? "image" : "link", item.targetImageUrl || "");
  };
  const openJoinGroup = () => {
    setJoinGroupQrLoadFailed(false);
    setJoinGroupOpen(true);
  };
  const moveBanner = (direction: -1 | 1) => {
    if (visibleMemberBanners.length <= 1) return;
    setBannerIdx((current) => (current + direction + visibleMemberBanners.length) % visibleMemberBanners.length);
  };
  const openModule = (title: string, page?: string) => {
    if (page === "courses") { setPage("courses"); return; }
    if (title === "题库") { goQuestionBank(); return; }
    if (title === "进入主观批改") { goSubjective(); return; }
    if (title === "客观题模考") { setPage("mockExamHome"); return; }
    if (title === "主观法条检索") { setPage("lawSearch"); return; }
    if (title === "法条练习") { setPage("lawPractice"); return; }
    if (title === "打字练习") { setPage("typingPractice"); return; }
  };

  useEffect(() => {
    setBannerIdx(0);
  }, [visibleMemberBanners.length]);

  useEffect(() => {
    if (visibleMemberBanners.length <= 1) return;
    const timer = window.setInterval(() => {
      setBannerIdx((current) => (current + 1) % visibleMemberBanners.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [visibleMemberBanners.length]);

  return (
    <div className="debao-page debao-home-page debao-themed-page" style={{ maxWidth: 1340, margin: "0 auto", padding: "28px 36px 0" }}>
      {visibleSideAds.map(({ position, item }) => {
        const hasTarget = Boolean(item.target?.trim());
        const hasText = Boolean(item.title?.trim() || item.description?.trim() || item.buttonText?.trim());
        return (
          <aside key={position} className={`debao-home-side-ad debao-home-side-ad-${position}`} aria-label={position === "left" ? "左侧广告位" : "右侧广告位"}>
            <button
              type="button"
              className="debao-home-side-ad-close"
              aria-label="关闭广告"
              onClick={() => setClosedSideAds((current) => ({ ...current, [position]: true }))}
            >
              <X size={13} />
            </button>
            <button
              type="button"
              className={`debao-home-side-ad-card${hasTarget ? "" : " debao-home-side-ad-card-static"}`}
              onClick={() => openSideAdTarget(item)}
              disabled={!hasTarget}
            >
              <img src={item.imageUrl} alt={item.title || "得宝首页广告位"} />
              {hasText ? (
                <span className="debao-home-side-ad-body">
                  {item.title ? <strong>{item.title}</strong> : null}
                  {item.description ? <span>{item.description}</span> : null}
                  {item.buttonText ? <em>{item.buttonText}</em> : null}
                </span>
              ) : null}
            </button>
          </aside>
        );
      })}
      <div className="debao-mobile-home-head">
        <div className="debao-mobile-home-titlebar">
          <AppLogo compact className="debao-mobile-home-logo" />
        </div>
      </div>

      {/* Banner */}
      <div className="debao-home-hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 18, alignItems: "stretch" }}>
        <div
          className="debao-home-hero"
          onTouchStart={(event) => {
            if (visibleMemberBanners.length <= 1) return;
            const touch = event.touches[0];
            if (!touch) return;
            bannerTouchRef.current = { startX: touch.clientX, startY: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const touchStart = bannerTouchRef.current;
            bannerTouchRef.current = null;
            if (!touchStart || visibleMemberBanners.length <= 1) return;
            const touch = event.changedTouches[0];
            if (!touch) return;
            const deltaX = touch.clientX - touchStart.startX;
            const deltaY = touch.clientY - touchStart.startY;
            const isHorizontalSwipe = Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
            if (!isHorizontalSwipe) return;
            moveBanner(deltaX < 0 ? 1 : -1);
          }}
          style={{ position: "relative", borderRadius: 20, overflow: "hidden", minHeight: 330, background: "#101828", touchAction: "pan-y" }}
        >
          <img key={memberBannerImageUrl} src={memberBannerImageUrl} alt={memberHero.title || "得宝学习首页"} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(105deg,rgba(4,8,20,0.95) 0%,rgba(4,8,20,0.8) 45%,rgba(4,8,20,0.15) 100%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(4,8,20,0.7) 0%, transparent 40%)" }} />
          <div className="debao-home-hero-content" style={{ position: "relative", zIndex: 2, padding: "38px 44px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 20, background: "rgba(201,151,62,0.18)", border: "1px solid rgba(201,151,62,0.4)", marginBottom: 20, width: "fit-content" }}>
              <Scale size={11} color="#c9973e" />
              <span style={{ fontSize: 11, color: "#e8c46a", fontWeight: 700, letterSpacing: "0.08em" }}>{memberHero?.badge || "法考学习"}</span>
            </div>
            <h2 className="debao-home-hero-title" style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 36, fontWeight: 700, color: "#f8f0e0", lineHeight: 1.25, marginBottom: 14, whiteSpace: "pre-line", textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}>{memberHero?.title || "欢迎使用得宝"}</h2>
            <p style={{ fontSize: 13, color: "rgba(200,220,248,0.6)", marginBottom: 30, letterSpacing: "0.03em" }}>{memberHero?.description || "课程学习、机考训练、法条检索和打字练习统一收口。"}</p>
            {memberHero?.primaryButtonText || memberHero?.secondaryButtonText ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {memberHero?.primaryButtonText ? (
                  <button onClick={() => openBannerTarget(memberHero.primaryButtonTarget || "/courses", memberHero.primaryButtonTargetType === "image" ? "image" : "link", memberHero.primaryButtonTargetImageUrl || "")} style={{ padding: "11px 26px", borderRadius: 11, fontSize: 13, fontWeight: 700, color: "#090e1a", background: "linear-gradient(90deg,#c9973e,#e8c46a)", border: "none", cursor: "pointer", boxShadow: "0 6px 20px rgba(201,151,62,0.4)" }}>{memberHero.primaryButtonText}</button>
                ) : null}
                {memberHero?.secondaryButtonText ? (
                  <button onClick={() => openBannerTarget(memberHero.secondaryButtonTarget || "/question-bank", memberHero.secondaryButtonTargetType === "image" ? "image" : "link", memberHero.secondaryButtonTargetImageUrl || "")} style={{ padding: "11px 20px", borderRadius: 11, fontSize: 13, color: "rgba(210,228,255,0.82)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", cursor: "pointer" }}>{memberHero.secondaryButtonText}</button>
                ) : null}
              </div>
            ) : null}
          </div>
          {visibleMemberBanners.length > 1 ? (
            <>
              {([{ dir: -1 as const, Icon: ChevronLeft, pos: { left: 16 } }, { dir: 1 as const, Icon: ChevronRight, pos: { right: 16 } }]).map(({ dir, Icon, pos }) => (
                <button key={dir} className="debao-home-hero-arrow" onClick={() => moveBanner(dir)} style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", zIndex: 3, width: 38, height: 38, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", backdropFilter: "blur(8px)", ...pos }}><Icon size={17} /></button>
              ))}
              <div className="debao-home-hero-dots" style={{ position: "absolute", bottom: 20, left: 44, display: "flex", gap: 7, zIndex: 3 }}>
                {visibleMemberBanners.map((_, i) => (
                  <button key={i} className="debao-home-hero-dot" onClick={() => setBannerIdx(i)} style={{ width: i === activeBannerIndex ? 24 : 6, height: 6, borderRadius: 3, border: "none", cursor: "pointer", background: i === activeBannerIndex ? "#c9973e" : "rgba(255,255,255,0.25)", transition: "all 0.3s ease", padding: 0 }} />
                ))}
              </div>
            </>
          ) : null}
        </div>

      </div>

      {/* Modules */}
      <div className="debao-home-modules-section" style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(to bottom,#c9973e,#e8c46a)" }} />
          <span style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 14, fontWeight: 600, color: "#8fa3be" }}>快速入口</span>
        </div>
        <div className="debao-module-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 13 }}>
          {modules.map(m => {
            const Icon = m.icon;
            return (
              <button key={m.id}
                onClick={() => openModule(m.title, m.page)}
                style={{ position: "relative", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 17, padding: "20px 16px 18px", cursor: "pointer", textAlign: "left", transition: "all 0.2s", overflow: "hidden" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${m.color}45`; el.style.background = `linear-gradient(145deg,${m.glow},rgba(255,255,255,0.03))`; el.style.transform = "translateY(-3px)"; el.style.boxShadow = `0 8px 24px ${m.glow}`; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(255,255,255,0.06)"; el.style.background = "rgba(255,255,255,0.03)"; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; }}>
                {m.hot && <span style={{ position: "absolute", top: 11, right: 11, fontSize: 8, fontWeight: 700, color: "#f76e6e", background: "rgba(247,110,110,0.15)", padding: "2px 6px", borderRadius: 7, letterSpacing: "0.05em" }}>HOT</span>}
                {m.desktopOnly && <span className="debao-module-desktop-badge" style={{ position: "absolute", top: 11, right: 11, fontSize: 9, fontWeight: 800, color: m.color, background: `${m.color}18`, border: `1px solid ${m.color}26`, padding: "2px 7px", borderRadius: 7, letterSpacing: "0.04em" }}>电脑端</span>}
                <div className="debao-module-card-icon" style={{ width: 44, height: 44, borderRadius: 13, background: `${m.color}14`, border: `1px solid ${m.color}25`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <Icon size={21} color={m.color} />
                </div>
                <div className="debao-module-card-title" style={{ fontSize: 13, fontWeight: 600, color: "#dde4f0", marginBottom: 4 }}>{m.title}</div>
                <div className="debao-module-card-subtitle" style={{ fontSize: 11, color: "#3a5570" }}>{m.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="debao-home-content-grid" style={{ marginTop: 28, paddingBottom: 56, display: "grid", gridTemplateColumns: "1fr 308px", gap: 22 }}>
        <div className="debao-home-study-column">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(to bottom,#c9973e,#e8c46a)" }} />
              <h2 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 16, fontWeight: 600, color: "#dde4f0" }}>继续学习</h2>
              <span style={{ fontSize: 11, color: "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>{activeHomeCourses.length} 门进行中</span>
            </div>
            <button onClick={() => { setPage("courses"); }} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#4e8ef7", background: "none", border: "none", cursor: "pointer", opacity: 0.85 }}>全部课程 <ChevronRight size={12} /></button>

          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {activeHomeCourses.length === 0 ? (
              <div style={{ background: "#0f1826", borderRadius: 17, border: "1px solid rgba(255,255,255,0.06)", padding: "28px 24px", color: "#3a5570", fontSize: 13, lineHeight: 1.8 }}>
                当前账号暂无可继续学习的课程。课程开通后，这里会显示最近学习入口。
              </div>
            ) : activeHomeCourses.map(c => (
              <div key={c.id} className="debao-continue-card" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "stretch", background: "#0f1826", borderRadius: 17, border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", overflow: "hidden", transition: "border-color 0.15s,box-shadow 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.13)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>
                <div style={{ width: 4, background: `linear-gradient(to bottom,${c.color},${c.color}44)` }} />
                <div className="debao-continue-card-body" style={{ padding: "18px 22px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 6, background: `${c.color}15`, color: c.color }}>{c.tag}</span>
                    <span style={{ fontSize: 11, color: "#2e4260", marginLeft: "auto" }}>已学 {c.progress}%</span>
                  </div>
                  <div className="debao-continue-card-title" style={{ fontSize: 14, fontWeight: 600, color: "#dde4f0", marginBottom: 5 }}>{c.title}</div>
                  <div className="debao-continue-card-meta" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${c.color}20`, border: `1px solid ${c.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: c.color }}>{c.initials}</div>
                    <span style={{ fontSize: 12, color: "#3a5570" }}>{c.teacher} 主讲 · 共 {c.total} 讲</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${c.progress}%`, background: `linear-gradient(90deg,${c.color},${c.color}88)`, borderRadius: 4 }} />
                  </div>
                </div>
                <div className="debao-continue-card-action" style={{ display: "flex", alignItems: "center", padding: "0 22px" }}>
                  <button onClick={() => {
                    const targetCourse = activeCourses.find(course => course.id === c.id);
                    if (targetCourse) goToCourse(targetCourse);
                  }} style={{ width: 42, height: 42, borderRadius: "50%", background: `${c.color}14`, border: `1px solid ${c.color}30`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Play size={15} color={c.color} fill={c.color} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="debao-diagnosis-card" style={{ marginTop: 14, padding: "15px 22px", borderRadius: 15, background: "linear-gradient(120deg,rgba(78,142,247,0.07),rgba(29,201,164,0.05))", border: "1px solid rgba(78,142,247,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(78,142,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Zap size={15} color="#4e8ef7" /></div>
              <div><div style={{ fontSize: 12, color: "#dde4f0", fontWeight: 600, marginBottom: 2 }}>学情复盘</div><div style={{ fontSize: 12, color: "#4a6888" }}>{diagnosisText}</div></div>
            </div>
            <button onClick={goQuestionBank} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#4e8ef7", background: "rgba(78,142,247,0.1)", border: "1px solid rgba(78,142,247,0.2)", borderRadius: 8, padding: "7px 14px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>专项练习 <ChevronRight size={12} /></button>
          </div>
          <div className="debao-learning-rank-card" style={{ marginTop: 12, padding: "15px 22px", borderRadius: 15, background: "linear-gradient(120deg,rgba(201,151,62,0.11),rgba(247,169,78,0.06))", border: "1px solid rgba(201,151,62,0.18)", display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(201,151,62,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Trophy size={15} color="#e8c46a" /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#dde4f0", fontWeight: 700, marginBottom: 2 }}>你的学习时长超越了 {loadingStudySummary ? "..." : `${studySummary.stats.learningHoursBeatPercent ?? 0}%`} 的学员</div>
              <div style={{ fontSize: 12, color: "#5a7898" }}>按累计音频和视频学习时长排名计算。</div>
            </div>
          </div>
        </div>
        <div className="debao-home-side-column" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#0f1826", borderRadius: 17, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(to bottom,#c9973e,#e8c46a)" }} />
              <span style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 14, fontWeight: 600, color: "#dde4f0" }}>我的数据</span>
            </div>
            <div style={{ padding: "4px 0" }}>
              {homeStats.map((s, i) => { const Icon = s.icon; return (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", borderBottom: i < homeStats.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: `${s.color}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={15} color={s.color} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#3a5570", marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 500, color: "#dde4f0", lineHeight: 1 }}>{loadingStudySummary ? "..." : s.value}<span style={{ fontSize: 12, color: "#4a6888", marginLeft: 3 }}>{loadingStudySummary ? "" : s.unit}</span></div>
                  </div>
                </div>
              ); })}
            </div>
          </div>
          <div style={{ background: "#0f1826", borderRadius: 17, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{ padding: "18px 20px 16px", background: "linear-gradient(135deg,rgba(29,201,164,0.1),rgba(29,201,164,0.04))", borderBottom: "1px solid rgba(29,201,164,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <QrCode size={15} color="#1dc9a4" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#dde4f0", fontFamily: "'Noto Serif SC',serif" }}>{joinGroupConfig?.title || "进群"}</span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1dc9a4", boxShadow: "0 0 6px #1dc9a4" }} />
                  <span style={{ fontSize: 10, color: "#1dc9a4", fontWeight: 600 }}>{joinGroupConfig?.statusText || "可加入"}</span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#3d5e78", lineHeight: 1.75 }}>{joinGroupConfig?.description || "扫码加入26法考资料分享群，获取备考资料、考点汇总和学习交流。"}</p>
            </div>
            <div style={{ padding: "14px 20px" }}>
              <button onClick={openJoinGroup} style={{ width: "100%", padding: "10px", borderRadius: 11, background: "rgba(29,201,164,0.1)", border: "1px solid rgba(29,201,164,0.2)", color: "#1dc9a4", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{joinGroupConfig?.buttonText || "扫码进群"}</button>
            </div>
          </div>
        </div>
      </div>
      {joinGroupOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={joinGroupConfig?.buttonText || "扫码进群"}
          onClick={() => setJoinGroupOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(3,7,18,0.72)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center", padding: 24 }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(94vw, 520px)", borderRadius: 20, background: "#0f1826", border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", boxShadow: "0 28px 90px rgba(0,0,0,0.45)" }}
          >
            <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <QrCode size={17} color="#1dc9a4" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: "#dde4f0", fontWeight: 800 }}>{joinGroupConfig?.modalTitle || "扫码加入26法考资料分享群"}</div>
                <div style={{ fontSize: 11, color: "#5a7898", marginTop: 3 }}>{joinGroupConfig?.modalHint || "长按或截图后使用微信扫码加入"}</div>
              </div>
              <button type="button" onClick={() => setJoinGroupOpen(false)} aria-label="关闭" style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#8fa3be", display: "grid", placeItems: "center", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 18, background: "linear-gradient(180deg,rgba(78,142,247,0.08),rgba(29,201,164,0.05))" }}>
              {!joinGroupQrImageUrl || joinGroupQrLoadFailed ? (
                <div style={{ minHeight: 260, borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px dashed rgba(255,255,255,0.18)", display: "grid", placeItems: "center", textAlign: "center", padding: 24, color: "#8fa3be", fontSize: 13, lineHeight: 1.8 }}>
                  二维码图片暂未配置<br />
                  请到后台系统配置上传进群二维码
                </div>
              ) : (
                <img src={joinGroupQrImageUrl} alt={joinGroupConfig?.modalTitle || "进群二维码"} onError={() => setJoinGroupQrLoadFailed(true)} style={{ width: "100%", display: "block", borderRadius: 14, background: "#fff" }} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════ COURSES PAGE ══════════════════════ */

function CoursesPage({ setPage, goToCourse, notify, courses, loadingCourses, studySummary, loadingStudySummary }: { setPage: (p: string) => void; goToCourse: (c: AppCourse) => void; notify: Notify; courses: AppCourse[]; loadingCourses: boolean; studySummary: UserStudySummary; loadingStudySummary: boolean }) {
  const [activeCategory, setActiveCategory] = useState("音频课程");
  const [searchVal, setSearchVal] = useState("");
  const sourceCourses = courses;

  useEffect(() => {
    if (loadingCourses || sourceCourses.length === 0) return;
    if (sourceCourses.some(course => course.category === activeCategory)) return;
    const firstAvailableCategory = courseCategories.find(category => sourceCourses.some(course => course.category === category));
    if (firstAvailableCategory) setActiveCategory(firstAvailableCategory);
  }, [activeCategory, loadingCourses, sourceCourses]);

  const filtered = sourceCourses.filter(c => {
    const matchCategory = c.category === activeCategory;
    const matchSearch = !searchVal || c.title.includes(searchVal) || c.teacher.includes(searchVal);
    return matchCategory && matchSearch;
  }).sort((a, b) => (b.enrolled ? 1 : 0) - (a.enrolled ? 1 : 0));

  const enrolledCourses = sourceCourses.filter(c => c.enrolled);
  const totalProgress = enrolledCourses.length > 0 ? Math.round(enrolledCourses.reduce((s, c) => s + c.progress, 0) / enrolledCourses.length) : 0;

  return (
    <div className="debao-courses-page debao-themed-page" style={{ maxWidth: 1340, margin: "0 auto", padding: "32px 36px 56px" }}>

      {/* Page header */}
      <div className="debao-courses-header" style={{ marginBottom: 28 }}>
        <div className="debao-courses-breadcrumb" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3a5570", marginBottom: 14 }}>
          <span style={{ cursor: "pointer", color: "#4e8ef7" }}>首页</span>
          <ChevronRight size={12} />
          <span>课程中心</span>
        </div>
        <div className="debao-courses-title-row" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 26, fontWeight: 700, color: "#dde4f0", marginBottom: 6 }}>课程学习</h1>
            <p style={{ fontSize: 13, color: "#3a5570" }}>系统备考 · 名师精讲 · 配套题库 · 随时回看</p>
          </div>
          {/* Search */}
          <div className="debao-courses-search" style={{ position: "relative" }}>
            <Search size={14} color="#3a5570" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              placeholder="搜索课程或老师"
              style={{ width: 240, padding: "9px 14px 9px 36px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#dde4f0", fontSize: 13, outline: "none" }}
            />
          </div>
        </div>
      </div>

      {/* My progress strip */}
      <div className="debao-courses-summary" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "学习中课程", value: `${enrolledCourses.length} 门`, icon: BookOpen, color: "#c9973e" },
          { label: "综合学习进度", value: `${totalProgress}%`, icon: TrendingUp, color: "#1dc9a4" },
          { label: "本周学习时长", value: loadingStudySummary ? "..." : `${formatHours(studySummary.stats.weekLearnedHours)} h`, icon: Clock, color: "#4e8ef7" },
          { label: "已完成课时", value: loadingStudySummary ? "..." : `${studySummary.stats.completedCourseContentCount} 讲`, icon: CheckCircle2, color: "#c97ef5" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div className="debao-courses-summary-card" key={s.label} style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${s.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={18} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#3a5570", marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 600, color: "#dde4f0", lineHeight: 1 }}>{s.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="debao-courses-filters" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div className="debao-courses-opened-count" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "#5a7898", fontSize: 12 }}>
          <CheckCircle2 size={14} color="#1dc9a4" />
          已开通课程
          <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#c9973e", fontWeight: 700 }}>{enrolledCourses.length}</span>
        </div>

        {/* Category pills */}
        <div className="debao-courses-tabs" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {courseCategories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: "6px 16px", borderRadius: 20, fontSize: 12, border: `1px solid ${activeCategory === cat ? "rgba(201,151,62,0.45)" : "rgba(255,255,255,0.07)"}`, cursor: "pointer", background: activeCategory === cat ? "rgba(201,151,62,0.1)" : "rgba(255,255,255,0.02)", color: activeCategory === cat ? "#c9973e" : "#3a5570", fontWeight: activeCategory === cat ? 600 : 400, transition: "all 0.15s" }}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="debao-courses-result-count" style={{ fontSize: 12, color: "#2e4260", marginBottom: 18, fontFamily: "'JetBrains Mono',monospace" }}>
        {loadingCourses ? "正在读取课程..." : `共 ${filtered.length} 门已开通课程`}
      </div>

      {/* Course grid */}
      {loadingCourses ? (
        <div className="debao-courses-empty" style={{ textAlign: "center", padding: "82px 24px", color: "#2e4260", background: "#0f1826", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18 }}>
          <BookOpen size={42} color="#1e3050" style={{ margin: "0 auto 16px" }} />
          <div style={{ fontSize: 15, color: "#5a7898", marginBottom: 6 }}>正在读取课程</div>
          <div style={{ fontSize: 12, color: "#2e4260", lineHeight: 1.8 }}>正在读取课程权限和目录，请稍候。</div>
        </div>
      ) : sourceCourses.length === 0 ? (
        <div className="debao-courses-empty" style={{ textAlign: "center", padding: "82px 24px", color: "#2e4260", background: "#0f1826", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18 }}>
          <BookOpen size={42} color="#1e3050" style={{ margin: "0 auto 16px" }} />
          <div style={{ fontSize: 15, color: "#5a7898", marginBottom: 6 }}>当前账号还没有开通课程</div>
          <div style={{ fontSize: 12, color: "#2e4260", lineHeight: 1.8 }}>给用户开通课程后，这里会自动显示可学习内容。</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="debao-courses-empty" style={{ textAlign: "center", padding: "80px 0", color: "#2e4260" }}>
          <BookOpen size={40} color="#1e3050" style={{ margin: "0 auto 16px" }} />
          <div style={{ fontSize: 14 }}>暂无匹配课程</div>
        </div>
      ) : (
        <div className="debao-course-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          {filtered.map(c => (
            <div className="debao-course-card" key={c.id}
              style={{ background: "#0f1826", borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", cursor: "default", transition: "all 0.2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${c.color}35`; (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 28px rgba(0,0,0,0.35)`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
            >
              {/* Card cover */}
              <div className="debao-course-card-cover" style={{ height: 110, position: "relative", background: categoryGrad[c.category] || "linear-gradient(135deg,#0f1826,#1a2a3a)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {/* decorative glow */}
                <div style={{ position: "absolute", right: -20, top: -20, width: 120, height: 120, borderRadius: "50%", background: `${c.color}15`, filter: "blur(30px)" }} />
                <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 28, fontWeight: 800, color: "rgba(255,255,255,0.86)", letterSpacing: 0, userSelect: "none", textAlign: "center", padding: "0 22px", lineHeight: 1.22, maxWidth: "92%", textShadow: "0 2px 12px rgba(0,0,0,0.28)" }}>{c.title}</div>
                {/* tag */}
                <div style={{ position: "absolute", top: 12, left: 14, display: "flex", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}30` }}>{c.category}</span>
                  {c.type === "audio" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(201,126,245,0.18)", color: "#c97ef5", border: "1px solid rgba(201,126,245,0.3)", display: "flex", alignItems: "center", gap: 3 }}><Volume2 size={9} />音频</span>}
                  {c.type === "video" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(78,142,247,0.18)", color: "#4e8ef7", border: "1px solid rgba(78,142,247,0.3)", display: "flex", alignItems: "center", gap: 3 }}><PlayCircle size={9} />视频</span>}
                </div>
                {c.tag && tagBadge[c.tag] && (
                  <span style={{ position: "absolute", top: 12, right: 14, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: tagBadge[c.tag].bg, color: tagBadge[c.tag].color }}>{c.tag}</span>
                )}
                {c.enrolled && (
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.05)" }}>
                    <div style={{ height: "100%", width: `${c.progress}%`, background: `linear-gradient(90deg,${c.color},${c.color}88)` }} />
                  </div>
                )}
              </div>

              {/* Card body */}
              <div className="debao-course-card-body" style={{ padding: "16px 18px 18px" }}>
                <div className="debao-course-card-title" style={{ fontSize: 14, fontWeight: 600, color: "#dde4f0", lineHeight: 1.45, marginBottom: 10 }}>{c.title}</div>

                {/* Teacher */}
                <div className="debao-course-card-teacher" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${c.color}20`, border: `1px solid ${c.color}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: c.color, flexShrink: 0 }}>{c.initials}</div>
                  <span style={{ fontSize: 12, color: "#3a5570" }}>{c.teacher} · {c.lessons} 讲</span>
                </div>

                {/* Meta */}
                <div className="debao-course-card-meta" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  {c.enrolled && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
                      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${c.progress}%`, background: `${c.color}`, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10, color: c.color, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{c.progress}%</span>
                    </div>
                  )}
                </div>

                {/* CTA */}
                <button
                  className="debao-course-card-action"
                  onClick={() => {
                    if (!c.enrolled) {
                      notify("课程暂未开通，开通后可进入学习", "info");
                      return;
                    }
                    goToCourse(c);
                  }}
                  style={{ width: "100%", padding: "9px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: c.enrolled ? `${c.color}14` : "rgba(255,255,255,0.04)", color: c.enrolled ? c.color : "#5a7898", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = c.enrolled ? `${c.color}22` : "rgba(255,255,255,0.08)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = c.enrolled ? `${c.color}14` : "rgba(255,255,255,0.04)"}>
                  <Play size={12} fill={c.enrolled ? c.color : "#5a7898"} color={c.enrolled ? c.color : "#5a7898"} />
                  {c.enrolled ? "继续学习" : "立即报名"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ COURSE DETAIL DATA ══════════════════════ */

const courseDetail = {
  id: 2,
  title: "客观题精讲：民法刑法行政法",
  teacher: "张明楷",
  initials: "张",
  color: "#4e8ef7",
  category: "客观题精讲",
  rating: 4.9,
  students: 12380,
  lessons: 86,
  progress: 68,
  enrolled: true,
  intro: "本课程由著名法学家张明楷教授主讲，系统梳理法考客观题三大核心科目——民法、刑法、行政法的重点知识体系，配合历年真题讲解，帮助考生高效掌握命题规律，稳步提升客观题得分。",
  chapters: [
    {
      id: 1, title: "第一章 · 民法总则", total: 8, done: 8,
      lessons: [
        { id: 1,  title: "民事法律关系概述", duration: "42:30", done: true,  current: false },
        { id: 2,  title: "自然人的民事权利能力", duration: "38:15", done: true,  current: false },
        { id: 3,  title: "法人制度精讲", duration: "51:20", done: true,  current: false },
        { id: 4,  title: "民事法律行为的成立与效力", duration: "56:40", done: true,  current: false },
        { id: 5,  title: "代理制度详解", duration: "44:10", done: true,  current: false },
        { id: 6,  title: "诉讼时效与除斥期间", duration: "39:55", done: true,  current: false },
        { id: 7,  title: "民法总则真题解析（上）", duration: "48:00", done: true,  current: false },
        { id: 8,  title: "民法总则真题解析（下）", duration: "45:30", done: true,  current: false },
      ],
    },
    {
      id: 2, title: "第二章 · 合同法", total: 10, done: 7,
      lessons: [
        { id: 9,  title: "合同的成立与效力", duration: "53:20", done: true,  current: false },
        { id: 10, title: "合同的履行", duration: "47:40", done: true,  current: false },
        { id: 11, title: "合同的变更与转让", duration: "41:15", done: true,  current: false },
        { id: 12, title: "合同的解除", duration: "49:30", done: true,  current: false },
        { id: 13, title: "违约责任", duration: "58:10", done: true,  current: false },
        { id: 14, title: "买卖合同专题", duration: "62:00", done: true,  current: false },
        { id: 15, title: "租赁与借款合同", duration: "44:50", done: true,  current: false },
        { id: 16, title: "建设工程合同精讲", duration: "55:20", done: false, current: true  },
        { id: 17, title: "合同法综合真题（上）", duration: "50:00", done: false, current: false },
        { id: 18, title: "合同法综合真题（下）", duration: "50:00", done: false, current: false },
      ],
    },
    {
      id: 3, title: "第三章 · 物权法", total: 8, done: 0,
      lessons: [
        { id: 19, title: "物权基本理论", duration: "46:00", done: false, current: false },
        { id: 20, title: "不动产登记制度", duration: "38:30", done: false, current: false },
        { id: 21, title: "所有权的取得", duration: "42:10", done: false, current: false },
        { id: 22, title: "共有制度", duration: "35:50", done: false, current: false },
        { id: 23, title: "用益物权详解", duration: "53:00", done: false, current: false },
        { id: 24, title: "担保物权：抵押权", duration: "60:20", done: false, current: false },
        { id: 25, title: "担保物权：质权与留置权", duration: "48:40", done: false, current: false },
        { id: 26, title: "物权法真题精析", duration: "55:00", done: false, current: false },
      ],
    },
    {
      id: 4, title: "第四章 · 刑法总论", total: 12, done: 0,
      lessons: [
        { id: 27, title: "刑法基本原则与适用范围", duration: "44:00", done: false, current: false },
        { id: 28, title: "犯罪构成四要件", duration: "68:30", done: false, current: false },
        { id: 29, title: "故意与过失", duration: "52:15", done: false, current: false },
        { id: 30, title: "犯罪的未完成形态", duration: "57:40", done: false, current: false },
      ],
    },
  ],
  materials: [
    { id: 1, name: "民法总则讲义.pdf", size: "3.2 MB", type: "pdf" },
    { id: 2, name: "合同法核心考点速查表.pdf", size: "1.8 MB", type: "pdf" },
    { id: 3, name: "物权法思维导图.pdf", size: "2.4 MB", type: "pdf" },
    { id: 4, name: "刑法总论习题集.pdf", size: "5.6 MB", type: "pdf" },
    { id: 5, name: "历年客观题命题规律总结.docx", size: "1.1 MB", type: "doc" },
  ],
};

/* ══════════════════════ COURSE SUBJECT PAGE ══════════════════════ */

const subjectMap: Record<string, { name: string; color: string; icon: string; lessons: number; done: number; chapters: number }[]> = {
  全程班: [
    { name: "民法",     color: "#c9973e", icon: "民", lessons: 28, done: 19, chapters: 6 },
    { name: "刑法",     color: "#f76e6e", icon: "刑", lessons: 24, done: 10, chapters: 5 },
    { name: "行政法",   color: "#4e8ef7", icon: "行", lessons: 18, done: 3,  chapters: 4 },
    { name: "民事诉讼法", color: "#1dc9a4", icon: "民诉", lessons: 14, done: 0, chapters: 3 },
    { name: "刑事诉讼法", color: "#c97ef5", icon: "刑诉", lessons: 12, done: 0, chapters: 3 },
    { name: "商法",     color: "#f7a94e", icon: "商", lessons: 10, done: 0,  chapters: 2 },
    { name: "三国法",   color: "#1dc9a4", icon: "三", lessons: 8,  done: 0,  chapters: 2 },
    { name: "理论法",   color: "#8fa3be", icon: "论", lessons: 6,  done: 0,  chapters: 1 },
  ],
  客观题精讲: [
    { name: "民法",     color: "#c9973e", icon: "民", lessons: 26, done: 22, chapters: 5 },
    { name: "刑法",     color: "#f76e6e", icon: "刑", lessons: 20, done: 4,  chapters: 4 },
    { name: "行政法",   color: "#4e8ef7", icon: "行", lessons: 16, done: 0,  chapters: 3 },
    { name: "商法与经济法", color: "#f7a94e", icon: "商", lessons: 12, done: 0, chapters: 2 },
  ],
  主观题精讲: [
    { name: "民法案例分析", color: "#c9973e", icon: "民", lessons: 14, done: 4, chapters: 3 },
    { name: "刑法案例分析", color: "#f76e6e", icon: "刑", lessons: 12, done: 0, chapters: 3 },
    { name: "行政法论述", color: "#4e8ef7", icon: "行", lessons: 10, done: 0, chapters: 2 },
    { name: "综合写作训练", color: "#1dc9a4", icon: "综", lessons: 8, done: 0, chapters: 2 },
  ],
  真题解析班: [
    { name: "卷一精析",   color: "#c9973e", icon: "卷一", lessons: 18, done: 0, chapters: 4 },
    { name: "卷二精析",   color: "#4e8ef7", icon: "卷二", lessons: 18, done: 0, chapters: 4 },
  ],
  冲刺押题班: [
    { name: "客观题高频考点", color: "#f76e6e", icon: "客", lessons: 12, done: 0, chapters: 3 },
    { name: "主观题模拟训练", color: "#c97ef5", icon: "主", lessons: 12, done: 0, chapters: 3 },
  ],
  专项突破: [
    { name: "核心罪名精讲", color: "#f76e6e", icon: "刑", lessons: 18, done: 0, chapters: 4 },
  ],
  音频课程: [
    { name: "民法",     color: "#c9973e", icon: "民", lessons: 10, done: 6,  chapters: 3 },
    { name: "刑法",     color: "#f76e6e", icon: "刑", lessons: 8,  done: 2,  chapters: 2 },
    { name: "行政法",   color: "#4e8ef7", icon: "行", lessons: 6,  done: 0,  chapters: 2 },
    { name: "诉讼法",   color: "#1dc9a4", icon: "诉", lessons: 8,  done: 0,  chapters: 2 },
  ],
};

const chOrdinals = ["一","二","三","四","五","六","七","八","九","十"];

function makeSubjectChapters(s: { name: string; lessons: number; done: number; chapters: number; color: string }) {
  const n = Math.max(1, s.chapters);
  const base = Math.floor(s.lessons / n);
  let doneLeft = s.done;
  return Array.from({ length: n }, (_, i) => {
    const cnt = i === n - 1 ? s.lessons - base * (n - 1) : base;
    const done = Math.min(doneLeft, cnt);
    doneLeft -= done;
    return { id: i + 1, ordinal: chOrdinals[i] ?? String(i + 1), cnt, done };
  });
}

function CourseSubjectPage({ setPage, course }: { setPage: (p: string) => void; course: AppCourse | null }) {
  const c = course;
  if (!c) {
    setPage("courses");
    return null;
  }
  const subjects = subjectMap[c.category] ?? subjectMap["客观题精讲"];

  const defaultIdx = Math.max(0, subjects.findIndex(s => s.done > 0));
  const [activeIdx, setActiveIdx] = useState(defaultIdx);

  const active  = subjects[activeIdx];
  const chapters = makeSubjectChapters(active);
  const activePct = active.lessons > 0 ? Math.round((active.done / active.lessons) * 100) : 0;
  const totalLessons = subjects.reduce((s, x) => s + x.lessons, 0);
  const doneLessons  = subjects.reduce((s, x) => s + x.done,    0);
  const overallPct   = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;

  const isAudio   = c.type === "audio";
  const targetPage = isAudio ? "audioDetail" : "courseDetail";

  return (
    <div className="debao-course-subject-page debao-themed-page" style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 36px 80px" }}>

      {/* ── Compact header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <button onClick={() => setPage("courses")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 13, color: "#5a7898", flexShrink: 0 }}>
          <ChevronLeft size={14} /> 课程中心
        </button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${c.color}20`, border: `1px solid ${c.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: c.color, flexShrink: 0 }}>{c.initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 17, fontWeight: 700, color: "#dde4f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
              <span style={{ fontSize: 11, color: "#3a5570" }}>{c.teacher}</span>
              <span style={{ fontSize: 11, color: "#3a5570" }}>共 {c.lessons} 讲</span>
              {c.enrolled && <span style={{ fontSize: 11, color: c.color, fontFamily: "'JetBrains Mono',monospace" }}>总进度 {overallPct}%</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: `${c.color}18`, color: c.color, border: `1px solid ${c.color}28` }}>{c.category}</span>
          {isAudio && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "rgba(201,126,245,0.12)", color: "#c97ef5", border: "1px solid rgba(201,126,245,0.22)", display: "flex", alignItems: "center", gap: 4 }}><Volume2 size={10} /> 音频</span>}
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

        {/* ── LEFT: subject list ── */}
        <div style={{ width: 210, flexShrink: 0, position: "sticky", top: 24 }}>
          <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2e4260", letterSpacing: "0.06em" }}>科目选择</div>
              <div style={{ fontSize: 10, color: "#1e3050", marginTop: 2 }}>{subjects.length} 个科目 · {totalLessons} 讲</div>
            </div>
            <div style={{ padding: "8px 0" }}>
              {subjects.map((s, idx) => {
                const pct = s.lessons > 0 ? Math.round((s.done / s.lessons) * 100) : 0;
                const isActive = idx === activeIdx;
                return (
                  <div key={idx} onClick={() => setActiveIdx(idx)}
                    style={{ padding: "10px 16px", cursor: "pointer", background: isActive ? `${s.color}0e` : "transparent", borderLeft: `3px solid ${isActive ? s.color : "transparent"}`, transition: "all 0.15s" }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? s.color : "#7a96b4", fontFamily: "'Noto Serif SC',serif" }}>{s.name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: pct > 0 ? s.color : "#1e3050", fontWeight: 600 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 2, borderRadius: 1, background: "rgba(255,255,255,0.05)" }}>
                      <div style={{ height: "100%", borderRadius: 1, width: `${pct}%`, background: s.color, opacity: 0.7 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#1e3050", marginTop: 4 }}>{s.chapters} 章 · {s.done}/{s.lessons} 讲</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT: selected subject detail ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Subject header card */}
          <div style={{ borderRadius: 18, overflow: "hidden", marginBottom: 18, background: `linear-gradient(135deg,${active.color}1a,${active.color}08)`, border: `1px solid ${active.color}28` }}>
            <div style={{ height: 3, background: `linear-gradient(90deg,${active.color},${active.color}44)` }} />
            <div style={{ padding: "22px 26px", display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: `${active.color}20`, border: `1.5px solid ${active.color}38`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Serif SC',serif", fontWeight: 800, fontSize: active.icon.length > 1 ? 12 : 20, color: active.color, flexShrink: 0 }}>
                {active.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 20, fontWeight: 700, color: "#dde4f0", marginBottom: 6 }}>{active.name}</div>
                <div style={{ display: "flex", gap: 18 }}>
                  <span style={{ fontSize: 12, color: "#3a5570" }}>{active.chapters} 章</span>
                  <span style={{ fontSize: 12, color: "#3a5570" }}>{active.lessons} 讲</span>
                  {active.done > 0 && <span style={{ fontSize: 12, color: active.color }}>已学 {active.done} 讲</span>}
                </div>
              </div>
              {/* Progress ring area */}
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 700, color: activePct > 0 ? active.color : "#1e3050", lineHeight: 1 }}>{activePct}<span style={{ fontSize: 14, fontWeight: 400 }}>%</span></div>
                <div style={{ fontSize: 10, color: "#2e4260", marginTop: 4 }}>完成进度</div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ height: 4, background: "rgba(255,255,255,0.05)" }}>
              <div style={{ height: "100%", width: `${activePct}%`, background: `linear-gradient(90deg,${active.color}80,${active.color})`, transition: "width 0.4s ease" }} />
            </div>
          </div>

          {/* Chapter list */}
          <div style={{ background: "#0f1826", borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", marginBottom: 18 }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#8fa3be" }}>课程章节</span>
              <span style={{ fontSize: 11, color: "#2e4260" }}>共 {chapters.length} 章</span>
            </div>
            <div style={{ padding: "8px 0" }}>
              {chapters.map((ch, i) => {
                const chPct = ch.cnt > 0 ? Math.round((ch.done / ch.cnt) * 100) : 0;
                const chDone = ch.done === ch.cnt && ch.cnt > 0;
                const chStarted = ch.done > 0;
                return (
                  <div key={ch.id}
                    style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 22px", borderBottom: i < chapters.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                    {/* Chapter badge */}
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: chDone ? `${active.color}20` : chStarted ? `${active.color}12` : "rgba(255,255,255,0.04)", border: `1px solid ${chDone || chStarted ? active.color + "33" : "rgba(255,255,255,0.07)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {chDone
                        ? <CheckCircle2 size={16} color={active.color} />
                        : <span style={{ fontSize: 11, fontFamily: "'Noto Serif SC',serif", fontWeight: 700, color: chStarted ? active.color : "#2e4260" }}>第{ch.ordinal}章</span>}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: chStarted ? "#c8d8ee" : "#5a7898", marginBottom: 5 }}>
                        第{ch.ordinal}章 · {active.name}{chOrdinals[i] ? "（" + (i === 0 ? "基础理论" : i === 1 ? "核心考点" : i === 2 ? "重难点解析" : i === 3 ? "综合进阶" : "真题精析") + "）" : ""}
                      </div>
                      <div style={{ height: 2, borderRadius: 1, background: "rgba(255,255,255,0.05)", maxWidth: 200 }}>
                        <div style={{ height: "100%", borderRadius: 1, width: `${chPct}%`, background: active.color, opacity: 0.7 }} />
                      </div>
                    </div>
                    {/* Meta */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: chStarted ? active.color : "#2e4260", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{ch.done}/{ch.cnt}</div>
                      <div style={{ fontSize: 10, color: "#1e3050", marginTop: 2 }}>讲</div>
                    </div>
                    <ChevronRight size={14} color="#1e3050" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* CTA button */}
          <button
            onClick={() => setPage(targetPage)}
            style={{ width: "100%", padding: "16px", borderRadius: 14, fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer", background: active.done > 0 ? `linear-gradient(90deg,${active.color}cc,${active.color})` : "rgba(255,255,255,0.06)", color: active.done > 0 ? "#090e1a" : "#3a5570", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "opacity 0.15s" }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = "1"}>
            {isAudio
              ? <Volume2 size={16} color={active.done > 0 ? "#090e1a" : "#3a5570"} />
              : <Play size={15} fill={active.done > 0 ? "#090e1a" : "#3a5570"} color={active.done > 0 ? "#090e1a" : "#3a5570"} />}
            {active.done > 0
              ? (activePct === 100 ? `${active.name} 已全部完成` : `继续学习 · ${active.name}（第 ${active.done + 1} 讲）`)
              : `开始学习 · ${active.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ AUDIO PLAYER PAGE ══════════════════════ */

const audioChapters = [
  {
    id: 1, title: "第一章 · 民法总则", expanded: true,
    lessons: [
      { id: 1,  title: "民事法律关系概述",       duration: "18:42", done: true,  current: false },
      { id: 2,  title: "自然人的民事权利能力",   duration: "22:15", done: true,  current: false },
      { id: 3,  title: "法人制度精要",           duration: "20:08", done: true,  current: false },
      { id: 4,  title: "民事法律行为与代理",     duration: "24:33", done: true,  current: true  },
      { id: 5,  title: "诉讼时效制度",           duration: "19:50", done: false, current: false },
    ],
  },
  {
    id: 2, title: "第二章 · 合同法精讲", expanded: false,
    lessons: [
      { id: 6,  title: "合同的成立与效力",       duration: "23:10", done: false, current: false },
      { id: 7,  title: "合同的履行与违约",       duration: "21:40", done: false, current: false },
      { id: 8,  title: "合同解除与损害赔偿",     duration: "20:55", done: false, current: false },
    ],
  },
  {
    id: 3, title: "第三章 · 物权法要点", expanded: false,
    lessons: [
      { id: 9,  title: "物权基本理论",           duration: "17:30", done: false, current: false },
      { id: 10, title: "所有权与共有",           duration: "19:20", done: false, current: false },
      { id: 11, title: "担保物权精讲",           duration: "25:00", done: false, current: false },
    ],
  },
];

const audioTranscripts: Record<number, { paragraphs: { time: string; text: string }[] }> = {
  4: {
    paragraphs: [
      { time: "00:00", text: "同学们好，本节课我们来讲民事法律行为与代理制度，这是民法总则中考频极高的两个知识点，历年法考几乎每年必考，请大家务必认真掌握。" },
      { time: "01:15", text: '首先我们来看民事法律行为的概念。民事法律行为，是指民事主体通过意思表示设立、变更、终止民事法律关系的行为。注意这里的核心是"意思表示"——行为人必须有将内心意思向外部表达的过程，才构成法律行为。' },
      { time: "03:40", text: "民事法律行为的成立需要满足三个要素：第一，有行为人；第二，行为人具有相应的民事行为能力；第三，意思表示真实。这三个要素缺一不可。实践中，意思表示不真实导致的合同效力问题，是历年考题的高发区。" },
      { time: "06:20", text: "民事法律行为的效力状态分为四种：有效、无效、可撤销和效力待定。我们逐一分析。有效的民事法律行为是完全合法的，对双方均有约束力。无效的民事法律行为自始没有法律约束力，例如以虚假意思表示实施的行为，或者违反法律行政法规强制性规定的行为。" },
      { time: "09:55", text: "可撤销的民事法律行为，是指行为人有权请求人民法院或者仲裁机构予以撤销的行为。根据《民法典》第一百四十七条至第一百五十条的规定，重大误解、欺诈、胁迫以及显失公平，均可作为撤销的事由。注意撤销权的行使有除斥期间的限制，一般为知道或者应当知道之日起一年内。" },
      { time: "13:10", text: "效力待定的民事法律行为，是指行为效力尚未确定，有待特定当事人追认的行为。典型情形包括：限制民事行为能力人实施的与其年龄、智力、健康状况不相符的行为；无权代理人以被代理人名义实施的行为；以及无处分权人处分他人财产的行为。" },
      { time: "17:00", text: '接下来我们讲代理制度。代理，是指代理人在代理权限内，以被代理人名义实施民事法律行为，由此产生的法律后果直接归属于被代理人的制度。理解代理的关键在于"以被代理人名义"和"法律后果归属于被代理人"这两点。' },
      { time: "19:30", text: "代理分为委托代理和法定代理。委托代理基于被代理人的授权委托，授权委托书应当载明代理人的姓名或者名称、代理事项、权限和期限，并由被代理人签名或者盖章。法定代理则基于法律的直接规定，通常适用于无民事行为能力人和限制民事行为能力人。" },
      { time: "22:15", text: "无权代理与表见代理是本节的重点难点。无权代理是指行为人没有代理权、超越代理权或者代理权已终止后以被代理人名义实施的代理行为。无权代理行为的法律后果，原则上由被代理人决定是否追认。若不追认，则由行为人自行承担责任。" },
      { time: "24:33", text: "表见代理是指虽无代理权，但相对人有理由相信行为人有代理权，并基于此信赖与其交易，法律对该代理行为予以承认，由此产生的法律效果直接归属于被代理人的制度。表见代理的构成要件：一是行为人无代理权；二是客观上存在使相对人相信其有代理权的外观事实；三是相对人善意且无过失。" },
    ],
  },
  1: {
    paragraphs: [
      { time: "00:00", text: "同学们好，本节课我们来学习民事法律关系概述。民事法律关系是民法调整的社会关系，是民法学理论体系的基石，理解这一概念对于整个民法学习至关重要。" },
      { time: "02:00", text: "民事法律关系由三个要素构成：主体、客体和内容。主体是指参与民事法律关系、享有权利和承担义务的人，包括自然人、法人和非法人组织。客体是指民事权利和义务所指向的对象，包括物、行为、智力成果和人身利益等。内容则是指民事权利和民事义务。" },
      { time: "05:30", text: "民事法律关系的发生、变更和消灭，需要一定的法律事实作为依据。法律事实分为行为和事件两大类。行为是指民事主体有意识的活动，包括合法行为和违法行为；事件则是指与当事人意志无关的，能够引起法律后果的客观现象，如出生、死亡、时间经过等。" },
    ],
  },
};

function AudioPlayerPage({ setPage, course, notify }: { setPage: (p: string) => void; course: AppCourse; notify: Notify }) {
  const c = course;
  const isLegacyCourse = c.source === "legacy";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedProgressRef = useRef(-1);
  const buildInitialAudioChapters = () =>
    makeCourseShellDetail(c, "正在读取课程目录", "课程目录同步中", "正在读取课程目录，请稍候。").chapters;
  const [chapters, setChapters] = useState<ChapterModel[]>(() => buildInitialAudioChapters());
  const [currentLesson, setCurrentLesson] = useState<LessonModel>(() => getCurrentLesson(chapters)!);
  const currentAudioLessonRef = useRef<LessonModel | null>(currentLesson);
  const pendingAudioAutoplayRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(() => calcLessonPercent(getCurrentLesson(chapters)));
  const [volume, setVolume] = useState(80);
  const [speed, setSpeed] = useState("1.0");
  const [audioRepeatMode, setAudioRepeatMode] = useState<AudioRepeatMode>("none");
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showMobileLessonPicker, setShowMobileLessonPicker] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [syncingProgress, setSyncingProgress] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [courseHandout, setCourseHandout] = useState<{ url?: string; name?: string; hasHandout?: boolean }>({});
  const transcriptText = currentLesson.script?.trim();
  const transcript = transcriptText
    ? { paragraphs: transcriptText.split(/\n{2,}|\r?\n/).filter(Boolean).map((text, index) => ({ time: index === 0 ? "00:00" : "", text })) }
    : { paragraphs: [] as { time: string; text: string }[] };
  const hasLessonHandout = Boolean(currentLesson.source === "legacy" && currentLesson.id !== "__empty__" && (currentLesson.handoutUrl || currentLesson.hasHandout));
  const hasCourseHandout = Boolean(courseHandout.url || courseHandout.hasHandout);

  const currentDurationSec = currentLesson.durationSeconds || parseDurationToSeconds(currentLesson.duration) || (24 * 60 + 33);
  const elapsed = Math.round((progress / 100) * currentDurationSec);
  const fmt = formatDuration;
  const audioRepeatModeMeta = {
    none: { label: "顺序播放", shortLabel: "顺序", title: "顺序播放：播完最后一讲后停止" },
    list: { label: "列表循环", shortLabel: "列表", title: "列表循环：播完最后一讲后回到第一讲" },
    single: { label: "单曲循环", shortLabel: "单曲", title: "单曲循环：当前音频播放结束后重新播放" },
  }[audioRepeatMode];
  const toggleAudioRepeatMode = () => {
    setAudioRepeatMode(current => current === "none" ? "list" : current === "list" ? "single" : "none");
  };

  useEffect(() => {
    currentAudioLessonRef.current = currentLesson;
  }, [currentLesson]);

  const updateLessonProgress = (lessonId: string, progressSeconds: number, completed = false) => {
    const normalizedSeconds = Math.max(0, Math.floor(progressSeconds));
    const playbackSeconds = completed ? 0 : normalizedSeconds;
    const activeLesson = currentAudioLessonRef.current;

    if (activeLesson?.id === lessonId) {
      const duration = activeLesson.durationSeconds || parseDurationToSeconds(activeLesson.duration) || currentDurationSec;
      const nextProgress = completed ? 0 : Math.max(0, Math.min(100, duration > 0 ? Math.round((playbackSeconds / duration) * 100) : 0));
      setProgress(nextProgress);
      setCurrentLesson(prev => ({
        ...prev,
        progressSeconds: playbackSeconds,
        savedProgressSeconds: Math.max(normalizedSeconds, prev.savedProgressSeconds ?? 0),
        done: completed ? true : prev.done,
      }));
    }
    setChapters(prev => updateLessonProgressInChapters(prev, lessonId, normalizedSeconds, completed));
  };

  useEffect(() => {
    let active = true;
    setLoadingDetail(true);
    setDetailError("");

    const shell = makeCourseShellDetail(c, "正在读取课程目录", "课程目录同步中", "正在读取课程目录，请稍候。");
    setChapters(shell.chapters);
    setCurrentLesson(getCurrentLesson(shell.chapters)!);
    setProgress(0);
    setIsPlaying(false);
    setCourseHandout({});

    courseService.getCourseDetail(c.id)
      .then((payload) => {
        if (!active || payload.course.courseType !== "audio") return;
        setCourseHandout({
          url: payload.course.handoutUrl,
          name: payload.course.handoutName,
          hasHandout: Boolean(payload.course.hasHandout || payload.course.handoutUrl || payload.course.handoutObjectKey),
        });
        const mapped = mapLegacyCourseDetail(payload, c);
        setChapters(mapped.chapters);
        const nextLesson = getCurrentLesson(mapped.chapters);
        if (nextLesson) {
          setCurrentLesson(nextLesson);
          setProgress(calcLessonPercent(nextLesson));
          if (nextLesson.source === "legacy") {
            courseService.getAudioDetail(c.id, nextLesson.id)
              .then((detailPayload) => {
                if (!active) return;
                const enriched: Partial<LessonModel> = {
                  script: detailPayload.audio.script,
                  handoutUrl: detailPayload.audio.handoutUrl,
                  handoutName: detailPayload.audio.handoutName,
                  hasHandout: Boolean(detailPayload.audio.hasHandout || detailPayload.audio.handoutUrl || detailPayload.audio.handoutObjectKey),
                  mediaUrl: detailPayload.audio.audioUrl,
                };
                setCurrentLesson(prev => prev.id === nextLesson.id ? { ...prev, ...enriched } : prev);
                setChapters(prev => patchLessonInChapters(prev, nextLesson.id, enriched));
              })
              .catch((err) => {
                if (!active) return;
                notify(err instanceof Error ? `音频详情加载失败：${err.message}` : "音频详情加载失败", "warning");
              });
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "课程目录同步失败";
        setDetailError(message);
        const shell = makeCourseShellDetail(c, "课程目录暂不可用", "课程目录同步失败", "课程目录暂时无法读取，请稍后重试或联系教务老师。");
        setChapters(shell.chapters);
        setCurrentLesson(getCurrentLesson(shell.chapters)!);
        setProgress(0);
        setIsPlaying(false);
        notify(`课程目录同步失败：${message}`, "warning");
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [c.id, isLegacyCourse]);

  const toggleChapter = (id: string) =>
    setChapters(prev => prev.map(ch => ch.id === id ? { ...ch, expanded: !ch.expanded } : ch));

  const selectLesson = (lesson: typeof currentLesson, options: { autoplay?: boolean; resetPlayback?: boolean } = {}) => {
    if (lesson.id === "__empty__") {
      notify(detailError || "当前课程暂未配置可学习内容", "warning");
      return;
    }

    lastSavedProgressRef.current = -1;
    const shouldResetPlayback = options.resetPlayback ?? lesson.done;
    const nextLesson = shouldResetPlayback ? { ...lesson, progressSeconds: 0 } : lesson;
    pendingAudioAutoplayRef.current = Boolean(options.autoplay && !lesson.mediaUrl);
    setCurrentLesson(nextLesson);
    setChapters(prev => markCurrentLesson(prev, lesson.id));
    setProgress(calcLessonPercent(nextLesson));
    setIsPlaying(Boolean(lesson.mediaUrl));
    setShowMobileLessonPicker(false);

    if (isLegacyCourse && lesson.source === "legacy") {
      courseService.getAudioDetail(c.id, lesson.id)
        .then((payload) => {
        const enriched: Partial<LessonModel> = {
          script: payload.audio.script,
          handoutUrl: payload.audio.handoutUrl,
          handoutName: payload.audio.handoutName,
          hasHandout: Boolean(payload.audio.hasHandout || payload.audio.handoutUrl || payload.audio.handoutObjectKey),
          mediaUrl: payload.audio.audioUrl,
        };
          setCurrentLesson(prev => prev.id === lesson.id ? { ...prev, ...enriched } : prev);
          setChapters(prev => patchLessonInChapters(prev, lesson.id, enriched));
          const shouldAutoplay = pendingAudioAutoplayRef.current;
          pendingAudioAutoplayRef.current = false;
          if (shouldAutoplay && payload.audio.audioUrl) {
            setIsPlaying(true);
          }
        })
        .catch(() => {
          pendingAudioAutoplayRef.current = false;
          notify("音频详情加载失败，请稍后重试", "warning");
        });
    }
  };

  const saveCurrentProgress = (nextProgress: number, complete = false) => {
    if (!isLegacyCourse || !currentLesson.id || currentLesson.source === "static" || !currentLesson.mediaUrl || currentLesson.id === "__empty__") return;
    const lessonId = currentLesson.id;
    const progressSeconds = Math.round((nextProgress / 100) * currentDurationSec);
    setSyncingProgress(true);
    const request = complete
      ? courseService.markAudioCompleted(c.id, lessonId, progressSeconds)
      : courseService.saveAudioProgress(c.id, lessonId, progressSeconds);

    request
      .then((record) => {
        updateLessonProgress(lessonId, record.progress, Boolean(record.completed));
      })
      .catch(() => {
        // Progress saving should not block listening.
      })
      .finally(() => setSyncingProgress(false));
  };

  const saveAudioSeconds = (seconds: number, complete = false, force = false) => {
    if (!isLegacyCourse || !currentLesson.id || currentLesson.source === "static" || !currentLesson.mediaUrl || currentLesson.id === "__empty__") return;
    const lessonId = currentLesson.id;
    const progressSeconds = Math.max(0, Math.floor(seconds));
    if (!complete && currentLesson.done) return;
    if (!complete && !force && Math.abs(progressSeconds - lastSavedProgressRef.current) < 10) return;

    lastSavedProgressRef.current = progressSeconds;
    setSyncingProgress(true);
    const request = complete
      ? courseService.markAudioCompleted(c.id, lessonId, progressSeconds)
      : courseService.saveAudioProgress(c.id, lessonId, progressSeconds);

    request
      .then((record) => {
        updateLessonProgress(lessonId, record.progress, Boolean(record.completed));
      })
      .catch(() => {
        // Progress saving should not block listening.
      })
      .finally(() => setSyncingProgress(false));
  };

  const moveAudioLesson = (direction: LessonDirection) => {
    const adjacent = findAdjacentLesson(chapters, currentLesson.id, direction) || (audioRepeatMode === "list" ? findLoopLesson(chapters, currentLesson.id, direction) : null);
    if (!adjacent || adjacent.id === "__empty__") {
      notify(direction === "next" ? "已经是最后一讲" : "已经是第一讲", "info");
      return;
    }

    if (audioRef.current && currentLesson.mediaUrl) {
      saveAudioSeconds(audioRef.current.currentTime, false, true);
    }
    setIsPlaying(false);
    selectLesson(adjacent);
  };

  const handleAudioEnded = (event: SyntheticEvent<HTMLAudioElement>) => {
    const endedAudio = event.currentTarget;
    const duration = endedAudio.duration || currentDurationSec;

    saveAudioSeconds(duration, true, true);

    if (audioRepeatMode === "single") {
      endedAudio.currentTime = 0;
      setProgress(0);
      setCurrentLesson(prev => ({ ...prev, progressSeconds: 0, done: true }));
      setIsPlaying(true);
      void endedAudio.play().catch(() => setIsPlaying(false));
      return;
    }

    const nextLesson = findAdjacentLesson(chapters, currentLesson.id, "next");
    const adjacent = nextLesson || (audioRepeatMode === "list" ? findLoopLesson(chapters, currentLesson.id, "next") : null);

    if (adjacent && adjacent.id !== "__empty__") {
      if (adjacent.id === currentLesson.id) {
        endedAudio.currentTime = 0;
        setProgress(0);
        setCurrentLesson(prev => ({ ...prev, progressSeconds: 0, done: true }));
        setIsPlaying(true);
        void endedAudio.play().catch(() => setIsPlaying(false));
        return;
      }
      selectLesson(adjacent, { autoplay: true, resetPlayback: adjacent.done || !nextLesson });
      return;
    }

    endedAudio.currentTime = 0;
    setProgress(0);
    setCurrentLesson(prev => ({ ...prev, progressSeconds: 0, done: true }));
    setIsPlaying(false);
  };

  const toggleAudioPlayback = () => {
    if (currentLesson.mediaUrl) {
      setIsPlaying(p => !p);
      return;
    }

    setIsPlaying(false);
    notify(currentLesson.id === "__empty__" ? "当前课程暂无可播放课时" : "当前音频暂未配置媒体", "warning");
  };

  const downloadCurrentHandout = () => {
    if (!isLegacyCourse) {
      notify("当前课程暂无讲义下载", "info");
      return;
    }

    if (!hasLessonHandout) {
      notify("当前音频暂未配置课时讲义", "warning");
      return;
    }

    const fallbackUrl = currentLesson.handoutUrl;
    const fallbackName = currentLesson.handoutName || `${currentLesson.title}-讲义`;
    setSyncingProgress(true);
    courseService.downloadAudioHandout(c.id, currentLesson.id)
      .then((blob) => {
        triggerBlobDownload(blob, fallbackName);
        notify("讲义下载已开始", "success");
      })
      .catch((err) => {
        if (fallbackUrl) {
          window.open(fallbackUrl, "_blank", "noopener,noreferrer");
          notify("讲义下载暂时失败，已为你尝试备用方式打开", "warning");
          return;
        }
        notify(err instanceof Error ? `讲义下载失败：${err.message}` : "讲义下载失败", "warning");
      })
      .finally(() => setSyncingProgress(false));
  };

  const downloadCourseLevelHandout = () => {
    if (!isLegacyCourse || !hasCourseHandout) {
      notify("当前课程暂未配置课程讲义", "warning");
      return;
    }

    const fallbackUrl = courseHandout.url;
    const fallbackName = courseHandout.name || `${c.title}-讲义`;
    setSyncingProgress(true);
    courseService.downloadCourseHandout(c.id)
      .then((blob) => {
        triggerBlobDownload(blob, fallbackName);
        notify("讲义下载已开始", "success");
      })
      .catch((err) => {
        if (fallbackUrl) {
          window.open(fallbackUrl, "_blank", "noopener,noreferrer");
          notify("讲义下载暂时失败，已为你尝试备用方式打开", "warning");
          return;
        }
        notify(err instanceof Error ? `讲义下载失败：${err.message}` : "讲义下载失败", "warning");
      })
      .finally(() => setSyncingProgress(false));
  };

  const speeds = ["0.75", "1.0", "1.25", "1.5", "2.0"];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = Math.max(0, Math.min(1, volume / 100));
    audio.playbackRate = Number(speed) || 1;
  }, [speed, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying && currentLesson.mediaUrl) {
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, currentLesson.mediaUrl]);


  return (
    <div className="debao-audio-page debao-themed-page" style={{ minHeight: "100vh", background: "#090e1a", display: "flex", flexDirection: "column" }}>
      {currentLesson.mediaUrl && (
        <audio
          ref={audioRef}
          src={currentLesson.mediaUrl}
          preload="metadata"
          onLoadedMetadata={event => {
            const target = event.currentTarget;
            if (currentLesson.progressSeconds > 0 && Number.isFinite(target.duration)) {
              target.currentTime = Math.min(currentLesson.progressSeconds, Math.max(target.duration - 1, 0));
            }
          }}
          onTimeUpdate={event => {
            const target = event.currentTarget;
            const duration = Number.isFinite(target.duration) && target.duration > 0 ? target.duration : currentDurationSec;
            const seconds = Math.floor(target.currentTime);
            const nextProgress = Math.max(0, Math.min(100, Math.round((seconds / duration) * 100)));
            setProgress(nextProgress);
            setCurrentLesson(prev => ({ ...prev, progressSeconds: seconds }));
            if (seconds > 0 && seconds % 15 === 0) saveAudioSeconds(seconds);
          }}
          onPause={event => saveAudioSeconds(event.currentTarget.currentTime)}
          onEnded={handleAudioEnded}
        />
      )}

      {/* ── Breadcrumb ── */}
      <div className="debao-audio-breadcrumb" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div className="debao-audio-breadcrumb-inner" style={{ maxWidth: 1340, margin: "0 auto", padding: "10px 36px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3a5570" }}>
          <span style={{ cursor: "pointer", color: "#4e8ef7" }} onClick={() => setPage("courses")}>课程中心</span>
          <ChevronRight size={12} />
          <span style={{ color: "#5a7898" }}>{currentLesson.title}</span>
        </div>
      </div>

      {/* ── Main body: sidebar + content ── */}
      <div className="debao-audio-layout" style={{ flex: 1, display: "flex", maxWidth: 1340, margin: "0 auto", width: "100%", padding: "0 36px", gap: 0, alignItems: "flex-start" }}>

        {/* ─ Left sidebar: chapter list (sticky) ─ */}
        <div className="debao-audio-sidebar" style={{ width: 280, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.05)", paddingTop: 20, paddingRight: 20, paddingBottom: 120, position: "sticky", top: 0, height: "calc(100vh - 96px)", overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#2e4260", letterSpacing: "0.06em", marginBottom: 14 }}>课程目录</div>
          {loadingDetail && <div style={{ fontSize: 12, color: "#3a5570", marginBottom: 10 }}>正在同步课程音频...</div>}
          {detailError && <div style={{ fontSize: 12, color: "#f76e6e", lineHeight: 1.6, marginBottom: 10 }}>{detailError}</div>}
          {chapters.map(ch => (
            <div key={ch.id} style={{ marginBottom: 4 }}>
              <button onClick={() => toggleChapter(ch.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 10px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "none", cursor: "pointer", marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#5a7898", textAlign: "left" }}>{ch.title}</span>
                <ChevronDown size={13} color="#2e4260" style={{ transform: ch.expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {ch.expanded && (
                <div style={{ paddingLeft: 8 }}>
                  {ch.lessons.map(l => {
                    const isActive = l.id === currentLesson.id;
                    return (
                      <button key={l.id} onClick={() => selectLesson(l)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: isActive ? `${c.color}18` : "transparent", marginBottom: 1, textAlign: "left" }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: isActive ? c.color : l.done ? "rgba(29,201,164,0.2)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isActive
                            ? <Volume2 size={11} color="#fff" />
                            : l.done
                            ? <CheckCircle2 size={11} color="#1dc9a4" />
                            : <Circle size={11} color="#2e4260" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: isActive ? c.color : l.done ? "#8fa3be" : "#3a5570", fontWeight: isActive ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</div>
                          <div style={{ fontSize: 10, color: "#1e3050", fontFamily: "'JetBrains Mono',monospace", marginTop: 1 }}>{l.duration}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ─ Main content: now-playing card + transcript ─ */}
        <div className="debao-audio-main" style={{ flex: 1, paddingTop: 24, paddingLeft: 28, paddingBottom: 120, display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="debao-audio-mobile-picker" style={{ display: "none" }}>
            <button
              type="button"
              className="debao-audio-mobile-picker-trigger"
              onClick={() => setShowMobileLessonPicker((open) => !open)}
            >
              <div>
                <span>当前音频</span>
                <strong>{currentLesson.title}</strong>
              </div>
              <ChevronDown size={16} style={{ transform: showMobileLessonPicker ? "rotate(180deg)" : "none" }} />
            </button>

            {showMobileLessonPicker ? (
              <div className="debao-audio-mobile-picker-menu">
                {loadingDetail ? <div className="debao-audio-mobile-picker-status">正在同步课程音频...</div> : null}
                {detailError ? <div className="debao-audio-mobile-picker-error">{detailError}</div> : null}
                {chapters.map((ch) => (
                  <div key={ch.id} className="debao-audio-mobile-picker-chapter">
                    <button type="button" onClick={() => toggleChapter(ch.id)} className="debao-audio-mobile-picker-chapter-button">
                      <span>{ch.title}</span>
                      <ChevronDown size={14} style={{ transform: ch.expanded ? "rotate(180deg)" : "none" }} />
                    </button>
                    {ch.expanded ? (
                      <div className="debao-audio-mobile-picker-lessons">
                        {ch.lessons.map((lesson) => {
                          const isActive = lesson.id === currentLesson.id;
                          return (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() => selectLesson(lesson)}
                              className={`debao-audio-mobile-picker-lesson ${isActive ? "is-active" : ""}`}
                            >
                              <span className="debao-audio-mobile-picker-lesson-icon">
                                {isActive ? <Volume2 size={11} /> : lesson.done ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                              </span>
                              <span className="debao-audio-mobile-picker-lesson-main">
                                <span>{lesson.title}</span>
                                <em>{lesson.duration}</em>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Now-playing visual */}
          <div className="debao-audio-now-card" style={{ borderRadius: 16, background: `linear-gradient(135deg,${c.color}18,${c.color}06)`, border: `1px solid ${c.color}20`, padding: "14px 20px", display: "flex", gap: 16, alignItems: "center" }}>
            {/* Album art */}
            <div className="debao-audio-cover" style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: `linear-gradient(145deg,${c.color}60,${c.color}25)`, border: `1px solid ${c.color}35`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 20, fontWeight: 900, color: c.color }}>{currentLesson.title.slice(0, 1)}</div>
              {isPlaying && (
                <div style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2, alignItems: "flex-end", height: 10 }}>
                  {[1, 0.5, 0.8, 0.3, 0.9].map((h, i) => (
                    <div key={i} style={{ width: 2, height: `${h * 100}%`, background: c.color, borderRadius: 1 }} />
                  ))}
                </div>
              )}
            </div>
            {/* Meta */}
            <div className="debao-audio-meta" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: `${c.color}99`, fontWeight: 600, marginBottom: 2, letterSpacing: "0.04em" }}>{c.title} · 得恩法考音频</div>
              <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 15, fontWeight: 700, color: "#dde4f0", marginBottom: 1 }}>{currentLesson.title}</div>
              <div style={{ fontSize: 11, color: "#3a5570" }}>主讲：{c.teacher} · 时长 {currentLesson.duration} · {currentLesson.mediaUrl ? "媒体已连接" : "等待媒体地址"}</div>
            </div>
            {/* Waveform */}
            <div className="debao-audio-waveform" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 1.5, height: 24 }}>
                {Array.from({ length: 80 }, (_, i) => {
                  const filled = (i / 80) * 100 <= progress;
                  const h = 4 + Math.abs(Math.sin(i * 0.7 + 1.2) * 12) + Math.abs(Math.cos(i * 0.4) * 6);
                  return <div key={i} style={{ width: 2, borderRadius: 1, height: `${h}px`, background: filled ? c.color : "rgba(255,255,255,0.07)", flexShrink: 0 }} />;
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>
                <span style={{ color: c.color }}>{fmt(elapsed)}</span>
                <span style={{ color: "#2e4260" }}>{currentLesson.duration}</span>
              </div>
            </div>
          </div>

          {/* Transcript */}
          <div className="debao-audio-transcript" style={{ background: "#0f1826", borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)", padding: "24px 28px", height: 340, overflowY: "auto", boxSizing: "border-box" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {transcript.paragraphs.length > 0 ? transcript.paragraphs.map((p, i) => (
                <p key={i} style={{ margin: 0, fontSize: 14, lineHeight: 2, color: "#8fa3be" }}>{p.text}</p>
              )) : (
                <div style={{ fontSize: 13, color: "#3a5570", lineHeight: 1.8 }}>当前音频暂未配置文稿。</div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Bottom player bar (sticky) ── */}
      <div className="debao-audio-player-bar" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(7,12,24,0.97)", backdropFilter: "blur(24px)", borderTop: "1px solid rgba(255,255,255,0.07)", zIndex: 40, padding: "0 36px" }}>
        <div className="debao-audio-player-inner" style={{ maxWidth: 1340, margin: "0 auto", height: 72, display: "flex", alignItems: "center", gap: 24 }}>

          {/* Track info */}
          <div className="debao-audio-track-info" style={{ display: "flex", alignItems: "center", gap: 12, width: 240, flexShrink: 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(145deg,${c.color}50,${c.color}25)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Serif SC',serif", fontWeight: 700, color: c.color, fontSize: 16 }}>
              {currentLesson.title.slice(0, 1)}
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#c8d8ee", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentLesson.title}</div>
              <div style={{ fontSize: 10, color: "#2e4260" }}>{currentLesson.mediaUrl ? "得恩法考媒体" : c.teacher}</div>
            </div>
          </div>

          {/* Controls */}
          <div className="debao-audio-controls" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <button onClick={() => moveAudioLesson("prev")} aria-label="上一讲" title="上一讲"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#5a7898", display: "flex", alignItems: "center", padding: 4 }}>
                <SkipBack size={18} />
              </button>
              <button onClick={toggleAudioPlayback}
                style={{ width: 44, height: 44, borderRadius: "50%", background: currentLesson.mediaUrl ? `linear-gradient(145deg,${c.color},${c.color}cc)` : "rgba(255,255,255,0.08)", border: "none", cursor: currentLesson.mediaUrl ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: currentLesson.mediaUrl ? `0 4px 16px ${c.color}40` : "none" }}>
                {isPlaying
                  ? <div style={{ display: "flex", gap: 3 }}><div style={{ width: 3, height: 14, background: "#fff", borderRadius: 2 }} /><div style={{ width: 3, height: 14, background: "#fff", borderRadius: 2 }} /></div>
                  : <Play size={18} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />}
              </button>
              <button onClick={() => moveAudioLesson("next")} aria-label="下一讲" title="下一讲"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#5a7898", display: "flex", alignItems: "center", padding: 4 }}>
                <SkipForward size={18} />
              </button>
            </div>
            {/* Seek bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "#3a5570", width: 36, textAlign: "right", flexShrink: 0 }}>{fmt(elapsed)}</span>
              <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, cursor: "pointer", position: "relative" }}
                onClick={e => {
                  if (!currentLesson.mediaUrl) {
                    notify(currentLesson.id === "__empty__" ? "当前课程暂无可播放课时" : "当前音频暂未配置媒体", "warning");
                    return;
                  }
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const next = Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
                  const nextSeconds = Math.round((next / 100) * currentDurationSec);
                  if (audioRef.current && Number.isFinite(audioRef.current.duration)) audioRef.current.currentTime = nextSeconds;
                  setProgress(next);
                  saveAudioSeconds(nextSeconds, next >= 100);
                }}>
                <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg,${c.color}80,${c.color})`, borderRadius: 2 }} />
                <div style={{ position: "absolute", top: "50%", left: `${progress}%`, transform: "translate(-50%,-50%)", width: 10, height: 10, borderRadius: "50%", background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
              </div>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "#3a5570", width: 36, flexShrink: 0 }}>{currentLesson.duration}</span>
            </div>
          </div>

          {/* Right controls */}
          <div className="debao-audio-right-controls" style={{ display: "flex", alignItems: "center", gap: 8, width: 340, justifyContent: "flex-end", flexShrink: 0 }}>
            {syncingProgress && <span style={{ fontSize: 10, color: "#2e4260", whiteSpace: "nowrap" }}>同步中</span>}
            <button
              className={`debao-audio-repeat-button debao-audio-repeat-${audioRepeatMode}`}
              type="button"
              onClick={toggleAudioRepeatMode}
              title={audioRepeatModeMeta.title}
              aria-label={audioRepeatModeMeta.title}
              style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, background: audioRepeatMode === "none" ? "rgba(255,255,255,0.06)" : `${c.color}18`, border: `1px solid ${audioRepeatMode === "none" ? "rgba(255,255,255,0.09)" : `${c.color}45`}`, cursor: "pointer", color: audioRepeatMode === "none" ? "#8fa3be" : c.color, display: "flex", alignItems: "center", gap: 5, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              <RotateCcw size={13} />
              <span>{audioRepeatModeMeta.shortLabel}</span>
            </button>
            {hasLessonHandout && (
              <button className="debao-audio-handout-button" onClick={downloadCurrentHandout} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, background: "rgba(201,151,62,0.18)", border: "1px solid rgba(201,151,62,0.38)", cursor: "pointer", color: "#e8c46a", display: "flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                <Download size={13} /> 课时讲义
              </button>
            )}
            {hasCourseHandout && (
              <button className="debao-audio-handout-button" onClick={downloadCourseLevelHandout} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, background: "rgba(78,142,247,0.14)", border: "1px solid rgba(78,142,247,0.3)", cursor: "pointer", color: "#8ab4ff", display: "flex", alignItems: "center", gap: 5, fontWeight: 700 }}>
                <Download size={13} /> 课程讲义
              </button>
            )}
            {/* Volume */}
            <div className="debao-audio-volume" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Volume2 size={15} color="#3a5570" />
              <div style={{ width: 72, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, cursor: "pointer" }}
                onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setVolume(Math.round(((e.clientX - r.left) / r.width) * 100)); }}>
                <div style={{ height: "100%", width: `${volume}%`, background: "rgba(255,255,255,0.3)", borderRadius: 2 }} />
              </div>
            </div>
            {/* Speed */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowSpeedMenu(p => !p)}
                style={{ padding: "4px 10px", borderRadius: 7, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", cursor: "pointer", color: "#8fa3be" }}>
                {speed}×
              </button>
              {showSpeedMenu && (
                <div style={{ position: "absolute", bottom: 36, right: 0, background: "#0f1826", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 72 }}>
                  {speeds.map(sp => (
                    <button key={sp} onClick={() => { setSpeed(sp); setShowSpeedMenu(false); }}
                      style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", border: "none", cursor: "pointer", background: speed === sp ? `${c.color}20` : "transparent", color: speed === sp ? c.color : "#5a7898", fontWeight: speed === sp ? 700 : 400 }}>
                      {sp}×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ══════════════════════ COURSE DETAIL PAGE ══════════════════════ */

type ActiveVideoDanmaku = VideoDanmaku & {
  renderId: string;
  lane: number;
};

const VIDEO_DANMAKU_COLORS = ["#ffffff", "#ffd166", "#7dd3fc", "#86efac", "#fca5a5", "#c4b5fd"];

function CourseDetailPage({ setPage, setActiveNav, course, notify }: { setPage: (p: string) => void; setActiveNav: (i: number) => void; course: AppCourse; notify: Notify }) {
  const appCourse = course;
  const isLegacyCourse = appCourse.source === "legacy";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoPlayerRef = useRef<HTMLDivElement | null>(null);
  const lastSavedVideoProgressRef = useRef(-1);
  const pendingVideoResumeRef = useRef<{ lessonId: string; seconds: number; applied: boolean } | null>(null);
  const videoDanmakusRef = useRef<VideoDanmaku[]>([]);
  const shownDanmakuIdsRef = useRef<Set<string>>(new Set());
  const initialDetail = makeCourseShellDetail(appCourse, "正在读取课程目录", "课程目录同步中", "正在读取课程目录，请稍候。");
  const [detail, setDetail] = useState<ResolvedCourseDetail>(() => initialDetail);
  const [activeTab, setActiveTab] = useState<"intro" | "materials" | "notes">("intro");
  const [expandedChapters, setExpandedChapters] = useState<string[]>(["1", "2"]);
  const [currentLesson, setCurrentLesson] = useState<LessonModel>(() => getCurrentLesson(initialDetail.chapters)!);
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoVolume, setVideoVolume] = useState(80);
  const [videoSpeed, setVideoSpeed] = useState("1.0");
  const [showVideoSpeedMenu, setShowVideoSpeedMenu] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingVideoProgress, setSavingVideoProgress] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [showMobileVideoLessonPicker, setShowMobileVideoLessonPicker] = useState(false);
  const [videoDanmakus, setVideoDanmakus] = useState<VideoDanmaku[]>([]);
  const [activeVideoDanmakus, setActiveVideoDanmakus] = useState<ActiveVideoDanmaku[]>([]);
  const [danmakuInput, setDanmakuInput] = useState("");
  const [danmakuColor, setDanmakuColor] = useState(VIDEO_DANMAKU_COLORS[0]);
  const [danmakuEnabled, setDanmakuEnabled] = useState(true);
  const [danmakuLoading, setDanmakuLoading] = useState(false);
  const [danmakuSubmitting, setDanmakuSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const initial = makeCourseShellDetail(appCourse, "正在读取课程目录", "课程目录同步中", "正在读取课程目录，请稍候。");
    setDetail(initial);
    setExpandedChapters(initial.chapters.filter(chapter => chapter.expanded).map(chapter => chapter.id));
    setCurrentLesson(getCurrentLesson(initial.chapters)!);
    pendingVideoResumeRef.current = null;
    setDetailError("");
    setVideoError("");
    setVideoReady(false);
    setIsPlaying(false);
    setVideoDanmakus([]);
    setActiveVideoDanmakus([]);
    setDanmakuInput("");
    shownDanmakuIdsRef.current = new Set();
    setLoadingDetail(true);

    courseService.getCourseDetail(appCourse.id)
      .then((payload) => {
        if (!active) return;
        const mapped = mapLegacyCourseDetail(payload, appCourse);
        setDetail(mapped);
        setExpandedChapters(mapped.chapters.filter(chapter => chapter.expanded).map(chapter => chapter.id));
        const nextLesson = getCurrentLesson(mapped.chapters)!;
        setCurrentLesson(nextLesson);
        prepareVideoResume(nextLesson);
        if (nextLesson?.source === "legacy") {
          courseService.getVideoDetail(appCourse.id, nextLesson.id)
            .then((detailPayload) => {
              if (!active) return;
              const enriched: Partial<LessonModel> = {
                script: detailPayload.video.script,
                handoutUrl: detailPayload.video.handoutUrl,
                handoutName: detailPayload.video.handoutName,
                mediaUrl: detailPayload.video.playbackUrl || detailPayload.video.videoUrl,
              };
              setCurrentLesson(prev => prev.id === nextLesson.id ? { ...prev, ...enriched } : prev);
              setDetail(prev => ({ ...prev, chapters: patchLessonInChapters(prev.chapters, nextLesson.id, enriched) }));
              prepareVideoResume({ ...nextLesson, ...enriched });
            })
            .catch((err) => {
              if (!active) return;
              notify(err instanceof Error ? `视频详情加载失败：${err.message}` : "视频详情加载失败", "warning");
            });
        }
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "课程目录同步失败";
        setDetailError(message);
        const shell = makeCourseShellDetail(appCourse, "课程目录暂不可用", "课程目录同步失败", "课程目录暂时无法读取，请稍后重试或联系教务老师。");
        setDetail(shell);
        setExpandedChapters(shell.chapters.map(chapter => chapter.id));
        setCurrentLesson(getCurrentLesson(shell.chapters)!);
        pendingVideoResumeRef.current = null;
        setIsPlaying(false);
        notify(`课程目录同步失败：${message}`, "warning");
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [appCourse.id, isLegacyCourse]);

  useEffect(() => {
    videoDanmakusRef.current = videoDanmakus;
  }, [videoDanmakus]);

  useEffect(() => {
    shownDanmakuIdsRef.current = new Set();
    setActiveVideoDanmakus([]);

    if (!isLegacyCourse || currentLesson.source !== "legacy" || currentLesson.id === "__empty__") {
      setVideoDanmakus([]);
      return;
    }

    let active = true;
    setDanmakuLoading(true);
    courseService.getVideoDanmakus(appCourse.id, currentLesson.id)
      .then((items) => {
        if (!active) return;
        const sorted = [...items].sort((left, right) => left.timeSeconds - right.timeSeconds);
        setVideoDanmakus(sorted);
        const currentSeconds = Math.max(0, Math.floor(videoRef.current?.currentTime ?? currentLesson.progressSeconds ?? 0));
        shownDanmakuIdsRef.current = new Set(sorted.filter((item) => item.timeSeconds < currentSeconds - 1).map((item) => item.id));
      })
      .catch((err) => {
        if (!active) return;
        setVideoDanmakus([]);
        notify(err instanceof Error ? `弹幕加载失败：${err.message}` : "弹幕加载失败", "warning");
      })
      .finally(() => {
        if (active) setDanmakuLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appCourse.id, currentLesson.id, currentLesson.source, isLegacyCourse]);

  const c = detail;
  const courseLearningProgress = calcCourseLearningProgress(c.chapters);
  const totalDone = courseLearningProgress.completedLessons;
  const totalLessons = courseLearningProgress.totalLessons;
  const progressPct = courseLearningProgress.percent;
  const lessonProgressPct = calcLessonPercent(currentLesson);
  const videoSpeeds = ["0.75", "1.0", "1.25", "1.5", "2.0"];
  const videoVolumePct = Math.max(0, Math.min(100, videoVolume));
  const getVideoResumeSeconds = (lesson: LessonModel) => {
    const savedSeconds = Math.max(0, Number(lesson.lastPositionSeconds ?? lesson.progressSeconds ?? lesson.savedProgressSeconds ?? 0));
    const durationSeconds = Math.max(0, Number(lesson.durationSeconds || parseDurationToSeconds(lesson.duration)));
    if (savedSeconds <= 0) return 0;
    if (durationSeconds > 0 && savedSeconds >= durationSeconds - 2) return 0;
    return savedSeconds;
  };
  const prepareVideoResume = (lesson: LessonModel) => {
    const seconds = getVideoResumeSeconds(lesson);
    pendingVideoResumeRef.current = seconds > 0 ? { lessonId: lesson.id, seconds, applied: false } : null;
  };
  const applyPendingVideoResume = (video: HTMLVideoElement) => {
    const pending = pendingVideoResumeRef.current;
    if (!pending || pending.applied || pending.lessonId !== currentLesson.id || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.min(pending.seconds, Math.max(video.duration - 1, 0));
    pendingVideoResumeRef.current = { ...pending, applied: true };
  };

  const toggleChapter = (id: string) =>
    setExpandedChapters(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const selectLesson = (lesson: LessonModel) => {
    if (lesson.id === "__empty__") {
      notify(detailError || "当前课程暂未配置可学习内容", "warning");
      return;
    }

    lastSavedVideoProgressRef.current = -1;
    const shouldResetPlayback = lesson.done && getVideoResumeSeconds(lesson) <= 0;
    const nextLesson = shouldResetPlayback ? { ...lesson, progressSeconds: 0 } : lesson;
    setCurrentLesson(nextLesson);
    prepareVideoResume(nextLesson);
    setDetail(prev => ({ ...prev, chapters: markCurrentLesson(prev.chapters, lesson.id) }));
    setVideoError("");
    setVideoReady(false);
    setIsPlaying(false);
    setShowMobileVideoLessonPicker(false);

    if (isLegacyCourse && lesson.source === "legacy") {
      courseService.getVideoDetail(appCourse.id, lesson.id)
        .then((payload) => {
          const enriched: Partial<LessonModel> = {
            script: payload.video.script,
            handoutUrl: payload.video.handoutUrl,
            handoutName: payload.video.handoutName,
            mediaUrl: payload.video.playbackUrl || payload.video.videoUrl,
          };
          setCurrentLesson(prev => prev.id === lesson.id ? { ...prev, ...enriched } : prev);
          setDetail(prev => ({ ...prev, chapters: patchLessonInChapters(prev.chapters, lesson.id, enriched) }));
          prepareVideoResume({ ...nextLesson, ...enriched });
        })
        .catch(() => {
          notify("视频详情加载失败，请稍后重试", "warning");
        });
    }
  };

  const saveVideoProgress = (complete = false) => {
    if (!isLegacyCourse || currentLesson.source !== "legacy" || currentLesson.id === "__empty__") {
      notify("当前课程不支持同步进度", "info");
      return;
    }

    if (!currentLesson.mediaUrl) {
      notify("当前课时暂未配置媒体", "warning");
      return;
    }

    const lessonId = currentLesson.id;
    const mediaSeconds = videoRef.current?.currentTime;
    const progressSeconds = complete
      ? currentLesson.durationSeconds
      : Math.max(currentLesson.progressSeconds, Math.floor(Number.isFinite(mediaSeconds) ? mediaSeconds ?? 0 : 0));
    setSavingVideoProgress(true);
    const request = complete
      ? courseService.markVideoCompleted(appCourse.id, lessonId, progressSeconds)
      : courseService.saveVideoProgress(appCourse.id, lessonId, progressSeconds);

    request
      .then((record) => {
        const playbackSeconds = Math.max(0, Number(record.lastPosition ?? (record.completed ? 0 : record.progress)));
        setCurrentLesson(prev => prev.id === lessonId ? {
          ...prev,
          progressSeconds: playbackSeconds,
          savedProgressSeconds: Math.max(record.progress, prev.savedProgressSeconds ?? 0),
          lastPositionSeconds: playbackSeconds,
          done: Boolean(record.completed),
        } : prev);
        setDetail(prev => ({
          ...prev,
          chapters: updateLessonProgressInChapters(prev.chapters, lessonId, playbackSeconds, Boolean(record.completed), record.progress),
        }));
        notify(record.completed ? "已同步学完状态" : "已同步视频进度", "success");
      })
      .catch((err) => {
        notify(err instanceof Error ? `视频进度同步失败：${err.message}` : "视频进度同步失败", "warning");
      })
      .finally(() => setSavingVideoProgress(false));
  };

  const saveVideoSeconds = (seconds: number, complete = false) => {
    if (!isLegacyCourse || currentLesson.source !== "legacy" || !currentLesson.mediaUrl || currentLesson.id === "__empty__") return;
    const lessonId = currentLesson.id;
    const progressSeconds = Math.max(0, Math.floor(seconds));
    if (!complete && Math.abs(progressSeconds - lastSavedVideoProgressRef.current) < 10) return;

    lastSavedVideoProgressRef.current = progressSeconds;
    setSavingVideoProgress(true);
    const request = complete
      ? courseService.markVideoCompleted(appCourse.id, lessonId, progressSeconds)
      : courseService.saveVideoProgress(appCourse.id, lessonId, progressSeconds);

    request
      .then((record) => {
        const playbackSeconds = Math.max(0, Number(record.lastPosition ?? (record.completed ? 0 : record.progress)));
        setCurrentLesson(prev => prev.id === lessonId ? {
          ...prev,
          progressSeconds: playbackSeconds,
          savedProgressSeconds: Math.max(record.progress, prev.savedProgressSeconds ?? 0),
          lastPositionSeconds: playbackSeconds,
          done: Boolean(record.completed),
        } : prev);
        setDetail(prev => ({
          ...prev,
          chapters: updateLessonProgressInChapters(prev.chapters, lessonId, playbackSeconds, Boolean(record.completed), record.progress),
        }));
      })
      .catch(() => {
        // Progress saving should not interrupt playback.
      })
      .finally(() => setSavingVideoProgress(false));
  };

  const moveVideoLesson = (direction: LessonDirection) => {
    const adjacent = findAdjacentLesson(c.chapters, currentLesson.id, direction);
    if (!adjacent) {
      notify(direction === "next" ? "已经是最后一讲" : "已经是第一讲", "info");
      return;
    }

    selectLesson(adjacent);
  };

  const renderVideoDanmakus = (items: VideoDanmaku[]) => {
    if (!danmakuEnabled || items.length === 0) return;
    const now = Date.now();
    const entries = items.slice(0, 8).map((item, index) => ({
      ...item,
      renderId: `${item.id}-${now}-${index}`,
      lane: (index + Math.floor(Math.random() * 6)) % 6,
    }));
    setActiveVideoDanmakus(prev => [...prev, ...entries].slice(-20));
    entries.forEach((entry) => {
      window.setTimeout(() => {
        setActiveVideoDanmakus(prev => prev.filter(item => item.renderId !== entry.renderId));
      }, 12500);
    });
  };

  const showDueVideoDanmakus = (seconds: number) => {
    if (!danmakuEnabled || videoDanmakusRef.current.length === 0) return;
    const due = videoDanmakusRef.current.filter((item) => {
      if (shownDanmakuIdsRef.current.has(item.id)) return false;
      return item.timeSeconds <= seconds && item.timeSeconds >= seconds - 2;
    });
    if (due.length === 0) return;
    due.forEach((item) => shownDanmakuIdsRef.current.add(item.id));
    renderVideoDanmakus(due);
  };

  const resetVideoDanmakuCursor = (seconds: number) => {
    shownDanmakuIdsRef.current = new Set(
      videoDanmakusRef.current.filter((item) => item.timeSeconds < seconds - 1).map((item) => item.id),
    );
    setActiveVideoDanmakus([]);
  };

  const submitVideoDanmaku = () => {
    if (!isLegacyCourse || currentLesson.source !== "legacy" || currentLesson.id === "__empty__") {
      notify("当前课程暂不支持发送弹幕", "warning");
      return;
    }
    const content = danmakuInput.replace(/\s+/g, " ").trim();
    if (!content) {
      notify("请输入弹幕内容", "warning");
      return;
    }
    if (content.length > 80) {
      notify("弹幕最多 80 个字", "warning");
      return;
    }
    const timeSeconds = Math.max(0, Math.floor(videoRef.current?.currentTime ?? currentLesson.progressSeconds ?? 0));
    setDanmakuSubmitting(true);
    courseService.sendVideoDanmaku(appCourse.id, currentLesson.id, { content, timeSeconds, color: danmakuColor })
      .then((item) => {
        setVideoDanmakus(prev => [...prev, item].sort((left, right) => left.timeSeconds - right.timeSeconds));
        shownDanmakuIdsRef.current.add(item.id);
        renderVideoDanmakus([item]);
        setDanmakuInput("");
        notify("弹幕已发送", "success");
      })
      .catch((error) => {
        notify(error instanceof Error ? `弹幕发送失败：${error.message}` : "弹幕发送失败", "warning");
      })
      .finally(() => setDanmakuSubmitting(false));
  };

  useEffect(() => {
    const video = videoRef.current;
    const mediaUrl = currentLesson.mediaUrl;
    if (!video || !mediaUrl) return;

    prepareVideoResume(currentLesson);
    setVideoError("");
    setVideoReady(false);
    video.removeAttribute("src");
    video.load();

    const resolvedMediaUrl = buildApiUrl(mediaUrl);

    if (!resolvedMediaUrl.includes(".m3u8")) {
      video.src = resolvedMediaUrl;
      setVideoReady(true);
      return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = resolvedMediaUrl;
      setVideoReady(true);
      return;
    }

    if (!Hls.isSupported()) {
      const message = "当前浏览器暂不支持 HLS 视频播放，请使用最新版 Chrome、Edge 或 Safari";
      setVideoError(message);
      notify(message, "warning");
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      xhrSetup: (xhr, url) => {
        const token = getUserToken();
        if (token && (url.startsWith("/") || url.startsWith(API_BASE_URL))) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      },
    });
    hls.loadSource(resolvedMediaUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setVideoReady(true);
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      const message = data.type === Hls.ErrorTypes.NETWORK_ERROR
        ? "视频分片加载失败，请稍后重试"
        : "视频解码失败，请联系教务老师处理";
      setVideoError(message);
      setVideoReady(false);
      setIsPlaying(false);
      notify(message, "warning");
      hls.destroy();
    });

    return () => {
      hls.destroy();
    };
  }, [currentLesson.mediaUrl]);

  useEffect(() => {
    let active = true;
    setNoteText("");
    if (!isLegacyCourse || currentLesson.source !== "legacy" || currentLesson.id === "__empty__") {
      setNoteLoading(false);
      return () => {
        active = false;
      };
    }

    setNoteLoading(true);
    courseService.getCourseNote(appCourse.id, "video", currentLesson.id)
      .then((note) => {
        if (!active) return;
        setNoteText(note?.content ?? "");
      })
      .catch(() => {
        if (active) setNoteText("");
      })
      .finally(() => {
        if (active) setNoteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appCourse.id, currentLesson.id, currentLesson.source, isLegacyCourse]);

  const saveCurrentNote = () => {
    if (!isLegacyCourse || currentLesson.source !== "legacy" || currentLesson.id === "__empty__") {
      notify("当前课程不支持保存笔记", "warning");
      return;
    }

    setNoteSaving(true);
    courseService.saveCourseNote(appCourse.id, "video", currentLesson.id, noteText)
      .then((note) => {
        setNoteText(note.content);
        notify("学习笔记已保存", "success");
      })
      .catch((error) => {
        notify(error instanceof Error ? `学习笔记保存失败：${error.message}` : "学习笔记保存失败", "warning");
      })
      .finally(() => setNoteSaving(false));
  };

  const toggleVideoPlayback = () => {
    const video = videoRef.current;

    if (!currentLesson.mediaUrl) {
      setIsPlaying(false);
      notify(currentLesson.id === "__empty__" ? "当前课程暂无可播放课时" : "当前课时暂未配置媒体", "warning");
      return;
    }

    if (!videoReady) {
      notify(videoError || "视频正在加载，请稍后再试", "info");
      return;
    }

    if (!video) {
      setIsPlaying(p => !p);
      return;
    }

    if (!video.paused && !video.ended) {
      video.pause();
      setIsPlaying(false);
      return;
    }

    void video.play()
      .then(() => setIsPlaying(true))
      .catch((error) => {
        setIsPlaying(false);
        const message = error instanceof Error && error.name === "NotAllowedError"
          ? "浏览器阻止了自动播放，请再次点击播放"
          : "视频播放失败，请稍后重试";
        setVideoError(message);
        notify(message, "warning");
      });
  };

  const setVideoMuted = () => {
    const nextVolume = videoVolumePct > 0 ? 0 : 80;
    setVideoVolume(nextVolume);
  };

  const toggleVideoFullscreen = () => {
    const container = videoPlayerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }

    void container.requestFullscreen?.();
  };

  const downloadMaterial = (material: CourseMaterial) => {
    if (material.source === "legacy" && material.courseId && material.lessonId && material.mediaKind) {
      setSavingVideoProgress(true);
      const request = material.mediaKind === "audio"
        ? courseService.downloadAudioHandout(material.courseId, material.lessonId)
        : courseService.downloadVideoHandout(material.courseId, material.lessonId);

      request
        .then((blob) => {
          triggerBlobDownload(blob, material.name);
          notify("讲义下载已开始", "success");
        })
        .catch((err) => {
          if (material.url) {
            window.open(material.url, "_blank", "noopener,noreferrer");
            notify("讲义下载暂时失败，已为你尝试备用方式打开", "warning");
            return;
          }
          notify(err instanceof Error ? `讲义下载失败：${err.message}` : "讲义下载失败", "warning");
        })
      .finally(() => setSavingVideoProgress(false));
      return;
    }

    if (material.source === "legacy" && material.courseId) {
      setSavingVideoProgress(true);
      courseService.downloadCourseHandout(material.courseId)
        .then((blob) => {
          triggerBlobDownload(blob, material.name);
          notify("讲义下载已开始", "success");
        })
        .catch((err) => {
          if (material.url) {
            window.open(material.url, "_blank", "noopener,noreferrer");
            notify("讲义下载暂时失败，已为你尝试备用方式打开", "warning");
            return;
          }
          notify(err instanceof Error ? `讲义下载失败：${err.message}` : "讲义下载失败", "warning");
        })
        .finally(() => setSavingVideoProgress(false));
      return;
    }

    if (material.url) {
      window.open(material.url, "_blank", "noopener,noreferrer");
      return;
    }

    notify(`${material.name} 暂无可下载地址`, "warning");
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = videoVolumePct / 100;
    video.playbackRate = Number(videoSpeed) || 1;
  }, [videoVolumePct, videoSpeed, currentLesson.mediaUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying && currentLesson.mediaUrl) {
      if (!videoReady) return;
      void video.play().catch((error) => {
        setIsPlaying(false);
        setVideoError(error instanceof Error && error.name === "NotAllowedError" ? "浏览器阻止了自动播放，请再次点击播放" : "视频播放失败，请稍后重试");
      });
    } else {
      video.pause();
    }
  }, [isPlaying, currentLesson.mediaUrl, videoReady]);

  return (
    <div className="debao-video-page debao-themed-page" style={{ minHeight: "100vh", background: "#090e1a" }}>
      {/* Breadcrumb bar */}
      <div className="debao-video-breadcrumb" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1340, margin: "0 auto", padding: "10px 36px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3a5570" }}>
          <span style={{ cursor: "pointer", color: "#4e8ef7" }} onClick={() => { setPage("home"); setActiveNav(0); }}>首页</span>
          <ChevronRight size={12} />
          <span style={{ cursor: "pointer", color: "#4e8ef7" }} onClick={() => { setPage("courses"); setActiveNav(1); }}>课程中心</span>
          <ChevronRight size={12} />
          <span style={{ color: "#5a7898", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
        </div>
      </div>

      <div className="debao-video-layout" style={{ maxWidth: 1340, margin: "0 auto", padding: "24px 36px 56px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>

        {/* ── LEFT: Player + tabs ── */}
        <div className="debao-video-main">
          <div className="debao-video-mobile-picker" style={{ display: "none" }}>
            <button
              type="button"
              className="debao-video-mobile-picker-trigger"
              onClick={() => setShowMobileVideoLessonPicker((open) => !open)}
            >
              <div>
                <span>当前视频</span>
                <strong>{currentLesson.title}</strong>
              </div>
              <ChevronDown size={16} style={{ transform: showMobileVideoLessonPicker ? "rotate(180deg)" : "none" }} />
            </button>

            {showMobileVideoLessonPicker ? (
              <div className="debao-video-mobile-picker-menu">
                {loadingDetail ? <div className="debao-video-mobile-picker-status">正在同步课程视频...</div> : null}
                {detailError ? <div className="debao-video-mobile-picker-error">{detailError}</div> : null}
                {c.chapters.map((ch) => {
                  const isOpen = expandedChapters.includes(ch.id);
                  return (
                    <div key={ch.id} className="debao-video-mobile-picker-chapter">
                      <button type="button" onClick={() => toggleChapter(ch.id)} className="debao-video-mobile-picker-chapter-button">
                        <span>{ch.title}</span>
                        <ChevronDown size={14} style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
                      </button>
                      {isOpen ? (
                        <div className="debao-video-mobile-picker-lessons">
                          {ch.lessons.map((lesson) => {
                            const isActive = lesson.id === currentLesson.id;
                            return (
                              <button
                                key={lesson.id}
                                type="button"
                                onClick={() => selectLesson(lesson)}
                                className={`debao-video-mobile-picker-lesson ${isActive ? "is-active" : ""}`}
                              >
                                <span className="debao-video-mobile-picker-lesson-icon">
                                  {isActive ? <PlayCircle size={11} /> : lesson.done ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                                </span>
                                <span className="debao-video-mobile-picker-lesson-main">
                                  <span>{lesson.title}</span>
                                  <em>{lesson.duration}</em>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Video player */}
          <div ref={videoPlayerRef} className="debao-video-player" style={{ borderRadius: 18, overflow: "hidden", background: "#000", aspectRatio: "16/9", position: "relative", marginBottom: 0 }}>
            {currentLesson.mediaUrl && (
              <video
                ref={videoRef}
                preload="metadata"
                playsInline
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
                onClick={toggleVideoPlayback}
                onPlay={() => setIsPlaying(true)}
                onLoadedMetadata={event => {
                  applyPendingVideoResume(event.currentTarget);
                  resetVideoDanmakuCursor(Math.floor(event.currentTarget.currentTime || currentLesson.progressSeconds || 0));
                }}
                onTimeUpdate={event => {
                  const target = event.currentTarget;
                  const duration = Number.isFinite(target.duration) && target.duration > 0 ? target.duration : currentLesson.durationSeconds;
                  const seconds = Math.floor(target.currentTime);
                  setCurrentLesson(prev => ({ ...prev, progressSeconds: seconds, lastPositionSeconds: seconds }));
                  showDueVideoDanmakus(seconds);
                  if (seconds > 0 && seconds % 15 === 0) saveVideoSeconds(seconds);
                  if (duration > 0) {
                    setDetail(prev => ({
                      ...prev,
                      chapters: updateLessonProgressInChapters(prev.chapters, currentLesson.id, seconds),
                    }));
                  }
                }}
                onPause={event => {
                  setIsPlaying(false);
                  saveVideoSeconds(event.currentTarget.currentTime);
                }}
                onEnded={event => {
                  setIsPlaying(false);
                  saveVideoSeconds(event.currentTarget.duration || currentLesson.durationSeconds, true);
                }}
                onSeeked={event => {
                  resetVideoDanmakuCursor(Math.floor(event.currentTarget.currentTime || 0));
                }}
                onCanPlay={() => {
                  if (videoRef.current) applyPendingVideoResume(videoRef.current);
                  setVideoReady(true);
                  setVideoError("");
                }}
                onPlaying={event => {
                  setIsPlaying(true);
                  applyPendingVideoResume(event.currentTarget);
                }}
                onError={() => {
                  setIsPlaying(false);
                  setVideoReady(false);
                  setVideoError("视频加载失败，请稍后重试");
                }}
              />
            )}
            {/* Fake video bg */}
            <div className="debao-video-overlay" style={{ position: "absolute", inset: 0, background: currentLesson.mediaUrl ? "linear-gradient(to top,rgba(0,0,0,0.46),transparent 55%)" : "linear-gradient(135deg,#060e20,#0a1830)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: !currentLesson.mediaUrl || !isPlaying ? "auto" : "none" }}>
              <div className="debao-video-overlay-bg" style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 30% 50%, rgba(78,142,247,0.08) 0%, transparent 60%), radial-gradient(circle at 80% 30%, rgba(29,201,164,0.05) 0%, transparent 50%)" }} />
              {/* Lesson title overlay */}
              <div className="debao-video-title-overlay" style={{ position: "absolute", top: 20, left: 24, right: 24 }}>
                <div className="debao-video-title-meta" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: "'JetBrains Mono',monospace" }}>
                  {currentLesson.tagName || "得恩法考"} &nbsp;/&nbsp; {loadingDetail ? "同步中" : currentLesson.mediaUrl ? "媒体已连接" : "课程内容"}
                </div>
                <div className="debao-video-title-text" style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "'Noto Serif SC',serif" }}>
                  {currentLesson.title}
                </div>
              </div>
              {/* Big play button */}
              {(!currentLesson.mediaUrl || !isPlaying) && (
                <button
                  className="debao-video-big-play"
                  onClick={toggleVideoPlayback}
                  style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "2px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: currentLesson.mediaUrl && videoReady ? "pointer" : "not-allowed", backdropFilter: "blur(8px)", transition: "all 0.2s", zIndex: 2, pointerEvents: "auto" }}>
                  {currentLesson.mediaUrl && !videoReady && !videoError ? <Loader2 size={28} color="#fff" style={{ animation: "spin 1s linear infinite" }} /> : <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />}
                </button>
              )}
              {currentLesson.mediaUrl && (!videoReady || videoError) ? (
                <div style={{ position: "relative", zIndex: 2, marginTop: 14, maxWidth: "80%", padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(201,151,62,0.35)", background: "rgba(9,14,26,0.78)", color: "#e8c46a", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
                  {videoError || "视频正在加载，请稍候"}
                </div>
              ) : null}
              {/* Duration badge */}
              <div className="debao-video-duration-badge" style={{ position: "absolute", bottom: 60, right: 20, fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace" }}>
                {currentLesson.duration}
              </div>
            </div>

            {danmakuEnabled && activeVideoDanmakus.length > 0 ? (
              <div className="debao-video-danmaku-layer" style={{ position: "absolute", left: 0, right: 0, top: 12, bottom: 76, zIndex: 3, pointerEvents: "none", overflow: "hidden" }}>
                {activeVideoDanmakus.map((item) => (
                  <div
                    key={item.renderId}
                    className="debao-video-danmaku-item"
                    style={{
                      top: `${8 + item.lane * 14}%`,
                      color: item.color || "#ffffff",
                    }}
                  >
                    {item.content}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Controls bar */}
            <div className="debao-video-controls-bar" style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top,rgba(0,0,0,0.85),transparent)", padding: "28px 20px 14px" }}>
              {/* Progress scrubber */}
              <div
                className="debao-video-progress-scrubber"
                style={{ height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 3, marginBottom: 12, cursor: currentLesson.mediaUrl ? "pointer" : "default", position: "relative" }}
                onClick={event => {
                  if (!videoRef.current || !currentLesson.mediaUrl) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                  const duration = Number.isFinite(videoRef.current.duration) && videoRef.current.duration > 0 ? videoRef.current.duration : currentLesson.durationSeconds;
                  const seconds = Math.round(ratio * duration);
                  pendingVideoResumeRef.current = null;
                  videoRef.current.currentTime = seconds;
                  resetVideoDanmakuCursor(seconds);
                  setCurrentLesson(prev => ({ ...prev, progressSeconds: seconds, lastPositionSeconds: seconds }));
                  setDetail(prev => ({
                    ...prev,
                    chapters: updateLessonProgressInChapters(prev.chapters, currentLesson.id, seconds),
                  }));
                  saveVideoSeconds(seconds, ratio >= 0.99);
                }}
              >
                <div className="debao-video-progress-fill" style={{ height: "100%", width: `${lessonProgressPct}%`, background: `linear-gradient(90deg,${c.color},${c.color}cc)`, borderRadius: 3 }} />
                <div className="debao-video-progress-knob" style={{ position: "absolute", left: `${lessonProgressPct}%`, top: "50%", transform: "translate(-50%,-50%)", width: 10, height: 10, borderRadius: "50%", background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
              </div>
              <div className="debao-video-controls-row" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button className="debao-video-control-button debao-video-play-button" onClick={toggleVideoPlayback} style={{ background: "none", border: "none", cursor: currentLesson.mediaUrl && videoReady ? "pointer" : "not-allowed", color: "#fff", display: "flex" }}>
                  {isPlaying ? <div style={{ display: "flex", gap: 3 }}><div style={{ width: 3, height: 14, background: "#fff", borderRadius: 1 }} /><div style={{ width: 3, height: 14, background: "#fff", borderRadius: 1 }} /></div> : <Play size={16} fill="#fff" color="#fff" />}
                </button>
                <button className="debao-video-control-button debao-video-prev-button" onClick={() => moveVideoLesson("prev")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}><SkipBack size={15} color="rgba(255,255,255,0.6)" /></button>
                <button className="debao-video-control-button debao-video-next-button" onClick={() => moveVideoLesson("next")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}><SkipForward size={15} color="rgba(255,255,255,0.6)" /></button>
                <div className="debao-video-volume-control" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <button className="debao-video-control-button debao-video-volume-button" type="button" onClick={setVideoMuted} aria-label="静音" title={videoVolumePct > 0 ? "静音" : "恢复音量"} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
                    <Volume2 size={15} color={videoVolumePct > 0 ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.32)"} />
                  </button>
                  <div
                    className="debao-video-volume-slider"
                    style={{ width: 64, height: 3, background: "rgba(255,255,255,0.14)", borderRadius: 2, cursor: "pointer" }}
                    onClick={event => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const nextVolume = Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100)));
                      setVideoVolume(nextVolume);
                    }}
                  >
                    <div style={{ height: "100%", width: `${videoVolumePct}%`, background: "rgba(255,255,255,0.52)", borderRadius: 2 }} />
                  </div>
                </div>
                <span className="debao-video-time-label" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono',monospace", marginLeft: 2 }}>{formatDuration(currentLesson.progressSeconds)} / {currentLesson.duration}</span>
                <div className="debao-video-right-controls" style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
                  <div className="debao-video-speed-control" style={{ position: "relative" }}>
                    <button className="debao-video-speed-button" type="button" onClick={() => setShowVideoSpeedMenu(p => !p)} style={{ padding: "4px 9px", borderRadius: 7, fontSize: 11, fontFamily: "'JetBrains Mono',monospace", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.72)", cursor: "pointer" }}>
                      {videoSpeed}x
                    </button>
                    {showVideoSpeedMenu && (
                      <div className="debao-video-speed-menu" style={{ position: "absolute", right: 0, bottom: 32, minWidth: 72, padding: 6, borderRadius: 10, background: "rgba(10,16,28,0.96)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 30px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", gap: 2, zIndex: 4 }}>
                        {videoSpeeds.map(sp => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => { setVideoSpeed(sp); setShowVideoSpeedMenu(false); }}
                            style={{ padding: "6px 10px", borderRadius: 7, border: "none", background: videoSpeed === sp ? `${c.color}24` : "transparent", color: videoSpeed === sp ? c.color : "rgba(255,255,255,0.68)", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer", textAlign: "left" }}
                          >
                            {sp}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="debao-video-control-button debao-video-fullscreen-button" type="button" onClick={toggleVideoFullscreen} aria-label="全屏" title="全屏" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
                    <Maximize2 size={14} color="rgba(255,255,255,0.6)" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="debao-video-danmaku-panel" style={{ background: "#0f1826", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => setDanmakuEnabled(enabled => !enabled)}
              style={{ padding: "7px 12px", borderRadius: 9, background: danmakuEnabled ? `${c.color}18` : "rgba(255,255,255,0.04)", border: `1px solid ${danmakuEnabled ? `${c.color}35` : "rgba(255,255,255,0.08)"}`, color: danmakuEnabled ? c.color : "#5a7898", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}
            >
              <MessageCircle size={13} /> {danmakuEnabled ? "弹幕开" : "弹幕关"}
            </button>
            <div className="debao-video-danmaku-colors" style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              {VIDEO_DANMAKU_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  aria-label={`弹幕颜色 ${color}`}
                  onClick={() => setDanmakuColor(color)}
                  style={{ width: 18, height: 18, borderRadius: "50%", border: danmakuColor === color ? `2px solid ${c.color}` : "1px solid rgba(255,255,255,0.22)", background: color, cursor: "pointer", boxShadow: danmakuColor === color ? `0 0 0 2px ${c.color}20` : "none" }}
                />
              ))}
            </div>
            <input
              value={danmakuInput}
              maxLength={80}
              onChange={event => setDanmakuInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitVideoDanmaku();
                }
              }}
              placeholder={danmakuLoading ? "弹幕加载中..." : "输入弹幕，按 Enter 发送"}
              disabled={danmakuSubmitting || currentLesson.id === "__empty__"}
              style={{ flex: 1, minWidth: 0, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", color: "#dde4f0", padding: "0 12px", outline: "none", fontSize: 13 }}
            />
            <button
              type="button"
              disabled={danmakuSubmitting || !danmakuInput.trim() || currentLesson.id === "__empty__"}
              onClick={submitVideoDanmaku}
              style={{ padding: "8px 16px", borderRadius: 10, background: danmakuSubmitting || !danmakuInput.trim() ? "rgba(255,255,255,0.04)" : `${c.color}18`, border: `1px solid ${danmakuSubmitting || !danmakuInput.trim() ? "rgba(255,255,255,0.08)" : `${c.color}35`}`, color: danmakuSubmitting || !danmakuInput.trim() ? "#3a5570" : c.color, fontSize: 12, fontWeight: 700, cursor: danmakuSubmitting || !danmakuInput.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
            >
              {danmakuSubmitting ? "发送中" : "发送"}
            </button>
          </div>

          {/* Lesson info strip */}
          <div className="debao-video-lesson-strip" style={{ background: "#0f1826", borderRadius: "0 0 18px 18px", padding: "16px 24px 18px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "#3a5570", marginBottom: 3 }}>当前播放 · {currentLesson.tagName || c.category}{savingVideoProgress ? " · 同步中" : ""}{detailError ? ` · ${detailError}` : ""}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#dde4f0" }}>{currentLesson.title}</div>
            </div>
            <div className="debao-video-lesson-actions" style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              <button onClick={() => moveVideoLesson("prev")} style={{ padding: "7px 16px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "#5a7898", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <SkipBack size={13} /> 上一讲
              </button>
              <button onClick={() => moveVideoLesson("next")} style={{ padding: "7px 16px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "#5a7898", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                下一讲 <SkipForward size={13} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="debao-video-tabs" style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 20 }}>
            {([
              { key: "intro",     label: "课程介绍", icon: AlignLeft },
              { key: "materials", label: "讲义资料", icon: Paperclip },
              { key: "notes",     label: "学习笔记", icon: PenLine },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 22px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: activeTab === t.key ? c.color : "#3a5570", fontWeight: activeTab === t.key ? 600 : 400, borderBottom: `2px solid ${activeTab === t.key ? c.color : "transparent"}`, marginBottom: -1, transition: "all 0.15s" }}>
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "intro" && (
            <div>
              <div style={{ fontSize: 13, color: "#5a7898", lineHeight: 1.9, marginBottom: 24 }}>{c.intro}</div>
              <div className="debao-video-intro-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                {[
                  { label: "课程总讲数", value: `${c.lessons} 讲`, icon: ListVideo, color: c.color },
                  { label: "内容来源",   value: "得恩法考", icon: Users, color: "#1dc9a4" },
                  { label: "同步状态",   value: loadingDetail ? "同步中" : "完成", icon: Star, color: "#c9973e" },
                ].map(s => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} style={{ background: "#0f1826", borderRadius: 14, padding: "16px 20px", border: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={16} color={s.color} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#3a5570", marginBottom: 3 }}>{s.label}</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 17, fontWeight: 600, color: "#dde4f0" }}>{s.value}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "materials" && (
            <div className="debao-video-materials" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {c.materials.length === 0 ? (
                <div style={{ background: "#0f1826", borderRadius: 13, padding: "18px", border: "1px solid rgba(255,255,255,0.06)", fontSize: 13, color: "#3a5570" }}>当前课程暂未配置讲义资料</div>
              ) : c.materials.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#0f1826", borderRadius: 13, padding: "14px 18px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: m.type === "pdf" ? "rgba(247,110,110,0.12)" : "rgba(78,142,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <FileText size={17} color={m.type === "pdf" ? "#f76e6e" : "#4e8ef7"} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#dde4f0", fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "#2e4260" }}>{m.size}</div>
                  </div>
                  <button onClick={() => downloadMaterial(m)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "#5a7898", cursor: "pointer" }}>
                    <Download size={13} /> 下载
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === "notes" && (
            <div className="debao-video-notes">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#3a5570" }}>{noteLoading ? "正在读取笔记..." : `当前课时 · ${currentLesson.title}`}</div>
                <button
                  type="button"
                  disabled={noteSaving || currentLesson.id === "__empty__"}
                  onClick={saveCurrentNote}
                  style={{ padding: "8px 18px", borderRadius: 10, background: noteSaving ? "rgba(255,255,255,0.04)" : `${c.color}14`, border: `1px solid ${c.color}30`, color: noteSaving ? "#3a5570" : c.color, fontSize: 13, fontWeight: 600, cursor: noteSaving || currentLesson.id === "__empty__" ? "not-allowed" : "pointer" }}
                >
                  {noteSaving ? "保存中..." : "保存笔记"}
                </button>
              </div>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="记录本讲笔记，支持 Markdown 格式…"
                style={{ width: "100%", minHeight: 160, background: "#0f1826", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px 18px", fontSize: 13, color: "#dde4f0", resize: "vertical", outline: "none", fontFamily: "'Noto Sans SC',sans-serif", lineHeight: 1.8, boxSizing: "border-box" }}
              />
            </div>
          )}
        </div>

        {/* ── RIGHT: Chapter list ── */}
        <div className="debao-video-sidebar" style={{ position: "sticky", top: 78 }}>
          {/* Progress summary */}
          <div className="debao-video-progress-card" style={{ background: "#0f1826", borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)", padding: "18px 20px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${c.color}20`, border: `1px solid ${c.color}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: c.color, flexShrink: 0 }}>{c.initials}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#dde4f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                <div style={{ fontSize: 11, color: "#3a5570" }}>{c.teacher} 主讲</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#3a5570" }}>学习进度</span>
              <span style={{ fontSize: 12, color: c.color, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{totalDone}/{totalLessons} 讲 · {progressPct}%</span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: `linear-gradient(90deg,${c.color},${c.color}99)`, borderRadius: 5 }} />
            </div>
          </div>

          {/* Chapter accordion */}
          <div className="debao-video-chapter-card" style={{ background: "#0f1826", borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: `linear-gradient(to bottom,${c.color},${c.color}55)` }} />
              <span style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 14, fontWeight: 600, color: "#dde4f0" }}>课程目录</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>{c.chapters.length} 章 · {totalLessons} 讲</span>
            </div>

            <div style={{ maxHeight: "calc(100vh - 360px)", overflowY: "auto" }}>
              {c.chapters.map((ch, ci) => {
                const isOpen = expandedChapters.includes(ch.id);
                const chProgress = ch.done === ch.total ? "done" : ch.done > 0 ? "partial" : "locked";
                return (
                  <div key={ch.id} style={{ borderBottom: ci < c.chapters.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    {/* Chapter header */}
                    <button onClick={() => toggleChapter(ch.id)}
                      style={{ width: "100%", padding: "13px 20px", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: chProgress === "done" ? "rgba(29,201,164,0.15)" : chProgress === "partial" ? `${c.color}15` : "rgba(255,255,255,0.04)" }}>
                        {chProgress === "done"
                          ? <CheckCircle2 size={13} color="#1dc9a4" />
                          : chProgress === "partial"
                          ? <PlayCircle size={13} color={c.color} />
                          : <Lock size={11} color="#2e4260" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: chProgress === "locked" ? "#2e4260" : "#c8d8ee", marginBottom: 2 }}>{ch.title}</div>
                        <div style={{ fontSize: 10, color: "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>{ch.done}/{ch.total} 讲</div>
                      </div>
                      <ChevronDown size={14} color="#2e4260" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0 }} />
                    </button>

                    {/* Lessons */}
                    {isOpen && (
                      <div style={{ paddingBottom: 6 }}>
                        {ch.lessons.map(l => (
                          <button key={l.id} onClick={() => selectLesson(l)}
                            style={{ width: "100%", padding: "9px 20px 9px 52px", display: "flex", alignItems: "center", gap: 10, background: l.current ? `${c.color}0e` : "none", border: "none", borderLeft: l.current ? `2px solid ${c.color}` : "2px solid transparent", cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}
                            onMouseEnter={e => { if (!l.current) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
                            onMouseLeave={e => { if (!l.current) (e.currentTarget as HTMLElement).style.background = "none"; }}>
                            <div style={{ flexShrink: 0 }}>
                              {l.done
                                ? <CheckCircle2 size={13} color="#1dc9a4" />
                                : l.current
                                ? <PlayCircle size={13} color={c.color} />
                                : <div style={{ width: 13, height: 13, borderRadius: "50%", border: "1.5px solid #1e3050" }} />}
                            </div>
                            <span style={{ flex: 1, fontSize: 12, color: l.done ? "#2e4260" : l.current ? "#dde4f0" : "#4a6888", lineHeight: 1.4, textDecoration: l.done ? "line-through" : "none", textDecorationColor: "#2e4260" }}>{l.title}</span>
                            <span style={{ fontSize: 10, color: "#1e3050", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{l.duration}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ QUESTION BANK DATA ══════════════════════ */

const qbSubjects = [
  {
    id: 1, name: "民法", color: "#c9973e", total: 2840, done: 1920,
    chapters: [
      { id: 11, name: "民法总则", total: 320, done: 320 },
      { id: 12, name: "合同法", total: 580, done: 420 },
      { id: 13, name: "物权法", total: 380, done: 210 },
      { id: 14, name: "侵权责任法", total: 260, done: 180 },
      { id: 15, name: "婚姻家庭法", total: 180, done: 90 },
      { id: 16, name: "继承法", total: 140, done: 60 },
      { id: 17, name: "人格权法", total: 120, done: 40 },
    ],
  },
  {
    id: 2, name: "刑法", color: "#f76e6e", total: 2240, done: 980,
    chapters: [
      { id: 21, name: "刑法总论", total: 480, done: 320 },
      { id: 22, name: "侵财类犯罪", total: 360, done: 220 },
      { id: 23, name: "人身类犯罪", total: 280, done: 160 },
      { id: 24, name: "职务类犯罪", total: 240, done: 80 },
      { id: 25, name: "刑法分论其他", total: 360, done: 60 },
      { id: 26, name: "刑法真题专练", total: 180, done: 0 },
    ],
  },
  {
    id: 3, name: "行政法", color: "#4e8ef7", total: 1680, done: 540,
    chapters: [
      { id: 31, name: "行政法基础理论", total: 260, done: 260 },
      { id: 32, name: "行政许可与处罚", total: 340, done: 180 },
      { id: 33, name: "行政诉讼程序", total: 420, done: 80 },
      { id: 34, name: "国家赔偿", total: 180, done: 20 },
      { id: 35, name: "历年真题精析", total: 200, done: 0 },
    ],
  },
  {
    id: 4, name: "民事诉讼法", color: "#1dc9a4", total: 1200, done: 320,
    chapters: [
      { id: 41, name: "诉讼主体与管辖", total: 280, done: 180 },
      { id: 42, name: "证据制度", total: 320, done: 120 },
      { id: 43, name: "审判程序", total: 360, done: 20 },
      { id: 44, name: "执行程序", total: 160, done: 0 },
    ],
  },
  {
    id: 5, name: "刑事诉讼法", color: "#c97ef5", total: 1100, done: 210,
    chapters: [
      { id: 51, name: "侦查程序", total: 280, done: 120 },
      { id: 52, name: "审查起诉", total: 240, done: 90 },
      { id: 53, name: "审判程序", total: 360, done: 0 },
      { id: 54, name: "证据规则", total: 220, done: 0 },
    ],
  },
];

type QOption = { key: string; text: string };
type Question = {
  id: number; type: "单选" | "多选" | "判断"; subject: string; chapter: string;
  difficulty: 1 | 2 | 3; year: string; text: string;
  options: QOption[]; answer: string[]; explanation: string;
};
type QuestionPracticeModeLabel = "顺序练习" | "随机练习" | "只看错题" | "收藏题目";
type QuestionPracticeTarget = { bookId?: string; subjectId?: string; chapterId?: string; name: string; paperType?: "objective" | "subjective"; layout?: "officialSubjective"; source?: "my" | "public" } | null;
type QuestionPracticeRouteState = { mode: QuestionPracticeModeLabel; chapter: QuestionPracticeTarget; questionId?: string };

const parseQuestionPracticeMode = (raw: string | null): QuestionPracticeModeLabel => {
  if (raw === "random" || raw === "随机练习") return "随机练习";
  if (raw === "wrong" || raw === "只看错题") return "只看错题";
  if (raw === "favorite" || raw === "收藏题目") return "收藏题目";
  return "顺序练习";
};

const questionPracticeModeToQuery = (mode: QuestionPracticeModeLabel) => {
  if (mode === "随机练习") return "random";
  if (mode === "只看错题") return "wrong";
  if (mode === "收藏题目") return "favorite";
  return "sequence";
};

const getRouteQuestionPracticeState = (): QuestionPracticeRouteState => {
  if (typeof window === "undefined") return { mode: "顺序练习", chapter: null };

  const params = new URLSearchParams(window.location.search);
  const mode = parseQuestionPracticeMode(params.get("mode"));
  const paperTypeParam = params.get("paperType");
  const paperType = paperTypeParam === "subjective" || paperTypeParam === "objective" ? paperTypeParam : undefined;
  const layoutParam = params.get("layout");
  const layout = layoutParam === "officialSubjective" ? layoutParam : undefined;
  const sourceParam = params.get("source");
  const source = sourceParam === "my" || sourceParam === "public" ? sourceParam : undefined;
  const bookId = params.get("bookId")?.trim() || undefined;
  const subjectId = params.get("subjectId")?.trim() || undefined;
  const chapterId = params.get("chapterId")?.trim() || undefined;
  const name = params.get("name")?.trim() || "";
  const questionId = params.get("questionId")?.trim() || undefined;
  const hasTarget = Boolean(bookId || subjectId || chapterId || name || paperType || layout || source);

  return {
    mode,
    chapter: hasTarget
      ? {
        bookId,
        subjectId,
        chapterId,
        name: name || (paperType === "subjective" ? "主观题练习" : "客观题练习"),
        paperType,
        layout,
        source,
      }
      : null,
    questionId,
  };
};

const buildQuestionPracticePath = (
  mode: QuestionPracticeModeLabel,
  chapter: QuestionPracticeTarget,
  questionId?: string,
) => {
  const params = new URLSearchParams();
  params.set("mode", questionPracticeModeToQuery(mode));
  if (chapter?.bookId) params.set("bookId", chapter.bookId);
  if (chapter?.subjectId) params.set("subjectId", chapter.subjectId);
  if (chapter?.chapterId) params.set("chapterId", chapter.chapterId);
  if (chapter?.name) params.set("name", chapter.name);
  if (chapter?.paperType) params.set("paperType", chapter.paperType);
  if (chapter?.layout) params.set("layout", chapter.layout);
  if (chapter?.source) params.set("source", chapter.source);
  if (questionId) params.set("questionId", questionId);
  return `/question-bank/practice?${params.toString()}`;
};

const mapQuestionPracticeMode = (mode: QuestionPracticeModeLabel): QuestionBankPracticeMode => {
  if (mode === "随机练习") return "random";
  if (mode === "只看错题") return "wrong";
  if (mode === "收藏题目") return "favorite";
  return "sequence";
};

type QuestionPracticeResult = "correct" | "wrong" | "viewed";
type QuestionPracticeModal = "confirmReveal" | null;

const isQuestionBankSubjectiveItem = (item?: QuestionBankItem | null) =>
  Boolean(item && (item.type === "subjective_case" || item.typeLabel === "案例" || (item.options?.length ?? 0) === 0));

type QuestionBankSubjectCard = {
  id: string;
  bookId?: string;
  paperType?: "objective" | "subjective";
  name: string;
  total: number;
  done: number;
  color: string;
};

const questions: Question[] = [
  {
    id: 1, type: "单选", subject: "民法", chapter: "合同法", difficulty: 2, year: "2023",
    text: '甲向乙发出要约，表示愿以10万元购买乙的房屋。乙回复称“价格可以接受，但须在本月底前付清全款”。关于该回复的性质，下列说法正确的是：',
    options: [
      { key: "A", text: "乙的回复构成承诺，合同已成立" },
      { key: "B", text: "乙的回复构成新要约，因为对付款期限作出了限定" },
      { key: "C", text: "乙的回复属于要约邀请，不产生法律效力" },
      { key: "D", text: "乙的回复构成附条件承诺，合同附条件成立" },
    ],
    answer: ["B"],
    explanation: "根据《民法典》第488条，承诺的内容应当与要约的内容一致。受要约人对要约的内容作出实质性变更的，为新要约。付款期限属于合同的实质性内容，乙对付款期限的变更构成实质性变更，因此乙的回复为新要约而非承诺。",
  },
  {
    id: 2, type: "多选", subject: "民法", chapter: "合同法", difficulty: 3, year: "2022",
    text: "下列关于合同无效的情形，说法正确的是：",
    options: [
      { key: "A", text: "违反法律、行政法规的强制性规定的合同无效" },
      { key: "B", text: "违背公序良俗的合同无效" },
      { key: "C", text: "行为人与相对人恶意串通，损害第三人利益的合同无效" },
      { key: "D", text: "以合法形式掩盖非法目的的合同无效" },
    ],
    answer: ["A", "B", "C", "D"],
    explanation: "根据《民法典》第153条、第154条，以上四种情形均属合同无效的法定情形：（1）违反法律、行政法规强制性规定；（2）违背公序良俗；（3）恶意串通损害他人利益；（4）以合法形式掩盖非法目的。四项均正确。",
  },
  {
    id: 3, type: "判断", subject: "民法", chapter: "合同法", difficulty: 1, year: "2023",
    text: "当事人约定以特定财物抵偿债务的，该约定自合同成立时生效，标的物所有权自合同生效时转移。",
    options: [
      { key: "A", text: "正确" },
      { key: "B", text: "错误" },
    ],
    answer: ["B"],
    explanation: "以物抵债协议中，标的物所有权并非自合同成立时转移，而应依据物权变动的一般规则处理——动产以交付为准，不动产以登记为准。因此本题表述错误。",
  },
  {
    id: 4, type: "单选", subject: "民法", chapter: "合同法", difficulty: 2, year: "2021",
    text: "甲公司与乙公司签订货物买卖合同，约定货款100万元。合同签订后，乙公司陷入严重财务危机，甲公司有充分证据证明乙公司已无力支付货款。此时甲公司尚未履行交货义务，甲公司的下列哪项做法符合法律规定？",
    options: [
      { key: "A", text: "甲公司可以单方解除合同，无需通知乙公司" },
      { key: "B", text: "甲公司可以中止自己的履行，并通知乙公司" },
      { key: "C", text: "甲公司必须继续履行，否则构成违约" },
      { key: "D", text: "甲公司可以主张合同无效" },
    ],
    answer: ["B"],
    explanation: "根据《民法典》第527条，应当先履行债务的当事人，有确切证据证明对方有以下情形之一的，可以中止履行：（一）经营状况严重恶化；（二）转移财产、抽逃资金，以逃避债务；（三）丧失商业信誉；（四）有丧失或者可能丧失履行债务能力的其他情形。甲公司应当及时通知乙公司，而非单方解除或不作为。",
  },
  {
    id: 5, type: "多选", subject: "民法", chapter: "物权法", difficulty: 3, year: "2023",
    text: "关于不动产物权变动，下列说法正确的有：",
    options: [
      { key: "A", text: "基于法律行为的不动产物权变动，以登记为生效要件" },
      { key: "B", text: "因继承取得不动产物权，自继承开始时发生效力" },
      { key: "C", text: "因人民法院、仲裁机构的法律文书导致的物权变动，自法律文书生效时发生效力" },
      { key: "D", text: "不办理登记的，不影响物权的效力，但不得处分该物权" },
    ],
    answer: ["A", "B", "C", "D"],
    explanation: "以上各项均为《民法典》第214条至第229条的规定：（A）基于法律行为的不动产物权变动须登记；（B）继承取得自继承开始；（C）法律文书、行政决定自生效/决定之日；（D）已设立但未登记的，不得处分。均正确。",
  },
];

/* ══════════════════════ QUESTION BANK PAGE ══════════════════════ */

function QuestionBankPage({ setPage, setActiveNav, initialMode = "顺序练习", initialChapter = null, initialQuestionId, notify }: { setPage: (p: string) => void; setActiveNav: (i: number) => void; initialMode?: QuestionPracticeModeLabel; initialChapter?: QuestionPracticeTarget; initialQuestionId?: string; notify: Notify }) {
  const [banks, setBanks] = useState<QuestionBankBook[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(initialChapter?.bookId ?? null);
  const [expandedSubjects, setExpandedSubjects] = useState<string[]>([]);
  const [activeChapter, setActiveChapter] = useState<QuestionPracticeTarget>(initialChapter);
  const [mode, setMode] = useState<QuestionPracticeModeLabel>(initialMode);
  const [apiQuestions, setApiQuestions] = useState<QuestionBankItem[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [questionError, setQuestionError] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [clearingRecord, setClearingRecord] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<Record<string, QuestionPracticeResult>>({});
  const [subjectiveDrafts, setSubjectiveDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingDraftQuestionIds, setSavingDraftQuestionIds] = useState<Record<string, boolean>>({});
  const draftSaveTimersRef = useRef<Record<string, number>>({});
  const [activeSubjectiveBlockId, setActiveSubjectiveBlockId] = useState("");
  const [restoreQuestionId, setRestoreQuestionId] = useState<string | undefined>(initialQuestionId);
  const [expandedSubjectiveAnalysis, setExpandedSubjectiveAnalysis] = useState<Record<string, boolean>>({});
  const [practiceModal, setPracticeModal] = useState<QuestionPracticeModal>(null);
  const [officialLeftNavOpen, setOfficialLeftNavOpen] = useState(true);
  const [officialThemeId, setOfficialThemeId] = useState<OfficialThemeId>(1);
  const [officialThemeMenuOpen, setOfficialThemeMenuOpen] = useState(false);
  const [officialFontSize, setOfficialFontSize] = useState(18);
  const [officialStemHeight, setOfficialStemHeight] = useState<OfficialSubjectivePanelHeight>("300px");
  const [officialAnswerHeight, setOfficialAnswerHeight] = useState<OfficialAnswerPanelHeight>("340px");
  const [officialAnalysisDialogOpen, setOfficialAnalysisDialogOpen] = useState(false);
  const [officialOpenAnalysisAfterSubmit, setOfficialOpenAnalysisAfterSubmit] = useState(false);
  const [officialLawDialogOpen, setOfficialLawDialogOpen] = useState(false);
  const [officialLawDialogRect, setOfficialLawDialogRect] = useState<OfficialDialogRect>(() => createOfficialDialogRect());
  const [officialLawDialogMaximized, setOfficialLawDialogMaximized] = useState(false);
  const [officialPromptHighlightHtmlMap, setOfficialPromptHighlightHtmlMap] = useState<Record<string, string>>({});
  const [officialBlockPromptHighlightHtmlMap, setOfficialBlockPromptHighlightHtmlMap] = useState<Record<string, string>>({});
  const officialPromptRef = useRef<HTMLDivElement | null>(null);
  const officialBlockPromptRef = useRef<HTMLDivElement | null>(null);
  const officialAnswerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const officialAnswerComposingRef = useRef(false);
  const officialHighlightSelectionRef = useRef<OfficialHighlightSelection | null>(null);
  const officialLawDialogRestoreRectRef = useRef<OfficialDialogRect | null>(null);

  const visiblePracticeBanks = initialChapter?.paperType ? banks.filter(book => book.paperType === initialChapter.paperType) : banks;
  const activeBook = visiblePracticeBanks.find(book => book.id === activeBookId) ?? visiblePracticeBanks[0] ?? banks[0] ?? null;
  const useOfficialSubjectivePractice = activeChapter?.layout === "officialSubjective" || (activeBook?.accessType === "authorized" && activeBook.paperType === "subjective");
  const q = apiQuestions[qIndex];
  const currentQuestionId = q?.id ?? "";
  const currentAnswer = q?.correctAnswer ?? [];
  const currentState = q?.state ?? null;
  const isSubjectiveQuestion = isQuestionBankSubjectiveItem(q);
  const subjectiveSubQuestions = q?.subQuestions ?? [];
  const isSubmitted = isSubjectiveQuestion ? currentState?.hasViewedAnswer === true || submitted : currentState?.isAnswered === true || submitted;
  const isCorrect = !isSubjectiveQuestion && isSubmitted && currentState?.isCorrect === true;
  const totalDone = Object.values(results).filter(r => r === "correct" || r === "wrong").length;
  const totalCorrect = Object.values(results).filter(r => r === "correct").length;
  const totalWrong = Object.values(results).filter(r => r === "wrong").length;
  const subjectiveItems = apiQuestions.filter(item => isQuestionBankSubjectiveItem(item));
  const subjectiveViewed = subjectiveItems.filter(item => results[item.id] === "viewed").length;
  const subjectiveTotal = subjectiveItems.length || apiQuestions.length;
  const subjectiveSubQuestionTotal = subjectiveItems.reduce((sum, item) => sum + Math.max(1, item.subQuestions?.length ?? 0), 0);
  const answerSheetDone = isSubjectiveQuestion ? subjectiveViewed : totalDone;
  const answerSheetTotal = isSubjectiveQuestion ? subjectiveTotal : apiQuestions.length;
  const subjectiveAnswerBlocks = q && isSubjectiveQuestion
    ? subjectiveSubQuestions.length > 0
      ? subjectiveSubQuestions.map((subQuestion, index) => ({
        id: subQuestion.id || `sub-${index}`,
        title: subQuestion.title || `第 ${index + 1} 问`,
        prompt: subQuestion.prompt,
        placeholder: subQuestion.placeholder || "请在这里输入你的作答，查看参考答案后自行核对。",
        referenceAnswer: subQuestion.referenceAnswer,
        analysis: subQuestion.analysis,
      }))
      : [{ id: "overall", title: "我的作答", prompt: "", placeholder: "请在这里输入你的作答，查看参考答案后自行核对。", referenceAnswer: "", analysis: q.analysis }]
    : [];
  const currentSubjectiveDrafts = currentQuestionId ? subjectiveDrafts[currentQuestionId] ?? {} : {};
  const subjectiveDraftChars = Object.values(currentSubjectiveDrafts).join("").replace(/\s/g, "").length;
  const isCurrentDraftSaving = Boolean(currentQuestionId && savingDraftQuestionIds[currentQuestionId]);
  const firstSubjectiveBlockId = subjectiveAnswerBlocks[0]?.id ?? "";
  const activeSubjectiveBlock = subjectiveAnswerBlocks.find(block => block.id === activeSubjectiveBlockId) ?? subjectiveAnswerBlocks[0] ?? null;
  const activeSubjectiveBlockIndex = activeSubjectiveBlock ? Math.max(0, subjectiveAnswerBlocks.findIndex(block => block.id === activeSubjectiveBlock.id)) : 0;
  const activeAnalysisKey = currentQuestionId && activeSubjectiveBlock ? `${currentQuestionId}:${activeSubjectiveBlock.id}` : "";
  const officialActiveBlockPromptKey = currentQuestionId && activeSubjectiveBlock ? `${currentQuestionId}:${activeSubjectiveBlock.id}` : "";
  const isActiveAnalysisOpen = Boolean(activeAnalysisKey && expandedSubjectiveAnalysis[activeAnalysisKey]);

  const toggleSubject = (id: string) =>
    setExpandedSubjects(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const syncQuestionPracticeUrl = (
    nextMode = mode,
    nextChapter = activeChapter,
    nextQuestionId = currentQuestionId,
    replace = true,
  ) => {
    if (typeof window === "undefined") return;
    const nextPath = buildQuestionPracticePath(nextMode, nextChapter, nextQuestionId || undefined);
    if (`${window.location.pathname}${window.location.search}` === nextPath) return;
    if (replace) {
      window.history.replaceState({ page: "questionBank", mode: nextMode, chapter: nextChapter, questionId: nextQuestionId }, "", nextPath);
    } else {
      window.history.pushState({ page: "questionBank", mode: nextMode, chapter: nextChapter, questionId: nextQuestionId }, "", nextPath);
    }
  };

  useEffect(() => {
    let active = true;

    const loadBanks = async () => {
      setLoadingQuestions(true);
      setQuestionError("");
      try {
        const [publicBanks, authorizedBanks] = await Promise.all([
          questionBankService.getPublicQuestionBanks(),
          questionBankService.getMyQuestionBanks(),
        ]);
        const nextBanks = Array.from(new Map([...publicBanks, ...authorizedBanks].map((bank) => [bank.id, bank])).values());
        if (!active) return;
        setBanks(nextBanks);
        const scopedBanks = initialChapter?.paperType ? nextBanks.filter(book => book.paperType === initialChapter.paperType) : nextBanks;
        const nextBook = scopedBanks.find(book => book.id === initialChapter?.bookId) ?? scopedBanks[0] ?? nextBanks[0] ?? null;
        setActiveBookId(nextBook?.id ?? null);
        setExpandedSubjects(nextBook?.subjects?.[0]?.id ? [nextBook.subjects[0].id] : []);
        if (!initialChapter && nextBook?.subjects?.[0]) {
          const firstSubject = nextBook.subjects[0];
          setActiveChapter({ bookId: nextBook.id, subjectId: firstSubject.id, chapterId: firstSubject.id, name: firstSubject.name, paperType: nextBook.paperType });
        }
      } catch (error) {
        if (!active) return;
        setQuestionError(error instanceof Error ? error.message : "题库加载失败");
      } finally {
        if (active) setLoadingQuestions(false);
      }
    };

    void loadBanks();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeBookId) {
      setApiQuestions([]);
      return;
    }

    let active = true;

    const loadQuestions = async () => {
      setLoadingQuestions(true);
      setQuestionError("");
      try {
        const items = await questionBankService.getItems(activeBookId, {
          subjectId: activeChapter?.subjectId,
          mode: mapQuestionPracticeMode(mode),
          limit: 100,
        });
        if (!active) return;
        const restoredIndex = restoreQuestionId ? items.findIndex(item => item.id === restoreQuestionId) : 0;
        const nextQuestionIndex = restoredIndex >= 0 ? restoredIndex : 0;
        const nextQuestion = items[nextQuestionIndex] ?? items[0];
        setApiQuestions(items);
        setQIndex(nextQuestionIndex);
        setSelected(nextQuestion?.state.selectedAnswers ?? []);
        setSubmitted(Boolean(nextQuestion?.state.isAnswered || nextQuestion?.state.hasViewedAnswer));
        setResults(
          Object.fromEntries(
            items.flatMap(item => {
              if (isQuestionBankSubjectiveItem(item)) {
                return item.state.hasViewedAnswer ? [[item.id, "viewed" as const]] : [];
              }
              return item.state.isAnswered && item.state.isCorrect !== null ? [[item.id, item.state.isCorrect ? "correct" as const : "wrong" as const]] : [];
            }),
          ),
        );
        setSubjectiveDrafts(
          Object.fromEntries(
            items
              .filter(item => isQuestionBankSubjectiveItem(item) && Object.keys(item.state.subjectiveDrafts ?? {}).length > 0)
              .map(item => [item.id, item.state.subjectiveDrafts ?? {}]),
          ),
        );
      } catch (error) {
        if (!active) return;
        setApiQuestions([]);
        setQuestionError(error instanceof Error ? error.message : "题目加载失败");
      } finally {
        if (active) setLoadingQuestions(false);
      }
    };

    void loadQuestions();

    return () => {
      active = false;
    };
  }, [activeBookId, activeChapter?.subjectId, mode, restoreQuestionId]);

  useEffect(() => {
    if (apiQuestions.length === 0) return;
    const nextQuestion = apiQuestions[qIndex];
    setSelected(nextQuestion?.state.selectedAnswers ?? []);
    setSubmitted(Boolean(nextQuestion?.state.isAnswered || nextQuestion?.state.hasViewedAnswer));
    syncQuestionPracticeUrl(mode, activeChapter, nextQuestion?.id);
  }, [qIndex, apiQuestions]);

  useEffect(() => {
    if (!firstSubjectiveBlockId) return;
    setActiveSubjectiveBlockId(firstSubjectiveBlockId);
  }, [currentQuestionId, firstSubjectiveBlockId]);

  useEffect(() => () => {
    Object.values(draftSaveTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    draftSaveTimersRef.current = {};
  }, []);

  const selectOption = (key: string) => {
    if (!q || isSubmitted) return;
    if (isSubjectiveQuestion) return;
    if (q.typeLabel !== "多选") {
      setSelected([key]);
    } else {
      setSelected(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);
    }
  };

  const handleSubmit = async () => {
    if (!q || submittingAnswer) return;
    if (activeSubjectiveBlock && officialAnswerTextareaRef.current) {
      updateSubjectiveDraft(activeSubjectiveBlock.id, officialAnswerTextareaRef.current.value);
    }
    if (isSubjectiveQuestion) {
      if (!isSubmitted && subjectiveDraftChars === 0 && practiceModal !== "confirmReveal") {
        setPracticeModal("confirmReveal");
        return;
      }
      setSubmittingAnswer(true);
      try {
        const saved = await questionBankService.viewAnswer(q.bookId, q.id);
        setApiQuestions(items => items.map(item => item.id === q.id ? saved : item));
        setSubmitted(true);
        setResults(r => ({ ...r, [q.id]: "viewed" }));
        if (activeSubjectiveBlock) {
          setExpandedSubjectiveAnalysis(prev => ({ ...prev, [`${q.id}:${activeSubjectiveBlock.id}`]: true }));
        }
        setPracticeModal(null);
      } catch (error) {
        notify(error instanceof Error ? `解析加载失败：${error.message}` : "解析加载失败", "warning");
      } finally {
        setSubmittingAnswer(false);
      }
      return;
    }
    if (!selected.length) return;

    setSubmittingAnswer(true);
    try {
      const result = await questionBankService.submitAnswer(q.bookId, q.id, selected);
      setApiQuestions(items => items.map(item => item.id === q.id ? result.item : item));
      setSubmitted(true);
      setResults(r => ({ ...r, [q.id]: result.isCorrect ? "correct" : "wrong" }));
    } catch (error) {
      notify(error instanceof Error ? `答案提交失败：${error.message}` : "答案提交失败", "warning");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleNext = () => {
    const listLength = apiQuestions.length;
    setRestoreQuestionId(undefined);
    setQIndex(i => Math.min(i + 1, Math.max(0, listLength - 1)));
  };

  const handlePrev = () => {
    setRestoreQuestionId(undefined);
    setQIndex(i => Math.max(i - 1, 0));
  };

  const diffColor = (d: number) => d === 1 ? "#1dc9a4" : d === 2 ? "#f7a94e" : "#f76e6e";
  const diffLabel = (d: number) => d === 1 ? "简单" : d === 2 ? "中等" : "困难";

  const optionState = (key: string) => {
    if (!isSubmitted) return selected.includes(key) ? "selected" : "idle";
    if (currentAnswer.includes(key)) return "correct";
    if (selected.includes(key) && !currentAnswer.includes(key)) return "wrong";
    return "idle";
  };

  const optionStyle = (key: string): React.CSSProperties => {
    const s = optionState(key);
    return {
      width: "100%", padding: "14px 18px", borderRadius: 12, border: "none", cursor: isSubmitted ? "default" : "pointer",
      textAlign: "left", fontSize: 14, lineHeight: 1.6, display: "flex", gap: 14, alignItems: "flex-start",
      transition: "all 0.15s",
      background: s === "selected" ? "rgba(78,142,247,0.1)" : s === "correct" ? "rgba(29,201,164,0.1)" : s === "wrong" ? "rgba(247,110,110,0.1)" : "rgba(255,255,255,0.025)",
      outline: s === "selected" ? "1.5px solid rgba(78,142,247,0.5)" : s === "correct" ? "1.5px solid rgba(29,201,164,0.5)" : s === "wrong" ? "1.5px solid rgba(247,110,110,0.4)" : "1.5px solid rgba(255,255,255,0.06)",
      color: s === "correct" ? "#1dc9a4" : s === "wrong" ? "#f76e6e" : s === "selected" ? "#a0c4ff" : "#8fa3be",
    };
  };

  const keyCircleStyle = (key: string): React.CSSProperties => {
    const s = optionState(key);
    return {
      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 700, marginTop: 1,
      background: s === "selected" ? "#4e8ef7" : s === "correct" ? "#1dc9a4" : s === "wrong" ? "#f76e6e" : "rgba(255,255,255,0.06)",
      color: s === "idle" ? "#3a5570" : "#fff",
    };
  };

  const toggleBookmark = async () => {
    if (!q) return;
    const next = !q.state.isBookmarked;
    setApiQuestions(items => items.map(item => item.id === q.id ? { ...item, state: { ...item.state, isBookmarked: next } } : item));
    try {
      const saved = await questionBankService.updateItemState(q.bookId, q.id, { bookmarked: next });
      setApiQuestions(items => items.map(item => item.id === q.id ? saved : item));
      notify(next ? "收藏成功，已保存到我的收藏" : "已取消收藏", "success");
    } catch (error) {
      setApiQuestions(items => items.map(item => item.id === q.id ? { ...item, state: { ...item.state, isBookmarked: !next } } : item));
      notify(error instanceof Error ? `收藏更新失败：${error.message}` : "收藏更新失败", "warning");
    }
  };

  const toggleRedoMarked = async () => {
    if (!q) return;
    const next = !q.state.isRedoMarked;
    setApiQuestions(items => items.map(item => item.id === q.id ? { ...item, state: { ...item.state, isRedoMarked: next } } : item));
    try {
      const saved = await questionBankService.updateItemState(q.bookId, q.id, { isRedoMarked: next });
      setApiQuestions(items => items.map(item => item.id === q.id ? saved : item));
    } catch (error) {
      setApiQuestions(items => items.map(item => item.id === q.id ? { ...item, state: { ...item.state, isRedoMarked: !next } } : item));
      notify(error instanceof Error ? `重做标记更新失败：${error.message}` : "重做标记更新失败", "warning");
    }
  };

  const clearCurrentQuestionRecord = async () => {
    const hasSubjectiveDraft = q ? Object.keys(q.state.subjectiveDrafts ?? {}).length > 0 || Object.keys(subjectiveDrafts[q.id] ?? {}).length > 0 : false;
    if (!q || clearingRecord || (!q.state.isAnswered && !q.state.hasViewedAnswer && !q.state.isRedoMarked && !q.state.isMastered && !hasSubjectiveDraft)) return;
    const confirmed = window.confirm("确定清除本题练习记录吗？题目会回到未作答状态，主观题草稿会清空，收藏会保留。");
    if (!confirmed) return;

    const previousQuestion = q;
    setClearingRecord(true);
    try {
      const saved = await questionBankService.clearItemRecord(q.bookId, q.id);
      setApiQuestions(items => items.map(item => item.id === q.id ? saved : item));
      setSelected([]);
      setSubmitted(false);
      setResults(current => {
        const next = { ...current };
        delete next[q.id];
        return next;
      });
      setSubjectiveDrafts(current => {
        const next = { ...current };
        delete next[q.id];
        return next;
      });
      setExpandedSubjectiveAnalysis(current => {
        const next = { ...current };
        Object.keys(next).forEach(key => {
          if (key.startsWith(`${q.id}:`)) delete next[key];
        });
        return next;
      });
      notify("本题练习记录已清除", "success");
    } catch (error) {
      setApiQuestions(items => items.map(item => item.id === previousQuestion.id ? previousQuestion : item));
      notify(error instanceof Error ? `清除失败：${error.message}` : "清除失败", "warning");
    } finally {
      setClearingRecord(false);
    }
  };

  const selectSubject = (subject: QuestionBankSubject) => {
    if (!activeBook) return;
    const nextChapter = { bookId: activeBook.id, subjectId: subject.id, chapterId: subject.id, name: subject.name, paperType: activeBook.paperType };
    setRestoreQuestionId(undefined);
    setActiveChapter(nextChapter);
    syncQuestionPracticeUrl(mode, nextChapter, undefined);
  };

  const changePracticeMode = (nextMode: QuestionPracticeModeLabel) => {
    setRestoreQuestionId(undefined);
    setMode(nextMode);
    syncQuestionPracticeUrl(nextMode, activeChapter, undefined);
  };

  const goToQuestionIndex = (nextIndex: number) => {
    setRestoreQuestionId(undefined);
    setQIndex(Math.max(0, Math.min(nextIndex, apiQuestions.length - 1)));
  };

  const updateSubjectiveDraft = (blockId: string, value: string) => {
    if (!q || !currentQuestionId) return;
    const previousDrafts = subjectiveDrafts[currentQuestionId] ?? {};
    if ((previousDrafts[blockId] ?? "") === value) return;

    const nextDrafts = {
      ...previousDrafts,
      [blockId]: value,
    };
    Object.keys(nextDrafts).forEach((key) => {
      if (!nextDrafts[key]?.trim()) delete nextDrafts[key];
    });

    setSubjectiveDrafts(prev => ({
      ...prev,
      [currentQuestionId]: nextDrafts,
    }));
    setApiQuestions(items => items.map(item => item.id === q.id ? { ...item, state: { ...item.state, subjectiveDrafts: nextDrafts } } : item));
    setSavingDraftQuestionIds(prev => ({ ...prev, [currentQuestionId]: true }));

    const existingTimer = draftSaveTimersRef.current[currentQuestionId];
    if (existingTimer) window.clearTimeout(existingTimer);

    draftSaveTimersRef.current[currentQuestionId] = window.setTimeout(() => {
      questionBankService.updateItemState(q.bookId, q.id, { subjectiveDrafts: nextDrafts })
        .then((saved) => {
          setApiQuestions(items => items.map(item => item.id === saved.id ? saved : item));
          setSubjectiveDrafts(prev => ({ ...prev, [saved.id]: saved.state.subjectiveDrafts ?? {} }));
        })
        .catch((error) => {
          notify(error instanceof Error ? `草稿保存失败：${error.message}` : "草稿保存失败", "warning");
        })
        .finally(() => {
          delete draftSaveTimersRef.current[currentQuestionId];
          setSavingDraftQuestionIds(prev => ({ ...prev, [currentQuestionId]: false }));
        });
    }, 650);
  };

  const gotoSubjectiveBlock = (offset: number) => {
    if (subjectiveAnswerBlocks.length === 0) return;
    if (activeSubjectiveBlock && officialAnswerTextareaRef.current) {
      updateSubjectiveDraft(activeSubjectiveBlock.id, officialAnswerTextareaRef.current.value);
    }
    officialAnswerComposingRef.current = false;
    const nextIndex = Math.min(subjectiveAnswerBlocks.length - 1, Math.max(0, activeSubjectiveBlockIndex + offset));
    setActiveSubjectiveBlockId(subjectiveAnswerBlocks[nextIndex].id);
  };

  const toggleSubjectiveAnalysis = () => {
    if (!activeAnalysisKey) return;
    setExpandedSubjectiveAnalysis(prev => ({ ...prev, [activeAnalysisKey]: !prev[activeAnalysisKey] }));
  };

  const handleSubjectiveAnalysisClick = () => {
    if (!isSubmitted) {
      void handleSubmit();
      return;
    }
    toggleSubjectiveAnalysis();
  };

  const handleOfficialAnalysisClick = () => {
    if (!isSubmitted) {
      setOfficialOpenAnalysisAfterSubmit(true);
      void handleSubmit();
      return;
    }
    if (activeAnalysisKey) {
      setExpandedSubjectiveAnalysis(prev => ({ ...prev, [activeAnalysisKey]: true }));
    }
    setOfficialAnalysisDialogOpen(true);
  };

  const handleOfficialConfirmReveal = () => {
    setOfficialOpenAnalysisAfterSubmit(true);
    void handleSubmit();
  };

  const clearOfficialHighlightSelection = () => {
    officialHighlightSelectionRef.current = null;
    getOfficialSelectionFromNode(officialPromptRef.current ?? officialBlockPromptRef.current)?.removeAllRanges();
  };

  const buildOfficialHighlightSelection = (root: HTMLElement, range: Range, block: OfficialHighlightBlock, key: string) => {
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const start = getOfficialTextOffsetWithin(root, range.startContainer, range.startOffset);
    const end = getOfficialTextOffsetWithin(root, range.endContainer, range.endOffset);
    if (end <= start) return null;
    return { block, key, start, end } satisfies OfficialHighlightSelection;
  };

  const setOfficialPromptHighlightHtml = (questionId: string, nextHtml: string, baseHtml: string) => {
    setOfficialPromptHighlightHtmlMap((current) => {
      const next = { ...current };
      if (nextHtml === baseHtml) delete next[questionId];
      else next[questionId] = nextHtml;
      return next;
    });
  };

  const setOfficialBlockPromptHighlightHtml = (key: string, nextHtml: string, baseHtml: string) => {
    setOfficialBlockPromptHighlightHtmlMap((current) => {
      const next = { ...current };
      if (nextHtml === baseHtml) delete next[key];
      else next[key] = nextHtml;
      return next;
    });
  };

  const readOfficialHighlightSelection = () => {
    const selection = getOfficialSelectionFromNode(officialPromptRef.current ?? officialBlockPromptRef.current);
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    const promptRoot = officialPromptRef.current;
    if (promptRoot && currentQuestionId && promptRoot.contains(range.commonAncestorContainer)) {
      return buildOfficialHighlightSelection(promptRoot, range, "prompt", currentQuestionId);
    }

    const blockRoot = officialBlockPromptRef.current;
    if (blockRoot && officialActiveBlockPromptKey && blockRoot.contains(range.commonAncestorContainer)) {
      return buildOfficialHighlightSelection(blockRoot, range, "subjective-block", officialActiveBlockPromptKey);
    }
  };

  const handleOfficialQuestionMouseUp = () => {
    officialHighlightSelectionRef.current = readOfficialHighlightSelection() ?? null;
  };

  const getOfficialActiveHighlightSelection = () => {
    const liveSelection = readOfficialHighlightSelection();
    if (liveSelection) {
      officialHighlightSelectionRef.current = liveSelection;
      return liveSelection;
    }
    return officialHighlightSelectionRef.current;
  };

  const handleOfficialStemMark = () => {
    const selection = getOfficialActiveHighlightSelection();
    if (!selection) {
      notify("请先选中需要标识的题干内容", "warning");
      return;
    }

    if (selection.block === "prompt" && q && selection.key === q.id) {
      const normalizedHtml = clearOfficialHighlightInHtml(officialCurrentPromptDisplayHtml, selection.start, selection.end);
      const nextHtml = applyOfficialHighlightToHtml(normalizedHtml, selection.start, selection.end);
      setOfficialPromptHighlightHtml(q.id, nextHtml, officialCurrentPromptBaseHtml);
      clearOfficialHighlightSelection();
      return;
    }

    if (selection.block === "subjective-block" && activeSubjectiveBlock && officialActiveBlockPromptKey && selection.key === officialActiveBlockPromptKey) {
      const normalizedHtml = clearOfficialHighlightInHtml(officialCurrentBlockPromptDisplayHtml, selection.start, selection.end);
      const nextHtml = applyOfficialHighlightToHtml(normalizedHtml, selection.start, selection.end);
      setOfficialBlockPromptHighlightHtml(officialActiveBlockPromptKey, nextHtml, officialCurrentBlockPromptBaseHtml);
      clearOfficialHighlightSelection();
      return;
    }

    notify("当前选中内容不支持题干标识", "warning");
  };

  const handleOfficialStemUnmark = () => {
    const selection = getOfficialActiveHighlightSelection();

    if (selection?.block === "prompt" && q && selection.key === q.id) {
      const nextHtml = clearOfficialHighlightInHtml(officialCurrentPromptDisplayHtml, selection.start, selection.end);
      setOfficialPromptHighlightHtml(q.id, nextHtml, officialCurrentPromptBaseHtml);
      clearOfficialHighlightSelection();
      return;
    }

    if (selection?.block === "subjective-block" && activeSubjectiveBlock && officialActiveBlockPromptKey && selection.key === officialActiveBlockPromptKey) {
      const nextHtml = clearOfficialHighlightInHtml(officialCurrentBlockPromptDisplayHtml, selection.start, selection.end);
      setOfficialBlockPromptHighlightHtml(officialActiveBlockPromptKey, nextHtml, officialCurrentBlockPromptBaseHtml);
      clearOfficialHighlightSelection();
      return;
    }

    if (q && officialCurrentPromptDisplayHtml !== officialCurrentPromptBaseHtml) {
      setOfficialPromptHighlightHtml(q.id, clearOfficialHighlightInHtml(officialCurrentPromptDisplayHtml), officialCurrentPromptBaseHtml);
    }
    if (activeSubjectiveBlock && officialActiveBlockPromptKey && officialCurrentBlockPromptDisplayHtml !== officialCurrentBlockPromptBaseHtml) {
      setOfficialBlockPromptHighlightHtml(
        officialActiveBlockPromptKey,
        clearOfficialHighlightInHtml(officialCurrentBlockPromptDisplayHtml),
        officialCurrentBlockPromptBaseHtml,
      );
    }
    clearOfficialHighlightSelection();
  };

  useEffect(() => {
    if (!officialOpenAnalysisAfterSubmit || !useOfficialSubjectivePractice || !isSubjectiveQuestion || !isSubmitted) return;
    if (activeAnalysisKey) {
      setExpandedSubjectiveAnalysis(prev => ({ ...prev, [activeAnalysisKey]: true }));
    }
    setOfficialAnalysisDialogOpen(true);
    setOfficialOpenAnalysisAfterSubmit(false);
  }, [activeAnalysisKey, isSubmitted, isSubjectiveQuestion, officialOpenAnalysisAfterSubmit, useOfficialSubjectivePractice]);

  const startOfficialLawDialogDrag = (event: ReactMouseEvent<HTMLElement>) => {
    if (officialLawDialogMaximized) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = officialLawDialogRect;
    const handleMove = (moveEvent: MouseEvent) => {
      setOfficialLawDialogRect(current => {
        const maxLeft = Math.max(0, window.innerWidth - current.width);
        const maxTop = Math.max(0, window.innerHeight - current.height);
        return {
          ...current,
          left: Math.min(maxLeft, Math.max(0, startRect.left + moveEvent.clientX - startX)),
          top: Math.min(maxTop, Math.max(0, startRect.top + moveEvent.clientY - startY)),
        };
      });
    };
    const handleEnd = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
  };

  const startOfficialLawDialogResize = (event: ReactMouseEvent<HTMLElement>, mode: "right" | "bottom" | "corner") => {
    if (officialLawDialogMaximized) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = officialLawDialogRect;
    const handleMove = (moveEvent: MouseEvent) => {
      setOfficialLawDialogRect(() => {
        const maxWidth = Math.max(360, window.innerWidth - startRect.left);
        const maxHeight = Math.max(260, window.innerHeight - startRect.top);
        const nextWidth = mode === "bottom" ? startRect.width : startRect.width + moveEvent.clientX - startX;
        const nextHeight = mode === "right" ? startRect.height : startRect.height + moveEvent.clientY - startY;
        return {
          left: startRect.left,
          top: startRect.top,
          width: Math.min(maxWidth, Math.max(360, nextWidth)),
          height: Math.min(maxHeight, Math.max(260, nextHeight)),
        };
      });
    };
    const handleEnd = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
  };

  const toggleOfficialLawDialogMaximize = () => {
    if (officialLawDialogMaximized) {
      setOfficialLawDialogRect(officialLawDialogRestoreRectRef.current ?? createOfficialDialogRect());
      setOfficialLawDialogMaximized(false);
      return;
    }
    officialLawDialogRestoreRectRef.current = officialLawDialogRect;
    setOfficialLawDialogRect(createOfficialLawDialogMaxRect());
    setOfficialLawDialogMaximized(true);
  };

  const officialSubjectiveBlockDone = (blockId: string) => Boolean((currentSubjectiveDrafts[blockId] ?? "").trim());
  const officialSubjectiveQuestionDone = (item: QuestionBankItem) => {
    const draftMap = subjectiveDrafts[item.id] ?? item.state.subjectiveDrafts ?? {};
    if (Object.values(draftMap).some(value => `${value ?? ""}`.trim())) return true;
    return item.state.hasViewedAnswer || item.state.isAnswered;
  };
  const officialCurrentQuestionMarked = q?.state.isRedoMarked ?? false;
  const officialCurrentPromptBaseHtml = q ? officialToHtml(q.material && q.stem ? `${q.material}\n\n${q.stem}` : q.material || q.stem) : "";
  const officialCurrentPromptDisplayHtml = q ? officialPromptHighlightHtmlMap[q.id] ?? officialCurrentPromptBaseHtml : officialCurrentPromptBaseHtml;
  const officialCurrentBlockPromptBaseHtml = officialToHtml(activeSubjectiveBlock?.prompt || "");
  const officialCurrentBlockPromptDisplayHtml =
    officialActiveBlockPromptKey
      ? officialBlockPromptHighlightHtmlMap[officialActiveBlockPromptKey] ?? officialCurrentBlockPromptBaseHtml
      : officialCurrentBlockPromptBaseHtml;
  const officialCurrentBlockAnswer = activeSubjectiveBlock ? currentSubjectiveDrafts[activeSubjectiveBlock.id] ?? "" : "";

  if (loadingQuestions && banks.length === 0) {
    return (
      <div className="debao-question-practice-page debao-themed-page" style={{ minHeight: "calc(100vh - 58px)", display: "grid", placeItems: "center", background: "#090e1a", color: "#5a7898", fontSize: 14 }}>
        正在加载得宝题库...
      </div>
    );
  }

  if (questionError && banks.length === 0) {
    return (
      <div className="debao-question-practice-page debao-themed-page" style={{ minHeight: "calc(100vh - 58px)", display: "grid", placeItems: "center", background: "#090e1a", padding: 36 }}>
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#dde4f0", marginBottom: 10 }}>题库暂时无法打开</div>
          <div style={{ fontSize: 13, color: "#5a7898", lineHeight: 1.8, marginBottom: 18 }}>{questionError}</div>
          <button onClick={() => setPage("questionBankHome")} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#4e8ef7", color: "#fff", cursor: "pointer", fontWeight: 700 }}>返回题库首页</button>
        </div>
      </div>
    );
  }

  if (!q) {
    return (
      <div className="debao-question-practice-page debao-themed-page" style={{ minHeight: "calc(100vh - 58px)", display: "grid", placeItems: "center", background: "#090e1a", padding: 36 }}>
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#dde4f0", marginBottom: 10 }}>
            {mode === "只看错题" ? "还没有错题" : mode === "收藏题目" ? "还没有收藏题目" : "当前题库暂无题目"}
          </div>
          <div style={{ fontSize: 13, color: "#5a7898", lineHeight: 1.8, marginBottom: 18 }}>
            {mode === "只看错题" ? "完成练习后，答错或标记重做的题目会出现在这里。" : mode === "收藏题目" ? "在练习页点亮收藏后，题目会出现在这里。" : "当前题库暂时没有可练习题目。"}
          </div>
          <button onClick={() => setPage("questionBankHome")} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#4e8ef7", color: "#fff", cursor: "pointer", fontWeight: 700 }}>返回题库首页</button>
        </div>
      </div>
    );
  }

  if (useOfficialSubjectivePractice && isSubjectiveQuestion) {
    return (
      <OfficialExamShadowRoot>
        {practiceModal === "confirmReveal" && (
          <div {...OFFICIAL_EXAM_SCOPE} style={{ width: "100%", height: "100%", background: "rgba(128,128,128,0.8)", position: "fixed", left: "0px", top: "0px", overflow: "hidden", userSelect: "none", zIndex: 1024 }}>
            <div {...OFFICIAL_EXAM_SCOPE} className="ui-popup ui-popup-modal ui-popup-show ui-popup-focus" style={{ position: "absolute", outline: "0px", left: 0, top: 0, bottom: 0, right: 0, margin: "auto", zIndex: 1024 }} tabIndex={1} role="alertdialog">
              <div {...OFFICIAL_EXAM_SCOPE} className="dialog_main" style={{ display: "block" }}>
                <div {...OFFICIAL_EXAM_SCOPE} className="dialog_bt" />
                <div {...OFFICIAL_EXAM_SCOPE} className="dialog_img" />
                <div {...OFFICIAL_EXAM_SCOPE} className="dialog_content">
                  <li {...OFFICIAL_EXAM_SCOPE} className="dialog_text"><font {...OFFICIAL_EXAM_SCOPE} color="red"><span {...OFFICIAL_EXAM_SCOPE}><p {...OFFICIAL_EXAM_SCOPE}>还没有填写作答内容</p><p {...OFFICIAL_EXAM_SCOPE}>建议先作答后再查看解析。</p><br {...OFFICIAL_EXAM_SCOPE} /></span></font></li>
                  <li {...OFFICIAL_EXAM_SCOPE}><div {...OFFICIAL_EXAM_SCOPE} className="dialog_button" id="auto_sbm_btn"><button {...OFFICIAL_EXAM_SCOPE} type="button" onClick={() => { setOfficialOpenAnalysisAfterSubmit(false); setPracticeModal(null); }}>返回作答</button><button {...OFFICIAL_EXAM_SCOPE} type="button" disabled={submittingAnswer} onClick={handleOfficialConfirmReveal}>{submittingAnswer ? "加载中..." : "继续查看"}</button></div></li>
                </div>
              </div>
            </div>
          </div>
        )}

        <div {...OFFICIAL_EXAM_SCOPE} id="layout" style={{ background: OFFICIAL_THEME_BG[officialThemeId] }}>
          <div {...OFFICIAL_EXAM_SCOPE} id="header">
            <div {...OFFICIAL_EXAM_SCOPE} className="infoNav">
              <ul {...OFFICIAL_EXAM_SCOPE}>
                <li {...OFFICIAL_EXAM_SCOPE} style={{ width: 58 }}>
                  <img {...OFFICIAL_EXAM_SCOPE} src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="45" height="60" alt="" />
                </li>
                <li {...OFFICIAL_EXAM_SCOPE}>
                  姓&nbsp;名：<span {...OFFICIAL_EXAM_SCOPE} id="ksxm">xxx</span><br {...OFFICIAL_EXAM_SCOPE} />
                  性&nbsp;别：<span {...OFFICIAL_EXAM_SCOPE} id="ksxb">女</span><br {...OFFICIAL_EXAM_SCOPE} />
                  准考证号&nbsp;：<span {...OFFICIAL_EXAM_SCOPE}>0000000000</span><br {...OFFICIAL_EXAM_SCOPE} />
                  身份证号:&nbsp;<span {...OFFICIAL_EXAM_SCOPE}>000000000000000000</span>
                </li>
              </ul>
            </div>
            <div {...OFFICIAL_EXAM_SCOPE} className="clockNav">
              <ul {...OFFICIAL_EXAM_SCOPE}>
                <li {...OFFICIAL_EXAM_SCOPE} className="clockNav_m"><div {...OFFICIAL_EXAM_SCOPE}>考试剩余时间:<span {...OFFICIAL_EXAM_SCOPE} id="clock">--:--:--</span></div></li>
                <li {...OFFICIAL_EXAM_SCOPE}><input {...OFFICIAL_EXAM_SCOPE} className="submitbutton debao-analysis-button" id="submitbtn" name="查看解析" type="button" value="查看解析" onClick={handleOfficialAnalysisClick} /></li>
              </ul>
            </div>
            <div {...OFFICIAL_EXAM_SCOPE} className="subjectNav">
              <span {...OFFICIAL_EXAM_SCOPE} className="prname" id="projectName">国家统一法律职业资格考试计算机化考试模拟答题系统</span><br {...OFFICIAL_EXAM_SCOPE} />
              <span {...OFFICIAL_EXAM_SCOPE} id="subjectName">{activeBook?.name || "得宝我的题库"} - {activeChapter?.name || q.subjectName || "主观题"}</span>
            </div>
          </div>

          <div {...OFFICIAL_EXAM_SCOPE} id="main">
            <div {...OFFICIAL_EXAM_SCOPE} id="leftnav" style={{ width: `${officialLeftNavOpen ? 384 : 0}px` }}>
              <div {...OFFICIAL_EXAM_SCOPE} id="itembar">
                <div {...OFFICIAL_EXAM_SCOPE} id="papernav">
                  <ul {...OFFICIAL_EXAM_SCOPE} id="P-sj2" style={{ display: "block" }}>
                    <li {...OFFICIAL_EXAM_SCOPE}>
                      <p {...OFFICIAL_EXAM_SCOPE}>
                        <a {...OFFICIAL_EXAM_SCOPE} href="#!" onClick={(event) => event.preventDefault()}>&nbsp;&nbsp;{officialOrderText(0)}{activeChapter?.name || q.subjectName || "主观题"}</a>
                      </p>
                      <div {...OFFICIAL_EXAM_SCOPE} className="subitem" style={{ display: "block" }}>
                        {apiQuestions.map((item, index) => {
                          const answered = officialSubjectiveQuestionDone(item);
                          const marked = item.state.isRedoMarked;
                          return (
                            <span {...OFFICIAL_EXAM_SCOPE} key={item.id}>
                              <span {...OFFICIAL_EXAM_SCOPE}>
                                <a
                                  {...OFFICIAL_EXAM_SCOPE}
                                  href="#!"
                                  style={answered ? { color: "green" } : undefined}
                                  onClick={(event) => { event.preventDefault(); goToQuestionIndex(index); }}
                                >
                                  {" "}{index + 1}{marked ? <span {...OFFICIAL_EXAM_SCOPE} style={{ color: "red" }}>?</span> : !answered ? <span {...OFFICIAL_EXAM_SCOPE} style={{ color: "red" }}>*</span> : null}
                                </a>
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </li>
                  </ul>
                </div>

                <div {...OFFICIAL_EXAM_SCOPE} className="submark">
                  说明：<br {...OFFICIAL_EXAM_SCOPE} />
                  1.主观题考试设置选作题的，应试人员可选择其一作答。<br {...OFFICIAL_EXAM_SCOPE} />
                  2.题号右方的“*”符号代表该题尚未作答。<br {...OFFICIAL_EXAM_SCOPE} />
                  3.题号右方的“?”符号代表该题做过标记。<br {...OFFICIAL_EXAM_SCOPE} />
                  4.作答的同时系统自动保存答案。
                  <div {...OFFICIAL_EXAM_SCOPE} style={{ textAlign: "center", marginTop: "13px" }}>
                    <button
                      {...OFFICIAL_EXAM_SCOPE}
                      type="button"
                      style={{ padding: "7px 12px", fontWeight: 600, fontSize: "14px", color: "black", background: "linear-gradient(#9bccf3, #478ec4)", border: "1px solid #5d8ab6", cursor: "pointer" }}
                      onClick={() => {
                        setOfficialLawDialogMaximized(false);
                        setOfficialLawDialogOpen(true);
                      }}
                    >
                      法律法规汇编
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div {...OFFICIAL_EXAM_SCOPE} className="middlebar" onClick={() => setOfficialLeftNavOpen((current) => !current)}><input {...OFFICIAL_EXAM_SCOPE} className={officialLeftNavOpen ? "" : "hidden"} type="button" id="navbtn" readOnly /></div>

            <div {...OFFICIAL_EXAM_SCOPE} id="container">
              <div {...OFFICIAL_EXAM_SCOPE} id="question_frame2" style={{ height: "80%" }}>
                <div {...OFFICIAL_EXAM_SCOPE} id="sjHtml" style={{ paddingTop: "10px", paddingLeft: "10px" }}>
                  <div {...OFFICIAL_EXAM_SCOPE} id="sjHtml2">
                    <div {...OFFICIAL_EXAM_SCOPE} className="paperTitle">
                      <li {...OFFICIAL_EXAM_SCOPE} id="themeLi" onMouseEnter={() => setOfficialThemeMenuOpen(true)} onMouseLeave={() => setOfficialThemeMenuOpen(false)}>
                        <a {...OFFICIAL_EXAM_SCOPE} id="themeP">切换风格</a>
                        {([1, 2, 3, 4, 5] as OfficialThemeId[]).map((id) => (
                          <div {...OFFICIAL_EXAM_SCOPE} className="theme" id={`theme${id}`} key={id} style={{ display: officialThemeMenuOpen ? "block" : "none" }} onClick={() => setOfficialThemeId(id)}>
                            风格{["一", "二", "三", "四", "五"][id - 1]}
                          </div>
                        ))}
                      </li>
                    </div>

                    <div {...OFFICIAL_EXAM_SCOPE} id={`Ii-${qIndex}`}>
                      {officialStemHeight === "300px" ? (
                        <div {...OFFICIAL_EXAM_SCOPE} className="itemGroupTitle zhuguanTitle">
                          {officialOrderText(0)}{activeChapter?.name || q.subjectName || "主观题"}。(本题{q.score || 0}分)
                          <li {...OFFICIAL_EXAM_SCOPE} className="rightFloat">
                            <a {...OFFICIAL_EXAM_SCOPE} target="_self" id="mark1" href="#!" onMouseDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); handleOfficialStemMark(); }}>题干标识</a>
                            <a {...OFFICIAL_EXAM_SCOPE} target="_self" id="unmark1" href="#!" onMouseDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); handleOfficialStemUnmark(); }}>取消标识</a>
                            {officialAnswerHeight === "340px" ? (
                              <a {...OFFICIAL_EXAM_SCOPE} target="_self" href="#!" onClick={(event) => { event.preventDefault(); setOfficialAnswerHeight("100%"); }}>放大窗口</a>
                            ) : (
                              <a {...OFFICIAL_EXAM_SCOPE} target="_self" href="#!" onClick={(event) => { event.preventDefault(); setOfficialAnswerHeight("340px"); }}>缩小窗口</a>
                            )}
                          </li>
                        </div>
                      ) : null}
                      {officialStemHeight === "300px" ? (
                        <div {...OFFICIAL_EXAM_SCOPE} className="zhuGuan" style={{ height: officialAnswerHeight }}>
                          <div {...OFFICIAL_EXAM_SCOPE} className="itemContext" ref={officialPromptRef} onMouseUp={handleOfficialQuestionMouseUp}>
                            <span {...OFFICIAL_EXAM_SCOPE} style={{ fontSize: `${officialFontSize}px` }} dangerouslySetInnerHTML={{ __html: officialCurrentPromptDisplayHtml }} />
                          </div>
                        </div>
                      ) : null}
                      {officialAnswerHeight === "340px" ? (
                        <div {...OFFICIAL_EXAM_SCOPE} id="answerArea">
                          <div {...OFFICIAL_EXAM_SCOPE} className=" partingTitle ">
                            {subjectiveAnswerBlocks.map((block, index) => (
                              <li {...OFFICIAL_EXAM_SCOPE} className={activeSubjectiveBlockIndex === index ? "bewrite active2" : "bewrite"} id="bewrite03" key={block.id} onClick={() => { if (activeSubjectiveBlock && officialAnswerTextareaRef.current) updateSubjectiveDraft(activeSubjectiveBlock.id, officialAnswerTextareaRef.current.value); officialAnswerComposingRef.current = false; setActiveSubjectiveBlockId(block.id); }}>
                                {subjectiveAnswerBlocks.length === 1 ? "问题" : `问题(${index + 1})`}{officialSubjectiveBlockDone(block.id) ? null : <b {...OFFICIAL_EXAM_SCOPE} id="add03"> *</b>}
                              </li>
                            ))}
                            <li {...OFFICIAL_EXAM_SCOPE} className="tip" style={{ fontSize: "15.5px", fontWeight: "bold", marginTop: "8px" }}>请在对应的答题区域内答题！</li>
                            <li {...OFFICIAL_EXAM_SCOPE} className="rightFloat">
                              <a {...OFFICIAL_EXAM_SCOPE} target="_self" id="undo" href="#!" onClick={(event) => event.preventDefault()}>撤销</a>
                              <a {...OFFICIAL_EXAM_SCOPE} target="_self" id="redo" href="#!" onClick={(event) => event.preventDefault()}>恢复</a>
                              <a {...OFFICIAL_EXAM_SCOPE} target="_self" id="copy1" href="#!" onClick={(event) => event.preventDefault()}>复制</a>
                              <a {...OFFICIAL_EXAM_SCOPE} target="_self" id="shear" href="#!" onClick={(event) => event.preventDefault()}>剪切</a>
                              <a {...OFFICIAL_EXAM_SCOPE} target="_self" id="paste1" href="#!" onClick={(event) => event.preventDefault()}>粘贴</a>
                              {officialStemHeight === "300px" ? (
                                <a {...OFFICIAL_EXAM_SCOPE} target="_self" id="zoomwindow1" href="#!" onClick={(event) => { event.preventDefault(); setOfficialStemHeight("100%"); }}>放大窗口</a>
                              ) : (
                                <a {...OFFICIAL_EXAM_SCOPE} target="_self" id="zoomwindow1" href="#!" onClick={(event) => { event.preventDefault(); setOfficialStemHeight("300px"); }}>缩小窗口</a>
                              )}
                            </li>
                          </div>
                          <div {...OFFICIAL_EXAM_SCOPE} className="windowOverflow" id="window03">
                            {activeSubjectiveBlock ? (
                              <div {...OFFICIAL_EXAM_SCOPE} className="itemArea" id="B-1" itemcode="1">
                                <div {...OFFICIAL_EXAM_SCOPE} id="msTitle">
                                  <p {...OFFICIAL_EXAM_SCOPE} ref={officialBlockPromptRef} onMouseUp={handleOfficialQuestionMouseUp} className="zhuguanProblem" dangerouslySetInnerHTML={{ __html: officialCurrentBlockPromptDisplayHtml }} />
                                  <p {...OFFICIAL_EXAM_SCOPE} className="spanBold">请在下方答题区内答题! <span {...OFFICIAL_EXAM_SCOPE} style={{ color: "red" }} id="fontnum_3">已输入字数为：{officialCurrentBlockAnswer.length}</span></p>
                                </div>
                                <textarea
                                  {...OFFICIAL_EXAM_SCOPE}
                                  key={`${currentQuestionId}:${activeSubjectiveBlock.id}`}
                                  className="textAreaWh"
                                  id="textArea02"
                                  ref={officialAnswerTextareaRef}
                                  defaultValue={officialCurrentBlockAnswer}
                                  onCompositionStart={() => { officialAnswerComposingRef.current = true; }}
                                  onCompositionEnd={(event) => {
                                    officialAnswerComposingRef.current = false;
                                    updateSubjectiveDraft(activeSubjectiveBlock.id, event.currentTarget.value);
                                  }}
                                  onChange={(event) => {
                                    if (officialAnswerComposingRef.current) return;
                                    updateSubjectiveDraft(activeSubjectiveBlock.id, event.currentTarget.value);
                                  }}
                                  onBlur={(event) => updateSubjectiveDraft(activeSubjectiveBlock.id, event.currentTarget.value)}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div {...OFFICIAL_EXAM_SCOPE} id="footer">
                <span {...OFFICIAL_EXAM_SCOPE} className="debao-extra-footer-actions">
                  <button {...OFFICIAL_EXAM_SCOPE} type="button" onClick={() => setPage("myQuestionBank")}>选科</button>
                  <button {...OFFICIAL_EXAM_SCOPE} type="button" className={q.state.isBookmarked ? "active" : ""} onClick={toggleBookmark}>收藏</button>
                </span>
                <label {...OFFICIAL_EXAM_SCOPE} style={{ fontWeight: "normal" }} htmlFor="testflag"><input {...OFFICIAL_EXAM_SCOPE} style={{ width: "16px", height: "16px", verticalAlign: "middle" }} name="testflag" id="testflag" type="checkbox" checked={officialCurrentQuestionMarked} onChange={() => void toggleRedoMarked()} /> 标记&nbsp;</label>
                <button {...OFFICIAL_EXAM_SCOPE} id="prevbtn" name="上一题" type="button" disabled={qIndex <= 0} onClick={handlePrev}>上一题</button>
                <span {...OFFICIAL_EXAM_SCOPE}>
                  <button {...OFFICIAL_EXAM_SCOPE} style={{ marginLeft: "20px" }} name="上一问" type="button" disabled={activeSubjectiveBlockIndex <= 0} onClick={() => gotoSubjectiveBlock(-1)}>上一问</button>
                  <button {...OFFICIAL_EXAM_SCOPE} style={{ marginLeft: "20px", marginRight: "20px" }} name="下一问" type="button" disabled={activeSubjectiveBlockIndex >= subjectiveAnswerBlocks.length - 1} onClick={() => gotoSubjectiveBlock(1)}>下一问</button>
                </span>
                <button {...OFFICIAL_EXAM_SCOPE} id="nextbtn" name="下一题" type="button" disabled={qIndex >= apiQuestions.length - 1} onClick={handleNext}>下一题</button>
              </div>
            </div>
          </div>
          {officialLawDialogOpen ? (
            <div
              {...OFFICIAL_EXAM_SCOPE}
              className="dialogOut debao-resizable-dialog"
              style={{
                left: officialLawDialogRect.left,
                top: officialLawDialogRect.top,
                width: officialLawDialogRect.width,
                height: officialLawDialogRect.height,
                zIndex: 1010,
                backgroundColor: "#fff",
                overflow: "hidden",
              }}
            >
              <div {...OFFICIAL_EXAM_SCOPE} className="wind-head" onMouseDown={startOfficialLawDialogDrag}>
                <span {...OFFICIAL_EXAM_SCOPE}>法律法规汇编</span>
                <button
                  {...OFFICIAL_EXAM_SCOPE}
                  type="button"
                  onClick={() => setOfficialLawDialogOpen(false)}
                  onMouseDown={(event) => event.stopPropagation()}
                  style={{
                    position: "relative",
                    zIndex: 260,
                    width: "28px",
                    height: "28px",
                    border: "none",
                    background: "transparent",
                    color: "#606266",
                    cursor: "pointer",
                    fontSize: "18px",
                    lineHeight: "28px",
                    padding: 0,
                    textAlign: "center",
                  }}
                >
                  ×
                </button>
              </div>
              <div {...OFFICIAL_EXAM_SCOPE} style={{ position: "absolute", left: 0, right: 0, top: "41px", bottom: 0, background: "#fff", overflow: "hidden" }}>
                <DebaoLawSearchPage
                  setPage={() => setOfficialLawDialogOpen(false)}
                  embedded
                  onClose={() => setOfficialLawDialogOpen(false)}
                  fullscreenBridge={{ isFullscreen: officialLawDialogMaximized, toggleFullscreen: toggleOfficialLawDialogMaximize }}
                />
              </div>
              {officialLawDialogMaximized ? null : (
                <>
                  <div {...OFFICIAL_EXAM_SCOPE} className="debao-resize-edge-right" onMouseDown={(event) => startOfficialLawDialogResize(event, "right")} />
                  <div {...OFFICIAL_EXAM_SCOPE} className="debao-resize-edge-bottom" onMouseDown={(event) => startOfficialLawDialogResize(event, "bottom")} />
                  <div {...OFFICIAL_EXAM_SCOPE} className="debao-resize-grip" onMouseDown={(event) => startOfficialLawDialogResize(event, "corner")} />
                </>
              )}
            </div>
          ) : null}
          {officialAnalysisDialogOpen ? (
            <div
              {...OFFICIAL_EXAM_SCOPE}
              className="dialogOut"
              style={{
                left: "22%",
                top: "9%",
                width: "56%",
                height: "78%",
                zIndex: 920,
                backgroundColor: "#fff",
                overflow: "hidden",
              }}
            >
              <div {...OFFICIAL_EXAM_SCOPE} className="wind-head">
                <span {...OFFICIAL_EXAM_SCOPE}>查看解析</span>
                <button
                  {...OFFICIAL_EXAM_SCOPE}
                  type="button"
                  onClick={() => setOfficialAnalysisDialogOpen(false)}
                  style={{ border: "none", background: "transparent", color: "#606266", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
              <div {...OFFICIAL_EXAM_SCOPE} className="debao-analysis-dialog-body">
                {subjectiveAnswerBlocks.length > 1 ? (
                  <div {...OFFICIAL_EXAM_SCOPE} className="debao-analysis-tabs">
                    {subjectiveAnswerBlocks.map((block, index) => (
                      <button
                        {...OFFICIAL_EXAM_SCOPE}
                        key={block.id}
                        type="button"
                        className={activeSubjectiveBlock?.id === block.id ? "active" : ""}
                        onClick={() => setActiveSubjectiveBlockId(block.id)}
                      >
                        第{index + 1}问
                      </button>
                    ))}
                  </div>
                ) : null}
                {q.lessonAudioUrl ? (
                  <div {...OFFICIAL_EXAM_SCOPE} className="analysis-section debao-analysis-audio">
                    <h4 {...OFFICIAL_EXAM_SCOPE}>题目音频</h4>
                    <audio {...OFFICIAL_EXAM_SCOPE} controls src={q.lessonAudioUrl} preload="metadata" />
                  </div>
                ) : null}
                <div {...OFFICIAL_EXAM_SCOPE} className="analysis-section">
                  <h4 {...OFFICIAL_EXAM_SCOPE}>{activeSubjectiveBlock?.title || "当前小问"}</h4>
                  {activeSubjectiveBlock?.prompt ? (
                    <div {...OFFICIAL_EXAM_SCOPE} dangerouslySetInnerHTML={{ __html: officialToHtml(activeSubjectiveBlock.prompt) }} />
                  ) : (
                    <div {...OFFICIAL_EXAM_SCOPE} className="analysis-empty">当前小问未配置单独题目说明。</div>
                  )}
                </div>
                <div {...OFFICIAL_EXAM_SCOPE} className="analysis-section">
                  <h4 {...OFFICIAL_EXAM_SCOPE}>参考答案</h4>
                  {activeSubjectiveBlock?.referenceAnswer ? (
                    <div {...OFFICIAL_EXAM_SCOPE} dangerouslySetInnerHTML={{ __html: officialToHtml(activeSubjectiveBlock.referenceAnswer) }} />
                  ) : (
                    <div {...OFFICIAL_EXAM_SCOPE} className="analysis-empty">本小问暂未配置参考答案。</div>
                  )}
                </div>
                <div {...OFFICIAL_EXAM_SCOPE} className="analysis-section">
                  <h4 {...OFFICIAL_EXAM_SCOPE}>解析</h4>
                  {activeSubjectiveBlock?.analysis || q.analysis ? (
                    <div {...OFFICIAL_EXAM_SCOPE} dangerouslySetInnerHTML={{ __html: officialToHtml(activeSubjectiveBlock?.analysis || q.analysis) }} />
                  ) : (
                    <div {...OFFICIAL_EXAM_SCOPE} className="analysis-empty">本题暂未配置解析。</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </OfficialExamShadowRoot>
    );
  }

  return (
    <div className="debao-question-practice-page debao-themed-page" style={{ minHeight: "100vh", background: "#090e1a", display: "flex", flexDirection: "column" }}>
      {/* Breadcrumb */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1340, margin: "0 auto", padding: "10px 36px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3a5570" }}>
          <span style={{ cursor: "pointer", color: "#4e8ef7" }} onClick={() => { setPage("home"); setActiveNav(0); }}>首页</span>
          <ChevronRight size={12} />
          <span>题库练习</span>
          {activeBook && <><ChevronRight size={12} /><span style={{ color: "#5a7898" }}>{activeBook.name}</span></>}
          {activeChapter && <><ChevronRight size={12} /><span style={{ color: "#5a7898" }}>{activeChapter.name}</span></>}
        </div>
      </div>

      {practiceModal === "confirmReveal" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(3,7,13,0.72)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }} onClick={() => setPracticeModal(null)}>
          <div style={{ width: 430, maxWidth: "calc(100vw - 56px)", background: "#0f1826", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,0.45)", padding: 24, textAlign: "center" }} onClick={event => event.stopPropagation()}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(201,151,62,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Search size={24} color="#c9973e" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#dde4f0", marginBottom: 8 }}>还没有填写作答内容</div>
            <div style={{ fontSize: 13, color: "#5a7898", lineHeight: 1.8, marginBottom: 18 }}>建议先写完自己的答案再查看参考答案。继续查看后，本题会记录为“已看解析”。</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => setPracticeModal(null)} style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", color: "#8fa3be", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>先去作答</button>
              <button onClick={handleSubmit} disabled={submittingAnswer} style={{ padding: "11px 14px", borderRadius: 10, border: "none", background: "linear-gradient(90deg,#4e8ef7,#6aa8ff)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: submittingAnswer ? "not-allowed" : "pointer" }}>{submittingAnswer ? "加载中..." : "继续查看"}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "260px 1fr 280px", maxWidth: 1340, margin: "0 auto", width: "100%", padding: "0 36px", gap: 0 }}>

        {/* ── LEFT: Subject tree ── */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.05)", padding: "20px 0 40px", overflowY: "auto", height: "calc(100vh - 100px)", position: "sticky", top: 58 }}>
          {/* Mode selector */}
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {(["顺序练习", "随机练习", "只看错题", "收藏题目"] as const).map(m => (
                <button key={m} onClick={() => changePracticeMode(m)} style={{ padding: "7px 4px", borderRadius: 9, fontSize: 11, border: `1px solid ${mode === m ? "rgba(201,151,62,0.4)" : "rgba(255,255,255,0.06)"}`, cursor: "pointer", background: mode === m ? "rgba(201,151,62,0.1)" : "transparent", color: mode === m ? "#c9973e" : "#3a5570", fontWeight: mode === m ? 600 : 400, transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  {m === "顺序练习" && <ListFilter size={11} />}
                  {m === "随机练习" && <Shuffle size={11} />}
                  {m === "只看错题" && <X size={11} />}
                  {m === "收藏题目" && <Bookmark size={11} />}
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 12 }} />

          {/* Subject tree */}
          {activeBook?.subjects.map(sub => {
            const isOpen = expandedSubjects.includes(sub.id);
            const pct = sub.progress.progressPercent;
            return (
              <div key={sub.id}>
                {/* Subject row */}
                <button onClick={() => toggleSubject(sub.id)}
                  style={{ width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: sub.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#c8d8ee" }}>{sub.name}</span>
                      <span style={{ fontSize: 10, color: "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>{pct}%</span>
                    </div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: sub.color, borderRadius: 2 }} />
                    </div>
                  </div>
                  <ChevronDown size={13} color="#2e4260" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0 }} />
                </button>

                {/* Chapters */}
                {isOpen && (
                    <button key={sub.id} onClick={() => selectSubject(sub)}
                      style={{ width: "100%", padding: "8px 16px 8px 34px", display: "flex", alignItems: "center", gap: 8, background: activeChapter?.subjectId === sub.id ? `${sub.color}10` : "none", border: "none", borderLeft: activeChapter?.subjectId === sub.id ? `2px solid ${sub.color}` : "2px solid transparent", cursor: "pointer", textAlign: "left", transition: "all 0.12s" }}
                      onMouseEnter={e => { if (activeChapter?.subjectId !== sub.id) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
                      onMouseLeave={e => { if (activeChapter?.subjectId !== sub.id) (e.currentTarget as HTMLElement).style.background = "none"; }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: activeChapter?.subjectId === sub.id ? "#dde4f0" : "#5a7898", marginBottom: 3, fontWeight: activeChapter?.subjectId === sub.id ? 600 : 400 }}>{sub.name}</div>
                        <div style={{ fontSize: 10, color: "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>{sub.progress.answeredCount}/{sub.progress.totalCount} 题</div>
                      </div>
                      {sub.progress.totalCount > 0 && sub.progress.answeredCount === sub.progress.totalCount && <CheckCheck size={12} color="#1dc9a4" />}
                    </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── CENTER: Question ── */}
        <div style={{ padding: isSubjectiveQuestion ? "18px 20px 24px" : "24px 28px 48px", overflowY: isSubjectiveQuestion ? "hidden" : "auto", minHeight: "calc(100vh - 100px)", height: isSubjectiveQuestion ? "calc(100vh - 100px)" : "auto", display: "flex", flexDirection: "column" }}>
          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isSubjectiveQuestion ? 14 : 24, flexShrink: 0 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#2e4260" }}>
              第 {qIndex + 1} / {apiQuestions.length} 题
            </span>
            <div style={{ display: "flex", gap: 7 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(78,142,247,0.12)", color: "#4e8ef7" }}>{q.typeLabel}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${diffColor(q.difficulty)}15`, color: diffColor(q.difficulty) }}>{diffLabel(q.difficulty)}</span>
              {q.yearLabel && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#3a5570" }}>{q.yearLabel}</span>}
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#3a5570" }}>{q.subjectName || activeChapter?.name}</span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button onClick={toggleBookmark}
                style={{ width: 32, height: 32, borderRadius: 8, background: q.state.isBookmarked ? "rgba(201,151,62,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${q.state.isBookmarked ? "rgba(201,151,62,0.3)" : "rgba(255,255,255,0.07)"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bookmark size={14} color={q.state.isBookmarked ? "#c9973e" : "#3a5570"} fill={q.state.isBookmarked ? "#c9973e" : "none"} />
              </button>
              <button onClick={toggleRedoMarked}
                style={{ width: 32, height: 32, borderRadius: 8, background: q.state.isRedoMarked ? "rgba(247,110,110,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${q.state.isRedoMarked ? "rgba(247,110,110,0.3)" : "rgba(255,255,255,0.07)"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Flag size={14} color={q.state.isRedoMarked ? "#f76e6e" : "#3a5570"} fill={q.state.isRedoMarked ? "#f76e6e" : "none"} />
              </button>
            </div>
          </div>

          {!isSubjectiveQuestion ? (
            <>
              {/* Question text */}
              <div style={{ background: "#0f1826", borderRadius: 16, padding: "24px 26px", marginBottom: 18, border: "1px solid rgba(255,255,255,0.06)" }}>
                {q.material && <p style={{ fontSize: 13, color: "#8fa3be", lineHeight: 1.8, marginBottom: 14, whiteSpace: "pre-wrap" }}>{q.material}</p>}
                <p style={{ fontSize: 15, color: "#dde4f0", lineHeight: 1.9, fontFamily: "'Noto Serif SC',serif", whiteSpace: "pre-wrap" }}>{q.stem}</p>
                {q.typeLabel === "多选" && <div style={{ marginTop: 10, fontSize: 11, color: "#c9973e", display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#c9973e", display: "inline-block" }} />多选题，请选择所有正确答案</div>}
              </div>

              {/* Options */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {q.options.map(opt => (
                  <button key={opt.key} onClick={() => selectOption(opt.key)} style={optionStyle(opt.key)}>
                    <div style={keyCircleStyle(opt.key)}>{opt.key}</div>
                    <span style={{ flex: 1 }}>{opt.text}</span>
                    {isSubmitted && currentAnswer.includes(opt.key) && <CheckCheck size={15} style={{ flexShrink: 0, marginTop: 3 }} />}
                    {isSubmitted && !currentAnswer.includes(opt.key) && selected.includes(opt.key) && <X size={15} style={{ flexShrink: 0, marginTop: 3 }} />}
                  </button>
                ))}
              </div>

              {/* Submit / Next */}
              {!isSubmitted ? (
                <button onClick={handleSubmit}
                  style={{ width: "100%", padding: "13px", borderRadius: 13, fontSize: 14, fontWeight: 700, cursor: selected.length && !submittingAnswer ? "pointer" : "not-allowed", border: "none", background: selected.length ? "linear-gradient(90deg,#4e8ef7,#6aa8ff)" : "rgba(255,255,255,0.04)", color: selected.length ? "#fff" : "#2e4260", boxShadow: selected.length ? "0 4px 20px rgba(78,142,247,0.3)" : "none", transition: "all 0.2s" }}>
                  {submittingAnswer ? "提交中..." : "确认答案"}
                </button>
              ) : (
                <div>
                  <div style={{ padding: "14px 20px", borderRadius: 13, marginBottom: 16, background: isCorrect ? "rgba(29,201,164,0.08)" : "rgba(247,110,110,0.08)", border: `1px solid ${isCorrect ? "rgba(29,201,164,0.25)" : "rgba(247,110,110,0.25)"}`, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: isCorrect ? "rgba(29,201,164,0.15)" : "rgba(247,110,110,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isCorrect ? <CheckCheck size={18} color="#1dc9a4" /> : <X size={18} color="#f76e6e" />}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isCorrect ? "#1dc9a4" : "#f76e6e", marginBottom: 2 }}>{isCorrect ? "回答正确 ✓" : "回答错误 ✗"}</div>
                      <div style={{ fontSize: 12, color: "#3a5570" }}>{`正确答案：${currentAnswer.join("、") || "暂未返回"}`}</div>
                    </div>
                  </div>

                  <div style={{ background: "#0f1826", borderRadius: 13, padding: "18px 22px", marginBottom: 18, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 3, height: 13, borderRadius: 2, background: "linear-gradient(to bottom,#4e8ef7,#4e8ef755)" }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#dde4f0" }}>解析</span>
                    </div>
                    <p style={{ fontSize: 13, color: "#5a7898", lineHeight: 1.9 }}>{q.analysis || "本题暂未配置解析。"}</p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button onClick={handlePrev} disabled={qIndex === 0}
                      style={{ padding: "12px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: qIndex === 0 ? "not-allowed" : "pointer", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: qIndex === 0 ? "#1e3050" : "#5a7898", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <ChevronLeft size={15} /> 上一题
                    </button>
                    <button onClick={handleNext} disabled={qIndex === apiQuestions.length - 1}
                      style={{ padding: "12px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: qIndex === apiQuestions.length - 1 ? "not-allowed" : "pointer", border: "none", background: qIndex < apiQuestions.length - 1 ? "linear-gradient(90deg,#4e8ef7,#6aa8ff)" : "rgba(255,255,255,0.04)", color: qIndex < apiQuestions.length - 1 ? "#fff" : "#2e4260", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: qIndex < apiQuestions.length - 1 ? "0 4px 16px rgba(78,142,247,0.25)" : "none" }}>
                      下一题 <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateRows: "minmax(160px, 0.42fr) minmax(260px, 0.58fr) auto", gap: 12 }}>
              <div style={{ minHeight: 0, background: "#0f1826", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(to bottom,#4e8ef7,#4e8ef755)" }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#dde4f0" }}>题干材料</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                  {q.material ? <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#8fa3be", lineHeight: 1.85, marginBottom: 14 }}>{q.material}</div> : null}
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 15, color: "#dde4f0", lineHeight: 1.95, fontFamily: "'Noto Serif SC',serif" }}>{q.stem}</div>
                </div>
              </div>

              <div style={{ minHeight: 0, background: "#0f1826", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(to bottom,#1dc9a4,#1dc9a455)" }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#dde4f0", flexShrink: 0 }}>小问作答</span>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", flex: 1, minWidth: 0 }}>
                    {subjectiveAnswerBlocks.map((block, index) => {
                      const active = activeSubjectiveBlock?.id === block.id;
                      const hasDraft = Boolean((currentSubjectiveDrafts[block.id] ?? "").trim());
                      return (
                        <button key={block.id} onClick={() => setActiveSubjectiveBlockId(block.id)}
                          style={{ height: 30, padding: "0 10px", borderRadius: 8, border: `1px solid ${active ? "rgba(29,201,164,0.45)" : "rgba(255,255,255,0.08)"}`, background: active ? "rgba(29,201,164,0.12)" : "rgba(255,255,255,0.03)", color: active ? "#1dc9a4" : hasDraft ? "#8fa3be" : "#3a5570", fontSize: 12, fontWeight: active ? 800 : 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{index + 1}</span>
                          <span>{block.title}</span>
                          {hasDraft && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#1dc9a4" }} />}
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: 11, color: isCurrentDraftSaving ? "#c9973e" : "#3a5570", flexShrink: 0 }}>
                    已输入 {subjectiveDraftChars} 字 · {isCurrentDraftSaving ? "正在保存" : "已保存到账号"}
                  </span>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                  {activeSubjectiveBlock?.prompt ? (
                    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(29,201,164,0.04)", padding: "12px 16px", flexShrink: 0, maxHeight: 120, overflowY: "auto" }}>
                      <div style={{ fontSize: 12, color: "#1dc9a4", fontWeight: 800, marginBottom: 5 }}>{activeSubjectiveBlock.title}</div>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#8fa3be", lineHeight: 1.75 }}>{activeSubjectiveBlock.prompt}</div>
                    </div>
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column", minHeight: isActiveAnalysisOpen ? 168 : 0, flex: isActiveAnalysisOpen ? "0 0 auto" : 1, flexShrink: 0 }}>
                    <textarea
                      value={activeSubjectiveBlock ? currentSubjectiveDrafts[activeSubjectiveBlock.id] ?? "" : ""}
                      onChange={event => activeSubjectiveBlock && updateSubjectiveDraft(activeSubjectiveBlock.id, event.target.value)}
                      placeholder={activeSubjectiveBlock?.placeholder ?? "请在这里输入你的作答，查看参考答案后自行核对。"}
                      style={{ flex: 1, minHeight: isActiveAnalysisOpen ? 168 : 0, width: "100%", resize: "none", border: "none", background: "rgba(255,255,255,0.015)", color: "#dde4f0", outline: "none", padding: "16px 18px", fontSize: 15, lineHeight: 1.95, fontFamily: "'Noto Serif SC',serif" }}
                    />
                  </div>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0, background: "rgba(255,255,255,0.012)" }}>
                    <div style={{ fontSize: 12, color: "#5a7898" }}>
                      {isSubmitted ? "可展开当前小问的参考答案与解析。" : "作答后可查看当前小问解析。"}
                    </div>
                    <button onClick={handleSubjectiveAnalysisClick} disabled={submittingAnswer}
                      style={{ height: 34, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(78,142,247,0.25)", background: isActiveAnalysisOpen ? "rgba(78,142,247,0.08)" : "rgba(78,142,247,0.14)", color: "#4e8ef7", fontSize: 12, fontWeight: 800, cursor: submittingAnswer ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 7 }}>
                      <Search size={13} />
                      {submittingAnswer ? "加载中..." : isActiveAnalysisOpen ? "收起解析" : "查看解析"}
                    </button>
                  </div>
                  {isSubmitted && isActiveAnalysisOpen && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px", maxHeight: 185, overflowY: "auto", background: "rgba(255,255,255,0.018)", flexShrink: 0, minHeight: 0 }}>
                      <div style={{ fontSize: 12, color: "#4e8ef7", fontWeight: 800, marginBottom: 8 }}>参考答案与解析</div>
                      {activeSubjectiveBlock?.referenceAnswer ? <><div style={{ fontSize: 11, color: "#1dc9a4", marginBottom: 4 }}>参考答案</div><div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#8fa3be", lineHeight: 1.8, marginBottom: 10 }}>{activeSubjectiveBlock.referenceAnswer}</div></> : null}
                      {activeSubjectiveBlock?.analysis ? <><div style={{ fontSize: 11, color: "#4e8ef7", marginBottom: 4 }}>解析</div><div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#8fa3be", lineHeight: 1.8 }}>{activeSubjectiveBlock.analysis}</div></> : null}
                      {!activeSubjectiveBlock?.referenceAnswer && !activeSubjectiveBlock?.analysis ? <div style={{ fontSize: 13, color: "#5a7898", lineHeight: 1.8 }}>{q.analysis || "本题暂未配置解析。"}</div> : null}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "center", flexShrink: 0 }}>
                <button onClick={() => activeSubjectiveBlockIndex > 0 ? gotoSubjectiveBlock(-1) : handlePrev()} disabled={qIndex === 0 && activeSubjectiveBlockIndex === 0}
                  style={{ padding: "12px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: qIndex === 0 && activeSubjectiveBlockIndex === 0 ? "not-allowed" : "pointer", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: qIndex === 0 && activeSubjectiveBlockIndex === 0 ? "#1e3050" : "#5a7898", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <ChevronLeft size={15} /> {activeSubjectiveBlockIndex > 0 ? "上一问" : "上一题"}
                </button>
                <button onClick={() => activeSubjectiveBlockIndex < subjectiveAnswerBlocks.length - 1 ? gotoSubjectiveBlock(1) : handleNext()} disabled={qIndex === apiQuestions.length - 1 && activeSubjectiveBlockIndex === subjectiveAnswerBlocks.length - 1}
                  style={{ padding: "12px", borderRadius: 12, fontSize: 13, fontWeight: 800, cursor: qIndex === apiQuestions.length - 1 && activeSubjectiveBlockIndex === subjectiveAnswerBlocks.length - 1 ? "not-allowed" : "pointer", border: "none", background: qIndex === apiQuestions.length - 1 && activeSubjectiveBlockIndex === subjectiveAnswerBlocks.length - 1 ? "rgba(255,255,255,0.04)" : "linear-gradient(90deg,#4e8ef7,#6aa8ff)", color: qIndex === apiQuestions.length - 1 && activeSubjectiveBlockIndex === subjectiveAnswerBlocks.length - 1 ? "#2e4260" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: qIndex === apiQuestions.length - 1 && activeSubjectiveBlockIndex === subjectiveAnswerBlocks.length - 1 ? "none" : "0 4px 16px rgba(78,142,247,0.25)" }}>
                  {activeSubjectiveBlockIndex < subjectiveAnswerBlocks.length - 1 ? "下一问" : "下一题"} <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Answer sheet + stats ── */}
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.05)", padding: "24px 20px 40px", overflowY: "auto", height: "calc(100vh - 100px)", position: "sticky", top: 58 }}>
          {/* Session stats */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 3, height: 13, borderRadius: 2, background: "linear-gradient(to bottom,#c9973e,#c9973e55)" }} />
              <span style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 13, fontWeight: 600, color: "#dde4f0" }}>本次练习</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(isSubjectiveQuestion ? [
                { label: "已看解析", value: subjectiveViewed, color: "#1dc9a4" },
                { label: "未查看", value: Math.max(0, subjectiveTotal - subjectiveViewed), color: "#5a7898" },
                { label: "小问数", value: subjectiveSubQuestionTotal, color: "#c9973e" },
                { label: "当前进度", value: `${qIndex + 1}/${apiQuestions.length}`, color: "#4e8ef7" },
              ] : [
                { label: "已答题", value: totalDone, color: "#4e8ef7" },
                { label: "正确", value: totalCorrect, color: "#1dc9a4" },
                { label: "错误", value: totalWrong, color: "#f76e6e" },
                { label: "正确率", value: totalDone ? `${Math.round(totalCorrect / totalDone * 100)}%` : "--", color: "#c9973e" },
              ]).map(s => (
                <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 11, padding: "11px 13px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 10, color: "#2e4260", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 600, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 18 }} />

          {/* Answer sheet grid */}
          <div>
            <div style={{ fontSize: 12, color: "#2e4260", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span>答题卡</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#1e3050" }}>{answerSheetDone}/{answerSheetTotal}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, marginBottom: 20 }}>
              {apiQuestions.map((item, i) => {
                const res = results[item.id];
                const isCurrent = i === qIndex;
                return (
                  <button key={item.id} onClick={() => goToQuestionIndex(i)}
                    style={{ width: "100%", aspectRatio: "1", borderRadius: 8, border: `1.5px solid ${isCurrent ? "#4e8ef7" : res === "viewed" ? "rgba(29,201,164,0.42)" : res === "correct" ? "rgba(29,201,164,0.4)" : res === "wrong" ? "rgba(247,110,110,0.4)" : "rgba(255,255,255,0.07)"}`, background: isCurrent ? "rgba(78,142,247,0.15)" : res === "viewed" ? "rgba(29,201,164,0.1)" : res === "correct" ? "rgba(29,201,164,0.1)" : res === "wrong" ? "rgba(247,110,110,0.1)" : "rgba(255,255,255,0.02)", cursor: "pointer", fontSize: 11, fontWeight: 600, color: isCurrent ? "#4e8ef7" : res === "viewed" ? "#1dc9a4" : res === "correct" ? "#1dc9a4" : res === "wrong" ? "#f76e6e" : "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>
                    {i + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {(isSubjectiveQuestion ? [
                { color: "#4e8ef7", bg: "rgba(78,142,247,0.15)", label: "当前题目" },
                { color: "#1dc9a4", bg: "rgba(29,201,164,0.1)", label: "已看解析" },
                { color: "#2e4260", bg: "rgba(255,255,255,0.02)", label: "未查看" },
              ] : [
                { color: "#4e8ef7", bg: "rgba(78,142,247,0.15)", label: "当前题目" },
                { color: "#1dc9a4", bg: "rgba(29,201,164,0.1)", label: "回答正确" },
                { color: "#f76e6e", bg: "rgba(247,110,110,0.1)", label: "回答错误" },
                { color: "#2e4260", bg: "rgba(255,255,255,0.02)", label: "未作答" },
              ]).map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, background: l.bg, border: `1.5px solid ${l.color}60` }} />
                  <span style={{ fontSize: 11, color: "#2e4260" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.05)", margin: "20px 0" }} />

          {/* Reset */}
          <button onClick={() => goToQuestionIndex(0)}
            style={{ width: "100%", padding: "10px", borderRadius: 11, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 12, color: "#3a5570", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <RotateCcw size={13} /> 回到第一题
          </button>
          <button
            onClick={() => void clearCurrentQuestionRecord()}
            disabled={clearingRecord || (!q.state.isAnswered && !q.state.hasViewedAnswer && !q.state.isRedoMarked && !q.state.isMastered && subjectiveDraftChars === 0)}
            style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 11, background: q.state.isAnswered || q.state.hasViewedAnswer || q.state.isRedoMarked || q.state.isMastered || subjectiveDraftChars > 0 ? "rgba(247,110,110,0.08)" : "rgba(255,255,255,0.025)", border: `1px solid ${q.state.isAnswered || q.state.hasViewedAnswer || q.state.isRedoMarked || q.state.isMastered || subjectiveDraftChars > 0 ? "rgba(247,110,110,0.22)" : "rgba(255,255,255,0.06)"}`, fontSize: 12, color: q.state.isAnswered || q.state.hasViewedAnswer || q.state.isRedoMarked || q.state.isMastered || subjectiveDraftChars > 0 ? "#f76e6e" : "#2e4260", cursor: clearingRecord || (!q.state.isAnswered && !q.state.hasViewedAnswer && !q.state.isRedoMarked && !q.state.isMastered && subjectiveDraftChars === 0) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
          >
            <Trash2 size={13} /> {clearingRecord ? "正在清除..." : "清除本题记录"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ QUESTION BANK HOME PAGE ══════════════════════ */

function QuestionBankHomePage({
  setPage,
  startQuestionPractice,
  notify,
  homeConfig,
  openMyQuestionBank,
}: {
  setPage: (p: string) => void;
  startQuestionPractice: (mode?: QuestionPracticeModeLabel, chapter?: QuestionPracticeTarget) => void;
  notify: Notify;
  homeConfig: UserHomeConfig;
  openMyQuestionBank: (paperType: "objective" | "subjective") => void;
}) {
  const [examTab, setExamTab] = useState<"客观题" | "主观题">("客观题");
  const [subNav, setSubNav] = useState("章节练习");
  const [wrongFilter, setWrongFilter] = useState("全部");
  const [banks, setBanks] = useState<QuestionBankBook[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [bankError, setBankError] = useState("");

  const isObj = examTab === "客观题";
  const visibleBanks = banks.filter((bank) => bank.paperType === (isObj ? "objective" : "subjective"));
  const activeBank = visibleBanks[0] ?? null;
  const realSubjects = activeBank?.subjects ?? [];
  const wrongCount = visibleBanks.reduce((sum, bank) => sum + bank.progress.wrongCount, 0);
  const favoriteCount = visibleBanks.reduce((sum, bank) => sum + bank.progress.bookmarkedCount, 0);
  const masteredCount = visibleBanks.reduce((sum, bank) => sum + bank.progress.masteredCount, 0);
  const redoCount = visibleBanks.reduce((sum, bank) => sum + bank.progress.redoCount, 0);

  useEffect(() => {
    let active = true;

    const loadBanks = async () => {
      setLoadingBanks(true);
      setBankError("");
      try {
        const nextBanks = await questionBankService.getPublicQuestionBanks();
        if (!active) return;
        setBanks(nextBanks);
      } catch (error) {
        if (!active) return;
        setBankError(error instanceof Error ? error.message : "题库加载失败");
      } finally {
        if (active) setLoadingBanks(false);
      }
    };

    void loadBanks();

    return () => {
      active = false;
    };
  }, []);

  const objectiveCountdownConfig = homeConfig.examCountdown?.objective ?? EMPTY_USER_HOME_CONFIG.examCountdown?.objective;
  const subjectiveCountdownConfig = homeConfig.examCountdown?.subjective ?? EMPTY_USER_HOME_CONFIG.examCountdown?.subjective;
  const activeCountdownConfig = isObj ? objectiveCountdownConfig : subjectiveCountdownConfig;
  const objExamDate = parseCountdownDate(objectiveCountdownConfig?.targetDate, "2026-09-13");
  const subExamDate = parseCountdownDate(subjectiveCountdownConfig?.targetDate, "2026-10-11");
  const daysLeft = Math.max(0, Math.ceil(((isObj ? objExamDate : subExamDate).getTime() - Date.now()) / 86400000));
  const yearProgress = Math.max(0, Math.min(100, Math.round((1 - daysLeft / 365) * 100)));

  const cd = isObj
    ? { label: activeCountdownConfig?.label || "法考客观题倒计时", desc: activeCountdownConfig?.description || "距 2026 年客观题考试还有", accent: "#c9973e", num: "#e8c46a", bg: "linear-gradient(150deg,#1a1005,#261808)", border: "rgba(201,151,62,0.22)", orb: "rgba(201,151,62,0.07)", bar: "linear-gradient(90deg,#c9973e,#e8c46a)" }
    : { label: activeCountdownConfig?.label || "法考主观题倒计时", desc: activeCountdownConfig?.description || "距 2026 年主观题考试还有", accent: "#1dc9a4", num: "#1dc9a4", bg: "linear-gradient(150deg,#041410,#071c18)", border: "rgba(29,201,164,0.22)", orb: "rgba(29,201,164,0.07)", bar: "linear-gradient(90deg,#1dc9a4,#4ee8c8)" };

  const objQuickEntries = [
    { icon: BookOpen, label: "我的题库", sub: "客观题授权题库",     color: "#4e8ef7", glow: "rgba(78,142,247,0.12)", action: () => openMyQuestionBank("objective") },
    { icon: Flag,     label: "错题本",   sub: `${wrongCount} 道待复习`, color: "#f76e6e", glow: "rgba(247,110,110,0.12)", action: () => startQuestionPractice("只看错题", activeBank ? { bookId: activeBank.id, name: "错题本", paperType: "objective", source: "public" } : null) },
    { icon: Zap,      label: "速记刷题", sub: "高频考点快速刷",     color: "#c9973e", glow: "rgba(201,151,62,0.12)", action: () => startQuestionPractice("顺序练习", activeBank ? { bookId: activeBank.id, name: activeBank.name, paperType: "objective", source: "public" } : { name: "客观题练习", paperType: "objective", source: "public" }) },
    { icon: Target,   label: "专项练习", sub: "暂未配置",           color: "#1dc9a4", glow: "rgba(29,201,164,0.12)", action: () => notify("专项练习暂未配置", "info") },
    { icon: PenLine,  label: "我的笔记", sub: "学习笔记整理",       color: "#c97ef5", glow: "rgba(201,126,245,0.12)", action: () => setPage("myNotes") },
    { icon: Bookmark, label: "我的收藏", sub: `已收藏 ${favoriteCount} 道好题`, color: "#f7a94e", glow: "rgba(247,169,78,0.12)", action: () => startQuestionPractice("收藏题目", activeBank ? { bookId: activeBank.id, name: "我的收藏", paperType: "objective", source: "public" } : null) },
  ];

  const subQuickEntries = [
    { icon: BookOpen, label: "我的题库", sub: "主观题授权题库",     color: "#4e8ef7", glow: "rgba(78,142,247,0.12)", action: () => openMyQuestionBank("subjective") },
    { icon: Scale,    label: "法条检索", sub: "全库法条快速定位",   color: "#c9973e", glow: "rgba(201,151,62,0.12)", action: () => setPage("lawSearch") },
    { icon: PenLine,  label: "答题模板", sub: "高分答题框架整理",   color: "#c97ef5", glow: "rgba(201,126,245,0.12)", action: () => notify("答题模板会作为题库学习资料单独整理，不再跳转到主观批改入口", "info") },
    { icon: Bookmark, label: "我的收藏", sub: `已收藏 ${favoriteCount} 道好题`, color: "#f7a94e", glow: "rgba(247,169,78,0.12)", action: () => startQuestionPractice("收藏题目", activeBank ? { bookId: activeBank.id, name: "我的收藏", paperType: "subjective", source: "public" } : null) },
  ];

  const quickEntries = isObj ? objQuickEntries : subQuickEntries;
  const handleExamTabChange = (tab: "客观题" | "主观题") => {
    setExamTab(tab);
    setSubNav("章节练习");
  };

  const wrongRows = visibleBanks.flatMap(bank =>
    bank.subjects
      .filter(subject => subject.progress.wrongCount > 0)
      .map(subject => ({
        id: `${bank.id}:${subject.id}`,
        bookId: bank.id,
        subjectId: subject.id,
        subject: subject.name,
        chapter: bank.name,
        color: subject.color,
        wrongCount: subject.progress.wrongCount,
        mastered: subject.progress.masteredCount >= subject.progress.wrongCount,
        text: `${bank.name} · ${subject.name} 当前有 ${subject.progress.wrongCount} 道错题需要复习。`,
      })),
  );
  const wrongSubjects = ["全部", ...Array.from(new Set(wrongRows.map(q => q.subject)))];
  const filteredWrong = wrongFilter === "全部" ? wrongRows : wrongRows.filter(q => q.subject === wrongFilter);

  const allSubjects: Record<string, { id: number; name: string; total: number; done: number; color: string }[]> = {
    "客观题一": [
      { id: 1, name: "法理学",            total: 82,  done: 0,   color: "#4e8ef7" },
      { id: 2, name: "中国法律史",        total: 23,  done: 0,   color: "#c9973e" },
      { id: 3, name: "宪法",              total: 86,  done: 12,  color: "#1dc9a4" },
      { id: 4, name: "国际法",            total: 60,  done: 0,   color: "#c97ef5" },
      { id: 5, name: "司法制度和法律职业道德", total: 43, done: 20, color: "#f7a94e" },
      { id: 6, name: "刑法",              total: 324, done: 0,   color: "#f76e6e" },
      { id: 7, name: "刑事诉讼法",        total: 357, done: 0,   color: "#f76e6e" },
      { id: 8, name: "行政法与行政诉讼法", total: 298, done: 80,  color: "#4e8ef7" },
      { id: 9, name: "习近平法治思想",    total: 56,  done: 0,   color: "#c9973e" },
    ],
    "客观题二": [
      { id: 10, name: "民法",             total: 580, done: 210, color: "#c9973e" },
      { id: 11, name: "商法",             total: 240, done: 60,  color: "#4e8ef7" },
      { id: 12, name: "经济法",           total: 180, done: 0,   color: "#1dc9a4" },
      { id: 13, name: "民事诉讼法",       total: 357, done: 120, color: "#c97ef5" },
      { id: 14, name: "仲裁法",           total: 80,  done: 0,   color: "#f7a94e" },
      { id: 15, name: "劳动与社会保障法", total: 120, done: 0,   color: "#f76e6e" },
      { id: 16, name: "国际私法",         total: 90,  done: 30,  color: "#4e8ef7" },
      { id: 17, name: "国际经济法",       total: 110, done: 0,   color: "#c9973e" },
      { id: 18, name: "三国法综合题",     total: 45,  done: 0,   color: "#1dc9a4" },
    ],
    "必考科目": [
      { id: 21, name: "民法",             total: 180, done: 62,  color: "#c9973e" },
      { id: 22, name: "刑法",             total: 120, done: 0,   color: "#f76e6e" },
      { id: 23, name: "行政法",           total: 90,  done: 30,  color: "#4e8ef7" },
      { id: 24, name: "民事诉讼法",       total: 110, done: 0,   color: "#c97ef5" },
      { id: 25, name: "刑事诉讼法",       total: 100, done: 0,   color: "#f7a94e" },
      { id: 26, name: "商法经济法",       total: 80,  done: 0,   color: "#1dc9a4" },
    ],
    "选考科目": [
      { id: 31, name: "国际私法",         total: 60,  done: 0,   color: "#4e8ef7" },
      { id: 32, name: "国际经济法",       total: 60,  done: 0,   color: "#c9973e" },
      { id: 33, name: "劳动法",           total: 50,  done: 20,  color: "#1dc9a4" },
      { id: 34, name: "环境资源法",       total: 40,  done: 0,   color: "#c97ef5" },
      { id: 35, name: "知识产权法",       total: 45,  done: 0,   color: "#f7a94e" },
      { id: 36, name: "司法鉴定",         total: 30,  done: 0,   color: "#f76e6e" },
    ],
  };

  const subjects: QuestionBankSubjectCard[] = realSubjects.map(subject => ({
    id: subject.id,
    bookId: subject.bookId,
    paperType: activeBank?.paperType,
    name: subject.name,
    total: subject.progress.totalCount,
    done: subject.progress.answeredCount,
    color: subject.color,
  }));

  const getProficiency = (done: number, total: number) => total > 0 ? Math.round((done / total) * 5) : 0;

  return (
    <div className="debao-question-bank-home debao-themed-page" style={{ maxWidth: 1340, margin: "0 auto", padding: "32px 36px 64px" }}>

      {/* ─── Exam type tabs + sub-nav ─── */}
      <div className="debao-qb-topbar" style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
        <div className="debao-qb-exam-switch" style={{ display: "flex", gap: 0, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 4, border: "1px solid rgba(255,255,255,0.08)" }}>
          {(["客观题", "主观题"] as const).map(tab => (
            <button key={tab} onClick={() => handleExamTabChange(tab)}
              style={{ padding: "9px 28px", borderRadius: 9, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.18s",
                background: examTab === tab ? (isObj ? "linear-gradient(135deg,#c9973e,#e8c46a)" : "linear-gradient(135deg,#1dc9a4,#4ee8c8)") : "transparent",
                color: examTab === tab ? "#090e1a" : "#5a7898",
              }}>
              {tab}
            </button>
          ))}
        </div>
        <div className="debao-qb-topbar-divider" style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
        <div className="debao-qb-subnav" style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {(isObj ? ["章节练习", "错题本"] : ["章节练习"]).map(item => (
          <button key={item} onClick={() => setSubNav(item)}
            style={{ padding: "7px 14px 5px", borderRadius: 0, fontSize: 13, background: "none", border: "none", cursor: "pointer", transition: "all 0.14s",
              color: subNav === item ? "#dde4f0" : "#3a5570",
              fontWeight: subNav === item ? 600 : 400,
              borderBottom: subNav === item ? `2px solid ${cd.accent}` : "2px solid transparent",
            }}
            onMouseEnter={e => { if (subNav !== item) (e.currentTarget as HTMLElement).style.color = "#8fa3be"; }}
            onMouseLeave={e => { if (subNav !== item) (e.currentTarget as HTMLElement).style.color = "#3a5570"; }}>
            {item}
          </button>
        ))}
        </div>
      </div>

      {/* ══ 章节练习 ══ */}
      {subNav === "章节练习" && (<>
        <div className="debao-qb-quick-layout" style={{ display: "grid", gridTemplateColumns: "248px 1fr", gap: 16, marginBottom: 36 }}>
          <div className="debao-qb-countdown-card" style={{ borderRadius: 18, padding: "26px 28px 24px", background: cd.bg, border: `1px solid ${cd.border}`, position: "relative", overflow: "hidden", transition: "all 0.3s" }}>
            <div style={{ position: "absolute", top: -24, right: -24, width: 110, height: 110, borderRadius: "50%", background: cd.orb }} />
            <div style={{ position: "absolute", bottom: -18, right: 10, width: 60, height: 60, borderRadius: "50%", background: cd.orb }} />
            <div className="debao-qb-countdown-label" style={{ fontSize: 11, color: cd.accent, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>{cd.label}</div>
            <div className="debao-qb-countdown-desc" style={{ fontSize: 12, color: `${cd.accent}60`, marginBottom: 18, lineHeight: 1.6 }}>{cd.desc}</div>
            <div className="debao-qb-countdown-number" style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 52, fontWeight: 700, color: cd.num, lineHeight: 1 }}>{daysLeft}</span>
              <span style={{ fontSize: 20, color: cd.accent, fontWeight: 600 }}>天</span>
            </div>
            <div className="debao-qb-countdown-progress" style={{ marginTop: 20, height: 3, background: `${cd.accent}15`, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${yearProgress}%`, background: cd.bar, borderRadius: 2 }} />
            </div>
            <div className="debao-qb-countdown-range" style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: `${cd.accent}30` }}>备考开始</span>
              <span style={{ fontSize: 10, color: `${cd.accent}30` }}>考试当天</span>
            </div>
          </div>
          <div className="debao-qb-quick-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {quickEntries.map(entry => {
              const Icon = entry.icon;
              return (
                <button key={entry.label}
                  className="debao-qb-quick-card"
                  onClick={entry.action}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", borderRadius: 16, background: "#0f1826", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer", textAlign: "left", transition: "all 0.18s" }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = entry.glow; el.style.borderColor = `${entry.color}45`; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)"; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "#0f1826"; el.style.borderColor = "rgba(255,255,255,0.07)"; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; }}>
                  <div className="debao-qb-quick-icon" style={{ width: 44, height: 44, borderRadius: 13, background: `${entry.color}14`, border: `1px solid ${entry.color}28`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={19} color={entry.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="debao-qb-quick-title" style={{ fontSize: 14, fontWeight: 600, color: "#dde4f0", marginBottom: 3 }}>{entry.label}</div>
                    <div className="debao-qb-quick-sub" style={{ fontSize: 11, color: "#3a5570" }}>{entry.sub}</div>
                  </div>
                  <ChevronRight size={14} color="#2e4260" style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 3, height: 16, borderRadius: 2, background: `linear-gradient(to bottom,${cd.accent},${cd.num})` }} />
              <h2 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 18, fontWeight: 600, color: "#dde4f0" }}>章节练习</h2>
              <span style={{ fontSize: 11, color: "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>{loadingBanks ? "加载中" : `${subjects.length} 个科目`}</span>
              {bankError && <span style={{ fontSize: 11, color: "#f7a94e" }}>{bankError}</span>}
            </div>
            <div style={{ display: "none", gap: 0, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 3, border: "1px solid rgba(255,255,255,0.07)" }}>
              {(["客观题一", "客观题二"] as const).map(tab => (
                <button key={tab} onClick={() => undefined}
                  style={{ padding: "6px 20px", borderRadius: 8, fontSize: 13, border: "none", cursor: "pointer", transition: "all 0.15s",
                    background: "transparent",
                    color: "#3a5570",
                    fontWeight: 400,
                  }}>
                  {tab}
                </button>
              ))}
            </div>
          </div>
          {!loadingBanks && realSubjects.length === 0 && !bankError && (
            <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "26px 24px", color: "#5a7898", fontSize: 13 }}>
              当前暂无{isObj ? "客观题" : "主观题"}免费练习题库。发布后这里会显示可练习的科目和进度。
            </div>
          )}
          <div className="debao-qb-subject-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {subjects.map(sub => {
              const proficiency = getProficiency(sub.done, sub.total);
              const pct = sub.total > 0 ? Math.round((sub.done / sub.total) * 100) : 0;
              return (
                <button key={sub.id} className="debao-qb-subject-card" onClick={() => startQuestionPractice("顺序练习", { bookId: sub.bookId ?? activeBank?.id, subjectId: sub.id, chapterId: sub.id, name: sub.name, paperType: sub.paperType ?? activeBank?.paperType, source: "public" })}
                  style={{ display: "flex", flexDirection: "column", padding: "20px 22px 18px", borderRadius: 16, background: "#0f1826", border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer", textAlign: "left", transition: "all 0.18s", position: "relative", overflow: "hidden" }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${sub.color}45`; el.style.background = `linear-gradient(145deg,${sub.color}09,#0f1826)`; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)"; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "rgba(255,255,255,0.07)"; el.style.background = "#0f1826"; el.style.transform = "translateY(0)"; el.style.boxShadow = "none"; }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sub.color, borderRadius: "16px 0 0 16px", opacity: 0.55 }} />
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#dde4f0", lineHeight: 1.3, paddingLeft: 2 }}>{sub.name}</div>
                    <ChevronRight size={14} color="#2e4260" style={{ flexShrink: 0, marginTop: 2 }} />
                  </div>
                  <div className="debao-qb-subject-proficiency" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
                    <span style={{ fontSize: 11, color: "#3a5570" }}>熟练度</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < proficiency ? sub.color : "rgba(255,255,255,0.07)", border: i < proficiency ? "none" : "1px solid rgba(255,255,255,0.1)" }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>{sub.done}/{sub.total} 道题</span>
                      <span style={{ fontSize: 10, color: "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>{pct}%</span>
                    </div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${sub.color}80,${sub.color})`, borderRadius: 2 }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </>)}


      {/* ══ 错题本 ══ */}
      {subNav === "错题本" && (
        <div className="debao-qb-wrong-panel">
          <div className="debao-qb-wrong-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
            {[
              { label: "错题总数", val: wrongCount, color: "#f76e6e", sub: "道待复习" },
              { label: "已掌握",   val: masteredCount, color: "#1dc9a4", sub: "道已攻克" },
              { label: "待复习",   val: Math.max(0, wrongCount - masteredCount), color: "#c9973e", sub: "道需加强" },
              { label: "重做标记", val: redoCount, color: "#c97ef5", sub: "道已标记" },
            ].map(s => (
              <div key={s.label} style={{ background: "#0f1826", borderRadius: 16, padding: "18px 22px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 32, fontWeight: 700, color: s.color, lineHeight: 1, marginBottom: 6 }}>{s.val}</div>
                <div style={{ fontSize: 11, color: "#3a5570", marginBottom: 2 }}>{s.sub}</div>
                <div style={{ fontSize: 12, color: "#2e4260" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            {wrongSubjects.map(sub => (
              <button key={sub} onClick={() => setWrongFilter(sub)}
                style={{ padding: "6px 16px", borderRadius: 20, fontSize: 12, border: "none", cursor: "pointer", transition: "all 0.15s",
                  background: wrongFilter === sub ? "rgba(247,110,110,0.15)" : "rgba(255,255,255,0.04)",
                  color: wrongFilter === sub ? "#f76e6e" : "#3a5570",
                  boxShadow: wrongFilter === sub ? "0 0 0 1px rgba(247,110,110,0.4)" : "none",
                  fontWeight: wrongFilter === sub ? 600 : 400,
                }}>
                {sub}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#2e4260" }}>
              <span>共 {filteredWrong.length} 道</span>
            </div>
          </div>
          {!loadingBanks && filteredWrong.length === 0 && (
            <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "26px 24px", color: "#5a7898", fontSize: 13 }}>
              还没有错题。提交答题后，答错或手动标记重做的题目会自动进入错题本。
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filteredWrong.map(q => (
              <div key={q.id} style={{ background: "#0f1826", borderRadius: 16, border: `1px solid ${q.mastered ? "rgba(29,201,164,0.15)" : "rgba(255,255,255,0.07)"}`, padding: "18px 22px", display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 3, height: 52, borderRadius: 2, background: q.mastered ? "#1dc9a4" : q.color, flexShrink: 0, opacity: 0.7 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: `${q.color}15`, color: q.color }}>{q.subject}</span>
                    <span style={{ fontSize: 10, color: "#2e4260" }}>{q.chapter}</span>
                    <span style={{ fontSize: 10, color: "#f76e6e", fontFamily: "'JetBrains Mono',monospace", marginLeft: "auto" }}>错误 {q.wrongCount} 次</span>
                    {q.mastered && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "rgba(29,201,164,0.1)", color: "#1dc9a4" }}>已掌握</span>}
                  </div>
                  <p style={{ fontSize: 13, color: "#8fa3be", lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{q.text}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => startQuestionPractice("只看错题", { bookId: q.bookId, subjectId: q.subjectId, chapterId: q.subjectId, name: q.subject, paperType: activeBank?.paperType, source: "public" })}
                    style={{ padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: "rgba(247,110,110,0.12)", color: "#f76e6e" }}>
                    重做
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ MY QUESTION BANK PAGE ══════════════════════ */

function MyQuestionBankPage({
  setPage,
  startQuestionPractice,
  paperTypeFilter,
}: {
  setPage: (p: string) => void;
  startQuestionPractice: (mode?: QuestionPracticeModeLabel, chapter?: QuestionPracticeTarget) => void;
  paperTypeFilter?: "objective" | "subjective" | null;
}) {
  const [banks, setBanks] = useState<QuestionBankBook[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [bankError, setBankError] = useState("");
  const [lastSubjectByBook, setLastSubjectByBook] = useState<Record<string, string>>({});
  const filteredBanks = paperTypeFilter ? banks.filter(bank => bank.paperType === paperTypeFilter) : banks;
  const unlocked = filteredBanks.map(bank => ({
    id: bank.id,
    unlocked: true,
    book: bank.name,
    publisher: bank.publisher,
    color: bank.color,
    bankName: bank.name,
    paperType: bank.paperType,
    total: bank.progress.totalCount,
    done: bank.progress.answeredCount,
    subjects: bank.subjects,
    validUntil: "长期有效",
    tags: bank.tags,
  }));

  useEffect(() => {
    let active = true;

    const loadBanks = async () => {
      setLoadingBanks(true);
      setBankError("");
      try {
        const nextBanks = await questionBankService.getMyQuestionBanks();
        if (!active) return;
        setBanks(nextBanks);
        if (typeof window !== "undefined") {
          setLastSubjectByBook(
            Object.fromEntries(nextBanks.map(bank => [bank.id, window.localStorage.getItem(`debao:my-subjective-subject:${bank.id}`) || ""])),
          );
        }
      } catch (error) {
        if (!active) return;
        setBankError(error instanceof Error ? error.message : "题库加载失败");
      } finally {
        if (active) setLoadingBanks(false);
      }
    };

    void loadBanks();

    return () => {
      active = false;
    };
  }, []);

  const isExpiringSoon = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    return days <= 30;
  };

  const startBankPractice = (bank: (typeof unlocked)[number], subject?: QuestionBankSubject) => {
    if (bank.paperType === "subjective") {
      const targetSubject = subject ?? bank.subjects.find(item => item.id === lastSubjectByBook[bank.id]) ?? bank.subjects[0];
      if (!targetSubject) return;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`debao:my-subjective-subject:${bank.id}`, targetSubject.id);
      }
      setLastSubjectByBook(current => ({ ...current, [bank.id]: targetSubject.id }));
      startQuestionPractice("顺序练习", {
        bookId: bank.id,
        subjectId: targetSubject.id,
        chapterId: targetSubject.id,
        name: targetSubject.name,
        paperType: "subjective",
        layout: "officialSubjective",
        source: "my",
      });
      return;
    }

    startQuestionPractice("顺序练习", { bookId: bank.id, name: bank.book, paperType: "objective", source: "my" });
  };

  const objectiveBanks = unlocked.filter(bank => bank.paperType === "objective");
  const subjectiveBanks = unlocked.filter(bank => bank.paperType === "subjective");
  const pageTitle = paperTypeFilter === "subjective" ? "我的主观题库" : paperTypeFilter === "objective" ? "我的客观题库" : "我的题库";

  const renderBankCard = (b: (typeof unlocked)[number]) => {
    const pct = b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
    const expiring = b.validUntil && isExpiringSoon(b.validUntil);
    const lastSubject = b.paperType === "subjective"
      ? b.subjects.find(subject => subject.id === lastSubjectByBook[b.id]) ?? b.subjects[0]
      : null;

    return (
      <div key={b.id} className="debao-my-qb-card" style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="debao-my-qb-card-head" style={{ background: `linear-gradient(135deg,${b.color}22,rgba(15,24,38,0.96))`, borderBottom: `1px solid ${b.color}20`, padding: "20px 22px 16px", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: b.color, opacity: 0.75 }} />
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 10 }}>
            <div style={{ minWidth: 0, paddingLeft: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: `${b.color}dd`, fontWeight: 800 }}>{b.paperType === "subjective" ? "主观题库" : "客观题库"}</span>
                <span style={{ fontSize: 11, color: "#3a5570" }}>{b.publisher}</span>
              </div>
              <div className="debao-my-qb-card-title" style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 16, fontWeight: 700, color: "#dde4f0", lineHeight: 1.45, wordBreak: "break-word" }}>{b.book}</div>
            </div>
            <div className="debao-my-qb-card-icon" style={{ width: 42, height: 48, borderRadius: 8, background: `linear-gradient(145deg,${b.color}40,${b.color}18)`, border: `1px solid ${b.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <BookOpen size={18} color={b.color} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, paddingLeft: 6, flexWrap: "wrap" }}>
            {b.tags.map(t => (
              <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: `${b.color}18`, color: b.color }}>{t}</span>
            ))}
            {expiring && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "rgba(247,169,78,0.12)", color: "#f7a94e" }}>即将到期</span>}
          </div>
        </div>

        <div className="debao-my-qb-card-body" style={{ padding: "16px 22px 20px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          <div className="debao-my-qb-progress" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 11, color: "#3a5570", marginBottom: 6 }}>练习进度</div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.055)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${b.color}80,${b.color})`, borderRadius: 999, transition: "width 0.5s ease" }} />
              </div>
            </div>
            <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: "#5a7898", whiteSpace: "nowrap" }}>{b.done}/{b.total} · {pct}%</span>
          </div>

          {b.paperType === "objective" ? (
            <button onClick={() => startBankPractice(b)}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: `linear-gradient(90deg,${b.color}dd,${b.color})`, color: "#fff" }}>
              {b.done > 0 ? "继续练习" : "开始练习"}
            </button>
          ) : (
            <div className="debao-my-qb-subject-picker" style={{ display: "grid", gap: 12 }}>
              <div className="debao-my-qb-subject-picker-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#dde4f0", fontWeight: 800 }}>选择练习科目</div>
                  <div style={{ fontSize: 11, color: "#3a5570", marginTop: 3 }}>{b.subjects.length} 个科目，进入后使用真机模考排版</div>
                </div>
                {lastSubject && (
                  <button onClick={() => startBankPractice(b, lastSubject)}
                    style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${lastSubject.color}44`, background: `${lastSubject.color}14`, color: lastSubject.color, cursor: "pointer", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
                    继续上次
                  </button>
                )}
              </div>
              {b.subjects.length === 0 ? (
                <div style={{ color: "#5a7898", fontSize: 12, lineHeight: 1.7, padding: "12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>当前题库还没有配置科目。</div>
              ) : (
                <div className="debao-my-qb-subject-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                  {b.subjects.map(subject => {
                    const subjectPct = subject.progress.totalCount > 0 ? Math.round((subject.progress.answeredCount / subject.progress.totalCount) * 100) : 0;
                    const isLast = lastSubjectByBook[b.id] === subject.id;
                    return (
                      <button key={subject.id} className="debao-my-qb-subject-card" onClick={() => startBankPractice(b, subject)}
                        style={{ padding: "10px 11px", borderRadius: 10, border: `1px solid ${isLast ? `${subject.color}66` : "rgba(255,255,255,0.07)"}`, background: isLast ? `${subject.color}16` : "rgba(255,255,255,0.025)", cursor: "pointer", textAlign: "left", minHeight: 78 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: subject.color, flexShrink: 0 }} />
                          <span style={{ color: "#c8d8ee", fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject.name}</span>
                          {isLast && <span style={{ marginLeft: "auto", color: subject.color, fontSize: 10, fontWeight: 800 }}>上次</span>}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                          <span style={{ color: "#3a5570", fontSize: 10 }}>{subject.progress.answeredCount}/{subject.progress.totalCount} 题</span>
                          <span style={{ color: subject.color, fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>{subjectPct}%</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
                          <div style={{ width: `${subjectPct}%`, height: "100%", background: subject.color }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="debao-my-question-bank-page debao-themed-page" style={{ maxWidth: 1340, margin: "0 auto", padding: "32px 36px 64px" }}>

      {/* ─── Header ─── */}
      <div className="debao-my-qb-header" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <button onClick={() => setPage("questionBankHome")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 13, color: "#5a7898" }}>
          <ChevronLeft size={14} /> 题库
        </button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: "linear-gradient(to bottom,#4e8ef7,#c97ef5)" }} />
          <h1 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 20, fontWeight: 600, color: "#dde4f0" }}>{pageTitle}</h1>
          <span style={{ fontSize: 12, color: "#2e4260", fontFamily: "'JetBrains Mono',monospace" }}>{loadingBanks ? "加载中" : `已开通 ${unlocked.length} 个`}</span>
        </div>
      </div>
      {bankError && (
        <div style={{ marginBottom: 18, padding: "12px 16px", borderRadius: 12, background: "rgba(247,169,78,0.08)", border: "1px solid rgba(247,169,78,0.2)", color: "#f7a94e", fontSize: 13 }}>
          {bankError}
        </div>
      )}

      <div className="debao-my-qb-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
        {[
          { label: "已开通题库", value: unlocked.length, color: "#4e8ef7" },
          { label: "主观题库", value: subjectiveBanks.length, color: "#1dc9a4" },
          { label: "客观题库", value: objectiveBanks.length, color: "#c9973e" },
        ].map(item => (
          <div key={item.label} style={{ borderRadius: 14, background: "#0f1826", border: "1px solid rgba(255,255,255,0.07)", padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#5a7898", marginBottom: 8 }}>{item.label}</div>
            <div style={{ fontSize: 24, color: item.color, fontFamily: "'JetBrains Mono',monospace", fontWeight: 800 }}>{loadingBanks ? "--" : item.value}</div>
          </div>
        ))}
      </div>

      <div className="debao-my-qb-content" style={{ marginBottom: 44 }}>
        {!loadingBanks && unlocked.length === 0 && (
          <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "28px 24px", color: "#5a7898", fontSize: 13, marginBottom: 16 }}>
            当前账号还没有开通题库。开通权限后，这里会显示可练习的题库和进度。
          </div>
        )}
        {subjectiveBanks.length > 0 && (
          <section className="debao-my-qb-section" style={{ marginBottom: 30 }}>
            <div className="debao-my-qb-section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <CheckCircle2 size={15} color="#1dc9a4" />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#dde4f0" }}>主观题库</span>
              <span style={{ fontSize: 12, color: "#3a5570" }}>先选科目，再进入真机模考式练习</span>
            </div>
            <div className="debao-my-qb-grid debao-my-qb-grid-subjective" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
              {subjectiveBanks.map(renderBankCard)}
            </div>
          </section>
        )}

        {objectiveBanks.length > 0 && (
          <section className="debao-my-qb-section">
            <div className="debao-my-qb-section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <CheckCircle2 size={15} color="#c9973e" />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#dde4f0" }}>客观题库</span>
              <span style={{ fontSize: 12, color: "#3a5570" }}>按授权题库继续刷题</span>
            </div>
            <div className="debao-my-qb-grid debao-my-qb-grid-objective" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
              {objectiveBanks.map(renderBankCard)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════ MY NOTES PAGE ══════════════════════ */

function MyNotesPage({
  setPage,
  goToCourse,
  courses,
}: {
  setPage: (p: string) => void;
  goToCourse: (c: AppCourse) => void;
  courses: AppCourse[];
}) {
  const [notes, setNotes] = useState<UserCourseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "audio" | "video">("all");

  useEffect(() => {
    let active = true;

    const loadNotes = async () => {
      setLoading(true);
      setError("");
      try {
        const list = await courseService.getCourseNotes();
        if (!active) return;
        setNotes(list);
      } catch (err) {
        if (!active) return;
        setNotes([]);
        setError(err instanceof Error ? err.message : "学习笔记加载失败");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadNotes();

    return () => {
      active = false;
    };
  }, []);

  const filteredNotes = notes.filter((note) => {
    const matchMedia = mediaFilter === "all" || note.mediaType === mediaFilter;
    const text = `${note.courseName} ${note.mediaName} ${note.content}`.toLowerCase();
    const matchKeyword = !keyword.trim() || text.includes(keyword.trim().toLowerCase());
    return matchMedia && matchKeyword;
  });

  const openNoteCourse = (note: UserCourseNote) => {
    const target = courses.find((course) => `${course.id}` === `${note.courseId}`);
    if (target) {
      goToCourse(target);
      return;
    }
    setPage("courses");
  };

  const noteStats = [
    { label: "全部笔记", value: notes.length, color: "#c97ef5" },
    { label: "音频课", value: notes.filter(note => note.mediaType === "audio").length, color: "#c9973e" },
    { label: "视频课", value: notes.filter(note => note.mediaType === "video").length, color: "#4e8ef7" },
  ];

  return (
    <div className="debao-my-notes-page debao-themed-page" style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 36px 72px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => setPage("myProfile")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 13, color: "#5a7898" }}>
          <ChevronLeft size={14} /> 我的
        </button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
        <div>
          <h1 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 24, fontWeight: 700, color: "#dde4f0", margin: 0 }}>我的笔记</h1>
          <div style={{ fontSize: 12, color: "#3a5570", marginTop: 5 }}>课程学习页保存的笔记会同步到这里。</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 18 }}>
        {noteStats.map(item => (
          <div key={item.label} style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#3a5570", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 800, color: item.color }}>{loading ? "..." : item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 320px" }}>
          <Search size={14} color="#3a5570" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="搜索课程、课时或笔记内容"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px 10px 36px", borderRadius: 11, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#dde4f0", fontSize: 13, outline: "none" }}
          />
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {([
            ["all", "全部"],
            ["audio", "音频"],
            ["video", "视频"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMediaFilter(key)}
              style={{
                padding: "8px 15px",
                borderRadius: 999,
                border: mediaFilter === key ? "1px solid rgba(201,151,62,0.45)" : "1px solid rgba(255,255,255,0.08)",
                background: mediaFilter === key ? "rgba(201,151,62,0.12)" : "rgba(255,255,255,0.035)",
                color: mediaFilter === key ? "#c9973e" : "#5a7898",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(247,169,78,0.08)", border: "1px solid rgba(247,169,78,0.2)", color: "#f7a94e", fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "34px 24px", color: "#5a7898", textAlign: "center" }}>
          正在读取学习笔记...
        </div>
      ) : filteredNotes.length === 0 ? (
        <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "42px 24px", color: "#5a7898", textAlign: "center" }}>
          <PenLine size={30} color="#3a5570" style={{ margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, color: "#8fa3be", fontWeight: 700, marginBottom: 6 }}>{notes.length === 0 ? "还没有学习笔记" : "没有匹配的笔记"}</div>
          <div style={{ fontSize: 12, color: "#3a5570" }}>进入音频课或视频课，在学习笔记区域保存后会显示在这里。</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredNotes.map(note => {
            const isAudio = note.mediaType === "audio";
            const color = isAudio ? "#c9973e" : "#4e8ef7";
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => openNoteCourse(note)}
                style={{ textAlign: "left", background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "18px 20px", cursor: "pointer", display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 16, alignItems: "start" }}
                onMouseEnter={event => {
                  const el = event.currentTarget as HTMLElement;
                  el.style.borderColor = `${color}45`;
                  el.style.background = `linear-gradient(135deg,${color}08,#0f1826)`;
                }}
                onMouseLeave={event => {
                  const el = event.currentTarget as HTMLElement;
                  el.style.borderColor = "rgba(255,255,255,0.07)";
                  el.style.background = "#0f1826";
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}14`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isAudio ? <Volume2 size={18} color={color} /> : <PlayCircle size={18} color={color} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 7 }}>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: `${color}14`, color, fontWeight: 800 }}>{isAudio ? "音频课" : "视频课"}</span>
                    <span style={{ fontSize: 12, color: "#3a5570" }}>{note.updatedAt || note.createdAt}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#dde4f0", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.mediaName || "未命名课时"}</div>
                  <div style={{ fontSize: 12, color: "#5a7898", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.courseName || "课程"}</div>
                  <div style={{ fontSize: 13, color: "#8fa3be", lineHeight: 1.7, whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{note.content || "空笔记"}</div>
                </div>
                <ChevronRight size={16} color="#3a5570" style={{ marginTop: 12 }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ MY PROFILE PAGE ══════════════════════ */

function MyProfilePage({
  setPage,
  goToCourse,
  currentUser,
  courses,
  openMockExamRoom,
  navigateToPath,
  homeConfig,
  notify,
  studySummary,
  loadingStudySummary,
  initialTab = "study",
}: {
  setPage: (p: string) => void;
  goToCourse: (c: AppCourse) => void;
  currentUser: LegacyUser | null;
  courses: AppCourse[];
  openMockExamRoom: (target: MockExamSessionTarget) => void;
  navigateToPath: (path: string, state?: Record<string, unknown>) => void;
  homeConfig: UserHomeConfig;
  notify: Notify;
  studySummary: UserStudySummary;
  loadingStudySummary: boolean;
  initialTab?: "study" | "courses" | "banks" | "exams" | "orders";
}) {
  const [tab, setTab] = useState<"study" | "courses" | "banks" | "exams" | "orders">(initialTab);
  const [recordType, setRecordType] = useState<"obj" | "sub">("obj");
  const [subjectiveRecordFilter, setSubjectiveRecordFilter] = useState<"all" | "pending" | "reviewed" | "plain">("all");
  const [mockExamHistory, setMockExamHistory] = useState<MockExamHistoryItem[]>([]);
  const [loadingMockExamHistory, setLoadingMockExamHistory] = useState(false);
  const [mockExamHistoryError, setMockExamHistoryError] = useState("");
  const [profileQuestionBanks, setProfileQuestionBanks] = useState<QuestionBankBook[]>([]);
  const [loadingProfileQuestionBanks, setLoadingProfileQuestionBanks] = useState(false);
  const [profileQuestionBankError, setProfileQuestionBankError] = useState("");
  const displayName = getDisplayName(currentUser);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const profileTabs = [
    { key: "study",   label: "学习中心" },
    { key: "courses", label: "我的课程" },
    { key: "banks",   label: "我的题库" },
    { key: "exams",   label: "我的考试" },
    { key: "orders",  label: "订单记录" },
  ] as const;

  const weekData = studySummary.weekData.length > 0
    ? studySummary.weekData
    : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map(day => ({ day, date: "", seconds: 0, hours: 0 }));
  const maxHours = Math.max(1, ...weekData.map(d => d.hours));

  const recentActivity = studySummary.recentActivity.map((activity) => {
    const meta = getActivityIconMeta(activity.type);
    return {
      icon: meta.icon,
      color: meta.color,
      text: activity.title,
      time: activity.relativeTime || activity.occurredAt,
      detail: activity.detail,
    };
  });

  const sourceCourses = courses;
  const enrolledCourses = sourceCourses.filter(c => c.enrolled);
  const announcementConfig = homeConfig.memberHome.announcement;
  const learningAnnouncements = (announcementConfig.items || [])
    .filter((item) => item.isVisible !== false && (item.title || item.description))
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0))
    .slice(0, 8)
    .map((item, index) => ({
      id: `${index}-${item.title || item.description}`,
      tag: item.tag || announcementConfig.badge || "公告",
      color: item.color || "#4e8ef7",
      text: item.description || item.title,
      title: item.title,
      time: item.time || "",
      link: item.link || "",
    }));

  const openAnnouncement = (link: string) => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) {
      window.open(link, "_blank", "noopener,noreferrer");
      return;
    }
    if (link.startsWith("/")) {
      navigateToPath(link, { page: pathToPage(link) });
      return;
    }
    notify(link, "info");
  };

  const studyStats = [
    { label: "累计练题", value: formatCount(studySummary.stats.totalPracticeCount), unit: "题", color: "#4e8ef7" },
    { label: "答题正确率", value: studySummary.stats.accuracyRate === null ? "-" : `${studySummary.stats.accuracyRate}`, unit: studySummary.stats.accuracyRate === null ? "" : "%", color: "#1dc9a4" },
    { label: "累计学习", value: formatHours(studySummary.stats.learnedHours), unit: "小时", color: "#c9973e" },
    { label: "本周学习", value: formatHours(studySummary.stats.weekLearnedHours), unit: "小时", color: "#c97ef5" },
  ];

  const orders = studySummary.orders;
  const heatmapDays = studySummary.heatmapDays.length > 0
    ? studySummary.heatmapDays
    : Array.from({ length: 35 }, () => ({ date: "", count: 0 }));

  const heatColor = (n: number) => {
    if (n === 0) return "rgba(255,255,255,0.04)";
    if (n < 20)  return "rgba(29,201,164,0.2)";
    if (n < 50)  return "rgba(29,201,164,0.45)";
    return "rgba(29,201,164,0.8)";
  };

  const unlocked = profileQuestionBanks.map(bank => ({
    id: bank.id,
    book: bank.name,
    publisher: bank.publisher,
    color: bank.color,
    bankName: bank.name,
    total: bank.progress.totalCount,
    done: bank.progress.answeredCount,
    tags: bank.tags,
  }));

  useEffect(() => {
    if (tab !== "banks") return;

    let active = true;
    setLoadingProfileQuestionBanks(true);
    setProfileQuestionBankError("");

    const loadBanks = async () => {
      try {
        const nextBanks = await questionBankService.getMyQuestionBanks();
        if (!active) return;
        setProfileQuestionBanks(nextBanks);
      } catch (error) {
        if (!active) return;
        setProfileQuestionBanks([]);
        setProfileQuestionBankError(error instanceof Error ? error.message : "题库加载失败");
      } finally {
        if (active) setLoadingProfileQuestionBanks(false);
      }
    };

    void loadBanks();

    return () => {
      active = false;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "exams") return;

    let active = true;
    setLoadingMockExamHistory(true);
    setMockExamHistoryError("");

    const loadHistory = async () => {
      try {
        const history = await mockExamService.getHistory(recordType === "sub" ? "subjective" : "objective");
        if (!active) return;
        setMockExamHistory(history);
      } catch (error) {
        if (!active) return;
        setMockExamHistory([]);
        setMockExamHistoryError(error instanceof Error ? error.message : "考试记录加载失败");
      } finally {
        if (active) setLoadingMockExamHistory(false);
      }
    };

    void loadHistory();

    return () => {
      active = false;
    };
  }, [recordType, tab]);

  return (
    <div className="debao-my-profile-page debao-themed-page" style={{ maxWidth: 1340, margin: "0 auto", padding: "36px 36px 72px" }}>

      {/* ─── User header ─── */}
      <div className="debao-my-profile-header" style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32, padding: "28px 32px", background: "#0f1826", borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <UserAvatar user={currentUser} size={72} fontSize={28} boxShadow="0 0 0 3px rgba(29,201,164,0.25)" />
          <div style={{ position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: "50%", background: "#1dc9a4", border: "2.5px solid #0f1826" }} />
        </div>
        <div className="debao-my-profile-info" style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 20, fontWeight: 600, color: "#dde4f0" }}>{displayName}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 6, background: "rgba(201,151,62,0.15)", color: "#c9973e" }}>法考备考</span>
          </div>
          <div className="debao-my-profile-meta" style={{ display: "flex", gap: 20 }}>
            <span style={{ fontSize: 12, color: "#3a5570" }}>注册 <span style={{ color: "#c9973e", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{getAccountDays(currentUser?.registeredAt)}</span> 天</span>
            <span style={{ fontSize: 12, color: "#3a5570" }}>已开通课程 <span style={{ color: "#f76e6e", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{currentUser?.coursePermissions?.length ?? 0}</span> 个</span>
            <span style={{ fontSize: 12, color: "#3a5570" }}>授权题库 <span style={{ color: "#c97ef5", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{studySummary.stats.authorizedQuestionBankCount}</span> 个</span>
            <span style={{ fontSize: 12, color: "#3a5570" }}>账号 <span style={{ color: "#4e8ef7", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{maskPhone(currentUser?.phone)}</span></span>
          </div>
        </div>
        <div className="debao-my-profile-actions" style={{ display: "flex", gap: 12 }}>
          <button onClick={() => setPage("settings")} style={{ padding: "9px 20px", borderRadius: 11, fontSize: 13, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", color: "#8fa3be" }}>设置</button>
          <button onClick={() => setPage("editProfile")} style={{ padding: "9px 20px", borderRadius: 11, fontSize: 13, fontWeight: 600, background: "linear-gradient(90deg,#c9973e,#e8c46a)", border: "none", cursor: "pointer", color: "#090e1a" }}>编辑资料</button>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="debao-my-profile-tabs" style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 0 }}>
        {profileTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "10px 22px 12px", fontSize: 14, fontWeight: tab === t.key ? 600 : 400, border: "none", cursor: "pointer", background: "transparent", color: tab === t.key ? "#c9973e" : "#3a5570", borderBottom: tab === t.key ? "2px solid #c9973e" : "2px solid transparent", transition: "all 0.15s", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════ 学习中心 ═══════ */}
      {tab === "study" && (
        <div className="debao-my-study-layout" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24 }}>
          <div className="debao-my-study-main">
            {/* Stat cards */}
            <div className="debao-my-study-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
              {studyStats.map(s => (
                <div key={s.label} style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: "20px 18px" }}>
                  <div style={{ fontSize: 11, color: "#2e4260", marginBottom: 8 }}>{s.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 26, fontWeight: 700, color: s.color }}>{loadingStudySummary ? "..." : s.value}</span>
                    <span style={{ fontSize: 12, color: "#3a5570" }}>{loadingStudySummary ? "" : s.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Weekly bar chart */}
            <div className="debao-my-week-card" style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: "22px 24px", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#dde4f0", marginBottom: 20 }}>本周学习时长</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100 }}>
                {weekData.map(d => (
                  <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "#3a5570", fontFamily: "'JetBrains Mono',monospace" }}>{d.hours}h</span>
                    <div style={{ width: "100%", borderRadius: "4px 4px 0 0", background: `linear-gradient(to top,#4e8ef7,#1dc9a4)`, height: `${(d.hours / maxHours) * 80}px`, minHeight: 3 }} />
                    <span style={{ fontSize: 10, color: "#2e4260" }}>{d.day}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div className="debao-my-activity-card" style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: "22px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#dde4f0", marginBottom: 18 }}>最近动态</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {loadingStudySummary ? (
                  <div style={{ color: "#5a7898", fontSize: 13, padding: "8px 0" }}>正在读取学习动态...</div>
                ) : recentActivity.length === 0 ? (
                  <div style={{ color: "#5a7898", fontSize: 13, lineHeight: 1.8 }}>暂无学习动态。开始练题、听课或完成考试后会显示学习记录。</div>
                ) : recentActivity.map((a, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 14, paddingBottom: idx < recentActivity.length - 1 ? 16 : 0, marginBottom: idx < recentActivity.length - 1 ? 16 : 0, borderBottom: idx < recentActivity.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: `${a.color}18`, border: `1px solid ${a.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <a.icon size={15} color={a.color} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#c8d8ee", marginBottom: 2 }}>{a.text}</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <span style={{ fontSize: 11, color: "#2e4260" }}>{a.time}</span>
                        <span style={{ fontSize: 11, color: "#3a5570" }}>{a.detail}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="debao-my-study-sidebar" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="debao-my-announcements" style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "16px 18px 13px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: "linear-gradient(to bottom,#c9973e,#e8c46a)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 14, fontWeight: 700, color: "#dde4f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{announcementConfig.title || "学习公告"}</span>
                </div>
                <button type="button" onClick={() => notify(`当前展示 ${learningAnnouncements.length} 条学习公告`, "info")} style={{ fontSize: 11, color: "#4e8ef7", background: "none", border: "none", cursor: "pointer", opacity: 0.9, whiteSpace: "nowrap" }}>全部</button>
              </div>
              <div className="debao-my-announcement-list" style={{ maxHeight: 280, overflowY: "auto" }}>
                {learningAnnouncements.length === 0 ? (
                  <div style={{ padding: "20px 18px", color: "#4a6888", fontSize: 12, lineHeight: 1.8 }}>
                    暂无学习公告。发布后会自动显示在这里。
                  </div>
                ) : learningAnnouncements.map((a, i) => (
                  <div key={a.id} onClick={() => openAnnouncement(a.link)} style={{ padding: "13px 18px", cursor: a.link ? "pointer" : "default", display: "flex", gap: 11, borderBottom: i < learningAnnouncements.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", transition: "background 0.12s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                    <div style={{ width: 3, borderRadius: 2, background: a.color, flexShrink: 0, alignSelf: "stretch", opacity: 0.75 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: `${a.color}18`, color: a.color, letterSpacing: "0.05em" }}>{a.tag}</span>
                        <span style={{ fontSize: 10, color: "#2e4260", marginLeft: "auto", whiteSpace: "nowrap" }}>{a.time}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: "#7a9abe", lineHeight: 1.7, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Streak heatmap */}
            <div style={{ background: "linear-gradient(135deg,rgba(201,151,62,0.12),rgba(247,169,78,0.05))", borderRadius: 16, border: "1px solid rgba(201,151,62,0.16)", padding: "20px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(201,151,62,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Trophy size={17} color="#e8c46a" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#dde4f0" }}>学习时长排名</div>
                  <div style={{ fontSize: 11, color: "#5a7898", marginTop: 2 }}>按累计学习时长计算</div>
                </div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 34, fontWeight: 800, color: "#e8c46a", lineHeight: 1 }}>
                {loadingStudySummary ? "..." : `${studySummary.stats.learningHoursBeatPercent ?? 0}%`}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: "#8fa3be" }}>你的学习时长超越了以上比例的学员</div>
            </div>
            <div className="debao-my-heatmap-card" style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: "20px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#dde4f0" }}>练题热力图</span>
                <span style={{ fontSize: 11, color: "#2e4260" }}>最近35天</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {heatmapDays.map((d, i) => (
                  <div key={i} title={d.date ? `${d.date} · ${d.count}题` : `${d.count}题`} style={{ aspectRatio: "1", borderRadius: 3, background: heatColor(d.count) }} />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                <span style={{ fontSize: 10, color: "#1e3050" }}>少</span>
                {[0, 15, 35, 60].map(n => (
                  <div key={n} style={{ width: 10, height: 10, borderRadius: 2, background: heatColor(n) }} />
                ))}
                <span style={{ fontSize: 10, color: "#1e3050" }}>多</span>
              </div>
            </div>

            {/* Quick links */}
            <div className="debao-my-quick-links" style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: "20px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#dde4f0", marginBottom: 14 }}>快捷入口</div>
              {[
                { icon: BookOpen, label: "去刷题", color: "#4e8ef7", page: "questionBankHome" },
                { icon: Play,     label: "继续学课", color: "#c9973e", page: "courses" },
                { icon: Target,   label: "我的错题", color: "#f76e6e", page: "questionBankHome" },
              ].map(q => (
                <button key={q.label} onClick={() => setPage(q.page)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 11, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: `${q.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <q.icon size={14} color={q.color} />
                  </div>
                  <span style={{ fontSize: 13, color: "#8fa3be" }}>{q.label}</span>
                  <ChevronRight size={13} color="#2e4260" style={{ marginLeft: "auto" }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 我的课程 ═══════ */}
      {tab === "courses" && (
        <div className="debao-my-courses-tab">
          <div className="debao-my-course-list" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {enrolledCourses.map(c => (
              <div className="debao-my-course-row" key={c.id} style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "22px 24px", display: "flex", gap: 20, alignItems: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(145deg,${c.color}40,${c.color}20)`, border: `1px solid ${c.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Serif SC',serif", fontWeight: 700, fontSize: 20, color: c.color, flexShrink: 0 }}>
                  {c.initials}
                </div>
                <div className="debao-my-course-row-main" style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 16, fontWeight: 600, color: "#dde4f0" }}>{c.title}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: `${c.color}15`, color: c.color }}>{c.tag || c.category}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: "#3a5570" }}>主讲：{c.teacher}</span>
                    <span style={{ fontSize: 12, color: "#3a5570" }}>共 {c.lessons} 讲</span>
                    <span style={{ fontSize: 12, color: "#3a5570" }}>已学 {c.done} 讲</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${c.progress}%`, background: `linear-gradient(90deg,${c.color}80,${c.color})`, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#3a5570", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{c.progress}%</span>
                  </div>
                </div>
                <button className="debao-my-course-row-action" onClick={() => goToCourse(c)}
                  style={{ padding: "10px 22px", borderRadius: 11, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: `linear-gradient(90deg,${c.color}dd,${c.color})`, color: "#fff", flexShrink: 0 }}>
                  继续学习
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ 我的题库 ═══════ */}
      {tab === "banks" && (
        <div className="debao-my-banks-tab">
          <div className="debao-my-banks-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#dde4f0" }}>
              {loadingProfileQuestionBanks ? "题库加载中" : `已开通题库 ${unlocked.length} 个`}
            </span>
            <button onClick={() => setPage("myQuestionBank")}
              style={{ fontSize: 12, color: "#4e8ef7", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              管理全部题库 <ChevronRight size={13} />
            </button>
          </div>
          {profileQuestionBankError ? (
            <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(247,169,78,0.08)", border: "1px solid rgba(247,169,78,0.2)", color: "#f7a94e", fontSize: 13 }}>
              {profileQuestionBankError}
            </div>
          ) : null}
          {!loadingProfileQuestionBanks && unlocked.length === 0 && !profileQuestionBankError ? (
            <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "28px 24px", color: "#5a7898", fontSize: 13 }}>
              当前账号还没有开通授权题库。开通后，这里会显示可练习的题库和进度。
            </div>
          ) : null}
          <div className="debao-my-banks-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {unlocked.map(b => {
              const pct = b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
              return (
                <div className="debao-my-bank-card" key={b.id} style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
                  <div style={{ background: `linear-gradient(135deg,${b.color}22,${b.color}08)`, borderBottom: `1px solid ${b.color}20`, padding: "18px 20px 14px", position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: b.color, opacity: 0.7 }} />
                    <div style={{ paddingLeft: 5 }}>
                      <div style={{ fontSize: 11, color: `${b.color}cc`, fontWeight: 600, marginBottom: 3 }}>{b.publisher}</div>
                      <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 14, fontWeight: 600, color: "#dde4f0" }}>{b.bankName}</div>
                    </div>
                  </div>
                  <div style={{ padding: "14px 20px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: "#3a5570" }}>{b.done}/{b.total} 题</span>
                      <span style={{ fontSize: 11, color: "#3a5570", fontFamily: "'JetBrains Mono',monospace" }}>{pct}%</span>
                    </div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${b.color}80,${b.color})`, borderRadius: 2 }} />
                    </div>
                    <button onClick={() => setPage("questionBank")}
                      style={{ width: "100%", padding: "9px", borderRadius: 10, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: `linear-gradient(90deg,${b.color}cc,${b.color})`, color: "#fff" }}>
                      {b.done > 0 ? "继续练习" : "开始练习"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ 我的考试 ═══════ */}
      {tab === "exams" && (() => {
        const activeRecords = mockExamHistory;
        const isObjective = recordType === "obj";
        const submittedRecords = activeRecords.filter(record => record.status === "submitted");
        const inProgressRecords = activeRecords.filter(record => record.status === "in_progress");
        const pendingReviewRecords = activeRecords.filter(record => record.paper.paperType === "subjective" && record.reviewVisibleToUser);
        const reviewedSubjectiveRecords = activeRecords.filter(record => record.paper.paperType === "subjective" && record.reviewEnabled && record.reviewStatus === "published");
        const plainSubjectiveRecords = activeRecords.filter(record => record.paper.paperType === "subjective" && (!record.reviewEnabled || record.reviewStatus === "not_required"));
        const completedRecords = activeRecords.filter(record => record.status === "submitted" && !record.reviewVisibleToUser);
        const visibleRecords =
          recordType === "sub"
            ? activeRecords.filter((record) => {
                if (subjectiveRecordFilter === "pending") return record.reviewVisibleToUser;
                if (subjectiveRecordFilter === "reviewed") return record.reviewEnabled && record.reviewStatus === "published";
                if (subjectiveRecordFilter === "plain") return !record.reviewEnabled || record.reviewStatus === "not_required";
                return true;
              })
            : activeRecords;

        const getRecordStatus = (record: MockExamHistoryItem) => {
          if (record.status === "in_progress") {
            return { label: "未交卷", color: "#4e8ef7", background: "rgba(78,142,247,0.12)", border: "rgba(78,142,247,0.24)" };
          }
          if (record.paper.paperType === "objective") {
            return { label: "已完成", color: "#1dc9a4", background: "rgba(29,201,164,0.12)", border: "rgba(29,201,164,0.22)" };
          }
          if (record.reviewStatus === "published") {
            return { label: "已批改", color: "#1dc9a4", background: "rgba(29,201,164,0.12)", border: "rgba(29,201,164,0.22)" };
          }
          if (record.reviewStatus === "not_required" || !record.reviewEnabled) {
            return { label: "不参与批改", color: "#8fa3be", background: "rgba(143,163,190,0.1)", border: "rgba(143,163,190,0.18)" };
          }
          if (record.reviewStatus === "ai_processing") {
            return { label: "AI批改中", color: "#f7a94e", background: "rgba(247,169,78,0.12)", border: "rgba(247,169,78,0.24)" };
          }
          if (record.reviewStatus === "manual_pending") {
            return { label: "待老师批改", color: "#f7a94e", background: "rgba(247,169,78,0.12)", border: "rgba(247,169,78,0.24)" };
          }
          return { label: "待批改", color: "#f7a94e", background: "rgba(247,169,78,0.12)", border: "rgba(247,169,78,0.24)" };
        };

        const getRecordTarget = (record: MockExamHistoryItem): MockExamSessionTarget => {
          if (record.status === "in_progress") {
            return {
              recordId: record.id,
              mode: record.paper.paperType === "subjective" ? "subjective" : "objective",
            };
          }
          return null;
        };

        const getRecordDetailPath = (record: MockExamHistoryItem) =>
          record.reviewVisibleToUser
            ? `/user/my-exams/records/${encodeURIComponent(record.id)}/review-pending`
            : `/user/my-exams/records/${encodeURIComponent(record.id)}/result`;

        const openRecord = (record: MockExamHistoryItem) => {
          const target = getRecordTarget(record);
          if (target) {
            openMockExamRoom(target);
            return;
          }
          navigateToPath(getRecordDetailPath(record), { page: "myProfile", recordId: record.id });
        };

        const getActionLabel = (record: MockExamHistoryItem) => {
          if (record.status === "in_progress") return "继续考试";
          if (record.paper.paperType === "objective") return "查看解析";
          if (record.reviewVisibleToUser) return "查看批改进度";
          if (record.reviewStatus === "published") return "查看批改报告";
          return "查看作答记录";

          if (record.status === "in_progress") return "继续考试";
          if (record.reviewVisibleToUser) return "查看进度";
          if (record.paper.paperType === "subjective" && record.reviewStatus === "published") return "查看批改";
          return "查看结果";
        };

        return (
          <div className="debao-my-exams-tab">
            <div className="debao-my-exams-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, marginBottom: 22, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 22, fontWeight: 700, color: "#dde4f0", marginBottom: 8 }}>我的考试列表</div>
                <div className="debao-my-exam-type-tabs" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {([
                    ["obj", "客观题记录", "模考成绩 / 答案解析"],
                    ["sub", "主观题批改", "批改状态 / 批改详情"],
                  ] as const).map(([k, label, desc]) => (
                    <button
                      className={`debao-my-exam-type-tab ${recordType === k ? "is-active" : ""}`}
                      key={k}
                      type="button"
                      onClick={() => setRecordType(k)}
                      style={{
                        width: 176,
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: recordType === k ? "1px solid rgba(201,151,62,0.58)" : "1px solid rgba(255,255,255,0.07)",
                        background: recordType === k ? "linear-gradient(135deg,rgba(201,151,62,0.18),rgba(15,24,38,0.96))" : "rgba(255,255,255,0.035)",
                        color: recordType === k ? "#f2d892" : "#8fa3be",
                        cursor: "pointer",
                        boxShadow: recordType === k ? "0 12px 30px rgba(201,151,62,0.08)" : "none",
                      }}
                    >
                      <span style={{ display: "block", fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{label}</span>
                      <span style={{ display: "block", fontSize: 11, color: recordType === k ? "#c9973e" : "#3a5570" }}>{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setPage(recordType === "sub" ? "subjectiveGrading" : "mockExamHome")}
                style={{ padding: "11px 18px", borderRadius: 12, border: "1px solid rgba(201,151,62,0.32)", background: "rgba(201,151,62,0.12)", color: "#c9973e", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                {recordType === "sub" ? "进入主观批改" : "进入客观模考"}
              </button>
            </div>

            <div className="debao-my-exam-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 18 }}>
              {[
                { label: "全部记录", value: activeRecords.length, color: "#4e8ef7" },
                { label: "已交卷", value: submittedRecords.length, color: "#1dc9a4" },
                { label: isObjective ? "进行中" : "待批改", value: isObjective ? inProgressRecords.length : pendingReviewRecords.length, color: "#f7a94e" },
                { label: isObjective ? "已完成" : "已出结果", value: completedRecords.length, color: "#c9973e" },
              ].map(item => (
                <div key={item.label} style={{ background: "#0f1826", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: "#3a5570", marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {loadingMockExamHistory && (
              <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: 22, color: "#5a7898" }}>
                正在加载得宝考试记录...
              </div>
            )}

            {!loadingMockExamHistory && mockExamHistoryError && (
              <div style={{ background: "rgba(247,110,110,0.08)", borderRadius: 16, border: "1px solid rgba(247,110,110,0.22)", padding: 22, color: "#f76e6e" }}>
                {mockExamHistoryError}
              </div>
            )}

            {recordType === "sub" && (
              <div className="debao-my-subjective-filters" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                {([
                  ["all", "全部", activeRecords.length],
                  ["pending", "待批改", pendingReviewRecords.length],
                  ["reviewed", "已批改", reviewedSubjectiveRecords.length],
                  ["plain", "普通记录", plainSubjectiveRecords.length],
                ] as const).map(([key, label, count]) => (
                  <button
                    className={`debao-my-subjective-filter ${subjectiveRecordFilter === key ? "is-active" : ""}`}
                    key={key}
                    type="button"
                    onClick={() => setSubjectiveRecordFilter(key)}
                    style={{
                      padding: "8px 13px",
                      borderRadius: 999,
                      border: subjectiveRecordFilter === key ? "1px solid rgba(201,151,62,0.55)" : "1px solid rgba(255,255,255,0.08)",
                      background: subjectiveRecordFilter === key ? "rgba(201,151,62,0.16)" : "rgba(255,255,255,0.035)",
                      color: subjectiveRecordFilter === key ? "#f2d892" : "#8fa3be",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {label} · {count}
                  </button>
                ))}
              </div>
            )}

            {!loadingMockExamHistory && !mockExamHistoryError && visibleRecords.length > 0 && (
              <div className="debao-my-exam-records" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {visibleRecords.map(record => {
                  const total = record.paper.totalScore || 100;
                  const accuracy = record.questionCount > 0 ? Math.round((record.correctCount / record.questionCount) * 100) : 0;
                  const status = getRecordStatus(record);
                  const isSubjectiveRecord = record.paper.paperType === "subjective";
                  const scorePending = record.status === "in_progress" || record.reviewVisibleToUser;
                  const scoreColor = record.totalScore >= total * 0.75 ? "#1dc9a4" : record.totalScore >= total * 0.6 ? "#c9973e" : "#f76e6e";
                  return (
                    <button
                      className="debao-my-exam-record"
                      key={record.id}
                      type="button"
                      onClick={() => openRecord(record)}
                      style={{
                        textAlign: "left",
                        background: "linear-gradient(135deg,rgba(15,24,38,0.98),rgba(10,16,32,0.98))",
                        borderRadius: 18,
                        border: `1px solid ${status.border}`,
                        padding: "20px 22px",
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) auto",
                        gap: 22,
                        alignItems: "center",
                        cursor: "pointer",
                        boxShadow: "0 16px 36px rgba(0,0,0,0.12)",
                      }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
                          <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 7, fontWeight: 800, background: isSubjectiveRecord ? "rgba(29,201,164,0.12)" : "rgba(201,126,245,0.12)", color: isSubjectiveRecord ? "#1dc9a4" : "#c97ef5" }}>
                            {isSubjectiveRecord ? "主观题批改" : "客观题模考"}
                          </span>
                          <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 7, fontWeight: 800, background: status.background, color: status.color }}>
                            {status.label}
                          </span>
                          <span style={{ fontSize: 11, color: "#3a5570" }}>第 {record.attemptNo} 次</span>
                          {record.paper.year ? <span style={{ fontSize: 11, color: "#3a5570" }}>{record.paper.year}</span> : null}
                        </div>
                        <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 16, fontWeight: 700, color: "#dde4f0", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {record.paper.title}
                        </div>
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "#5a7898" }}>交卷：{record.status === "in_progress" ? "未交卷" : record.submittedAt || "未记录"}</span>
                          <span style={{ fontSize: 12, color: "#5a7898" }}>用时：{formatDuration(record.consumedSeconds)}</span>
                          <span style={{ fontSize: 12, color: "#5a7898" }}>作答：{record.answeredCount}/{record.questionCount} 题</span>
                          {isSubjectiveRecord ? (
                            <span style={{ fontSize: 12, color: "#5a7898" }}>批改：{status.label}</span>
                          ) : (
                            <>
                              <span style={{ fontSize: 12, color: "#5a7898" }}>正确：{record.correctCount}/{record.questionCount} 题</span>
                              <span style={{ fontSize: 12, color: "#5a7898" }}>正确率：{accuracy}%</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 18, justifyContent: "flex-end" }}>
                        <div style={{ minWidth: 92, textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#3a5570", marginBottom: 4 }}>{scorePending ? "结果" : "得分"}</div>
                          {scorePending ? (
                            <div style={{ fontSize: 14, fontWeight: 800, color: status.color }}>{record.status === "in_progress" ? "未交卷" : "待批改"}</div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 2 }}>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 800, color: scoreColor }}>{record.totalScore}</span>
                              <span style={{ fontSize: 12, color: "#3a5570" }}>/{total}</span>
                            </div>
                          )}
                        </div>
                        <span style={{ minWidth: 86, textAlign: "center", fontSize: 12, padding: "8px 12px", borderRadius: 10, fontWeight: 800, background: "rgba(201,151,62,0.14)", color: "#c9973e", border: "1px solid rgba(201,151,62,0.22)" }}>
                          {getActionLabel(record)}
                        </span>
                        <ChevronRight size={18} color="#3a5570" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {!loadingMockExamHistory && !mockExamHistoryError && visibleRecords.length === 0 && (
              <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: "34px 24px", color: "#5a7898", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#8fa3be", marginBottom: 8 }}>暂无{recordType === "obj" ? "客观题记录" : "主观题批改记录"}</div>
                <div style={{ fontSize: 12, color: "#3a5570", marginBottom: 18 }}>完成一套{recordType === "obj" ? "客观题模考" : "主观题试卷"}后，记录会显示在这里。</div>
                <button
                  type="button"
                  onClick={() => setPage(recordType === "sub" ? "subjectiveGrading" : "mockExamHome")}
                  style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(201,151,62,0.28)", background: "rgba(201,151,62,0.12)", color: "#c9973e", cursor: "pointer", fontSize: 13, fontWeight: 800 }}
                >
                  {recordType === "sub" ? "去主观批改" : "去客观模考"}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══════ 订单记录 ═══════ */}
      {tab === "orders" && (
        <div className="debao-my-orders-tab">
          {loadingStudySummary ? (
            <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: "24px", color: "#5a7898", fontSize: 13 }}>
              正在读取订单记录...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: "28px 24px", color: "#5a7898", fontSize: 13 }}>
              暂无订单记录。购买课程、题库或资料后，订单会显示在这里。
            </div>
          ) : null}
          <div className="debao-my-order-list" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {orders.map(o => (
              <div className="debao-my-order-row" key={o.id} style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", padding: "20px 24px", display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 15, fontWeight: 600, color: "#dde4f0" }}>{o.name}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "rgba(78,142,247,0.12)", color: "#4e8ef7" }}>{o.type}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <span style={{ fontSize: 12, color: "#2e4260" }}>订单号：{o.orderNo || o.id}</span>
                    <span style={{ fontSize: 12, color: "#2e4260" }}>{formatDateOnly(o.paidAt || o.createdAt)}</span>
                    <span style={{ fontSize: 12, color: "#2e4260" }}>共 {o.itemCount} 项</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "#2e4260", marginBottom: 3 }}>实付金额</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                      <span style={{ fontSize: 11, color: "#c9973e" }}>¥</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: "#c9973e" }}>{formatCurrency(o.amount)}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 7, background: "rgba(29,201,164,0.1)", color: "#1dc9a4", fontWeight: 600 }}>{o.statusLabel || o.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

/* ══════════════════════ EDIT PROFILE PAGE ══════════════════════ */

function EditProfilePage({ setPage, currentUser, onUserUpdated, notify }: { setPage: (p: string) => void; currentUser: LegacyUser | null; onUserUpdated: (user: LegacyUser) => void; notify: Notify }) {
  const [nickname, setNickname] = useState(getDisplayName(currentUser));
  const [phone] = useState(maskPhone(currentUser?.phone));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNickname(getDisplayName(currentUser));
  }, [currentUser]);

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!USER_AVATAR_MIME_TYPES.has(file.type)) {
      notify("头像仅支持 JPG、PNG、WebP 格式", "warning");
      return;
    }

    if (file.size > USER_AVATAR_MAX_FILE_SIZE) {
      notify("头像不能超过 2MB", "warning");
      return;
    }

    setAvatarUploading(true);
    try {
      const uploadedUser = await userService.uploadAvatar(file);
      const refreshedUser = await userService.getCurrentUser().catch(() => uploadedUser);
      updateUserProfileSession({ displayName: getDisplayName(refreshedUser), avatarUrl: refreshedUser.avatarUrl || "" });
      onUserUpdated(refreshedUser);
      notify("头像已更新", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "头像上传失败", "warning");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    const nextNickname = nickname.trim();
    if (!nextNickname) {
      notify("昵称不能为空", "warning");
      return;
    }

    setSaving(true);
    try {
      const updated = await userService.updateProfile({ nickname: nextNickname });
      updateUserProfileSession({ displayName: getDisplayName(updated), avatarUrl: updated.avatarUrl || "" });
      onUserUpdated(updated);
      setSaved(true);
      notify("资料已保存", "success");
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      notify(err instanceof Error ? err.message : "资料保存失败", "warning");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "11px 14px", borderRadius: 11, fontSize: 14, color: "#dde4f0",
    background: "#0a1020", border: "1px solid rgba(255,255,255,0.09)", outline: "none",
    fontFamily: "'Noto Sans SC',sans-serif", boxSizing: "border-box" as const,
  };

  const labelStyle = { fontSize: 12, color: "#3a5570", marginBottom: 7, display: "block", fontWeight: 600, letterSpacing: "0.03em" };

  return (
    <div className="debao-edit-profile-page debao-themed-page" style={{ maxWidth: 840, margin: "0 auto", padding: "36px 36px 72px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <button onClick={() => setPage("myProfile")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 13, color: "#5a7898" }}>
          <ChevronLeft size={14} /> 我的
        </button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: "linear-gradient(to bottom,#c9973e,#e8c46a)" }} />
          <h1 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 20, fontWeight: 600, color: "#dde4f0" }}>编辑资料</h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 28 }}>

        {/* Avatar column */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative" }}>
            <UserAvatar user={currentUser} size={96} fontSize={36} boxShadow="0 0 0 3px rgba(29,201,164,0.2)" />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              style={{ position: "absolute", right: -6, bottom: -4, width: 34, height: 34, borderRadius: "50%", border: "2px solid #0f1826", background: "linear-gradient(145deg,#c9973e,#e8c46a)", color: "#090e1a", display: "flex", alignItems: "center", justifyContent: "center", cursor: avatarUploading ? "wait" : "pointer", opacity: avatarUploading ? 0.7 : 1 }}
              title="更换头像"
            >
              <PenLine size={15} />
            </button>
            <input ref={avatarInputRef} type="file" accept={USER_AVATAR_ACCEPT} onChange={handleAvatarChange} style={{ display: "none" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#3a5570", marginBottom: 6 }}>当前头像</div>
            <div style={{ fontSize: 11, color: "#2e4260" }}>{avatarUploading ? "头像上传中..." : "支持 JPG、PNG、WebP，最大 2MB"}</div>
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            style={{ width: "100%", padding: "9px 14px", borderRadius: 10, background: "rgba(201,151,62,0.12)", border: "1px solid rgba(201,151,62,0.28)", cursor: avatarUploading ? "wait" : "pointer", color: "#e8c46a", fontSize: 12, fontWeight: 700 }}
          >
            {avatarUploading ? "上传中..." : "上传新头像"}
          </button>
          <div style={{ width: "100%", padding: "14px", borderRadius: 12, background: "#0f1826", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 11, color: "#2e4260", marginBottom: 8 }}>账号信息</div>
            <div style={{ fontSize: 12, color: "#5a7898", marginBottom: 4 }}>UID：<span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#3a5570" }}>{currentUser?.id || "-"}</span></div>
            <div style={{ fontSize: 12, color: "#5a7898" }}>注册时间：{currentUser?.registeredAt || "-"}</div>
          </div>
        </div>

        {/* Form column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Basic info card */}
          <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "24px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#dde4f0", marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>基本信息</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>昵称</label>
                <input value={nickname} onChange={e => setNickname(e.target.value)} style={inputStyle} maxLength={20} />
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 11, background: "rgba(78,142,247,0.07)", border: "1px solid rgba(78,142,247,0.14)", color: "#5a7898", fontSize: 12, lineHeight: 1.8 }}>
                当前仅支持修改昵称。手机号、注册时间和账号状态随账号信息展示。
              </div>
            </div>
          </div>

          {/* Contact card */}
          <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "24px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#dde4f0", marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>联系方式</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>手机号</label>
                <input value={phone} readOnly style={{ ...inputStyle, color: "#5a7898" }} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button onClick={() => setPage("myProfile")}
              style={{ padding: "11px 24px", borderRadius: 11, fontSize: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", color: "#5a7898" }}>
              取消
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: "11px 32px", borderRadius: 11, fontSize: 14, fontWeight: 600, border: "none", cursor: saving ? "wait" : "pointer", background: saved ? "rgba(29,201,164,0.15)" : "linear-gradient(90deg,#c9973e,#e8c46a)", color: saved ? "#1dc9a4" : "#090e1a", transition: "all 0.2s" }}>
              {saving ? "保存中..." : saved ? "✓ 已保存" : "保存修改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ SUBJECTIVE GRADING DATA ══════════════════════ */

type DebaoPaperKind = "objective" | "subjective";
type MockExamPaperGroup = { key: string; label: string; papers: MockExamPaperSummary[] };
const MOCK_EXAM_SERIES_SELECTION_PREFIX = "debao:lastMockExamSeries:";
const MOCK_EXAM_SERIES_QUERY_PARAM = "seriesId";

const getPaperStatusLabel = (paper: MockExamPaperSummary) => {
  if (!paper.isOpen) return paper.openTime ? `开放时间 ${paper.openTime}` : "暂未开放";
  if (paper.activeRecord?.canResume) return "继续作答";
  if (paper.latestRecord) return "再次进入";
  return "进入考试";
};

const getPaperActionColor = (paper: MockExamPaperSummary, kind: DebaoPaperKind) => {
  if (!paper.isOpen) return "#5a7898";
  if (paper.activeRecord?.canResume) return "#f7a94e";
  return kind === "subjective" ? "#1dc9a4" : "#4e8ef7";
};

const groupMockExamPapers = (papers: MockExamPaperSummary[]) => {
  const groups = new Map<string, MockExamPaperGroup>();

  papers.forEach((paper) => {
    const key = paper.seriesId || "__default__";
    const label = paper.seriesName || "未分组试卷";
    const group = groups.get(key);

    if (group) {
      group.papers.push(paper);
      return;
    }

    groups.set(key, { key, label, papers: [paper] });
  });

  return Array.from(groups.values());
};

const getMockExamSeriesSelectionStorageKey = (kind: DebaoPaperKind) => `${MOCK_EXAM_SERIES_SELECTION_PREFIX}${kind}`;

const getCurrentMockExamSeriesQuery = () => {
  if (typeof window === "undefined") return "";

  return new URLSearchParams(window.location.search).get(MOCK_EXAM_SERIES_QUERY_PARAM) || "";
};

const setCurrentMockExamSeriesQuery = (groupKey: string) => {
  if (typeof window === "undefined") return;

  const nextUrl = new URL(window.location.href);
  if (groupKey) {
    nextUrl.searchParams.set(MOCK_EXAM_SERIES_QUERY_PARAM, groupKey);
  } else {
    nextUrl.searchParams.delete(MOCK_EXAM_SERIES_QUERY_PARAM);
  }

  window.history.replaceState(window.history.state, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
};

const getExistingMockExamSeriesSelection = (groups: MockExamPaperGroup[], groupKey: string) =>
  groups.some((group) => group.key === groupKey) ? groupKey : "";

const rememberMockExamSeriesSelection = (kind: DebaoPaperKind, groupKey: string) => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(getMockExamSeriesSelectionStorageKey(kind), groupKey);
  } catch {
    // Session storage can be unavailable in hardened browser modes.
  }
};

const takeRememberedMockExamSeriesSelection = (kind: DebaoPaperKind, groups: MockExamPaperGroup[]) => {
  if (typeof window === "undefined") return "";

  try {
    const storageKey = getMockExamSeriesSelectionStorageKey(kind);
    const groupKey = window.sessionStorage.getItem(storageKey) || "";
    const exists = groups.some((group) => group.key === groupKey);

    if (exists) {
      window.sessionStorage.removeItem(storageKey);
      return groupKey;
    }
  } catch {
    // Ignore storage failures and show the first-level suite list.
  }

  return "";
};

const getInitialMockExamSeriesSelection = (kind: DebaoPaperKind, groups: MockExamPaperGroup[]) =>
  getExistingMockExamSeriesSelection(groups, getCurrentMockExamSeriesQuery()) ||
  takeRememberedMockExamSeriesSelection(kind, groups);

function DebaoMockExamListPage({
  kind,
  setPage,
  notify,
}: {
  kind: DebaoPaperKind;
  setPage: (p: string) => void;
  notify: Notify;
}) {
  const [papers, setPapers] = useState<MockExamPaperSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState("");

  const isSubjective = kind === "subjective";
  const accent = isSubjective ? "#1dc9a4" : "#4e8ef7";
  const secondaryAccent = isSubjective ? "#c9973e" : "#c97ef5";
  const title = isSubjective ? "主观题批改" : "客观题模考";
  const subtitle = isSubjective
    ? "这里展示你已开通的主观题试卷。选择试卷后，进入机考流程完成作答与批改。"
    : "这里展示你已开通的客观题试卷。选择试卷后，进入机考流程完成限时模考。";
  const Icon = isSubjective ? FileText : Target;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelectedGroupKey("");

    const load = async () => {
      try {
        const list = await mockExamService.getPapers(kind);
        if (!active) return;
        setPapers(list);
        setSelectedGroupKey(getInitialMockExamSeriesSelection(kind, groupMockExamPapers(list)));
      } catch (err) {
        if (!active) return;
        setPapers([]);
        setError(err instanceof Error ? err.message : "试卷列表加载失败");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [kind]);

  const groupedPapers = groupMockExamPapers(papers);
  const selectedGroup = groupedPapers.find((group) => group.key === selectedGroupKey) ?? null;
  const openCount = papers.filter((paper) => paper.isOpen).length;
  const progressCount = papers.filter((paper) => paper.activeRecord?.canResume).length;
  const finishedCount = papers.filter((paper) => paper.latestRecord && !paper.activeRecord?.canResume).length;

  const goToPaper = (paper: MockExamPaperSummary) => {
    if (!paper.isOpen) {
      notify(getPaperStatusLabel(paper), "warning");
      return;
    }

    if (typeof window !== "undefined") {
      rememberMockExamSeriesSelection(kind, paper.seriesId || "__default__");
      window.location.assign(`/user/mock-exams/papers/${encodeURIComponent(paper.id)}`);
    }
  };

  const renderPaperCard = (paper: MockExamPaperSummary) => {
    const statusColor = getPaperActionColor(paper, kind);
    const sections = paper.sections.map((section) => `${section.label} ${section.count}题`).join(" · ");

    return (
      <button
        key={paper.id}
        type="button"
        className="debao-mock-paper-card"
        onClick={() => goToPaper(paper)}
        style={{ textAlign: "left", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, background: "#0f1826", overflow: "hidden", cursor: paper.isOpen ? "pointer" : "not-allowed", opacity: paper.isOpen ? 1 : 0.72, transition: "border-color 0.16s, transform 0.16s, box-shadow 0.16s" }}
        onMouseEnter={(event) => {
          const target = event.currentTarget;
          target.style.borderColor = `${accent}4a`;
          target.style.transform = "translateY(-2px)";
          target.style.boxShadow = "0 14px 34px rgba(0,0,0,0.28)";
        }}
        onMouseLeave={(event) => {
          const target = event.currentTarget;
          target.style.borderColor = "rgba(255,255,255,0.07)";
          target.style.transform = "translateY(0)";
          target.style.boxShadow = "none";
        }}
      >
        <div className="debao-mock-paper-cover" style={{ height: 132, position: "relative", background: `linear-gradient(135deg,${accent}26,${secondaryAccent}1a)` }}>
          {paper.coverUrl ? (
            <img src={paper.coverUrl} alt={paper.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={42} color={accent} />
            </div>
          )}
          <div className="debao-mock-paper-cover-shade" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(4,8,20,0.04),rgba(4,8,20,0.42))" }} />
          <span style={{ position: "absolute", left: 14, top: 12, padding: "4px 9px", borderRadius: 8, background: "rgba(5,11,22,0.62)", color: "#dde4f0", fontSize: 11, fontWeight: 700 }}>
            {isSubjective ? "主观题" : "客观题"}
          </span>
          <span style={{ position: "absolute", right: 14, top: 12, padding: "4px 9px", borderRadius: 8, background: "rgba(255,255,255,0.16)", color: "#fff", fontSize: 11, fontWeight: 700 }}>
            {paper.year || "未设年份"}
          </span>
        </div>

        <div style={{ padding: "17px 18px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color: "#3a5570", fontSize: 11 }}>{paper.phase || "机考试卷"}</span>
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#2e4260" }} />
            <span style={{ color: statusColor, fontSize: 11, fontWeight: 800 }}>{getPaperStatusLabel(paper)}</span>
          </div>
          <h3 style={{ margin: 0, minHeight: 44, color: "#dde4f0", fontSize: 15, lineHeight: 1.45, fontWeight: 800 }}>{paper.title}</h3>
          <p style={{ margin: "10px 0 0", color: "#5a7898", fontSize: 12, lineHeight: 1.7, minHeight: 40 }}>
            {paper.description || sections || "选择试卷后进入机考流程。"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
            {[
              { label: "题量", value: `${paper.questionCount || 0}` },
              { label: "时长", value: `${paper.durationMinutes || 0}分` },
              { label: "总分", value: `${paper.totalScore || 0}` },
            ].map((item) => (
              <div key={item.label} className="debao-mock-paper-stat" style={{ borderRadius: 10, background: "rgba(255,255,255,0.035)", padding: "8px 9px" }}>
                <div style={{ fontSize: 10, color: "#2e4260", marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: "#8fa3be", fontWeight: 700 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </button>
    );
  };

  const renderGroupCard = (group: MockExamPaperGroup) => {
    const groupOpenCount = group.papers.filter((paper) => paper.isOpen).length;
    const groupProgressCount = group.papers.filter((paper) => paper.activeRecord?.canResume).length;
    const groupFinishedCount = group.papers.filter((paper) => paper.latestRecord && !paper.activeRecord?.canResume).length;
    const coverPaper = group.papers.find((paper) => paper.coverUrl) ?? group.papers[0];
    const yearLabels = Array.from(new Set(group.papers.map((paper) => paper.year).filter(Boolean)));
    const phaseLabels = Array.from(new Set(group.papers.map((paper) => paper.phase).filter(Boolean))).slice(0, 3);
    const totalQuestionCount = group.papers.reduce((sum, paper) => sum + Number(paper.questionCount || 0), 0);

    return (
      <button
        key={group.key}
        type="button"
        className="debao-mock-paper-group-card"
        onClick={() => {
          setSelectedGroupKey(group.key);
          setCurrentMockExamSeriesQuery(group.key);
        }}
        style={{ textAlign: "left", border: `1px solid ${accent}24`, borderRadius: 20, background: "linear-gradient(180deg,#101b2b 0%,#0f1826 100%)", overflow: "hidden", cursor: "pointer", transition: "border-color 0.16s, transform 0.16s, box-shadow 0.16s" }}
        onMouseEnter={(event) => {
          const target = event.currentTarget;
          target.style.borderColor = `${accent}66`;
          target.style.transform = "translateY(-2px)";
          target.style.boxShadow = `0 18px 44px rgba(0,0,0,0.30), 0 0 0 1px ${accent}14`;
        }}
        onMouseLeave={(event) => {
          const target = event.currentTarget;
          target.style.borderColor = `${accent}24`;
          target.style.transform = "translateY(0)";
          target.style.boxShadow = "none";
        }}
      >
        <div className="debao-mock-paper-cover" style={{ height: 176, position: "relative", background: `linear-gradient(135deg,${accent}22,${secondaryAccent}18)` }}>
          {coverPaper?.coverUrl ? (
            <img src={coverPaper.coverUrl} alt={group.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={56} color={accent} />
            </div>
          )}
          <div className="debao-mock-paper-cover-shade" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(4,8,20,0.08),rgba(4,8,20,0.74))" }} />
          <span style={{ position: "absolute", left: 16, top: 14, padding: "5px 10px", borderRadius: 9, background: "rgba(5,11,22,0.68)", color: "#dde4f0", fontSize: 12, fontWeight: 800 }}>
            {isSubjective ? "主观题套卷" : "客观题套卷"}
          </span>
          <span style={{ position: "absolute", right: 16, top: 14, padding: "5px 10px", borderRadius: 9, background: "rgba(255,255,255,0.16)", color: "#fff", fontSize: 12, fontWeight: 800 }}>
            {yearLabels.length > 0 ? `${yearLabels.join(" / ")}年` : "未设年份"}
          </span>
          <div style={{ position: "absolute", left: 18, right: 18, bottom: 18 }}>
            <div style={{ color: `${accent}`, fontSize: 12, fontWeight: 900, marginBottom: 8 }}>{group.papers.length} 张试卷</div>
            <h3 style={{ margin: 0, color: "#fff", fontSize: 22, lineHeight: 1.35, fontWeight: 900 }}>{group.label}</h3>
          </div>
        </div>

        <div style={{ padding: "18px 20px 20px" }}>
          <p style={{ margin: 0, minHeight: 42, color: "#6d86a5", fontSize: 13, lineHeight: 1.7 }}>
            {phaseLabels.length > 0 ? phaseLabels.join(" · ") : "点击进入后选择具体试卷"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 16 }}>
            {[
              { label: "可用", value: `${groupOpenCount}` },
              { label: "继续", value: `${groupProgressCount}` },
              { label: "记录", value: `${groupFinishedCount}` },
              { label: "题量", value: `${totalQuestionCount}` },
            ].map((item) => (
              <div key={item.label} className="debao-mock-paper-stat" style={{ borderRadius: 11, background: "rgba(255,255,255,0.04)", padding: "9px 10px" }}>
                <div style={{ fontSize: 10, color: "#354b67", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: "#9db0c8", fontWeight: 800 }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, color: accent, fontSize: 13, fontWeight: 900 }}>
            <span>查看试卷</span>
            <ChevronRight size={16} />
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="debao-mock-exam-list-page debao-themed-page" style={{ maxWidth: 1340, margin: "0 auto", padding: "34px 36px 72px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 26 }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: `${accent}18`, border: `1px solid ${accent}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={20} color={accent} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: accent, fontWeight: 800, letterSpacing: "0.16em" }}>DEBAO PAPERS</div>
              <h1 style={{ margin: 0, fontFamily: "'Noto Serif SC',serif", fontSize: 30, lineHeight: 1.25, fontWeight: 700, color: "#dde4f0" }}>{title}</h1>
            </div>
          </div>
          <p style={{ margin: 0, color: "#5a7898", fontSize: 13, lineHeight: 1.8 }}>{subtitle}</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setPage("subjectiveGrading")}
            style={{ padding: "10px 16px", borderRadius: 12, border: isSubjective ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.08)", background: isSubjective ? `${accent}1f` : "rgba(255,255,255,0.03)", color: isSubjective ? accent : "#5a7898", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
          >
            主观题批改
          </button>
          <button
            onClick={() => setPage("mockExamHome")}
            style={{ padding: "10px 16px", borderRadius: 12, border: !isSubjective ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.08)", background: !isSubjective ? `${accent}1f` : "rgba(255,255,255,0.03)", color: !isSubjective ? accent : "#5a7898", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
          >
            客观题模考
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 30 }}>
        {[
          { label: "可用试卷", value: openCount, color: accent },
          { label: "继续作答", value: progressCount, color: "#f7a94e" },
          { label: "已有记录", value: finishedCount, color: "#1dc9a4" },
          { label: "全部试卷", value: papers.length, color: secondaryAccent },
        ].map((item) => (
          <div key={item.label} style={{ background: "#0f1826", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ color: "#3a5570", fontSize: 11, marginBottom: 8 }}>{item.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 800, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ background: "#0f1826", borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)", padding: 36, color: "#5a7898", textAlign: "center" }}>
          正在加载试卷列表...
        </div>
      )}

      {!loading && error && (
        <div style={{ background: "rgba(247,110,110,0.08)", borderRadius: 18, border: "1px solid rgba(247,110,110,0.24)", padding: 28, color: "#f76e6e" }}>
          {error}
        </div>
      )}

      {!loading && !error && papers.length === 0 && (
        <div style={{ background: "#0f1826", borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)", padding: 36, color: "#5a7898", textAlign: "center" }}>
          当前账号暂无{isSubjective ? "主观题批改" : "客观题模考"}试卷。
        </div>
      )}

      {!loading && !error && groupedPapers.length > 0 && !selectedGroup && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 17, color: "#dde4f0", fontWeight: 800 }}>选择套卷</h2>
            <div style={{ marginTop: 5, fontSize: 12, color: "#3a5570" }}>{groupedPapers.length} 个套卷，点击后查看该套下的具体试卷</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18 }}>
            {groupedPapers.map(renderGroupCard)}
          </div>
        </div>
      )}

      {!loading && !error && selectedGroup && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, marginBottom: 18 }}>
            <div>
              <button
                type="button"
                onClick={() => {
                  setSelectedGroupKey("");
                  setCurrentMockExamSeriesQuery("");
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", color: "#7d93ad", cursor: "pointer", fontSize: 12, fontWeight: 800, marginBottom: 12 }}
              >
                <ChevronLeft size={15} />
                返回套卷
              </button>
              <h2 style={{ margin: 0, fontSize: 22, color: "#dde4f0", fontWeight: 900 }}>{selectedGroup.label}</h2>
              <div style={{ marginTop: 6, fontSize: 12, color: "#3a5570" }}>{selectedGroup.papers.length} 张试卷，选择具体试卷后进入机考流程</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
            {selectedGroup.papers.map(renderPaperCard)}
          </div>
        </section>
      )}

    </div>
  );
}

type GradingPaper = {
  id: number; subject: string; sColor: string; no: number;
  title: string; type: string; wordLimit: number;
  status: "待作答" | "待批改" | "已批改"; score: number | null;
};
type GradingProduct = {
  id: number; title: string; subtitle: string;
  tag: string; tagColor: { bg: string; color: string }; accentColor: string;
  purchaseDate: string; papers: GradingPaper[];
};

const gradingProducts: GradingProduct[] = [
  {
    id: 1, title: "108题精批", subtitle: "2026年法考主观题全程批改计划",
    tag: "全程班", tagColor: { bg: "rgba(201,151,62,0.14)", color: "#c9973e" }, accentColor: "#c9973e",
    purchaseDate: "2026-03-01",
    papers: [
      { id: 1,  subject: "民法",   sColor: "#c9973e", no: 1,  title: "民法典总则 · 法律行为效力综合论述",     type: "论述题",   wordLimit: 800, status: "已批改", score: 74 },
      { id: 2,  subject: "民法",   sColor: "#c9973e", no: 2,  title: "物权编 · 所有权取得方式案例",           type: "案例分析", wordLimit: 700, status: "已批改", score: 68 },
      { id: 3,  subject: "民法",   sColor: "#c9973e", no: 3,  title: "合同编 · 违约责任与损害赔偿",           type: "案例分析", wordLimit: 800, status: "已批改", score: 81 },
      { id: 4,  subject: "民法",   sColor: "#c9973e", no: 4,  title: "侵权责任 · 共同侵权过错责任论述",       type: "论述题",   wordLimit: 700, status: "待批改", score: null },
      { id: 5,  subject: "民法",   sColor: "#c9973e", no: 5,  title: "婚姻家庭 · 离婚财产分割综合",           type: "综合论述", wordLimit: 600, status: "待作答", score: null },
      { id: 6,  subject: "民法",   sColor: "#c9973e", no: 6,  title: "继承编 · 遗嘱继承与法定继承比较",       type: "比较论述", wordLimit: 600, status: "待作答", score: null },
      { id: 7,  subject: "刑法",   sColor: "#f76e6e", no: 7,  title: "犯罪构成体系 · 四要件综合论述",         type: "论述题",   wordLimit: 800, status: "已批改", score: 72 },
      { id: 8,  subject: "刑法",   sColor: "#f76e6e", no: 8,  title: "共同犯罪 · 主犯从犯认定案例",           type: "案例分析", wordLimit: 700, status: "已批改", score: 65 },
      { id: 9,  subject: "刑法",   sColor: "#f76e6e", no: 9,  title: "财产犯罪 · 盗窃抢劫抢夺辨析",           type: "案例分析", wordLimit: 700, status: "待批改", score: null },
      { id: 10, subject: "刑法",   sColor: "#f76e6e", no: 10, title: "正当防卫 · 防卫过当认定与处理",         type: "案例分析", wordLimit: 800, status: "待作答", score: null },
      { id: 11, subject: "刑法",   sColor: "#f76e6e", no: 11, title: "故意杀人 · 与故意伤害致死区分论述",     type: "比较论述", wordLimit: 600, status: "待作答", score: null },
      { id: 12, subject: "行政法", sColor: "#4e8ef7", no: 12, title: "行政许可 · 设定与实施综合论述",         type: "论述题",   wordLimit: 600, status: "已批改", score: 79 },
      { id: 13, subject: "行政法", sColor: "#4e8ef7", no: 13, title: "行政处罚 · 种类与程序综合论述",         type: "综合论述", wordLimit: 700, status: "待批改", score: null },
      { id: 14, subject: "行政法", sColor: "#4e8ef7", no: 14, title: "行政复议与行政诉讼 · 受案范围比较",     type: "比较论述", wordLimit: 700, status: "待作答", score: null },
      { id: 15, subject: "民诉法", sColor: "#1dc9a4", no: 15, title: "管辖制度 · 级别管辖与地域管辖综合",     type: "综合论述", wordLimit: 500, status: "待批改", score: null },
      { id: 16, subject: "民诉法", sColor: "#1dc9a4", no: 16, title: "证据规则 · 举证期限与证明标准论述",     type: "论述题",   wordLimit: 600, status: "待作答", score: null },
      { id: 17, subject: "刑诉法", sColor: "#c97ef5", no: 17, title: "强制措施 · 逮捕与羁押制度论述",         type: "论述题",   wordLimit: 600, status: "待作答", score: null },
      { id: 18, subject: "刑诉法", sColor: "#c97ef5", no: 18, title: "辩护制度 · 辩护权保障与限制综合",       type: "综合论述", wordLimit: 500, status: "待作答", score: null },
    ],
  },
  {
    id: 2, title: "民法专项批改 · 50题", subtitle: "民法典全编专项主观题精批服务",
    tag: "专项班", tagColor: { bg: "rgba(29,201,164,0.14)", color: "#1dc9a4" }, accentColor: "#1dc9a4",
    purchaseDate: "2026-04-10",
    papers: [
      { id: 101, subject: "总则编", sColor: "#c9973e", no: 1,  title: "民事法律关系 · 构成要素综合论述",       type: "论述题",   wordLimit: 600, status: "已批改", score: 77 },
      { id: 102, subject: "总则编", sColor: "#c9973e", no: 2,  title: "法人制度 · 营利与非营利法人比较",       type: "比较论述", wordLimit: 700, status: "已批改", score: 70 },
      { id: 103, subject: "总则编", sColor: "#c9973e", no: 3,  title: "代理制度 · 有权代理与无权代理综合",     type: "案例分析", wordLimit: 800, status: "待批改", score: null },
      { id: 104, subject: "物权编", sColor: "#4e8ef7", no: 4,  title: "物权变动 · 基于法律行为的变动论述",     type: "论述题",   wordLimit: 700, status: "已批改", score: 83 },
      { id: 105, subject: "物权编", sColor: "#4e8ef7", no: 5,  title: "担保物权 · 抵押权与质权比较",           type: "比较论述", wordLimit: 700, status: "待批改", score: null },
      { id: 106, subject: "物权编", sColor: "#4e8ef7", no: 6,  title: "建设用地使用权 · 设立与流转论述",       type: "综合论述", wordLimit: 600, status: "待作答", score: null },
      { id: 107, subject: "合同编", sColor: "#f7a94e", no: 7,  title: "合同成立 · 要约与承诺规则论述",         type: "论述题",   wordLimit: 600, status: "已批改", score: 75 },
      { id: 108, subject: "合同编", sColor: "#f7a94e", no: 8,  title: "格式条款 · 效力认定与解释原则综合",     type: "综合论述", wordLimit: 700, status: "待批改", score: null },
      { id: 109, subject: "合同编", sColor: "#f7a94e", no: 9,  title: "违约责任 · 违约形态与救济方式案例",     type: "案例分析", wordLimit: 800, status: "待作答", score: null },
      { id: 110, subject: "侵权编", sColor: "#f76e6e", no: 10, title: "一般侵权 · 构成要件综合论述",           type: "论述题",   wordLimit: 700, status: "待作答", score: null },
      { id: 111, subject: "侵权编", sColor: "#f76e6e", no: 11, title: "产品责任 · 生产者与销售者责任案例",     type: "案例分析", wordLimit: 600, status: "待作答", score: null },
    ],
  },
  {
    id: 3, title: "主观题冲刺批改 · 30题", subtitle: "2026法考高频押题卷精批服务",
    tag: "押题卷", tagColor: { bg: "rgba(247,110,110,0.14)", color: "#f76e6e" }, accentColor: "#f76e6e",
    purchaseDate: "2026-05-01",
    papers: [
      { id: 201, subject: "民法",   sColor: "#c9973e", no: 1, title: "物权变动综合案例 · 押题第1题",         type: "案例分析", wordLimit: 800, status: "待作答", score: null },
      { id: 202, subject: "民法",   sColor: "#c9973e", no: 2, title: "合同解除与违约竞合 · 押题第2题",       type: "案例分析", wordLimit: 700, status: "待作答", score: null },
      { id: 203, subject: "刑法",   sColor: "#f76e6e", no: 3, title: "犯罪形态综合辨析 · 押题第3题",         type: "综合论述", wordLimit: 700, status: "待作答", score: null },
      { id: 204, subject: "刑法",   sColor: "#f76e6e", no: 4, title: "单位犯罪认定论述 · 押题第4题",         type: "案例分析", wordLimit: 600, status: "待作答", score: null },
      { id: 205, subject: "行政法", sColor: "#4e8ef7", no: 5, title: "行政行为效力论述 · 押题第5题",         type: "论述题",   wordLimit: 600, status: "待作答", score: null },
      { id: 206, subject: "行政法", sColor: "#4e8ef7", no: 6, title: "行政诉讼证据规则 · 押题第6题",         type: "综合论述", wordLimit: 700, status: "待作答", score: null },
    ],
  },
];

const gradingStatusConfig = {
  已批改: { bg: "rgba(29,201,164,0.1)",   color: "#1dc9a4" },
  待批改: { bg: "rgba(247,169,78,0.1)",   color: "#f7a94e" },
  待作答: { bg: "rgba(255,255,255,0.06)", color: "#4a6080" },
};

/* ══════════════════════ SUBJECTIVE GRADING PAGE (product list) ══════════════════════ */

function SubjectiveGradingPage({
  setPage,
  setSelectedGradingProduct,
}: {
  setPage: (p: string) => void;
  setSelectedGradingProduct: (p: GradingProduct) => void;
}) {
  const totalPending = gradingProducts.flatMap(p => p.papers).filter(p => p.status === "待作答").length;
  const totalGrading = gradingProducts.flatMap(p => p.papers).filter(p => p.status === "待批改").length;
  const totalGraded  = gradingProducts.flatMap(p => p.papers).filter(p => p.status === "已批改").length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 36px 72px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => setPage("home")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 13, color: "#5a7898" }}>
          <ChevronLeft size={14} /> 首页
        </button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 18, borderRadius: 2, background: "linear-gradient(to bottom,#1dc9a4,#4e8ef7)" }} />
          <h1 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 20, fontWeight: 600, color: "#dde4f0" }}>主观批改</h1>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 36 }}>
        {[
          { label: "待作答", value: totalPending, color: "#4a6080", bg: "rgba(255,255,255,0.03)" },
          { label: "待批改", value: totalGrading, color: "#f7a94e", bg: "rgba(247,169,78,0.07)" },
          { label: "已批改", value: totalGraded,  color: "#1dc9a4", bg: "rgba(29,201,164,0.07)" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 14, border: `1px solid ${s.color}22`, padding: "18px 22px", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 36, fontWeight: 700, color: s.color }}>{s.value}</span>
            <div>
              <div style={{ fontSize: 13, color: s.color, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: "#2e4260", marginTop: 2 }}>份试题</div>
            </div>
          </div>
        ))}
      </div>

      {/* Section label */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "#3a5570", marginBottom: 16, letterSpacing: "0.04em" }}>我的批改产品 · {gradingProducts.length} 套</div>

      {/* Product cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {gradingProducts.map(product => {
          const subjects = [...new Set(product.papers.map(p => p.subject))];
          const graded  = product.papers.filter(p => p.status === "已批改").length;
          const pending = product.papers.filter(p => p.status === "待作答").length;
          const gradingNow = product.papers.filter(p => p.status === "待批改").length;
          const total   = product.papers.length;
          const scoredPapers = product.papers.filter(p => p.score !== null);
          const avgScore = scoredPapers.length > 0
            ? Math.round(scoredPapers.reduce((s, p) => s + (p.score ?? 0), 0) / scoredPapers.length)
            : null;
          const progressPct = Math.round((graded / total) * 100);

          return (
            <div key={product.id}
              style={{ background: "#0f1826", borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", cursor: "pointer", transition: "border-color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = `${product.accentColor}55`)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)")}
              onClick={() => { setSelectedGradingProduct(product); setPage("subjectiveGradingDetail"); }}>

              {/* Accent stripe */}
              <div style={{ height: 3, background: `linear-gradient(90deg,${product.accentColor},${product.accentColor}44)` }} />

              <div style={{ padding: "22px 26px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>

                  {/* Icon area */}
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: `${product.accentColor}18`, border: `1.5px solid ${product.accentColor}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <FileText size={24} color={product.accentColor} />
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 6, background: product.tagColor.bg, color: product.tagColor.color }}>{product.tag}</span>
                      <h2 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 18, fontWeight: 700, color: "#dde4f0", margin: 0 }}>{product.title}</h2>
                    </div>
                    <div style={{ fontSize: 13, color: "#3a5570", marginBottom: 14 }}>{product.subtitle}</div>

                    {/* Subject chips */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                      {subjects.map(sub => {
                        const p0 = product.papers.find(p => p.subject === sub)!;
                        const cnt = product.papers.filter(p => p.subject === sub).length;
                        return (
                          <span key={sub} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 7, background: `${p0.sColor}14`, color: p0.sColor, border: `1px solid ${p0.sColor}22` }}>
                            {sub} · {cnt}题
                          </span>
                        );
                      })}
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: "#2e4260" }}>批改进度</span>
                        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: product.accentColor, fontWeight: 600 }}>{graded}/{total}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                        <div style={{ height: "100%", borderRadius: 3, width: `${progressPct}%`, background: `linear-gradient(90deg,${product.accentColor}cc,${product.accentColor})`, transition: "width 0.4s" }} />
                      </div>
                    </div>

                    {/* Mini stats row */}
                    <div style={{ display: "flex", gap: 20 }}>
                      {pending > 0 && <span style={{ fontSize: 11, color: "#4a6080" }}>待作答 <b style={{ color: "#5a7898" }}>{pending}</b></span>}
                      {gradingNow > 0 && <span style={{ fontSize: 11, color: "#4a6080" }}>待批改 <b style={{ color: "#f7a94e" }}>{gradingNow}</b></span>}
                      {graded > 0 && <span style={{ fontSize: 11, color: "#4a6080" }}>已批改 <b style={{ color: "#1dc9a4" }}>{graded}</b></span>}
                      {avgScore !== null && <span style={{ fontSize: 11, color: "#4a6080" }}>均分 <b style={{ fontFamily: "'JetBrains Mono',monospace", color: avgScore >= 75 ? "#1dc9a4" : avgScore >= 60 ? "#c9973e" : "#f76e6e" }}>{avgScore}</b></span>}
                      <span style={{ fontSize: 11, color: "#2e4260" }}>购于 {product.purchaseDate}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight size={18} color="#2e4260" style={{ flexShrink: 0, marginTop: 4 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════ SUBJECTIVE GRADING DETAIL PAGE ══════════════════════ */

function SubjectiveGradingDetailPage({
  setPage,
  product,
  setSelectedExamPaper,
}: {
  setPage: (p: string) => void;
  product: GradingProduct | null;
  setSelectedExamPaper: (p: GradingPaper) => void;
}) {
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [filter, setFilter] = useState<"全部" | "待作答" | "待批改" | "已批改">("全部");

  if (!product) { setPage("subjectiveGrading"); return null; }

  const allSubjects = [...new Set(product.papers.map(p => p.subject))];
  const currentSub  = activeSub ?? allSubjects[0];
  const sColor      = product.papers.find(p => p.subject === currentSub)?.sColor ?? product.accentColor;

  const subPapers   = product.papers.filter(p => p.subject === currentSub);
  const displayed   = filter === "全部" ? subPapers : subPapers.filter(p => p.status === filter);

  const graded  = product.papers.filter(p => p.status === "已批改").length;
  const pending = product.papers.filter(p => p.status === "待作答").length;
  const grading = product.papers.filter(p => p.status === "待批改").length;
  const total   = product.papers.length;

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 36px 0" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <button onClick={() => setPage("subjectiveGrading")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 13, color: "#5a7898", flexShrink: 0 }}>
          <ChevronLeft size={14} /> 主观批改
        </button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 6, background: product.tagColor.bg, color: product.tagColor.color, flexShrink: 0 }}>{product.tag}</span>
        <h1 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 19, fontWeight: 700, color: "#dde4f0", margin: 0, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.title}</h1>
        {/* Overall stats inline */}
        <div style={{ display: "flex", gap: 18, flexShrink: 0 }}>
          {[
            { label: "待作答", value: pending, color: "#4a6080" },
            { label: "待批改", value: grading, color: "#f7a94e" },
            { label: "已批改", value: graded,  color: "#1dc9a4" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#2e4260", marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Overall progress bar */}
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginBottom: 24 }}>
        <div style={{ height: "100%", borderRadius: 2, width: `${Math.round((graded / total) * 100)}%`, background: `linear-gradient(90deg,${product.accentColor}99,${product.accentColor})`, transition: "width 0.4s" }} />
      </div>

      {/* ── Two-column body ── */}
      <div style={{ display: "flex", gap: 20, height: "calc(100vh - 172px)" }}>

        {/* LEFT: subject sidebar — static, does not scroll with right panel */}
        <div style={{ width: 190, flexShrink: 0, overflowY: "auto" }}>
          <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2e4260", letterSpacing: "0.06em" }}>科目</div>
              <div style={{ fontSize: 10, color: "#1e3050", marginTop: 2 }}>{allSubjects.length} 个科目 · {total} 题</div>
            </div>
            <div style={{ padding: "6px 0" }}>
              {allSubjects.map(sub => {
                const papers  = product.papers.filter(p => p.subject === sub);
                const sc      = papers[0].sColor;
                const done    = papers.filter(p => p.status === "已批改").length;
                const wait    = papers.filter(p => p.status === "待批改").length;
                const isActive = sub === currentSub;
                const pct     = Math.round((done / papers.length) * 100);
                return (
                  <div key={sub}
                    onClick={() => { setActiveSub(sub); setFilter("全部"); }}
                    style={{ padding: "10px 16px", cursor: "pointer", background: isActive ? `${sc}0e` : "transparent", borderLeft: `3px solid ${isActive ? sc : "transparent"}`, transition: "all 0.12s" }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? sc : "#7a96b4", fontFamily: "'Noto Serif SC',serif" }}>{sub}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: pct > 0 ? sc : "#1e3050", fontWeight: 600 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 2, borderRadius: 1, background: "rgba(255,255,255,0.05)", marginBottom: 4 }}>
                      <div style={{ height: "100%", borderRadius: 1, width: `${pct}%`, background: sc, opacity: 0.7 }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "#2e4260" }}>{papers.length} 题</span>
                      {wait > 0 && <span style={{ fontSize: 10, color: "#f7a94e" }}>待批 {wait}</span>}
                      {done > 0 && <span style={{ fontSize: 10, color: "#1dc9a4" }}>已批 {done}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: papers for active subject — independently scrollable */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>

          {/* Subject header */}
          <div style={{ borderRadius: 16, background: `${sColor}0c`, border: `1px solid ${sColor}25`, padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 4, height: 36, borderRadius: 2, background: sColor, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 18, fontWeight: 700, color: sColor, marginBottom: 4 }}>{currentSub}</div>
              <div style={{ display: "flex", gap: 14 }}>
                <span style={{ fontSize: 12, color: "#3a5570" }}>共 {subPapers.length} 题</span>
                <span style={{ fontSize: 12, color: "#1dc9a4" }}>已批改 {subPapers.filter(p => p.status === "已批改").length}</span>
                {subPapers.filter(p => p.status === "待批改").length > 0 &&
                  <span style={{ fontSize: 12, color: "#f7a94e" }}>待批改 {subPapers.filter(p => p.status === "待批改").length}</span>}
              </div>
            </div>
            {/* Subject progress */}
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: sColor, lineHeight: 1 }}>
                {Math.round((subPapers.filter(p => p.status === "已批改").length / subPapers.length) * 100)}<span style={{ fontSize: 12, fontWeight: 400 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: "#2e4260", marginTop: 3 }}>完成进度</div>
            </div>
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["全部", "待作答", "待批改", "已批改"] as const).map(f => {
              const cnt = f === "全部" ? subPapers.length : subPapers.filter(p => p.status === f).length;
              if (cnt === 0 && f !== "全部") return null;
              return (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: filter === f ? 600 : 400, border: filter === f ? `1.5px solid ${sColor}` : "1px solid rgba(255,255,255,0.08)", background: filter === f ? `${sColor}18` : "rgba(255,255,255,0.03)", color: filter === f ? sColor : "#3a5570", cursor: "pointer" }}>
                  {f} <span style={{ opacity: 0.65 }}>({cnt})</span>
                </button>
              );
            })}
          </div>

          {/* Paper list */}
          {displayed.length === 0
            ? <div style={{ textAlign: "center", padding: "48px 0", color: "#2e4260", fontSize: 14 }}>该状态下暂无试题</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {displayed.map(paper => {
                  const sc2 = gradingStatusConfig[paper.status];
                  return (
                    <div key={paper.id}
                      style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 14, background: "#0f1826", border: "1px solid rgba(255,255,255,0.06)", cursor: paper.status === "待作答" ? "pointer" : "default", transition: "border-color 0.15s" }}
                      onMouseEnter={e => { if (paper.status === "待作答") e.currentTarget.style.borderColor = `${sColor}44`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}>

                      {/* Paper number */}
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: `${sColor}14`, border: `1px solid ${sColor}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: sColor }}>{paper.no}</span>
                      </div>

                      {/* Title */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "#c8d8ee", marginBottom: 5 }}>{paper.title}</div>
                        <div style={{ display: "flex", gap: 12 }}>
                          <span style={{ fontSize: 11, color: "#2e4260" }}>{paper.type}</span>
                          <span style={{ fontSize: 11, color: "#2e4260" }}>字数要求 {paper.wordLimit} 字</span>
                        </div>
                      </div>

                      {/* Score */}
                      {paper.score !== null && (
                        <div style={{ textAlign: "center", flexShrink: 0 }}>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: paper.score >= 75 ? "#1dc9a4" : paper.score >= 60 ? "#c9973e" : "#f76e6e", lineHeight: 1 }}>{paper.score}</div>
                          <div style={{ fontSize: 10, color: "#2e4260", marginTop: 2 }}>/ 100</div>
                        </div>
                      )}

                      {/* Status */}
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 8, background: sc2.bg, color: sc2.color, flexShrink: 0 }}>{paper.status}</span>

                      {/* CTA */}
                      {paper.status === "待作答" && (
                        <button onClick={() => { setSelectedExamPaper(paper); setPage("examAnswer"); }} style={{ padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: `linear-gradient(90deg,${sColor}cc,${sColor})`, color: "#090e1a", flexShrink: 0 }}>
                          开始作答
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ EXAM ANSWER PAGE ══════════════════════ */

function getExamContent(paper: GradingPaper) {
  const wl = paper.wordLimit;
  const q1 = Math.floor(wl * 0.35);
  const q2 = Math.floor(wl * 0.40);
  const q3 = wl - q1 - q2;

  if (["民法","总则编","物权编","合同编","侵权编"].includes(paper.subject)) {
    return {
      scenario: `2025年4月，甲公司（甲）与乙公司（乙）签订机器设备采购合同，约定乙向甲供应100台精密数控机床，每台单价30万元，总价3000万元，交货期为2025年9月30日，甲收货验收合格后15日内付清货款。合同签订时甲支付定金300万元。\n\n2025年7月，受某稀有金属原材料国际市场价格大幅波动影响，乙的生产成本较签约时上涨约40%。乙以情势变更为由，书面通知甲要求将单价提高至42万元，遭甲拒绝。2025年8月20日，乙再次致函声明不再履行合同，并已将该批机床以单价40万元出售给善意第三方丙公司，当日完成交付。\n\n甲随即以市价45万元/台另行采购同等规格机床100台，额外支出差价1500万元。甲向法院起诉，请求乙：①双倍返还定金600万元；②赔偿差价损失1500万元；③赔偿预期利润损失200万元；④承担全部诉讼费用。`,
      subQuestions: [
        { id: 1, text: "乙援引情势变更原则要求调整合同价款的主张能否成立？请结合《民法典》相关规定加以分析。", points: 25, wordLimit: q1 },
        { id: 2, text: "甲提出的四项诉讼请求是否均有法律依据？请逐一分析并说明理由。", points: 40, wordLimit: q2 },
        { id: 3, text: "乙擅自将货物出售给丙后，甲对丙是否享有追及权？请从物权与债权角度加以论述。", points: 30, wordLimit: q3 },
      ],
    };
  }
  if (paper.subject === "刑法") {
    return {
      scenario: `甲（男，36岁）系某国有银行客户经理，乙（女，34岁，甲之妻）系某会计师事务所审计员。2023年初，甲利用职务便利，以"专属内部理财产品"为名，陆续向23名客户承诺年化收益率12%，劝其将资金汇入甲控制的个人账户，共计吸收资金2200万元。甲将其中1400万元据为己有用于高额消费及境外转移，另将800万元通过乙以虚假咨询服务费名义向多家空壳公司走账套现并转入境外账户。\n\n案发前，甲的同事丙发现账目异常，甲许以好处费50万元请丙不予举报，丙收受后确实未作举报。同年11月，银行内控审计发现异常，甲畏罪出逃，在边境被捕。乙在得知甲被捕后，主动向公安机关说明情况并协助查明资金流向。`,
      subQuestions: [
        { id: 1, text: "请分析甲的行为构成哪些犯罪，并论述各罪名之间的罪数关系及处断原则。", points: 35, wordLimit: q1 },
        { id: 2, text: "乙的行为应如何定性？乙主动向公安机关说明情况对其刑事责任有何影响？", points: 30, wordLimit: q2 },
        { id: 3, text: "丙收受好处费后未举报，应承担何种刑事法律责任？请结合具体罪名加以分析。", points: 20, wordLimit: q3 },
      ],
    };
  }
  if (paper.subject === "行政法") {
    return {
      scenario: `甲市某区市场监督管理局（区市监局）于2025年3月对乙食品公司（乙公司）进行日常检查，发现：①使用过期原料生产糕点，货值约8万元；②生产车间卫生条件不符合食品安全标准；③未取得许可擅自添加某种着色剂。\n\n区市监局于4月15日作出行政处罚决定：没收违法所得3万元，并处罚款80万元，责令停产整顿30日。乙公司认为处罚过重，于5月10日向甲市市场监督管理局（市市监局）申请行政复议。市市监局于7月20日作出复议决定，维持了区市监局的处罚决定。乙公司不服，于8月15日向人民法院提起行政诉讼。\n\n另查明：区市监局在作出处罚决定前，未告知乙公司享有申请听证的权利；市市监局复议期间，未依法向乙公司送达复议申请书副本。`,
      subQuestions: [
        { id: 1, text: "区市监局在行政处罚程序中存在哪些违法之处？对处罚决定的效力有何影响？", points: 25, wordLimit: q1 },
        { id: 2, text: "市市监局的复议程序是否合法？复议机关维持原决定是否正确？请分析说明。", points: 30, wordLimit: q2 },
        { id: 3, text: "乙公司提起行政诉讼，应以谁为被告？法院应如何处理本案？", points: 25, wordLimit: q3 },
      ],
    };
  }
  return {
    scenario: `甲（自然人）与乙（法人）于2025年初就涉案事项发生法律争议，双方对各自的权利义务产生重大分歧，经多次协商未能达成一致意见。\n\n甲以乙违反双方约定、侵害其合法权益为由，向有关部门提出申请，要求依法确认乙的行为违法，并追究相应法律责任，同时要求乙赔偿由此造成的全部经济损失及合理维权费用。\n\n各方当事人对于案涉法律关系的性质、责任主体的认定、归责原则的适用以及损害赔偿的范围等核心问题存在根本性分歧，需要依据相关法律规定作出准确判断和分析论述。`,
    subQuestions: [
      { id: 1, text: `请结合${paper.subject}的相关法律规定，分析本案的核心法律关系及各方当事人的权利义务。`, points: 30, wordLimit: q1 },
      { id: 2, text: `从${paper.subject}的归责原则出发，分析各方当事人应承担的法律责任及其范围。`, points: 35, wordLimit: q2 },
      { id: 3, text: `结合本案实际，论述${paper.type}类题目的答题思路与核心论证框架。`, points: 25, wordLimit: q3 },
    ],
  };
}

function ExamAnswerPage({ setPage, paper }: { setPage: (p: string) => void; paper: GradingPaper | null }) {
  const [currentQ, setCurrentQ]   = useState(0);
  const [answers, setAnswers]     = useState<Record<number, string>>({});
  const [flagged, setFlagged]     = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft]   = useState(3 * 60 * 60);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!paper) { setPage("subjectiveGradingDetail"); return null; }

  const { scenario, subQuestions } = getExamContent(paper);
  const active        = subQuestions[currentQ];
  const currentAnswer = answers[currentQ] ?? "";
  const wordCount     = currentAnswer.replace(/\s/g, "").length;
  const isFlagged     = flagged.has(currentQ);
  const answeredCount = subQuestions.filter((_, i) => (answers[i] ?? "").trim().length > 0).length;
  const isLowTime     = timeLeft < 600;

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };
  const toggleFlag = () => setFlagged(f => { const n = new Set(f); n.has(currentQ) ? n.delete(currentQ) : n.add(currentQ); return n; });

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#06101d", overflow: "hidden", fontFamily: "'Noto Sans SC',sans-serif", color: "#c8d8ee" }}>

      {/* ── TOP BAR ── */}
      <div style={{ height: 54, background: "#040c18", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", padding: "0 22px", gap: 14, flexShrink: 0, zIndex: 10 }}>
        <button onClick={() => setPage("subjectiveGradingDetail")}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 12, color: "#4a6080", flexShrink: 0 }}>
          <ChevronLeft size={13} /> 退出考试
        </button>
        <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#c8d8ee", fontFamily: "'Noto Serif SC',serif" }}>2026年法律职业资格考试 · 主观题</div>
          <div style={{ fontSize: 10, color: "#2e4260", marginTop: 1 }}>{paper.subject} · {paper.title}</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#3a5570", flexShrink: 0 }}>
          已作答 <span style={{ color: "#1dc9a4", fontWeight: 700 }}>{answeredCount}</span>/{subQuestions.length} 小题
        </div>
        <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <Clock size={13} color={isLowTime ? "#f76e6e" : "#3a5570"} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 17, fontWeight: 700, color: isLowTime ? "#f76e6e" : "#c9973e", letterSpacing: "0.06em" }}>{fmt(timeLeft)}</span>
        </div>
        <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.08)" }} />
        <button onClick={() => setShowConfirm(true)}
          style={{ padding: "7px 22px", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", background: "linear-gradient(90deg,#c9973e,#e8c46a)", color: "#090e1a", flexShrink: 0 }}>
          交卷
        </button>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT NAV: answer card */}
        <div style={{ width: 156, background: "#040c18", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#2e4260", letterSpacing: "0.06em" }}>答题卡</div>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              {[{ color: "#1dc9a4", label: "已答" }, { color: "rgba(255,255,255,0.12)", label: "未答" }].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                  <span style={{ fontSize: 10, color: "#2e4260" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
            {subQuestions.map((q, idx) => {
              const answered  = (answers[idx] ?? "").trim().length > 0;
              const isCurrent = idx === currentQ;
              const isFlag    = flagged.has(idx);
              const wc        = (answers[idx] ?? "").replace(/\s/g, "").length;
              return (
                <div key={q.id} onClick={() => setCurrentQ(idx)}
                  style={{ padding: "10px 14px", cursor: "pointer", background: isCurrent ? "rgba(78,142,247,0.1)" : "transparent", borderLeft: `3px solid ${isCurrent ? "#4e8ef7" : "transparent"}`, transition: "all 0.1s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 7, background: answered ? "rgba(29,201,164,0.18)" : "rgba(255,255,255,0.05)", border: `1.5px solid ${answered ? "#1dc9a4" : isCurrent ? "#4e8ef7" : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: answered ? "#1dc9a4" : isCurrent ? "#4e8ef7" : "#2e4260" }}>{idx + 1}</span>
                    </div>
                    {isFlag && <Flag size={10} color="#f7a94e" fill="#f7a94e" />}
                  </div>
                  <div style={{ fontSize: 10, color: "#2e4260" }}>{q.points} 分</div>
                  <div style={{ fontSize: 10, color: wc > 0 ? "#1dc9a4" : "#1e3050", marginTop: 2 }}>{wc}/{q.wordLimit} 字</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER: case + questions */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", borderRight: "1px solid rgba(255,255,255,0.06)", minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#2e4260", letterSpacing: "0.08em", marginBottom: 14 }}>案情材料</div>
          <div style={{ fontSize: 14, color: "#7a96b4", lineHeight: 2, marginBottom: 32, whiteSpace: "pre-wrap" }}>{scenario}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#2e4260", letterSpacing: "0.08em", marginBottom: 14 }}>考题</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {subQuestions.map((q, idx) => {
              const isCurrent = idx === currentQ;
              const answered  = (answers[idx] ?? "").trim().length > 0;
              return (
                <div key={q.id} onClick={() => setCurrentQ(idx)}
                  style={{ padding: "16px 18px", borderRadius: 12, background: isCurrent ? "rgba(78,142,247,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${isCurrent ? "rgba(78,142,247,0.28)" : "rgba(255,255,255,0.05)"}`, cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: answered ? "rgba(29,201,164,0.15)" : isCurrent ? "rgba(78,142,247,0.15)" : "rgba(255,255,255,0.05)", border: `1.5px solid ${answered ? "#1dc9a4" : isCurrent ? "#4e8ef7" : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: answered ? "#1dc9a4" : isCurrent ? "#4e8ef7" : "#3a5570" }}>第{idx + 1}问</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#2e4260" }}>{q.points} 分</span>
                    <span style={{ fontSize: 11, color: "#2e4260" }}>建议 {q.wordLimit} 字</span>
                    {answered && <span style={{ fontSize: 10, color: "#1dc9a4", marginLeft: "auto" }}>已作答 ✓</span>}
                  </div>
                  <div style={{ fontSize: 14, color: isCurrent ? "#c8d8ee" : "#5a7898", lineHeight: 1.9, fontWeight: isCurrent ? 500 : 400 }}>{q.text}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: answer textarea */}
        <div style={{ width: "38%", display: "flex", flexDirection: "column", flexShrink: 0, minWidth: 360 }}>
          {/* Answer header */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(78,142,247,0.15)", border: "1.5px solid rgba(78,142,247,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#4e8ef7" }}>第{currentQ + 1}问</span>
            </div>
            <span style={{ fontSize: 12, color: "#5a7898", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active.text}</span>
            <button onClick={toggleFlag}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, border: `1px solid ${isFlagged ? "rgba(247,169,78,0.4)" : "rgba(255,255,255,0.08)"}`, background: isFlagged ? "rgba(247,169,78,0.1)" : "rgba(255,255,255,0.03)", cursor: "pointer", fontSize: 11, color: isFlagged ? "#f7a94e" : "#3a5570", flexShrink: 0 }}>
              <Flag size={11} color={isFlagged ? "#f7a94e" : "#3a5570"} fill={isFlagged ? "#f7a94e" : "none"} />
              {isFlagged ? "已标记" : "标记"}
            </button>
          </div>

          {/* Textarea */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "14px 20px", overflow: "hidden" }}>
            <textarea
              value={currentAnswer}
              onChange={e => setAnswers(p => ({ ...p, [currentQ]: e.target.value }))}
              placeholder={`请在此处作答第 ${currentQ + 1} 问\n建议字数 ${active.wordLimit} 字  ·  本题 ${active.points} 分`}
              style={{ flex: 1, width: "100%", resize: "none", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 18px", color: "#c8d8ee", fontSize: 14, lineHeight: 2.1, fontFamily: "'Noto Sans SC',sans-serif", outline: "none", caretColor: "#4e8ef7" }}
            />
          </div>

          {/* Word count bar */}
          <div style={{ padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#2e4260" }}>字数</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: wordCount > active.wordLimit ? "#f76e6e" : wordCount > active.wordLimit * 0.75 ? "#1dc9a4" : "#3a5570" }}>{wordCount}</span>
              <span style={{ fontSize: 11, color: "#1e3050" }}>/ {active.wordLimit}</span>
              <div style={{ width: 80, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginLeft: 6 }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(100, Math.round((wordCount / active.wordLimit) * 100))}%`, background: wordCount > active.wordLimit ? "#f76e6e" : "#1dc9a4", transition: "width 0.2s" }} />
              </div>
            </div>
            <button onClick={() => setAnswers(p => ({ ...p, [currentQ]: "" }))}
              style={{ fontSize: 11, color: "#2e4260", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
              清空
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={{ height: 52, background: "#040c18", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", padding: "0 22px", gap: 16, flexShrink: 0 }}>
        <button onClick={() => setCurrentQ(q => Math.max(0, q - 1))} disabled={currentQ === 0}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", cursor: currentQ === 0 ? "default" : "pointer", fontSize: 13, color: currentQ === 0 ? "#1e3050" : "#7a96b4", opacity: currentQ === 0 ? 0.35 : 1 }}>
          <ChevronLeft size={14} /> 上一问
        </button>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 8 }}>
          {subQuestions.map((_, idx) => {
            const answered  = (answers[idx] ?? "").trim().length > 0;
            const isCurrent = idx === currentQ;
            const isFlag    = flagged.has(idx);
            return (
              <button key={idx} onClick={() => setCurrentQ(idx)}
                style={{ width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${isCurrent ? "#4e8ef7" : answered ? "#1dc9a4" : "rgba(255,255,255,0.1)"}`, background: isCurrent ? "rgba(78,142,247,0.15)" : answered ? "rgba(29,201,164,0.1)" : "rgba(255,255,255,0.03)", cursor: "pointer", fontSize: 13, fontWeight: 700, color: isCurrent ? "#4e8ef7" : answered ? "#1dc9a4" : "#2e4260", position: "relative" }}>
                {idx + 1}
                {isFlag && <div style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: "#f7a94e" }} />}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 12, color: "#2e4260", flexShrink: 0 }}>第 {currentQ + 1} / {subQuestions.length} 问</span>
        <button onClick={() => setCurrentQ(q => Math.min(subQuestions.length - 1, q + 1))} disabled={currentQ === subQuestions.length - 1}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", cursor: currentQ === subQuestions.length - 1 ? "default" : "pointer", fontSize: 13, color: currentQ === subQuestions.length - 1 ? "#1e3050" : "#7a96b4", opacity: currentQ === subQuestions.length - 1 ? 0.35 : 1 }}>
          下一问 <ChevronRight size={14} />
        </button>
      </div>

      {/* Submit confirmation */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#0f1826", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", padding: "32px 36px", width: 380 }}>
            <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 18, fontWeight: 700, color: "#dde4f0", marginBottom: 10 }}>确认交卷</div>
            <div style={{ fontSize: 14, color: "#5a7898", lineHeight: 1.9, marginBottom: 22 }}>
              您已作答 <span style={{ color: "#1dc9a4", fontWeight: 700 }}>{answeredCount}</span> / {subQuestions.length} 小题。
              {answeredCount < subQuestions.length && <span style={{ color: "#f7a94e" }}> 尚有 {subQuestions.length - answeredCount} 题未作答，</span>}
              交卷后无法修改，确认提交吗？
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", cursor: "pointer", fontSize: 14, color: "#5a7898" }}>
                继续作答
              </button>
              <button onClick={() => { setShowConfirm(false); setPage("subjectiveGradingDetail"); }}
                style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(90deg,#c9973e,#e8c46a)", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#090e1a" }}>
                确认交卷
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ SETTINGS PAGE ══════════════════════ */

function SettingsPage({ setPage, notify, onLogout, currentUser }: { setPage: (p: string) => void; notify: Notify; onLogout: () => void; currentUser: LegacyUser | null }) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const SettingRow = ({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div>
        <div style={{ fontSize: 14, color: "#c8d8ee" }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "#2e4260", marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 12, fontWeight: 700, color: "#2e4260", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4, marginTop: 4 }}>{children}</div>
  );

  const passwordInputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "#0a1020",
    color: "#dde4f0",
    outline: "none",
    fontSize: 13,
    boxSizing: "border-box" as const,
  };

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleClearCache = () => {
    clearLocalLearningCache();
    notify("已清理本地机考标记和页面偏好缓存，题库主观草稿保存在账号中", "success");
  };

  const handlePasswordSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      notify("请填写完整的密码信息", "warning");
      return;
    }

    if (newPassword !== confirmPassword) {
      notify("两次输入的新密码不一致", "warning");
      return;
    }

    setPasswordSaving(true);
    try {
      await userService.updatePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      resetPasswordForm();
      setShowPasswordForm(false);
      notify("密码已修改，下次登录请使用新密码", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "密码修改失败", "warning");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="debao-settings-page debao-themed-page" style={{ maxWidth: 760, margin: "0 auto", padding: "36px 36px 72px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <button onClick={() => setPage("myProfile")}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 13, color: "#5a7898" }}>
          <ChevronLeft size={14} /> 我的
        </button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: "linear-gradient(to bottom,#4e8ef7,#c97ef5)" }} />
          <h1 style={{ fontFamily: "'Noto Serif SC',serif", fontSize: 20, fontWeight: 600, color: "#dde4f0" }}>设置</h1>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "22px 24px" }}>
          <SectionTitle>隐私与安全</SectionTitle>
          <SettingRow label="修改密码" sub="使用当前密码验证后更新" right={
            <button onClick={() => setShowPasswordForm(open => !open)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#4e8ef7", background: "none", border: "none", cursor: "pointer" }}>
              {showPasswordForm ? "收起" : "前往修改"} <ChevronRight size={14} />
            </button>
          } />
          {showPasswordForm && (
            <div style={{ display: "grid", gap: 10, padding: "4px 0 18px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <input value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="当前密码" style={passwordInputStyle} />
              <input value={newPassword} onChange={event => setNewPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="新密码" style={passwordInputStyle} />
              <input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="确认新密码" style={passwordInputStyle} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" onClick={() => { resetPasswordForm(); setShowPasswordForm(false); }} style={{ padding: "8px 15px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#5a7898", cursor: "pointer", fontSize: 12 }}>取消</button>
                <button type="button" disabled={passwordSaving} onClick={handlePasswordSubmit} style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: passwordSaving ? "rgba(78,142,247,0.35)" : "linear-gradient(90deg,#4e8ef7,#1dc9a4)", color: "#fff", cursor: passwordSaving ? "wait" : "pointer", fontWeight: 700, fontSize: 12 }}>
                  {passwordSaving ? "提交中..." : "确认修改"}
                </button>
              </div>
            </div>
          )}
          <SettingRow label="两步验证" sub="账号安全由平台统一保护" right={
            <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 7, background: "rgba(78,142,247,0.1)", color: "#4e8ef7" }}>按系统策略</span>
          } />
        </div>

        {/* Account */}
        <div style={{ background: "#0f1826", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "22px 24px" }}>
          <SectionTitle>账号管理</SectionTitle>
          <SettingRow label="当前账号" sub={`手机号 ${maskPhone(currentUser?.phone)} · UID ${currentUser?.id || "-"}`} right={
            <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 7, background: "rgba(78,142,247,0.1)", color: "#4e8ef7" }}>{currentUser?.status === "active" ? "正常" : "异常"}</span>
          } />
          <SettingRow label="注册时间" right={
            <span style={{ fontSize: 12, color: "#5a7898" }}>{currentUser?.registeredAt || "-"}</span>
          } />
          <SettingRow label="清除缓存" sub="清理本地机考标记和页面偏好；题库主观草稿保存在账号中" right={
            <button onClick={handleClearCache} style={{ padding: "7px 16px", borderRadius: 9, fontSize: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", color: "#5a7898" }}>清除本地缓存</button>
          } />
          <SettingRow label="关于得宝" right={
            <button onClick={() => notify(`得宝由得恩法考打造，当前版本 ${APP_VERSION}`, "info")} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#3a5570", background: "none", border: "none", cursor: "pointer" }}>
              {APP_VERSION} <ChevronRight size={14} />
            </button>
          } />
          <div style={{ paddingTop: 16 }}>
            <button onClick={onLogout} style={{ width: "100%", padding: "12px", borderRadius: 11, fontSize: 14, fontWeight: 600, background: "rgba(247,110,110,0.08)", border: "1px solid rgba(247,110,110,0.18)", cursor: "pointer", color: "#f76e6e" }}>退出登录</button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ══════════════════════ APP ROOT ══════════════════════ */

function CourseRouteState({ loading, routeCourseId, accessState, setPage }: { loading: boolean; routeCourseId: string | null; accessState: RouteCourseAccessState; setPage: (p: string) => void }) {
  const checking = loading || accessState.status === "checking";
  const message = checking
    ? "正在读取课程权限和目录，请稍候。"
    : accessState.message || `当前账号没有找到该课程${routeCourseId ? `（ID: ${routeCourseId}）` : ""}，可能未开通、已下架或链接不正确。`;

  return (
    <div className="debao-course-route-state debao-themed-page" style={{ maxWidth: 760, margin: "0 auto", padding: "92px 32px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto 18px", background: "rgba(78,142,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <BookOpen size={24} color="#4e8ef7" />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#dde4f0", marginBottom: 8 }}>{checking ? "正在加载课程" : "课程暂不可访问"}</div>
      <div style={{ fontSize: 13, color: "#5a7898", lineHeight: 1.8, marginBottom: 22 }}>
        {message}
      </div>
      {!checking && (
        <button onClick={() => setPage("courses")} style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid rgba(78,142,247,0.28)", background: "rgba(78,142,247,0.12)", color: "#4e8ef7", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
          返回课程中心
        </button>
      )}
    </div>
  );
}

function ImageTargetPreviewPage() {
  const imageUrl = getImageTargetPreviewSource();

  return (
    <div className="debao-image-preview-page" style={{ minHeight: "100vh", background: "#0b1020", color: "#dde4f0", fontFamily: "'Noto Sans SC',sans-serif", display: "flex", flexDirection: "column" }}>
      <header style={{ height: 64, padding: "0 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "rgba(11,16,32,0.92)", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <AppLogo compact />
          <span style={{ fontSize: 14, color: "#8fa3be", whiteSpace: "nowrap" }}>图片预览</span>
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#dde4f0", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}
        >
          <X size={15} />
          关闭
        </button>
      </header>
      <main style={{ flex: 1, minHeight: 0, padding: 24, display: "grid", placeItems: "center" }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="跳转图片"
            style={{ maxWidth: "100%", maxHeight: "calc(100vh - 112px)", objectFit: "contain", borderRadius: 12, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", background: "#fff" }}
          />
        ) : (
          <div style={{ maxWidth: 460, textAlign: "center", padding: "42px 28px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f0e6d0", marginBottom: 8 }}>图片地址无效</div>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: "#8fa3be" }}>请回到后台 Banner 管理，重新上传跳转图片后保存配置。</div>
          </div>
        )}
      </main>
    </div>
  );
}

function DebaoAppShell() {
  const [locationPath, setLocationPath] = useState(() => (typeof window !== "undefined" ? window.location.pathname : "/"));
  const initialPage = pathToPage(locationPath);
  const initialQuestionPracticeState = initialPage === "questionBank"
    ? getRouteQuestionPracticeState()
    : { mode: "顺序练习" as QuestionPracticeModeLabel, chapter: null as QuestionPracticeTarget };
  const myExamRecordRoute = getMyExamRecordRouteFromPath(locationPath);
  const [activeNav, setActiveNav] = useState(navIndexForPage(initialPage));
  const [page, setPageState] = useState(initialPage);
  const [currentUser, setCurrentUser] = useState<LegacyUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const pendingAuthActionRef = useRef<(() => void) | null>(null);
  const [courses, setCourses] = useState<AppCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<AppCourse | null>(null);
  const [questionMode, setQuestionMode] = useState<QuestionPracticeModeLabel>(initialQuestionPracticeState.mode);
  const [selectedQuestionChapter, setSelectedQuestionChapter] = useState<QuestionPracticeTarget>(initialQuestionPracticeState.chapter);
  const [myQuestionBankPaperType, setMyQuestionBankPaperType] = useState<"objective" | "subjective" | null>(() => {
    if (initialPage !== "myQuestionBank" || typeof window === "undefined") return null;
    const paperTypeParam = new URLSearchParams(window.location.search).get("paperType");
    return paperTypeParam === "objective" || paperTypeParam === "subjective" ? paperTypeParam : null;
  });
  const [routeQuestionId, setRouteQuestionId] = useState<string | undefined>(() =>
    initialPage === "questionBank" ? getRouteQuestionPracticeState().questionId : undefined,
  );
  const [selectedMockExamTarget, setSelectedMockExamTarget] = useState<MockExamSessionTarget>(() =>
    initialPage === "mockExamRoom" ? getRouteMockExamTarget() : null,
  );
  const [mockExamMode, setMockExamMode] = useState<MockExamMode>(() => getRouteMockExamMode());
  const [toast, setToast] = useState<ToastState>(null);
  const [routeCourseAccess, setRouteCourseAccess] = useState<RouteCourseAccessState>({ status: "idle" });
  const [homeConfig, setHomeConfig] = useState<UserHomeConfig>(EMPTY_USER_HOME_CONFIG);
  const [studySummary, setStudySummary] = useState<UserStudySummary>(EMPTY_STUDY_SUMMARY);
  const [loadingStudySummary, setLoadingStudySummary] = useState(false);
  const [themeMode, setThemeMode] = useState<DebaoThemeMode>(() => getInitialDebaoTheme());
  const isMobileDesktopOnlyBlocked = useMockExamDesktopGuard();
  const routeCourseId = typeof window !== "undefined" ? getRouteCourseIdFromPath(window.location.pathname) : null;
  const desktopOnlyFeature = isMobileDesktopOnlyBlocked
    ? getDesktopOnlyFeatureForPage(page, locationPath, selectedQuestionChapter, mockExamMode)
    : null;

  const notify: Notify = (text, type = "info") => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 2200);
  };

  const toggleThemeMode = () => {
    setThemeMode(current => current === "light" ? "dark" : "light");
  };

  const requestAuth = (afterLogin?: () => void) => {
    pendingAuthActionRef.current = afterLogin ?? null;
    setAuthModalOpen(true);
  };

  const applyPage = (nextPage: string) => {
    if (nextPage === "mockExamHome") setMockExamMode("objective");
    if (nextPage === "subjectiveGrading") setMockExamMode("subjective");
    setMyQuestionBankPaperType(null);
    setPageState(nextPage);
    setActiveNav(navIndexForPage(nextPage));

    if (typeof window === "undefined") return;

    const nextPath = nextPage === "mockExamRoom" ? buildMockExamRoomPath(selectedMockExamTarget) : pageToPath[nextPage] ?? "/";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ page: nextPage }, "", nextPath);
    }
    setLocationPath(window.location.pathname);
  };

  const setPage = (nextPage: string) => {
    if (!currentUser && isPageAuthRequired(nextPage)) {
      requestAuth(() => applyPage(nextPage));
      return;
    }
    applyPage(nextPage);
  };

  const applyPath = (nextPath: string, state: Record<string, unknown> = {}) => {
    if (typeof window === "undefined") return;
    const nextPage = pathToPage(nextPath);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(state, "", nextPath);
    }
    if (nextPage === "myQuestionBank") {
      const paperTypeParam = new URLSearchParams(window.location.search).get("paperType");
      setMyQuestionBankPaperType(paperTypeParam === "objective" || paperTypeParam === "subjective" ? paperTypeParam : null);
    } else {
      setMyQuestionBankPaperType(null);
    }
    setLocationPath(nextPath);
    setPageState(nextPage);
    setActiveNav(navIndexForPage(nextPage));
  };

  const navigateToPath = (nextPath: string, state: Record<string, unknown> = {}) => {
    const nextPage = pathToPage(nextPath);
    if (!currentUser && isPageAuthRequired(nextPage)) {
      requestAuth(() => applyPath(nextPath, state));
      return;
    }
    applyPath(nextPath, state);
  };

  useEffect(() => {
    const handlePopState = () => {
      const nextPathname = window.location.pathname;
      setLocationPath(nextPathname);
      const nextPage = pathToPage(nextPathname);
      if (nextPage === "myQuestionBank") {
        const paperTypeParam = new URLSearchParams(window.location.search).get("paperType");
        setMyQuestionBankPaperType(paperTypeParam === "objective" || paperTypeParam === "subjective" ? paperTypeParam : null);
      } else {
        setMyQuestionBankPaperType(null);
      }
      setMockExamMode(getRouteMockExamMode());
      if (nextPage === "questionBank") {
        const routePractice = getRouteQuestionPracticeState();
        setQuestionMode(routePractice.mode);
        setSelectedQuestionChapter(routePractice.chapter);
        setRouteQuestionId(routePractice.questionId);
      }
      const routeCourseId = getRouteCourseIdFromPath(nextPathname);
      if (nextPage === "mockExamRoom") {
        setSelectedMockExamTarget(getRouteMockExamTarget());
      }
      if (routeCourseId) {
        const routeCourse = courses.find(course => `${course.id}` === routeCourseId);
        if (routeCourse) {
          setSelectedCourse(routeCourse);
          setRouteCourseAccess({ status: "idle" });
          const coursePage = routeCourse.type === "audio" ? "audioDetail" : "courseDetail";
          setPageState(coursePage);
          setActiveNav(1);
          return;
        }
        setSelectedCourse(null);
        setRouteCourseAccess({
          status: "not_found",
          message: `当前账号没有找到课程 ${routeCourseId}，可能未开通、已下架或链接不正确。`,
        });
      }
      setPageState(nextPage);
      setActiveNav(navIndexForPage(nextPage));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [courses]);

  useEffect(() => {
    document.documentElement.dataset.debaoTheme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(DEBAO_THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setCurrentUser(null);
      setCourses([]);
      setPage("home");
      setAuthModalOpen(true);
      notify("登录已过期，请重新登录", "warning");
    };

    window.addEventListener(USER_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(USER_SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrapAuth = async () => {
      ensureUserDeviceKey();

      const token = getUserToken();
      if (!token) {
        if (active) setCheckingAuth(false);
        return;
      }

      try {
        const user = await userService.getCurrentUser();
        if (!active) return;
        saveUserSession({
          token,
          userId: user.id,
          phone: user.phone,
          displayName: getDisplayName(user),
          avatarUrl: user.avatarUrl || "",
        });
        setCurrentUser(user);
      } catch {
        clearUserSession();
      } finally {
        if (active) setCheckingAuth(false);
      }
    };

    void bootstrapAuth();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (checkingAuth || currentUser) return;
    if (isPageAuthRequired(page) || myExamRecordRoute) {
      setAuthModalOpen(true);
    }
  }, [checkingAuth, currentUser, page, myExamRecordRoute]);

  const handleAuthenticated = (user: LegacyUser) => {
    setCurrentUser(user);
    setAuthModalOpen(false);
    const pendingAction = pendingAuthActionRef.current;
    pendingAuthActionRef.current = null;
    if (pendingAction) {
      window.setTimeout(pendingAction, 0);
    }
  };

  const handleLogout = async () => {
    const userId = currentUser?.id || "";
    const deviceKey = getUserDeviceKey() || undefined;

    try {
      if (userId) await userService.logout(userId, deviceKey);
    } catch {
      // Local logout still needs to happen if the old session is already invalid.
    }

    clearUserSession();
    setCurrentUser(null);
    setPage("home");
    setActiveNav(0);
    notify("已退出登录", "warning");
  };

  useEffect(() => {
    if (!currentUser) {
      setHomeConfig(EMPTY_USER_HOME_CONFIG);
      setStudySummary(EMPTY_STUDY_SUMMARY);
      setLoadingStudySummary(false);
      return;
    }

    let active = true;
    setLoadingStudySummary(true);

    const loadUserDisplayData = async () => {
      const [nextHomeConfig, nextStudySummary] = await Promise.all([
        mockApi.getUserHomeConfig().catch(() => EMPTY_USER_HOME_CONFIG),
        userService.getStudySummary().catch((error) => {
          notify(error instanceof Error ? `学习数据加载失败：${error.message}` : "学习数据加载失败", "warning");
          return EMPTY_STUDY_SUMMARY;
        }),
      ]);

      if (!active) return;
      setHomeConfig(nextHomeConfig || EMPTY_USER_HOME_CONFIG);
      setStudySummary(nextStudySummary || EMPTY_STUDY_SUMMARY);
      setLoadingStudySummary(false);
    };

    void loadUserDisplayData();

    return () => {
      active = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setCourses([]);
      setSelectedCourse(null);
      setRouteCourseAccess({ status: "idle" });
      return;
    }

    let active = true;
    setLoadingCourses(true);

    const loadCourses = async () => {
      try {
        const [courseList, overview] = await Promise.all([
          courseService.getUserCourses(),
          courseService.getUserHomeOverview().catch(() => null),
        ]);
        if (!active) return;
        const mappedCourses = courseList.map((course, index) => mapLegacyCourse(course, index, overview));
        setCourses(mappedCourses);

        const routeCourseId = getRouteCourseId();
        if (routeCourseId) {
          const routeCourse = mappedCourses.find(course => `${course.id}` === routeCourseId);
          if (routeCourse) {
            setSelectedCourse(routeCourse);
            setRouteCourseAccess({ status: "idle" });
            const nextPage = routeCourse.type === "audio" ? "audioDetail" : "courseDetail";
            setPageState(nextPage);
            setActiveNav(1);
          } else {
            setSelectedCourse(null);
            setRouteCourseAccess({ status: "checking" });
            try {
              await courseService.getCourseDetail(routeCourseId);
              setRouteCourseAccess({
                status: "forbidden",
                message: `课程 ${routeCourseId} 暂未出现在你的已开通课程列表，请联系教务老师确认开通状态。`,
              });
            } catch (error) {
              const status = error instanceof ApiRequestError ? error.status : 0;
              if (status === 403) {
                setRouteCourseAccess({
                  status: "forbidden",
                  message: `当前账号尚未开通课程 ${routeCourseId}，或课程还未开放。`,
                });
              } else if (status === 404) {
                setRouteCourseAccess({
                  status: "not_found",
                  message: `没有找到课程 ${routeCourseId}，可能已下架或链接不正确。`,
                });
              } else {
                setRouteCourseAccess({
                  status: "error",
                  message: error instanceof Error ? `课程访问状态确认失败：${error.message}` : "课程访问状态确认失败，请稍后重试。",
                });
              }
            }
          }
        }
      } catch (err) {
        if (!active) return;
        setCourses([]);
        notify(err instanceof Error ? `课程加载失败：${err.message}` : "课程加载失败", "warning");
      } finally {
        if (active) setLoadingCourses(false);
      }
    };

    void loadCourses();

    return () => {
      active = false;
    };
  }, [currentUser]);

  const openCourseDirectly = (course: AppCourse) => {
    setSelectedCourse(course);
    setRouteCourseAccess({ status: "idle" });
    const nextPage = course.type === "audio" ? "audioDetail" : "courseDetail";
    setPageState(nextPage);
    setActiveNav(1);
    if (typeof window !== "undefined") {
      window.history.pushState({ page: nextPage, courseId: course.id }, "", `/courses/${encodeURIComponent(`${course.id}`)}`);
    }
  };

  const goToCourse = (course: AppCourse) => {
    if (!currentUser) {
      requestAuth(() => openCourseDirectly(course));
      return;
    }
    openCourseDirectly(course);
  };

  const startQuestionPracticeDirectly = (
    mode: QuestionPracticeModeLabel = "顺序练习",
    chapter: QuestionPracticeTarget = null,
  ) => {
    setQuestionMode(mode);
    setSelectedQuestionChapter(chapter);
    setRouteQuestionId(undefined);
    setPageState("questionBank");
    setActiveNav(2);
    if (typeof window !== "undefined") {
      const nextPath = buildQuestionPracticePath(mode, chapter);
      window.history.pushState({ page: "questionBank", mode, chapter }, "", nextPath);
      setLocationPath(window.location.pathname);
    }
  };

  const startQuestionPractice = (
    mode: QuestionPracticeModeLabel = "顺序练习",
    chapter: QuestionPracticeTarget = null,
  ) => {
    if (!currentUser) {
      requestAuth(() => startQuestionPracticeDirectly(mode, chapter));
      return;
    }
    startQuestionPracticeDirectly(mode, chapter);
  };

  const openMyQuestionBankDirectly = (paperType: "objective" | "subjective") => {
    setMyQuestionBankPaperType(paperType);
    setPageState("myQuestionBank");
    setActiveNav(2);
    if (typeof window !== "undefined") {
      const nextPath = `/question-bank/my?paperType=${paperType}`;
      window.history.pushState({ page: "myQuestionBank", paperType }, "", nextPath);
      setLocationPath(window.location.pathname);
    }
  };

  const openMyQuestionBank = (paperType: "objective" | "subjective") => {
    if (!currentUser) {
      requestAuth(() => openMyQuestionBankDirectly(paperType));
      return;
    }
    openMyQuestionBankDirectly(paperType);
  };

  const openMockExamRoomDirectly = (target: MockExamSessionTarget) => {
    const nextTarget = target?.mode ? target : { ...(target ?? {}), mode: mockExamMode };
    setSelectedMockExamTarget(nextTarget);
    setMockExamMode(nextTarget?.mode ?? mockExamMode);
    setPageState("mockExamRoom");
    setActiveNav(2);
    if (typeof window !== "undefined") {
      window.history.pushState({ page: "mockExamRoom", ...nextTarget }, "", buildMockExamRoomPath(nextTarget));
    }
  };

  const openMockExamRoom = (target: MockExamSessionTarget) => {
    if (!currentUser) {
      requestAuth(() => openMockExamRoomDirectly(target));
      return;
    }
    openMockExamRoomDirectly(target);
  };

  const authBlocked = !currentUser && (isPageAuthRequired(page) || Boolean(myExamRecordRoute));
  const showMainNav =
    authBlocked ||
    (page !== "mockExamRoom" &&
      page !== "typingPractice" &&
      page !== "lawPractice" &&
      !(page === "questionBank" && selectedQuestionChapter?.layout === "officialSubjective"));

  return (
    <div className={`debao-app-shell debao-theme-${themeMode}`} data-theme={themeMode} style={{ minHeight: "100vh", background: "#090e1a", fontFamily: "'Noto Sans SC',sans-serif", color: "#dde4f0" }}>
      <Toast toast={toast} />
      {checkingAuth ? (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#5a7898", fontSize: 14 }}>正在校验得宝登录态...</div>
      ) : (
      <div className="debao-app-content">
      {showMainNav && <Nav activeNav={activeNav} setActiveNav={setActiveNav} setPage={setPage} currentUser={currentUser} studySummary={studySummary} themeMode={themeMode} onToggleTheme={toggleThemeMode} onRequestAuth={() => requestAuth()} />}
      {authBlocked
        ? <HomePage setPage={setPage} setActiveNav={setActiveNav} goToCourse={goToCourse} notify={notify} courses={courses} homeConfig={homeConfig} studySummary={studySummary} loadingStudySummary={loadingStudySummary} />
        : desktopOnlyFeature
        ? <DesktopOnlyNotice feature={desktopOnlyFeature} backLabel="返回首页" onBack={() => setPage("home")} />
        : myExamRecordRoute
        ? <DebaoMyExamRecordPage
            recordId={myExamRecordRoute.recordId}
            view={myExamRecordRoute.view}
            onBackToMyExams={() => {
              navigateToPath("/user/my-exams", { page: "myProfile" });
            }}
            onBackToPaperList={(paperType) => setPage(paperType === "subjective" ? "subjectiveGrading" : "mockExamHome")}
            onResumeRecord={(recordId, paperType) => {
              openMockExamRoom({ recordId, mode: paperType === "subjective" ? "subjective" : "objective" });
            }}
          />
        : page === "home"
        ? <HomePage setPage={setPage} setActiveNav={setActiveNav} goToCourse={goToCourse} notify={notify} courses={courses} homeConfig={homeConfig} studySummary={studySummary} loadingStudySummary={loadingStudySummary} />
        : page === "courses"
        ? <CoursesPage setPage={setPage} goToCourse={goToCourse} notify={notify} courses={courses} loadingCourses={loadingCourses} studySummary={studySummary} loadingStudySummary={loadingStudySummary} />
        : page === "audioDetail"
        ? selectedCourse ? <AudioPlayerPage setPage={setPage} course={selectedCourse} notify={notify} /> : <CourseRouteState loading={loadingCourses} routeCourseId={routeCourseId} accessState={routeCourseAccess} setPage={setPage} />
        : page === "courseDetail"
        ? selectedCourse ? <CourseDetailPage setPage={setPage} setActiveNav={setActiveNav} course={selectedCourse} notify={notify} /> : <CourseRouteState loading={loadingCourses} routeCourseId={routeCourseId} accessState={routeCourseAccess} setPage={setPage} />
        : page === "questionBankHome"
        ? <QuestionBankHomePage setPage={setPage} startQuestionPractice={startQuestionPractice} notify={notify} homeConfig={homeConfig} openMyQuestionBank={openMyQuestionBank} />
        : page === "myQuestionBank"
        ? <MyQuestionBankPage setPage={setPage} startQuestionPractice={startQuestionPractice} paperTypeFilter={myQuestionBankPaperType} />
        : page === "questionBank"
        ? <QuestionBankPage setPage={setPage} setActiveNav={setActiveNav} initialMode={questionMode} initialChapter={selectedQuestionChapter} initialQuestionId={routeQuestionId} notify={notify} />
        : page === "myNotes"
        ? <MyNotesPage setPage={setPage} goToCourse={goToCourse} courses={courses} />
        : page === "mockExamHome"
        ? <DebaoMockExamListPage kind="objective" setPage={setPage} notify={notify} />
        : page === "lawSearch"
        ? <DebaoLawSearchPage setPage={setPage} />
        : page === "lawPractice"
        ? <LawPracticeRouter />
        : page === "typingPractice"
        ? <TypingPracticeRouter />
        : page === "mockExamRoom"
        ? <LegacyMockExamRouter />
: page === "myProfile"
        ? <MyProfilePage setPage={setPage} goToCourse={goToCourse} currentUser={currentUser} courses={courses} openMockExamRoom={openMockExamRoom} navigateToPath={navigateToPath} homeConfig={homeConfig} notify={notify} studySummary={studySummary} loadingStudySummary={loadingStudySummary} initialTab={typeof window !== "undefined" && window.location.pathname.startsWith("/user/my-exams") ? "exams" : "study"} />
        : page === "editProfile"
        ? <EditProfilePage setPage={setPage} currentUser={currentUser} onUserUpdated={setCurrentUser} notify={notify} />
        : page === "subjectiveGrading"
        ? <DebaoMockExamListPage kind="subjective" setPage={setPage} notify={notify} />
        : page === "settings"
        ? <SettingsPage setPage={setPage} notify={notify} onLogout={handleLogout} currentUser={currentUser} />
        : <HomePage setPage={setPage} setActiveNav={setActiveNav} goToCourse={goToCourse} notify={notify} courses={courses} homeConfig={homeConfig} studySummary={studySummary} loadingStudySummary={loadingStudySummary} />}
      {authModalOpen && <AuthPage variant="modal" onAuthenticated={handleAuthenticated} notify={notify} onClose={() => { pendingAuthActionRef.current = null; setAuthModalOpen(false); }} />}
      </div>
      )}
    </div>
  );
}

export default function App() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  if (typeof window !== "undefined") {
    const legacyRecordDetailMatch = pathname.match(/^\/user\/mock-exams\/records\/([^/]+)\/(result|review-pending)\/?$/);
    if (legacyRecordDetailMatch) {
      window.location.replace(
        `/user/my-exams/records/${legacyRecordDetailMatch[1]}/${legacyRecordDetailMatch[2]}${window.location.search}${window.location.hash}`,
      );
      return null;
    }
  }
  if (pathname.startsWith("/adminpg")) return <ReviewRouter />;
  if (pathname.startsWith("/admin")) return <AdminRouter />;
  if (pathname.startsWith(IMAGE_TARGET_PREVIEW_PATH)) return <ImageTargetPreviewPage />;
  if (pathname.startsWith("/user/typing-practice")) return <DebaoAppShell />;
  return isLegacyMockExamPath(pathname) ? <LegacyMockExamRouter /> : <DebaoAppShell />;
}
