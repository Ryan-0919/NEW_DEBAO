import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, Eye, EyeOff, FileQuestion, FolderTree, Library, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import type { AdminPagedResult } from "../../services/adminContentService";
import {
  adminQuestionBankService,
  type AdminQuestionBankAccessType,
  type AdminQuestionBankBook,
  type AdminQuestionBankBookPayload,
  type AdminQuestionBankItem,
  type AdminQuestionBankItemType,
  type AdminQuestionBankPaperType,
  type AdminQuestionBankSourceItem,
  type AdminQuestionBankStatus,
  type AdminQuestionBankSubject,
  type AdminQuestionBankSubjectPayload,
  type AdminQuestionBankSummary,
} from "../../services/adminQuestionBankService";
import {
  adminQuestionLibraryService,
  type AdminQuestionLibraryFolder,
} from "../../services/adminQuestionLibraryService";

type ViewMode = "list" | "detail";

type BookForm = AdminQuestionBankBookPayload & {
  id: string;
};

type SubjectForm = AdminQuestionBankSubjectPayload & {
  id: string;
};

type QuestionBankManagementProps = {
  accessType?: AdminQuestionBankAccessType;
};

const emptyItemPage: AdminPagedResult<AdminQuestionBankItem> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const emptySourceItemPage: AdminPagedResult<AdminQuestionBankSourceItem> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 12,
  totalPages: 1,
};

const emptyBookForm: BookForm = {
  id: "",
  name: "",
  code: "",
  coverUrl: "",
  coverObjectKey: "",
  description: "",
  status: "draft",
  accessType: "public",
  paperType: "objective",
  isVisible: true,
  sortOrder: 0,
};

const emptySubjectForm: SubjectForm = {
  id: "",
  name: "",
  code: "",
  description: "",
  sortOrder: 0,
};

