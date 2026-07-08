import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { getAdminRole } from "../../lib/admin-session";
import {
  AdminMockExamReviewGlobalRecord,
  AdminMockExamReviewerWorkload,
  adminMockExamReviewService,
} from "../../services/adminMockExamReviewService";
import { emptyReviewStats, ReviewMetricCard, ReviewRecordTable, reviewGlobalTabs, reviewPartTimeTabs } from "./reviewShared";

export type RecordStatusGroup = "ai_pending" | "ai_processing" | "teacher" | "mine" | "ai_problem" | "locked" | "published";

type ReviewRecordsPageProps = {
  initialStatus?: RecordStatusGroup;
  initialPage?: number;
};

export function ReviewRecordsPage({ initialStatus = "teacher", initialPage = 1 }: ReviewRecordsPageProps = {}) {
  const adminRole = getAdminRole();
  const isPartTimeReviewer = adminRole === "part_time_reviewer";
  const canManageAssignments = adminRole === "super_admin" || adminRole === "operations_admin" || adminRole === "review_admin";

  const [records, setRecords] = useState<AdminMockExamReviewGlobalRecord[]>([]);
  const [stats, setStats] = useState(emptyReviewStats);
  const [status, setStatus] = useState<RecordStatusGroup>(initialStatus);
  const [keyword, setKeyword] = useState("");
  const [assignedReviewerId, setAssignedReviewerId] = useState("");
  const [page, setPage] = useState({ page: initialPage, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewers, setReviewers] = useState<AdminMockExamReviewerWorkload[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [reviewerIdForBatchAssign, setReviewerIdForBatchAssign] = useState("");
  const [batchAssignLoading, setBatchAssignLoading] = useState(false);
  const [batchUnassignLoading, setBatchUnassignLoading] = useState(false);

  const tabs = isPartTimeReviewer ? reviewPartTimeTabs : reviewGlobalTabs;
  const currentTab = tabs.find((tab) => tab.key === status);
  const selectedRecordIdSet = useMemo(() => new Set(selectedRecordIds), [selectedRecordIds]);
  const allCurrentPageSelected = records.length > 0 && records.every((record) => selectedRecordIdSet.has(record.id));

  const loadRecords = async (nextStatus = status, nextPage = page.page, nextAssignedReviewerId = assignedReviewerId) => {
    setLoading(true);
    try {
      const payload = await adminMockExamReviewService.getRecords({
        page: nextPage,
        pageSize: 20,
        status: nextStatus,
        keyword: keyword.trim(),
        assignedReviewerId: canManageAssignments ? nextAssignedReviewerId : undefined,
      });
      setRecords(payload.items);
      setStats(payload.stats);
      setPage({ page: payload.page, totalPages: payload.totalPages, total: payload.total });
      setSelectedRecordIds([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载试卷列表失败");
    } finally {
      setLoading(false);
    }
  };

  const loadReviewers = async () => {
    if (!canManageAssignments) return;
    try {
      const payload = await adminMockExamReviewService.getReviewers();
      setReviewers(payload);
      setReviewerIdForBatchAssign((current) => current || payload[0]?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载批改老师失败");
    }
  };

  useEffect(() => {
    void loadRecords(status, initialPage);
  }, []);

  useEffect(() => {
    if (!canManageAssignments) return;
    void loadReviewers();
  }, [canManageAssignments]);

  const buildReturnTo = (nextStatus = status, nextPage = page.page) => {
    const params = new URLSearchParams();
    params.set("status", nextStatus);
    if (nextPage > 1) params.set("page", `${nextPage}`);
    if (canManageAssignments && assignedReviewerId) params.set("assignedReviewerId", assignedReviewerId);
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

  const toggleRecord = (recordId: string, selected: boolean) => {
    setSelectedRecordIds((current) => {
      if (selected) {
        return current.includes(recordId) ? current : [...current, recordId];
      }
      return current.filter((item) => item !== recordId);
    });
  };

  const toggleAllRecords = (selected: boolean) => {
    setSelectedRecordIds(selected ? records.map((record) => record.id) : []);
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

  const batchAssignReviewer = async () => {
    if (!canManageAssignments) return;
    if (selectedRecordIds.length === 0) {
      toast.error("请先选择需要分配的试卷");
      return;
    }
    if (!reviewerIdForBatchAssign) {
      toast.error("请先选择批改老师");
      return;
    }
    const reviewer = reviewers.find((item) => item.id === reviewerIdForBatchAssign);
    if (!reviewer) {
      toast.error("当前选择的批改老师不存在");
      return;
    }
    if (!window.confirm(`确认将已选择的 ${selectedRecordIds.length} 份试卷分配/改派给 ${reviewer.name || reviewer.account} 吗？`)) return;

    setBatchAssignLoading(true);
    try {
      const payload = await adminMockExamReviewService.batchAssignReviewer(selectedRecordIds, reviewer.id);
      if (payload.failedCount > 0) {
        const failedMessage = payload.results.find((item) => !item.success)?.message ?? "部分试卷分配失败";
        toast.warning(`已分配 ${payload.successCount} 份，失败 ${payload.failedCount} 份：${failedMessage}`);
      } else {
        toast.success(`已将 ${payload.successCount} 份试卷分配给 ${reviewer.name || reviewer.account}`);
      }
      await Promise.all([loadRecords(status, page.page), loadReviewers()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量分配失败");
    } finally {
      setBatchAssignLoading(false);
    }
  };

  const batchUnassignReviewer = async () => {
    if (!canManageAssignments) return;
    if (selectedRecordIds.length === 0) {
      toast.error("请先选择需要收回的试卷");
      return;
    }
    if (!window.confirm(`确认将已选择的 ${selectedRecordIds.length} 份试卷收回到未分配公共池吗？`)) return;

    setBatchUnassignLoading(true);
    try {
      const payload = await adminMockExamReviewService.batchUnassignReviewer(selectedRecordIds);
      if (payload.failedCount > 0) {
        const failedMessage = payload.results.find((item) => !item.success)?.message ?? "部分试卷收回失败";
        toast.warning(`已收回 ${payload.successCount} 份，失败 ${payload.failedCount} 份：${failedMessage}`);
      } else {
        toast.success(`已收回 ${payload.successCount} 份试卷到公共池`);
      }
      await Promise.all([loadRecords(status, page.page), loadReviewers()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量收回失败");
    } finally {
      setBatchUnassignLoading(false);
    }
  };

  const unassignSingleRecord = async (record: AdminMockExamReviewGlobalRecord) => {
    if (!canManageAssignments) return;
    if (!window.confirm(`确认收回 ${record.userLabel} 的试卷到未分配公共池吗？`)) return;
    setActionLoading(true);
    try {
      await adminMockExamReviewService.unassignReviewer(record.id);
      toast.success("试卷已收回到公共池");
      await Promise.all([loadRecords(status, page.page), loadReviewers()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "收回试卷失败");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">全局批改队列</p>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight text-slate-950">{currentTab?.label ?? "试卷列表"}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              {isPartTimeReviewer
                ? "这里只显示分配给当前老师的试卷，领取后进入单卷工作台完成修改并发送。"
                : "这里支持在全局待老师批改队列中直接分配、改派和收回老师名下试卷。"}
            </p>
          </div>
          <Button
            className="h-11 justify-self-start rounded-full border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50 xl:justify-self-end"
            variant="outline"
            disabled={loading}
            onClick={() => void loadRecords(status, page.page)}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>

        <div className={`mt-4 grid gap-2 md:grid-cols-3 ${isPartTimeReviewer ? "xl:grid-cols-3" : "xl:grid-cols-7"}`}>
          {!isPartTimeReviewer ? <ReviewMetricCard label="AI待批改" value={stats.aiPending} tone="amber" /> : null}
          {!isPartTimeReviewer ? <ReviewMetricCard label="AI正在批改" value={stats.aiProcessing} tone="blue" /> : null}
          <ReviewMetricCard label="待老师批改" value={stats.manualPending} tone="violet" />
          <ReviewMetricCard label="我领取的" value={stats.mine} tone="blue" />
          <ReviewMetricCard label="已批改" value={stats.published} tone="emerald" />
          {!isPartTimeReviewer ? <ReviewMetricCard label="已锁定" value={stats.locked} /> : null}
          {!isPartTimeReviewer ? <ReviewMetricCard label="AI异常" value={stats.aiProblem} tone="amber" /> : null}
        </div>
      </section>

      <section className="rounded-[16px] border border-slate-200 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] xl:items-center">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => {
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
            {canManageAssignments ? (
              <select
                className="h-11 min-w-[220px] rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-300"
                value={assignedReviewerId}
                onChange={(event) => setAssignedReviewerId(event.target.value)}
              >
                <option value="">全部老师</option>
                {reviewers.map((reviewer) => (
                  <option key={reviewer.id} value={reviewer.id}>
                    {reviewer.name || reviewer.account}
                  </option>
                ))}
              </select>
            ) : null}
            {canManageAssignments ? (
              <select
                className="h-11 min-w-[320px] rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-300"
                value={reviewerIdForBatchAssign}
                onChange={(event) => setReviewerIdForBatchAssign(event.target.value)}
              >
                {reviewers.length === 0 ? <option value="">暂无批改老师</option> : null}
                {reviewers.map((reviewer) => (
                  <option key={reviewer.id} value={reviewer.id}>
                    {`${reviewer.name || reviewer.account} · 近1小时 ${reviewer.lastHourCount} · 今日 ${reviewer.todayCount} · 总量 ${reviewer.totalCount} · 待处理 ${reviewer.assignedPendingCount}`}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="relative w-full max-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-11 rounded-full pl-9"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadRecords(status, 1);
                }}
                placeholder="搜索试卷、编号、学员、手机号"
              />
            </div>
            <Button className="h-11 rounded-full px-5" variant="outline" onClick={() => void loadRecords(status, 1)}>
              搜索
            </Button>
            {canManageAssignments ? (
              <Button
                className="h-11 rounded-full bg-indigo-600 px-5 text-white hover:bg-indigo-700"
                disabled={selectedRecordIds.length === 0 || batchAssignLoading}
                onClick={() => void batchAssignReviewer()}
              >
                批量分配/改派{selectedRecordIds.length > 0 ? `（${selectedRecordIds.length}）` : ""}
              </Button>
            ) : null}
            {canManageAssignments ? (
              <Button
                className="h-11 rounded-full border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50"
                variant="outline"
                disabled={selectedRecordIds.length === 0 || batchUnassignLoading}
                onClick={() => void batchUnassignReviewer()}
              >
                收回到公共池{selectedRecordIds.length > 0 ? `（${selectedRecordIds.length}）` : ""}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <ReviewRecordTable
        records={records}
        loading={loading || actionLoading || batchAssignLoading || batchUnassignLoading}
        showPaper
        selectedRecordIds={selectedRecordIdSet}
        allCurrentPageSelected={allCurrentPageSelected}
        onToggleRecord={toggleRecord}
        onToggleAll={toggleAllRecords}
        onOpen={(record) => openRecord(record as AdminMockExamReviewGlobalRecord)}
        onClaim={(record) => void claimRecord(record as AdminMockExamReviewGlobalRecord)}
        onUnassign={canManageAssignments ? (record) => void unassignSingleRecord(record as AdminMockExamReviewGlobalRecord) : undefined}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
        <span>第 {page.page} / {page.totalPages} 页，共 {page.total} 条</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page.page <= 1 || loading} onClick={() => void loadRecords(status, page.page - 1)}>
            上一页
          </Button>
          <Button variant="outline" disabled={page.page >= page.totalPages || loading} onClick={() => void loadRecords(status, page.page + 1)}>
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
