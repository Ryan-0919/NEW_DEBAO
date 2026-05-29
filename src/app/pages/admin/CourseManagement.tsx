import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, FileText, Folder, ImageUp, Link, Pencil, Plus, Save, Search, Rows3, Trash2, Upload, UploadCloud, Video, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { Switch } from "../../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import {
  AdminCourse,
  AdminCourseContent,
  AdminCourseStatus,
  AdminCourseTag,
  AdminCourseType,
  AdminMediaFolder,
  AdminMediaItem,
  AdminPagedResult,
  adminContentService,
} from "../../services/adminContentService";
import { adminOperationsService, type AdminCourseQuestionBankLink } from "../../services/adminOperationsService";
import { adminQuestionBankService, type AdminQuestionBankBook } from "../../services/adminQuestionBankService";

const statusMeta: Record<AdminCourseStatus, { label: string; className: string; helper: string }> = {
  open: { label: "已开放", className: "border-emerald-100 bg-emerald-50 text-emerald-700", helper: "用户端可见" },
  closed: { label: "未开放", className: "border-slate-200 bg-slate-50 text-slate-700", helper: "仅后台维护" },
  scheduled: { label: "定时开放", className: "border-amber-100 bg-amber-50 text-amber-700", helper: "到时间后开放" },
};

const defaultForm = {
  id: "",
  name: "",
  coverUrl: "",
  coverObjectKey: "",
  handoutUrl: "",
  handoutObjectKey: "",
  handoutName: "",
  description: "",
  courseType: "audio" as AdminCourseType,
  status: "closed" as AdminCourseStatus,
  isPublic: false,
  openTime: "",
  sortOrder: 0,
  tagsText: "",
};

const normalizeDateTimeInput = (value = "") => value.replace(" ", "T").slice(0, 16);
const fromDateTimeInput = (value = "") => (value ? `${value.replace("T", " ")}:00`.slice(0, 19) : "");

