import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Folder, FolderPlus, Loader2, Pencil, Search, Trash2, UploadCloud, Video, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import {
  AdminCourse,
  AdminCourseType,
  AdminMediaFolder,
  AdminMediaItem,
  AdminMediaMeta,
  adminContentService,
} from "../../services/adminContentService";

type RefFilter = "all" | "referenced" | "unreferenced";
type ScriptFilter = "all" | "scripted" | "unscripted";

const PAGE_SIZE = 20;

const formatDuration = (seconds = 0) => {
  const safe = Math.max(0, Number(seconds ?? 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const MAX_MEDIA_UPLOAD_FILE_SIZE = 2048 * 1024 * 1024;

const getFolderCount = (type: AdminCourseType, folder: AdminMediaFolder) => (type === "video" ? folder.videoCount ?? 0 : folder.audioCount ?? 0);

const getProcessBadge = (item: AdminMediaItem, type: AdminCourseType) => {
  if (item.processStatus === "ready" || !item.processStatus) {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-100 bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="size-3" />
        可用
      </Badge>
    );
  }
  if (item.processStatus === "pending" || item.processStatus === "processing") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-100 bg-amber-50 text-amber-700">
        <Loader2 className="size-3 animate-spin" />
        处理中
      </Badge>
    );
  }
  return <Badge variant="outline" className="border-rose-100 bg-rose-50 text-rose-700">失败</Badge>;
};

