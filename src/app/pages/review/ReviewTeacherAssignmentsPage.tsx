import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { AdminMockExamReviewGlobalRecord, AdminMockExamReviewerWorkload, adminMockExamReviewService } from "../../services/adminMockExamReviewService";
import { ReviewMetricCard, ReviewRecordTable } from "./reviewShared";

const getReviewerIdFromUrl = () => {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("reviewerId") ?? "";
};

const formatDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatStatsDateLabels = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const today = formatDateInputValue();
  return {
    date: value === today ? "今日" : `${month}月${day}日`,
    month: value.slice(0, 7) === today.slice(0, 7) ? "本月" : `${year}年${month}月`,
  };
};

export function ReviewTeacherAssignmentsPage() {
  const [reviewers, setReviewers] = useState<AdminMockExamReviewerWorkload[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState(() => getReviewerIdFromUrl());
  const [pendingRecords, setPendingRecords] = useState<AdminMockExamReviewGlobalRecord[]>([]);
  const [publishedRecords, setPublishedRecords] = useState<AdminMockExamReviewGlobalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [statsDate, setStatsDate] = useState(() => formatDateInputValue());
  const statsDateLabels = useMemo(() => formatStatsDateLabels(statsDate), [statsDate]);

  const selectedReviewer = useMemo(
    () => reviewers.find((item) => item.id === selectedReviewerId) ?? null,
    [reviewers, selectedReviewerId],
  );

  const syncReviewerIdToUrl = (reviewerId: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (reviewerId) url.searchParams.set("reviewerId", reviewerId);
    else url.searchParams.delete("reviewerId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };

  const loadReviewers = async (date = statsDate) => {
    setLoading(true);
    try {
      const payload = await adminMockExamReviewService.getReviewers({ date });
      setReviewers(payload);
      setSelectedReviewerId((current) => current || payload[0]?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载批改老师失败");
    } finally {
      setLoading(false);
    }
  };

  const loadReviewerRecords = async (reviewerId: string) => {
    if (!reviewerId) {
      setPendingRecords([]);
      setPublishedRecords([]);
      return;
    }
    setRecordsLoading(true);
    try {
      const [pendingPayload, publishedPayload] = await Promise.all([
        adminMockExamReviewService.getRecords({
          page: 1,
          pageSize: 100,
          status: "teacher",
          assignedReviewerId: reviewerId,
        }),
        adminMockExamReviewService.getRecords({
          page: 1,
          pageSize: 100,
          status: "published",
          assignedReviewerId: reviewerId,
        }),
      ]);
      setPendingRecords(pendingPayload.items);
      setPublishedRecords(publishedPayload.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载老师名下试卷失败");
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    void loadReviewers(statsDate);
  }, [statsDate]);

  useEffect(() => {
    syncReviewerIdToUrl(selectedReviewerId);
    void loadReviewerRecords(selectedReviewerId);
  }, [selectedReviewerId]);

  const openRecord = (record: AdminMockExamReviewGlobalRecord) => {
    const params = new URLSearchParams();
    params.set("recordId", record.id);
    params.set("returnTo", `/adminpg/reviewers?reviewerId=${encodeURIComponent(selectedReviewerId)}`);
    window.location.assign(`/adminpg/papers/${encodeURIComponent(record.paper.id)}?${params.toString()}`);
  };

  const claimRecord = async (record: AdminMockExamReviewGlobalRecord) => {
    try {
      await adminMockExamReviewService.claimRecord(record.id);
      openRecord(record);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "领取失败");
    }
  };

  const unassignRecord = async (record: AdminMockExamReviewGlobalRecord) => {
    if (!window.confirm(`确认收回 ${record.userLabel} 的试卷到未分配公共池吗？`)) return;
    try {
      await adminMockExamReviewService.unassignReviewer(record.id);
      toast.success("试卷已收回到公共池");
      await Promise.all([loadReviewers(statsDate), loadReviewerRecords(selectedReviewerId)]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "收回试卷失败");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">批改老师分配</p>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight text-slate-950">批改老师</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">选择日期查看每位兼职批改老师当日及当月的完成量，点进老师可继续查看其名下全部已批改 / 未批改试卷。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <CalendarDays className="size-4 text-slate-400" />
              <span>统计日期</span>
              <input
                type="date"
                value={statsDate}
                onChange={(event) => setStatsDate(event.target.value || formatDateInputValue())}
                className="bg-transparent text-sm text-slate-900 outline-none"
              />
            </label>
            <Button
              className="h-11 rounded-lg border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
              variant="outline"
              disabled={statsDate === formatDateInputValue()}
              onClick={() => setStatsDate(formatDateInputValue())}
            >
              今天
            </Button>
            <Button
              className="h-11 rounded-lg border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
              variant="outline"
              disabled={loading || recordsLoading}
              onClick={() => {
                void loadReviewers(statsDate);
                if (selectedReviewerId) void loadReviewerRecords(selectedReviewerId);
              }}
            >
              <RefreshCw className={`size-4 ${loading || recordsLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">批改老师加载中...</div>
        ) : reviewers.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">暂无兼职批改老师</div>
        ) : (
          reviewers.map((reviewer) => (
            <button
              key={reviewer.id}
              type="button"
              className={`rounded-[24px] border px-5 py-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 ${
                reviewer.id === selectedReviewerId ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
              }`}
              onClick={() => setSelectedReviewerId(reviewer.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-950">{reviewer.name || reviewer.account}</p>
                  <p className="mt-1 text-xs text-slate-500">{reviewer.account}</p>
                </div>
                <ArrowRight className="size-4 text-slate-400" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <ReviewMetricCard label={statsDateLabels.date} value={reviewer.selectedDateCount} />
                <ReviewMetricCard label={statsDateLabels.month} value={reviewer.selectedMonthCount} />
                <ReviewMetricCard label="总量" value={reviewer.totalCount} />
                <ReviewMetricCard label="待处理" value={reviewer.assignedPendingCount} />
              </div>
            </button>
          ))
        )}
      </section>

      {selectedReviewer ? (
        <>
          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <ReviewMetricCard label="批改老师" value={selectedReviewer.name || selectedReviewer.account} />
              <ReviewMetricCard label="近1小时" value={selectedReviewer.lastHourCount} tone="blue" />
              <ReviewMetricCard label={statsDateLabels.date} value={selectedReviewer.selectedDateCount} tone="violet" />
              <ReviewMetricCard label={statsDateLabels.month} value={selectedReviewer.selectedMonthCount} tone="blue" />
              <ReviewMetricCard label="总量" value={selectedReviewer.totalCount} tone="emerald" />
              <ReviewMetricCard label="当前待处理" value={selectedReviewer.assignedPendingCount} tone="amber" />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-950">未批改试卷</h2>
              <span className="text-sm text-slate-500">{pendingRecords.length} 份</span>
            </div>
            <ReviewRecordTable
              records={pendingRecords}
              loading={recordsLoading}
              showPaper
              onOpen={(record) => openRecord(record as AdminMockExamReviewGlobalRecord)}
              onClaim={(record) => void claimRecord(record as AdminMockExamReviewGlobalRecord)}
              onUnassign={(record) => void unassignRecord(record as AdminMockExamReviewGlobalRecord)}
            />
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-950">已批改试卷</h2>
              <span className="text-sm text-slate-500">{publishedRecords.length} 份</span>
            </div>
            <ReviewRecordTable
              records={publishedRecords}
              loading={recordsLoading}
              showPaper
              onOpen={(record) => openRecord(record as AdminMockExamReviewGlobalRecord)}
              onClaim={(record) => void claimRecord(record as AdminMockExamReviewGlobalRecord)}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
