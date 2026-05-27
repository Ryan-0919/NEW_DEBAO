import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AdminMockExamReviewGlobalRecord, adminMockExamReviewService } from "../../services/adminMockExamReviewService";
import { emptyReviewStats, ReviewMetricCard, ReviewRecordTable, reviewGlobalTabs } from "./reviewShared";

export type RecordStatusGroup = "ai_pending" | "ai_processing" | "teacher" | "mine" | "ai_problem" | "locked" | "published";

type ReviewRecordsPageProps = {
  initialStatus?: RecordStatusGroup;
  initialPage?: number;
};

export function ReviewRecordsPage({ initialStatus = "teacher", initialPage = 1 }: ReviewRecordsPageProps = {}) {
  const [records, setRecords] = useState<AdminMockExamReviewGlobalRecord[]>([]);
  const [stats, setStats] = useState(emptyReviewStats);
  const [status, setStatus] = useState<RecordStatusGroup>(initialStatus);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState({ page: initialPage, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const currentTab = reviewGlobalTabs.find((tab) => tab.key === status);

  const loadRecords = async (nextStatus = status, nextPage = page.page) => {
    setLoading(true);
    try {
      const payload = await adminMockExamReviewService.getRecords({
        page: nextPage,
        pageSize: 20,
        status: nextStatus,
        keyword: keyword.trim(),
      });
      setRecords(payload.items);
      setStats(payload.stats);
      setPage({ page: payload.page, totalPages: payload.totalPages, total: payload.total });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载试卷列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords(status, initialPage);
  }, []);

  const buildReturnTo = (nextStatus = status, nextPage = page.page) => {
    const params = new URLSearchParams();
    params.set("status", nextStatus);
    if (nextPage > 1) {
      params.set("page", `${nextPage}`);
    }

    const pathname = typeof window !== "undefined" && window.location.pathname.startsWith("/adminpg/mine") ? "/adminpg/mine" : "/adminpg/reviews";
    return `${pathname}?${params.toString()}`;
  };

  const buildRecordDetailUrl = (record: AdminMockExamReviewGlobalRecord) => {
    const params = new URLSearchParams();
    params.set("recordId", record.id);
    params.set("status", status);
    params.set("returnTo", buildReturnTo());
    return `/adminpg/papers/${encodeURIComponent(record.paper.id)}?${params.toString()}`;
  };

  const switchStatus = (nextStatus: RecordStatusGroup) => {
    setStatus(nextStatus);
    void loadRecords(nextStatus, 1);
  };

  const claimRecord = async (record: AdminMockExamReviewGlobalRecord) => {
    setActionLoading(true);
    try {
      await adminMockExamReviewService.claimRecord(record.id);
      window.location.assign(buildRecordDetailUrl(record));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "领取失败");
    } finally {
      setActionLoading(false);
    }
  };

  const openRecord = (record: AdminMockExamReviewGlobalRecord) => {
    window.location.assign(buildRecordDetailUrl(record));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">全局批改队列</p>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight text-slate-950">{currentTab?.label ?? "试卷列表"}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">按当前处理阶段汇总所有试卷记录，老师可以先领取，再进入单卷工作台批改。</p>
          </div>
          <Button className="h-11 justify-self-start rounded-full border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50 xl:justify-self-end" variant="outline" disabled={loading} onClick={() => void loadRecords(status, page.page)}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-7">
          <ReviewMetricCard label="AI待批改" value={stats.aiPending} tone="amber" />
          <ReviewMetricCard label="AI正在批改" value={stats.aiProcessing} tone="blue" />
          <ReviewMetricCard label="待老师批改" value={stats.manualPending} tone="violet" />
          <ReviewMetricCard label="我领取的" value={stats.mine} tone="blue" />
          <ReviewMetricCard label="已批改" value={stats.published} tone="emerald" />
          <ReviewMetricCard label="已锁定" value={stats.locked} />
          <ReviewMetricCard label="AI异常" value={stats.aiProblem} tone="amber" />
        </div>
      </section>

      <section className="sticky top-0 z-10 rounded-[16px] border border-slate-200 bg-white/95 p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)] xl:items-center">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {reviewGlobalTabs.map((tab) => {
              const Icon = tab.icon;
              const active = status === tab.key;
              const count =
                tab.key === "ai_pending"
                  ? stats.aiPending
                  : tab.key === "ai_processing"
                    ? stats.aiProcessing
                    : tab.key === "teacher"
                      ? stats.manualPending
                      : tab.key === "mine"
                        ? stats.mine
                        : tab.key === "ai_problem"
                          ? stats.aiProblem
                          : tab.key === "locked"
                            ? stats.locked
                            : stats.published;
              return (
                <button
                  key={tab.key}
                  type="button"
                  disabled={loading}
                  className={[
                    "min-w-[136px] rounded-xl border px-3 py-2 text-left transition disabled:pointer-events-none disabled:opacity-60",
                    active ? "border-blue-600 bg-blue-600 text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)]" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:bg-blue-50",
                  ].join(" ")}
                  onClick={() => switchStatus(tab.key)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold">{tab.label}</span>
                    <Icon className="size-4 opacity-80" />
                  </div>
                  <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.04em]">{count}</p>
                </button>
              );
            })}
          </div>
          <div className="flex min-w-0 justify-end gap-2">
            <div className="relative w-full max-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input className="h-11 rounded-full pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadRecords(status, 1); }} placeholder="搜索试卷、编号、学员、手机号" />
            </div>
            <Button className="h-11 rounded-full px-5" variant="outline" onClick={() => void loadRecords(status, 1)}>搜索</Button>
          </div>
        </div>
      </section>

      <ReviewRecordTable records={records} loading={loading || actionLoading} showPaper onOpen={(record) => openRecord(record as AdminMockExamReviewGlobalRecord)} onClaim={(record) => void claimRecord(record as AdminMockExamReviewGlobalRecord)} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
        <span>第 {page.page} / {page.totalPages} 页，共 {page.total} 条</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page.page <= 1 || loading} onClick={() => void loadRecords(status, page.page - 1)}>上一页</Button>
          <Button variant="outline" disabled={page.page >= page.totalPages || loading} onClick={() => void loadRecords(status, page.page + 1)}>下一页</Button>
        </div>
      </div>
    </div>
  );
}
