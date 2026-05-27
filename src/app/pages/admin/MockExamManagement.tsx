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
  AdminMockExamSeries,
  adminContentService,
} from "../../services/adminContentService";

type PaperForm = AdminMockExamPaperPayload & {
  id: string;
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

const normalizeDateTimeInput = (value = "") => value.replace(" ", "T").slice(0, 16);
const fromDateTimeInput = (value = "") => (value ? `${value.replace("T", " ")}:00`.slice(0, 19) : "");
const compactNumber = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("zh-CN");

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
    setMode("edit");
  };

  const openEditPaper = (paper: AdminMockExamPaper) => {
    setEditingPaper(paper);
    setPaperForm(toPaperForm(paper));
    setMode("edit");
  };

  const closePaperEditor = () => {
    setMode("list");
    setEditingPaper(null);
    setPaperForm(emptyPaperForm);
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
        await adminContentService.updateMockExamPaper(editingPaper.id, payload);
        toast.success("试卷已更新");
      } else {
        await adminContentService.createMockExamPaper(payload);
        toast.success("试卷已创建");
      }
      closePaperEditor();
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
      await adminContentService.updateMockExamPaper(paper.id, {
        ...buildPaperPayload(toPaperForm(paper)),
        status: paper.status === "published" ? "draft" : "published",
      });
      toast.success(paper.status === "published" ? "试卷已下架为草稿" : "试卷已发布");
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
                    <Select
                      value={paperForm.paperType}
                      disabled={paperTypeLocked}
                      onValueChange={(value: AdminMockExamPaperType) =>
                        setPaperForm((current) => ({
                          ...current,
                          paperType: value,
                          reviewEnabled: value === "subjective" ? current.reviewEnabled || true : false,
                        }))
                      }
                    >
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
                        {paper.status === "published" ? "下架" : "发布"}
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
