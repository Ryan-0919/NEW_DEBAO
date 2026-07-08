import { AlertTriangle, ArrowRight, Clock, FileText, Lock, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import type { MouseEvent } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { AdminMockExamReviewGlobalRecord, AdminMockExamReviewPaper, AdminMockExamReviewRecord, AdminMockExamReviewStats } from "../../services/adminMockExamReviewService";

export const emptyReviewStats: AdminMockExamReviewStats = {
  paperCount: 0,
  total: 0,
  aiPending: 0,
  aiProcessing: 0,
  aiProblem: 0,
  manualPending: 0,
  published: 0,
  mine: 0,
  locked: 0,
};

export const reviewStatusMeta: Record<string, { label: string; className: string }> = {
  ai_pending: { label: "AI待批改", className: "border-amber-200 bg-amber-50 text-amber-800" },
  ai_processing: { label: "AI批改中", className: "border-blue-200 bg-blue-50 text-blue-800" },
  manual_pending: { label: "待老师批改", className: "border-violet-200 bg-violet-50 text-violet-800" },
  published: { label: "已批改", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  ai_problem: { label: "AI异常", className: "border-rose-200 bg-rose-50 text-rose-800" },
};

export const formatReviewDuration = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
};

export function ReviewMetricCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number | string;
  tone?: "slate" | "amber" | "blue" | "violet" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50 text-blue-900"
        : tone === "violet"
          ? "border-violet-200 bg-violet-50 text-violet-900"
          : tone === "emerald"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-[22px] border px-4 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.04)] ${toneClass}`}>
      <p className="text-[13px] font-medium opacity-70">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.04em]">{value}</p>
    </div>
  );
}

export function ReviewPaperCard({
  paper,
  onOpen,
  onOpenStatus,
}: {
  paper: AdminMockExamReviewPaper;
  onOpen: () => void;
  onOpenStatus?: (status: string) => void;
}) {
  const teacherWorkload = paper.stats.manualPending + paper.stats.mine;
  const aiWorkload = paper.stats.aiPending + paper.stats.aiProcessing;
  const urgentCount = teacherWorkload + paper.stats.aiProblem;
  const handleStatusClick = (event: MouseEvent<HTMLButtonElement>, status: string) => {
    event.stopPropagation();
    if (onOpenStatus) {
      onOpenStatus(status);
      return;
    }
    onOpen();
  };

  return (
    <div className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left shadow-[0_10px_26px_rgba(15,23,42,0.04)] transition hover:border-blue-200 hover:shadow-[0_14px_34px_rgba(15,23,42,0.07)]" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{paper.code}</Badge>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">满分 {paper.totalScore} 分</Badge>
            {paper.seriesName ? <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">{paper.seriesName}</Badge> : null}
            {urgentCount > 0 ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">待处理 {urgentCount}</Badge> : null}
          </div>
          <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-slate-950">{paper.title}</h3>
          <p className="mt-1 text-sm text-slate-500">{paper.phase || "主观题批改"} · {paper.subjectiveQuestionCount} 题 · {paper.durationMinutes} 分钟</p>
        </div>
        <ArrowRight className="mt-1 size-5 shrink-0 text-slate-400" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="rounded-xl bg-sky-50 px-3 py-2 text-left text-sky-800 transition hover:bg-sky-100" onClick={(event) => handleStatusClick(event, "mine")}>
          <p className="text-xs">我领取</p>
          <p className="font-semibold">{paper.stats.mine}</p>
        </button>
        <button type="button" className="rounded-xl bg-violet-50 px-3 py-2 text-left text-violet-800 transition hover:bg-violet-100" onClick={(event) => handleStatusClick(event, "manual_pending")}>
          <p className="text-xs">待老师</p>
          <p className="font-semibold">{paper.stats.manualPending}</p>
        </button>
        <button type="button" className="rounded-xl bg-amber-50 px-3 py-2 text-left text-amber-800 transition hover:bg-amber-100" onClick={(event) => handleStatusClick(event, "ai_pending")}>
          <p className="text-xs">AI待批</p>
          <p className="font-semibold">{paper.stats.aiPending}</p>
        </button>
        <button type="button" className="rounded-xl bg-blue-50 px-3 py-2 text-left text-blue-800 transition hover:bg-blue-100" onClick={(event) => handleStatusClick(event, "ai_processing")}>
          <p className="text-xs">AI正在批改</p>
          <p className="font-semibold">{paper.stats.aiProcessing}</p>
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span>AI队列 {aiWorkload}</span>
        <span>异常 {paper.stats.aiProblem}</span>
        <span>已批改 {paper.stats.published}</span>
      </div>
    </div>
  );
}

export function ReviewRecordTable({
  records,
  loading,
  onOpen,
  onClaim,
  showPaper = false,
  selectedRecordIds,
  onToggleRecord,
  onToggleAll,
  allCurrentPageSelected = false,
  onUnassign,
}: {
  records: Array<AdminMockExamReviewRecord | AdminMockExamReviewGlobalRecord>;
  loading: boolean;
  onOpen: (record: AdminMockExamReviewRecord | AdminMockExamReviewGlobalRecord) => void;
  onClaim: (record: AdminMockExamReviewRecord | AdminMockExamReviewGlobalRecord) => void;
  showPaper?: boolean;
  selectedRecordIds?: Set<string>;
  onToggleRecord?: (recordId: string, selected: boolean) => void;
  onToggleAll?: (selected: boolean) => void;
  allCurrentPageSelected?: boolean;
  onUnassign?: (record: AdminMockExamReviewRecord | AdminMockExamReviewGlobalRecord) => void;
}) {
  return (
    <section className="rounded-[26px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1320px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              {onToggleRecord ? (
                <th className="px-5 py-4">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={allCurrentPageSelected}
                    aria-label="选择当前页全部记录"
                    onChange={(event) => onToggleAll?.(event.target.checked)}
                  />
                </th>
              ) : null}
              {showPaper ? <th className="px-5 py-4">试卷</th> : null}
              <th className="px-5 py-4">学员</th>
              <th className="px-5 py-4">状态</th>
              <th className="px-5 py-4">批改进度</th>
              <th className="px-5 py-4">次数/用时</th>
              <th className="px-5 py-4">提交时间</th>
              <th className="sticky right-0 bg-slate-50 px-5 py-4 text-right shadow-[-8px_0_16px_rgba(15,23,42,0.04)]">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.length === 0 ? (
              <tr><td colSpan={showPaper ? (onToggleRecord ? 8 : 7) : (onToggleRecord ? 7 : 6)} className="py-16 text-center text-slate-500">{loading ? "批改记录加载中..." : "暂无匹配记录"}</td></tr>
            ) : (
              records.map((record) => {
                const status = reviewStatusMeta[record.reviewWorkflowStatus] ?? reviewStatusMeta.manual_pending;
                const paper = "paper" in record ? record.paper : null;
                return (
                  <tr key={record.id} className="group hover:bg-slate-50">
                    {onToggleRecord ? (
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedRecordIds?.has(record.id) ?? false}
                          aria-label={`选择 ${record.userLabel}`}
                          onChange={(event) => onToggleRecord(record.id, event.target.checked)}
                        />
                      </td>
                    ) : null}
                    {showPaper ? (
                      <td className="max-w-[360px] px-5 py-4">
                        <p className="line-clamp-2 font-semibold text-slate-950">{paper?.title || "-"}</p>
                        <p className="mt-1 text-xs text-slate-500">{paper?.code || ""}</p>
                      </td>
                    ) : null}
                    <td className="sticky right-0 bg-white px-5 py-4 shadow-[-8px_0_16px_rgba(15,23,42,0.04)] group-hover:bg-slate-50">
                      <p className="font-semibold text-slate-950">{record.userLabel}</p>
                      <p className="mt-1 text-xs text-slate-500">{record.userPhone || record.userId}</p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant="outline" className={status.className}>{status.label}</Badge>
                      <p className="mt-2 text-xs text-slate-500">分配：{record.assignedReviewerName || "未分配"}</p>
                      {record.lock.active ? <p className="mt-2 text-xs text-slate-500">锁定：{record.lock.reviewerName || "老师"} 至 {record.lock.expiresAt}</p> : null}
                      {record.lastAiReviewError ? <p className="mt-2 line-clamp-2 text-xs text-rose-600">{record.lastAiReviewError}</p> : null}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{record.reviewedSubjectiveCount}/{record.subjectiveQuestionCount} 题已批</p>
                      <p className="mt-1 text-xs text-slate-500">
                        作答 {record.answeredSubjectiveCount}/{record.subjectiveQuestionCount}
                        {" · "}
                        得分 {record.totalScore}{paper?.totalScore ? `/${paper.totalScore}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>第 {record.attemptNo} 次</p>
                      <p className="mt-1 text-xs text-slate-500">{formatReviewDuration(record.consumedSeconds)}</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      <p>{record.submittedAt || "-"}</p>
                      <p className="mt-1">更新 {record.updatedAt || "-"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        {record.reviewWorkflowStatus !== "published" && record.lock.canClaim ? (
                          <Button variant="outline" size="sm" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => onClaim(record)}>
                            <UserCheck className="size-4" />
                            {record.lock.ownedByMe ? "继续批改" : "领取"}
                          </Button>
                        ) : null}
                        {onUnassign && record.assignedReviewerId && !record.publishedAt ? (
                          <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => onUnassign(record)}>
                            收回到公共池
                          </Button>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => onOpen(record)}>
                          <FileText className="size-4" />
                          查看批改
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export const reviewGlobalTabs = [
  { key: "mine", label: "我领取的试卷", icon: UserCheck },
  { key: "teacher", label: "待老师批改", icon: UserCheck },
  { key: "ai_problem", label: "AI异常", icon: AlertTriangle },
  { key: "ai_processing", label: "AI正在批改", icon: RefreshCw },
  { key: "ai_pending", label: "AI待批改", icon: Clock },
  { key: "locked", label: "已锁定", icon: Lock },
  { key: "published", label: "已批改", icon: ShieldCheck },
] as const;

export const reviewPartTimeTabs = [
  { key: "teacher", label: "我分配的试卷", icon: UserCheck },
  { key: "mine", label: "我领取的试卷", icon: Lock },
  { key: "published", label: "已批改", icon: ShieldCheck },
] as const;
