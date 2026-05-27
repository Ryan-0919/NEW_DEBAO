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
import type { AdminQuestionBankOption } from "../../services/adminQuestionBankService";
import {
  adminExamQuestionBankService,
  type AdminExamQuestionBankFolder,
  type AdminExamQuestionBankFolderPayload,
  type AdminExamQuestionBankItem,
  type AdminExamQuestionBankItemPayload,
  type AdminExamQuestionBankItemType,
  type AdminExamQuestionBankPaperType,
  type AdminExamQuestionBankSummary,
  type AdminExamQuestionSubQuestion,
} from "../../services/adminExamQuestionBankService";

type ViewMode = "list" | "edit";
type FolderForm = AdminExamQuestionBankFolderPayload & { id: string };
type ItemForm = Omit<AdminExamQuestionBankItemPayload, "tags"> & { id: string; tags: string };

const pageSize = 20;
const optionKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const optionKeyAt = (index: number) => optionKeys[index] ?? String.fromCharCode(65 + index);

const emptyItemPage: AdminPagedResult<AdminExamQuestionBankItem> = {
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

const typeMeta: Record<AdminExamQuestionBankItemType, { label: string; className: string }> = {
  single_choice: { label: "单选", className: "border-blue-100 bg-blue-50 text-blue-700" },
  multiple_choice: { label: "多选", className: "border-violet-100 bg-violet-50 text-violet-700" },
  uncertain_choice: { label: "不定项", className: "border-cyan-100 bg-cyan-50 text-cyan-700" },
  subjective_case: { label: "主观案例", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
};

const configByType = {
  objective: {
    title: "客观机考题库",
    description: "管理客观模考使用的选择题题源；客观机考试卷发布时从这里引用题目。",
    folderText: "客观题文件夹",
    itemText: "客观机考题",
    itemCountText: "客观机考题总数",
    listTitle: "客观机考题列表",
    emptyText: "暂无客观机考题，请先新建文件夹，再新增客观机考题。",
    createText: "新增客观机考题",
  },
  subjective: {
    title: "主观机考题库",
    description: "管理主观批改机考的题源、小问、参考答案和批改说明；批改中心只处理学员提交后的批改记录。",
    folderText: "主观题文件夹",
    itemText: "主观机考案例题",
    itemCountText: "主观机考题总数",
    listTitle: "主观机考题列表",
    emptyText: "暂无主观机考题，请先新建文件夹，再新增主观机考案例题。",
    createText: "新增主观机考题",
  },
} satisfies Record<AdminExamQuestionBankPaperType, Record<string, string>>;

const compactNumber = (value: number | undefined | null) => Number(value ?? 0).toLocaleString("zh-CN");
const difficultyLabel = (value: number) => (Number(value) <= 1 ? "基础" : Number(value) >= 3 ? "较难" : "标准");
const splitTags = (value = "") => value.split(/[,\n，、；;]/).map((item) => item.trim()).filter(Boolean);
const splitKeywords = (value = "") => splitTags(value);
const joinKeywords = (value: string[] | undefined) => (Array.isArray(value) ? value.join("，") : "");

const createEmptySubQuestion = (index = 0): AdminExamQuestionSubQuestion => ({
  id: `sub_${index + 1}`,
  title: "",
  placeholder: "请在此输入本问答案。",
  abilityLabel: "",
  referenceAnswer: "",
  rubricGuidance: "",
  rubricPoints: [],
  sortOrder: index + 1,
});

const createEmptyItemForm = (paperType: AdminExamQuestionBankPaperType): ItemForm => ({
  id: "",
  folderId: "",
  paperType,
  title: "",
  questionNo: "",
  yearLabel: "",
  pageLabel: "",
  sectionLabel: paperType === "subjective" ? "案例分析题" : "",
  sectionDescription: "",
  tags: "",
  difficulty: 2,
  type: paperType === "subjective" ? "subjective_case" : "single_choice",
  stem: "",
  material: "",
  analysis: "",
  lessonAudioUrl: "",
  lessonAudioObjectKey: "",
  lessonAudioDurationSeconds: 0,
  score: paperType === "subjective" ? 20 : 2,
  sortOrder: 0,
  correctAnswer: [],
  options: paperType === "subjective" ? [] : defaultOptions.map((option) => ({ ...option })),
  subQuestions: paperType === "subjective" ? [createEmptySubQuestion(0)] : [],
});

const toItemForm = (item: AdminExamQuestionBankItem): ItemForm => ({
  id: item.id,
  folderId: item.folderId,
  paperType: item.paperType,
  title: item.title,
  questionNo: item.questionNo,
  yearLabel: item.yearLabel,
  pageLabel: item.pageLabel,
  sectionLabel: item.sectionLabel,
  sectionDescription: item.sectionDescription,
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
  options: item.options.length > 0 ? item.options.map((option, index) => ({ ...option, sortOrder: index })) : defaultOptions.map((option) => ({ ...option })),
  subQuestions: item.subQuestions.length > 0 ? item.subQuestions : item.paperType === "subjective" ? [createEmptySubQuestion(0)] : [],
});

const normalizeSubQuestions = (items: AdminExamQuestionSubQuestion[] = []) =>
  items
    .map((item, index) => ({
      ...item,
      id: item.id || `sub_${index + 1}`,
      title: `${item.title ?? ""}`.trim(),
      placeholder: `${item.placeholder ?? ""}`.trim() || "请在此输入本问答案。",
      abilityLabel: `${item.abilityLabel ?? ""}`.trim(),
      referenceAnswer: `${item.referenceAnswer ?? ""}`.trim(),
      rubricGuidance: `${item.rubricGuidance ?? ""}`.trim(),
      rubricPoints: (item.rubricPoints ?? [])
        .map((point, pointIndex) => ({
          ...point,
          id: point.id || `point_${pointIndex + 1}`,
          title: `${point.title ?? ""}`.trim(),
          description: `${point.description ?? ""}`.trim(),
          keywords: splitKeywords(Array.isArray(point.keywords) ? point.keywords.join("，") : `${point.keywords ?? ""}`),
          abilityLabel: `${point.abilityLabel ?? ""}`.trim(),
          referenceAnswer: `${point.referenceAnswer ?? ""}`.trim(),
          rubricGuidance: `${point.rubricGuidance ?? ""}`.trim(),
          score: Number(point.score) || 0,
          sortOrder: pointIndex + 1,
        }))
        .filter((point) => point.title),
      sortOrder: index + 1,
    }))
    .filter((item) => item.title);

const buildItemPayload = (form: ItemForm): AdminExamQuestionBankItemPayload => {
  const isSubjective = form.paperType === "subjective";
  return {
    folderId: form.folderId,
    paperType: form.paperType,
    title: form.title.trim(),
    questionNo: form.questionNo.trim(),
    yearLabel: form.yearLabel.trim(),
    pageLabel: form.pageLabel.trim(),
    sectionLabel: form.sectionLabel?.trim() || "",
    sectionDescription: form.sectionDescription?.trim() || "",
    tags: splitTags(form.tags),
    difficulty: Number(form.difficulty) || 2,
    type: isSubjective ? "subjective_case" : form.type,
    stem: form.stem.trim(),
    material: form.material?.trim() || "",
    analysis: form.analysis?.trim() || "",
    lessonAudioUrl: form.lessonAudioUrl?.trim() || "",
    lessonAudioObjectKey: form.lessonAudioObjectKey?.trim() || "",
    lessonAudioDurationSeconds: Number(form.lessonAudioDurationSeconds) || 0,
    score: Number(form.score) || (isSubjective ? 20 : 2),
    sortOrder: Number(form.sortOrder) || 0,
    correctAnswer: isSubjective ? [] : form.correctAnswer,
    options: isSubjective
      ? []
      : (form.options ?? [])
          .map((option, index) => ({
            optionKey: `${option.optionKey || optionKeyAt(index)}`.trim().toUpperCase(),
            content: option.content.trim(),
            sortOrder: index,
          }))
          .filter((option) => option.optionKey && option.content),
    subQuestions: isSubjective ? normalizeSubQuestions(form.subQuestions) : [],
  };
};

export function ExamQuestionBankManagement({ paperType }: { paperType: AdminExamQuestionBankPaperType }) {
  const pageConfig = configByType[paperType];
  const [mode, setMode] = useState<ViewMode>("list");
  const [summary, setSummary] = useState<AdminExamQuestionBankSummary | null>(null);
  const [folders, setFolders] = useState<AdminExamQuestionBankFolder[]>([]);
  const [items, setItems] = useState<AdminPagedResult<AdminExamQuestionBankItem>>(emptyItemPage);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<AdminExamQuestionBankItemType | "all">(paperType === "subjective" ? "subjective_case" : "all");
  const [page, setPage] = useState(1);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderForm, setFolderForm] = useState<FolderForm>({ id: "", name: "", paperType });
  const [savingFolder, setSavingFolder] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(createEmptyItemForm(paperType));
  const [savingItem, setSavingItem] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFolderId, setImportFolderId] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingItems, setImportingItems] = useState(false);

  const selectedFolderName = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId)?.name ?? "全部文件夹",
    [folders, selectedFolderId],
  );

  const getBatchImportTemplate = (folderId = importFolderId) =>
    JSON.stringify(
      {
        paperType,
        folderId: folderId || "先在弹窗里选择目标文件夹",
        items:
          paperType === "subjective"
            ? [
                {
                  title: "2024 主观题案例分析",
                  questionNo: "案例一",
                  yearLabel: "2024",
                  sectionLabel: "案例分析题",
                  sectionDescription: "本题含 2 个小问。",
                  difficulty: 2,
                  type: "主观题",
                  stem: "这里填写主观机考题干。",
                  material: "这里填写主观机考材料，可保留换行。",
                  analysis: "这里填写整题解析。",
                  score: 38,
                  subQuestions: [
                    {
                      title: "第一问",
                      placeholder: "请在此输入第一问答案。",
                      abilityLabel: "法律分析",
                      referenceAnswer: "这里填写第一问参考答案。",
                      rubricGuidance: "这里填写老师批改说明。",
                      rubricPoints: [
                        {
                          title: "遗漏点 1",
                          score: 4,
                          description: "这里填写遗漏点说明。",
                          keywords: ["关键词一", "关键词二"],
                        },
                      ],
                    },
                  ],
                },
              ]
            : [
                {
                  title: "2024 客观题单选",
                  questionNo: "1",
                  yearLabel: "2024",
                  sectionLabel: "单项选择题",
                  difficulty: 2,
                  type: "单选",
                  stem: "这里填写客观机考题干。",
                  material: "这里填写材料，可为空。",
                  analysis: "这里填写解析。",
                  score: 1,
                  correctAnswer: ["A"],
                  options: [
                    { optionKey: "A", content: "选项 A" },
                    { optionKey: "B", content: "选项 B" },
                    { optionKey: "C", content: "选项 C" },
                    { optionKey: "D", content: "选项 D" },
                  ],
                },
                {
                  title: "2024 客观题多选",
                  questionNo: "2",
                  yearLabel: "2024",
                  sectionLabel: "多项选择题",
                  difficulty: 2,
                  type: "多选",
                  stem: "这里填写客观机考多选题干。",
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
                  title: "2024 客观题不定项",
                  questionNo: "3",
                  yearLabel: "2024",
                  sectionLabel: "不定项选择题",
                  difficulty: 2,
                  type: "不定项",
                  stem: "这里填写客观机考不定项题干。",
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

  const loadSummary = async () => setSummary(await adminExamQuestionBankService.getSummary(paperType));
  const loadFolders = async () => {
    const folderList = await adminExamQuestionBankService.getFolders(paperType);
    setFolders(folderList);
    return folderList;
  };
  const loadItems = async (
    nextPage = page,
    overrides: Partial<{ folderId: string; keyword: string; type: AdminExamQuestionBankItemType | "all" }> = {},
  ) => {
    const payload = await adminExamQuestionBankService.getItems({
      page: nextPage,
      pageSize,
      folderId: overrides.folderId ?? selectedFolderId,
      keyword: (overrides.keyword ?? keyword).trim(),
      type: paperType === "subjective" ? "subjective_case" : overrides.type ?? type,
      paperType,
    });
    setItems(payload);
    setPage(payload.page);
  };

  const boot = async () => {
    setLoading(true);
    try {
      await Promise.all([loadSummary(), loadFolders(), loadItems(1, { folderId: "all", keyword: "", type: paperType === "subjective" ? "subjective_case" : "all" })]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${pageConfig.title}加载失败`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMode("list");
    setSelectedFolderId("all");
    setKeyword("");
    setType(paperType === "subjective" ? "subjective_case" : "all");
    setItemForm(createEmptyItemForm(paperType));
    void boot();
  }, [paperType]);

  useEffect(() => {
    if (!loading && mode === "list") void loadItems(1);
  }, [selectedFolderId, type]);

  const refreshAll = async () => {
    setListLoading(true);
    try {
      await Promise.all([loadSummary(), loadFolders(), loadItems(page)]);
    } finally {
      setListLoading(false);
    }
  };

  const openFolderDialog = (folder?: AdminExamQuestionBankFolder | null) => {
    setFolderForm(folder ? { id: folder.id, name: folder.name, paperType: folder.paperType } : { id: "", name: "", paperType });
    setFolderDialogOpen(true);
  };

  const saveFolder = async () => {
    const payload = { name: folderForm.name.trim(), paperType };
    if (!payload.name) {
      toast.error("请输入文件夹名称");
      return;
    }
    setSavingFolder(true);
    try {
      if (folderForm.id) {
        await adminExamQuestionBankService.updateFolder(folderForm.id, payload);
        toast.success("文件夹已保存");
      } else {
        await adminExamQuestionBankService.createFolder(payload);
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

  const deleteFolder = async (folder: AdminExamQuestionBankFolder) => {
    if (!window.confirm(`确认删除文件夹「${folder.name}」吗？文件夹下题目会一并删除，已引用到试卷的题会断开来源引用。`)) return;
    setActionLoadingId(folder.id);
    try {
      await adminExamQuestionBankService.deleteFolder(folder.id, paperType);
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
      const result = await adminExamQuestionBankService.batchImportItems({
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

  const openEditItem = async (item: AdminExamQuestionBankItem) => {
    setActionLoadingId(item.id);
    try {
      const detail = await adminExamQuestionBankService.getItem(item.id, paperType);
      if (detail.paperType !== paperType) {
        toast.error("题目类型与当前入口不一致");
        return;
      }
      setItemForm(toItemForm(detail));
      setMode("edit");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载题目失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const saveItem = async () => {
    const payload = buildItemPayload(itemForm);
    if (!payload.folderId) {
      toast.error("请选择题目文件夹");
      return;
    }
    if (!payload.stem) {
      toast.error("请输入题干");
      return;
    }
    if (paperType === "objective" && (!payload.options || payload.options.length < 2)) {
      toast.error("客观题至少需要两个选项");
      return;
    }
    if (paperType === "objective" && (!payload.correctAnswer || payload.correctAnswer.length === 0)) {
      toast.error("请选择正确答案");
      return;
    }
    if (paperType === "objective") {
      const optionKeys = new Set((payload.options ?? []).map((option) => option.optionKey));
      if ((payload.correctAnswer ?? []).some((answer) => !optionKeys.has(answer))) {
        toast.error("正确答案必须来自当前选项");
        return;
      }
    }
    if (paperType === "subjective" && (!payload.subQuestions || payload.subQuestions.length === 0)) {
      toast.error("主观题至少需要一个小问");
      return;
    }
    setSavingItem(true);
    try {
      if (itemForm.id) {
        await adminExamQuestionBankService.updateItem(itemForm.id, payload);
        toast.success("题目已保存");
      } else {
        await adminExamQuestionBankService.createItem(payload);
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

  const deleteItem = async (item: AdminExamQuestionBankItem) => {
    if (!window.confirm(`确认删除这道题吗？已引用到机考试卷的题会断开来源引用。\n${item.title || item.questionNo || item.stem.slice(0, 40)}`)) return;
    setActionLoadingId(item.id);
    try {
      await adminExamQuestionBankService.deleteItem(item.id, paperType);
      toast.success("题目已删除");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除题目失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const uploadLessonAudio = async (file: File | null) => {
    if (!file) return;
    setUploadingAudio(true);
    try {
      const uploaded = await adminExamQuestionBankService.uploadLessonAudio(file);
      setItemForm((current) => ({
        ...current,
        lessonAudioUrl: uploaded.url,
        lessonAudioObjectKey: uploaded.objectKey,
      }));
      toast.success("配套音频已上传");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "配套音频上传失败");
    } finally {
      setUploadingAudio(false);
    }
  };

  const updateOption = (index: number, patch: Partial<AdminQuestionBankOption>) => {
    setItemForm((current) => {
      const oldKey = current.options?.[index]?.optionKey;
      const nextKey = patch.optionKey?.trim().toUpperCase();
      return {
        ...current,
        options: (current.options ?? []).map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch, optionKey: nextKey ?? option.optionKey } : option)),
        correctAnswer:
          oldKey && nextKey && oldKey !== nextKey
            ? (current.correctAnswer ?? []).map((answer) => (answer === oldKey ? nextKey : answer))
            : current.correctAnswer,
      };
    });
  };

  const addOption = () => {
    setItemForm((current) => ({
      ...current,
      options: [...(current.options ?? []), { optionKey: optionKeyAt(current.options?.length ?? 0), content: "", sortOrder: current.options?.length ?? 0 }],
    }));
  };

  const removeOption = (index: number) => {
    setItemForm((current) => {
      const removedKey = current.options?.[index]?.optionKey;
      const options = (current.options ?? []).filter((_, optionIndex) => optionIndex !== index).map((option, optionIndex) => ({ ...option, sortOrder: optionIndex }));
      return { ...current, options, correctAnswer: (current.correctAnswer ?? []).filter((answer) => answer !== removedKey) };
    });
  };

  const toggleCorrectAnswer = (optionKey: string, checked: boolean) => {
    setItemForm((current) => {
      if (current.type === "single_choice") return { ...current, correctAnswer: checked ? [optionKey] : [] };
      const currentAnswers = current.correctAnswer ?? [];
      const next = checked ? [...new Set([...currentAnswers, optionKey])] : currentAnswers.filter((answer) => answer !== optionKey);
      return { ...current, correctAnswer: next };
    });
  };

  const updateSubQuestion = (index: number, patch: Partial<AdminExamQuestionSubQuestion>) => {
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

  const updateRubric = (subIndex: number, pointIndex: number, patch: Partial<NonNullable<AdminExamQuestionSubQuestion["rubricPoints"]>[number]> & { keywordText?: string }) => {
    const { keywordText, ...pointPatch } = patch;
    setItemForm((current) => ({
      ...current,
      subQuestions: (current.subQuestions ?? []).map((subQuestion, currentSubIndex) => {
        if (currentSubIndex !== subIndex) return subQuestion;
        const points = subQuestion.rubricPoints ?? [];
        return {
          ...subQuestion,
          rubricPoints: points.map((point, currentPointIndex) =>
            currentPointIndex === pointIndex
              ? { ...point, ...pointPatch, keywords: keywordText !== undefined ? splitKeywords(keywordText) : point.keywords }
              : point,
          ),
        };
      }),
    }));
  };

  const addRubric = (subIndex: number) => {
    setItemForm((current) => ({
      ...current,
      subQuestions: (current.subQuestions ?? []).map((subQuestion, currentSubIndex) => {
        if (currentSubIndex !== subIndex) return subQuestion;
        const nextIndex = subQuestion.rubricPoints?.length ?? 0;
        return {
          ...subQuestion,
          rubricPoints: [
            ...(subQuestion.rubricPoints ?? []),
            { id: `point_${nextIndex + 1}`, title: "", score: 0, description: "", keywords: [], sortOrder: nextIndex + 1 },
          ],
        };
      }),
    }));
  };

  const removeRubric = (subIndex: number, pointIndex: number) => {
    setItemForm((current) => ({
      ...current,
      subQuestions: (current.subQuestions ?? []).map((subQuestion, currentSubIndex) =>
        currentSubIndex === subIndex
          ? { ...subQuestion, rubricPoints: (subQuestion.rubricPoints ?? []).filter((_, currentPointIndex) => currentPointIndex !== pointIndex) }
          : subQuestion,
      ),
    }));
  };

  if (loading) return <div className="py-10 text-slate-500">{pageConfig.title}加载中...</div>;

  if (mode === "edit") {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setMode("list")}>
              <ArrowLeft className="mr-2 size-4" />
              返回{pageConfig.title}
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-slate-950">{itemForm.id ? `编辑${pageConfig.itemText}` : pageConfig.createText}</h1>
              <p className="mt-1 text-sm text-slate-500">字段参考旧得宝机考题库；当前入口已锁定为{paperType === "objective" ? "客观" : "主观"}题。</p>
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
                <p className="mt-1 text-sm text-slate-500">保留材料、题干、解析、配套音频和机考显示信息。</p>
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
                {paperType === "objective" ? (
                  <div className="space-y-2">
                    <Label>题型</Label>
                    <Select
                      value={itemForm.type}
                      onValueChange={(value: AdminExamQuestionBankItemType) =>
                        setItemForm((current) => ({ ...current, type: value, correctAnswer: value === "single_choice" ? current.correctAnswer?.slice(0, 1) : current.correctAnswer }))
                      }
                    >
                      <SelectTrigger className="border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-slate-200 bg-white text-slate-900">
                        <SelectItem value="single_choice">单选题</SelectItem>
                        <SelectItem value="multiple_choice">多选题</SelectItem>
                        <SelectItem value="uncertain_choice">不定项选择题</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>题型</Label>
                    <div className="flex min-h-10 items-center rounded-md border border-emerald-100 bg-emerald-50 px-3 text-sm font-medium text-emerald-700">
                      主观案例题
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>标题</Label>
                  <Input className="border-slate-200 bg-white" value={itemForm.title} onChange={(event) => setItemForm((current) => ({ ...current, title: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>题号</Label>
                  <Input className="border-slate-200 bg-white" value={itemForm.questionNo} onChange={(event) => setItemForm((current) => ({ ...current, questionNo: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>栏目名称</Label>
                  <Input className="border-slate-200 bg-white" value={itemForm.sectionLabel} onChange={(event) => setItemForm((current) => ({ ...current, sectionLabel: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>栏目说明</Label>
                  <Input className="border-slate-200 bg-white" value={itemForm.sectionDescription} onChange={(event) => setItemForm((current) => ({ ...current, sectionDescription: event.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>材料</Label>
                  <Textarea className="min-h-28 border-slate-200 bg-white" value={itemForm.material} onChange={(event) => setItemForm((current) => ({ ...current, material: event.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>题干</Label>
                  <Textarea className="min-h-40 border-slate-200 bg-white" value={itemForm.stem} onChange={(event) => setItemForm((current) => ({ ...current, stem: event.target.value }))} />
                </div>
              </div>
            </div>

            {paperType === "objective" ? (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">选项与答案</h2>
                    <p className="mt-1 text-sm text-slate-500">客观机考题会按这里的选项和正确答案判分。</p>
                  </div>
                  <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={addOption}>
                    <Plus className="mr-2 size-4" />
                    添加选项
                  </Button>
                </div>
                <div className="space-y-3">
                  {(itemForm.options ?? []).map((option, index) => (
                    <div key={`${option.optionKey}-${index}`} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[80px_minmax(0,1fr)_110px_auto]">
                      <Input className="border-slate-200 bg-white font-mono" value={option.optionKey} onChange={(event) => updateOption(index, { optionKey: event.target.value.toUpperCase() })} />
                      <Textarea className="min-h-12 border-slate-200 bg-white" value={option.content} onChange={(event) => updateOption(index, { content: event.target.value })} placeholder="选项内容" />
                      <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <Checkbox checked={(itemForm.correctAnswer ?? []).includes(option.optionKey)} onCheckedChange={(checked) => toggleCorrectAnswer(option.optionKey, checked === true)} />
                        正确答案
                      </label>
                      <Button variant="outline" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => removeOption(index)} disabled={(itemForm.options?.length ?? 0) <= 2}>
                        删除
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">小问与批改说明</h2>
                    <p className="mt-1 text-sm text-slate-500">主观机考会按小问切换作答，批改中心会读取参考答案和批改说明。</p>
                  </div>
                  <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={addSubQuestion}>
                    <Plus className="mr-2 size-4" />
                    添加小问
                  </Button>
                </div>
                <div className="space-y-4">
                  {(itemForm.subQuestions ?? []).map((subQuestion, subIndex) => (
                    <div key={`${subQuestion.id}-${subIndex}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                            <div className="space-y-2">
                              <Label>小问题干</Label>
                              <Textarea className="min-h-20 border-slate-200 bg-white" value={subQuestion.title} onChange={(event) => updateSubQuestion(subIndex, { title: event.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>能力标签</Label>
                              <Input className="border-slate-200 bg-white" value={subQuestion.abilityLabel ?? ""} onChange={(event) => updateSubQuestion(subIndex, { abilityLabel: event.target.value })} />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>参考答案</Label>
                            <Textarea className="min-h-24 border-slate-200 bg-white" value={subQuestion.referenceAnswer ?? ""} onChange={(event) => updateSubQuestion(subIndex, { referenceAnswer: event.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>批改说明</Label>
                            <Textarea className="min-h-20 border-slate-200 bg-white" value={subQuestion.rubricGuidance ?? ""} onChange={(event) => updateSubQuestion(subIndex, { rubricGuidance: event.target.value })} />
                          </div>
                          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-3">
                              <Label>采分点</Label>
                              <Button type="button" variant="outline" size="sm" className="border-slate-200 bg-white" onClick={() => addRubric(subIndex)}>
                                <Plus className="mr-1 size-3" />
                                添加
                              </Button>
                            </div>
                            {(subQuestion.rubricPoints ?? []).map((point, pointIndex) => (
                              <div key={`${point.id}-${pointIndex}`} className="grid gap-2 rounded-md border border-slate-100 bg-slate-50 p-3 md:grid-cols-[minmax(0,1fr)_90px_auto]">
                                <Input className="border-slate-200 bg-white" value={point.title} onChange={(event) => updateRubric(subIndex, pointIndex, { title: event.target.value })} placeholder="采分点标题" />
                                <Input className="border-slate-200 bg-white" type="number" value={point.score ?? 0} onChange={(event) => updateRubric(subIndex, pointIndex, { score: Number(event.target.value) || 0 })} />
                                <Button variant="outline" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => removeRubric(subIndex, pointIndex)}>
                                  删除
                                </Button>
                                <Input className="border-slate-200 bg-white md:col-span-3" value={joinKeywords(point.keywords)} onChange={(event) => updateRubric(subIndex, pointIndex, { keywordText: event.target.value })} placeholder="关键词，用逗号分隔" />
                                <Textarea className="min-h-16 border-slate-200 bg-white md:col-span-3" value={point.description ?? ""} onChange={(event) => updateRubric(subIndex, pointIndex, { description: event.target.value })} placeholder="说明" />
                              </div>
                            ))}
                            {(subQuestion.rubricPoints ?? []).length === 0 ? <div className="py-4 text-center text-sm text-slate-400">暂无采分点</div> : null}
                          </div>
                        </div>
                        <Button variant="outline" className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => removeSubQuestion(subIndex)} disabled={(itemForm.subQuestions?.length ?? 0) <= 1}>
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 border-b border-slate-100 pb-4">
                <h2 className="text-base font-semibold text-slate-900">解析</h2>
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
                  <Input className="border-slate-200 bg-white" value={itemForm.tags} onChange={(event) => setItemForm((current) => ({ ...current, tags: event.target.value }))} />
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
                  <h2 className="text-base font-semibold text-slate-900">配套音频</h2>
                  <p className="mt-1 text-sm text-slate-500">从本地选择音频文件上传，保存后用于机考页音频播放。</p>
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
          <h1 className="text-2xl font-semibold text-slate-900">{pageConfig.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{pageConfig.description}</p>
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
            {pageConfig.createText}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: "文件夹", value: summary?.folderCount ?? 0, icon: FolderPlus },
          { label: pageConfig.itemCountText, value: summary?.itemCount ?? 0, icon: FileQuestion },
          { label: "已被试卷引用", value: summary?.referencedItemCount ?? 0, icon: CheckCircle2 },
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
            <p className="mt-1 text-sm text-slate-500">{pageConfig.folderText}只显示当前入口的题目。</p>
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
                  <div className="mt-1 text-xs text-slate-400">{pageConfig.folderText}</div>
                </button>
                <div className="flex gap-2 border-t border-slate-100 px-3 py-2">
                  <Button size="sm" variant="outline" className="h-8 flex-1 border-slate-200 bg-white text-slate-700" onClick={() => openFolderDialog(folder)}>
                    编辑
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 border-rose-200 bg-white text-rose-600 hover:bg-rose-50" onClick={() => void deleteFolder(folder)} disabled={actionLoadingId === folder.id}>
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
                <h2 className="text-base font-semibold text-slate-900">{pageConfig.listTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">当前范围：{selectedFolderName}，共 {items.total} 道{pageConfig.itemText}。</p>
              </div>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void refreshAll()} disabled={listLoading}>
                刷新
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Input className="w-72 border-slate-200 bg-white" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索题干、题号、解析" />
              {paperType === "objective" ? (
                <Select value={type} onValueChange={(value: AdminExamQuestionBankItemType | "all") => setType(value)}>
                  <SelectTrigger className="w-36 border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white text-slate-900">
                    <SelectItem value="all">全部题型</SelectItem>
                    <SelectItem value="single_choice">单选</SelectItem>
                    <SelectItem value="multiple_choice">多选</SelectItem>
                    <SelectItem value="uncertain_choice">不定项</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
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
                  <th className="px-4 py-3">{paperType === "objective" ? "答案" : "小问"}</th>
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
                        <span>分值 {item.score}</span>
                        <span>难度 {difficultyLabel(item.difficulty)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{item.folderName}</td>
                    <td className="px-4 py-4">
                      <Badge variant="outline" className={typeMeta[item.type].className}>{typeMeta[item.type].label}</Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {paperType === "objective" ? <span className="font-mono">{item.correctAnswer.join("、") || "-"}</span> : `${item.subQuestions.length} 个小问`}
                    </td>
                    <td className="px-4 py-4 text-slate-600">已引用 {item.examReferencedCount} 次</td>
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
                    <td colSpan={7} className="py-16 text-center text-slate-500">{pageConfig.emptyText}</td>
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
            <DialogDescription>当前入口锁定为{paperType === "objective" ? "客观机考题库" : "主观机考题库"}，文件夹类型不能切换。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>文件夹名称</Label>
            <Input className="border-slate-200 bg-white" value={folderForm.name} onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setFolderDialogOpen(false)}>取消</Button>
            <Button onClick={() => void saveFolder()} disabled={savingFolder}>{savingFolder ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-4xl border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>批量导入{pageConfig.itemText}</DialogTitle>
            <DialogDescription>当前入口锁定为{pageConfig.title}，客观机考和主观机考使用不同 JSON 格式；全部校验通过后才会入库。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-4">
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
                  onClick={() => downloadQuestionImportTemplate(paperType === "subjective" ? "exam-subjective" : "exam-objective")}
                >
                  下载当前模板
                </Button>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-6 text-blue-800">
                <div>单次最多 200 道题。</div>
                <div>客观机考题必须有 options 和 correctAnswer。</div>
                <div>主观机考题建议填写 subQuestions、referenceAnswer 和 rubricGuidance。</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>JSON 内容</Label>
                <Button type="button" variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700" onClick={() => setImportJson(getBatchImportTemplate())}>
                  使用当前模板
                </Button>
              </div>
              <Textarea
                className="min-h-[460px] border-slate-200 bg-white font-mono text-xs leading-5"
                value={importJson}
                onChange={(event) => setImportJson(event.target.value)}
                placeholder="粘贴 JSON 数组或 { items: [...] }"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setImportDialogOpen(false)}>取消</Button>
            <Button onClick={() => void submitBatchImport()} disabled={importingItems}>{importingItems ? "导入中..." : "开始导入"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
