import { useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle, Clock, Loader2, RefreshCw, TrendingUp, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { adminRequest } from "../../services/adminApiClient";

interface MonitorStats {
  period: string;
  total: number;
  success_count: number;
  success_rate: number;
  failed_count: number;
  failure_breakdown: {
    validation_failed: number;
    json_error: number;
    timeout: number;
    api_error: number;
  };
  avg_latency_ms: number;
  avg_total_tokens: number;
  avg_error_marks: string;
  avg_positive_marks: string;
  avg_coverage_rate: string;
  migrationRequired?: boolean;
  migrationHint?: string;
}

interface QualityMetrics {
  period: string;
  total_reviews: number;
  error_marking_rate: number;
  avg_error_marks_per_review: string;
  avg_positive_marks_per_review: string;
  avg_coverage_rate: string;
  avg_comment_length: number;
  coverage_range: {
    min: string;
    max: string;
  };
  migrationRequired?: boolean;
  migrationHint?: string;
}

interface Failure {
  id: string;
  record_id: string;
  question_id: string;
  status: string;
  error_message: string;
  started_at: string;
  latency_ms: number;
  retry_count: number;
  strategy_name: string;
  model: string;
}

const emptyStats: MonitorStats = {
  period: "最近1小时",
  total: 0,
  success_count: 0,
  success_rate: 0,
  failed_count: 0,
  failure_breakdown: { validation_failed: 0, json_error: 0, timeout: 0, api_error: 0 },
  avg_latency_ms: 0,
  avg_total_tokens: 0,
  avg_error_marks: "0.0",
  avg_positive_marks: "0.0",
  avg_coverage_rate: "0.000",
};

const emptyQuality: QualityMetrics = {
  period: "最近24小时",
  total_reviews: 0,
  error_marking_rate: 0,
  avg_error_marks_per_review: "0.00",
  avg_positive_marks_per_review: "0.00",
  avg_coverage_rate: "0.000",
  avg_comment_length: 0,
  coverage_range: { min: "0.000", max: "0.000" },
};

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon: typeof Activity;
  variant?: "default" | "success" | "warning" | "error";
}) {
  const classes = {
    default: "bg-white text-slate-950",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-rose-50 text-rose-700",
  };

  return (
    <div className={`rounded-lg border border-slate-200 px-5 py-4 ${classes[variant]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <Icon className="size-4 opacity-70" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p> : null}
    </div>
  );
}

export function AiReviewMonitor() {
  const [stats, setStats] = useState<MonitorStats>(emptyStats);
  const [quality, setQuality] = useState<QualityMetrics>(emptyQuality);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [nextStats, nextQuality, nextFailures] = await Promise.all([
        adminRequest<MonitorStats>("/api/admin/ai-review/monitor/stats").catch(() => emptyStats),
        adminRequest<QualityMetrics>("/api/admin/ai-review/monitor/quality?hours=24").catch(() => emptyQuality),
        adminRequest<{ total: number; failures: Failure[] }>("/api/admin/ai-review/monitor/failures?limit=10").catch(() => ({ total: 0, failures: [] })),
      ]);

      setStats(nextStats || emptyStats);
      setQuality(nextQuality || emptyQuality);
      setFailures(nextFailures.failures || []);

      if (nextStats.migrationRequired || nextQuality.migrationRequired) {
        toast.warning(nextStats.migrationHint || nextQuality.migrationHint || "AI批改V2数据表尚未创建");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载监控数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => void loadData(), 30000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  const successRate = (stats.success_rate * 100).toFixed(1);
  const errorMarkingRate = (quality.error_marking_rate * 100).toFixed(1);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">AI批改监控</h2>
            <p className="mt-1 text-sm text-slate-500">实时监控AI批改系统的运行状态、质量指标和失败记录。</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className={`border-slate-200 ${autoRefresh ? "bg-blue-50 text-blue-600" : "bg-white text-slate-700"} hover:bg-slate-50`}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <Activity className="size-4" />
              {autoRefresh ? "自动刷新中" : "自动刷新"}
            </Button>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading} onClick={() => void loadData()}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              刷新
            </Button>
          </div>
        </div>
      </section>

      {stats.migrationRequired ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          {stats.migrationHint || "AI批改V2数据表尚未创建。"}
        </section>
      ) : null}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">实时统计（最近1小时）</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="批改总数" value={stats.total} helper={stats.period} icon={Activity} />
          <StatCard
            label="成功率"
            value={`${successRate}%`}
            helper={`成功 ${stats.success_count} / 失败 ${stats.failed_count}`}
            icon={CheckCircle}
            variant={stats.success_rate >= 0.95 ? "success" : stats.success_rate >= 0.8 ? "warning" : "error"}
          />
          <StatCard
            label="平均耗时"
            value={`${(stats.avg_latency_ms / 1000).toFixed(1)}s`}
            helper="目标 <=20秒"
            icon={Clock}
            variant={stats.avg_latency_ms <= 20000 ? "success" : "warning"}
          />
          <StatCard label="平均Token" value={Math.round(stats.avg_total_tokens)} helper={`约 $${((stats.avg_total_tokens / 1_000_000) * 45).toFixed(3)}/次`} icon={TrendingUp} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">批改质量（最近24小时）</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="错误标注率" value={`${errorMarkingRate}%`} helper={`${quality.total_reviews}次批改`} icon={AlertCircle} variant={quality.error_marking_rate >= 0.8 ? "success" : "warning"} />
          <StatCard label="平均错误标注" value={quality.avg_error_marks_per_review} helper="目标 >=0.8个/次" icon={XCircle} variant={parseFloat(quality.avg_error_marks_per_review) >= 0.8 ? "success" : "warning"} />
          <StatCard label="平均正向标注" value={quality.avg_positive_marks_per_review} helper="得分点标注" icon={CheckCircle} />
          <StatCard label="平均覆盖率" value={`${(parseFloat(quality.avg_coverage_rate) * 100).toFixed(1)}%`} helper={`范围 ${(parseFloat(quality.coverage_range.min) * 100).toFixed(0)}%-${(parseFloat(quality.coverage_range.max) * 100).toFixed(0)}%`} icon={TrendingUp} variant={parseFloat(quality.avg_coverage_rate) >= 0.3 ? "success" : "warning"} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">失败原因分布</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="text-center"><p className="text-2xl font-semibold text-red-600">{stats.failure_breakdown.validation_failed}</p><p className="mt-1 text-xs text-slate-500">校验失败</p></div>
          <div className="text-center"><p className="text-2xl font-semibold text-orange-600">{stats.failure_breakdown.json_error}</p><p className="mt-1 text-xs text-slate-500">JSON错误</p></div>
          <div className="text-center"><p className="text-2xl font-semibold text-yellow-600">{stats.failure_breakdown.timeout}</p><p className="mt-1 text-xs text-slate-500">超时</p></div>
          <div className="text-center"><p className="text-2xl font-semibold text-red-600">{stats.failure_breakdown.api_error}</p><p className="mt-1 text-xs text-slate-500">API错误</p></div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">最近失败记录</h3>
        {failures.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">暂无失败记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">时间</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">记录ID</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">状态</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">错误信息</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">耗时</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">重试</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {failures.map((failure) => (
                  <tr key={failure.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{failure.started_at ? new Date(failure.started_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{failure.record_id ? `${failure.record_id.substring(0, 12)}...` : "-"}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">{failure.status}</span></td>
                    <td className="px-4 py-3 text-slate-600">{failure.error_message?.substring(0, 80) || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{failure.latency_ms ? `${(failure.latency_ms / 1000).toFixed(1)}s` : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{failure.retry_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
