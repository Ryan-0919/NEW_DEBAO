import { useEffect, useState } from "react";
import { Activity, BookOpen, FileText, Loader2, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { AdminDashboardSummary, adminOperationsService } from "../../services/adminOperationsService";

const emptySummary: AdminDashboardSummary = {
  users: {
    total: 0,
    active: 0,
    disabled: 0,
    onlineNow: 0,
    onlineToday: 0,
    registeredToday: 0,
    registered7d: 0,
    active30d: 0,
    onlineWindowMinutes: 30,
  },
  content: {
    courseCount: 0,
    openCourseCount: 0,
    closedCourseCount: 0,
    audioCount: 0,
    videoCount: 0,
    questionBankCount: 0,
    typingRecordCount: 0,
  },
  exams: {
    paperCount: 0,
    objectivePaperCount: 0,
    subjectivePaperCount: 0,
    submittedRecordCount: 0,
    inProgressRecordCount: 0,
    pendingReviewCount: 0,
    publishedReviewCount: 0,
  },
  recentAuditLogs: [],
  generatedAt: "",
};

function StatCard({ label, value, helper, icon: Icon }: { label: string; value: number; helper?: string; icon: typeof Users }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <Icon className="size-4 text-slate-400" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p> : null}
    </div>
  );
}

export function AdminDashboard() {
  const [summary, setSummary] = useState<AdminDashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);

  const loadSummary = async () => {
    setLoading(true);
    try {
      setSummary(await adminOperationsService.getDashboardSummary());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载后台仪表盘失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">平台运行概览</h2>
            <p className="mt-1 text-sm text-slate-500">
              在线人数按最近 {summary.users.onlineWindowMinutes} 分钟内活跃设备去重统计，更新时间：{summary.generatedAt || "-"}
            </p>
          </div>
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading} onClick={() => void loadSummary()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            刷新
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="用户总数" value={summary.users.total} helper={`启用 ${summary.users.active}，停用 ${summary.users.disabled}`} icon={Users} />
        <StatCard label="当前在线" value={summary.users.onlineNow} helper={`今日在线 ${summary.users.onlineToday}`} icon={Activity} />
        <StatCard label="今日注册" value={summary.users.registeredToday} helper={`近 7 天注册 ${summary.users.registered7d}`} icon={Users} />
        <StatCard label="近 30 天活跃" value={summary.users.active30d} helper="按最后登录时间统计" icon={Activity} />
        <StatCard label="课程数量" value={summary.content.courseCount} helper={`开放 ${summary.content.openCourseCount}，关闭 ${summary.content.closedCourseCount}`} icon={BookOpen} />
        <StatCard label="音视频素材" value={summary.content.audioCount + summary.content.videoCount} helper={`音频 ${summary.content.audioCount}，视频 ${summary.content.videoCount}`} icon={BookOpen} />
        <StatCard label="机考试卷" value={summary.exams.paperCount} helper={`客观 ${summary.exams.objectivePaperCount}，主观 ${summary.exams.subjectivePaperCount}`} icon={FileText} />
        <StatCard label="已交卷记录" value={summary.exams.submittedRecordCount} helper={`进行中 ${summary.exams.inProgressRecordCount}`} icon={ShieldCheck} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-950">考试处理状态</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-amber-800">
              <p className="text-xs">待批改/处理中</p>
              <p className="mt-2 text-xl font-semibold">{summary.exams.pendingReviewCount}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-emerald-800">
              <p className="text-xs">已发布批改</p>
              <p className="mt-2 text-xl font-semibold">{summary.exams.publishedReviewCount}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-slate-700">
              <p className="text-xs">练习题库</p>
              <p className="mt-2 text-xl font-semibold">{summary.content.questionBankCount}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">最近后台操作</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {summary.recentAuditLogs.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">{loading ? "加载中..." : "暂无操作日志"}</div>
            ) : (
              summary.recentAuditLogs.map((log) => (
                <div key={log.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-slate-900">{log.action}</p>
                    <span className="shrink-0 text-xs text-slate-400">{log.createdAt}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {log.operatorName || log.operatorAccount || "系统"} · {log.entityType}
                    {log.entityName ? ` · ${log.entityName}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