const getContentCount = (course: AdminCourse) => (course.courseType === "video" ? course.videoCount : course.audioCount);
const getFolderCount = (type: AdminCourseType, folder: AdminMediaFolder) => (type === "video" ? folder.videoCount ?? 0 : folder.audioCount ?? 0);
const formatDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  return `${minutes}:${`${remainSeconds}`.padStart(2, "0")}`;
};
const formatFileSize = (bytes: number) => {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
const MAX_MEDIA_UPLOAD_FILE_SIZE = 2048 * 1024 * 1024;

const mediaStatusMeta = (item: AdminMediaItem) => {
  if (!item.processStatus) return { label: "可用", className: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  if (item.processStatus === "ready") return { label: "已完成", className: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  if (item.processStatus === "failed") return { label: "处理失败", className: "border-rose-100 bg-rose-50 text-rose-700" };
  if (item.processStatus === "processing") return { label: "处理中", className: "border-amber-100 bg-amber-50 text-amber-700" };
  return { label: "待处理", className: "border-slate-200 bg-slate-50 text-slate-600" };
};

type CourseContentSection = AdminCourseContent["sections"][number];

export function CourseManagement() {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<AdminCourseType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AdminCourseStatus | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [editMode, setEditMode] = useState<"list" | "edit">("list");
  const [showContentSheet, setShowContentSheet] = useState(false);
  const [editingCourse, setEditingCourse] = useState<AdminCourse | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [tags, setTags] = useState<AdminCourseTag[]>([]);
  const [tagName, setTagName] = useState("");
  const [saving, setSaving] = useState(false);
  const [assetUploading, setAssetUploading] = useState<"cover" | "handout" | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [courseContent, setCourseContent] = useState<AdminCourseContent | null>(null);
  const [activeContentTagId, setActiveContentTagId] = useState("");
  const [contentActionLoading, setContentActionLoading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [mediaPickerTagId, setMediaPickerTagId] = useState("");
  const [mediaPickerKeyword, setMediaPickerKeyword] = useState("");
  const [mediaPickerFolderId, setMediaPickerFolderId] = useState("");
  const [mediaPickerFolders, setMediaPickerFolders] = useState<AdminMediaFolder[]>([]);
  const [mediaPickerPage, setMediaPickerPage] = useState(1);
  const [mediaPickerLoading, setMediaPickerLoading] = useState(false);
  const [mediaPickerFolderSelecting, setMediaPickerFolderSelecting] = useState(false);
  const [mediaPickerResult, setMediaPickerResult] = useState<AdminPagedResult<AdminMediaItem> | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [showCourseMediaUploadDialog, setShowCourseMediaUploadDialog] = useState(false);
  const [courseUploadFolderId, setCourseUploadFolderId] = useState("");
  const [courseUploadFiles, setCourseUploadFiles] = useState<File[]>([]);
  const [courseUploadScript, setCourseUploadScript] = useState("");
  const [courseUploading, setCourseUploading] = useState(false);
  const [authorizedQuestionBanks, setAuthorizedQuestionBanks] = useState<AdminQuestionBankBook[]>([]);
  const [courseQuestionBankLinks, setCourseQuestionBankLinks] = useState<AdminCourseQuestionBankLink[]>([]);
  const [linkedQuestionBankIds, setLinkedQuestionBankIds] = useState<string[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkOptionsLoading, setLinkOptionsLoading] = useState(true);
  const [linkOptionsError, setLinkOptionsError] = useState("");

  const editingCourseContentCount = editingCourse ? getContentCount(editingCourse) : 0;

  const summary = useMemo(
    () => ({
      total: courses.length,
      audio: courses.filter((course) => course.courseType === "audio").length,
      video: courses.filter((course) => course.courseType === "video").length,
      open: courses.filter((course) => course.status === "open").length,
      scheduled: courses.filter((course) => course.status === "scheduled").length,
    }),
    [courses],
  );

  const visibleCourses = useMemo(() => {
    const currentKeyword = keyword.trim();
    return courses.filter((course) => {
      if (typeFilter !== "all" && course.courseType !== typeFilter) return false;
      if (statusFilter !== "all" && course.status !== statusFilter) return false;
      if (currentKeyword && !course.name.includes(currentKeyword) && !course.description.includes(currentKeyword)) return false;
      return true;
    });
  }, [courses, keyword, statusFilter, typeFilter]);

  const activeContentSection = useMemo(
    () => courseContent?.sections.find((section) => section.id === activeContentTagId) ?? courseContent?.sections[0] ?? null,
    [activeContentTagId, courseContent],
  );

  const mediaPickerSection = useMemo(
    () => courseContent?.sections.find((section) => section.id === mediaPickerTagId) ?? null,
    [courseContent, mediaPickerTagId],
  );

  const boundMediaIds = useMemo(
    () => new Set((courseContent?.sections ?? []).flatMap((section) => section.items.map((item) => item.media.id))),
    [courseContent],
  );

  const selectedMediaSet = useMemo(() => new Set(selectedMediaIds), [selectedMediaIds]);

  const selectedPickerFolder = useMemo(
    () => mediaPickerFolders.find((folder) => folder.id === mediaPickerFolderId) ?? null,
    [mediaPickerFolderId, mediaPickerFolders],
  );

  const visibleSelectableMediaIds = useMemo(
    () =>
      (mediaPickerResult?.items ?? [])
        .filter((item) => !boundMediaIds.has(item.id) && item.processStatus === "ready")
        .map((item) => item.id),
    [boundMediaIds, mediaPickerResult],
  );

  const allVisibleMediaSelected =
    visibleSelectableMediaIds.length > 0 && visibleSelectableMediaIds.every((mediaId) => selectedMediaSet.has(mediaId));
  const linkedQuestionBankSet = useMemo(() => new Set(linkedQuestionBankIds), [linkedQuestionBankIds]);

  const totalContentItems = useMemo(
    () => courseContent?.sections.reduce((sum, section) => sum + section.items.length, 0) ?? 0,
    [courseContent],
  );

  const coverPreviewUrl = form.coverUrl.trim();
  const hasHandout = Boolean(form.handoutUrl.trim() || form.handoutObjectKey.trim() || form.handoutName.trim());
  const pickerType = courseContent?.course.courseType ?? "audio";
  const pickerTypeLabel = pickerType === "video" ? "视频" : "音频";
  const pickerUploadAccept = pickerType === "video" ? ".mp4,.mov,.m4v,.webm,.avi,.mkv,video/*" : ".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*";

  const loadCourses = async (initial = false) => {
    if (initial) setLoading(true);
    else setListLoading(true);
    try {
      setCourses(await adminContentService.getCourses({ type: "all", status: "all" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载课程失败");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses(true);
  }, []);

  const loadCourseQuestionBankLinks = async () => {
    setLinkOptionsLoading(true);
    setLinkOptionsError("");
    try {
      const [objectiveBooks, subjectiveBooks, links] = await Promise.all([
        adminQuestionBankService.getBooks({ accessType: "authorized", paperType: "objective", status: "all", visibility: "all" }),
        adminQuestionBankService.getBooks({ accessType: "authorized", paperType: "subjective", status: "all", visibility: "all" }),
        adminOperationsService.getCourseQuestionBankLinks(),
      ]);
      setAuthorizedQuestionBanks([...objectiveBooks, ...subjectiveBooks]);
      setCourseQuestionBankLinks(links);
      return links;
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载课程题库关联失败";
      setLinkOptionsError(message);
      toast.error(message);
      throw error;
    } finally {
      setLinkOptionsLoading(false);
    }
  };

  useEffect(() => {
    void loadCourseQuestionBankLinks();
  }, []);

  const loadMediaPickerItems = async (page = mediaPickerPage, searchKeyword = mediaPickerKeyword, folderIdOverride?: string) => {
    if (!courseContent || !mediaPickerTagId) return;
    setMediaPickerLoading(true);
    const targetFolderId = folderIdOverride ?? mediaPickerFolderId;
    try {
      const result = await adminContentService.getMediaItems({
        type: courseContent.course.courseType,
        folderId: targetFolderId,
        keyword: searchKeyword.trim(),
        searchScope: targetFolderId ? "current" : "all",
        refFilter: "all",
        sortMode: "uploaded-desc",
        page,
        pageSize: 20,
      });
      setMediaPickerResult(result);
      setMediaPickerPage(result.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载素材失败");
    } finally {
      setMediaPickerLoading(false);
    }
  };

  const searchMediaPickerItems = () => {
    setMediaPickerPage(1);
    void loadMediaPickerItems(1, mediaPickerKeyword);
  };

  useEffect(() => {
    if (showMediaPicker) void loadMediaPickerItems(1, mediaPickerKeyword);
  }, [showMediaPicker, mediaPickerTagId, mediaPickerFolderId]);

  const openCreateDialog = (type: AdminCourseType = "audio") => {
    setEditingCourse(null);
    setTags([]);
    setTagName("");
    setLinkedQuestionBankIds([]);
    setForm({ ...defaultForm, courseType: type });
    setEditMode("edit");
  };

  const openEditDialog = async (course: AdminCourse) => {
    setEditingCourse(course);
    setTagName("");
    setForm({
      id: course.id,
      name: course.name,
      coverUrl: course.cover,
      coverObjectKey: course.coverObjectKey,
      handoutUrl: course.handoutUrl,
      handoutObjectKey: course.handoutObjectKey,
      handoutName: course.handoutName,
      description: course.description,
      courseType: course.courseType,
      status: course.status,
      isPublic: Boolean(course.isPublic),
      openTime: normalizeDateTimeInput(course.openTime),
      sortOrder: course.sortOrder,
      tagsText: "",
    });
    setEditMode("edit");
    let linkSnapshot = courseQuestionBankLinks;
    if (linkOptionsLoading || linkOptionsError) {
      try {
        linkSnapshot = await loadCourseQuestionBankLinks();
      } catch {
        linkSnapshot = [];
      }
    }
    setLinkedQuestionBankIds(linkSnapshot.find((item) => item.courseId === course.id)?.bookIds ?? []);
    try {
      const detail = await adminContentService.getCourseDetail(course.id);
      setTags(detail.tags);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载课程标签失败");
      setTags([]);
    }
  };

  const closeCourseEditor = () => {
    setEditMode("list");
    setEditingCourse(null);
    setTags([]);
    setTagName("");
    setLinkedQuestionBankIds([]);
    setForm(defaultForm);
  };

  const toggleLinkedQuestionBank = (bookId: string, checked: boolean) => {
    setLinkedQuestionBankIds((current) =>
      checked ? [...new Set([...current, bookId])] : current.filter((item) => item !== bookId),
    );
  };

  const saveCourseQuestionBankLinks = async (courseId: string, bookIds: string[]) => {
    setLinkLoading(true);
    try {
      const nextLinks = await adminOperationsService.updateCourseQuestionBankLink(courseId, bookIds);
      setCourseQuestionBankLinks(nextLinks);
    } finally {
      setLinkLoading(false);
    }
  };

  const uploadCourseAsset = async (assetType: "cover" | "handout", file?: File | null) => {
    if (!file) return;
    setAssetUploading(assetType);
    try {
      const uploaded = await adminContentService.uploadCourseAsset(assetType, file);
      if (assetType === "cover") {
        setForm((current) => ({
          ...current,
          coverUrl: uploaded.url,
          coverObjectKey: uploaded.objectKey,
        }));
        toast.success("封面已上传，保存课程后生效");
      } else {
        setForm((current) => ({
          ...current,
          handoutUrl: uploaded.url,
          handoutObjectKey: uploaded.objectKey,
          handoutName: uploaded.fileName,
        }));
        toast.success("讲义已上传，保存课程后生效");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传文件失败");
    } finally {
      setAssetUploading(null);
    }
  };

  const clearCourseHandout = () => {
    setForm((current) => ({
      ...current,
      handoutUrl: "",
      handoutObjectKey: "",
      handoutName: "",
    }));
  };

  const saveCourse = async () => {
    if (!form.name.trim() || !form.coverUrl.trim() || !form.description.trim()) {
      toast.error("课程名称、封面和简介不能为空");
      return;
    }
    if (linkOptionsLoading) {
      toast.error("课程题库关联还在加载，请稍后再保存");
      return;
    }
    if (linkOptionsError) {
      toast.error("课程题库关联加载失败，请刷新后再保存");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        coverUrl: form.coverUrl.trim(),
        coverObjectKey: form.coverObjectKey.trim(),
        handoutUrl: form.handoutUrl.trim(),
        handoutObjectKey: form.handoutObjectKey.trim(),
        handoutName: form.handoutName.trim(),
        description: form.description.trim(),
        courseType: form.courseType,
        status: form.status,
        isPublic: form.isPublic,
        openTime: fromDateTimeInput(form.openTime),
        sortOrder: form.sortOrder,
      };

      if (editingCourse) {
        await adminContentService.updateCourse(editingCourse.id, payload);
        await saveCourseQuestionBankLinks(editingCourse.id, linkedQuestionBankIds);
        toast.success("课程已更新");
      } else {
        const createdCourse = await adminContentService.createCourse({
          ...payload,
          tags: form.tagsText
            .split(/\r?\n|,|，/)
            .map((item) => item.trim())
            .filter(Boolean),
        });
        setEditingCourse(createdCourse);
        setForm((current) => ({ ...current, id: createdCourse.id }));
        try {
          if (linkedQuestionBankIds.length > 0) {
            await saveCourseQuestionBankLinks(createdCourse.id, linkedQuestionBankIds);
          }
        } catch (error) {
          await loadCourses();
          toast.error(error instanceof Error ? `课程已创建，但题库关联保存失败：${error.message}` : "课程已创建，但题库关联保存失败");
          return;
        }
        toast.success("课程已创建");
      }
      setEditMode("list");
      setEditingCourse(null);
      setTags([]);
      setTagName("");
      await loadCourses();
    } catch (error) {
      setLinkLoading(false);
      toast.error(error instanceof Error ? error.message : "保存课程失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleCourseStatus = async (course: AdminCourse) => {
    const nextStatus: AdminCourseStatus = course.status === "open" ? "closed" : "open";
    try {
      await adminContentService.updateCourse(course.id, {
        ...course,
        coverUrl: course.cover,
        status: nextStatus,
      });
      setCourses((current) => current.map((item) => (item.id === course.id ? { ...item, status: nextStatus } : item)));
      toast.success(nextStatus === "open" ? "课程已开放" : "课程已关闭");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新课程状态失败");
    }
  };

  const moveCourse = async (courseId: string, direction: "up" | "down") => {
    const index = visibleCourses.findIndex((course) => course.id === courseId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= visibleCourses.length) return;
    const nextVisible = [...visibleCourses];
    [nextVisible[index], nextVisible[targetIndex]] = [nextVisible[targetIndex], nextVisible[index]];
    const orderItems = nextVisible.map((course, order) => ({ id: course.id, sortOrder: order }));
    setCourses((current) => current.map((course) => ({ ...course, sortOrder: orderItems.find((item) => item.id === course.id)?.sortOrder ?? course.sortOrder })));
    try {
      await adminContentService.updateCourseOrder(orderItems);
      await loadCourses();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "课程排序失败");
      await loadCourses();
    }
  };

  const deleteCourse = async (course: AdminCourse) => {
    if ((course.permissionCount ?? 0) > 0) {
      toast.error("这门课程已有用户权限，不能直接删除");
      return;
    }
    if (getContentCount(course) > 0) {
      toast.error("这门课程还有已编排内容，请先移除内容后再删除");
      return;
    }
    if (!window.confirm(`确定删除课程“${course.name}”吗？该操作会删除课程标签，不能撤销。`)) return;
    try {
      await adminContentService.deleteCourse(course.id);
      toast.success("课程已删除");
      await loadCourses();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除课程失败");
    }
  };

  const createTag = async () => {
    if (!editingCourse || !tagName.trim()) return;
    try {
      const created = await adminContentService.createTag(editingCourse.id, tagName.trim());
      setTags((current) => [...current, created]);
      setTagName("");
      toast.success("标签已新增");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新增标签失败");
    }
  };

  const deleteTag = async (tag: AdminCourseTag) => {
    if (!tag.id) return;
    if ((tag.contentCount ?? 0) > 0 && !window.confirm(`标签“${tag.name}”下有内容，确定删除吗？`)) return;
    try {
      await adminContentService.deleteTag(tag.id);
      setTags((current) => current.filter((item) => item.id !== tag.id));
      toast.success("标签已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除标签失败");
    }
  };

  const openContentSheet = async (course: AdminCourse) => {
    setShowContentSheet(true);
    setCourseContent(null);
    setActiveContentTagId("");
    setShowMediaPicker(false);
    setSelectedMediaIds([]);
    setContentLoading(true);
    try {
      const content = await adminContentService.getCourseContent(course.id);
      setCourseContent(content);
      setActiveContentTagId(content.sections[0]?.id ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载课程内容失败");
    } finally {
      setContentLoading(false);
    }
  };

  const openMediaPicker = (section: CourseContentSection) => {
    const pickerType = courseContent?.course.courseType;
    setMediaPickerTagId(section.id);
    setMediaPickerKeyword("");
    setMediaPickerFolderId("");
    setMediaPickerFolders([]);
    setMediaPickerPage(1);
    setMediaPickerResult(null);
    setSelectedMediaIds([]);
    setShowMediaPicker(true);
    if (pickerType) {
      adminContentService
        .getMediaFolders(pickerType)
        .then(setMediaPickerFolders)
        .catch((error) => toast.error(error instanceof Error ? error.message : "加载文件夹失败"));
    }
  };

  const openCourseMediaUploadDialog = () => {
    if (!courseContent) return;
    if (mediaPickerFolders.length === 0) {
      toast.error("请先在素材库创建文件夹");
      return;
    }
    setCourseUploadFolderId(mediaPickerFolderId || mediaPickerFolders[0]?.id || "");
    setCourseUploadFiles([]);
    setCourseUploadScript("");
    setShowCourseMediaUploadDialog(true);
  };

  const uploadCourseMediaItems = async () => {
    if (!courseContent) return;
    if (!courseUploadFolderId) {
      toast.error("请选择目标文件夹");
      return;
    }
    if (courseUploadFiles.length === 0) {
      toast.error(`请选择要上传的${pickerTypeLabel}文件`);
      return;
    }

    const oversizedFiles = courseUploadFiles.filter((file) => file.size > MAX_MEDIA_UPLOAD_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast.error(`单个文件不能超过 2GB，请拆分或压缩：${oversizedFiles[0].name}`);
      return;
    }

    const targetFolderId = courseUploadFolderId;
    const filesToUpload = [...courseUploadFiles];
    const scriptToUpload = courseUploadScript;
    setCourseUploading(true);
    setShowCourseMediaUploadDialog(false);
    setCourseUploadFiles([]);
    setCourseUploadScript("");
    setMediaPickerFolderId(targetFolderId);
    toast.info(`已开始上传 ${filesToUpload.length} 个${pickerTypeLabel}，可继续操作页面`);

    try {
      let uploadedCount = 0;
      for (const [index, file] of filesToUpload.entries()) {
        const script = filesToUpload.length === 1 || index === 0 ? scriptToUpload : "";
        const uploaded = await adminContentService.uploadMediaItems(pickerType, targetFolderId, [file], script);
        uploadedCount += uploaded.length;
      }
      toast.success(`已上传 ${uploadedCount} 个${pickerTypeLabel}，后台处理完成后可添加到课程`);
      await Promise.all([
        adminContentService.getMediaFolders(pickerType).then(setMediaPickerFolders),
        loadMediaPickerItems(1, mediaPickerKeyword, targetFolderId),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `部分${pickerTypeLabel}上传失败`);
      await Promise.all([
        adminContentService.getMediaFolders(pickerType).then(setMediaPickerFolders),
        loadMediaPickerItems(1, mediaPickerKeyword, targetFolderId),
      ]);
    } finally {
      setCourseUploading(false);
    }
  };

  const toggleMediaSelection = (mediaId: string) => {
    setSelectedMediaIds((current) => (current.includes(mediaId) ? current.filter((id) => id !== mediaId) : [...current, mediaId]));
  };

  const toggleVisibleMediaSelection = () => {
    if (visibleSelectableMediaIds.length === 0) return;
    setSelectedMediaIds((current) => {
      const currentSet = new Set(current);
      const shouldRemove = visibleSelectableMediaIds.every((mediaId) => currentSet.has(mediaId));
      if (shouldRemove) {
        visibleSelectableMediaIds.forEach((mediaId) => currentSet.delete(mediaId));
      } else {
        visibleSelectableMediaIds.forEach((mediaId) => currentSet.add(mediaId));
      }
      return Array.from(currentSet);
    });
  };

  const selectCurrentFolderMedia = async () => {
    if (!courseContent || !mediaPickerFolderId) {
      toast.error("请先选择一个文件夹");
      return;
    }
    setMediaPickerFolderSelecting(true);
    try {
      const baseParams = {
        type: courseContent.course.courseType,
        folderId: mediaPickerFolderId,
        searchScope: "current",
        refFilter: "all",
        sortMode: "uploaded-desc",
        pageSize: 100,
      };
      const firstPage = await adminContentService.getMediaItems({ ...baseParams, page: 1 });
      const restPages =
        firstPage.totalPages > 1
          ? await Promise.all(Array.from({ length: firstPage.totalPages - 1 }, (_, index) => adminContentService.getMediaItems({ ...baseParams, page: index + 2 })))
          : [];
      const folderItems = [firstPage, ...restPages].flatMap((pageResult) => pageResult.items);
      const nextIds = folderItems
        .filter((item) => !boundMediaIds.has(item.id) && item.processStatus === "ready")
        .map((item) => item.id);
      if (nextIds.length === 0) {
        toast.info("当前文件夹没有可添加的内容");
        return;
      }
      setSelectedMediaIds((current) => Array.from(new Set([...current, ...nextIds])));
      const skippedCount = Math.max(folderItems.length - nextIds.length, 0);
      toast.success(skippedCount > 0 ? `已选择 ${nextIds.length} 个，跳过 ${skippedCount} 个已引用或不可用内容` : `已选择当前文件夹 ${nextIds.length} 个内容`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "选择文件夹内容失败");
    } finally {
      setMediaPickerFolderSelecting(false);
    }
  };

  const addSelectedMedia = async () => {
    if (!courseContent || !mediaPickerTagId || selectedMediaIds.length === 0) return;
    setContentActionLoading(true);
    try {
      const updated = await adminContentService.addCourseContent(courseContent.course.id, mediaPickerTagId, selectedMediaIds);
      setCourseContent(updated);
      setActiveContentTagId(mediaPickerTagId);
      setShowMediaPicker(false);
      setSelectedMediaIds([]);
      toast.success(updated.addedCount > 0 ? `已添加 ${updated.addedCount} 个内容` : "选中的内容已在课程中");
      await loadCourses();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加内容失败");
    } finally {
      setContentActionLoading(false);
    }
  };

  const removeContentItem = async (relationId: string) => {
    if (!courseContent) return;
    setContentActionLoading(true);
    try {
      const updated = await adminContentService.removeCourseContent(courseContent.course.id, relationId);
      setCourseContent(updated);
      toast.success("内容已移除");
      await loadCourses();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除内容失败");
    } finally {
      setContentActionLoading(false);
    }
  };

  const moveContentItem = async (section: CourseContentSection, relationId: string, direction: "up" | "down") => {
    if (!courseContent) return;
    const index = section.items.findIndex((item) => item.relationId === relationId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= section.items.length) return;

    const nextItems = [...section.items];
    [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];
    const nextContent: AdminCourseContent = {
      ...courseContent,
      sections: courseContent.sections.map((item) =>
        item.id === section.id
          ? {
              ...item,
              items: nextItems.map((contentItem, order) => ({ ...contentItem, order })),
            }
          : item,
      ),
    };
    setCourseContent(nextContent);
    setContentActionLoading(true);
    try {
      const updated = await adminContentService.updateCourseContentOrder(
        courseContent.course.id,
        section.id,
        nextItems.map((item, order) => ({ relationId: item.relationId, order })),
      );
      setCourseContent(updated);
      setActiveContentTagId(section.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "内容排序失败");
      setCourseContent(courseContent);
    } finally {
      setContentActionLoading(false);
    }
  };

  const courseEditor = editMode === "edit" ? (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button variant="ghost" className="mb-3 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900" onClick={closeCourseEditor}>
            <ArrowLeft className="mr-2 size-4" />
            返回课程列表
          </Button>
          <h1 className="text-2xl font-semibold text-slate-900">{editingCourse ? "编辑课程" : "新建课程"}</h1>
          <p className="mt-2 text-sm text-slate-500">维护课程基础信息、开放状态、封面讲义和课程标签。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={closeCourseEditor}>取消</Button>
          <Button onClick={() => void saveCourse()} disabled={saving || assetUploading !== null || linkOptionsLoading}>
            <Save className="mr-2 size-4" />
            {saving ? (linkLoading ? "保存关联中..." : "保存中...") : assetUploading ? "文件上传中..." : linkOptionsLoading ? "题库关联加载中..." : "保存课程"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">基础信息</h2>
                <p className="mt-1 text-sm text-slate-500">课程名称、类型、简介会展示在用户端课程列表和详情页。</p>
              </div>
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{form.courseType === "video" ? "视频课" : "音频课"}</Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>课程名称</Label>
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>课程类型</Label>
                <Select
                  value={form.courseType}
                  disabled={editingCourseContentCount > 0}
                  onValueChange={(value) => setForm((current) => ({ ...current, courseType: value as AdminCourseType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="audio">音频课程</SelectItem>
                    <SelectItem value="video">视频课程</SelectItem>
                  </SelectContent>
                </Select>
                {editingCourseContentCount > 0 ? <p className="text-xs text-amber-600">已有 {editingCourseContentCount} 个内容，不能切换课程类型。</p> : null}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>课程简介</Label>
                <Textarea rows={8} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 border-b border-slate-100 pb-4">
              <h2 className="text-base font-semibold text-slate-900">开放设置</h2>
              <p className="mt-1 text-sm text-slate-500">控制课程是否对有权限的用户开放。</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as AdminCourseStatus }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">已开放</SelectItem>
                    <SelectItem value="closed">未开放</SelectItem>
                    <SelectItem value="scheduled">定时开放</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>开放时间</Label>
                <Input type="datetime-local" value={form.openTime} onChange={(event) => setForm((current) => ({ ...current, openTime: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>排序值</Label>
                <Input type="number" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
              </div>
              <div className="sm:col-span-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm font-semibold text-emerald-900">免费公开</Label>
                    <p className="mt-1 text-xs text-emerald-700">开启后，课程在已开放状态下对所有登录学员可见，无需单独授权。</p>
                  </div>
                  <Switch checked={form.isPublic} onCheckedChange={(checked) => setForm((current) => ({ ...current, isPublic: checked }))} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">讲义资料</h2>
                <p className="mt-1 text-sm text-slate-500">支持本地上传，也保留旧系统讲义 URL、ObjectKey 和讲义名称字段。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="border-slate-200 bg-white text-slate-700">
                  <label className="cursor-pointer">
                    <Upload className="mr-2 size-4" />
                    {assetUploading === "handout" ? "上传中..." : "上传本地讲义"}
                    <input
                      type="file"
                      className="hidden"
                      disabled={assetUploading !== null}
                      onChange={(event) => {
                        void uploadCourseAsset("handout", event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </Button>
                <Button type="button" variant="outline" className="border-slate-200 bg-white text-slate-700" disabled={!hasHandout} onClick={clearCourseHandout}>
                  清除讲义
                </Button>
              </div>
            </div>
            {hasHandout ? (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <FileText className="size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{form.handoutName || "已配置课程讲义"}</p>
                  <p className="mt-1 truncate text-xs text-blue-700">{form.handoutUrl || form.handoutObjectKey}</p>
                </div>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label>讲义 URL</Label>
                <Input value={form.handoutUrl} onChange={(event) => setForm((current) => ({ ...current, handoutUrl: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>讲义名称</Label>
                <Input value={form.handoutName} onChange={(event) => setForm((current) => ({ ...current, handoutName: event.target.value }))} />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label>讲义 ObjectKey</Label>
                <Input value={form.handoutObjectKey} onChange={(event) => setForm((current) => ({ ...current, handoutObjectKey: event.target.value }))} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">关联题库权限</h2>
                <p className="mt-1 text-sm text-slate-500">勾选后，拥有本课程权限的学员会在“我的题库”看到对应授权题库。</p>
              </div>
              <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
                {linkOptionsLoading ? "加载中" : linkOptionsError ? "未加载" : `已选 ${linkedQuestionBankIds.length} 个`}
              </Badge>
            </div>
            {linkOptionsLoading ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">正在加载可关联题库，请稍候。</div>
            ) : linkOptionsError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{linkOptionsError}</div>
            ) : authorizedQuestionBanks.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">暂无授权题库。请先在授权题库管理中创建并发布题库。</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {authorizedQuestionBanks.map((book) => {
                  const checked = linkedQuestionBankSet.has(book.id);
                  return (
                    <label key={book.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${checked ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <Checkbox checked={checked} disabled={linkOptionsLoading || Boolean(linkOptionsError)} onCheckedChange={(value) => toggleLinkedQuestionBank(book.id, value === true)} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{book.name}</span>
                        <span className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{book.paperType === "subjective" ? "主观题" : "客观题"}</span>
                          <span>{book.status === "published" ? "已发布" : book.status === "closed" ? "已关闭" : "草稿"}</span>
                          <span>{book.isVisible ? "可见" : "隐藏"}</span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">封面</h2>
                <p className="mt-1 text-sm text-slate-500">封面会在用户端课程入口展示，支持本地图片上传。</p>
              </div>
              <Button asChild variant="outline" className="border-slate-200 bg-white text-slate-700">
                <label className="cursor-pointer">
                  <ImageUp className="mr-2 size-4" />
                  {assetUploading === "cover" ? "上传中..." : "上传封面"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={assetUploading !== null}
                    onChange={(event) => {
                      void uploadCourseAsset("cover", event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>
            <div className="space-y-4">
              <div className="aspect-[3/2] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {coverPreviewUrl ? <img src={coverPreviewUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-sm text-slate-400">暂无封面</div>}
              </div>
              <div className="space-y-2">
                <Label>封面 URL</Label>
                <div className="relative">
                  <Link className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-9" value={form.coverUrl} onChange={(event) => setForm((current) => ({ ...current, coverUrl: event.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>封面 ObjectKey</Label>
                <Input value={form.coverObjectKey} onChange={(event) => setForm((current) => ({ ...current, coverObjectKey: event.target.value }))} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">课程标签</h2>
                <p className="mt-1 text-sm text-slate-500">标签用于组织课程内容。</p>
              </div>
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{editingCourse ? `${tags.length} 个` : "创建后生效"}</Badge>
            </div>
            {editingCourse ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="新增标签" />
                  <Button type="button" variant="outline" onClick={() => void createTag()}>
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag.id ?? tag.name} variant="outline" className="gap-2 border-slate-200 bg-slate-50 text-slate-700">
                      {tag.name}
                      <button type="button" className="text-rose-500 hover:text-rose-700" onClick={() => void deleteTag(tag)}>
                        ×
                      </button>
                    </Badge>
                  ))}
                  {tags.length === 0 ? <p className="text-sm text-slate-400">暂无标签</p> : null}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>初始标签</Label>
                <Textarea rows={7} value={form.tagsText} onChange={(event) => setForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder="每行一个标签，也支持逗号分隔" />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  ) : null;

  if (loading) return <div className="py-10 text-slate-500">课程数据加载中...</div>;

  if (courseEditor) return courseEditor;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">课程管理</h1>
            <p className="mt-2 text-sm text-slate-500">保留课程原字段，统一维护音频课、视频课、开放状态、讲义、标签和内容编排。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => openCreateDialog("audio")}>
              <Volume2 className="mr-2 size-4" />
              新建音频课
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => openCreateDialog("video")}>
              <Video className="mr-2 size-4" />
              新建视频课
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {[
            { label: "全部课程", value: summary.total, icon: BookOpen },
            { label: "音频课", value: summary.audio, icon: Volume2 },
            { label: "视频课", value: summary.video, icon: Video },
            { label: "已开放", value: summary.open, icon: Rows3 },
            { label: "定时开放", value: summary.scheduled, icon: FileText },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <Icon className="size-4 text-slate-400" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <Input className="w-72 border-slate-200 bg-white" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索课程名称或简介" />
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as AdminCourseType | "all")}>
              <SelectTrigger className="w-36 border-slate-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="audio">音频课程</SelectItem>
                <SelectItem value="video">视频课程</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as AdminCourseStatus | "all")}>
              <SelectTrigger className="w-36 border-slate-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="open">已开放</SelectItem>
                <SelectItem value="closed">未开放</SelectItem>
                <SelectItem value="scheduled">定时开放</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void loadCourses()}>
              {listLoading ? "刷新中..." : "刷新"}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-3">排序</th>
                  <th className="px-4 py-3">课程</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">内容/权限</th>
                  <th className="px-4 py-3">开放时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleCourses.map((course, index) => (
                  <tr key={course.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="size-8 p-0 text-slate-500" disabled={index === 0} onClick={() => void moveCourse(course.id, "up")}>
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="size-8 p-0 text-slate-500" disabled={index === visibleCourses.length - 1} onClick={() => void moveCourse(course.id, "down")}>
                          <ArrowDown className="size-4" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                          {course.cover ? <img src={course.cover} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{course.name}</p>
                          {course.isPublic ? <Badge variant="outline" className="mt-1 border-emerald-100 bg-emerald-50 text-emerald-700">免费公开</Badge> : null}
                          <p className="mt-1 line-clamp-2 max-w-xl text-xs leading-5 text-slate-500">{course.description || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{course.courseType === "video" ? "视频课" : "音频课"}</td>
                    <td className="px-4 py-4">
                      <Badge variant="outline" className={statusMeta[course.status].className}>{statusMeta[course.status].label}</Badge>
                      <p className="mt-1 text-xs text-slate-400">{statusMeta[course.status].helper}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <p>{getContentCount(course)} 节内容</p>
                      <p className="mt-1 text-xs text-slate-400">{course.permissionCount ?? 0} 个用户权限</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500">{course.openTime || "-"}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="border-slate-200 bg-white" onClick={() => void toggleCourseStatus(course)}>
                          {course.status === "open" ? "关闭" : "开放"}
                        </Button>
                        <Button variant="outline" size="sm" className="border-slate-200 bg-white" onClick={() => void openContentSheet(course)}>
                          内容
                        </Button>
                        <Button variant="outline" size="sm" className="border-slate-200 bg-white" onClick={() => void openEditDialog(course)}>
                          <Pencil className="mr-1 size-4" />
                          编辑
                        </Button>
                        <Button variant="outline" size="sm" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => void deleteCourse(course)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleCourses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">
                      暂无符合条件的课程
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Sheet open={showContentSheet} onOpenChange={setShowContentSheet}>
        <SheetContent side="right" className="flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-white p-0 text-slate-900 sm:max-w-[min(1440px,96vw)]">
          <SheetHeader className="border-b border-slate-200 px-6 py-5 pr-14">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <SheetTitle>{courseContent?.course.name ?? "课程内容"}</SheetTitle>
                <SheetDescription className="mt-2">按课程标签编排音频/视频内容，用户端按这里的顺序展示。</SheetDescription>
              </div>
              {courseContent ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                    {courseContent.course.courseType === "video" ? "视频课" : "音频课"}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                    {courseContent.sections.length} 个标签
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                    {totalContentItems} 个内容
                  </Badge>
                </div>
              ) : null}
            </div>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {contentLoading ? <div className="py-16 text-center text-slate-500">内容加载中...</div> : null}
            {!contentLoading && courseContent ? (
              <Tabs value={activeContentSection?.id ?? courseContent.sections[0]?.id ?? "empty"} onValueChange={setActiveContentTagId} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">课程标签</p>
                    <p className="mt-1 text-xs text-slate-400">先选标签，再添加对应文件夹或单个素材。</p>
                  </div>
                  {activeContentSection ? (
                    <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => openMediaPicker(activeContentSection)} disabled={contentActionLoading}>
                      <Plus className="mr-2 size-4" />
                      添加{courseContent.course.courseType === "video" ? "视频" : "音频"}
                    </Button>
                  ) : null}
                </div>

                <TabsList className="flex h-auto w-full flex-wrap justify-start rounded-lg bg-slate-100 p-1">
                  {courseContent.sections.map((section) => (
                    <TabsTrigger key={section.id} value={section.id} className="rounded-md px-4 py-2 data-[state=active]:bg-white">
                      {section.name} · {section.items.length}
                    </TabsTrigger>
                  ))}
                  {courseContent.sections.length === 0 ? <TabsTrigger value="empty">暂无标签</TabsTrigger> : null}
                </TabsList>
                {courseContent.sections.map((section) => (
                  <TabsContent key={section.id} value={section.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{section.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{section.items.length} 个内容，顺序从上到下展示给用户</p>
                      </div>
                      <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => openMediaPicker(section)} disabled={contentActionLoading}>
                        <Plus className="mr-2 size-4" />
                        添加内容
                      </Button>
                    </div>
                    {section.items.length > 0 ? (
                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <div className="grid min-w-[1040px] grid-cols-[72px_minmax(320px,1fr)_150px_170px_150px_120px] gap-3 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                          <span>顺序</span>
                          <span>内容名称</span>
                          <span>文件夹</span>
                          <span>文稿/讲义</span>
                          <span>上传时间</span>
                          <span className="text-right">操作</span>
                        </div>
                        <div className="overflow-x-auto divide-y divide-slate-100">
                          {section.items.map((item, index) => (
                            <div key={item.relationId} className="grid min-w-[1040px] grid-cols-[72px_minmax(320px,1fr)_150px_170px_150px_120px] gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                              <div className="flex items-center text-slate-500">#{index + 1}</div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900">{item.media.name}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  时长 {formatDuration(item.media.duration)} · {item.media.mimeType || "未知格式"}
                                </p>
                              </div>
                              <div className="flex min-w-0 items-center text-slate-600">
                                <span className="truncate">{item.media.folderName || "未分组"}</span>
                              </div>
                              <div className="flex min-w-0 flex-col justify-center gap-1 text-xs text-slate-600">
                                <span>{item.media.hasScript ? "有文稿" : "缺文稿"}</span>
                                <span className="truncate text-slate-400">{item.media.hasHandout ? item.media.handoutName || "有讲义" : "无讲义"}</span>
                              </div>
                              <div className="flex items-center text-xs text-slate-500">{item.media.uploadedAt || "-"}</div>
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="size-8 p-0 text-slate-500 hover:bg-slate-100" disabled={index === 0 || contentActionLoading} onClick={() => void moveContentItem(section, item.relationId, "up")}>
                                  <ArrowUp className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="size-8 p-0 text-slate-500 hover:bg-slate-100" disabled={index === section.items.length - 1 || contentActionLoading} onClick={() => void moveContentItem(section, item.relationId, "down")}>
                                  <ArrowDown className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="size-8 p-0 text-rose-600 hover:bg-rose-50" disabled={contentActionLoading} onClick={() => void removeContentItem(item.relationId)}>
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">这个标签下暂无内容</div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={showMediaPicker}
        onOpenChange={(open) => {
          setShowMediaPicker(open);
          if (!open) setSelectedMediaIds([]);
        }}
      >
        <DialogContent className="flex h-[calc(100vh-24px)] w-[calc(100vw-24px)] max-w-none flex-col overflow-hidden border border-slate-200 bg-white p-0 text-slate-900">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>添加{courseContent?.course.courseType === "video" ? "视频" : "音频"}内容</DialogTitle>
            <DialogDescription>{mediaPickerSection ? `添加到「${mediaPickerSection.name}」标签，已在本课程中的内容会自动禁用。` : "选择素材并批量加入课程标签。"}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={mediaPickerFolderId || "all"}
                onValueChange={(value) => {
                  setMediaPickerFolderId(value === "all" ? "" : value);
                  setMediaPickerPage(1);
                }}
              >
                <SelectTrigger className="w-64 border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">全部文件夹</SelectItem>
                  {mediaPickerFolders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name} ({getFolderCount(courseContent?.course.courseType ?? "audio", folder)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="border-slate-200 bg-white pl-9"
                  value={mediaPickerKeyword}
                  onChange={(event) => setMediaPickerKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") searchMediaPickerItems();
                  }}
                  placeholder="搜索素材名称"
                />
              </div>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={searchMediaPickerItems}>
                搜索
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="text-slate-600">
                当前：{selectedPickerFolder?.name ?? "全部文件夹"} · 共 {mediaPickerResult?.total ?? 0} 条 · 已选 {selectedMediaIds.length} 个
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" disabled={courseUploading} onClick={openCourseMediaUploadDialog}>
                  <UploadCloud className="size-4" />
                  {courseUploading ? "上传中..." : `批量上传${pickerTypeLabel}`}
                </Button>
                <Button variant="outline" className="border-slate-200 bg-white text-slate-700" disabled={visibleSelectableMediaIds.length === 0} onClick={toggleVisibleMediaSelection}>
                  {allVisibleMediaSelected ? "取消本页选择" : "选择本页"}
                </Button>
                <Button variant="outline" className="border-slate-200 bg-white text-slate-700" disabled={!mediaPickerFolderId || mediaPickerFolderSelecting} onClick={() => void selectCurrentFolderMedia()}>
                  {mediaPickerFolderSelecting ? "选择中..." : "选择当前文件夹全部"}
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border border-slate-200">
              <div className="sticky top-0 z-10 grid min-w-[1320px] grid-cols-[44px_minmax(300px,1.4fr)_190px_120px_170px_140px_150px_110px] gap-3 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                <span />
                <span>素材信息</span>
                <span>文件夹</span>
                <span>状态</span>
                <span>文稿/讲义</span>
                <span>上传时间</span>
                <span>引用课程</span>
                <span className="text-right">引用次数</span>
              </div>
              <div className="min-w-[1320px] flex-1 divide-y divide-slate-100 bg-white">
                {mediaPickerLoading ? <div className="py-12 text-center text-sm text-slate-500">素材加载中...</div> : null}
                {!mediaPickerLoading &&
                  mediaPickerResult?.items.map((item) => {
                    const status = mediaStatusMeta(item);
                    const alreadyBound = boundMediaIds.has(item.id);
                    const disabled = alreadyBound || item.processStatus !== "ready";
                    return (
                      <div key={item.id} className={`grid grid-cols-[44px_minmax(300px,1.4fr)_190px_120px_170px_140px_150px_110px] gap-3 px-4 py-3 ${disabled ? "bg-slate-50 text-slate-400" : "hover:bg-slate-50"}`}>
                        <div className="flex items-center">
                          <Checkbox checked={alreadyBound || selectedMediaSet.has(item.id)} disabled={disabled} onCheckedChange={() => toggleMediaSelection(item.id)} />
                        </div>
                        <button type="button" className="min-w-0 text-left" disabled={disabled} onClick={() => toggleMediaSelection(item.id)}>
                          <p className="truncate font-medium text-slate-900">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            时长 {formatDuration(item.duration)} · {item.mimeType || "未知格式"}
                          </p>
                        </button>
                        <div className="flex min-w-0 items-center text-sm text-slate-600">
                          <span className="truncate">{item.folderName || "未分组"}</span>
                        </div>
                        <div className="flex items-center">
                          <Badge variant="outline" className={status.className}>{alreadyBound ? "已在课程" : status.label}</Badge>
                        </div>
                        <div className="flex min-w-0 flex-col justify-center gap-1 text-xs text-slate-600">
                          <span>{item.hasScript ? "有文稿" : "缺文稿"}</span>
                          <span className="truncate text-slate-400">{item.hasHandout ? item.handoutName || "有讲义" : "无讲义"}</span>
                        </div>
                        <div className="flex items-center text-xs text-slate-500">{item.uploadedAt || "-"}</div>
                        <div className="flex min-w-0 flex-col justify-center gap-1">
                          {item.courseRefs.slice(0, 2).map((ref) => (
                            <Badge key={`${ref.courseId}-${ref.tagId}`} variant="outline" className="max-w-full border-slate-200 bg-slate-50 text-slate-600">
                              <span className="truncate">{ref.courseName} / {ref.tagName}</span>
                            </Badge>
                          ))}
                          {item.courseRefs.length === 0 ? <span className="text-xs text-slate-400">未引用</span> : null}
                          {item.courseRefs.length > 2 ? <span className="text-xs text-slate-400">+{item.courseRefs.length - 2} 个引用</span> : null}
                        </div>
                        <div className="flex items-center justify-end text-xs text-slate-500">{item.courseRefs.length} 次</div>
                      </div>
                    );
                  })}
                {!mediaPickerLoading && mediaPickerResult?.items.length === 0 ? <div className="py-12 text-center text-sm text-slate-400">没有找到素材</div> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
              <span>已选择 {selectedMediaIds.length} 个</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="border-slate-200 bg-white" disabled={!mediaPickerResult || mediaPickerPage <= 1 || mediaPickerLoading} onClick={() => void loadMediaPickerItems(mediaPickerPage - 1, mediaPickerKeyword)}>
                  上一页
                </Button>
                <span>
                  {mediaPickerResult?.page ?? 1} / {mediaPickerResult?.totalPages ?? 1}
                </span>
                <Button variant="outline" className="border-slate-200 bg-white" disabled={!mediaPickerResult || mediaPickerPage >= mediaPickerResult.totalPages || mediaPickerLoading} onClick={() => void loadMediaPickerItems(mediaPickerPage + 1, mediaPickerKeyword)}>
                  下一页
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setShowMediaPicker(false)}>
              <X className="mr-2 size-4" />
              取消
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={selectedMediaIds.length === 0 || contentActionLoading} onClick={() => void addSelectedMedia()}>
              <Check className="mr-2 size-4" />
              {contentActionLoading ? "添加中..." : `确认添加 ${selectedMediaIds.length} 个`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCourseMediaUploadDialog}
        onOpenChange={(open) => {
          if (courseUploading) return;
          setShowCourseMediaUploadDialog(open);
        }}
      >
        <DialogContent className="flex h-[calc(100vh-48px)] w-[calc(100vw-32px)] max-w-[1040px] flex-col overflow-hidden border border-slate-200 bg-white p-0 text-slate-900 sm:max-w-[1040px]">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>批量上传{pickerTypeLabel}</DialogTitle>
            <DialogDescription>
              文件会逐个上传到{pickerTypeLabel}库处理队列，处理完成后再从列表中添加到当前课程。单个文件最大 2GB。
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>目标文件夹</Label>
                  <Select value={courseUploadFolderId} onValueChange={setCourseUploadFolderId}>
                    <SelectTrigger className="border-slate-200 bg-white">
                      <SelectValue placeholder="请选择目标文件夹" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {mediaPickerFolders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.name} ({getFolderCount(pickerType, folder)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center hover:bg-blue-50">
                  <UploadCloud className="mb-4 size-10 text-blue-600" />
                  <span className="text-base font-semibold text-blue-700">选择本地{pickerTypeLabel}文件</span>
                  <span className="mt-2 text-sm text-slate-500">
                    {pickerType === "video" ? "支持 MP4、MOV、M4V、WEBM、AVI、MKV，可多选" : "支持 MP3、WAV、M4A、AAC、OGG、FLAC，可多选"}
                  </span>
                  <Input
                    type="file"
                    accept={pickerUploadAccept}
                    multiple
                    className="hidden"
                    onChange={(event) => setCourseUploadFiles(Array.from(event.target.files ?? []))}
                  />
                </label>

                <div className="space-y-2">
                  <Label>文稿（可选）</Label>
                  <Textarea
                    rows={8}
                    value={courseUploadScript}
                    onChange={(event) => setCourseUploadScript(event.target.value)}
                    placeholder={`如果只上传一个${pickerTypeLabel}，这里会作为该素材的文稿；多选时只写入第一个素材。`}
                  />
                </div>
              </div>
            </div>

            <aside className="min-h-0 overflow-y-auto border-t border-slate-200 bg-slate-50 px-6 py-5 lg:border-l lg:border-t-0">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">待上传文件</h3>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{courseUploadFiles.length}</Badge>
                </div>
                <div className="mt-4 space-y-2">
                  {courseUploadFiles.length > 0 ? (
                    courseUploadFiles.map((file, index) => (
                      <div key={`${file.name}-${file.size}-${index}`} className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                          {pickerType === "video" ? <Video className="size-4" /> : <Volume2 className="size-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatFileSize(file.size) || "未知大小"}</p>
                        </div>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-rose-600"
                          onClick={() => setCourseUploadFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          aria-label={`移除${file.name}`}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-200 px-3 py-12 text-center text-sm text-slate-400">
                      还没有选择文件
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                {pickerType === "video"
                  ? "点击开始上传后弹窗会关闭，视频会按顺序上传并生成 HLS 分片。处理完成前列表中不会作为可添加内容。"
                  : "点击开始上传后弹窗会关闭，音频会按顺序上传并处理为在线播放格式。处理完成前列表中不会作为可添加内容。"}
              </div>
            </aside>
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setShowCourseMediaUploadDialog(false)} disabled={courseUploading}>
              取消
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => void uploadCourseMediaItems()} disabled={courseUploading || courseUploadFiles.length === 0 || !courseUploadFolderId}>
              {courseUploading ? "上传中..." : `开始上传 ${courseUploadFiles.length || ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
