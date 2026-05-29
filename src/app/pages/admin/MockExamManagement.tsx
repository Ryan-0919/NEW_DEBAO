import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Clock,
  FileText,
  ImageUp,
  Layers3,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
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
import {
  AdminMockExamPaper,
  AdminMockExamPaperPayload,
  AdminMockExamPaperStatus,
  AdminMockExamPaperType,
  AdminMockExamQuestion,
  AdminMockExamQuestionType,
  AdminPagedResult,
  AdminMockExamSeries,
  adminContentService,
} from "../../services/adminContentService";
import {
  adminExamQuestionBankService,
  type AdminExamQuestionBankFolder,
  type AdminExamQuestionBankItem,
  type AdminExamQuestionBankItemType,
  type AdminExamQuestionBankPaperType,
} from "../../services/adminExamQuestionBankService";

type PaperForm = AdminMockExamPaperPayload & {
  id: string;
};

const sourcePageSize = 12;

const emptySourceItemPage: AdminPagedResult<AdminExamQuestionBankItem> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: sourcePageSize,
  totalPages: 1,
};

const emptyPaperForm: PaperForm = {
  id: "",
  code: "",
  seriesId: "",
  title: "",
  subtitle: "",
  coverUrl: "",
  coverObjectKey: "",
  paperType: "objective",
  year: new Date().getFullYear(),
  phase: "",
  durationMinutes: 180,
  maxAttempts: 0,
  reviewEnabled: false,
  reviewAttemptLimit: 0,
  permissionRequired: true,
  totalScore: 0,
  questionCount: 0,
  passScore: 0,
  description: "",
  status: "draft",
  openTime: "",
  sortOrder: 0,
};

