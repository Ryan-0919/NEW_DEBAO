import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Download, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import type { AdminPagedResult } from "../../services/adminContentService";
import { adminLawService, type AdminLawRecord } from "../../services/adminLawService";
import {
  adminLawPracticeService,
  type AdminLawPracticeFolder,
  type AdminLawPracticeFolderPayload,
  type AdminLawPracticePaper,
  type AdminLawPracticePaperPayload,
  type AdminLawPracticePaperQuestion,
  type AdminLawPracticePaperQuestionsPayload,
  type AdminLawPracticePaperStatus,
  type AdminLawPracticeQuestion,
  type AdminLawPracticeQuestionPayload,
} from "../../services/adminLawPracticeService";

type QuestionForm = Omit<AdminLawPracticeQuestionPayload, "tags" | "sourceLawId"> & {
  id: string;
  folderId: string;
  sourceLawId: string;
  tags: string;
  isActive: boolean;
};

type FolderForm = AdminLawPracticeFolderPayload & {
  id: string;
};

type PaperForm = AdminLawPracticePaperPayload & {
  id: string;
};

const emptyQuestionPage: AdminPagedResult<AdminLawPracticeQuestion> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const emptyLawSearchPage: AdminPagedResult<AdminLawRecord> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

const emptyQuestionForm: QuestionForm = {
  id: "",
  folderId: "",
  title: "",
  prompt: "",
  lawName: "",
  articleNo: "",
  sourceLawId: "",
  standardText: "",
  explanation: "",
  tags: "",
  sortOrder: 0,
  isActive: true,
};

const emptyFolderForm: FolderForm = {
  id: "",
  name: "",
  description: "",
  sortOrder: 0,
  isActive: true,
};

const emptyPaperForm: PaperForm = {
  id: "",
  code: "",
  title: "",
  description: "",
  status: "draft",
  sortOrder: 0,
};

const emptyPaperDetail: AdminLawPracticePaperQuestionsPayload = {
  paper: {
    id: "",
    code: "",
    title: "",
    description: "",
    status: "draft",
    sortOrder: 0,
    questionCount: 0,
    recordCount: 0,
    createdAt: "",
    updatedAt: "",
  },
  questions: [],
  availableQuestions: [],
};

const statusMeta: Record<AdminLawPracticePaperStatus, { label: string; className: string }> = {
  draft: { label: "草稿", className: "border-slate-200 bg-slate-50 text-slate-600" },
  published: { label: "已发布", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
};

const toQuestionForm = (question: AdminLawPracticeQuestion): QuestionForm => ({
  id: question.id,
  folderId: question.folderId ?? "",
  title: question.title,
  prompt: question.prompt,
  lawName: question.lawName,
  articleNo: question.articleNo,
  sourceLawId: question.sourceLawId ? `${question.sourceLawId}` : "",
  standardText: question.standardText,
  explanation: question.explanation,
  tags: question.tags.join("，"),
  sortOrder: question.sortOrder,
  isActive: question.isActive,
});

const toPaperForm = (paper: AdminLawPracticePaper): PaperForm => ({
  id: paper.id,
  code: paper.code,
  title: paper.title,
  description: paper.description,
  status: paper.status,
  sortOrder: paper.sortOrder,
});

const buildQuestionPayload = (form: QuestionForm): AdminLawPracticeQuestionPayload => ({
  folderId: form.folderId || null,
  title: form.title.trim(),
  prompt: form.prompt.trim(),
  lawName: form.lawName.trim(),
  articleNo: form.articleNo.trim(),
  sourceLawId: Number(form.sourceLawId) > 0 ? Number(form.sourceLawId) : null,
  standardText: form.standardText.trim(),
  explanation: `${form.explanation ?? ""}`.trim(),
  tags: form.tags,
  sortOrder: Number(form.sortOrder) || 0,
  isActive: form.isActive,
});

const toFolderForm = (folder: AdminLawPracticeFolder): FolderForm => ({
  id: folder.id,
  name: folder.name,
  description: folder.description,
  sortOrder: folder.sortOrder,
  isActive: folder.isActive,
});

const buildFolderPayload = (form: FolderForm): AdminLawPracticeFolderPayload => ({
  name: form.name.trim(),
  description: `${form.description ?? ""}`.trim(),
  sortOrder: Number(form.sortOrder) || 0,
  isActive: form.isActive,
});

const buildPaperPayload = (form: PaperForm): AdminLawPracticePaperPayload => ({
  code: form.code.trim(),
  title: form.title.trim(),
  description: `${form.description ?? ""}`.trim(),
  status: form.status,
  sortOrder: Number(form.sortOrder) || 0,
});

const moveItem = <T,>(items: T[], from: number, to: number) => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (!item) return items;
  next.splice(to, 0, item);
  return next;
};

const lawPracticeImportTemplateRows = [
  ["法条源ID", "题目标题", "题目要求", "法律名称", "条文序号", "标准条文原文", "解析说明", "标签", "排序", "是否启用"],
  [
    "",
    "刑诉法独立行使审判权",
    "请快速定位《刑事诉讼法》关于人民法院、人民检察院依法独立行使审判权/检察权的条文。写出条文序号，并将条文原文抄录到答题框中。",
    "刑事诉讼法",
    "第五条",
    "",
    "可填写定位思路或易错提醒。",
    "刑诉，法条定位",
    "0",
    "是",
  ],
];

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

