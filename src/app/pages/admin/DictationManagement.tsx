import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Download, FileText, FolderPlus, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import type { AdminPagedResult } from "../../services/adminContentService";
import {
  adminDictationService,
  type AdminDictationChapter,
  type AdminDictationChapterPayload,
  type AdminDictationItem,
  type AdminDictationItemPayload,
  type AdminDictationItemStatus,
  type AdminDictationSubject,
  type AdminDictationSubjectPayload,
} from "../../services/adminDictationService";

type SubjectForm = AdminDictationSubjectPayload & { id: string };
type ChapterForm = AdminDictationChapterPayload & { id: string };
type ItemForm = AdminDictationItemPayload & { id: string };

const emptyPage: AdminPagedResult<AdminDictationItem> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const emptySubjectForm: SubjectForm = {
  id: "",
  code: "",
  name: "",
  color: "#c9973e",
  sortOrder: 0,
  isActive: true,
  description: "",
};

const emptyChapterForm: ChapterForm = {
  id: "",
  subjectId: "",
  title: "",
  description: "",
  sortOrder: 0,
  isActive: true,
};

const emptyItemForm: ItemForm = {
  id: "",
  chapterId: "",
  title: "",
  content: "",
  source: "",
  explanation: "",
  status: "published",
  sortOrder: 0,
};