const statusMeta: Record<AdminQuestionBankStatus, { label: string; className: string }> = {
  draft: { label: "草稿", className: "border-slate-200 bg-slate-50 text-slate-700" },
  published: { label: "已发布", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  closed: { label: "已关闭", className: "border-amber-100 bg-amber-50 text-amber-700" },
};

const typeMeta: Record<AdminQuestionBankItemType, { label: string; className: string }> = {
  single_choice: { label: "单选", className: "border-blue-100 bg-blue-50 text-blue-700" },
  multiple_choice: { label: "多选", className: "border-violet-100 bg-violet-50 text-violet-700" },
  uncertain_choice: { label: "不定项", className: "border-cyan-100 bg-cyan-50 text-cyan-700" },
  subjective_case: { label: "主观案例", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
};

const difficultyLabel = (value: number) => (Number(value) <= 1 ? "基础" : Number(value) >= 3 ? "较难" : "标准");
const compactNumber = (value: number | undefined | null) => Number(value ?? 0).toLocaleString("zh-CN");

const toBookForm = (book: AdminQuestionBankBook): BookForm => ({
  id: book.id,
  name: book.name,
  code: book.code,
  coverUrl: book.coverUrl,
  coverObjectKey: book.coverObjectKey,
  description: book.description,
  status: book.status,
  accessType: book.accessType,
  paperType: book.paperType,
  isVisible: book.isVisible,
  sortOrder: book.sortOrder,
});

const toSubjectForm = (subject: AdminQuestionBankSubject): SubjectForm => ({
  id: subject.id,
  name: subject.name,
  code: subject.code,
  description: subject.description,
  sortOrder: subject.sortOrder,
});

const buildBookPayload = (form: BookForm): AdminQuestionBankBookPayload => ({
  name: form.name.trim(),
  code: form.code.trim(),
  coverUrl: `${form.coverUrl ?? ""}`.trim(),
  coverObjectKey: `${form.coverObjectKey ?? ""}`.trim(),
  description: `${form.description ?? ""}`.trim(),
  status: form.status,
  accessType: form.accessType,
  paperType: form.paperType,
  isVisible: Boolean(form.isVisible),
  sortOrder: Number(form.sortOrder) || 0,
});

const buildSubjectPayload = (form: SubjectForm): AdminQuestionBankSubjectPayload => ({
  name: form.name.trim(),
  code: form.code.trim(),
  description: `${form.description ?? ""}`.trim(),
  sortOrder: Number(form.sortOrder) || 0,
});

export function QuestionBankManagement({ accessType = "public" }: QuestionBankManagementProps) {
  const [paperType, setPaperType] = useState<AdminQuestionBankPaperType>("objective");
  const [mode, setMode] = useState<ViewMode>("list");
  const [summary, setSummary] = useState<AdminQuestionBankSummary | null>(null);
  const [books, setBooks] = useState<AdminQuestionBankBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<AdminQuestionBankBook | null>(null);
  const [subjects, setSubjects] = useState<AdminQuestionBankSubject[]>([]);
  const [items, setItems] = useState<AdminPagedResult<AdminQuestionBankItem>>(emptyItemPage);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);

  const [bookKeyword, setBookKeyword] = useState("");
  const [bookStatus, setBookStatus] = useState<AdminQuestionBankStatus | "all">("all");
  const [bookVisibility, setBookVisibility] = useState<"all" | "visible" | "hidden">("all");
  const [selectedSubjectId, setSelectedSubjectId] = useState("all");
  const [itemStatus, setItemStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [itemType, setItemType] = useState<AdminQuestionBankItemType | "all">("all");
  const [itemKeyword, setItemKeyword] = useState("");
  const [itemPage, setItemPage] = useState(1);

  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [bookForm, setBookForm] = useState<BookForm>(emptyBookForm);
  const [savingBook, setSavingBook] = useState(false);
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [subjectForm, setSubjectForm] = useState<SubjectForm>(emptySubjectForm);
  const [savingSubject, setSavingSubject] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [sourceFolders, setSourceFolders] = useState<AdminQuestionLibraryFolder[]>([]);
  const [sourceItems, setSourceItems] = useState<AdminPagedResult<AdminQuestionBankSourceItem>>(emptySourceItemPage);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceFolderId, setSourceFolderId] = useState("all");
  const [sourceType, setSourceType] = useState<AdminQuestionBankItemType | "all">("all");
  const [sourceKeyword, setSourceKeyword] = useState("");
  const [sourcePage, setSourcePage] = useState(1);
  const [importSubjectId, setImportSubjectId] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [importingItems, setImportingItems] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const isPublicBank = accessType === "public";
  const pageLabel = isPublicBank ? "免费练习题库" : "授权题库";
  const shortPageLabel = pageLabel;
  const pageDescription = isPublicBank
    ? "管理用户端免费公开练习题库，不需要授权即可练习。"
    : "管理需要给用户开通后才显示在“我的题库”的授权题库。";
  const paperTypeLabel = paperType === "subjective" ? "主观题" : "客观题";
  const questionTypeOptions =
    paperType === "subjective"
      ? [{ value: "subjective_case" as const, label: "主观案例" }]
      : [
          { value: "single_choice" as const, label: "单选" },
          { value: "multiple_choice" as const, label: "多选" },
          { value: "uncertain_choice" as const, label: "不定项" },
        ];

  const summaryCards = useMemo(
    () => [
      { label: pageLabel, value: summary?.totalBooks ?? 0, icon: BookOpen },
      { label: "已发布", value: summary?.publishedBooks ?? 0, icon: CheckCircle2 },
      { label: "科目", value: summary?.totalSubjects ?? 0, icon: FolderTree },
      { label: "启用题目", value: summary?.activeItems ?? 0, icon: FileQuestion },
    ],
    [pageLabel, summary],
  );

  const selectedSubjectName = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId)?.name ?? "全部科目",
    [selectedSubjectId, subjects],
  );
  const selectedSourceSet = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds]);

  const loadSummary = async () => {
    const payload = await adminQuestionBankService.getSummaryByScope({ accessType, paperType });
    setSummary(payload);
  };

  const loadBooks = async () => {
    const payload = await adminQuestionBankService.getBooks({
      keyword: bookKeyword.trim(),
      status: bookStatus,
      visibility: bookVisibility,
      accessType,
      paperType,
    });
    setBooks(payload);
  };

  const loadBookDetail = async (bookId: string) => {
    const payload = await adminQuestionBankService.getBook(bookId);
    setSelectedBook(payload.book);
    setSubjects(payload.subjects);
    return payload;
  };

  const loadItems = async (
    bookId = selectedBook?.id ?? "",
    page = itemPage,
    overrides: Partial<{ subjectId: string; status: "all" | "enabled" | "disabled"; type: AdminQuestionBankItemType | "all"; keyword: string }> = {},
  ) => {
    if (!bookId) return;
    const payload = await adminQuestionBankService.getItems(bookId, {
      page,
      pageSize: 20,
      subjectId: overrides.subjectId ?? selectedSubjectId,
      status: overrides.status ?? itemStatus,
      type: overrides.type ?? itemType,
      keyword: (overrides.keyword ?? itemKeyword).trim(),
    });
    setItems(payload);
    setItemPage(payload.page);
  };

  const loadSourceFolders = async () => {
    const payload = await adminQuestionLibraryService.getFolders(paperType, accessType);
    setSourceFolders(payload);
    return payload;
  };

  const loadSourceItems = async (
    page = sourcePage,
    overrides: Partial<{ folderId: string; type: AdminQuestionBankItemType | "all"; keyword: string }> = {},
  ) => {
    if (!selectedBook) return;
    setSourceLoading(true);
    try {
      const payload = await adminQuestionBankService.getSourceItems(selectedBook.id, {
        page,
        pageSize: 12,
        folderId: overrides.folderId ?? sourceFolderId,
        type: overrides.type ?? sourceType,
        keyword: (overrides.keyword ?? sourceKeyword).trim(),
        excludeExisting: true,
      });
      setSourceItems(payload);
      setSourcePage(payload.page);
    } finally {
      setSourceLoading(false);
    }
  };

  const boot = async () => {
    setLoading(true);
    try {
      await Promise.all([loadSummary(), loadBooks()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${shortPageLabel}配置加载失败`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void boot();
  }, [accessType, paperType]);

  useEffect(() => {
    setSelectedBook(null);
    setSubjects([]);
    setItems(emptyItemPage);
    setMode("list");
    setSelectedSubjectId("all");
    setItemType("all");
    setSourceType("all");
  }, [accessType, paperType]);

  useEffect(() => {
    if (mode === "detail" && selectedBook) {
      setItemPage(1);
      void loadItems(selectedBook.id, 1);
    }
  }, [selectedSubjectId, itemStatus, itemType]);

  useEffect(() => {
    if (sourceDialogOpen && selectedBook) {
      void loadSourceItems(1);
    }
  }, [sourceDialogOpen, sourceFolderId, sourceType]);

  const refreshAll = async () => {
    setListLoading(true);
    try {
      await Promise.all([loadSummary(), loadBooks()]);
      if (selectedBook) {
        await loadBookDetail(selectedBook.id);
        await loadItems(selectedBook.id);
      }
    } finally {
      setListLoading(false);
    }
  };

  const openBookDialog = (book?: AdminQuestionBankBook | null) => {
    setBookForm(book ? toBookForm(book) : { ...emptyBookForm, accessType, paperType, sortOrder: books.length });
    setBookDialogOpen(true);
  };

  const saveBook = async () => {
    const payload = buildBookPayload(bookForm);
    if (!payload.name) {
      toast.error(`请输入${shortPageLabel}名称`);
      return;
    }
    if (!payload.code) {
      toast.error(`请输入${shortPageLabel}编码`);
      return;
    }

    setSavingBook(true);
    try {
      if (bookForm.id) {
        const updated = await adminQuestionBankService.updateBook(bookForm.id, payload);
        setSelectedBook((current) => (current?.id === updated.id ? updated : current));
        toast.success(`${shortPageLabel}已保存`);
      } else {
        const created = await adminQuestionBankService.createBook(payload);
        toast.success(`${shortPageLabel}已创建，请继续添加科目和引用题目`);
        await openBook(created);
      }
      setBookDialogOpen(false);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `保存${shortPageLabel}失败`);
    } finally {
      setSavingBook(false);
    }
  };

  const deleteBook = async (book: AdminQuestionBankBook) => {
    if (!window.confirm(`确认删除${shortPageLabel}「${book.name}」吗？题目、科目、用户授权和练习记录会一并删除。`)) return;
    setActionLoadingId(book.id);
    try {
      await adminQuestionBankService.deleteBook(book.id);
      toast.success(`${shortPageLabel}已删除`);
      if (selectedBook?.id === book.id) {
        setSelectedBook(null);
        setSubjects([]);
        setItems(emptyItemPage);
        setMode("list");
      }
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `删除${shortPageLabel}失败`);
    } finally {
      setActionLoadingId("");
    }
  };

  const toggleBookVisible = async (book: AdminQuestionBankBook) => {
    setActionLoadingId(book.id);
    try {
      await adminQuestionBankService.updateBook(book.id, {
        ...toBookForm(book),
        isVisible: !book.isVisible,
      });
      toast.success(book.isVisible ? `${shortPageLabel}已隐藏` : `${shortPageLabel}已恢复显示`);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `更新${shortPageLabel}状态失败`);
    } finally {
      setActionLoadingId("");
    }
  };

  const openBook = async (book: AdminQuestionBankBook) => {
    setListLoading(true);
    try {
      const detail = await loadBookDetail(book.id);
      setSelectedSubjectId("all");
      setItemStatus("all");
      setItemType("all");
      setItemKeyword("");
      setMode("detail");
      await loadItems(detail.book.id, 1, { subjectId: "all", status: "all", type: "all", keyword: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `打开${shortPageLabel}失败`);
    } finally {
      setListLoading(false);
    }
  };

  const openSubjectDialog = (subject?: AdminQuestionBankSubject | null) => {
    setSubjectForm(subject ? toSubjectForm(subject) : { ...emptySubjectForm, sortOrder: subjects.length });
    setSubjectDialogOpen(true);
  };

  const openSourceDialog = async () => {
    if (!selectedBook) return;
    if (subjects.length === 0) {
      toast.error("请先创建科目，再从原题库选题");
      return;
    }
    setImportSubjectId(selectedSubjectId !== "all" ? selectedSubjectId : subjects[0].id);
    setSelectedSourceIds([]);
    setSourceFolderId("all");
    setSourceType("all");
    setSourceKeyword("");
    setSourceDialogOpen(true);
    try {
      await loadSourceFolders();
      await loadSourceItems(1, { folderId: "all", type: "all", keyword: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载原题库失败");
    }
  };

  const toggleSourceSelected = (itemId: string, checked: boolean) => {
    setSelectedSourceIds((current) => {
      if (checked) return [...new Set([...current, itemId])];
      return current.filter((id) => id !== itemId);
    });
  };

  const toggleCurrentSourcePage = () => {
    const ids = sourceItems.items.map((item) => item.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedSourceSet.has(id));
    setSelectedSourceIds((current) => {
      if (allSelected) return current.filter((id) => !ids.includes(id));
      return [...new Set([...current, ...ids])];
    });
  };

  const importSelectedItems = async () => {
    if (!selectedBook) return;
    if (!importSubjectId) {
      toast.error("请选择导入到哪个科目");
      return;
    }
    if (selectedSourceIds.length === 0) {
      toast.error("请选择要引用的题目");
      return;
    }
    setImportingItems(true);
    try {
      const result = await adminQuestionBankService.importItems(selectedBook.id, {
        subjectId: importSubjectId,
        sourceItemIds: selectedSourceIds,
      });
      toast.success(result.skippedCount > 0 ? `已引用 ${result.createdCount} 道，跳过 ${result.skippedCount} 道重复题` : `已引用 ${result.createdCount} 道题`);
      setSourceDialogOpen(false);
      setSelectedSubjectId(importSubjectId);
      await loadBookDetail(selectedBook.id);
      await loadItems(selectedBook.id, 1, { subjectId: importSubjectId });
      await loadSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "引用题目失败");
    } finally {
      setImportingItems(false);
    }
  };

  const saveSubject = async () => {
    if (!selectedBook) return;
    const payload = buildSubjectPayload(subjectForm);
    if (!payload.name) {
      toast.error("请输入科目名称");
      return;
    }
    if (!payload.code) {
      toast.error("请输入科目编码");
      return;
    }

    setSavingSubject(true);
    try {
      if (subjectForm.id) {
        await adminQuestionBankService.updateSubject(selectedBook.id, subjectForm.id, payload);
        toast.success("科目已保存");
      } else {
        await adminQuestionBankService.createSubject(selectedBook.id, payload);
        toast.success("科目已创建");
      }
      setSubjectDialogOpen(false);
      await loadBookDetail(selectedBook.id);
      await loadItems(selectedBook.id);
      await loadSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存科目失败");
    } finally {
      setSavingSubject(false);
    }
  };

  const deleteSubject = async (subject: AdminQuestionBankSubject) => {
    if (!selectedBook) return;
    if (!window.confirm(`确认删除科目「${subject.name}」吗？科目下题目和相关练习记录会一并删除。`)) return;
    setActionLoadingId(subject.id);
    try {
      await adminQuestionBankService.deleteSubject(selectedBook.id, subject.id);
      toast.success("科目已删除");
      if (selectedSubjectId === subject.id) setSelectedSubjectId("all");
      await loadBookDetail(selectedBook.id);
      await loadItems(selectedBook.id, 1, { subjectId: "all" });
      await loadSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除科目失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const toggleItemStatus = async (item: AdminQuestionBankItem) => {
    if (!selectedBook) return;
    setActionLoadingId(item.id);
    try {
      await adminQuestionBankService.updateItemStatus(selectedBook.id, item.id, !item.status);
      toast.success(item.status ? "题目已停用" : "题目已启用");
      await loadBookDetail(selectedBook.id);
      await loadItems(selectedBook.id);
      await loadSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新题目状态失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const deleteItem = async (item: AdminQuestionBankItem) => {
    if (!selectedBook) return;
    if (!window.confirm(`确认删除这道题吗？相关用户练习记录会一并删除。\n${item.title || item.questionNo || item.stem.slice(0, 30)}`)) return;
    setActionLoadingId(item.id);
    try {
      await adminQuestionBankService.deleteItem(selectedBook.id, item.id);
      toast.success("题目已删除");
      await loadBookDetail(selectedBook.id);
      await loadItems(selectedBook.id);
      await loadSummary();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除题目失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const uploadBookCover = async (file: File | null) => {
    if (!file) return;
    setUploadingCover(true);
    try {
      const uploaded = await adminQuestionBankService.uploadBookCover(file);
      setBookForm((current) => ({
        ...current,
        coverUrl: uploaded.url,
        coverObjectKey: uploaded.objectKey,
      }));
      toast.success("题库封面已上传");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "题库封面上传失败");
    } finally {
      setUploadingCover(false);
    }
  };

  if (loading) return <div className="py-10 text-slate-500">{shortPageLabel}配置加载中...</div>;

  if (mode === "detail" && selectedBook) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setMode("list")}>
              <ArrowLeft className="mr-2 size-4" />
              题库列表
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold text-slate-950">{selectedBook.name}</h1>
                <Badge variant="outline" className={statusMeta[selectedBook.status].className}>{statusMeta[selectedBook.status].label}</Badge>
                <Badge variant="outline" className={selectedBook.isVisible ? "border-blue-100 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                  {selectedBook.isVisible ? "前台可见" : "已隐藏"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">{pageLabel} · {paperTypeLabel}内容配置，不进入机考流程。编码：{selectedBook.code}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => openBookDialog(selectedBook)}>
              <Pencil className="mr-2 size-4" />
              编辑题库
            </Button>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => openSubjectDialog()}>
              <Plus className="mr-2 size-4" />
              新建科目
            </Button>
            <Button onClick={() => void openSourceDialog()}>
              <Library className="mr-2 size-4" />
              从原题库选题
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h2 className="text-base font-semibold text-slate-900">科目</h2>
              <p className="mt-1 text-sm text-slate-500">按科目组织用户端章节练习。</p>
            </div>
            <div className="space-y-2 p-3">
              <button
                className={`w-full rounded-lg border px-3 py-3 text-left text-sm ${selectedSubjectId === "all" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                onClick={() => setSelectedSubjectId("all")}
              >
                <div className="font-semibold">全部科目</div>
                <div className="mt-1 text-xs opacity-70">{selectedBook.itemCount} 道题</div>
              </button>
              {subjects.map((subject) => (
                <div key={subject.id} className={`rounded-lg border ${selectedSubjectId === subject.id ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <button className="w-full px-3 py-3 text-left" onClick={() => setSelectedSubjectId(subject.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{subject.name}</span>
                      <span className="text-xs text-slate-500">{subject.itemCount}</span>
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-slate-400">{subject.code}</div>
                  </button>
                  <div className="flex gap-2 border-t border-slate-100 px-3 py-2">
                    <Button size="sm" variant="outline" className="h-8 flex-1 border-slate-200 bg-white text-slate-700" onClick={() => openSubjectDialog(subject)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => deleteSubject(subject)} disabled={actionLoadingId === subject.id}>
                      删除
                    </Button>
                  </div>
                </div>
              ))}
              {subjects.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">暂无科目，请先创建科目</div> : null}
            </div>
          </aside>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">题目列表</h2>
                  <p className="mt-1 text-sm text-slate-500">当前范围：{selectedSubjectName}，共 {items.total} 道；题目内容来自原题库引用。</p>
                </div>
                <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => selectedBook && void loadItems(selectedBook.id, 1)}>
                  刷新
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Input className="w-72 border-slate-200 bg-white" value={itemKeyword} onChange={(event) => setItemKeyword(event.target.value)} placeholder="搜索题干、题号、解析" />
                <Select value={itemStatus} onValueChange={(value: "all" | "enabled" | "disabled") => setItemStatus(value)}>
                  <SelectTrigger className="w-36 border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white text-slate-900">
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="enabled">启用</SelectItem>
                    <SelectItem value="disabled">停用</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={itemType} onValueChange={(value: AdminQuestionBankItemType | "all") => setItemType(value)}>
                  <SelectTrigger className="w-36 border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white text-slate-900">
                    <SelectItem value="all">全部题型</SelectItem>
                    {questionTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => selectedBook && void loadItems(selectedBook.id, 1)}>
                  <Search className="mr-2 size-4" />
                  查询
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3">题目</th>
                    <th className="px-4 py-3">科目</th>
                    <th className="px-4 py-3">来源</th>
                    <th className="px-4 py-3">题型</th>
                    <th className="px-4 py-3">答案</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3">记录</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="max-w-[360px] px-4 py-4">
                        <p className="line-clamp-2 font-medium text-slate-950">{item.title || item.stem}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          {item.questionNo ? <span>{item.questionNo}</span> : null}
                          {item.yearLabel ? <span>{item.yearLabel}</span> : null}
                          <span>{item.optionCount} 个选项</span>
                          <span>难度 {difficultyLabel(item.difficulty)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{item.subjectName}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <Badge variant="outline" className={item.isSourceMissing ? "w-fit border-rose-100 bg-rose-50 text-rose-700" : "w-fit border-blue-100 bg-blue-50 text-blue-700"}>
                            {item.isLegacySource ? "历史机考来源" : item.isReferenced ? "练习原题引用" : "历史手工题"}
                          </Badge>
                          <span className="max-w-[160px] truncate text-slate-500">{item.sourceFolderName || (item.isSourceMissing ? "原题已缺失" : "未关联文件夹")}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className={typeMeta[item.type].className}>{typeMeta[item.type].label}</Badge>
                      </td>
                      <td className="px-4 py-4 font-mono text-slate-700">{item.correctAnswer.join("、") || "-"}</td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className={item.status ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                          {item.status ? "启用" : "停用"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{item.userStateCount}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="border-slate-200 bg-white" onClick={() => toggleItemStatus(item)} disabled={actionLoadingId === item.id}>
                            {item.status ? "停用" : "启用"}
                          </Button>
                          <Button size="sm" variant="outline" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => deleteItem(item)} disabled={actionLoadingId === item.id}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-500">暂无匹配题目，请从原题库选题引用</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
              <span>第 {items.page} / {items.totalPages} 页，共 {items.total} 道题</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="border-slate-200 bg-white" disabled={items.page <= 1} onClick={() => selectedBook && void loadItems(selectedBook.id, items.page - 1)}>
                  上一页
                </Button>
                <Button variant="outline" size="sm" className="border-slate-200 bg-white" disabled={items.page >= items.totalPages} onClick={() => selectedBook && void loadItems(selectedBook.id, items.page + 1)}>
                  下一页
                </Button>
              </div>
            </div>
          </section>
        </div>

        {renderBookDialog()}
        {renderSubjectDialog()}
        {renderSourceDialog()}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{pageLabel}</h1>
          <p className="mt-2 text-sm text-slate-500">{pageDescription} 当前维护：{paperTypeLabel}。</p>
        </div>
        <Button onClick={() => openBookDialog()}>
          <Plus className="mr-2 size-4" />
          新建{shortPageLabel}
        </Button>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {([
          { value: "objective" as const, label: "客观题" },
          { value: "subjective" as const, label: "主观题" },
        ]).map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${paperType === option.value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
            onClick={() => setPaperType(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{item.label}</p>
                <Icon className="size-4 text-blue-600" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{compactNumber(item.value)}</p>
            </div>
          );
        })}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <Input className="w-72 border-slate-200 bg-white" value={bookKeyword} onChange={(event) => setBookKeyword(event.target.value)} placeholder="搜索题库名称、编码" />
          <Select value={bookStatus} onValueChange={(value: AdminQuestionBankStatus | "all") => setBookStatus(value)}>
            <SelectTrigger className="w-36 border-slate-200 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
              <SelectItem value="closed">已关闭</SelectItem>
            </SelectContent>
          </Select>
          <Select value={bookVisibility} onValueChange={(value: "all" | "visible" | "hidden") => setBookVisibility(value)}>
            <SelectTrigger className="w-36 border-slate-200 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">全部可见性</SelectItem>
              <SelectItem value="visible">前台可见</SelectItem>
              <SelectItem value="hidden">已隐藏</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void loadBooks()}>
            <Search className="mr-2 size-4" />
            查询
          </Button>
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void refreshAll()} disabled={listLoading}>
            刷新
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">题库</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">内容</th>
                <th className="px-4 py-3">用户</th>
                <th className="px-4 py-3">更新时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id} className="border-t border-slate-100">
                  <td className="max-w-[360px] px-4 py-4">
                    <p className="font-medium text-slate-950">{book.name}</p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{book.code}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{book.description || "暂无简介"}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-2">
                      <Badge variant="outline" className={statusMeta[book.status].className}>{statusMeta[book.status].label}</Badge>
                      <Badge variant="outline" className={book.isVisible ? "border-blue-100 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                        {book.isVisible ? "前台可见" : "已隐藏"}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <div>{book.subjectCount} 科目</div>
                    <div className="mt-1">{book.activeItemCount}/{book.itemCount} 题启用</div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <div>{isPublicBank ? "公开免费" : `${book.permissionCount} 人授权`}</div>
                    <div className="mt-1">{book.progressCount} 人练习</div>
                  </td>
                  <td className="px-4 py-4 text-slate-500">{book.updatedAt}</td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => void openBook(book)}>配置选题</Button>
                      <Button size="sm" variant="outline" className="border-slate-200 bg-white" onClick={() => openBookDialog(book)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="outline" className="border-slate-200 bg-white" onClick={() => void toggleBookVisible(book)} disabled={actionLoadingId === book.id}>
                        {book.isVisible ? <EyeOff className="mr-1 size-3" /> : <Eye className="mr-1 size-3" />}
                        {book.isVisible ? "隐藏" : "显示"}
                      </Button>
                      <Button size="sm" variant="outline" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => void deleteBook(book)} disabled={actionLoadingId === book.id}>
                        <Trash2 className="mr-1 size-3" />
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {books.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500">暂无{shortPageLabel}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {renderBookDialog()}
    </div>
  );

  function renderBookDialog() {
    return (
      <Dialog open={bookDialogOpen} onOpenChange={setBookDialogOpen}>
        <DialogContent className="max-w-3xl border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>{bookForm.id ? `编辑${pageLabel}` : `新建${pageLabel}`}</DialogTitle>
            <DialogDescription>{pageDescription} 发布前需要至少一个科目和一道已引用并启用的题目。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{shortPageLabel}名称</Label>
              <Input className="border-slate-200 bg-white" value={bookForm.name} onChange={(event) => setBookForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{shortPageLabel}编码</Label>
              <Input className="border-slate-200 bg-white font-mono" value={bookForm.code} onChange={(event) => setBookForm((current) => ({ ...current, code: event.target.value }))} placeholder="civil-2026" />
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={bookForm.status} onValueChange={(value: AdminQuestionBankStatus) => setBookForm((current) => ({ ...current, status: value }))}>
                <SelectTrigger className="border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-slate-200 bg-white text-slate-900">
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="published">已发布</SelectItem>
                  <SelectItem value="closed">已关闭</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>题库类型</Label>
              <Input className="border-slate-200 bg-slate-50" value={isPublicBank ? "免费公开" : "授权可见"} readOnly />
            </div>
            <div className="space-y-2">
              <Label>题目类型</Label>
              <Input className="border-slate-200 bg-slate-50" value={paperTypeLabel} readOnly />
            </div>
            <div className="space-y-2">
              <Label>排序</Label>
              <Input type="number" className="border-slate-200 bg-white" value={bookForm.sortOrder} onChange={(event) => setBookForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 md:col-span-3">
              <div>
                <Label>前台可见</Label>
                <p className="text-xs text-slate-500">
                  {isPublicBank ? "题库发布并开启可见后，所有登录学员都能在免费练习题库看到。" : "题库发布、开启可见并给用户授权后，才会在我的题库展示。"}
                </p>
              </div>
              <Switch checked={bookForm.isVisible} onCheckedChange={(checked) => setBookForm((current) => ({ ...current, isVisible: checked }))} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>题库封面</Label>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {bookForm.coverUrl ? <img src={bookForm.coverUrl} alt="题库封面" className="h-16 w-24 rounded-md border border-slate-200 object-cover" /> : <div className="flex h-16 w-24 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-xs text-slate-400">暂无封面</div>}
                <div className="min-w-0 flex-1">
                  <Input type="file" accept="image/*" className="border-slate-200 bg-white" disabled={uploadingCover} onChange={(event) => void uploadBookCover(event.target.files?.[0] ?? null)} />
                  {bookForm.coverUrl ? <p className="mt-2 truncate text-xs text-slate-500">{bookForm.coverUrl}</p> : null}
                </div>
              </div>
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>简介</Label>
              <Textarea className="min-h-24 border-slate-200 bg-white" value={bookForm.description} onChange={(event) => setBookForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setBookDialogOpen(false)}>取消</Button>
            <Button onClick={() => void saveBook()} disabled={savingBook}>{savingBook ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderSubjectDialog() {
    return (
      <Dialog open={subjectDialogOpen} onOpenChange={setSubjectDialogOpen}>
        <DialogContent className="max-w-xl border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>{subjectForm.id ? "编辑科目" : "新建科目"}</DialogTitle>
            <DialogDescription>用户端练习题库会按科目显示章节入口。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>科目名称</Label>
              <Input className="border-slate-200 bg-white" value={subjectForm.name} onChange={(event) => setSubjectForm((current) => ({ ...current, name: event.target.value }))} placeholder="民法" />
            </div>
            <div className="space-y-2">
              <Label>科目编码</Label>
              <Input className="border-slate-200 bg-white font-mono" value={subjectForm.code} onChange={(event) => setSubjectForm((current) => ({ ...current, code: event.target.value }))} placeholder="civil" />
            </div>
            <div className="space-y-2">
              <Label>排序</Label>
              <Input type="number" className="border-slate-200 bg-white" value={subjectForm.sortOrder} onChange={(event) => setSubjectForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>说明</Label>
              <Textarea className="min-h-20 border-slate-200 bg-white" value={subjectForm.description} onChange={(event) => setSubjectForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setSubjectDialogOpen(false)}>取消</Button>
            <Button onClick={() => void saveSubject()} disabled={savingSubject}>{savingSubject ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderSourceDialog() {
    const visibleIds = sourceItems.items.map((item) => item.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSourceSet.has(id));

    return (
      <Dialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[min(1480px,calc(100vw-48px))] max-w-none overflow-hidden border border-slate-200 bg-white p-0 text-slate-900">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>从原题库选题</DialogTitle>
            <DialogDescription>当前只显示{paperTypeLabel}原题，批量引用到当前{pageLabel}科目中；重复引用会自动跳过。</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="min-h-0 border-r border-slate-200 bg-slate-50/60 p-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>导入到科目</Label>
                  <Select value={importSubjectId} onValueChange={setImportSubjectId}>
                    <SelectTrigger className="border-slate-200 bg-white"><SelectValue placeholder="选择科目" /></SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      {subjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>原题库文件夹</Label>
                  <Select value={sourceFolderId} onValueChange={setSourceFolderId}>
                    <SelectTrigger className="border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      <SelectItem value="all">全部文件夹</SelectItem>
                      {sourceFolders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>题型</Label>
                  <Select value={sourceType} onValueChange={(value: AdminQuestionBankItemType | "all") => setSourceType(value)}>
                    <SelectTrigger className="border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      <SelectItem value="all">全部题型</SelectItem>
                      {questionTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-800">
                  已选 <span className="font-semibold">{selectedSourceIds.length}</span> 道题，本页 <span className="font-semibold">{visibleIds.length}</span> 道
                </div>
              </div>
            </aside>

            <section className="min-h-0 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-3">
                  <Input className="w-80 border-slate-200 bg-white" value={sourceKeyword} onChange={(event) => setSourceKeyword(event.target.value)} placeholder="搜索题干、题号、解析" />
                  <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void loadSourceItems(1)}>
                    <Search className="mr-2 size-4" />
                    查询
                  </Button>
                </div>
                <Button variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50" onClick={toggleCurrentSourcePage} disabled={sourceItems.items.length === 0}>
                  {allVisibleSelected ? "取消本页选择" : "选择本页"}
                </Button>
              </div>

              <div className="max-h-[62vh] overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[1380px] text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3">选</th>
                      <th className="px-4 py-3">题目信息</th>
                      <th className="px-4 py-3">材料/解析</th>
                      <th className="px-4 py-3">来源</th>
                      <th className="px-4 py-3">题型/分值</th>
                      <th className="px-4 py-3">答案/音频</th>
                      <th className="px-4 py-3">引用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceItems.items.map((item) => {
                      const isSubjectiveItem = item.type === "subjective_case";
                      const hasAudio = Boolean(item.lessonAudioUrl || item.lessonAudioObjectKey);
                      return (
                        <tr key={item.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-4">
                            <Checkbox checked={selectedSourceSet.has(item.id)} onCheckedChange={(checked) => toggleSourceSelected(item.id, checked === true)} />
                          </td>
                          <td className="max-w-[360px] px-4 py-4">
                            <p className="line-clamp-3 font-medium leading-6 text-slate-950">{item.title || item.stem}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                              {item.questionNo ? <span>题号 {item.questionNo}</span> : null}
                              {item.yearLabel ? <span>{item.yearLabel}</span> : null}
                              {item.pageLabel ? <span>{item.pageLabel}</span> : null}
                            </div>
                          </td>
                          <td className="max-w-[320px] px-4 py-4 text-xs leading-5 text-slate-600">
                            <p className="line-clamp-2">{item.material || "无材料"}</p>
                            <p className="mt-2 line-clamp-2 text-slate-400">{item.analysis || "无解析"}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            <div className="max-w-[180px] truncate">{item.folderName}</div>
                            <div className="mt-2 text-xs text-slate-400">难度 {difficultyLabel(item.difficulty)}</div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant="outline" className={typeMeta[item.type].className}>{typeMeta[item.type].label}</Badge>
                            <div className="mt-2 text-xs text-slate-500">{item.score} 分</div>
                            <div className="mt-1 text-xs text-slate-400">{isSubjectiveItem ? "主观作答" : `${item.optionCount} 个选项`}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-mono text-sm text-slate-700">{isSubjectiveItem ? "无客观答案" : item.correctAnswer.join("、") || "-"}</div>
                            <div className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs ${hasAudio ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                              {hasAudio ? `有音频${item.lessonAudioDurationSeconds ? ` · ${item.lessonAudioDurationSeconds}s` : ""}` : "无音频"}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-600">{item.referencedCount}</td>
                        </tr>
                      );
                    })}
                    {sourceItems.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center text-slate-500">
                          {sourceLoading ? "原题库加载中..." : "没有可引用的题目，可能已全部引用或原题库暂无内容"}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <span>第 {sourceItems.page} / {sourceItems.totalPages} 页，共 {sourceItems.total} 道可选题</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-slate-200 bg-white" disabled={sourceItems.page <= 1 || sourceLoading} onClick={() => void loadSourceItems(sourceItems.page - 1)}>
                    上一页
                  </Button>
                  <Button variant="outline" size="sm" className="border-slate-200 bg-white" disabled={sourceItems.page >= sourceItems.totalPages || sourceLoading} onClick={() => void loadSourceItems(sourceItems.page + 1)}>
                    下一页
                  </Button>
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setSourceDialogOpen(false)}>取消</Button>
            <Button onClick={() => void importSelectedItems()} disabled={selectedSourceIds.length === 0 || importingItems}>
              {importingItems ? "引用中..." : `确认引用 ${selectedSourceIds.length} 道`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}