const statusMeta: Record<AdminMockExamPaperStatus, { label: string; className: string }> = {
  draft: { label: "草稿", className: "border-slate-200 bg-slate-50 text-slate-700" },
  published: { label: "已发布", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
};

const paperTypeMeta: Record<AdminMockExamPaperType, { label: string; className: string }> = {
  objective: { label: "客观题", className: "border-blue-100 bg-blue-50 text-blue-700" },
  subjective: { label: "主观题", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
};

const questionTypeMeta: Record<AdminMockExamQuestionType, { label: string; className: string }> = {
  single_choice: { label: "单选", className: "border-blue-100 bg-blue-50 text-blue-700" },
  multiple_choice: { label: "多选", className: "border-violet-100 bg-violet-50 text-violet-700" },
  uncertain_choice: { label: "不定项", className: "border-cyan-100 bg-cyan-50 text-cyan-700" },
  subjective_case: { label: "主观案例", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
};

const sourceQuestionTypeOptions: Record<AdminMockExamPaperType, { value: AdminExamQuestionBankItemType | "all"; label: string }[]> = {
  objective: [
    { value: "all", label: "全部客观题" },
    { value: "single_choice", label: "单选" },
    { value: "multiple_choice", label: "多选" },
    { value: "uncertain_choice", label: "不定项" },
  ],
  subjective: [{ value: "subjective_case", label: "主观案例" }],
};

const normalizeDateTimeInput = (value = "") => value.replace(" ", "T").slice(0, 16);
const fromDateTimeInput = (value = "") => (value ? `${value.replace("T", " ")}:00`.slice(0, 19) : "");
const compactNumber = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("zh-CN");
const getQuestionTitle = (item: Pick<AdminMockExamQuestion | AdminExamQuestionBankItem, "title" | "questionNo" | "stem">) =>
  item.title || item.questionNo || item.stem || "未命名题目";
const getQuestionPreview = (value = "", length = 90) => value.replace(/\s+/g, " ").trim().slice(0, length);

const toPaperForm = (paper: AdminMockExamPaper): PaperForm => ({
  id: paper.id,
  code: paper.code,
  seriesId: paper.seriesId,
  title: paper.title,
  subtitle: paper.subtitle,
  coverUrl: paper.coverUrl,
  coverObjectKey: paper.coverObjectKey,
  paperType: paper.paperType,
  year: paper.year,
  phase: paper.phase,
  durationMinutes: paper.durationMinutes,
  maxAttempts: paper.maxAttempts,
  reviewEnabled: paper.reviewEnabled,
  reviewAttemptLimit: paper.reviewAttemptLimit,
  permissionRequired: paper.permissionRequired,
  totalScore: paper.totalScore || paper.activeTotalScore,
  questionCount: paper.questionCount || paper.activeQuestionCount,
  passScore: paper.passScore,
  description: paper.description,
  status: paper.status,
  openTime: normalizeDateTimeInput(paper.openTime),
  sortOrder: paper.sortOrder,
});

const buildPaperPayload = (form: PaperForm): AdminMockExamPaperPayload => ({
  code: form.code?.trim(),
  seriesId: form.seriesId || "",
  title: form.title.trim(),
  subtitle: form.subtitle?.trim() || "",
  coverUrl: form.coverUrl?.trim() || "",
  coverObjectKey: form.coverObjectKey?.trim() || "",
  paperType: form.paperType,
  year: form.year ? Number(form.year) : null,
  phase: form.phase?.trim() || "",
  durationMinutes: Number(form.durationMinutes) || 180,
  maxAttempts: Number(form.maxAttempts) || 0,
  reviewEnabled: Boolean(form.reviewEnabled),
  reviewAttemptLimit: Number(form.reviewAttemptLimit) || 0,
  permissionRequired: Boolean(form.permissionRequired),
  totalScore: Number(form.totalScore) || 0,
  questionCount: Number(form.questionCount) || 0,
  passScore: Number(form.passScore) || 0,
  description: form.description?.trim() || "",
  status: form.status,
  openTime: fromDateTimeInput(form.openTime || ""),
  sortOrder: Number(form.sortOrder) || 0,
});

export function MockExamManagement() {
  const [seriesList, setSeriesList] = useState<AdminMockExamSeries[]>([]);
  const [papers, setPapers] = useState<AdminMockExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [selectedSeriesId, setSelectedSeriesId] = useState("all");
  const [paperTypeFilter, setPaperTypeFilter] = useState<AdminMockExamPaperType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AdminMockExamPaperStatus | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editingPaper, setEditingPaper] = useState<AdminMockExamPaper | null>(null);
  const [paperForm, setPaperForm] = useState<PaperForm>(emptyPaperForm);
  const [savingPaper, setSavingPaper] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [seriesDialogOpen, setSeriesDialogOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<AdminMockExamSeries | null>(null);
  const [seriesForm, setSeriesForm] = useState({ name: "", description: "", sortOrder: 0 });
  const [savingSeries, setSavingSeries] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [paperQuestions, setPaperQuestions] = useState<AdminMockExamQuestion[]>([]);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionActionLoading, setQuestionActionLoading] = useState(false);
  const [sourceFolders, setSourceFolders] = useState<AdminExamQuestionBankFolder[]>([]);
  const [sourceItems, setSourceItems] = useState<AdminPagedResult<AdminExamQuestionBankItem>>(emptySourceItemPage);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceFolderId, setSourceFolderId] = useState("all");
  const [sourceType, setSourceType] = useState<AdminExamQuestionBankItemType | "all">("all");
  const [sourceKeyword, setSourceKeyword] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  const summary = useMemo(
    () => ({
      series: seriesList.length,
      papers: papers.length,
      published: papers.filter((paper) => paper.status === "published").length,
      draft: papers.filter((paper) => paper.status === "draft").length,
      subjective: papers.filter((paper) => paper.paperType === "subjective").length,
      objective: papers.filter((paper) => paper.paperType === "objective").length,
    }),
    [papers, seriesList.length],
  );

  const selectedSeries = useMemo(
    () => seriesList.find((series) => series.id === selectedSeriesId) ?? null,
    [selectedSeriesId, seriesList],
  );

  const filteredPapers = useMemo(() => {
    const currentKeyword = keyword.trim();
    return papers.filter((paper) => {
      if (selectedSeriesId === "__none__" && paper.seriesId) return false;
      if (selectedSeriesId !== "all" && selectedSeriesId !== "__none__" && paper.seriesId !== selectedSeriesId) return false;
      if (paperTypeFilter !== "all" && paper.paperType !== paperTypeFilter) return false;
      if (statusFilter !== "all" && paper.status !== statusFilter) return false;
      if (
        currentKeyword &&
        !paper.title.includes(currentKeyword) &&
        !paper.subtitle.includes(currentKeyword) &&
        !paper.code.includes(currentKeyword) &&
        !paper.seriesName.includes(currentKeyword) &&
        !paper.phase.includes(currentKeyword)
      ) {
        return false;
      }
      return true;
    });
  }, [keyword, paperTypeFilter, papers, selectedSeriesId, statusFilter]);

  const activePaperStats = editingPaper
    ? {
        questions: editingPaper.activeQuestionCount,
        score: editingPaper.activeTotalScore,
        records: editingPaper.recordCount,
        permissions: editingPaper.permissionCount,
      }
    : null;
  const paperTypeLocked = Boolean(
    editingPaper && (editingPaper.recordCount > 0 || editingPaper.permissionCount > 0 || editingPaper.leaderboardCount > 0),
  );
  const selectedSourceSet = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds]);
  const paperSourceBankItemSet = useMemo(
    () => new Set(paperQuestions.map((question) => question.sourceBankItemId).filter(Boolean)),
    [paperQuestions],
  );

  const loadData = async (initial = false) => {
    if (initial) setLoading(true);
    else setListLoading(true);
    try {
      const [seriesPayload, paperPayload] = await Promise.all([
        adminContentService.getMockExamSeries(),
        adminContentService.getMockExamPapers({ seriesId: "all", paperType: "all", status: "all" }),
      ]);
      setSeriesList(seriesPayload);
      setPapers(paperPayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载机考试卷失败");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
  }, []);

  const applyPaperQuestionsPayload = (payload: Awaited<ReturnType<typeof adminContentService.getMockExamPaperQuestions>>) => {
    setPaperQuestions(payload.questions);
    const nextPaper = payload.paper;
    if (nextPaper) {
      setEditingPaper(nextPaper);
      setPaperForm((current) => ({
        ...current,
        totalScore: nextPaper.activeTotalScore ?? nextPaper.totalScore ?? current.totalScore,
        questionCount: nextPaper.activeQuestionCount ?? nextPaper.questionCount ?? current.questionCount,
      }));
      setPapers((current) => current.map((paper) => (paper.id === nextPaper.id ? nextPaper : paper)));
    }
  };

  const resetSourcePicker = (paperType: AdminMockExamPaperType) => {
    setSourceFolderId("all");
    setSourceType(paperType === "subjective" ? "subjective_case" : "all");
    setSourceKeyword("");
    setSelectedSourceIds([]);
    setSourceItems(emptySourceItemPage);
  };

  const loadPaperQuestions = async (paperId: string) => {
    setQuestionLoading(true);
    try {
      applyPaperQuestionsPayload(await adminContentService.getMockExamPaperQuestions(paperId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载试卷题目失败");
    } finally {
      setQuestionLoading(false);
    }
  };

  const loadSourceFolders = async (paperType: AdminExamQuestionBankPaperType) => {
    try {
      setSourceFolders(await adminExamQuestionBankService.getFolders(paperType));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载机考题库文件夹失败");
      setSourceFolders([]);
    }
  };

  const loadSourceItems = async (
    page = 1,
    overrides?: Partial<{ paperType: AdminExamQuestionBankPaperType; folderId: string; type: AdminExamQuestionBankItemType | "all"; keyword: string }>,
  ) => {
    setSourceLoading(true);
    try {
      const paperType = overrides?.paperType ?? paperForm.paperType;
      setSourceItems(
        await adminExamQuestionBankService.getItems({
          paperType,
          page,
          pageSize: sourcePageSize,
          folderId: overrides?.folderId ?? sourceFolderId,
          type: overrides?.type ?? sourceType,
          keyword: (overrides?.keyword ?? sourceKeyword).trim(),
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载机考题库题目失败");
    } finally {
      setSourceLoading(false);
    }
  };

  const openSeriesDialog = (series?: AdminMockExamSeries | null) => {
    setEditingSeries(series ?? null);
    setSeriesForm({
      name: series?.name ?? "",
      description: series?.description ?? "",
      sortOrder: series?.sortOrder ?? seriesList.length,
    });
    setSeriesDialogOpen(true);
  };

  const saveSeries = async () => {
    if (!seriesForm.name.trim()) {
      toast.error("请输入套卷名称");
      return;
    }

    setSavingSeries(true);
    try {
      const payload = {
        name: seriesForm.name.trim(),
        description: seriesForm.description.trim(),
        sortOrder: Number(seriesForm.sortOrder) || 0,
      };
      if (editingSeries) {
        await adminContentService.updateMockExamSeries(editingSeries.id, payload);
        toast.success("套卷已更新");
      } else {
        await adminContentService.createMockExamSeries(payload);
        toast.success("套卷已创建");
      }
      setSeriesDialogOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存套卷失败");
    } finally {
      setSavingSeries(false);
    }
  };

  const deleteSeries = async (series: AdminMockExamSeries) => {
    if (!window.confirm(`确认删除套卷「${series.name}」？`)) return;
    setActionLoadingId(`series:${series.id}`);
    try {
      await adminContentService.deleteMockExamSeries(series.id);
      toast.success("套卷已删除");
      if (selectedSeriesId === series.id) setSelectedSeriesId("all");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除套卷失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const moveSeries = async (series: AdminMockExamSeries, direction: -1 | 1) => {
    const currentIndex = seriesList.findIndex((item) => item.id === series.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= seriesList.length) return;
    const nextList = [...seriesList];
    const [item] = nextList.splice(currentIndex, 1);
    nextList.splice(nextIndex, 0, item);
    setSeriesList(nextList.map((entry, index) => ({ ...entry, sortOrder: index })));
    try {
      await adminContentService.updateMockExamSeriesOrder(nextList.map((entry, index) => ({ id: entry.id, sortOrder: index })));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新套卷顺序失败");
      await loadData();
    }
  };

  const openCreatePaper = () => {
    setEditingPaper(null);
    setPaperForm({
      ...emptyPaperForm,
      seriesId: selectedSeriesId !== "all" && selectedSeriesId !== "__none__" ? selectedSeriesId : "",
      sortOrder: filteredPapers.length,
    });
    setPaperQuestions([]);
    setSourceFolders([]);
    resetSourcePicker("objective");
    setMode("edit");
  };

  const openEditPaper = (paper: AdminMockExamPaper) => {
    setEditingPaper(paper);
    setPaperForm(toPaperForm(paper));
    resetSourcePicker(paper.paperType);
    void loadPaperQuestions(paper.id);
    void loadSourceFolders(paper.paperType);
    void loadSourceItems(1, {
      paperType: paper.paperType,
      folderId: "all",
      type: paper.paperType === "subjective" ? "subjective_case" : "all",
      keyword: "",
    });
    setMode("edit");
  };

  const closePaperEditor = () => {
    setMode("list");
    setEditingPaper(null);
    setPaperForm(emptyPaperForm);
    setPaperQuestions([]);
    setSourceFolders([]);
    setSourceItems(emptySourceItemPage);
    setSelectedSourceIds([]);
  };

  const uploadPaperCover = async (file?: File | null) => {
    if (!file) return;
    setCoverUploading(true);
    try {
      const uploaded = await adminContentService.uploadMockExamCover(file);
      setPaperForm((current) => ({
        ...current,
        coverUrl: uploaded.url,
        coverObjectKey: uploaded.objectKey,
      }));
      toast.success("试卷封面已上传，保存后生效");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传试卷封面失败");
    } finally {
      setCoverUploading(false);
    }
  };

  const changePaperType = (value: AdminMockExamPaperType) => {
    setPaperForm((current) => ({
      ...current,
      paperType: value,
      reviewEnabled: value === "subjective" ? current.reviewEnabled || true : false,
    }));
    resetSourcePicker(value);
    setSourceFolders([]);
    if (editingPaper) {
      void loadSourceFolders(value);
      void loadSourceItems(1, { paperType: value, folderId: "all", type: value === "subjective" ? "subjective_case" : "all", keyword: "" });
    }
  };

  const toggleSourceSelected = (itemId: string, checked: boolean) => {
    setSelectedSourceIds((current) => {
      if (checked) return current.includes(itemId) ? current : [...current, itemId];
      return current.filter((id) => id !== itemId);
    });
  };

  const toggleCurrentSourcePage = () => {
    const visibleIds = sourceItems.items.filter((item) => !paperSourceBankItemSet.has(item.id)).map((item) => item.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSourceSet.has(id));
    setSelectedSourceIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return [...new Set([...current, ...visibleIds])];
    });
  };

  const importSelectedQuestions = async () => {
    if (!editingPaper) {
      toast.error("请先保存试卷，再引用机考题库题目");
      return;
    }
    if (selectedSourceIds.length === 0) {
      toast.error("请选择要引用的题目");
      return;
    }

    setQuestionActionLoading(true);
    try {
      const payload = await adminContentService.importMockExamQuestionsFromBank(editingPaper.id, selectedSourceIds);
      applyPaperQuestionsPayload(payload);
      setSelectedSourceIds([]);
      toast.success(payload.importedCount ? `已引用 ${payload.importedCount} 道题` : "所选题目已在当前试卷中");
      await loadData();
      await loadSourceItems(sourceItems.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "引用题目失败");
    } finally {
      setQuestionActionLoading(false);
    }
  };

  const movePaperQuestion = async (question: AdminMockExamQuestion, direction: -1 | 1) => {
    if (!editingPaper) return;
    const currentIndex = paperQuestions.findIndex((item) => item.id === question.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= paperQuestions.length) return;

    const nextQuestions = [...paperQuestions];
    const [item] = nextQuestions.splice(currentIndex, 1);
    nextQuestions.splice(nextIndex, 0, item);
    const sorted = nextQuestions.map((entry, index) => ({ ...entry, sortOrder: index }));
    setPaperQuestions(sorted);

    setQuestionActionLoading(true);
    try {
      applyPaperQuestionsPayload(
        await adminContentService.updateMockExamQuestionOrder(
          editingPaper.id,
          sorted.map((entry, index) => ({ id: entry.id, sortOrder: index })),
        ),
      );
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新试题顺序失败");
      await loadPaperQuestions(editingPaper.id);
    } finally {
      setQuestionActionLoading(false);
    }
  };

  const removePaperQuestion = async (question: AdminMockExamQuestion) => {
    if (!editingPaper) return;
    if (!window.confirm(`确认从当前试卷移除「${getQuestionTitle(question)}」？题库原题不会被删除。`)) return;

    setQuestionActionLoading(true);
    try {
      applyPaperQuestionsPayload(await adminContentService.deleteMockExamQuestion(editingPaper.id, question.id));
      toast.success("题目已从试卷移除");
      await loadData();
      await loadSourceItems(sourceItems.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除题目失败");
    } finally {
      setQuestionActionLoading(false);
    }
  };

  const savePaper = async () => {
    if (!paperForm.title.trim()) {
      toast.error("请输入试卷名称");
      return;
    }
    if (!editingPaper && !paperForm.code?.trim()) {
      toast.error("请输入试卷编码");
      return;
    }

    setSavingPaper(true);
    try {
      const payload = buildPaperPayload(paperForm);
      if (editingPaper) {
        const updated = await adminContentService.updateMockExamPaper(editingPaper.id, payload);
        setEditingPaper(updated);
        setPaperForm(toPaperForm(updated));
        setPapers((current) => current.map((paper) => (paper.id === updated.id ? updated : paper)));
        toast.success("试卷已更新");
      } else {
        const created = await adminContentService.createMockExamPaper(payload);
        setEditingPaper(created);
        setPaperForm(toPaperForm(created));
        setPaperQuestions([]);
        resetSourcePicker(created.paperType);
        void loadSourceFolders(created.paperType);
        void loadSourceItems(1, { paperType: created.paperType, folderId: "all", type: created.paperType === "subjective" ? "subjective_case" : "all", keyword: "" });
        toast.success("试卷已创建，可以继续引用题库题目");
      }
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存试卷失败");
    } finally {
      setSavingPaper(false);
    }
  };

  const archivePaper = async (paper: AdminMockExamPaper) => {
    const message = paper.recordCount > 0 || paper.permissionCount > 0
      ? `「${paper.title}」已有用户数据，操作后会安全下架为草稿。确认继续？`
      : `确认删除试卷「${paper.title}」？`;
    if (!window.confirm(message)) return;
    setActionLoadingId(`paper:${paper.id}`);
    try {
      await adminContentService.deleteMockExamPaper(paper.id);
      toast.success(paper.recordCount > 0 || paper.permissionCount > 0 ? "试卷已安全下架" : "试卷已删除");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "处理试卷失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const togglePaperStatus = async (paper: AdminMockExamPaper) => {
    setActionLoadingId(`status:${paper.id}`);
    try {
      if (paper.status === "published") {
        if (!window.confirm(`确认收回试卷「${paper.title}」吗？\n收回后学生端将看不到这张试卷，也不能通过考试记录入口打开；已有数据不会删除。`)) {
          setActionLoadingId("");
          return;
        }
        await adminContentService.recallMockExamPaper(paper.id);
        toast.success("试卷已收回，学生端不可见");
      } else {
        await adminContentService.updateMockExamPaper(paper.id, {
          ...buildPaperPayload(toPaperForm(paper)),
          status: "published",
        });
        toast.success("试卷已发布");
      }
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新发布状态失败");
    } finally {
      setActionLoadingId("");
    }
  };

  const movePaper = async (paper: AdminMockExamPaper, direction: -1 | 1) => {
    const scopedPapers = filteredPapers;
    const currentIndex = scopedPapers.findIndex((item) => item.id === paper.id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= scopedPapers.length) return;
    const nextScoped = [...scopedPapers];
    const [item] = nextScoped.splice(currentIndex, 1);
    nextScoped.splice(nextIndex, 0, item);
    const nextPaperMap = new Map(nextScoped.map((entry, index) => [entry.id, index]));
    setPapers((current) =>
      current.map((entry) => (nextPaperMap.has(entry.id) ? { ...entry, sortOrder: nextPaperMap.get(entry.id) ?? entry.sortOrder } : entry)),
    );

    try {
      await adminContentService.updateMockExamPaperOrder(nextScoped.map((entry, index) => ({ id: entry.id, sortOrder: index })));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新试卷顺序失败");
      await loadData();
    }
  };

  if (mode === "edit") {
    return (
      <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={closePaperEditor}>
                <ArrowLeft className="size-4" />
                返回列表
              </Button>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">{editingPaper ? "编辑试卷" : "新建试卷"}</h2>
                  <p className="mt-1 text-sm text-slate-500">{editingPaper?.code ?? (paperForm.code || "草稿试卷")}</p>
              </div>
            </div>
            <Button onClick={() => void savePaper()} disabled={savingPaper}>
              <Save className="size-4" />
              {savingPaper ? "保存中" : "保存试卷"}
            </Button>
          </div>

          {activePaperStats ? (
            <div className="grid gap-3 md:grid-cols-4">
              {[
                { label: "有效题目", value: compactNumber(activePaperStats.questions), icon: FileText },
                { label: "题目总分", value: compactNumber(activePaperStats.score), icon: CheckCircle2 },
                { label: "考试记录", value: compactNumber(activePaperStats.records), icon: Clock },
                { label: "单卷授权", value: compactNumber(activePaperStats.permissions), icon: ShieldCheck },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-500">{item.label}</p>
                      <Icon className="size-4 text-slate-400" />
                    </div>
                    <p className="mt-3 text-2xl font-semibold text-slate-950">{item.value}</p>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <h3 className="text-base font-semibold text-slate-950">基础信息</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>试卷编码</Label>
                    <Input
                      value={paperForm.code}
                      disabled={Boolean(editingPaper)}
                      onChange={(event) => setPaperForm((current) => ({ ...current, code: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>所属套卷</Label>
                    <Select value={paperForm.seriesId || "__none__"} onValueChange={(value) => setPaperForm((current) => ({ ...current, seriesId: value === "__none__" ? "" : value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">未分组</SelectItem>
                        {seriesList.map((series) => (
                          <SelectItem key={series.id} value={series.id}>
                            {series.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>试卷名称</Label>
                    <Input value={paperForm.title} onChange={(event) => setPaperForm((current) => ({ ...current, title: event.target.value }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>副标题</Label>
                    <Input value={paperForm.subtitle} onChange={(event) => setPaperForm((current) => ({ ...current, subtitle: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>试卷类型</Label>
                    <Select value={paperForm.paperType} disabled={paperTypeLocked} onValueChange={(value: AdminMockExamPaperType) => changePaperType(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="objective">客观题模考</SelectItem>
                        <SelectItem value="subjective">主观题批改</SelectItem>
                      </SelectContent>
                    </Select>
                    {paperTypeLocked ? <p className="text-xs text-amber-600">已有考试记录、授权或排行榜配置，不能切换客观/主观类型。</p> : null}
                  </div>
                  <div className="space-y-2">
                    <Label>发布状态</Label>
                    <Select value={paperForm.status} onValueChange={(value: AdminMockExamPaperStatus) => setPaperForm((current) => ({ ...current, status: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">草稿</SelectItem>
                        <SelectItem value="published">发布</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>年份</Label>
                    <Input
                      type="number"
                      value={paperForm.year ?? ""}
                      onChange={(event) => setPaperForm((current) => ({ ...current, year: event.target.value ? Number(event.target.value) : null }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>阶段</Label>
                    <Input value={paperForm.phase} onChange={(event) => setPaperForm((current) => ({ ...current, phase: event.target.value }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>简介</Label>
                    <Textarea rows={4} value={paperForm.description} onChange={(event) => setPaperForm((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-950">封面与展示</h3>
                  <Button asChild variant="outline" className="border-slate-200 bg-white text-slate-700">
                    <label className="cursor-pointer">
                      <ImageUp className="mr-2 size-4" />
                      {coverUploading ? "上传中..." : "上传封面"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={coverUploading}
                        onChange={(event) => {
                          void uploadPaperCover(event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </Button>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {paperForm.coverUrl ? (
                      <img src={paperForm.coverUrl} alt={paperForm.title || "试卷封面"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">暂无封面</div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>封面 URL</Label>
                      <Input value={paperForm.coverUrl} onChange={(event) => setPaperForm((current) => ({ ...current, coverUrl: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>封面 ObjectKey</Label>
                      <Input value={paperForm.coverObjectKey} onChange={(event) => setPaperForm((current) => ({ ...current, coverObjectKey: event.target.value }))} />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">试题组卷</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      从{paperForm.paperType === "objective" ? "客观机考题库" : "主观机考题库"}引用题目，引用后会同步试卷题量和总分。
                    </p>
                  </div>
                  <Badge variant="outline" className={paperTypeMeta[paperForm.paperType].className}>
                    {paperTypeMeta[paperForm.paperType].label}
                  </Badge>
                </div>

                {!editingPaper ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-500">先保存试卷，再从机考题库引用题目。</div>
                ) : (
                  <div className="grid min-h-[560px] gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
                    <div className="min-w-0 border-b border-slate-200 p-5 xl:border-b-0 xl:border-r">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-slate-500">
                          当前 <span className="font-semibold text-slate-900">{paperQuestions.length}</span> 道题，
                          <span className="font-semibold text-slate-900">{paperQuestions.reduce((sum, question) => sum + Number(question.score ?? 0), 0)}</span> 分
                        </div>
                        <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700" onClick={() => void loadPaperQuestions(editingPaper.id)} disabled={questionLoading}>
                          刷新题目
                        </Button>
                      </div>

                      <div className="max-h-[640px] space-y-3 overflow-y-auto pr-1">
                        {questionLoading ? (
                          <div className="rounded-lg border border-slate-200 py-16 text-center text-sm text-slate-500">正在加载试卷题目...</div>
                        ) : paperQuestions.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">
                            这张试卷还没有题目，请从右侧机考题库引用。
                          </div>
                        ) : (
                          paperQuestions.map((question, index) => {
                            const meta = questionTypeMeta[question.type];
                            return (
                              <div key={question.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline" className={meta.className}>
                                        {meta.label}
                                      </Badge>
                                      <span className="text-xs text-slate-400">第 {index + 1} 题</span>
                                      <span className="text-xs font-medium text-slate-600">{question.score} 分</span>
                                      {question.sourceFolderName ? <span className="text-xs text-slate-400">来自 {question.sourceFolderName}</span> : null}
                                    </div>
                                    <h4 className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-950">{getQuestionTitle(question)}</h4>
                                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{getQuestionPreview(question.material || question.stem || question.analysis) || "暂无题干预览"}</p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => void movePaperQuestion(question, -1)} disabled={index === 0 || questionActionLoading}>
                                      <ArrowUp className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => void movePaperQuestion(question, 1)} disabled={index === paperQuestions.length - 1 || questionActionLoading}>
                                      <ArrowDown className="size-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                      onClick={() => void removePaperQuestion(question)}
                                      disabled={questionActionLoading}
                                    >
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <aside className="min-w-0 bg-white p-5">
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                          <div className="space-y-2">
                            <Label>题库文件夹</Label>
                            <Select
                              value={sourceFolderId}
                              onValueChange={(value) => {
                                setSourceFolderId(value);
                                setSelectedSourceIds([]);
                                void loadSourceItems(1, { folderId: value });
                              }}
                            >
                              <SelectTrigger className="border-slate-200 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-slate-200 bg-white text-slate-900">
                                <SelectItem value="all">全部文件夹</SelectItem>
                                {sourceFolders.map((folder) => (
                                  <SelectItem key={folder.id} value={folder.id}>
                                    {folder.name}（{folder.itemCount}）
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>题型</Label>
                            <Select
                              value={sourceType}
                              onValueChange={(value: AdminExamQuestionBankItemType | "all") => {
                                setSourceType(value);
                                setSelectedSourceIds([]);
                                void loadSourceItems(1, { type: value });
                              }}
                            >
                              <SelectTrigger className="border-slate-200 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-slate-200 bg-white text-slate-900">
                                {sourceQuestionTypeOptions[paperForm.paperType].map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Input
                            className="border-slate-200 bg-white"
                            value={sourceKeyword}
                            onChange={(event) => setSourceKeyword(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void loadSourceItems(1);
                            }}
                            placeholder="搜索题号、题干、解析"
                          />
                          <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void loadSourceItems(1)} disabled={sourceLoading}>
                            <Search className="size-4" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-800">
                          <span>
                            已选 <span className="font-semibold">{selectedSourceIds.length}</span> 道
                          </span>
                          <Button variant="outline" size="sm" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-100" onClick={toggleCurrentSourcePage} disabled={sourceItems.items.length === 0}>
                            {sourceItems.items.filter((item) => !paperSourceBankItemSet.has(item.id)).every((item) => selectedSourceSet.has(item.id)) && sourceItems.items.some((item) => !paperSourceBankItemSet.has(item.id))
                              ? "取消本页"
                              : "选择本页"}
                          </Button>
                        </div>

                        <div className="max-h-[460px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
                          {sourceLoading ? (
                            <div className="py-16 text-center text-sm text-slate-500">正在加载题库题目...</div>
                          ) : sourceItems.items.length === 0 ? (
                            <div className="py-16 text-center text-sm text-slate-500">暂无可选题目</div>
                          ) : (
                            sourceItems.items.map((item) => {
                              const alreadyUsed = paperSourceBankItemSet.has(item.id);
                              const meta = questionTypeMeta[item.type];
                              return (
                                <label
                                  key={item.id}
                                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                                    alreadyUsed ? "border-slate-100 bg-slate-50 text-slate-400" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/50"
                                  }`}
                                >
                                  <Checkbox
                                    checked={alreadyUsed || selectedSourceSet.has(item.id)}
                                    disabled={alreadyUsed}
                                    onCheckedChange={(checked) => toggleSourceSelected(item.id, checked === true)}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline" className={meta.className}>
                                        {meta.label}
                                      </Badge>
                                      <span className="text-xs">{item.score} 分</span>
                                      {alreadyUsed ? <span className="text-xs text-emerald-600">已引用</span> : null}
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-slate-900">{getQuestionTitle(item)}</p>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{getQuestionPreview(item.material || item.stem || item.analysis) || "暂无题干预览"}</p>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                                      <span>{item.folderName || "未分组"}</span>
                                      {item.questionNo ? <span>题号 {item.questionNo}</span> : null}
                                      {item.type === "subjective_case" ? <span>{item.subQuestions.length} 个小问</span> : <span>{item.optionCount} 个选项</span>}
                                    </div>
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                          <span>
                            第 {sourceItems.page} / {sourceItems.totalPages} 页，共 {sourceItems.total} 道
                          </span>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="border-slate-200 bg-white" disabled={sourceItems.page <= 1 || sourceLoading} onClick={() => void loadSourceItems(sourceItems.page - 1)}>
                              上一页
                            </Button>
                            <Button variant="outline" size="sm" className="border-slate-200 bg-white" disabled={sourceItems.page >= sourceItems.totalPages || sourceLoading} onClick={() => void loadSourceItems(sourceItems.page + 1)}>
                              下一页
                            </Button>
                          </div>
                        </div>

                        <Button className="w-full" onClick={() => void importSelectedQuestions()} disabled={selectedSourceIds.length === 0 || questionActionLoading}>
                          {questionActionLoading ? "引用中..." : `引用选中 ${selectedSourceIds.length} 道题`}
                        </Button>
                      </div>
                    </aside>
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <h3 className="text-base font-semibold text-slate-950">考试规则</h3>
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>考试时长</Label>
                      <Input
                        type="number"
                        min={1}
                        value={paperForm.durationMinutes}
                        onChange={(event) => setPaperForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>显示题量</Label>
                      <Input
                        type="number"
                        min={0}
                        value={paperForm.questionCount}
                        onChange={(event) => setPaperForm((current) => ({ ...current, questionCount: Number(event.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>总分</Label>
                      <Input
                        type="number"
                        min={0}
                        value={paperForm.totalScore}
                        onChange={(event) => setPaperForm((current) => ({ ...current, totalScore: Number(event.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>及格分</Label>
                      <Input
                        type="number"
                        min={0}
                        value={paperForm.passScore}
                        onChange={(event) => setPaperForm((current) => ({ ...current, passScore: Number(event.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>排序</Label>
                      <Input
                        type="number"
                        value={paperForm.sortOrder}
                        onChange={(event) => setPaperForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>开放时间</Label>
                      <Input
                        type="datetime-local"
                        value={paperForm.openTime || ""}
                        onChange={(event) => setPaperForm((current) => ({ ...current, openTime: event.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <h3 className="text-base font-semibold text-slate-950">权限与批改</h3>
                <div className="mt-5 space-y-4">
                  <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
                    <span>
                      <span className="block text-sm font-medium text-slate-900">需要授权</span>
                      <span className="mt-1 block text-xs text-slate-500">关闭后所有登录用户可见</span>
                    </span>
                    <Switch checked={paperForm.permissionRequired} onCheckedChange={(checked) => setPaperForm((current) => ({ ...current, permissionRequired: checked }))} />
                  </label>
                  <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
                    <span>
                      <span className="block text-sm font-medium text-slate-900">主观批改</span>
                      <span className="mt-1 block text-xs text-slate-500">仅主观题试卷生效</span>
                    </span>
                    <Switch
                      checked={paperForm.reviewEnabled}
                      disabled={paperForm.paperType !== "subjective"}
                      onCheckedChange={(checked) => setPaperForm((current) => ({ ...current, reviewEnabled: checked }))}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>考试次数限制</Label>
                      <Input
                        type="number"
                        min={0}
                        value={paperForm.maxAttempts}
                        onChange={(event) => setPaperForm((current) => ({ ...current, maxAttempts: Number(event.target.value) }))}
                      />
                      <p className="text-xs text-slate-500">0 表示不限考试次数</p>
                    </div>
                    <div className="space-y-2">
                      <Label>批改次数限制</Label>
                      <Input
                        type="number"
                        min={0}
                        value={paperForm.reviewAttemptLimit}
                        disabled={paperForm.paperType !== "subjective"}
                        onChange={(event) => setPaperForm((current) => ({ ...current, reviewAttemptLimit: Number(event.target.value) }))}
                      />
                      <p className="text-xs text-slate-500">{paperForm.paperType === "subjective" ? "0 表示不限批改次数" : "仅主观题试卷生效"}</p>
                    </div>
                  </div>
                </div>
              </section>

              {paperForm.status === "published" ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p>发布后会进入用户端列表。空题、客观卷含主观题、主观卷没有主观题都会被服务端拦截。</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-6">
          {[
            { label: "套卷", value: summary.series, icon: Layers3 },
            { label: "试卷", value: summary.papers, icon: FileText },
            { label: "已发布", value: summary.published, icon: CheckCircle2 },
            { label: "草稿", value: summary.draft, icon: Pencil },
            { label: "客观卷", value: summary.objective, icon: ShieldCheck },
            { label: "主观卷", value: summary.subjective, icon: FileText },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <Icon className="size-4 text-slate-400" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-slate-950">{compactNumber(item.value)}</p>
              </div>
            );
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-950">套卷</h3>
                <p className="mt-1 text-sm text-slate-500">按套卷维护学生入口</p>
              </div>
              <Button size="sm" onClick={() => openSeriesDialog()}>
                <Plus className="size-4" />
                新建
              </Button>
            </div>
            <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-auto p-3">
              <button
                type="button"
                onClick={() => setSelectedSeriesId("all")}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${
                  selectedSeriesId === "all" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-transparent text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="font-medium">全部套卷</div>
                <div className="mt-1 text-xs text-slate-500">{papers.length} 张试卷</div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSeriesId("__none__")}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${
                  selectedSeriesId === "__none__" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-transparent text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="font-medium">未分组试卷</div>
                <div className="mt-1 text-xs text-slate-500">{papers.filter((paper) => !paper.seriesId).length} 张试卷</div>
              </button>

              {seriesList.map((series, index) => (
                <div
                  key={series.id}
                  className={`rounded-lg border ${
                    selectedSeriesId === series.id ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <button type="button" onClick={() => setSelectedSeriesId(series.id)} className="w-full px-4 py-3 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{series.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{series.description || "无描述"}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 bg-slate-100 text-slate-600">
                        {series.paperCount}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">授权 {series.permissionCount} 人</p>
                  </button>
                  <div className="flex items-center gap-1 border-t border-slate-100 px-3 py-2">
                    <Button variant="ghost" size="sm" onClick={() => void moveSeries(series, -1)} disabled={index === 0}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void moveSeries(series, 1)} disabled={index === seriesList.length - 1}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openSeriesDialog(series)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      disabled={actionLoadingId === `series:${series.id}`}
                      onClick={() => void deleteSeries(series)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{selectedSeries?.name ?? (selectedSeriesId === "__none__" ? "未分组试卷" : "全部试卷")}</h3>
                  <p className="mt-1 text-sm text-slate-500">{filteredPapers.length} 张试卷</p>
                </div>
                <Button onClick={openCreatePaper}>
                  <Plus className="size-4" />
                  新建试卷
                </Button>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_160px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索名称、编码、阶段" />
                </div>
                <Select value={paperTypeFilter} onValueChange={(value: AdminMockExamPaperType | "all") => setPaperTypeFilter(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    <SelectItem value="objective">客观题</SelectItem>
                    <SelectItem value="subjective">主观题</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(value: AdminMockExamPaperStatus | "all") => setStatusFilter(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="published">已发布</SelectItem>
                    <SelectItem value="draft">草稿</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {loading || listLoading ? (
                <div className="px-5 py-16 text-center text-sm text-slate-500">正在加载机考试卷...</div>
              ) : filteredPapers.length === 0 ? (
                <div className="px-5 py-16 text-center text-sm text-slate-500">暂无试卷</div>
              ) : (
                filteredPapers.map((paper, index) => (
                  <div key={paper.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_240px_260px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={paperTypeMeta[paper.paperType].className}>
                          {paperTypeMeta[paper.paperType].label}
                        </Badge>
                        <Badge variant="outline" className={statusMeta[paper.status].className}>
                          {statusMeta[paper.status].label}
                        </Badge>
                        {paper.permissionRequired ? (
                          <Badge variant="outline" className="border-violet-100 bg-violet-50 text-violet-700">
                            需授权
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                            公开
                          </Badge>
                        )}
                        {paper.activeQuestionCount === 0 ? (
                          <Badge variant="outline" className="border-amber-100 bg-amber-50 text-amber-700">
                            无题目
                          </Badge>
                        ) : null}
                      </div>
                      <h4 className="mt-3 truncate text-base font-semibold text-slate-950">{paper.title}</h4>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{paper.subtitle || paper.description || "无简介"}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{paper.seriesName || "未分组"}</span>
                        <span>{paper.code}</span>
                        <span>{paper.year ? `${paper.year} 年` : "未设年份"}</span>
                        <span>{paper.phase || "未设阶段"}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center xl:grid-cols-2">
                      {[
                        { label: "题目", value: paper.activeQuestionCount || paper.questionCount },
                        { label: "总分", value: paper.activeTotalScore || paper.totalScore },
                        { label: "时长", value: `${paper.durationMinutes}分` },
                        { label: "记录", value: paper.recordCount },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg bg-slate-50 px-3 py-2">
                          <div className="text-xs text-slate-400">{item.label}</div>
                          <div className="mt-1 text-sm font-semibold text-slate-800">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => void movePaper(paper, -1)} disabled={index === 0}>
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void movePaper(paper, 1)} disabled={index === filteredPapers.length - 1}>
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEditPaper(paper)}>
                        <Pencil className="size-4" />
                        编辑
                      </Button>
                      <Button
                        variant={paper.status === "published" ? "secondary" : "outline"}
                        size="sm"
                        disabled={actionLoadingId === `status:${paper.id}`}
                        onClick={() => void togglePaperStatus(paper)}
                      >
                        {paper.status === "published" ? "收回" : "发布"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        disabled={actionLoadingId === `paper:${paper.id}`}
                        onClick={() => void archivePaper(paper)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={seriesDialogOpen} onOpenChange={setSeriesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSeries ? "编辑套卷" : "新建套卷"}</DialogTitle>
            <DialogDescription>套卷会作为学生端试卷列表的第一层入口。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>套卷名称</Label>
              <Input value={seriesForm.name} onChange={(event) => setSeriesForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea rows={4} value={seriesForm.description} onChange={(event) => setSeriesForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>排序</Label>
              <Input
                type="number"
                value={seriesForm.sortOrder}
                onChange={(event) => setSeriesForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeriesDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void saveSeries()} disabled={savingSeries}>
              {savingSeries ? "保存中" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