const statusMeta: Record<AdminDictationItemStatus, { label: string; className: string }> = {
  published: { label: "已发布", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  draft: { label: "草稿", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const countBlanks = (content = "") => (content.match(/\{\{[\s\S]+?\}\}/g) ?? []).length;
const renderPreview = (content = "") => content.replace(/\{\{([\s\S]+?)\}\}/g, "【____】");
const escapeCsvCell = (value = "") => `"${`${value}`.replace(/"/g, '""')}"`;
const downloadDictationCsvTemplate = () => {
  const rows = [
    ["标题", "原文", "挖空", "挖空1", "挖空2", "挖空3", "来源", "状态", "排序"],
    ["国际法基本原则", "国际法基本原则具有强行法性质，但并不是所有强行法规则都是国际法基本原则。", "强行法", "", "", "", "三国背诵版", "已发布", "1"],
    ["法律行为", "法律行为以意思表示为核心，意思表示包括效果意思和表示行为。", "意思表示、效果意思、表示行为", "", "", "", "民法背诵版", "草稿", "2"],
  ];
  const csv = `\ufeff${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "默写本批量导入模板.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const toSubjectForm = (subject: AdminDictationSubject): SubjectForm => ({
  id: subject.id,
  code: subject.code,
  name: subject.name,
  color: subject.color,
  sortOrder: subject.sortOrder,
  isActive: subject.isActive,
  description: subject.description,
});

const toChapterForm = (chapter: AdminDictationChapter): ChapterForm => ({
  id: chapter.id,
  subjectId: chapter.subjectId,
  title: chapter.title,
  description: chapter.description,
  sortOrder: chapter.sortOrder,
  isActive: chapter.isActive,
});

const toItemForm = (item: AdminDictationItem): ItemForm => ({
  id: item.id,
  chapterId: item.chapterId,
  title: item.title,
  content: item.content,
  source: item.source,
  explanation: item.explanation,
  status: item.status,
  sortOrder: item.sortOrder,
});

export function DictationManagement() {
  const [subjects, setSubjects] = useState<AdminDictationSubject[]>([]);
  const [chapters, setChapters] = useState<AdminDictationChapter[]>([]);
  const [items, setItems] = useState<AdminPagedResult<AdminDictationItem>>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [activeSubjectId, setActiveSubjectId] = useState("all");
  const [activeChapterId, setActiveChapterId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminDictationItemStatus | "all">("all");
  const [page, setPage] = useState(1);

  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [chapterDialogOpen, setChapterDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [subjectForm, setSubjectForm] = useState<SubjectForm>(emptySubjectForm);
  const [chapterForm, setChapterForm] = useState<ChapterForm>(emptyChapterForm);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [batchText, setBatchText] = useState("");
  const [batchSource, setBatchSource] = useState("");
  const [batchStatus, setBatchStatus] = useState<AdminDictationItemStatus>("published");
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const activeSubject = useMemo(() => subjects.find((subject) => subject.id === activeSubjectId) ?? null, [subjects, activeSubjectId]);
  const visibleChapters = useMemo(
    () => chapters.filter((chapter) => activeSubjectId === "all" || chapter.subjectId === activeSubjectId),
    [chapters, activeSubjectId],
  );
  const activeChapter = useMemo(() => chapters.find((chapter) => chapter.id === activeChapterId) ?? null, [chapters, activeChapterId]);

  const loadSubjects = async () => {
    const payload = await adminDictationService.getSubjects();
    setSubjects(payload);
    if (activeSubjectId !== "all" && !payload.some((subject) => subject.id === activeSubjectId)) {
      setActiveSubjectId("all");
      setActiveChapterId("all");
    }
  };

  const loadChapters = async (subjectId = activeSubjectId) => {
    const payload = await adminDictationService.getChapters({ subjectId });
    setChapters(payload);
    if (activeChapterId !== "all" && !payload.some((chapter) => chapter.id === activeChapterId)) {
      setActiveChapterId("all");
    }
  };

  const loadItems = async (nextPage = page) => {
    const payload = await adminDictationService.getItems({
      subjectId: activeSubjectId,
      chapterId: activeChapterId,
      keyword: keyword.trim(),
      status: statusFilter,
      page: nextPage,
      pageSize: 20,
    });
    setItems(payload);
    setPage(payload.page);
  };

  const boot = async () => {
    setLoading(true);
    try {
      const [nextSubjects, nextChapters, nextItems] = await Promise.all([
        adminDictationService.getSubjects(),
        adminDictationService.getChapters({}),
        adminDictationService.getItems({ page: 1, pageSize: 20, status: "all" }),
      ]);
      setSubjects(nextSubjects);
      setChapters(nextChapters);
      setItems(nextItems);
      setPage(nextItems.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "默写本管理加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    if (loading) return;
    setPage(1);
    void loadChapters(activeSubjectId);
    void loadItems(1);
  }, [activeSubjectId, activeChapterId, statusFilter]);

  const refreshAll = async () => {
    await Promise.all([loadSubjects(), loadChapters(activeSubjectId), loadItems(page)]);
  };

  const openCreateSubject = () => {
    setSubjectForm({ ...emptySubjectForm, sortOrder: subjects.length * 10 + 10 });
    setSubjectDialogOpen(true);
  };

  const openEditSubject = (subject: AdminDictationSubject) => {
    setSubjectForm(toSubjectForm(subject));
    setSubjectDialogOpen(true);
  };

  const openCreateChapter = () => {
    setChapterForm({
      ...emptyChapterForm,
      subjectId: activeSubjectId !== "all" ? activeSubjectId : subjects[0]?.id ?? "",
      sortOrder: visibleChapters.length * 10 + 10,
    });
    setChapterDialogOpen(true);
  };

  const openEditChapter = (chapter: AdminDictationChapter) => {
    setChapterForm(toChapterForm(chapter));
    setChapterDialogOpen(true);
  };

  const openCreateItem = () => {
    setItemForm({
      ...emptyItemForm,
      chapterId: activeChapterId !== "all" ? activeChapterId : visibleChapters[0]?.id ?? chapters[0]?.id ?? "",
      sortOrder: items.total + 1,
    });
    setItemDialogOpen(true);
  };

  const openEditItem = (item: AdminDictationItem) => {
    setItemForm(toItemForm(item));
    setItemDialogOpen(true);
  };

  const saveSubject = async () => {
    if (!subjectForm.name.trim()) {
      toast.error("请输入科目名称");
      return;
    }
    setSaving(true);
    try {
      const payload: AdminDictationSubjectPayload = {
        code: subjectForm.code?.trim(),
        name: subjectForm.name.trim(),
        color: subjectForm.color || "#c9973e",
        sortOrder: Number(subjectForm.sortOrder) || 0,
        isActive: subjectForm.isActive !== false,
        description: subjectForm.description?.trim() || "",
      };
      const subject = subjectForm.id
        ? await adminDictationService.updateSubject(subjectForm.id, payload)
        : await adminDictationService.createSubject(payload);
      setActiveSubjectId(subject.id);
      setSubjectDialogOpen(false);
      await refreshAll();
      toast.success(subjectForm.id ? "科目已更新" : "科目已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存科目失败");
    } finally {
      setSaving(false);
    }
  };

  const saveChapter = async () => {
    if (!chapterForm.subjectId) {
      toast.error("请选择科目");
      return;
    }
    if (!chapterForm.title.trim()) {
      toast.error("请输入章节名称");
      return;
    }
    setSaving(true);
    try {
      const payload: AdminDictationChapterPayload = {
        subjectId: chapterForm.subjectId,
        title: chapterForm.title.trim(),
        description: chapterForm.description?.trim() || "",
        sortOrder: Number(chapterForm.sortOrder) || 0,
        isActive: chapterForm.isActive !== false,
      };
      const chapter = chapterForm.id
        ? await adminDictationService.updateChapter(chapterForm.id, payload)
        : await adminDictationService.createChapter(payload);
      setActiveSubjectId(chapter.subjectId);
      setActiveChapterId(chapter.id);
      setChapterDialogOpen(false);
      await refreshAll();
      toast.success(chapterForm.id ? "章节已更新" : "章节已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存章节失败");
    } finally {
      setSaving(false);
    }
  };

  const saveItem = async () => {
    if (!itemForm.chapterId) {
      toast.error("请选择章节");
      return;
    }
    if (!itemForm.content.trim()) {
      toast.error("请输入默写内容");
      return;
    }
    if (countBlanks(itemForm.content) === 0) {
      toast.error("请用 {{答案}} 标记至少一个挖空");
      return;
    }
    setSaving(true);
    try {
      const payload: AdminDictationItemPayload = {
        chapterId: itemForm.chapterId,
        title: itemForm.title.trim(),
        content: itemForm.content.trim(),
        source: itemForm.source?.trim() || "",
        explanation: itemForm.explanation?.trim() || "",
        status: itemForm.status,
        sortOrder: Number(itemForm.sortOrder) || 0,
      };
      const item = itemForm.id
        ? await adminDictationService.updateItem(itemForm.id, payload)
        : await adminDictationService.createItem(payload);
      setActiveSubjectId(item.subjectId || activeSubjectId);
      setActiveChapterId(item.chapterId);
      setItemDialogOpen(false);
      await refreshAll();
      toast.success(itemForm.id ? "默写题已更新" : "默写题已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存默写题失败");
    } finally {
      setSaving(false);
    }
  };

  const importBatch = async () => {
    const targetChapterId = activeChapterId !== "all" ? activeChapterId : visibleChapters[0]?.id ?? "";
    if (!targetChapterId) {
      toast.error("请先选择一个章节");
      return;
    }
    if (!batchText.trim() && !batchFile) {
      toast.error("请粘贴导入内容或选择文件");
      return;
    }
    setSaving(true);
    try {
      const result = await adminDictationService.importItems({
        chapterId: targetChapterId,
        text: batchText,
        file: batchFile,
        source: batchSource,
        status: batchStatus,
      });
      setBatchDialogOpen(false);
      setBatchText("");
      setBatchSource("");
      setBatchFile(null);
      setActiveChapterId(targetChapterId);
      await refreshAll();
      toast.success(`已导入 ${result.createdCount} 道默写题`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量导入失败");
    } finally {
      setSaving(false);
    }
  };

  const disableSubject = async (subject: AdminDictationSubject) => {
    if (!window.confirm(`确定停用科目“${subject.name}”吗？停用后前台不再展示。`)) return;
    try {
      await adminDictationService.deleteSubject(subject.id);
      if (activeSubjectId === subject.id) {
        setActiveSubjectId("all");
        setActiveChapterId("all");
      }
      await refreshAll();
      toast.success("科目已停用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "停用科目失败");
    }
  };

  const disableChapter = async (chapter: AdminDictationChapter) => {
    if (!window.confirm(`确定停用章节“${chapter.title}”吗？停用后前台不再展示。`)) return;
    try {
      await adminDictationService.deleteChapter(chapter.id);
      if (activeChapterId === chapter.id) setActiveChapterId("all");
      await refreshAll();
      toast.success("章节已停用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "停用章节失败");
    }
  };

  const deleteItem = async (item: AdminDictationItem) => {
    if (!window.confirm(`确定删除默写题“${item.title}”吗？`)) return;
    try {
      await adminDictationService.deleteItem(item.id);
      await refreshAll();
      toast.success("默写题已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除默写题失败");
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <Loader2 className="mr-2 inline size-4 animate-spin" />
        正在加载默写本管理...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500">科目数量</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{subjects.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500">章节数量</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{chapters.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500">当前筛选题目</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{items.total}</div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-950">科目 / 章节</div>
              <div className="mt-1 text-xs text-slate-500">用户先选科目，再选章节练习</div>
            </div>
            <Button size="sm" variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={openCreateSubject}>
              <Plus className="size-4" />
              科目
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => {
                setActiveSubjectId("all");
                setActiveChapterId("all");
              }}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-bold transition ${
                activeSubjectId === "all" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              全部科目
            </button>
            {subjects.map((subject) => (
              <div key={subject.id} className="rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubjectId(subject.id);
                    setActiveChapterId("all");
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-t-lg px-3 py-2 text-left transition ${
                    activeSubjectId === subject.id ? "bg-slate-950 text-white" : "bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: subject.color }} />
                    <span className="truncate text-sm font-black">{subject.name}</span>
                  </span>
                  <span className="text-xs opacity-70">{subject.itemCount}题</span>
                </button>
                {activeSubjectId === subject.id ? (
                  <div className="space-y-1 border-t border-slate-100 bg-slate-50/70 p-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 flex-1 border-slate-200 bg-white text-xs text-slate-700" onClick={() => openEditSubject(subject)}>
                        <Pencil className="size-3.5" />
                        编辑科目
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 border-slate-200 bg-white text-xs text-slate-700" onClick={openCreateChapter}>
                        <FolderPlus className="size-3.5" />
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveChapterId("all")}
                      className={`w-full rounded-md px-3 py-2 text-left text-xs font-bold ${
                        activeChapterId === "all" ? "bg-amber-100 text-amber-800" : "text-slate-600 hover:bg-white"
                      }`}
                    >
                      全部章节
                    </button>
                    {visibleChapters.map((chapter) => (
                      <div key={chapter.id} className={`rounded-md ${activeChapterId === chapter.id ? "bg-white shadow-sm" : ""}`}>
                        <button
                          type="button"
                          onClick={() => setActiveChapterId(chapter.id)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
                        >
                          <span className="min-w-0 truncate font-bold text-slate-700">{chapter.title}</span>
                          <span className="shrink-0 text-slate-400">{chapter.itemCount}</span>
                        </button>
                        {activeChapterId === chapter.id ? (
                          <div className="flex gap-2 px-3 pb-2">
                            <button type="button" className="text-[11px] font-bold text-blue-600" onClick={() => openEditChapter(chapter)}>
                              编辑
                            </button>
                            <button type="button" className="text-[11px] font-bold text-rose-600" onClick={() => void disableChapter(chapter)}>
                              停用
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                <BookOpenCheck className="size-4 text-amber-600" />
                默写题列表
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {activeChapter ? activeChapter.title : activeSubject ? `${activeSubject.name} · 全部章节` : "全部科目 · 全部章节"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void refreshAll()}>
                <RefreshCw className="size-4" />
                刷新
              </Button>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setBatchDialogOpen(true)}>
                <Upload className="size-4" />
                批量导入
              </Button>
              <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={openCreateItem}>
                <Plus className="size-4" />
                添加默写题
              </Button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_180px_110px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="border-slate-200 bg-white pl-9 text-slate-900"
                placeholder="搜索标题、内容、来源"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadItems(1);
                }}
              />
            </div>
            <Select value={statusFilter} onValueChange={(value: AdminDictationItemStatus | "all") => setStatusFilter(value)}>
              <SelectTrigger className="border-slate-200 bg-white text-slate-900">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="published">已发布</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void loadItems(1)}>
              查询
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>题目</TableHead>
                <TableHead>章节</TableHead>
                <TableHead>挖空</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>排序</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-slate-400">
                    暂无默写题，先添加题目或批量导入。
                  </TableCell>
                </TableRow>
              ) : (
                items.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[520px] whitespace-normal">
                      <div className="font-bold text-slate-950">{item.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{renderPreview(item.content)}</div>
                      {item.source ? <div className="mt-1 text-xs text-slate-400">来源：{item.source}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {item.subjectName ? `${item.subjectName} / ` : ""}
                      {item.chapterTitle}
                    </TableCell>
                    <TableCell>{item.blankCount}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusMeta[item.status].className}>
                        {statusMeta[item.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.sortOrder}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => openEditItem(item)}>
                          <Pencil className="size-4" />
                          编辑
                        </Button>
                        <Button size="sm" variant="outline" className="border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100" onClick={() => void deleteItem(item)}>
                          <Trash2 className="size-4" />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm text-slate-500">
            <span>
              共 {items.total} 条，第 {items.page}/{items.totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700" disabled={items.page <= 1} onClick={() => void loadItems(items.page - 1)}>
                上一页
              </Button>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700" disabled={items.page >= items.totalPages} onClick={() => void loadItems(items.page + 1)}>
                下一页
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={subjectDialogOpen} onOpenChange={setSubjectDialogOpen}>
        <DialogContent className="max-w-xl bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>{subjectForm.id ? "编辑科目" : "新建科目"}</DialogTitle>
            <DialogDescription>默认八科可直接编辑名称、颜色、排序和启停状态。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>科目名称</Label>
              <Input className="border-slate-200 bg-white text-slate-900" value={subjectForm.name} onChange={(event) => setSubjectForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>编码</Label>
                <Input className="border-slate-200 bg-white text-slate-900" value={subjectForm.code ?? ""} onChange={(event) => setSubjectForm((current) => ({ ...current, code: event.target.value }))} placeholder="civil" />
              </div>
              <div className="grid gap-2">
                <Label>颜色</Label>
                <Input className="border-slate-200 bg-white text-slate-900" value={subjectForm.color} onChange={(event) => setSubjectForm((current) => ({ ...current, color: event.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>排序</Label>
                <Input type="number" className="border-slate-200 bg-white text-slate-900" value={subjectForm.sortOrder} onChange={(event) => setSubjectForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>说明</Label>
              <Textarea className="min-h-20 border-slate-200 bg-white text-slate-900" value={subjectForm.description ?? ""} onChange={(event) => setSubjectForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={subjectForm.isActive !== false} onChange={(event) => setSubjectForm((current) => ({ ...current, isActive: event.target.checked }))} />
              前台展示该科目
            </label>
          </div>
          <DialogFooter>
            {subjectForm.id ? (
              <Button variant="outline" className="mr-auto border-rose-100 bg-rose-50 text-rose-600" onClick={() => void disableSubject(subjects.find((subject) => subject.id === subjectForm.id)!)}>
                停用科目
              </Button>
            ) : null}
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setSubjectDialogOpen(false)}>取消</Button>
            <Button className="bg-slate-950 text-white" disabled={saving} onClick={() => void saveSubject()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={chapterDialogOpen} onOpenChange={setChapterDialogOpen}>
        <DialogContent className="max-w-xl bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>{chapterForm.id ? "编辑章节" : "新建章节"}</DialogTitle>
            <DialogDescription>章节归属于某一个科目，学员进入默写本后按章节练习。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>所属科目</Label>
              <Select value={chapterForm.subjectId} onValueChange={(value) => setChapterForm((current) => ({ ...current, subjectId: value }))}>
                <SelectTrigger className="border-slate-200 bg-white text-slate-900">
                  <SelectValue placeholder="选择科目" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>章节名称</Label>
              <Input className="border-slate-200 bg-white text-slate-900" value={chapterForm.title} onChange={(event) => setChapterForm((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>章节说明</Label>
              <Textarea className="min-h-20 border-slate-200 bg-white text-slate-900" value={chapterForm.description ?? ""} onChange={(event) => setChapterForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>排序</Label>
                <Input type="number" className="border-slate-200 bg-white text-slate-900" value={chapterForm.sortOrder} onChange={(event) => setChapterForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
              </div>
              <label className="mt-7 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={chapterForm.isActive !== false} onChange={(event) => setChapterForm((current) => ({ ...current, isActive: event.target.checked }))} />
                前台展示该章节
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setChapterDialogOpen(false)}>取消</Button>
            <Button className="bg-slate-950 text-white" disabled={saving} onClick={() => void saveChapter()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>{itemForm.id ? "编辑默写题" : "添加默写题"}</DialogTitle>
            <DialogDescription>在内容中使用 {"{{答案}}"} 标记挖空，学员端会自动生成填空框。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[1fr_160px_140px]">
              <div className="grid gap-2">
                <Label>所属章节</Label>
                <Select value={itemForm.chapterId} onValueChange={(value) => setItemForm((current) => ({ ...current, chapterId: value }))}>
                  <SelectTrigger className="border-slate-200 bg-white text-slate-900">
                    <SelectValue placeholder="选择章节" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectGroup key={subject.id}>
                        <SelectLabel>{subject.name}</SelectLabel>
                        {chapters.filter((chapter) => chapter.subjectId === subject.id).map((chapter) => (
                          <SelectItem key={chapter.id} value={chapter.id}>{chapter.title}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>状态</Label>
                <Select value={itemForm.status} onValueChange={(value: AdminDictationItemStatus) => setItemForm((current) => ({ ...current, status: value }))}>
                  <SelectTrigger className="border-slate-200 bg-white text-slate-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">已发布</SelectItem>
                    <SelectItem value="draft">草稿</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>排序</Label>
                <Input type="number" className="border-slate-200 bg-white text-slate-900" value={itemForm.sortOrder} onChange={(event) => setItemForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>题目标题</Label>
              <Input className="border-slate-200 bg-white text-slate-900" value={itemForm.title} onChange={(event) => setItemForm((current) => ({ ...current, title: event.target.value }))} placeholder="可不填，系统会从内容中截取标题" />
            </div>
            <div className="grid gap-2">
              <Label>默写内容</Label>
              <Textarea
                className="min-h-[220px] border-slate-200 bg-white font-mono text-sm leading-7 text-slate-900"
                value={itemForm.content}
                onChange={(event) => setItemForm((current) => ({ ...current, content: event.target.value }))}
                placeholder="例：法律行为以{{意思表示}}为核心，意思表示包括{{效果意思}}、{{表示行为}}等。"
              />
              <div className="text-xs text-slate-500">当前识别 {countBlanks(itemForm.content)} 个挖空。格式：{"{{答案}}"}</div>
            </div>
            {itemForm.content.trim() ? (
              <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4 text-sm leading-7 text-slate-700">
                <div className="mb-2 font-bold text-amber-800">前台预览</div>
                <div className="whitespace-pre-wrap">{renderPreview(itemForm.content)}</div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>来源/备注</Label>
                <Input className="border-slate-200 bg-white text-slate-900" value={itemForm.source ?? ""} onChange={(event) => setItemForm((current) => ({ ...current, source: event.target.value }))} placeholder="如：背诵版真题 / 2026讲义" />
              </div>
              <div className="grid gap-2">
                <Label>答案说明</Label>
                <Input className="border-slate-200 bg-white text-slate-900" value={itemForm.explanation ?? ""} onChange={(event) => setItemForm((current) => ({ ...current, explanation: event.target.value }))} placeholder="可选，查看答案时展示" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setItemDialogOpen(false)}>取消</Button>
            <Button className="bg-slate-950 text-white" disabled={saving} onClick={() => void saveItem()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto bg-white text-slate-950">
          <DialogHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle>批量导入默写题</DialogTitle>
                <DialogDescription>每行一道题，使用 {"{{答案}}"} 标记挖空；导入到当前章节，未选择章节时默认导入当前科目第一个章节。</DialogDescription>
              </div>
              <Button type="button" variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={downloadDictationCsvTemplate}>
                <Download className="size-4" />
                下载CSV模板
              </Button>
            </div>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">
              示例：<br />
              国际法基本原则具有{"{{强行法}}"}性质，但并不是所有强行法规则都是国际法基本原则。<br />
              法律行为以{"{{意思表示}}"}为核心，意思表示包括{"{{效果意思}}"}和{"{{表示行为}}"}。
            </div>
            <div className="grid gap-2">
              <Label>上传文件</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.md"
                className="border-slate-200 bg-white text-slate-900"
                onChange={(event) => setBatchFile(event.target.files?.[0] ?? null)}
              />
              <div className="text-xs text-slate-500">支持 Excel/CSV/TXT/Markdown。CSV/Excel 推荐列：标题、原文、挖空、挖空1、挖空2、来源、状态、排序；“挖空”列可用顿号、逗号、分号分隔多个答案，系统会把原文中的挖空词自动标记成填空。</div>
            </div>
            <div className="grid gap-2">
              <Label>导入章节</Label>
              <Select value={activeChapterId !== "all" ? activeChapterId : visibleChapters[0]?.id ?? ""} onValueChange={setActiveChapterId}>
                <SelectTrigger className="border-slate-200 bg-white text-slate-900">
                  <SelectValue placeholder="选择章节" />
                </SelectTrigger>
                <SelectContent>
                  {visibleChapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>{chapter.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>统一来源</Label>
                <Input className="border-slate-200 bg-white text-slate-900" value={batchSource} onChange={(event) => setBatchSource(event.target.value)} placeholder="可选" />
              </div>
              <div className="grid gap-2">
                <Label>导入状态</Label>
                <Select value={batchStatus} onValueChange={(value: AdminDictationItemStatus) => setBatchStatus(value)}>
                  <SelectTrigger className="border-slate-200 bg-white text-slate-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">已发布</SelectItem>
                    <SelectItem value="draft">草稿</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>导入内容</Label>
              <Textarea className="min-h-[260px] border-slate-200 bg-white font-mono text-sm leading-7 text-slate-900" value={batchText} onChange={(event) => setBatchText(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setBatchDialogOpen(false)}>取消</Button>
            <Button className="bg-slate-950 text-white" disabled={saving} onClick={() => void importBatch()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              开始导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
