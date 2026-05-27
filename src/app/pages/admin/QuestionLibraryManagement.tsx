import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileQuestion, FolderPlus, Pencil, Plus, Save, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { downloadQuestionImportTemplate } from "../../lib/question-import-template";
import type { AdminPagedResult } from "../../services/adminContentService";
import type { AdminQuestionBankItemType, AdminQuestionBankOption } from "../../services/adminQuestionBankService";
import {
  adminQuestionLibraryService,
  type AdminQuestionLibraryAccessType,
  type AdminQuestionLibraryPaperType,
  type AdminQuestionLibraryFolder,
  type AdminQuestionLibraryFolderPayload,
  type AdminQuestionLibraryItem,
  type AdminQuestionLibraryItemPayload,
  type AdminQuestionLibrarySummary,
  type AdminQuestionLibrarySubQuestion,
} from "../../services/adminQuestionLibraryService";

type ViewMode = "list" | "edit";
type FolderForm = AdminQuestionLibraryFolderPayload & { id: string };
type ItemForm = Omit<AdminQuestionLibraryItemPayload, "tags"> & { id: string; tags: string };

type QuestionLibraryManagementProps = {
  accessType?: AdminQuestionLibraryAccessType;
};

const pageSize = 20;
const optionKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const emptyItemPage: AdminPagedResult<AdminQuestionLibraryItem> = {
  items: [],
  total: 0,
  page: 1,
  pageSize,
  totalPages: 1,
};

const defaultOptions: AdminQuestionBankOption[] = ["A", "B", "C", "D"].map((optionKey, index) => ({
  optionKey,
  content: "",
  sortOrder: index,
}));

const emptyFolderForm: FolderForm = {
  id: "",
  name: "",
  accessType: "public",
  paperType: "objective",
};

const emptyItemForm: ItemForm = {
  id: "",
  folderId: "",
  title: "",
  questionNo: "",
  yearLabel: "",
  pageLabel: "",
  tags: "",
  difficulty: 2,
  type: "single_choice",
  stem: "",
  material: "",
  analysis: "",
  lessonAudioUrl: "",
  lessonAudioObjectKey: "",
  lessonAudioDurationSeconds: 0,
  score: 2,
  sortOrder: 0,
  correctAnswer: [],
  options: defaultOptions,
  subQuestions: [],
};

