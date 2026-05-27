import { useEffect, useMemo, useState } from "react";
import { BarChart3, FileText, Folder, Keyboard, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import type { AdminPagedResult } from "../../services/adminContentService";
import {
  adminTypingPracticeService,
  type AdminTypingPracticeFolder,
  type AdminTypingPracticeRecord,
  type AdminTypingPracticeSummary,
  type AdminTypingPracticeText,
  type AdminTypingPracticeTextPayload,
} from "../../services/adminTypingPracticeService";
import type { TypingPracticeDifficulty, TypingPracticeTextStatus } from "../../lib/mockData";

type TextForm = AdminTypingPracticeTextPayload & {
  id: string;
};

type FolderForm = {
  id: string;
  name: string;
  sortOrder: number;
};

const emptyTextPage: AdminPagedResult<AdminTypingPracticeText> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const emptyRecordPage: AdminPagedResult<AdminTypingPracticeRecord> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const emptyTextForm: TextForm = {
  id: "",
  folderId: "",
  title: "",
  difficulty: "medium",
  source: "",
  tags: "",
  content: "",
  note: "",
  status: "draft",
  sortOrder: 0,
};

const difficultyMeta: Record<TypingPracticeDifficulty, { label: string; className: string }> = {
  easy: { label: "入门", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  medium: { label: "标准", className: "border-blue-100 bg-blue-50 text-blue-700" },
  hard: { label: "挑战", className: "border-rose-100 bg-rose-50 text-rose-700" },
};

const statusMeta: Record<TypingPracticeTextStatus, { label: string; className: string }> = {
  published: { label: "已发布", className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  draft: { label: "草稿", className: "border-slate-200 bg-slate-50 text-slate-700" },
};

const toTextForm = (text: AdminTypingPracticeText): TextForm => ({
  id: text.id,
  folderId: text.folderId,
  title: text.title,
  difficulty: text.difficulty,
  source: text.source,
  tags: text.tags.join("，"),
  content: text.content,
  note: text.note,
  status: text.status,
  sortOrder: text.sortOrder,
});

const buildTextPayload = (form: TextForm): AdminTypingPracticeTextPayload => ({
  folderId: form.folderId,
  title: form.title.trim(),
  difficulty: form.difficulty,
  source: `${form.source ?? ""}`.trim(),
  tags: form.tags,
  content: form.content,
  note: `${form.note ?? ""}`.trim(),
  status: form.status,
  sortOrder: Number(form.sortOrder) || 0,
});

const formatDuration = (seconds: number) => {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remain = value % 60;
  return `${minutes}:${`${remain}`.padStart(2, "0")}`;
};

export function TypingPracticeManagement() {
  const [summary, setSummary] = useState<AdminTypingPracticeSummary | null>(null);
  const [folders, setFolders] = useState<AdminTypingPracticeFolder[]>([]);
  const [texts, setTexts] = useState<AdminPagedResult<AdminTypingPracticeText>>(emptyTextPage);
  const [records, setRecords] = useState<AdminPagedResult<AdminTypingPracticeRecord>>(emptyRecordPage);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<TypingPracticeTextStatus | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [textPage, setTextPage] = useState(1);
  const [recordKeyword, setRecordKeyword] = useState("");
  const [recordPage, setRecordPage] = useState(1);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [textForm, setTextForm] = useState<TextForm>(emptyTextForm);
  const [textSaving, setTextSaving] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderForm, setFolderForm] = useState<FolderForm>({ id: "", name: "", sortOrder: 0 });

  const [folderSaving, setFolderSaving] = useState(false);

  const summaryCards = useMemo(
    () => [
      { label: "文件夹", value: summary?.totalFolders ?? 0, icon: Folder },
      { label: "练习文本", value: summary?.totalTexts ?? 0, icon: FileText },
      { label: "已发布", value: summary?.publishedTexts ?? 0, icon: Keyboard },
      { label: "练习记录", value: summary?.totalRecords ?? 0, icon: BarChart3 },
    ],
    [summary],
  );

  const loadBasics = async () => {
    const [nextSummary, nextFolders] = await Promise.all([
      adminTypingPracticeService.getSummary(),
      adminTypingPracticeService.getFolders(),
    ]);
    setSummary(nextSummary);
    setFolders(nextFolders);
  };

  const loadTexts = async (
    page = textPage,
    filters: { keyword?: string; status?: TypingPracticeTextStatus | "all"; folderId?: string } = {},
  ) => {
    const payload = await adminTypingPracticeService.getTexts({
      folderId: filters.folderId ?? folderId,
      keyword: (filters.keyword ?? keyword).trim(),
      status: filters.status ?? statusFilter,
      page,
      pageSize: 20,
    });
    setTexts(payload);
    setTextPage(payload.page);
  };

  const resetFiltersAndLoad = () => {
    setKeyword("");
    setStatusFilter("all");
    setTextPage(1);
    void loadTexts(1, { keyword: "", status: "all" });
  };

  const loadRecords = async (page = recordPage) => {
    const payload = await adminTypingPracticeService.getRecords({
      keyword: recordKeyword.trim(),
      page,
      pageSize: 20,
    });
    setRecords(payload);
    setRecordPage(payload.page);
  };

  const refreshTexts = async (page = textPage) => {
    await Promise.all([loadBasics(), loadTexts(page)]);
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      setLoading(true);
      try {
        const [nextSummary, nextFolders, nextTexts, nextRecords] = await Promise.all([
          adminTypingPracticeService.getSummary(),
          adminTypingPracticeService.getFolders(),
          adminTypingPracticeService.getTexts({ page: 1, pageSize: 20, status: "all" }),
          adminTypingPracticeService.getRecords({ page: 1, pageSize: 20 }),
        ]);
        if (!active) return;
        setSummary(nextSummary);
        setFolders(nextFolders);
        setTexts(nextTexts);
        setRecords(nextRecords);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "打字练习后台加载失败");
      } finally {
        if (active) setLoading(false);
      }
    };
    void boot();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setTextPage(1);
    if (!loading) void loadTexts(1);
  }, [folderId, statusFilter]);

  const openCreateText = () => {
    setTextForm({
      ...emptyTextForm,
      folderId: folderId !== "all" ? folderId : folders[0]?.id ?? "",
      sortOrder: texts.total + 1,
    });
    setTextDialogOpen(true);
  };

  const openEditText = (text: AdminTypingPracticeText) => {
    setTextForm(toTextForm(text));
    setTextDialogOpen(true);
  };

  const saveText = async () => {
    if (!textForm.folderId) {
      toast.error("请选择文件夹");
      return;
    }
    if (!textForm.title.trim()) {
      toast.error("请输入文本标题");
      return;
    }
    if (textForm.content.trim().length < 20) {
      toast.error("练习文本至少需要 20 个字符");
      return;
    }

    setTextSaving(true);
    try {
      const payload = buildTextPayload(textForm);
      if (textForm.id) {
        await adminTypingPracticeService.updateText(textForm.id, payload);
        toast.success("练习文本已更新");
      } else {
        await adminTypingPracticeService.createText(payload);
        toast.success("练习文本已创建");
      }
      setTextDialogOpen(false);
      await refreshTexts(textPage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存练习文本失败");
    } finally {
      setTextSaving(false);
    }
  };

  const deleteText = async (text: AdminTypingPracticeText) => {
    if (!window.confirm(`确认处理练习文本「${text.title}」？有历史记录时会安全转为草稿。`)) return;
    try {
      const result = await adminTypingPracticeService.deleteText(text.id);
      toast.success(result.archived ? "已有练习记录，文本已转为草稿" : "练习文本已删除");
      await refreshTexts(textPage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除练习文本失败");
    }
  };

  const openFolderDialog = (folder?: AdminTypingPracticeFolder) => {
    setFolderForm({
      id: folder?.id ?? "",
      name: folder?.name ?? "",
      sortOrder: folder?.sortOrder ?? folders.length,
    });
    setFolderDialogOpen(true);
  };

  const saveFolder = async () => {
    if (!folderForm.name.trim()) {
      toast.error("请输入文件夹名称");
      return;
    }
    setFolderSaving(true);
    try {
      if (folderForm.id) {
        await adminTypingPracticeService.updateFolder(folderForm.id, {
          name: folderForm.name.trim(),
          sortOrder: Number(folderForm.sortOrder) || 0,
        });
        toast.success("文件夹已更新");
      } else {
        await adminTypingPracticeService.createFolder({
          name: folderForm.name.trim(),
          sortOrder: Number(folderForm.sortOrder) || 0,
        });
        toast.success("文件夹已创建");
      }
      setFolderDialogOpen(false);
      await refreshTexts(textPage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存文件夹失败");
    } finally {
      setFolderSaving(false);
    }
  };

  const deleteFolder = async (target: AdminTypingPracticeFolder) => {
    if (!window.confirm(`确认删除文件夹「${target.name}」？请先确认文件夹中没有练习文本。`)) return;
    try {
      await adminTypingPracticeService.deleteFolder(target.id);
      if (folderId === target.id) setFolderId("all");
      toast.success("文件夹已删除");
      await refreshTexts(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除文件夹失败");
    }
  };

  if (loading) return <div className="py-10 text-slate-500">打字练习后台加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{item.label}</p>
                <Icon className="size-4 text-slate-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{item.value}</p>
            </div>
          );
        })}
      </div>

      <Tabs defaultValue="texts" className="space-y-5">
        <TabsList className="rounded-lg bg-slate-100 p-1">
          <TabsTrigger value="texts" className="rounded-md data-[state=active]:bg-white">文本管理</TabsTrigger>
          <TabsTrigger value="records" className="rounded-md data-[state=active]:bg-white">练习记录</TabsTrigger>
        </TabsList>

        <TabsContent value="texts" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-slate-950">文本文件夹</h2>
                  <p className="mt-1 text-sm text-slate-500">按训练主题组织文本</p>
                </div>
                <Button size="sm" onClick={() => openFolderDialog()}>
                  <Plus className="size-4" />
                  新建
                </Button>
              </div>
              <div className="max-h-[min(560px,calc(100vh-320px))] space-y-2 overflow-auto p-3">
                <button
                  type="button"
                  onClick={() => setFolderId("all")}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${
                    folderId === "all" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-transparent text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-medium">全部文本</div>
                  <div className="mt-1 text-xs text-slate-500">{summary?.totalTexts ?? 0} 篇</div>
                </button>
                {folders.map((folder) => (
                  <div key={folder.id} className={`rounded-lg border ${folderId === folder.id ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
                    <button type="button" onClick={() => setFolderId(folder.id)} className="w-full px-4 py-3 text-left">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-slate-950">{folder.name}</p>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600">{folder.publishedTextCount}/{folder.textCount}</Badge>
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2">
                      <Button variant="ghost" size="sm" onClick={() => openFolderDialog(folder)} aria-label={`编辑文件夹 ${folder.name}`}>
                        <Pencil className="size-4" />
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" className="ml-auto text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => void deleteFolder(folder)} aria-label={`删除文件夹 ${folder.name}`}>
                        <Trash2 className="size-4" />
                        删除
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
                    <h2 className="text-lg font-semibold text-slate-950">练习文本</h2>
                    <p className="mt-1 text-sm text-slate-500">发布状态的文本会出现在用户端打字练习首页。</p>
                  </div>
                  <Button onClick={openCreateText}>
                    <Plus className="size-4" />
                    新建文本
                  </Button>
                </div>
                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_auto_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      className="pl-9"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void loadTexts(1);
                      }}
                      placeholder="搜索标题、来源、正文或文件夹"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(value: TypingPracticeTextStatus | "all") => setStatusFilter(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="published">已发布</SelectItem>
                      <SelectItem value="draft">草稿</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => void loadTexts(1)}>搜索</Button>
                  <Button variant="outline" onClick={resetFiltersAndLoad}>重置</Button>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {texts.items.length === 0 ? (
                  <div className="px-5 py-16 text-center text-sm text-slate-500">暂无练习文本</div>
                ) : (
                  texts.items.map((text) => (
                    <div key={text.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className={statusMeta[text.status].className}>{statusMeta[text.status].label}</Badge>
                          <Badge variant="outline" className={difficultyMeta[text.difficulty].className}>{difficultyMeta[text.difficulty].label}</Badge>
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{text.contentLength} 字</Badge>
                        </div>
                        <h3 className="mt-3 truncate text-base font-semibold text-slate-950">{text.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{text.preview}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>{text.folderName || "未分组"}</span>
                          {text.source ? <span>{text.source}</span> : null}
                          <span>更新 {text.updatedAt}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap content-start gap-2">
                        {text.tags.length > 0 ? (
                          text.tags.slice(0, 6).map((tag) => (
                            <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-700">{tag}</Badge>
                          ))
                        ) : (
                          <span className="text-sm text-slate-400">暂无标签</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                        <Button variant="outline" size="sm" onClick={() => openEditText(text)}>
                          <Pencil className="size-4" />
                          编辑
                        </Button>
                        <Button variant="outline" size="sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => void deleteText(text)}>
                          <Trash2 className="size-4" />
                          删除
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
                <span>第 {texts.page} / {texts.totalPages} 页，共 {texts.total} 篇</span>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={texts.page <= 1} onClick={() => void loadTexts(texts.page - 1)}>上一页</Button>
                  <Button variant="outline" disabled={texts.page >= texts.totalPages} onClick={() => void loadTexts(texts.page + 1)}>下一页</Button>
                </div>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="records" className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">练习记录</h2>
                  <p className="mt-1 text-sm text-slate-500">用于观察用户练习结果，不影响用户历史记录。</p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                  <Input
                    className="min-w-[220px] flex-1 sm:w-72"
                    value={recordKeyword}
                    onChange={(event) => setRecordKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loadRecords(1);
                    }}
                    placeholder="搜索手机号、标题或来源"
                  />
                  <Button variant="outline" className="shrink-0" onClick={() => void loadRecords(1)}>搜索</Button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3">用户</th>
                    <th className="px-4 py-3">文本</th>
                    <th className="px-4 py-3">模式</th>
                    <th className="px-4 py-3">成绩</th>
                    <th className="px-4 py-3">正确率/完成度</th>
                    <th className="px-4 py-3">用时</th>
                    <th className="px-4 py-3">完成时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-slate-500">暂无练习记录</td>
                    </tr>
                  ) : (
                    records.items.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4 text-slate-700">{record.userLabel}</td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">{record.title}</p>
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{record.targetPreview}</p>
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{record.modeLabel}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-900">{record.score}</p>
                          <p className="mt-1 text-xs text-slate-500">{record.cpm} CPM</p>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{record.accuracyRate}% / {record.completionRate}%</td>
                        <td className="px-4 py-4 text-slate-600">{formatDuration(record.durationSeconds)}</td>
                        <td className="px-4 py-4 text-xs text-slate-500">{record.completedAt}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
              <span>第 {records.page} / {records.totalPages} 页，共 {records.total} 条</span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={records.page <= 1} onClick={() => void loadRecords(records.page - 1)}>上一页</Button>
                <Button variant="outline" disabled={records.page >= records.totalPages} onClick={() => void loadRecords(records.page + 1)}>下一页</Button>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={textDialogOpen} onOpenChange={setTextDialogOpen}>
        <DialogContent className="flex h-[calc(100vh-40px)] w-[calc(100vw-40px)] max-w-[1180px] flex-col overflow-hidden border border-slate-200 bg-white p-0 text-slate-900 sm:max-w-[1180px]">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>{textForm.id ? "编辑练习文本" : "新建练习文本"}</DialogTitle>
            <DialogDescription>发布后的文本会进入用户端打字练习首页，游戏页仍沿用原有警察抓小偷流程。</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>标题</Label>
                    <Input value={textForm.title} onChange={(event) => setTextForm((current) => ({ ...current, title: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>文件夹</Label>
                    <Select value={textForm.folderId} onValueChange={(value) => setTextForm((current) => ({ ...current, folderId: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择文件夹" />
                      </SelectTrigger>
                      <SelectContent>
                        {folders.map((folder) => (
                          <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>难度</Label>
                    <Select value={textForm.difficulty} onValueChange={(value: TypingPracticeDifficulty) => setTextForm((current) => ({ ...current, difficulty: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">入门</SelectItem>
                        <SelectItem value="medium">标准</SelectItem>
                        <SelectItem value="hard">挑战</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>状态</Label>
                    <Select value={textForm.status} onValueChange={(value: TypingPracticeTextStatus) => setTextForm((current) => ({ ...current, status: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="published">已发布</SelectItem>
                        <SelectItem value="draft">草稿</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>来源</Label>
                    <Input value={textForm.source} onChange={(event) => setTextForm((current) => ({ ...current, source: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>排序</Label>
                    <Input type="number" value={textForm.sortOrder} onChange={(event) => setTextForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>标签</Label>
                    <Input value={textForm.tags as string} onChange={(event) => setTextForm((current) => ({ ...current, tags: event.target.value }))} placeholder="多个标签用逗号、顿号或换行分隔" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>练习正文</Label>
                  <Textarea
                    rows={18}
                    value={textForm.content}
                    onChange={(event) => setTextForm((current) => ({ ...current, content: event.target.value }))}
                    className="min-h-[420px] resize-y overflow-y-auto font-mono leading-7"
                  />
                  <p className="text-xs text-slate-500">当前 {textForm.content.trim().length} 字，最少 20 字。换行会原样保留到用户端练习文本中。</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-medium text-slate-900">预览信息</p>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <p>文件夹：{folders.find((folder) => folder.id === textForm.folderId)?.name || "-"}</p>
                    <p>难度：{difficultyMeta[textForm.difficulty].label}</p>
                    <p>状态：{statusMeta[textForm.status].label}</p>
                    <p>字数：{textForm.content.trim().length}</p>
                  </div>
                  <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-xs font-medium text-slate-500">正文预览</p>
                    <div className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {textForm.content.trim() ? textForm.content.trim().slice(0, 500) : "填写正文后这里会显示用户端文本预览。"}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>备注</Label>
                  <Textarea rows={10} value={textForm.note} onChange={(event) => setTextForm((current) => ({ ...current, note: event.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setTextDialogOpen(false)} disabled={textSaving}>取消</Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => void saveText()} disabled={textSaving}>
              {textSaving ? "保存中..." : "保存文本"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>{folderForm.id ? "编辑文件夹" : "新建文件夹"}</DialogTitle>
            <DialogDescription>文件夹用于组织用户端可选择的打字练习文本。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>文件夹名称</Label>
              <Input value={folderForm.name} onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>排序</Label>
              <Input type="number" value={folderForm.sortOrder} onChange={(event) => setFolderForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)} disabled={folderSaving}>取消</Button>
            <Button onClick={() => void saveFolder()} disabled={folderSaving}>{folderSaving ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