export function MediaLibraryManagement({ type }: { type: AdminCourseType }) {
  const [folders, setFolders] = useState<AdminMediaFolder[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [items, setItems] = useState<AdminMediaItem[]>([]);
  const [meta, setMeta] = useState<AdminMediaMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [refFilter, setRefFilter] = useState<RefFilter>("all");
  const [scriptFilter, setScriptFilter] = useState<ScriptFilter>("all");
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showBatchMoveDialog, setShowBatchMoveDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState<AdminMediaFolder | null>(null);
  const [editingItem, setEditingItem] = useState<AdminMediaItem | null>(null);
  const [folderName, setFolderName] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [batchTargetFolderId, setBatchTargetFolderId] = useState("");
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemFolderId, setItemFolderId] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [handoutUrl, setHandoutUrl] = useState("");
  const [handoutName, setHandoutName] = useState("");
  const [handoutObjectKey, setHandoutObjectKey] = useState("");
  const [handoutFile, setHandoutFile] = useState<File | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [reprocessingItemId, setReprocessingItemId] = useState("");
  const [uploadFolderId, setUploadFolderId] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadScript, setUploadScript] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const labels = type === "video"
    ? { title: "视频库", single: "视频", folder: "视频文件夹", icon: Video }
    : { title: "音频库", single: "音频", folder: "音频文件夹", icon: Volume2 };
  const TitleIcon = labels.icon;

  const selectedFolder = useMemo(() => folders.find((folder) => folder.id === selectedFolderId) ?? null, [folders, selectedFolderId]);
  const filteredCourses = useMemo(() => courses.filter((course) => course.courseType === type), [courses, type]);
  const selectedItemSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const selectedItems = useMemo(() => items.filter((item) => selectedItemSet.has(item.id)), [items, selectedItemSet]);
  const selectedReferencedCount = selectedItems.filter((item) => item.courseRefs.length > 0).length;
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedItemSet.has(item.id));
  const uploadAccept = type === "video" ? ".mp4,.mov,.m4v,.webm,.avi,.mkv,video/*" : ".mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*";

  const loadBase = async () => {
    setLoading(true);
    try {
      const [folderList, courseList, nextMeta] = await Promise.all([
        adminContentService.getMediaFolders(type),
        adminContentService.getCourses({ type, status: "all" }),
        adminContentService.getMediaMeta(type),
      ]);
      setFolders(folderList);
      setCourses(courseList);
      setMeta(nextMeta);
      setSelectedFolderId((current) => current || folderList[0]?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `加载${labels.title}失败`);
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async (nextPage = page, silent = false) => {
    if (!silent) setListLoading(true);
    try {
      const result = await adminContentService.getMediaItems({
        type,
        folderId: selectedFolderId,
        keyword: keyword.trim(),
        courseId: courseFilter !== "all" ? courseFilter : undefined,
        refFilter,
        scriptFilter,
        searchScope: selectedFolderId ? "current" : "all",
        sortMode: "uploaded-desc",
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setItems(result.items);
      setSelectedItemIds([]);
      setTotalItems(result.total);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `加载${labels.single}列表失败`);
    } finally {
      if (!silent) setListLoading(false);
    }
  };

  useEffect(() => {
    void loadBase();
  }, [type]);

  useEffect(() => {
    if (!loading) void loadItems(1);
  }, [loading, selectedFolderId, courseFilter, refFilter, scriptFilter]);

  const refreshAll = async () => {
    await Promise.all([loadBase(), loadItems(page, true)]);
  };

  const saveFolder = async () => {
    if (!folderName.trim()) {
      toast.error("请输入文件夹名称");
      return;
    }
    try {
      if (editingFolder) {
        await adminContentService.updateMediaFolder(type, editingFolder.id, folderName.trim());
        toast.success("文件夹已更新");
      } else {
        const created = await adminContentService.createMediaFolder(type, folderName.trim());
        setSelectedFolderId(created.id);
        toast.success("文件夹已创建");
      }
      setShowFolderDialog(false);
      setEditingFolder(null);
      setFolderName("");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存文件夹失败");
    }
  };

  const deleteFolder = async (folder: AdminMediaFolder) => {
    if (getFolderCount(type, folder) > 0) {
      toast.error("非空文件夹不能删除");
      return;
    }
    if (!window.confirm(`确定删除文件夹“${folder.name}”吗？`)) return;
    try {
      await adminContentService.deleteMediaFolder(type, folder.id);
      toast.success("文件夹已删除");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除文件夹失败");
    }
  };

  const openEditItem = (item: AdminMediaItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemFolderId(item.folderId);
    setScriptText(item.script ?? "");
    setHandoutUrl(item.handoutUrl ?? "");
    setHandoutName(item.handoutName ?? "");
    setHandoutObjectKey(item.handoutObjectKey ?? "");
    setHandoutFile(null);
    setShowEditDialog(true);
  };

  const saveItem = async () => {
    if (!editingItem || !itemName.trim() || !itemFolderId) {
      toast.error("素材名称和文件夹不能为空");
      return;
    }

    setSavingItem(true);
    try {
      let nextHandoutUrl = handoutUrl;
      let nextHandoutName = handoutName;
      let nextHandoutObjectKey = handoutObjectKey;
      if (handoutFile) {
        const uploaded = await adminContentService.uploadMediaHandout(type, handoutFile);
        nextHandoutUrl = uploaded.handoutUrl;
        nextHandoutName = uploaded.handoutName;
        nextHandoutObjectKey = uploaded.handoutObjectKey;
      }

      await adminContentService.updateMediaItem(type, editingItem.id, {
        name: itemName.trim(),
        folderId: itemFolderId,
        script: scriptText,
        handoutUrl: nextHandoutUrl,
        handoutName: nextHandoutName,
        handoutObjectKey: nextHandoutObjectKey,
      });
      toast.success(`${labels.single}已更新`);
      setShowEditDialog(false);
      setHandoutFile(null);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `保存${labels.single}失败`);
    } finally {
      setSavingItem(false);
    }
  };

  const deleteItem = async (item: AdminMediaItem) => {
    if (item.courseRefs.length > 0) {
      toast.error(`该${labels.single}已被课程引用，不能直接删除`);
      return;
    }
    if (!window.confirm(`确定删除${labels.single}“${item.name}”吗？`)) return;
    try {
      await adminContentService.deleteMediaItem(type, item.id);
      toast.success(`${labels.single}已删除`);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `删除${labels.single}失败`);
    }
  };

  const reprocessVideoItem = async (item: AdminMediaItem) => {
    if (type !== "video") return;
    if (item.objectKey?.endsWith("/index.m3u8")) {
      toast.info("该视频已经是 HLS 分片格式");
      return;
    }
    if (item.processStatus === "pending" || item.processStatus === "processing") {
      toast.info("该视频正在处理中");
      return;
    }
    if (!window.confirm(`确定将“${item.name}”重新处理为 HLS 分片吗？处理期间学生端暂时不能播放该视频。`)) return;

    setReprocessingItemId(item.id);
    try {
      await adminContentService.reprocessMediaItem(type, item.id);
      toast.success("已加入 HLS 重新处理队列");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "视频重新处理失败");
    } finally {
      setReprocessingItemId("");
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  };

  const toggleVisibleSelection = () => {
    if (items.length === 0) return;
    setSelectedItemIds(allVisibleSelected ? [] : items.map((item) => item.id));
  };

  const openBatchMoveDialog = () => {
    if (selectedItems.length === 0) {
      toast.error(`请先选择要移动的${labels.single}`);
      return;
    }
    if (folders.length === 0) {
      toast.error("请先创建文件夹");
      return;
    }
    setBatchTargetFolderId(selectedFolderId || folders[0]?.id || "");
    setShowBatchMoveDialog(true);
  };

  const batchMoveItems = async () => {
    if (selectedItems.length === 0 || !batchTargetFolderId) return;
    if (selectedItems.every((item) => item.folderId === batchTargetFolderId)) {
      toast.info(`选中的${labels.single}已经在该文件夹中`);
      return;
    }
    setBatchActionLoading(true);
    try {
      const result = await adminContentService.batchMoveMediaItems(type, selectedItems.map((item) => item.id), batchTargetFolderId);
      toast.success(`已移动 ${result.updatedCount} 个${labels.single}`);
      setShowBatchMoveDialog(false);
      setSelectedItemIds([]);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `批量移动${labels.single}失败`);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const batchDeleteItems = async () => {
    if (selectedReferencedCount > 0) {
      toast.error(`选中的${labels.single}里有 ${selectedReferencedCount} 个已被课程引用，不能批量删除`);
      return;
    }
    if (selectedItems.length === 0) return;
    if (!window.confirm(`确认删除选中的 ${selectedItems.length} 个${labels.single}？删除后无法恢复。`)) return;

    setBatchActionLoading(true);
    try {
      const result = await adminContentService.batchDeleteMediaItems(type, selectedItems.map((item) => item.id));
      toast.success(`已删除 ${result.deletedCount} 个${labels.single}`);
      setSelectedItemIds([]);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `批量删除${labels.single}失败`);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const openUploadDialog = () => {
    if (folders.length === 0) {
      toast.error("请先创建文件夹");
      return;
    }
    setUploadFolderId(selectedFolderId || folders[0]?.id || "");
    setUploadFiles([]);
    setUploadScript("");
    setShowUploadDialog(true);
  };

  const uploadMediaItems = async () => {
    if (!uploadFolderId) {
      toast.error("请选择目标文件夹");
      return;
    }
    if (uploadFiles.length === 0) {
      toast.error(`请选择要上传的${labels.single}文件`);
      return;
    }

    const oversizedFiles = uploadFiles.filter((file) => file.size > MAX_MEDIA_UPLOAD_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast.error(`单个文件不能超过 2GB，请拆分或压缩：${oversizedFiles[0].name}`);
      return;
    }

    const targetFolderId = uploadFolderId;
    const filesToUpload = [...uploadFiles];
    const scriptToUpload = uploadScript;
    setUploadingMedia(true);
    setShowUploadDialog(false);
    setUploadFiles([]);
    setUploadScript("");
    setSelectedFolderId(targetFolderId);
    toast.info(`已开始上传 ${filesToUpload.length} 个${labels.single}，可继续操作页面`);

    try {
      let uploadedCount = 0;
      for (const [index, file] of filesToUpload.entries()) {
        const script = filesToUpload.length === 1 || index === 0 ? scriptToUpload : "";
        const uploaded = await adminContentService.uploadMediaItems(type, targetFolderId, [file], script);
        uploadedCount += uploaded.length;
      }
      toast.success(`已上传 ${uploadedCount} 个${labels.single}，后台处理中`);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `部分${labels.single}上传失败`);
      await refreshAll();
    } finally {
      setUploadingMedia(false);
    }
  };

  const clearHandout = () => {
    setHandoutFile(null);
    setHandoutName("");
    setHandoutUrl("");
    setHandoutObjectKey("");
  };

  if (loading) return <div className="py-10 text-slate-500">{labels.title}加载中...</div>;

  return (
    <>
      <div className="flex h-[calc(100vh-124px)] min-h-[620px] flex-col gap-6 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{labels.title}</h1>
            <p className="mt-2 text-sm text-slate-500">集中维护名称、文件夹、文稿、讲义、引用课程和处理状态。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={uploadingMedia} onClick={openUploadDialog}>
              <UploadCloud className="mr-2 size-4" />
              {uploadingMedia ? "上传中..." : `上传${labels.single}`}
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => {
                setEditingFolder(null);
                setFolderName("");
                setShowFolderDialog(true);
              }}
            >
              <FolderPlus className="mr-2 size-4" />
              新建文件夹
            </Button>
          </div>
        </div>

        <div className="grid shrink-0 gap-3 md:grid-cols-4">
          {[
            { label: `${labels.single}总数`, value: meta?.totalCount ?? 0, icon: TitleIcon },
            { label: "已引用", value: meta?.referencedCount ?? 0, icon: CheckCircle2 },
            { label: "缺文稿", value: meta?.pendingScriptCount ?? 0, icon: FileText },
            { label: "处理中", value: meta?.processingCount ?? 0, icon: Loader2 },
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

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex shrink-0 items-center justify-between px-2">
              <p className="text-sm font-semibold text-slate-900">{labels.folder}</p>
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{folders.length}</Badge>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              <button
                type="button"
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selectedFolderId === "" ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}
                onClick={() => setSelectedFolderId("")}
              >
                全部文件夹
                <span>{meta?.totalCount ?? 0}</span>
              </button>
              {folders.map((folder) => (
                <div key={folder.id} className={`group flex items-center rounded-md ${selectedFolderId === folder.id ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}>
                  <button type="button" className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm" onClick={() => setSelectedFolderId(folder.id)}>
                    {folder.name}
                  </button>
                  <span className="px-2 text-xs">{getFolderCount(type, folder)}</span>
                  <button
                    type="button"
                    className="hidden px-2 text-slate-400 group-hover:block"
                    onClick={() => {
                      setEditingFolder(folder);
                      setFolderName(folder.name);
                      setShowFolderDialog(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" className="hidden px-2 text-rose-400 group-hover:block" onClick={() => void deleteFolder(folder)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="shrink-0 space-y-3 border-b border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="w-72 border-slate-200 bg-white pl-9"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loadItems(1);
                    }}
                    placeholder={`搜索${labels.single}名称`}
                  />
                </div>
                <Select value={courseFilter} onValueChange={setCourseFilter}>
                  <SelectTrigger className="w-52 border-slate-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="all">全部课程引用</SelectItem>
                    {filteredCourses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={refFilter} onValueChange={(value) => setRefFilter(value as RefFilter)}>
                  <SelectTrigger className="w-36 border-slate-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="all">全部引用</SelectItem>
                    <SelectItem value="referenced">已引用</SelectItem>
                    <SelectItem value="unreferenced">未引用</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={scriptFilter} onValueChange={(value) => setScriptFilter(value as ScriptFilter)}>
                  <SelectTrigger className="w-36 border-slate-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="all">全部文稿</SelectItem>
                    <SelectItem value="scripted">有文稿</SelectItem>
                    <SelectItem value="unscripted">缺文稿</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => void loadItems(1)}>
                  查询
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                当前：{selectedFolder?.name ?? "全部文件夹"} · 共 {totalItems} 条{listLoading ? " · 刷新中..." : ""}
              </p>
              {selectedItemIds.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                  <div className="text-sm text-blue-800">
                    已选择 <span className="font-semibold">{selectedItemIds.length}</span> 个{labels.single}
                    {selectedReferencedCount > 0 ? <span className="ml-2 text-blue-600">其中 {selectedReferencedCount} 个已被课程引用，需取消选择后才能批量删除</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50" onClick={openBatchMoveDialog} disabled={batchActionLoading || listLoading}>
                      批量移动
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                      onClick={() => void batchDeleteItems()}
                      disabled={batchActionLoading || listLoading || selectedItemIds.length === 0 || selectedReferencedCount > 0}
                    >
                      批量删除
                    </Button>
                    <Button variant="ghost" size="sm" className="text-slate-600 hover:bg-white/70" onClick={() => setSelectedItemIds([])} disabled={batchActionLoading || listLoading}>
                      取消选择
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleVisibleSelection}
                        aria-label={`选择当前页${labels.single}`}
                      />
                    </th>
                    <th className="px-4 py-3">{labels.single}</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3">文件夹</th>
                    <th className="px-4 py-3">文稿/讲义</th>
                    <th className="px-4 py-3">引用课程</th>
                    <th className="px-4 py-3">上传时间</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 align-top">
                        <Checkbox
                          checked={selectedItemSet.has(item.id)}
                          onCheckedChange={() => toggleItemSelection(item.id)}
                          aria-label={`选择${item.name}`}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <p className="max-w-sm truncate font-medium text-slate-900">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-500">时长 {formatDuration(item.duration)} · {item.mimeType || "未知格式"}</p>
                        {type === "video" ? (
                          <p className="mt-1 text-xs text-slate-500">{item.objectKey?.endsWith("/index.m3u8") ? "播放格式：HLS 分片" : "播放格式：单文件视频"}</p>
                        ) : null}
                        <p className="mt-1 max-w-sm truncate text-xs text-slate-400">{item.objectKey || item.objectUrl || "无文件标识"}</p>
                      </td>
                      <td className="px-4 py-4">
                        {getProcessBadge(item, type)}
                        {item.processMessage ? <p className="mt-1 max-w-[180px] truncate text-xs text-slate-400">{item.processMessage}</p> : null}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{item.folderName || "-"}</td>
                      <td className="px-4 py-4 text-slate-600">
                        <p>{item.hasScript ? "有文稿" : "缺文稿"}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.hasHandout ? item.handoutName || "有讲义" : "无讲义"}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-[360px] flex-wrap gap-1">
                          {item.courseRefs.map((ref) => (
                            <Badge key={`${ref.courseId}-${ref.tagId}`} variant="outline" className="max-w-full border-slate-200 bg-slate-50 text-slate-600">
                              <span className="truncate">{ref.courseName} / {ref.tagName}</span>
                            </Badge>
                          ))}
                          {item.courseRefs.length === 0 ? <span className="text-xs text-slate-400">未引用</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">{item.uploadedAt || "-"}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {type === "video" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                              disabled={reprocessingItemId === item.id || item.objectKey?.endsWith("/index.m3u8") || item.processStatus === "pending" || item.processStatus === "processing"}
                              onClick={() => void reprocessVideoItem(item)}
                            >
                              {reprocessingItemId === item.id ? "入队中" : "重转 HLS"}
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" className="border-slate-200 bg-white" onClick={() => openEditItem(item)}>
                            编辑
                          </Button>
                          <Button variant="outline" size="sm" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => void deleteItem(item)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-500">
                        暂无符合条件的{labels.single}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-slate-200 p-4">
              <p className="text-sm text-slate-500">第 {page} / {totalPages} 页</p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1 || listLoading} onClick={() => {
                  const next = Math.max(1, page - 1);
                  void loadItems(next);
                }}>
                  上一页
                </Button>
                <Button variant="outline" disabled={page >= totalPages || listLoading} onClick={() => {
                  const next = Math.min(totalPages, page + 1);
                  void loadItems(next);
                }}>
                  下一页
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent className="border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "编辑文件夹" : "新建文件夹"}</DialogTitle>
            <DialogDescription>{labels.folder}用于整理后台素材，不影响用户端课程展示。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>文件夹名称</Label>
            <Input value={folderName} onChange={(event) => setFolderName(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFolderDialog(false)}>取消</Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => void saveFolder()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showBatchMoveDialog}
        onOpenChange={(open) => {
          if (batchActionLoading) return;
          setShowBatchMoveDialog(open);
        }}
      >
        <DialogContent className="border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>批量移动{labels.single}</DialogTitle>
            <DialogDescription>将已选择的 {selectedItemIds.length} 个{labels.single}移动到指定文件夹。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p>已选择：{selectedItemIds.length} 个</p>
              {selectedReferencedCount > 0 ? <p className="mt-1">其中 {selectedReferencedCount} 个已被课程引用，移动文件夹不会影响课程播放。</p> : null}
            </div>
            <div className="space-y-2">
              <Label>目标文件夹</Label>
              <Select value={batchTargetFolderId} onValueChange={setBatchTargetFolderId}>
                <SelectTrigger className="border-slate-200 bg-white">
                  <SelectValue placeholder="选择目标文件夹" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name} · {getFolderCount(type, folder)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchMoveDialog(false)} disabled={batchActionLoading}>
              取消
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => void batchMoveItems()}
              disabled={batchActionLoading || !batchTargetFolderId || selectedItems.every((item) => item.folderId === batchTargetFolderId)}
            >
              {batchActionLoading ? "移动中..." : "确认移动"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showUploadDialog}
        onOpenChange={(open) => {
          if (uploadingMedia) return;
          setShowUploadDialog(open);
        }}
      >
        <DialogContent className="flex h-[calc(100vh-48px)] w-[calc(100vw-32px)] max-w-[1120px] flex-col overflow-hidden border border-slate-200 bg-white p-0 text-slate-900 sm:max-w-[1120px]">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>上传{labels.single}到{labels.title}</DialogTitle>
            <DialogDescription>
              {type === "video"
                ? "视频会逐个上传并进入后台解码/转码队列，处理完成后可在课程中引用。单个文件最大 2GB。"
                : "音频会逐个上传并进入后台解码/转码队列，处理完成后可在课程中引用。单个文件最大 2GB。"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>目标文件夹</Label>
                  <Select value={uploadFolderId} onValueChange={setUploadFolderId}>
                    <SelectTrigger className="border-slate-200 bg-white">
                      <SelectValue placeholder="请选择目标文件夹" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {folders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.name} ({getFolderCount(type, folder)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50/60 px-5 py-8 text-center hover:bg-blue-50">
                  <UploadCloud className="mb-4 size-10 text-blue-600" />
                  <span className="text-base font-semibold text-blue-700">选择本地{labels.single}文件</span>
                  <span className="mt-2 text-sm text-slate-500">
                    {type === "video" ? "支持 MP4、MOV、M4V、WEBM、AVI、MKV，可多选" : "支持 MP3、WAV、M4A、AAC、OGG、FLAC，可多选"}
                  </span>
                  <Input
                    type="file"
                    accept={uploadAccept}
                    multiple
                    className="hidden"
                    onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
                  />
                </label>

                <div className="space-y-2">
                  <Label>文稿（可选）</Label>
                  <Textarea
                    rows={8}
                    value={uploadScript}
                    onChange={(event) => setUploadScript(event.target.value)}
                    placeholder={`如果只上传一个${labels.single}，这里会作为该素材的文稿；多选时只写入第一个素材。`}
                  />
                </div>
              </div>
            </div>

            <aside className="min-h-0 overflow-y-auto border-t border-slate-200 bg-slate-50 px-6 py-5 lg:border-l lg:border-t-0">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">待上传文件</h3>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{uploadFiles.length}</Badge>
                </div>
                <div className="mt-4 space-y-2">
                  {uploadFiles.length > 0 ? (
                    uploadFiles.map((file, index) => (
                      <div key={`${file.name}-${file.size}-${index}`} className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                          {type === "video" ? <Video className="size-4" /> : <Volume2 className="size-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatFileSize(file.size) || "未知大小"}</p>
                        </div>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-rose-600"
                          onClick={() => setUploadFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
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
                {type === "video"
                  ? "点击开始上传后弹窗会关闭，文件会按顺序上传。长视频处理时间会更久，处理期间请在列表中查看状态。"
                  : "点击开始上传后弹窗会关闭，文件会按顺序上传。处理完成前不能添加到课程。"}
              </div>
            </aside>
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setShowUploadDialog(false)} disabled={uploadingMedia}>取消</Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => void uploadMediaItems()} disabled={uploadingMedia || uploadFiles.length === 0 || !uploadFolderId}>
              {uploadingMedia ? "上传中..." : `开始上传 ${uploadFiles.length || ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) setHandoutFile(null);
        }}
      >
        <DialogContent className="flex h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[1320px] flex-col overflow-hidden border border-slate-200 bg-white p-0 text-slate-900 sm:max-w-[1320px]">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>编辑{labels.single}</DialogTitle>
            <DialogDescription>维护名称、文件夹、文稿和讲义。本地讲义文件会在保存时上传。</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{labels.single}名称</Label>
                  <Input value={itemName} onChange={(event) => setItemName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>所属文件夹</Label>
                  <Select value={itemFolderId} onValueChange={setItemFolderId}>
                    <SelectTrigger className="border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {folders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>文稿</Label>
                  <Textarea rows={22} value={scriptText} onChange={(event) => setScriptText(event.target.value)} placeholder={`粘贴或维护当前${labels.single}的文稿内容`} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>讲义 URL</Label>
                  <Input value={handoutUrl} onChange={(event) => setHandoutUrl(event.target.value)} placeholder="上传本地讲义后自动生成，可手动保留旧链接" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>讲义 ObjectKey</Label>
                  <Input value={handoutObjectKey} onChange={(event) => setHandoutObjectKey(event.target.value)} placeholder="OSS 文件标识，上传本地讲义后自动生成" />
                </div>
              </div>
            </div>

            <aside className="min-h-0 overflow-y-auto border-t border-slate-200 bg-slate-50 px-6 py-5 xl:border-l xl:border-t-0">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <UploadCloud className="size-5 text-blue-600" />
                    <h3 className="text-base font-semibold text-slate-900">讲义文件</h3>
                  </div>
                  {handoutUrl || handoutObjectKey || handoutFile || handoutName ? (
                    <Button type="button" variant="outline" size="sm" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={clearHandout}>
                      清除讲义
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">选择本地文件后，点击保存会自动上传并写入当前{labels.single}；再次选择文件就是替换讲义。</p>
                <label className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50/60 px-4 py-6 text-center hover:bg-blue-50">
                  <UploadCloud className="mb-3 size-8 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700">{handoutUrl || handoutObjectKey || handoutFile ? "替换本地讲义文件" : "选择本地讲义文件"}</span>
                  <span className="mt-1 text-xs text-slate-500">PDF、Word、PPT、Excel、压缩包等资料文件</span>
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.rar"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setHandoutFile(file);
                      if (file) setHandoutName(file.name);
                    }}
                  />
                </label>
                {handoutFile ? (
                  <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                    待上传：{handoutFile.name}{formatFileSize(handoutFile.size) ? ` · ${formatFileSize(handoutFile.size)}` : ""}
                    <button type="button" className="ml-2 text-blue-500 hover:text-blue-700" onClick={() => setHandoutFile(null)}>
                      <X className="inline size-3.5" />
                    </button>
                  </div>
                ) : null}
                <div className="mt-5 space-y-2">
                  <Label>讲义名称</Label>
                  <Input value={handoutName} onChange={(event) => setHandoutName(event.target.value)} placeholder="上传文件后会自动填入" />
                </div>
                {handoutUrl || handoutObjectKey ? (
                  <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-700">当前已配置讲义</p>
                      <Badge variant="outline" className="border-emerald-100 bg-emerald-50 text-emerald-700">已关联</Badge>
                    </div>
                    <p className="mt-2 break-all">{handoutName || "未命名讲义"}</p>
                    <p className="mt-2 break-all">{handoutObjectKey || handoutUrl}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">引用课程</h3>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {editingItem?.courseRefs.length ?? 0}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {editingItem?.courseRefs.length ? (
                    editingItem.courseRefs.map((ref) => (
                      <div key={`${ref.courseId}-${ref.tagId}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="truncate text-sm font-medium text-slate-800">{ref.courseName}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{ref.tagName}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">
                      未被课程引用
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={savingItem}>取消</Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => void saveItem()} disabled={savingItem}>
              {savingItem ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
