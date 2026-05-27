import { useEffect, useMemo, useState } from "react";
import { Database, Eye, EyeOff, FileText, Pin, RefreshCw, Scale, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Textarea } from "../../components/ui/textarea";
import { adminLawService, type AdminLawRecord, type AdminLawRecordDetail, type AdminLawSummary, type AdminLawVisibility } from "../../services/adminLawService";
import type { AdminPagedResult } from "../../services/adminContentService";

type LawEditForm = {
  customTitle: string;
  manualSortOrder: string;
  tags: string;
  operatorNote: string;
};

const emptyEntries: AdminPagedResult<AdminLawRecord> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const createEditForm = (entry: AdminLawRecord | null): LawEditForm => ({
  customTitle: entry?.customTitle ?? "",
  manualSortOrder: entry && entry.manualSortOrder > 0 ? `${entry.manualSortOrder}` : "",
  tags: entry?.tags?.join("，") ?? "",
  operatorNote: entry?.operatorNote ?? "",
});

export function LawManagement() {
  const [summary, setSummary] = useState<AdminLawSummary | null>(null);
  const [entries, setEntries] = useState<AdminPagedResult<AdminLawRecord>>(emptyEntries);
  const [keyword, setKeyword] = useState("");
  const [topCategoryId, setTopCategoryId] = useState("all");
  const [visibility, setVisibility] = useState<AdminLawVisibility>("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingSourceLawId, setSavingSourceLawId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AdminLawRecord | null>(null);
  const [editForm, setEditForm] = useState<LawEditForm>(createEditForm(null));
  const [editSaving, setEditSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailEntry, setDetailEntry] = useState<AdminLawRecordDetail | null>(null);

  const queryKeyword = keyword.trim();

  useEffect(() => {
    setPage(1);
  }, [queryKeyword, pinnedOnly, topCategoryId, visibility]);

  const loadSummary = async () => {
    setSummary(await adminLawService.getSummary());
  };

  const loadEntries = async (nextPage = page) => {
    setLoading(true);
    try {
      const data = await adminLawService.getEntries({
        keyword: queryKeyword,
        topCategoryId,
        visibility,
        pinnedOnly,
        page: nextPage,
        pageSize: 20,
      });
      setEntries(data);
      if (data.page !== nextPage) setPage(data.page);
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = async (nextPage = page) => {
    await Promise.all([loadSummary(), loadEntries(nextPage)]);
  };

  useEffect(() => {
    let active = true;

    const boot = async () => {
      setLoading(true);
      try {
        const [nextSummary, nextEntries] = await Promise.all([
          adminLawService.getSummary(),
          adminLawService.getEntries({
            keyword: queryKeyword,
            topCategoryId,
            visibility,
            pinnedOnly,
            page,
            pageSize: 20,
          }),
        ]);
        if (!active) return;
        setSummary(nextSummary);
        setEntries(nextEntries);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "法条数据加载失败");
      } finally {
        if (active) setLoading(false);
      }
    };

    void boot();

    return () => {
      active = false;
    };
  }, [page, pinnedOnly, queryKeyword, topCategoryId, visibility]);

  const summaryCards = useMemo(
    () => [
      { label: "法条总数", value: summary?.totalRecords ?? 0, helper: "当前同步入库的全部源数据", className: "border-slate-200 bg-slate-50 text-slate-900" },
      { label: "前台可见", value: summary?.publishedRecords ?? 0, helper: "用户侧检索实际可见", className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
      { label: "已隐藏", value: summary?.hiddenRecords ?? 0, helper: "后台保留但前台不展示", className: "border-rose-200 bg-rose-50 text-rose-900" },
      { label: "置顶法条", value: summary?.pinnedRecords ?? 0, helper: "优先展示的重要法条", className: "border-amber-200 bg-amber-50 text-amber-900" },
    ],
    [summary],
  );

  const patchEntryInList = (updated: AdminLawRecord) => {
    setEntries((current) => ({
      ...current,
      items: current.items.map((item) => (item.sourceLawId === updated.sourceLawId ? updated : item)),
    }));
  };

  const handleSync = async () => {
    const confirmed = window.confirm(
      "同步远程法条会重新拉取并替换源法条数据。已配置的展示标题、置顶、隐藏、标签和运营备注会保留。确认现在同步吗？",
    );
    if (!confirmed) return;

    setSyncing(true);
    try {
      const result = await adminLawService.sync();
      toast.success(`法条同步完成，共 ${result.totalRecords} 条`);
      await refreshAll(1);
      setPage(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "法条同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const handleQuickToggle = async (entry: AdminLawRecord, field: "isPublished" | "isPinned", nextValue: boolean) => {
    if (field === "isPublished" && entry.isPublished && !nextValue) {
      const confirmed = window.confirm(`确认隐藏这条法条吗？\n${entry.displayTitle}\n隐藏后用户端法条检索将不再展示。`);
      if (!confirmed) return;
    }

    setSavingSourceLawId(entry.sourceLawId);
    try {
      const updated = await adminLawService.updateEntry(entry.sourceLawId, { [field]: nextValue });
      if ((visibility === "published" && !updated.isPublished) || (visibility === "hidden" && updated.isPublished) || (pinnedOnly && !updated.isPinned)) {
        await refreshAll(page);
      } else {
        patchEntryInList(updated);
        await loadSummary();
      }
      toast.success(field === "isPublished" ? (nextValue ? "已恢复前台显示" : "已隐藏该法条") : nextValue ? "已置顶该法条" : "已取消置顶");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "法条配置保存失败");
    } finally {
      setSavingSourceLawId(null);
    }
  };

  const openEdit = (entry: AdminLawRecord) => {
    setEditingEntry(entry);
    setEditForm(createEditForm(entry));
    setEditOpen(true);
  };

  const openDetail = async (entry: AdminLawRecord) => {
    setDetailOpen(true);
    setDetailEntry(null);
    setDetailLoading(true);
    try {
      setDetailEntry(await adminLawService.getEntryDetail(entry.sourceLawId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "法条详情加载失败");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;

    setEditSaving(true);
    try {
      const updated = await adminLawService.updateEntry(editingEntry.sourceLawId, {
        customTitle: editForm.customTitle,
        manualSortOrder: editForm.manualSortOrder,
        tags: editForm.tags,
        operatorNote: editForm.operatorNote,
      });
      patchEntryInList(updated);
      setEditingEntry(updated);
      await loadSummary();
      setEditOpen(false);
      toast.success("法条运营配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setEditSaving(false);
    }
  };

  const handleResetFilters = () => {
    setKeyword("");
    setTopCategoryId("all");
    setVisibility("all");
    setPinnedOnly(false);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <Scale className="size-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-slate-900">法条检索管理</h1>
                <p className="mt-1 text-sm leading-6 text-slate-500">同步法条源数据，并控制前台展示、置顶顺序、展示标题、标签和运营备注。</p>
              </div>
            </div>

            <Button onClick={() => void handleSync()} disabled={syncing} className="rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <RefreshCw className={syncing ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              {syncing ? "同步中..." : "同步远程法条"}
            </Button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="grid gap-4 xl:grid-cols-4">
            {summaryCards.map((item) => (
              <div key={item.label} className={`rounded-xl border p-5 ${item.className}`}>
                <p className="text-sm opacity-75">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold">{item.value}</p>
                <p className="mt-2 text-sm opacity-75">{item.helper}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_220px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索标题、目录路径、标签、备注" className="pl-10" />
            </div>

            <Select value={topCategoryId} onValueChange={setTopCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="顶级分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {(summary?.topCategories ?? []).map((item) => (
                  <SelectItem key={item.id} value={`${item.id}`}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={visibility} onValueChange={(value) => setVisibility(value as AdminLawVisibility)}>
              <SelectTrigger>
                <SelectValue placeholder="展示状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="published">仅显示中</SelectItem>
                <SelectItem value="hidden">仅已隐藏</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={handleResetFilters}>
              重置
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex min-w-0 items-start gap-2">
              <Database className="mt-1 size-4 shrink-0 text-slate-700" />
              <span>用户端法条检索会直接读取这里的展示状态、置顶规则、标题和标签；同步源数据不会覆盖运营配置。</span>
            </div>

            <label className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <Pin className="size-4 text-amber-600" />
              <span>只看置顶</span>
              <Switch checked={pinnedOnly} onCheckedChange={setPinnedOnly} />
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead>状态</TableHead>
                  <TableHead>展示标题</TableHead>
                  <TableHead>所属法典</TableHead>
                  <TableHead>目录路径</TableHead>
                  <TableHead>标签 / 备注</TableHead>
                  <TableHead className="w-[300px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-14 text-center text-slate-500">
                      法条列表加载中...
                    </TableCell>
                  </TableRow>
                ) : entries.items.length > 0 ? (
                  entries.items.map((item) => {
                    const currentSaving = savingSourceLawId === item.sourceLawId;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <Badge variant="secondary" className={item.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}>
                              {item.isPublished ? "前台显示" : "前台隐藏"}
                            </Badge>
                            {item.isPinned ? (
                              <Badge variant="secondary" className="bg-amber-50 text-amber-700">
                                已置顶
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 whitespace-normal">
                            <p className="font-medium text-slate-900">{item.displayTitle}</p>
                            {item.customTitle ? <p className="text-xs text-slate-500">原标题：{item.title}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell>{item.bookTitle || "-"}</TableCell>
                        <TableCell>
                          <div className="max-w-[420px] whitespace-normal text-sm leading-6 text-slate-600">{item.pathString}</div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[260px] space-y-2 whitespace-normal">
                            {item.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {item.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-700">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">暂无标签</span>
                            )}
                            {item.operatorNote ? <p className="line-clamp-2 text-xs leading-5 text-slate-500">{item.operatorNote}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="outline" size="sm" disabled={currentSaving} onClick={() => void handleQuickToggle(item, "isPublished", !item.isPublished)}>
                              {item.isPublished ? <EyeOff className="mr-2 size-4" /> : <Eye className="mr-2 size-4" />}
                              {item.isPublished ? "隐藏" : "显示"}
                            </Button>
                            <Button variant="outline" size="sm" disabled={currentSaving} onClick={() => void handleQuickToggle(item, "isPinned", !item.isPinned)}>
                              <Pin className="mr-2 size-4" />
                              {item.isPinned ? "取消置顶" : "置顶"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void openDetail(item)}>
                              <FileText className="mr-2 size-4" />
                              详情
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                              <Settings2 className="mr-2 size-4" />
                              编辑
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-14 text-center text-slate-500">
                      暂无匹配法条，请调整筛选条件。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Database className="size-4 text-slate-700" />
              <span>
                第 {entries.page} / {entries.totalPages} 页，共 {entries.total} 条
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={entries.page <= 1 || loading}>
                上一页
              </Button>
              <Button variant="outline" onClick={() => setPage((current) => Math.min(current + 1, entries.totalPages))} disabled={entries.page >= entries.totalPages || loading}>
                下一页
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (editSaving) return;
          setEditOpen(open);
        }}
      >
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-48px)] max-w-[760px] flex-col overflow-hidden p-0 sm:max-w-[760px]">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>编辑法条展示配置</DialogTitle>
            <DialogDescription>这里改的是用户端法条检索的运营展示，不会改动远程同步回来的原始法条正文。</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>展示标题</Label>
                <Input value={editForm.customTitle} onChange={(event) => setEditForm((current) => ({ ...current, customTitle: event.target.value }))} placeholder="留空则使用原标题" />
              </div>

              <div className="space-y-2">
                <Label>手动排序值</Label>
                <Input value={editForm.manualSortOrder} onChange={(event) => setEditForm((current) => ({ ...current, manualSortOrder: event.target.value }))} placeholder="数字越小越靠前，留空按默认顺序" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>标签</Label>
              <Input value={editForm.tags} onChange={(event) => setEditForm((current) => ({ ...current, tags: event.target.value }))} placeholder="多个标签用逗号或顿号分隔" />
            </div>

            <div className="space-y-2">
              <Label>运营备注</Label>
              <Textarea rows={6} value={editForm.operatorNote} onChange={(event) => setEditForm((current) => ({ ...current, operatorNote: event.target.value }))} placeholder="可记录适用场景、推荐理由、搜索引导词等备注" />
            </div>

            {editingEntry ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">当前原始信息</p>
                <p className="mt-3 break-words">原标题：{editingEntry.title}</p>
                <p className="mt-1 break-words">所属法典：{editingEntry.bookTitle || "-"}</p>
                <p className="mt-1 break-words leading-6">目录路径：{editingEntry.pathString}</p>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              取消
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={editSaving} className="bg-blue-600 text-white hover:bg-blue-700">
              {editSaving ? "保存中..." : "保存配置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex h-[calc(100vh-48px)] w-[calc(100vw-48px)] max-w-[1040px] flex-col overflow-hidden border border-slate-200 bg-white p-0 text-slate-900 sm:max-w-[1040px]">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>法条详情</DialogTitle>
            <DialogDescription>查看同步源数据正文和当前前台展示配置。</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {detailLoading ? <div className="py-16 text-center text-slate-500">法条详情加载中...</div> : null}
            {!detailLoading && detailEntry ? (
              <div className="space-y-5">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className={detailEntry.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}>
                      {detailEntry.isPublished ? "前台显示" : "前台隐藏"}
                    </Badge>
                    {detailEntry.isPinned ? (
                      <Badge variant="secondary" className="bg-amber-50 text-amber-700">
                        已置顶
                      </Badge>
                    ) : null}
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                      源 ID {detailEntry.sourceLawId}
                    </Badge>
                  </div>
                  <h3 className="mt-4 break-words text-xl font-semibold text-slate-950">{detailEntry.displayTitle}</h3>
                  {detailEntry.customTitle ? <p className="mt-2 break-words text-sm text-slate-500">原标题：{detailEntry.title}</p> : null}
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    <p className="break-words">所属法典：{detailEntry.bookTitle || "-"}</p>
                    <p className="break-words">顶级分类：{detailEntry.topCategoryTitle || "-"}</p>
                    <p className="break-words md:col-span-2">目录路径：{detailEntry.pathString || "-"}</p>
                  </div>
                </div>

                {detailEntry.tags.length > 0 || detailEntry.operatorNote ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                    <p className="font-medium text-slate-900">运营配置</p>
                    {detailEntry.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {detailEntry.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-700">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {detailEntry.operatorNote ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{detailEntry.operatorNote}</p> : null}
                  </div>
                ) : null}

                <div className="rounded-lg border border-slate-200 bg-white px-5 py-5">
                  <p className="mb-4 font-medium text-slate-900">同步正文</p>
                  <div className="whitespace-pre-wrap text-base leading-8 text-slate-800">{detailEntry.content || "暂无正文"}</div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              关闭
            </Button>
            {detailEntry ? (
              <Button
                className="bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => {
                  setDetailOpen(false);
                  openEdit(detailEntry);
                }}
              >
                编辑展示配置
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