const downloadLawPracticeImportTemplate = () => {
  const csv = lawPracticeImportTemplateRows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "法条练习题目导入模板.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

type LawPracticeManagementProps = {
  mode?: "all" | "library" | "papers";
};

export function LawPracticeManagement({ mode = "all" }: LawPracticeManagementProps = {}) {
  const showLibrary = mode !== "papers";
  const showPapers = mode !== "library";
  const [folders, setFolders] = useState<AdminLawPracticeFolder[]>([]);
  const [questions, setQuestions] = useState<AdminPagedResult<AdminLawPracticeQuestion>>(emptyQuestionPage);
  const [papers, setPapers] = useState<AdminLawPracticePaper[]>([]);
  const [paperDetail, setPaperDetail] = useState<AdminLawPracticePaperQuestionsPayload>(emptyPaperDetail);
  const [questionForm, setQuestionForm] = useState<QuestionForm>(emptyQuestionForm);
  const [folderForm, setFolderForm] = useState<FolderForm>(emptyFolderForm);
  const [paperForm, setPaperForm] = useState<PaperForm>(emptyPaperForm);
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [questionPage, setQuestionPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [savingPaper, setSavingPaper] = useState(false);
  const [addingQuestions, setAddingQuestions] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importJson, setImportJson] = useState("");
  const [importingQuestions, setImportingQuestions] = useState(false);
  const [lawSelectorOpen, setLawSelectorOpen] = useState(false);
  const [lawSearchKeyword, setLawSearchKeyword] = useState("");
  const [lawSearchPage, setLawSearchPage] = useState<AdminPagedResult<AdminLawRecord>>(emptyLawSearchPage);
  const [lawSearching, setLawSearching] = useState(false);
  const [selectingLawSourceId, setSelectingLawSourceId] = useState<number | null>(null);
  const [lawSelectorTargetQuestion, setLawSelectorTargetQuestion] = useState<AdminLawPracticeQuestion | null>(null);

  const currentFolder = useMemo(() => folders.find((folder) => folder.id === selectedFolderId) ?? null, [folders, selectedFolderId]);
  const selectedPaper = useMemo(() => papers.find((paper) => paper.id === selectedPaperId) ?? null, [papers, selectedPaperId]);
  const selectedQuestionSet = useMemo(() => new Set(paperDetail.questions.map((item) => item.questionId)), [paperDetail.questions]);
  const availableQuestions = useMemo(
    () => paperDetail.availableQuestions.filter((question) => !selectedQuestionSet.has(question.id)),
    [paperDetail.availableQuestions, selectedQuestionSet],
  );

  const loadQuestions = async (page = questionPage, nextKeyword = keyword, nextFolderId = selectedFolderId) => {
    const payload = await adminLawPracticeService.getQuestions({
      keyword: nextKeyword.trim(),
      folderId: nextFolderId,
      page,
      pageSize: 20,
    });
    setQuestions(payload);
    setQuestionPage(payload.page);
  };

  const loadFolders = async () => {
    const nextFolders = await adminLawPracticeService.getFolders();
    setFolders(nextFolders);
  };

  const loadPapers = async () => {
    const nextPapers = await adminLawPracticeService.getPapers();
    setPapers(nextPapers);
    if (!selectedPaperId && nextPapers[0]) {
      setSelectedPaperId(nextPapers[0].id);
      setPaperForm(toPaperForm(nextPapers[0]));
    }
  };

  const loadPaperDetail = async (paperId = selectedPaperId) => {
    if (!paperId) {
      setPaperDetail(emptyPaperDetail);
      return;
    }
    const detail = await adminLawPracticeService.getPaperQuestions(paperId);
    setPaperDetail(detail);
    setSelectedQuestionIds([]);
  };

  const refreshAll = async () => {
    await Promise.all([loadFolders(), loadQuestions(questionPage), loadPapers()]);
    if (selectedPaperId) await loadPaperDetail(selectedPaperId);
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      setLoading(true);
      try {
        const [nextFolders, nextQuestions, nextPapers] = await Promise.all([
          adminLawPracticeService.getFolders(),
          adminLawPracticeService.getQuestions({ folderId: "all", page: 1, pageSize: 20 }),
          adminLawPracticeService.getPapers(),
        ]);
        if (!active) return;
        setFolders(nextFolders);
        setQuestions(nextQuestions);
        setPapers(nextPapers);
        const firstPaper = nextPapers[0];
        if (firstPaper) {
          setSelectedPaperId(firstPaper.id);
          setPaperForm(toPaperForm(firstPaper));
          const detail = await adminLawPracticeService.getPaperQuestions(firstPaper.id);
          if (active) setPaperDetail(detail);
        }
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "法条练习管理加载失败");
      } finally {
        if (active) setLoading(false);
      }
    };
    void boot();
    return () => {
      active = false;
    };
  }, []);

  const handleQuestionSearch = async () => {
    setQuestionPage(1);
    try {
      await loadQuestions(1, keyword, selectedFolderId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "题目搜索失败");
    }
  };

  const selectFolder = async (folderId: string) => {
    setSelectedFolderId(folderId);
    setQuestionPage(1);
    if (folderId === "all") {
      setFolderForm(emptyFolderForm);
    } else {
      const folder = folders.find((item) => item.id === folderId);
      if (folder) setFolderForm(toFolderForm(folder));
    }
    try {
      await loadQuestions(1, keyword, folderId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "题库文件夹加载失败");
    }
  };

  const saveFolder = async () => {
    setSavingFolder(true);
    try {
      const payload = buildFolderPayload(folderForm);
      const saved = folderForm.id
        ? await adminLawPracticeService.updateFolder(folderForm.id, payload)
        : await adminLawPracticeService.createFolder(payload);
      toast.success(folderForm.id ? "文件夹已更新" : "文件夹已创建");
      setFolderDialogOpen(false);
      setSelectedFolderId(saved.id);
      setFolderForm(toFolderForm(saved));
      await Promise.all([loadFolders(), loadQuestions(1, keyword, saved.id)]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "文件夹保存失败");
    } finally {
      setSavingFolder(false);
    }
  };

  const disableFolder = async (folder: AdminLawPracticeFolder) => {
    if (!window.confirm(`确定停用文件夹「${folder.name}」吗？题目不会删除，只是不再按这个文件夹展示。`)) return;
    try {
      await adminLawPracticeService.deleteFolder(folder.id);
      toast.success("文件夹已停用");
      setSelectedFolderId("all");
      setFolderForm(emptyFolderForm);
      await Promise.all([loadFolders(), loadQuestions(1, keyword, "all")]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "文件夹停用失败");
    }
  };

  const searchLawSources = async (page = 1, keyword = lawSearchKeyword) => {
    const nextKeyword = keyword.trim();
    setLawSearching(true);
    try {
      const result = await adminLawService.getEntries({
        keyword: nextKeyword,
        visibility: "published",
        page,
        pageSize: 10,
      });
      setLawSearchPage(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "法条搜索失败");
    } finally {
      setLawSearching(false);
    }
  };

  const openLawSelector = async (targetQuestion?: AdminLawPracticeQuestion) => {
    const source = targetQuestion ?? questionForm;
    setLawSelectorTargetQuestion(targetQuestion ?? null);
    const defaultKeyword = [source.lawName, source.articleNo, source.title].filter(Boolean).join(" ").trim();
    setLawSearchKeyword(defaultKeyword);
    setLawSelectorOpen(true);
    await searchLawSources(1, defaultKeyword);
  };

  const applyLawSource = async (entry: AdminLawRecord) => {
    setSelectingLawSourceId(entry.sourceLawId);
    try {
      const detail = await adminLawService.getEntryDetail(entry.sourceLawId);
      if (lawSelectorTargetQuestion) {
        const target = lawSelectorTargetQuestion;
        await adminLawPracticeService.updateQuestion(target.id, {
          folderId: target.folderId,
          title: target.title,
          prompt: target.prompt,
          lawName: detail.bookTitle || detail.topCategoryTitle || target.lawName,
          articleNo: detail.displayTitle || detail.title || target.articleNo,
          sourceLawId: detail.sourceLawId,
          standardText: detail.content || target.standardText,
          explanation: target.explanation,
          tags: target.tags,
          sortOrder: target.sortOrder,
          isActive: target.isActive,
        });
        await Promise.all([loadQuestions(questionPage, keyword, selectedFolderId), selectedPaperId ? loadPaperDetail(selectedPaperId) : Promise.resolve()]);
        setLawSelectorOpen(false);
        setLawSelectorTargetQuestion(null);
        toast.success("已关联法条源");
        return;
      }

      setQuestionForm((current) => ({
        ...current,
        sourceLawId: `${detail.sourceLawId}`,
        lawName: detail.bookTitle || detail.topCategoryTitle || current.lawName,
        articleNo: detail.displayTitle || detail.title || current.articleNo,
        standardText: detail.content || current.standardText,
      }));
      setLawSelectorOpen(false);
      setLawSelectorTargetQuestion(null);
      toast.success("已匹配法条源");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "选择法条失败");
    } finally {
      setSelectingLawSourceId(null);
    }
  };

  const saveQuestion = async () => {
    setSavingQuestion(true);
    try {
      const payload = buildQuestionPayload(questionForm);
      if (questionForm.id) {
        await adminLawPracticeService.updateQuestion(questionForm.id, payload);
        toast.success("题目已更新");
      } else {
        await adminLawPracticeService.createQuestion(payload);
        toast.success("题目已创建");
      }
      setQuestionDialogOpen(false);
      setQuestionForm({ ...emptyQuestionForm, folderId: selectedFolderId === "all" ? "" : selectedFolderId });
      await Promise.all([loadFolders(), loadQuestions(questionPage, keyword, selectedFolderId), selectedPaperId ? loadPaperDetail(selectedPaperId) : Promise.resolve()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "题目保存失败");
    } finally {
      setSavingQuestion(false);
    }
  };

  const submitQuestionImport = async () => {
    if (!importFile && !importJson.trim()) {
      toast.error("请上传 Excel/CSV/JSON 文件，或粘贴 JSON 内容");
      return;
    }
    setImportingQuestions(true);
    try {
      const result = await adminLawPracticeService.importQuestions({
        file: importFile,
        json: importJson,
        folderId: selectedFolderId,
      });
      toast.success(`已导入 ${result.createdCount} 道题`);
      setImportDialogOpen(false);
      setImportFile(null);
      setImportJson("");
      await Promise.all([loadFolders(), loadQuestions(1, keyword, selectedFolderId), selectedPaperId ? loadPaperDetail(selectedPaperId) : Promise.resolve()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "题目导入失败");
    } finally {
      setImportingQuestions(false);
    }
  };

  const disableQuestion = async (question: AdminLawPracticeQuestion) => {
    if (!window.confirm(`确定停用题目「${question.title}」吗？已组卷记录不会被破坏。`)) return;
    try {
      await adminLawPracticeService.deleteQuestion(question.id);
      toast.success("题目已停用");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "题目停用失败");
    }
  };

  const selectPaper = async (paper: AdminLawPracticePaper) => {
    setSelectedPaperId(paper.id);
    setPaperForm(toPaperForm(paper));
    try {
      await loadPaperDetail(paper.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "试卷题目加载失败");
    }
  };

  const savePaper = async () => {
    setSavingPaper(true);
    try {
      const payload = buildPaperPayload(paperForm);
      const saved = paperForm.id
        ? await adminLawPracticeService.updatePaper(paperForm.id, payload)
        : await adminLawPracticeService.createPaper(payload);
      toast.success(paperForm.id ? "试卷已更新" : "试卷已创建");
      setSelectedPaperId(saved.id);
      setPaperForm(toPaperForm(saved));
      await loadPapers();
      await loadPaperDetail(saved.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "试卷保存失败");
    } finally {
      setSavingPaper(false);
    }
  };

  const deletePaper = async (paper: AdminLawPracticePaper) => {
    if (!window.confirm(`确定删除或下架试卷「${paper.title}」吗？已有学生记录时会安全转为草稿。`)) return;
    try {
      await adminLawPracticeService.deletePaper(paper.id);
      toast.success("试卷已处理");
      setPaperForm(emptyPaperForm);
      setSelectedPaperId("");
      setPaperDetail(emptyPaperDetail);
      await loadPapers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "试卷处理失败");
    }
  };

  const toggleQuestionSelection = (questionId: string, checked: boolean) => {
    setSelectedQuestionIds((current) => {
      if (checked) return [...new Set([...current, questionId])];
      return current.filter((id) => id !== questionId);
    });
  };

  const addSelectedQuestions = async () => {
    if (!selectedPaperId || selectedQuestionIds.length === 0) return;
    setAddingQuestions(true);
    try {
      await adminLawPracticeService.addPaperQuestions(selectedPaperId, selectedQuestionIds);
      toast.success("题目已加入试卷");
      await Promise.all([loadPapers(), loadPaperDetail(selectedPaperId)]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入试卷失败");
    } finally {
      setAddingQuestions(false);
    }
  };

  const reorderPaperQuestion = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (!selectedPaperId || nextIndex < 0 || nextIndex >= paperDetail.questions.length) return;
    const nextItems = moveItem(paperDetail.questions, index, nextIndex).map((item, sortOrder) => ({ ...item, sortOrder }));
    setPaperDetail((current) => ({ ...current, questions: nextItems }));
    try {
      await adminLawPracticeService.updatePaperQuestionOrder(
        selectedPaperId,
        nextItems.map((item, sortOrder) => ({ id: item.id, sortOrder })),
      );
      await loadPaperDetail(selectedPaperId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "顺序保存失败");
      await loadPaperDetail(selectedPaperId);
    }
  };

  const removePaperQuestion = async (item: AdminLawPracticePaperQuestion) => {
    if (!selectedPaperId) return;
    try {
      await adminLawPracticeService.removePaperQuestion(selectedPaperId, item.id);
      toast.success("题目已移出试卷");
      await Promise.all([loadPapers(), loadPaperDetail(selectedPaperId)]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移出试卷失败");
    }
  };

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500">正在加载法条练习管理...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "题目总数", value: questions.total },
          { label: "试卷数量", value: papers.length },
          { label: "已发布试卷", value: papers.filter((paper) => paper.status === "published").length },
          { label: "当前试卷题数", value: paperDetail.questions.length },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</div>
          </div>
        ))}
      </div>

      <div className={`grid gap-5 ${showLibrary && showPapers ? "xl:grid-cols-[minmax(0,1.08fr)_minmax(460px,0.92fr)]" : "grid-cols-1"}`}>
        {showLibrary ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-950">法条定位题库</h3>
              <p className="mt-1 text-sm text-slate-500">维护题目、标准条号和法条源绑定。绑定源ID后，以法条检索库当前原文为准。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setImportDialogOpen(true)}>
                <Upload className="size-4" />
                批量导入
              </Button>
              <Button
                variant="outline"
                className="border-slate-200 bg-white text-slate-700"
                onClick={() => {
                  setQuestionForm({ ...emptyQuestionForm, folderId: selectedFolderId === "all" ? "" : selectedFolderId });
                  setQuestionDialogOpen(true);
                }}
              >
                <Plus className="size-4" />
                新建题目
              </Button>
            </div>
          </div>

          {mode === "library" ? (
            <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">题库文件夹</div>
                    <p className="mt-1 text-xs text-slate-500">先分类维护原题，再去组卷引用。</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-slate-200 bg-white"
                    onClick={() => {
                      setFolderForm(emptyFolderForm);
                      setFolderDialogOpen(true);
                    }}
                  >
                    新建
                  </Button>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${selectedFolderId === "all" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                    onClick={() => void selectFolder("all")}
                  >
                    <span>全部原题</span>
                    <span className="text-xs text-slate-400">{questions.total}</span>
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${selectedFolderId === folder.id ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                      onClick={() => void selectFolder(folder.id)}
                    >
                      <span className="truncate">{folder.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{folder.questionCount}</span>
                    </button>
                  ))}
                </div>

                {currentFolder ? (
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-500">当前文件夹</div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-900">{currentFolder.name}</div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 border-slate-200"
                        onClick={() => {
                          setFolderForm(toFolderForm(currentFolder));
                          setFolderDialogOpen(true);
                        }}
                      >
                        编辑
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="border-rose-100 text-rose-600 hover:bg-rose-50" onClick={() => void disableFolder(currentFolder)}>
                        停用
                      </Button>
                    </div>
                  </div>
                ) : null}
              </aside>

              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">原题列表</div>
                    <p className="mt-1 text-xs text-slate-500">
                      当前：{currentFolder ? currentFolder.name : "全部原题"} · 共 {questions.total} 题
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="flex min-w-[260px] items-center gap-2">
                      <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleQuestionSearch(); }} placeholder="搜索题目、法律、条号" />
                      <Button variant="outline" className="border-slate-200" onClick={() => void handleQuestionSearch()}>
                        <Search className="size-4" />
                      </Button>
                    </div>
                    <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setImportDialogOpen(true)}>
                      <Upload className="size-4" />
                      批量导入
                    </Button>
                    <Button
                      onClick={() => {
                        setQuestionForm({ ...emptyQuestionForm, folderId: selectedFolderId === "all" ? "" : selectedFolderId });
                        setQuestionDialogOpen(true);
                      }}
                    >
                      <Plus className="size-4" />
                      添加题目
                    </Button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {questions.items.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">当前文件夹暂无题目。</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                          <tr>
                            <th className="px-4 py-3">题目</th>
                            <th className="px-4 py-3">文件夹</th>
                            <th className="px-4 py-3">法条配置</th>
                            <th className="px-4 py-3">入卷</th>
                            <th className="px-4 py-3 text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {questions.items.map((question) => (
                            <tr key={question.id} className="align-top hover:bg-slate-50">
                              <td className="max-w-[520px] px-4 py-3">
                                <div className="font-semibold text-slate-950">{question.title}</div>
                                <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{question.prompt}</div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                                  <span>{question.lawName || "-"}</span>
                                  <span>{question.articleNo || "-"}</span>
                                  {question.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5">{tag}</span>)}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{question.folderName || "未分组"}</td>
                              <td className="px-4 py-3">
                                {question.sourceLawId ? (
                                  <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">源ID {question.sourceLawId}</Badge>
                                ) : (
                                  <Badge variant="outline" className="border-amber-100 bg-amber-50 text-amber-700">未配置</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-500">{question.paperCount}</td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" className="border-blue-100 text-blue-700 hover:bg-blue-50" onClick={() => void openLawSelector(question)}>
                                    配置法条
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-slate-200"
                                    onClick={() => {
                                      setQuestionForm(toQuestionForm(question));
                                      setQuestionDialogOpen(true);
                                    }}
                                  >
                                    编辑
                                  </Button>
                                  <Button variant="outline" size="sm" className="border-rose-100 text-rose-600 hover:bg-rose-50" onClick={() => void disableQuestion(question)}>
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>共 {questions.total} 题，第 {questions.page} / {questions.totalPages} 页</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={questions.page <= 1} onClick={() => void loadQuestions(questions.page - 1)}>上一页</Button>
                    <Button variant="outline" size="sm" disabled={questions.page >= questions.totalPages} onClick={() => void loadQuestions(questions.page + 1)}>下一页</Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
          <>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">法条练习原题库文件夹</div>
                <p className="mt-1 text-xs text-slate-500">先把题维护进原题库，组卷时再批量引用。</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-slate-200 bg-white text-slate-700"
                onClick={() => {
                  setSelectedFolderId("all");
                  setFolderForm(emptyFolderForm);
                  void loadQuestions(1, keyword, "all");
                }}
              >
                新建文件夹
              </Button>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                className={`shrink-0 rounded-md border px-3 py-2 text-left text-sm ${selectedFolderId === "all" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                onClick={() => void selectFolder("all")}
              >
                全部原题
                <span className="ml-2 text-xs text-slate-400">{questions.total}</span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={`shrink-0 rounded-md border px-3 py-2 text-left text-sm ${selectedFolderId === folder.id ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                  onClick={() => void selectFolder(folder.id)}
                >
                  {folder.name}
                  <span className="ml-2 text-xs text-slate-400">{folder.questionCount}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.4fr_90px_auto]">
              <div className="space-y-2">
                <Label>文件夹名称</Label>
                <Input value={folderForm.name} onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} placeholder="如：刑诉法条定位" />
              </div>
              <div className="space-y-2">
                <Label>说明</Label>
                <Input value={folderForm.description ?? ""} onChange={(event) => setFolderForm((current) => ({ ...current, description: event.target.value }))} placeholder="可填写适用阶段、科目或用途" />
              </div>
              <div className="space-y-2">
                <Label>排序</Label>
                <Input type="number" value={folderForm.sortOrder} onChange={(event) => setFolderForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
              </div>
              <div className="flex items-end gap-2">
                <Button type="button" onClick={() => void saveFolder()} disabled={savingFolder}>
                  {savingFolder ? "保存中..." : folderForm.id ? "保存文件夹" : "创建文件夹"}
                </Button>
                {folderForm.id && currentFolder ? (
                  <Button type="button" variant="outline" className="border-rose-100 bg-white text-rose-600 hover:bg-rose-50" onClick={() => void disableFolder(currentFolder)}>
                    停用
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>题目标题</Label>
              <Input value={questionForm.title} onChange={(event) => setQuestionForm((current) => ({ ...current, title: event.target.value }))} placeholder="如：刑诉法独立行使审判权" />
            </div>
            <div className="space-y-2">
              <Label>所属文件夹</Label>
              <Select value={questionForm.folderId || "none"} onValueChange={(value) => setQuestionForm((current) => ({ ...current, folderId: value === "none" ? "" : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分组</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>法律名称</Label>
                <Input value={questionForm.lawName} onChange={(event) => setQuestionForm((current) => ({ ...current, lawName: event.target.value }))} placeholder="刑事诉讼法" />
              </div>
              <div className="space-y-2">
                <Label>标准条号</Label>
                <Input value={questionForm.articleNo} onChange={(event) => setQuestionForm((current) => ({ ...current, articleNo: event.target.value }))} placeholder="第五条" />
              </div>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>法条源ID</Label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  readOnly
                  value={questionForm.sourceLawId}
                  className="cursor-pointer bg-white"
                  onClick={() => void openLawSelector()}
                  placeholder="点击搜索法条库并选择匹配条文"
                />
                <Button type="button" variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void openLawSelector()}>
                  <Search className="size-4" />
                  搜索法条
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-700"
                  disabled={!questionForm.sourceLawId}
                  onClick={() => setQuestionForm((current) => ({ ...current, sourceLawId: "" }))}
                >
                  清除
                </Button>
              </div>
              <p className="text-xs text-slate-500">选择法条后会自动带回源ID和当前原文。为空时，系统会尝试按“法律名称 + 条文序号”唯一匹配；匹配不到时才使用下方手填原文。</p>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>题目要求</Label>
              <Textarea
                className="min-h-[88px]"
                value={questionForm.prompt}
                onChange={(event) => setQuestionForm((current) => ({ ...current, prompt: event.target.value }))}
                placeholder="请快速定位《刑事诉讼法》关于……的条文。写出条文序号，并将条文原文抄录到答题框中。"
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>标准条文原文</Label>
              <Textarea
                className="min-h-[112px]"
                value={questionForm.standardText}
                onChange={(event) => setQuestionForm((current) => ({ ...current, standardText: event.target.value }))}
                placeholder="未绑定法条源ID时使用；绑定源ID后，学生端显示和核对会优先使用法条检索库当前原文。"
              />
            </div>
            <div className="space-y-2">
              <Label>标签</Label>
              <Input value={questionForm.tags} onChange={(event) => setQuestionForm((current) => ({ ...current, tags: event.target.value }))} placeholder="刑诉，审判权，检察权" />
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={questionForm.isActive ? "active" : "inactive"} onValueChange={(value) => setQuestionForm((current) => ({ ...current, isActive: value === "active" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="inactive">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>排序</Label>
                <Input type="number" value={questionForm.sortOrder} onChange={(event) => setQuestionForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>解析说明</Label>
              <Textarea
                className="min-h-[76px]"
                value={questionForm.explanation}
                onChange={(event) => setQuestionForm((current) => ({ ...current, explanation: event.target.value }))}
                placeholder="可填写定位思路、易错提醒或背诵提示。"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex min-w-[260px] flex-1 items-center gap-2">
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleQuestionSearch(); }} placeholder="搜索标题、条号、法律名称或条文" />
              <Button variant="outline" className="shrink-0 border-slate-200" onClick={() => void handleQuestionSearch()}>
                <Search className="size-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="border-slate-200" onClick={() => setQuestionForm(emptyQuestionForm)}>清空</Button>
              <Button onClick={() => void saveQuestion()} disabled={savingQuestion}>
                {savingQuestion ? "保存中..." : questionForm.id ? "保存题目" : "创建题目"}
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            {questions.items.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">暂无题目。</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {questions.items.map((question) => (
                  <div key={question.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                    <button type="button" className="min-w-0 text-left" onClick={() => setQuestionForm(toQuestionForm(question))}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-950">{question.title}</span>
                        <Badge variant="outline" className={question.isActive ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}>
                          {question.isActive ? "启用" : "停用"}
                        </Badge>
                        <span className="text-xs text-slate-400">已入卷 {question.paperCount}</span>
                      </div>
                      <div className="mt-2 text-sm text-slate-600 line-clamp-2">{question.prompt}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        {question.folderName ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{question.folderName}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">未分组</span>}
                        <span>{question.lawName}</span>
                        <span>{question.articleNo}</span>
                        {question.sourceLawId ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">源ID {question.sourceLawId}</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">手填原文</span>}
                        {question.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5">{tag}</span>)}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="border-blue-100 text-blue-700 hover:bg-blue-50" onClick={() => void openLawSelector(question)}>
                        关联法条
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-slate-200"
                        onClick={() => {
                          setQuestionForm(toQuestionForm(question));
                          setQuestionDialogOpen(true);
                        }}
                      >
                        编辑
                      </Button>
                      <Button variant="outline" size="sm" className="border-rose-100 text-rose-600 hover:bg-rose-50" onClick={() => void disableQuestion(question)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>共 {questions.total} 题，第 {questions.page} / {questions.totalPages} 页</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={questions.page <= 1} onClick={() => void loadQuestions(questions.page - 1)}>上一页</Button>
              <Button variant="outline" size="sm" disabled={questions.page >= questions.totalPages} onClick={() => void loadQuestions(questions.page + 1)}>下一页</Button>
            </div>
          </div>
          </>
          )}
        </section>
        ) : null}

        {showPapers ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-950">练习试卷组卷</h3>
              <p className="mt-1 text-sm text-slate-500">创建套卷，加入题目，发布后学生端可开始练习。</p>
            </div>
            <Button variant="outline" className="border-slate-200" onClick={() => { setPaperForm(emptyPaperForm); setSelectedPaperId(""); setPaperDetail(emptyPaperDetail); }}>
              <Plus className="size-4" />
              新建试卷
            </Button>
          </div>

          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_150px] gap-3">
              <div className="space-y-2">
                <Label>试卷名称</Label>
                <Input value={paperForm.title} onChange={(event) => setPaperForm((current) => ({ ...current, title: event.target.value }))} placeholder="如：刑诉法条定位训练一" />
              </div>
              <div className="space-y-2">
                <Label>编码</Label>
                <Input value={paperForm.code ?? ""} onChange={(event) => setPaperForm((current) => ({ ...current, code: event.target.value }))} placeholder="可自动生成" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>说明</Label>
              <Textarea className="min-h-[68px]" value={paperForm.description ?? ""} onChange={(event) => setPaperForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-2">
                <Label>发布状态</Label>
                <Select value={paperForm.status} onValueChange={(value) => setPaperForm((current) => ({ ...current, status: value as AdminLawPracticePaperStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="published">已发布</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>排序</Label>
                <Input type="number" value={paperForm.sortOrder} onChange={(event) => setPaperForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void savePaper()} disabled={savingPaper}>
                {savingPaper ? "保存中..." : paperForm.id ? "保存试卷" : "创建试卷"}
              </Button>
              {selectedPaper ? (
                <Button variant="outline" className="border-rose-100 text-rose-600 hover:bg-rose-50" onClick={() => void deletePaper(selectedPaper)}>
                  删除/下架
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">试卷列表</div>
            <div className="max-h-[260px] overflow-y-auto">
              {papers.length === 0 ? (
                <div className="p-5 text-sm text-slate-500">暂无试卷。</div>
              ) : papers.map((paper) => (
                <button
                  type="button"
                  key={paper.id}
                  className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 ${paper.id === selectedPaperId ? "bg-blue-50" : "bg-white hover:bg-slate-50"}`}
                  onClick={() => void selectPaper(paper)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{paper.title}</span>
                    <span className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{paper.code}</span>
                      <span>{paper.questionCount} 题</span>
                      <span>{paper.recordCount} 条记录</span>
                    </span>
                  </span>
                  <Badge variant="outline" className={statusMeta[paper.status].className}>{statusMeta[paper.status].label}</Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-700">当前试卷题目</div>
                <div className="text-xs text-slate-400">{selectedPaper ? selectedPaper.title : "请选择或创建试卷"}</div>
              </div>
              <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">{paperDetail.questions.length} 题</Badge>
            </div>
            <div className="max-h-[340px] overflow-y-auto">
              {paperDetail.questions.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">这套试卷还没有题目。</div>
              ) : paperDetail.questions.map((item, index) => (
                <div key={item.id} className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                  <div className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{item.question.title}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {item.question.folderName ? `${item.question.folderName} · ` : ""}
                      {item.question.lawName} · {item.question.articleNo}
                      {item.question.sourceLawId ? ` · 源ID ${item.question.sourceLawId}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" disabled={index <= 0} onClick={() => void reorderPaperQuestion(index, -1)}><ArrowUp className="size-4" /></Button>
                    <Button variant="ghost" size="icon" disabled={index >= paperDetail.questions.length - 1} onClick={() => void reorderPaperQuestion(index, 1)}><ArrowDown className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-rose-600 hover:bg-rose-50" onClick={() => void removePaperQuestion(item)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-700">从题库加入试卷</div>
                <div className="text-xs text-slate-400">只显示未加入当前试卷的启用题目。</div>
              </div>
              <Button size="sm" disabled={!selectedPaperId || selectedQuestionIds.length === 0 || addingQuestions} onClick={() => void addSelectedQuestions()}>
                <FileText className="size-4" />
                加入 {selectedQuestionIds.length || ""}
              </Button>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {!selectedPaperId ? (
                <div className="p-6 text-center text-sm text-slate-500">请选择一套试卷后再加入题目。</div>
              ) : availableQuestions.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">暂无可加入题目。</div>
              ) : availableQuestions.map((question) => {
                const checked = selectedQuestionIds.includes(question.id);
                return (
                  <label key={question.id} className="grid cursor-pointer grid-cols-[auto_1fr] gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                    <input type="checkbox" className="mt-1 size-4" checked={checked} onChange={(event) => toggleQuestionSelection(question.id, event.target.checked)} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{question.title}</span>
                        {checked ? <CheckCircle2 className="size-4 shrink-0 text-blue-600" /> : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {question.folderName ? `${question.folderName} · ` : ""}
                        {question.lawName} · {question.articleNo}
                        {question.sourceLawId ? ` · 源ID ${question.sourceLawId}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </section>
        ) : null}
      </div>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-[520px] border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>{folderForm.id ? "编辑文件夹" : "新建文件夹"}</DialogTitle>
            <DialogDescription>用于管理法条练习原题的分类，组卷时从这些原题中引用。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>文件夹名称</Label>
              <Input value={folderForm.name} onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} placeholder="如：刑诉法条定位" />
            </div>
            <div className="space-y-2">
              <Label>说明</Label>
              <Input value={folderForm.description ?? ""} onChange={(event) => setFolderForm((current) => ({ ...current, description: event.target.value }))} placeholder="可填写适用阶段、科目或用途" />
            </div>
            <div className="space-y-2">
              <Label>排序</Label>
              <Input type="number" value={folderForm.sortOrder} onChange={(event) => setFolderForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setFolderDialogOpen(false)}>取消</Button>
            <Button onClick={() => void saveFolder()} disabled={savingFolder}>
              {savingFolder ? "保存中..." : folderForm.id ? "保存文件夹" : "创建文件夹"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-32px)] max-w-[980px] overflow-hidden border border-slate-200 bg-white p-0 text-slate-900">
          <div className="border-b border-slate-200 px-6 py-5">
            <DialogHeader>
              <DialogTitle>{questionForm.id ? "编辑法条练习原题" : "添加法条练习原题"}</DialogTitle>
              <DialogDescription>维护题目内容和法条源关联。配置法条源后，学生端以法条检索库当前原文为准。</DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid max-h-[68vh] gap-4 overflow-y-auto px-6 py-5 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>题目标题</Label>
              <Input value={questionForm.title} onChange={(event) => setQuestionForm((current) => ({ ...current, title: event.target.value }))} placeholder="如：刑诉法独立行使审判权" />
            </div>
            <div className="space-y-2">
              <Label>所属文件夹</Label>
              <Select value={questionForm.folderId || "none"} onValueChange={(value) => setQuestionForm((current) => ({ ...current, folderId: value === "none" ? "" : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分组</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>法律名称</Label>
              <Input value={questionForm.lawName} onChange={(event) => setQuestionForm((current) => ({ ...current, lawName: event.target.value }))} placeholder="刑事诉讼法" />
            </div>
            <div className="space-y-2">
              <Label>标准条号</Label>
              <Input value={questionForm.articleNo} onChange={(event) => setQuestionForm((current) => ({ ...current, articleNo: event.target.value }))} placeholder="第五条" />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label>法条源</Label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input readOnly value={questionForm.sourceLawId} className="cursor-pointer bg-white" onClick={() => void openLawSelector()} placeholder="点击搜索法条库并选择匹配条文" />
                <Button type="button" variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => void openLawSelector()}>
                  <Search className="size-4" />
                  搜索法条
                </Button>
                <Button type="button" variant="outline" className="border-slate-200 bg-white text-slate-700" disabled={!questionForm.sourceLawId} onClick={() => setQuestionForm((current) => ({ ...current, sourceLawId: "" }))}>
                  清除
                </Button>
              </div>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label>题目要求</Label>
              <Textarea
                className="min-h-[96px]"
                value={questionForm.prompt}
                onChange={(event) => setQuestionForm((current) => ({ ...current, prompt: event.target.value }))}
                placeholder="请快速定位《刑事诉讼法》关于……的条文。写出条文序号，并将条文原文抄录到答题框中。"
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>标准条文原文</Label>
              <Textarea
                className="min-h-[120px]"
                value={questionForm.standardText}
                onChange={(event) => setQuestionForm((current) => ({ ...current, standardText: event.target.value }))}
                placeholder="未绑定法条源ID时使用；绑定源ID后，学生端显示和核对会优先使用法条检索库当前原文。"
              />
            </div>
            <div className="space-y-2">
              <Label>标签</Label>
              <Input value={questionForm.tags} onChange={(event) => setQuestionForm((current) => ({ ...current, tags: event.target.value }))} placeholder="刑诉，审判权，检察权" />
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={questionForm.isActive ? "active" : "inactive"} onValueChange={(value) => setQuestionForm((current) => ({ ...current, isActive: value === "active" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="inactive">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>排序</Label>
                <Input type="number" value={questionForm.sortOrder} onChange={(event) => setQuestionForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>解析说明</Label>
              <Textarea
                className="min-h-[88px]"
                value={questionForm.explanation}
                onChange={(event) => setQuestionForm((current) => ({ ...current, explanation: event.target.value }))}
                placeholder="可填写定位思路、易错提醒或背诵提示。"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setQuestionDialogOpen(false)}>取消</Button>
            <Button onClick={() => void saveQuestion()} disabled={savingQuestion}>
              {savingQuestion ? "保存中..." : questionForm.id ? "保存题目" : "创建题目"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={lawSelectorOpen}
        onOpenChange={(open) => {
          setLawSelectorOpen(open);
          if (!open) setLawSelectorTargetQuestion(null);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100vw-32px)] max-w-[980px] overflow-hidden border border-slate-200 bg-white p-0 text-slate-900">
          <div className="border-b border-slate-200 px-6 py-5">
            <DialogHeader>
              <DialogTitle>选择法条源</DialogTitle>
              <DialogDescription>
                搜索现有法条检索库，选中后自动回填源ID，并以该法条当前原文作为学生端核对标准。
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[260px] flex-1 border-slate-200 bg-white"
                value={lawSearchKeyword}
                onChange={(event) => setLawSearchKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchLawSources(1);
                }}
                placeholder="输入法律名称、条号、关键词搜索"
              />
              <Button type="button" onClick={() => void searchLawSources(1)} disabled={lawSearching}>
                <Search className="size-4" />
                {lawSearching ? "搜索中..." : "搜索"}
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[120px_1fr_150px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                <span>源ID</span>
                <span>法条</span>
                <span>操作</span>
              </div>
              <div className="max-h-[430px] overflow-y-auto">
                {lawSearching ? (
                  <div className="p-8 text-center text-sm text-slate-500">正在搜索法条...</div>
                ) : lawSearchPage.items.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">没有找到匹配法条，可以换一个关键词。</div>
                ) : (
                  lawSearchPage.items.map((entry) => (
                    <div key={entry.sourceLawId} className="grid grid-cols-[120px_1fr_150px] gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
                      <div className="text-sm font-semibold text-blue-700">{entry.sourceLawId}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-950">{entry.displayTitle || entry.title}</span>
                          {!entry.isPublished ? <Badge variant="outline" className="border-rose-100 bg-rose-50 text-rose-700">隐藏</Badge> : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {entry.bookTitle || entry.topCategoryTitle || "未分类"}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{entry.pathString || "-"}</div>
                      </div>
                      <div className="flex items-center justify-end">
                        <Button
                          type="button"
                          size="sm"
                          disabled={selectingLawSourceId === entry.sourceLawId}
                          onClick={() => void applyLawSource(entry)}
                        >
                          {selectingLawSourceId === entry.sourceLawId ? "选择中..." : "选择"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>共 {lawSearchPage.total} 条，第 {lawSearchPage.page} / {lawSearchPage.totalPages} 页</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="border-slate-200" disabled={lawSearchPage.page <= 1 || lawSearching} onClick={() => void searchLawSources(lawSearchPage.page - 1)}>
                  上一页
                </Button>
                <Button variant="outline" size="sm" className="border-slate-200" disabled={lawSearchPage.page >= lawSearchPage.totalPages || lawSearching} onClick={() => void searchLawSources(lawSearchPage.page + 1)}>
                  下一页
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setLawSelectorOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-32px)] max-w-[980px] overflow-hidden border border-slate-200 bg-white p-0 text-slate-900">
          <div className="border-b border-slate-200 px-6 py-5">
            <DialogHeader>
              <DialogTitle>批量导入法条练习题目</DialogTitle>
              <DialogDescription>
                将导入到{currentFolder ? `「${currentFolder.name}」` : "当前原题库"}。推荐填写法条源ID；未填写时会尝试按“法律名称 + 条文序号”唯一匹配。
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid max-h-[68vh] gap-5 overflow-y-auto px-6 py-5 lg:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>上传文件</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv,.json,application/json,text/csv"
                  className="border-slate-200 bg-white"
                  onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                />
                {importFile ? <p className="text-xs text-blue-600">将使用文件：{importFile.name}</p> : <p className="text-xs text-slate-500">支持 xlsx、xls、csv、json。上传文件时优先使用文件内容。</p>}
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                <div className="font-semibold">导入规则</div>
                <p className="mt-1">1. 填写“法条源ID”时，会直接取法条检索库原文。</p>
                <p>2. 不填源ID时，系统按“法律名称 + 条文序号”匹配，唯一命中才会自动绑定。</p>
                <p>3. 匹配不到或匹配多条时，请补源ID；未绑定题目才使用手填原文。</p>
              </div>

              <Button type="button" variant="outline" className="w-full border-slate-200 bg-white text-slate-700" onClick={downloadLawPracticeImportTemplate}>
                <Download className="size-4" />
                下载 CSV 模板
              </Button>
            </div>

            <div className="space-y-2">
              <Label>粘贴 JSON</Label>
              <Textarea
                className="min-h-[360px] resize-none overflow-auto whitespace-pre font-mono text-xs leading-5"
                value={importJson}
                onChange={(event) => setImportJson(event.target.value)}
                spellCheck={false}
                placeholder={`[
  {
    "sourceLawId": 12345,
    "title": "刑诉法独立行使审判权",
    "prompt": "请快速定位《刑事诉讼法》关于人民法院、人民检察院依法独立行使审判权/检察权的条文。写出条文序号，并将条文原文抄录到答题框中。",
    "lawName": "刑事诉讼法",
    "articleNo": "第五条",
    "explanation": "可填写定位思路或易错提醒。",
    "tags": ["刑诉", "法条定位"],
    "sortOrder": 0,
    "isActive": true
  }
]`}
              />
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" onClick={() => setImportDialogOpen(false)}>取消</Button>
            <Button onClick={() => void submitQuestionImport()} disabled={importingQuestions}>
              {importingQuestions ? "导入中..." : "开始导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function LawPracticeLibraryManagement() {
  return <LawPracticeManagement mode="library" />;
}

export function LawPracticePaperManagement() {
  return <LawPracticeManagement mode="papers" />;
}