const typeMeta: Record<AdminQuestionBankItemType, { label: string; className: string }> = {
  single_choice: { label: "单选", className: "border-blue-100 bg-blue-50 text-blue-700" },
  multiple_choice: { label: "多选", className: "border-violet-100 bg-violet-50 text-violet-700" },
  uncertain_choice: { label: "不定项", className: "border-cyan-100 bg-cyan-50 text-cyan-700" },
  subjective_case: { label: "主观案例", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
};

const difficultyLabel = (value: number) => (Number(value) <= 1 ? "基础" : Number(value) >= 3 ? "较难" : "标准");
const splitTags = (value = "") => value.split(/[,\n，、]/).map((item) => item.trim()).filter(Boolean);
const compactNumber = (value: number | undefined | null) => Number(value ?? 0).toLocaleString("zh-CN");
const optionKeyAt = (index: number) => optionKeys[index] ?? String.fromCharCode(65 + index);

const createEmptySubQuestion = (index = 0): AdminQuestionLibrarySubQuestion => ({
  id: `sub_${index + 1}`,
  title: "",
  prompt: "",
  placeholder: "请在这里写本小问答案。",
  referenceAnswer: "",
  analysis: "",
  sortOrder: index + 1,
});

const createEmptyItemForm = (paperType: AdminQuestionLibraryPaperType): ItemForm => ({
  ...emptyItemForm,
  type: paperType === "subjective" ? "subjective_case" : "single_choice",
  score: paperType === "subjective" ? 20 : 2,
  correctAnswer: [],
  options: paperType === "subjective" ? [] : defaultOptions.map((option) => ({ ...option })),
  subQuestions: paperType === "subjective" ? [createEmptySubQuestion(0)] : [],
});

const toItemForm = (item: AdminQuestionLibraryItem): ItemForm => ({
  id: item.id,
  folderId: item.folderId,
  title: item.title,
  questionNo: item.questionNo,
  yearLabel: item.yearLabel,
  pageLabel: item.pageLabel,
  tags: item.tags.join("，"),
  difficulty: item.difficulty,
  type: item.type,
  stem: item.stem,
  material: item.material,
  analysis: item.analysis,
  lessonAudioUrl: item.lessonAudioUrl,
  lessonAudioObjectKey: item.lessonAudioObjectKey,
  lessonAudioDurationSeconds: item.lessonAudioDurationSeconds,
  score: item.score,
  sortOrder: item.sortOrder,
  correctAnswer: item.correctAnswer,
  options: item.paperType === "subjective" ? [] : item.options.length > 0 ? item.options.map((option, index) => ({ ...option, sortOrder: index })) : defaultOptions.map((option) => ({ ...option })),
  subQuestions: item.paperType === "subjective" ? (item.subQuestions.length > 0 ? item.subQuestions : [createEmptySubQuestion(0)]) : [],
});

const normalizeSubQuestions = (items: AdminQuestionLibrarySubQuestion[] = []) =>
  items
    .map((item, index) => ({
      id: item.id || `sub_${index + 1}`,
      title: `${item.title ?? ""}`.trim(),
      prompt: `${item.prompt ?? ""}`.trim(),
      placeholder: `${item.placeholder ?? ""}`.trim(),
      referenceAnswer: `${item.referenceAnswer ?? ""}`.trim(),
      analysis: `${item.analysis ?? ""}`.trim(),
      sortOrder: index + 1,
    }))
    .filter((item) => item.title || item.prompt || item.placeholder || item.referenceAnswer || item.analysis);

const buildItemPayload = (form: ItemForm, paperType: AdminQuestionLibraryPaperType): AdminQuestionLibraryItemPayload => {
  const isSubjective = paperType === "subjective";
  return {
    folderId: form.folderId,
    title: form.title.trim(),
    questionNo: form.questionNo.trim(),
    yearLabel: form.yearLabel.trim(),
    pageLabel: form.pageLabel.trim(),
    tags: splitTags(form.tags),
    difficulty: Number(form.difficulty) || 2,
    type: isSubjective ? "subjective_case" : form.type,
    stem: form.stem.trim(),
    material: form.material.trim(),
    analysis: form.analysis.trim(),
    lessonAudioUrl: form.lessonAudioUrl.trim(),
    lessonAudioObjectKey: form.lessonAudioObjectKey.trim(),
    lessonAudioDurationSeconds: Number(form.lessonAudioDurationSeconds) || 0,
    score: Number(form.score) || (isSubjective ? 20 : 2),
    sortOrder: Number(form.sortOrder) || 0,
    correctAnswer: isSubjective ? [] : form.correctAnswer,
    options: isSubjective
      ? []
      : form.options
          .map((option, index) => ({
            optionKey: `${option.optionKey || optionKeyAt(index)}`.trim().toUpperCase(),
            content: option.content.trim(),
            sortOrder: index,
          }))
          .filter((option) => option.optionKey && option.content),
    subQuestions: isSubjective ? normalizeSubQuestions(form.subQuestions) : [],
  };
};

export function QuestionLibraryManagement({ accessType = "public" }: QuestionLibraryManagementProps) {
  const [mode, setMode] = useState<ViewMode>("list");
  const [paperType, setPaperType] = useState<AdminQuestionLibraryPaperType>("objective");
  const [summary, setSummary] = useState<AdminQuestionLibrarySummary | null>(null);
  const [folders, setFolders] = useState<AdminQuestionLibraryFolder[]>([]);
  const [items, setItems] = useState<AdminPagedResult<AdminQuestionLibraryItem>>(emptyItemPage);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<AdminQuestionBankItemType | "all">("all");
  const [page, setPage] = useState(1);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderForm, setFolderForm] = useState<FolderForm>(emptyFolderForm);
  const [savingFolder, setSavingFolder] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [savingItem, setSavingItem] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFolderId, setImportFolderId] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingItems, setImportingItems] = useState(false);

  const isPublicLibrary = accessType === "public";
  const libraryLabel = isPublicLibrary ? "免费练习原题库" : "授权题库原题库";
  const linkedBankLabel = isPublicLibrary ? "免费练习题库" : "授权题库";
  const isSubjective = paperType === "subjective";
  const paperTypeLabel = isSubjective ? "主观题" : "客观题";
  const questionTypeOptions =
    isSubjective
      ? [{ value: "subjective_case" as const, label: "主观案例" }]
      : [
          { value: "single_choice" as const, label: "单选" },
          { value: "multiple_choice" as const, label: "多选" },
          { value: "uncertain_choice" as const, label: "不定项" },
        ];

  const selectedFolderName = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId)?.name ?? "全部文件夹",
    [folders, selectedFolderId],
  );

  const getBatchImportTemplate = (folderId = importFolderId) =>
    JSON.stringify(
      {
        accessType,
        paperType,
        folderId: folderId || "先在弹窗里选择目标文件夹",
        items: isSubjective
          ? [
              {
                title: "2024 民法案例题",
                questionNo: "主观-1",
                yearLabel: "2024",
                difficulty: 2,
                type: "主观题",
                stem: "这里填写主观题题干。",
                material: "这里填写案例材料，可保留换行。",
                analysis: "这里填写参考解析。",
                subQuestions: [
                  {
                    title: "第一问",
                    prompt: "这里填写第一问的问题。",
                    placeholder: "请在这里写第一问答案。",
                    referenceAnswer: "这里填写第一问参考答案。",
                    analysis: "这里填写第一问答案解析。",
                  },
                  {
                    title: "第二问",
                    prompt: "这里填写第二问的问题。",
                    placeholder: "请在这里写第二问答案。",
                    referenceAnswer: "这里填写第二问参考答案。",
                    analysis: "这里填写第二问答案解析。",
                  },
                ],
                score: 20,
              },
            ]
          : [
              {
                title: "2024 民法单选题",
                questionNo: "1",
                yearLabel: "2024",
                difficulty: 2,
                type: "单选",
                stem: "这里填写客观题题干。",
                material: "这里填写材料，可为空。",
                analysis: "这里填写解析。",
                score: 2,
                correctAnswer: ["A"],
                options: [
                  { optionKey: "A", content: "选项 A" },
                  { optionKey: "B", content: "选项 B" },
                  { optionKey: "C", content: "选项 C" },
                  { optionKey: "D", content: "选项 D" },
                ],
              },
              {
                title: "2024 民法多选题",
                questionNo: "2",
                yearLabel: "2024",
                difficulty: 2,
                type: "多选",
                stem: "这里填写多选题题干。",
                material: "这里填写材料，可为空。",
                analysis: "这里填写解析。",
                score: 2,
                correctAnswer: ["A", "B"],
                options: [
                  { optionKey: "A", content: "选项 A" },
                  { optionKey: "B", content: "选项 B" },
                  { optionKey: "C", content: "选项 C" },
                  { optionKey: "D", content: "选项 D" },
                ],
              },
              {
                title: "2024 民法不定项题",
                questionNo: "3",
                yearLabel: "2024",
                difficulty: 2,
                type: "不定项",
                stem: "这里填写不定项选择题题干。",
                material: "这里填写材料，可为空。",
                analysis: "这里填写解析。",
                score: 2,
                correctAnswer: ["A", "C"],
                options: [
                  { optionKey: "A", content: "选项 A" },
                  { optionKey: "B", content: "选项 B" },
                  { optionKey: "C", content: "选项 C" },
                  { optionKey: "D", content: "选项 D" },
                ],
              },
            ],
      },
      null,
      2,
    );

  const loadSummary = async () => {
    setSummary(await adminQuestionLibraryService.getSummary(paperType, accessType));
  };

  const loadFolders = async () => {
    const folderList = await adminQuestionLibraryService.getFolders(paperType, accessType);
    setFolders(folderList);
    return folderList;
  };

  const loadItems = async (
    nextPage = page,
    overrides: Partial<{ folderId: string; keyword: string; type: AdminQuestionBankItemType | "all" }> = {},
  ) => {
    const payload = await adminQuestionLibraryService.getItems({
      page: nextPage,
      pageSize,
      folderId: overrides.folderId ?? selectedFolderId,
      accessType,
      keyword: (overrides.keyword ?? keyword).trim(),
      type: overrides.type ?? type,
      paperType,
    });
    setItems(payload);
    setPage(payload.page);
  };

  const boot = async () => {
    setLoading(true);
    try {
      await Promise.all([loadSummary(), loadFolders(), loadItems(1, { folderId: "all", keyword: "", type: "all" })]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "练习原题库加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void boot();
  }, [accessType, paperType]);

  useEffect(() => {
    setSelectedFolderId("all");
    setType("all");
    setMode("list");
    setItemForm(createEmptyItemForm(paperType));
  }, [accessType, paperType]);

  useEffect(() => {
    if (!loading && mode === "list") {
      void loadItems(1);
    }
  }, [selectedFolderId, type, accessType, paperType]);

  const refreshAll = async () => {
    setListLoading(true);
    try {
      await Promise.all([loadSummary(), loadFolders(), loadItems(page)]);
    } finally {
      setListLoading(false);
    }
  };

  const openFolderDialog = (folder?: AdminQuestionLibraryFolder | null) => {
    setFolderForm(folder ? { id: folder.id, name: folder.name, accessType: folder.accessType, paperType: folder.paperType } : { ...emptyFolderForm, accessType, paperType });
    setFolderDialogOpen(true);
  };

  const saveFolder = async () => {
    const payload = { name: folderForm.name.trim(), accessType, paperType };
    if (!payload.name) {
      toast.error("请输入文件夹名称");
      return;
    }
    setSavingFolder(true);
    try {
      if (folderForm.id) {
        await adminQuestionLibraryService.updateFolder(folderForm.id, payload);
        toast.success("文件夹已保存");
      } else {
        await adminQuestionLibraryService.createFolder(payload);
        toast.success("文件夹已创建");
      }
      setFolderDialogOpen(false);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存文件夹失败");
    } finally {
      setSavingFolder(false);
    }
  };

  const deleteFolder = async (folder: AdminQuestionLibraryFolder) => {
    if (!window.confirm(`确认删除文件夹「${folder.name}」吗？文件夹下题目、被题库引用的题和相关练习记录会一并删除。`)) return;
    setActionLoadingId(folder.id);
    try {
      await adminQuestionLibraryService.deleteFolder(folder.id);
      toast.success("文件夹已删除");
      if (selectedFolderId === folder.id) setSelectedFolderId("all");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除文件夹失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const openCreateItem = () => {
    if (folders.length === 0) {
      toast.error("请先创建题目文件夹");
      return;
    }
    setItemForm({
      ...createEmptyItemForm(paperType),
      folderId: selectedFolderId !== "all" ? selectedFolderId : folders[0].id,
      sortOrder: items.total + 1,
    });
    setMode("edit");
  };

  const openBatchImport = () => {
    if (folders.length === 0) {
      toast.error("请先创建题目文件夹");
      return;
    }
    const targetFolderId = selectedFolderId !== "all" ? selectedFolderId : folders[0].id;
    setImportFolderId(targetFolderId);
    setImportFile(null);
    setImportJson(getBatchImportTemplate(targetFolderId));
    setImportDialogOpen(true);
  };

  const submitBatchImport = async () => {
    if (!importFolderId) {
      toast.error("请选择导入到哪个文件夹");
      return;
    }
    if (!importFile && !importJson.trim()) {
      toast.error("请上传 JSON 文件或粘贴 JSON 内容");
      return;
    }
    setImportingItems(true);
    try {
      const result = await adminQuestionLibraryService.batchImportItems({
        accessType,
        paperType,
        folderId: importFolderId,
        json: importJson,
        file: importFile,
      });
      toast.success(`已导入 ${result.createdCount} 道题`);
      setImportDialogOpen(false);
      setImportFile(null);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量导入失败");
    } finally {
      setImportingItems(false);
    }
  };

  const openEditItem = async (item: AdminQuestionLibraryItem) => {
    setActionLoadingId(item.id);
    try {
      const detail = await adminQuestionLibraryService.getItem(item.id);
      setItemForm(toItemForm(detail));
      setMode("edit");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载题目失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const saveItem = async () => {
    const payload = buildItemPayload(itemForm, paperType);
    if (!payload.folderId) {
      toast.error("请选择题目文件夹");
      return;
    }
    if (!payload.stem) {
      toast.error("请输入题干");
      return;
    }
    if (!isSubjective && payload.options.length < 2) {
      toast.error("至少需要两个选项");
      return;
    }
    if (!isSubjective && payload.correctAnswer.length === 0) {
      toast.error("请选择正确答案");
      return;
    }
    if (isSubjective && (!payload.subQuestions || payload.subQuestions.length === 0)) {
      toast.error("请至少配置一个小问");
      return;
    }
    if (isSubjective && payload.subQuestions?.some((item) => !item.title && !item.prompt)) {
      toast.error("每个小问需要填写标题或题干");
      return;
    }
    if (isSubjective && payload.subQuestions?.some((item) => !item.referenceAnswer && !item.analysis)) {
      toast.error("每个小问需要填写参考答案或解析");
      return;
    }
    if (!isSubjective) {
      const optionKeys = new Set(payload.options.map((option) => option.optionKey));
      if (payload.correctAnswer.some((answer) => !optionKeys.has(answer))) {
        toast.error("正确答案必须来自当前选项");
        return;
      }
    }
    setSavingItem(true);
    try {
      if (itemForm.id) {
        await adminQuestionLibraryService.updateItem(itemForm.id, payload);
        toast.success("题目已保存");
      } else {
        await adminQuestionLibraryService.createItem(payload);
        toast.success("题目已创建");
      }
      setMode("list");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存题目失败");
    } finally {
      setSavingItem(false);
    }
  };

  const deleteItem = async (item: AdminQuestionLibraryItem) => {
    if (!window.confirm(`确认删除这道题吗？被题库引用的题和相关练习记录会一并删除。\n${item.title || item.questionNo || item.stem.slice(0, 40)}`)) return;
    setActionLoadingId(item.id);
    try {
      await adminQuestionLibraryService.deleteItem(item.id);
      toast.success("题目已删除");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除题目失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const updateOption = (index: number, patch: Partial<AdminQuestionBankOption>) => {
    setItemForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)),
    }));
  };

  const addOption = () => {
    setItemForm((current) => ({
      ...current,
      options: [...current.options, { optionKey: optionKeyAt(current.options.length), content: "", sortOrder: current.options.length }],
    }));
  };

  const removeOption = (index: number) => {
    setItemForm((current) => {
      const removedKey = current.options[index]?.optionKey;
      const options = current.options.filter((_, optionIndex) => optionIndex !== index).map((option, optionIndex) => ({ ...option, sortOrder: optionIndex }));
      return { ...current, options, correctAnswer: current.correctAnswer.filter((answer) => answer !== removedKey) };
    });
  };

  const toggleCorrectAnswer = (optionKey: string, checked: boolean) => {
    setItemForm((current) => {
      if (current.type === "single_choice") return { ...current, correctAnswer: checked ? [optionKey] : [] };
      const next = checked ? [...new Set([...current.correctAnswer, optionKey])] : current.correctAnswer.filter((answer) => answer !== optionKey);
      return { ...current, correctAnswer: next };
    });
  };

  const updateSubQuestion = (index: number, patch: Partial<AdminQuestionLibrarySubQuestion>) => {
    setItemForm((current) => ({
      ...current,
      subQuestions: (current.subQuestions ?? []).map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const addSubQuestion = () => {
    setItemForm((current) => ({
      ...current,
      subQuestions: [...(current.subQuestions ?? []), createEmptySubQuestion(current.subQuestions?.length ?? 0)],
    }));
  };

  const removeSubQuestion = (index: number) => {
    setItemForm((current) => ({
      ...current,
      subQuestions: (current.subQuestions ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const uploadLessonAudio = async (file: File | null) => {
    if (!file) return;
    setUploadingAudio(true);
    try {
      const uploaded = await adminQuestionLibraryService.uploadLessonAudio(file);
      setItemForm((current) => ({
        ...current,
        lessonAudioUrl: uploaded.url,
        lessonAudioObjectKey: uploaded.objectKey,
      }));
      toast.success("音频微课已上传");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "音频微课上传失败");
    } finally {
      setUploadingAudio(false);
    }
  };

  if (loading) return <div className="py-10 text-slate-500">{libraryLabel}加载中...</div>;

  if (mode === "edit") {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setMode("list")}>
              <ArrowLeft className="mr-2 size-4" />
              返回{libraryLabel}
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-slate-950">{itemForm.id ? "编辑题目" : "新增题目"}</h1>
              <p className="mt-1 text-sm text-slate-500">这里维护{linkedBankLabel}专用的{paperTypeLabel}原题，另一套题库不会从这里引用。</p>
            </div>
          </div>
          <Button onClick={() => void saveItem()} disabled={savingItem}>
            <Save className="mr-2 size-4" />
            {savingItem ? "保存中..." : "保存题目"}
          </Button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 border-b border-slate-100 pb-4">
                <h2 className="text-base font-semibold text-slate-900">题目内容</h2>
                <p className="mt-1 text-sm text-slate-500">保留材料、题干、解析和配套音频，后续引用不会复制成新的原题。</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>题目文件夹</Label>
                  <Select value={itemForm.folderId} onValueChange={(value) => setItemForm((current) => ({ ...current, folderId: value }))}>
                    <SelectTrigger className="border-slate-200 bg-white"><SelectValue placeholder="选择文件夹" /></SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      {folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>题型</Label>
                  <Select
                    value={itemForm.type}
                    onValueChange={(value: AdminQuestionBankItemType) =>
                      setItemForm((current) => ({
                        ...current,
                        type: value,
                        options: value === "subjective_case" ? [] : current.options.length > 0 ? current.options : defaultOptions.map((option) => ({ ...option })),
                        correctAnswer: value === "subjective_case" ? [] : value === "single_choice" ? current.correctAnswer.slice(0, 1) : current.correctAnswer,
                        subQuestions: value === "subjective_case" ? (current.subQuestions?.length ? current.subQuestions : [createEmptySubQuestion(0)]) : [],
                      }))
                    }
                  >
                    <SelectTrigger className="border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      {questionTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>标题</Label>
                  <Input className="border-slate-200 bg-white" value={itemForm.title} onChange={(event) => setItemForm((current) => ({ ...current, title: event.target.value }))} placeholder="便于后台检索" />
                </div>
                <div className="space-y-2">
                  <Label>题号</Label>
                  <Input className="border-slate-200 bg-white" value={itemForm.questionNo} onChange={(event) => setItemForm((current) => ({ ...current, questionNo: event.target.value }))} placeholder="例如 2026-民法-001" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>材料</Label>
                  <Textarea className="min-h-24 border-slate-200 bg-white" value={itemForm.material} onChange={(event) => setItemForm((current) => ({ ...current, material: event.target.value }))} placeholder="可选，案例材料或共同题干" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>题干</Label>
                  <Textarea className="min-h-36 border-slate-200 bg-white" value={itemForm.stem} onChange={(event) => setItemForm((current) => ({ ...current, stem: event.target.value }))} />
                </div>
              </div>
            </div>

            {!isSubjective ? (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">选项与答案</h2>
                    <p className="mt-1 text-sm text-slate-500">单选只能有一个正确答案，多选和不定项可以选择多个。</p>
                  </div>
                  <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={addOption}>
                    <Plus className="mr-2 size-4" />
                    添加选项
                  </Button>
                </div>
                <div className="space-y-3">
                  {itemForm.options.map((option, index) => (
                    <div key={`${option.optionKey}-${index}`} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[80px_minmax(0,1fr)_110px_auto]">
                      <Input className="border-slate-200 bg-white font-mono" value={option.optionKey} onChange={(event) => updateOption(index, { optionKey: event.target.value.toUpperCase() })} />
                      <Textarea className="min-h-12 border-slate-200 bg-white" value={option.content} onChange={(event) => updateOption(index, { content: event.target.value })} placeholder="选项内容" />
                      <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <Checkbox checked={itemForm.correctAnswer.includes(option.optionKey)} onCheckedChange={(checked) => toggleCorrectAnswer(option.optionKey, checked === true)} />
                        正确答案
                      </label>
                      <Button variant="outline" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => removeOption(index)} disabled={itemForm.options.length <= 2}>
                        删除
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-5 text-[0px] leading-none text-slate-900 shadow-sm">
                <div className="space-y-4 text-sm leading-normal">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">小问与答案解析</h2>
                      <p className="mt-1 text-sm text-slate-500">主观练习题按“一个题干，多个小问”维护，每个小问单独配置参考答案和解析。</p>
                    </div>
                    <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={addSubQuestion}>
                      <Plus className="mr-2 size-4" />
                      添加小问
                    </Button>
                  </div>
                  {(itemForm.subQuestions ?? []).map((subQuestion, subIndex) => (
                    <div key={`${subQuestion.id ?? "sub"}-${subIndex}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">第 {subIndex + 1} 问</div>
                        <Button variant="outline" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => removeSubQuestion(subIndex)} disabled={(itemForm.subQuestions?.length ?? 0) <= 1}>
                          删除
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>小问标题</Label>
                          <Input className="border-slate-200 bg-white" value={subQuestion.title} onChange={(event) => updateSubQuestion(subIndex, { title: event.target.value })} placeholder="例如 第一问" />
                        </div>
                        <div className="space-y-2">
                          <Label>作答提示</Label>
                          <Input className="border-slate-200 bg-white" value={subQuestion.placeholder ?? ""} onChange={(event) => updateSubQuestion(subIndex, { placeholder: event.target.value })} placeholder="展示给用户的输入提示" />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>小问题干</Label>
                          <Textarea className="min-h-20 border-slate-200 bg-white" value={subQuestion.prompt ?? ""} onChange={(event) => updateSubQuestion(subIndex, { prompt: event.target.value })} placeholder="这一问具体问什么" />
                        </div>
                        <div className="space-y-2">
                          <Label>参考答案</Label>
                          <Textarea className="min-h-28 border-slate-200 bg-white" value={subQuestion.referenceAnswer ?? ""} onChange={(event) => updateSubQuestion(subIndex, { referenceAnswer: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>本问解析</Label>
                          <Textarea className="min-h-28 border-slate-200 bg-white" value={subQuestion.analysis ?? ""} onChange={(event) => updateSubQuestion(subIndex, { analysis: event.target.value })} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                当前是主观练习原题，只保存题干、材料、解析和音频微课；不配置客观选项和正确答案。
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 border-b border-slate-100 pb-4">
                <h2 className="text-base font-semibold text-slate-900">解析</h2>
                <p className="mt-1 text-sm text-slate-500">用户提交答案或查看解析后才会看到解析内容。</p>
              </div>
              <Textarea className="min-h-40 border-slate-200 bg-white" value={itemForm.analysis} onChange={(event) => setItemForm((current) => ({ ...current, analysis: event.target.value }))} />
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">题目信息</h2>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>分值</Label>
                    <Input type="number" className="border-slate-200 bg-white" value={itemForm.score} onChange={(event) => setItemForm((current) => ({ ...current, score: Number(event.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>排序</Label>
                    <Input type="number" className="border-slate-200 bg-white" value={itemForm.sortOrder} onChange={(event) => setItemForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>难度</Label>
                  <Select value={`${itemForm.difficulty}`} onValueChange={(value) => setItemForm((current) => ({ ...current, difficulty: Number(value) || 2 }))}>
                    <SelectTrigger className="border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      <SelectItem value="1">基础</SelectItem>
                      <SelectItem value="2">标准</SelectItem>
                      <SelectItem value="3">较难</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>标签</Label>
                  <Input className="border-slate-200 bg-white" value={itemForm.tags} onChange={(event) => setItemForm((current) => ({ ...current, tags: event.target.value }))} placeholder="民法，合同，真题" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>年份</Label>
                    <Input className="border-slate-200 bg-white" value={itemForm.yearLabel} onChange={(event) => setItemForm((current) => ({ ...current, yearLabel: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>页码</Label>
                    <Input className="border-slate-200 bg-white" value={itemForm.pageLabel} onChange={(event) => setItemForm((current) => ({ ...current, pageLabel: event.target.value }))} />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">音频微课</h2>
                  <p className="mt-1 text-sm text-slate-500">从本地选择音频文件上传。</p>
                </div>
                <Button asChild variant="outline" className="border-slate-200 bg-white text-slate-700" disabled={uploadingAudio}>
                  <label className="cursor-pointer">
                    <Upload className="mr-2 size-4" />
                    {uploadingAudio ? "上传中..." : "上传音频"}
                    <input
                      type="file"
                      accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
                      className="hidden"
                      disabled={uploadingAudio}
                      onChange={(event) => {
                        void uploadLessonAudio(event.target.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </Button>
              </div>
              <div className="mt-4 space-y-3">
                {itemForm.lessonAudioUrl ? (
                  <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    <div className="truncate">{itemForm.lessonAudioUrl}</div>
                    {itemForm.lessonAudioObjectKey ? <div className="mt-1 truncate text-blue-500">{itemForm.lessonAudioObjectKey}</div> : null}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">暂无音频</div>
                )}
                <div className="space-y-2">
                  <Label>音频时长秒数</Label>
                  <Input type="number" className="border-slate-200 bg-white" value={itemForm.lessonAudioDurationSeconds} onChange={(event) => setItemForm((current) => ({ ...current, lessonAudioDurationSeconds: Number(event.target.value) || 0 }))} />
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{libraryLabel}</h1>
          <p className="mt-2 text-sm text-slate-500">集中维护{linkedBankLabel}引用的原始题目；这里不管理机考试卷题源，也不会和另一套题库混用。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => openFolderDialog()}>
            <FolderPlus className="mr-2 size-4" />
            新建文件夹
          </Button>
          <Button variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50" onClick={openBatchImport}>
            <Upload className="mr-2 size-4" />
            批量导入
          </Button>
          <Button onClick={openCreateItem}>
            <Plus className="mr-2 size-4" />
            新增题目
          </Button>
        </div>
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
        {[
          { label: "文件夹", value: summary?.folderCount ?? 0, icon: FolderPlus },
          { label: `${paperTypeLabel}原题`, value: summary?.itemCount ?? 0, icon: FileQuestion },
          { label: "主观题", value: summary?.subjectiveItemCount ?? 0, icon: CheckCircle2 },
          { label: "已被引用", value: summary?.referencedItemCount ?? 0, icon: CheckCircle2 },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{card.label}</p>
                <Icon className="size-4 text-blue-600" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{compactNumber(card.value)}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-base font-semibold text-slate-900">文件夹</h2>
            <p className="mt-1 text-sm text-slate-500">当前只显示{paperTypeLabel}文件夹。</p>
          </div>
          <div className="space-y-2 p-3">
            <button
              className={`w-full rounded-lg border px-3 py-3 text-left text-sm ${selectedFolderId === "all" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              onClick={() => setSelectedFolderId("all")}
            >
              <div className="font-semibold">全部文件夹</div>
              <div className="mt-1 text-xs opacity-70">{items.total} 道题</div>
            </button>
            {folders.map((folder) => (
              <div key={folder.id} className={`rounded-lg border ${selectedFolderId === folder.id ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
                <button className="w-full px-3 py-3 text-left" onClick={() => setSelectedFolderId(folder.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{folder.name}</span>
                    <span className="text-xs text-slate-500">{folder.itemCount}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{paperTypeLabel}练习原题文件夹</div>
                </button>
                <div className="flex gap-2 border-t border-slate-100 px-3 py-2">
                  <Button size="sm" variant="outline" className="h-8 flex-1 border-slate-200 bg-white text-slate-700" onClick={() => openFolderDialog(folder)}>
                    编辑
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => deleteFolder(folder)} disabled={actionLoadingId === folder.id}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
            {folders.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">暂无文件夹</div> : null}
          </div>
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">题目列表</h2>
                <p className="mt-1 text-sm text-slate-500">当前范围：{selectedFolderName}，共 {items.total} 道{paperTypeLabel}原题。</p>
              </div>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void refreshAll()} disabled={listLoading}>
                刷新
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Input className="w-72 border-slate-200 bg-white" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索题干、题号、解析" />
              <Select value={type} onValueChange={(value: AdminQuestionBankItemType | "all") => setType(value)}>
                <SelectTrigger className="w-36 border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-slate-200 bg-white text-slate-900">
                  <SelectItem value="all">全部题型</SelectItem>
                  {questionTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void loadItems(1)}>
                <Search className="mr-2 size-4" />
                查询
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">题目</th>
                  <th className="px-4 py-3">文件夹</th>
                  <th className="px-4 py-3">题型</th>
                  <th className="px-4 py-3">{isSubjective ? "类型" : "答案"}</th>
                  <th className="px-4 py-3">引用</th>
                  <th className="px-4 py-3">更新时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="max-w-[420px] px-4 py-4">
                      <p className="line-clamp-2 font-medium text-slate-950">{item.title || item.stem}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        {item.questionNo ? <span>{item.questionNo}</span> : null}
                        {item.yearLabel ? <span>{item.yearLabel}</span> : null}
                        <span>{isSubjective ? "主观作答" : `${item.optionCount} 个选项`}</span>
                        <span>难度 {difficultyLabel(item.difficulty)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{item.folderName}</td>
                    <td className="px-4 py-4">
                      <Badge variant="outline" className={typeMeta[item.type].className}>{typeMeta[item.type].label}</Badge>
                    </td>
                    <td className="px-4 py-4 font-mono text-slate-700">{isSubjective ? "无需客观答案" : item.correctAnswer.join("、") || "-"}</td>
                    <td className="px-4 py-4 text-slate-600">
                      <div>练习题库 {item.referencedCount}</div>
                      {item.examReferencedCount > 0 ? <div className="mt-1 text-xs text-amber-600">机考 {item.examReferencedCount}</div> : null}
                    </td>
                    <td className="px-4 py-4 text-slate-500">{item.updatedAt}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="border-slate-200 bg-white" onClick={() => void openEditItem(item)} disabled={actionLoadingId === item.id}>
                          <Pencil className="mr-1 size-3" />
                          编辑
                        </Button>
                        <Button size="sm" variant="outline" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => void deleteItem(item)} disabled={actionLoadingId === item.id}>
                          <Trash2 className="mr-1 size-3" />
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">暂无匹配题目</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
            <span>第 {items.page} / {items.totalPages} 页，共 {items.total} 道题</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-slate-200 bg-white" disabled={items.page <= 1} onClick={() => void loadItems(items.page - 1)}>
                上一页
              </Button>
              <Button variant="outline" size="sm" className="border-slate-200 bg-white" disabled={items.page >= items.totalPages} onClick={() => void loadItems(items.page + 1)}>
                下一页
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-xl border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>{folderForm.id ? "编辑文件夹" : "新建文件夹"}</DialogTitle>
            <DialogDescription>当前入口锁定为{paperTypeLabel}练习原题，免费练习题库和授权题库会按同类型引用。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>文件夹名称</Label>
            <Input className="border-slate-200 bg-white" value={folderForm.name} onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如 民法专项题" />
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setFolderDialogOpen(false)}>取消</Button>
            <Button onClick={() => void saveFolder()} disabled={savingFolder}>{savingFolder ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-32px)] max-w-[1180px] gap-0 overflow-hidden border border-slate-200 bg-white p-0 text-slate-900 sm:w-[calc(100vw-48px)]">
          <div className="border-b border-slate-200 px-6 py-5">
          <DialogHeader>
            <DialogTitle>批量导入{paperTypeLabel}原题</DialogTitle>
            <DialogDescription>当前入口只会导入到{libraryLabel}，不会和另一套题库混用；JSON 校验全部通过后才会入库。</DialogDescription>
          </DialogHeader>
          </div>
          <div className="grid max-h-[calc(92vh-142px)] min-h-[560px] gap-0 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4 overflow-y-auto border-r border-slate-200 bg-slate-50/70 p-6">
              <div className="space-y-2">
                <Label>目标文件夹</Label>
                <Select
                  value={importFolderId}
                  onValueChange={(value) => {
                    setImportFolderId(value);
                    if (!importFile) setImportJson(getBatchImportTemplate(value));
                  }}
                >
                  <SelectTrigger className="border-slate-200 bg-white"><SelectValue placeholder="选择文件夹" /></SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white text-slate-900">
                    {folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>上传 JSON 文件</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv,.json,application/json,text/plain"
                  className="border-slate-200 bg-white"
                  onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                />
                {importFile ? <p className="text-xs text-blue-600">将使用文件：{importFile.name}</p> : <p className="text-xs text-slate-500">不选文件时，会使用右侧粘贴的 JSON。</p>}
              </div>
              <div className="space-y-2">
                <Label>Excel 模板</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-slate-200 bg-white text-slate-700"
                  onClick={() => downloadQuestionImportTemplate(isSubjective ? "library-subjective" : "library-objective")}
                >
                  下载当前模板
                </Button>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-6 text-blue-800">
                <div>单次最多 200 道题。</div>
                <div>客观题必须有 options 和 correctAnswer。</div>
                <div>主观题不需要客观选项和答案。</div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col space-y-2 p-6">
              <div className="flex items-center justify-between gap-3">
                <Label>JSON 内容</Label>
                <Button type="button" variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700" onClick={() => setImportJson(getBatchImportTemplate())}>
                  使用当前模板
                </Button>
              </div>
              <textarea
                className="min-h-[420px] flex-1 resize-none overflow-auto whitespace-pre rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-900 outline-none focus:border-blue-300 focus:ring-3 focus:ring-blue-100"
                value={importJson}
                onChange={(event) => setImportJson(event.target.value)}
                spellCheck={false}
                wrap="off"
                placeholder="粘贴 JSON 数组或 { items: [...] }"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setImportDialogOpen(false)}>取消</Button>
            <Button onClick={() => void submitBatchImport()} disabled={importingItems}>{importingItems ? "导入中..." : "开始导入"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
