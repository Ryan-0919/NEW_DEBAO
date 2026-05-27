import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Eye, Loader2, RefreshCw, Save, Search, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  AdminExamPaperOption,
  AdminExamRecord,
  AdminExamRecordDetail,
  AdminExamRecordScorePage,
  AdminExamRecordSummary,
  adminOperationsService,
} from "../../services/adminOperationsService";

const PAGE_SIZE = 20;

const emptySummary: AdminExamRecordSummary = {
  total: 0,
  submitted: 0,
  inProgress: 0,
  pendingReview: 0,
  published: 0,
  objective: 0,
  subjective: 0,
  generatedAt: "",
};

const statusClassName: Record<string, string> = {
  in_progress: "border-amber-200 bg-amber-50 text-amber-800",
  submitted: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const reviewClassName: Record<string, string> = {
  not_required: "border-slate-200 bg-slate-50 text-slate-700",
  ai_pending: "border-amber-200 bg-amber-50 text-amber-800",
  ai_processing: "border-blue-200 bg-blue-50 text-blue-700",
  manual_pending: "border-violet-200 bg-violet-50 text-violet-700",
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainSeconds = safeSeconds % 60;
  if (hours > 0) return `${hours}小时${minutes}分`;
  if (minutes > 0) return `${minutes}分${remainSeconds}秒`;
  return `${remainSeconds}秒`;
};

const exportRecords = (records: AdminExamRecord[], fileName: string) => {
  if (records.length === 0) {
    toast.error("当前没有可导出的考试记录");
    return;
  }

  const sheet = XLSX.utils.json_to_sheet(
    records.map((record) => ({
      记录ID: record.id,
      手机号: record.userPhone,
      昵称: record.userNickname,
      试卷: record.paperTitle,
      套卷: record.seriesName,
      类型: record.paperTypeLabel,
      状态: record.statusLabel,
      批改状态: record.reviewWorkflowStatusLabel,
      次数: record.attemptNo,
      得分: record.score,
      满分: record.paperTotalScore,
      正确数: record.correctCount,
      已答: record.answeredCount,
      题量: record.questionCount,
      用时: formatDuration(record.consumedSeconds),
      手动排名: record.manualRank ?? "",
      开考时间: record.startedAt,
      交卷时间: record.submittedAt,
      发布时间: record.publishedAt,
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "考试记录");
  XLSX.writeFile(workbook, fileName);
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function MockExamRecordManagement() {
  const [summary, setSummary] = useState<AdminExamRecordSummary>(emptySummary);
  const [papers, setPapers] = useState<AdminExamPaperOption[]>([]);
  const [records, setRecords] = useState<AdminExamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [paperId, setPaperId] = useState("all");
  const [paperType, setPaperType] = useState("all");
  const [status, setStatus] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [page, setPage] = useState({ page: 1, total: 0, totalPages: 1 });
  const [detail, setDetail] = useState<AdminExamRecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scorePage, setScorePage] = useState<AdminExamRecordScorePage | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [rankDrafts, setRankDrafts] = useState<Record<string, string>>({});
  const [savingRanks, setSavingRanks] = useState(false);

  const paperMap = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);

  const loadReferenceData = async () => {
    try {
      const [summaryPayload, paperPayload] = await Promise.all([
        adminOperationsService.getExamRecordSummary(),
        adminOperationsService.getExamPapers({ paperType }),
      ]);
      setSummary(summaryPayload);
      setPapers(paperPayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载考试记录基础数据失败");
    }
  };

  const loadRecords = async (nextPage = page.page) => {
    setLoading(true);
    try {
      const payload = await adminOperationsService.getExamRecords({
        page: nextPage,
        pageSize: PAGE_SIZE,
        keyword: keyword.trim(),
        paperId,
        paperType,
        status,
        reviewWorkflowStatus: reviewStatus,
      });
      setRecords(payload.items);
      setPage({ page: payload.page, total: payload.total, totalPages: payload.totalPages });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载考试记录失败");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async (nextPage = 1) => {
    await Promise.all([loadReferenceData(), loadRecords(nextPage)]);
  };

  useEffect(() => {
    void refresh(1);
  }, []);

  const openDetail = async (record: AdminExamRecord) => {
    setDetailLoading(true);
    try {
      setDetail(await adminOperationsService.getExamRecordDetail(record.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载考试记录详情失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const openScores = async (nextPaperId: string, nextPage = 1) => {
    if (!nextPaperId || nextPaperId === "all") {
      toast.error("请先选择一张试卷");
      return;
    }
    setScoreLoading(true);
    try {
      const payload = await adminOperationsService.getPaperScores(nextPaperId, {
        page: nextPage,
        pageSize: 30,
        keyword: keyword.trim(),
        status: "submitted",
      });
      setScorePage(payload);
      setRankDrafts(Object.fromEntries(payload.items.map((item) => [item.userId, item.manualRank == null ? "" : `${item.manualRank}`])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载试卷成绩失败");
    } finally {
      setScoreLoading(false);
    }
  };

  const saveRanks = async () => {
    if (!scorePage) return;
    setSavingRanks(true);
    try {
      await adminOperationsService.updatePaperLeaderboardRanks(
        scorePage.paper.id,
        scorePage.items.map((item) => ({
          userId: item.userId,
          manualRank: rankDrafts[item.userId] ? Number(rankDrafts[item.userId]) : null,
        })),
      );
      toast.success("排行榜名次已保存");
      await openScores(scorePage.paper.id, scorePage.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存排行榜失败");
    } finally {
      setSavingRanks(false);
    }
  };

  const selectedPaper = paperId === "all" ? null : paperMap.get(paperId) ?? null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="总记录" value={summary.total} />
        <StatCard label="已交卷" value={summary.submitted} />
        <StatCard label="进行中" value={summary.inProgress} />
        <StatCard label="待批改" value={summary.pendingReview} />
        <StatCard label="已发布" value={summary.published} />
        <StatCard label="客观题记录" value={summary.objective} />
        <StatCard label="主观题记录" value={summary.subjective} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">学员考试记录</h2>
              <p className="mt-1 text-sm text-slate-500">独立查看所有机考记录、按试卷维护排行榜，批改仍在批改中心处理。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading} onClick={() => void refresh(page.page)}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                刷新
              </Button>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => exportRecords(records, "学员考试记录.xlsx")}>
                <Download className="size-4" />
                导出当前页
              </Button>
              <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={!selectedPaper} onClick={() => void openScores(paperId, 1)}>
                <Trophy className="size-4" />
                维护当前试卷排行
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-100 px-5 py-4 lg:grid-cols-[minmax(260px,1fr)_220px_160px_160px_180px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void loadRecords(1); }}
              placeholder="搜索手机号、昵称、试卷、记录ID"
            />
          </div>
          <Select value={paperId} onValueChange={setPaperId}>
            <SelectTrigger className="border-slate-200 bg-white text-slate-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80 border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">全部试卷</SelectItem>
              {papers.map((paper) => (
                <SelectItem key={paper.id} value={paper.id}>
                  {paper.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paperType} onValueChange={setPaperType}>
            <SelectTrigger className="border-slate-200 bg-white text-slate-800"><SelectValue /></SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="objective">客观题</SelectItem>
              <SelectItem value="subjective">主观题</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="border-slate-200 bg-white text-slate-800"><SelectValue /></SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="in_progress">进行中</SelectItem>
              <SelectItem value="submitted">已交卷</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reviewStatus} onValueChange={setReviewStatus}>
            <SelectTrigger className="border-slate-200 bg-white text-slate-800"><SelectValue /></SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">全部批改状态</SelectItem>
              <SelectItem value="not_required">无需批改</SelectItem>
              <SelectItem value="ai_pending">待批改</SelectItem>
              <SelectItem value="ai_processing">AI批改中</SelectItem>
              <SelectItem value="manual_pending">人工处理中</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => void loadRecords(1)}>
            搜索
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-5 py-3">学员</th>
                <th className="px-5 py-3">试卷</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">分数</th>
                <th className="px-5 py-3">作答</th>
                <th className="px-5 py-3">用时</th>
                <th className="px-5 py-3">时间</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-500">{loading ? "考试记录加载中..." : "暂无考试记录"}</td></tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">{record.userNickname || record.userPhone || record.userId}</p>
                      <p className="mt-1 text-xs text-slate-500">{record.userPhone || record.userId}</p>
                    </td>
                    <td className="max-w-[320px] px-5 py-4">
                      <p className="truncate font-medium text-slate-900">{record.paperTitle}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{record.seriesName || "未分套卷"} · {record.paperTypeLabel} · {record.paperCode}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-start gap-2">
                        <Badge variant="outline" className={statusClassName[record.status] ?? "border-slate-200 bg-slate-50 text-slate-700"}>{record.statusLabel}</Badge>
                        <Badge variant="outline" className={reviewClassName[record.reviewWorkflowStatus] ?? "border-slate-200 bg-slate-50 text-slate-700"}>{record.reviewWorkflowStatusLabel}</Badge>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">{record.score}/{record.paperTotalScore}</p>
                      <p className="mt-1 text-xs text-slate-500">排名 {record.manualRank ?? "-"}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{record.answeredCount}/{record.questionCount}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDuration(record.consumedSeconds)}</td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      <p>开始 {record.startedAt || "-"}</p>
                      <p className="mt-1">交卷 {record.submittedAt || "-"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => void openDetail(record)}>
                          <Eye className="size-4" />
                          详情
                        </Button>
                        <Button variant="outline" size="sm" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => void openScores(record.paperId, 1)}>
                          <Trophy className="size-4" />
                          排行
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
          <span>第 {page.page} / {page.totalPages} 页，共 {page.total} 条</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page.page <= 1 || loading} onClick={() => void loadRecords(page.page - 1)}>上一页</Button>
            <Button variant="outline" disabled={page.page >= page.totalPages || loading} onClick={() => void loadRecords(page.page + 1)}>下一页</Button>
          </div>
        </div>
      </section>

      <Dialog open={Boolean(detail) || detailLoading} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-48px)] max-w-[1120px] overflow-y-auto border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>考试记录详情</DialogTitle>
            <DialogDescription>{detail ? `${detail.userLabel} · ${detail.paperTitle} · 第 ${detail.attemptNo} 次` : "加载中..."}</DialogDescription>
          </DialogHeader>
          {detailLoading && !detail ? (
            <div className="py-16 text-center text-slate-500">详情加载中...</div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">分数</p><p className="mt-2 text-lg font-semibold">{detail.score}/{detail.paperTotalScore}</p></div>
                <div className="rounded-lg bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">状态</p><p className="mt-2 text-lg font-semibold">{detail.statusLabel}</p></div>
                <div className="rounded-lg bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">批改</p><p className="mt-2 text-lg font-semibold">{detail.reviewWorkflowStatusLabel}</p></div>
                <div className="rounded-lg bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">用时</p><p className="mt-2 text-lg font-semibold">{formatDuration(detail.consumedSeconds)}</p></div>
              </div>
              <div className="rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-950">答案与批改摘要</div>
                <div className="max-h-[48vh] divide-y divide-slate-100 overflow-y-auto">
                  {detail.answers.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-500">暂无答案记录</div>
                  ) : (
                    detail.answers.map((answer) => (
                      <div key={answer.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
                        <div>
                          <p className="font-mono text-xs text-slate-500">{answer.questionId}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{answer.score} 分</p>
                        </div>
                        <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{JSON.stringify(answer.answer, null, 2)}</pre>
                        <pre className="max-h-48 overflow-auto rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{JSON.stringify(answer.review, null, 2)}</pre>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => setDetail(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(scorePage)} onOpenChange={(open) => { if (!open) setScorePage(null); }}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-48px)] max-w-[1200px] overflow-y-auto border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>试卷成绩与排行榜</DialogTitle>
            <DialogDescription>{scorePage ? `${scorePage.paper.title} · 共 ${scorePage.total} 条交卷记录` : "加载中..."}</DialogDescription>
          </DialogHeader>
          {scorePage ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">{scorePage.paper.seriesName || "未分套卷"} · {scorePage.paper.paperTypeLabel}</div>
                <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => exportRecords(scorePage.items, `${scorePage.paper.title}-成绩.xlsx`)}>
                  <Download className="size-4" />
                  导出成绩
                </Button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <tr>
                      <th className="px-4 py-3">学员</th>
                      <th className="px-4 py-3">分数</th>
                      <th className="px-4 py-3">正确/已答</th>
                      <th className="px-4 py-3">用时</th>
                      <th className="px-4 py-3">交卷时间</th>
                      <th className="px-4 py-3">手动排名</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scoreLoading ? (
                      <tr><td colSpan={6} className="py-12 text-center text-slate-500">成绩加载中...</td></tr>
                    ) : scorePage.items.length === 0 ? (
                      <tr><td colSpan={6} className="py-12 text-center text-slate-500">暂无交卷记录</td></tr>
                    ) : (
                      scorePage.items.map((record) => (
                        <tr key={record.id}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-950">{record.userNickname || record.userPhone}</p>
                            <p className="mt-1 text-xs text-slate-500">{record.userPhone}</p>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-950">{record.score}/{record.paperTotalScore}</td>
                          <td className="px-4 py-3 text-slate-600">{record.correctCount}/{record.answeredCount}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDuration(record.consumedSeconds)}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{record.submittedAt || "-"}</td>
                          <td className="px-4 py-3">
                            <Input
                              className="w-28 border-slate-200 bg-white text-slate-900"
                              type="number"
                              min={1}
                              value={rankDrafts[record.userId] ?? ""}
                              onChange={(event) => setRankDrafts((current) => ({ ...current, [record.userId]: event.target.value }))}
                              placeholder="自动"
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <span>第 {scorePage.page} / {scorePage.totalPages} 页，共 {scorePage.total} 条</span>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={scorePage.page <= 1 || scoreLoading} onClick={() => void openScores(scorePage.paper.id, scorePage.page - 1)}>上一页</Button>
                  <Button variant="outline" disabled={scorePage.page >= scorePage.totalPages || scoreLoading} onClick={() => void openScores(scorePage.paper.id, scorePage.page + 1)}>下一页</Button>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => setScorePage(null)}>
              关闭
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={!scorePage || savingRanks} onClick={() => void saveRanks()}>
              {savingRanks ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存排名
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
