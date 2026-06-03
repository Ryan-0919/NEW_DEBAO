import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { adminPostJson, adminRequest } from "../../services/adminApiClient";

type PerformanceReport = {
  summary: {
    totalRequests: number;
    successRate: string;
    failureCount: number;
  };
  phase1: {
    avgTimeMs: number;
    parseSuccessRate: string;
    avgTokensPerRequest: number;
    totalTokens: number;
  };
  phase2: {
    avgTimeMs: number;
    parseSuccessRate: string;
    avgTokensPerRequest: number;
    totalTokens: number;
  };
  concurrent: {
    maxConcurrent: number;
  };
  totalTokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
};

const emptyReport: PerformanceReport = {
  summary: { totalRequests: 0, successRate: "0%", failureCount: 0 },
  phase1: { avgTimeMs: 0, parseSuccessRate: "0%", avgTokensPerRequest: 0, totalTokens: 0 },
  phase2: { avgTimeMs: 0, parseSuccessRate: "0%", avgTokensPerRequest: 0, totalTokens: 0 },
  concurrent: { maxConcurrent: 0 },
  totalTokenUsage: { prompt: 0, completion: 0, total: 0 },
};

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function AiReviewV2Performance() {
  const [report, setReport] = useState<PerformanceReport>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await adminRequest<{ report: PerformanceReport; timestamp: string }>("/api/admin/ai-review-v2/performance");
      setReport(data.report || emptyReport);
      setLastUpdate(data.timestamp ? new Date(data.timestamp).toLocaleString("zh-CN") : "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "性能报告加载失败");
    } finally {
      setLoading(false);
    }
  };

  const resetReport = async () => {
    if (!window.confirm("确定要重置当前内存中的性能统计吗？")) return;
    setLoading(true);
    try {
      await adminPostJson("/api/admin/ai-review-v2/performance/reset");
      toast.success("性能统计已重置");
      await fetchReport();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
      setLoading(false);
    }
  };

  const printReport = async () => {
    setLoading(true);
    try {
      await adminPostJson("/api/admin/ai-review-v2/performance/print");
      toast.success("性能报告已输出到服务器控制台");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打印失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReport();
    const timer = window.setInterval(() => void fetchReport(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const avgTotalTime = report.phase1.avgTimeMs + report.phase2.avgTimeMs;
  const estimatedCost = (report.totalTokenUsage.total / 1_000_000) * 15;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">AI批改V2性能监控</h2>
            <p className="mt-1 text-sm text-slate-500">
              监控V2分阶段批改的耗时、JSON解析率、Token消耗和并发情况。最后更新：{lastUpdate || "-"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" disabled={loading} onClick={() => void fetchReport()}>
              刷新
            </Button>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700" disabled={loading} onClick={() => void printReport()}>
              打印到控制台
            </Button>
            <Button variant="destructive" disabled={loading} onClick={() => void resetReport()}>
              重置统计
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">总请求数</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-semibold">{report.summary.totalRequests}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">成功率</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-semibold text-emerald-600">{report.summary.successRate}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">失败次数</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-semibold text-rose-600">{report.summary.failureCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">平均总耗时</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-semibold">{formatSeconds(avgTotalTime)}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>阶段1：核心批改</CardTitle>
            <CardDescription>score、reviewComment、answerMarks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">平均耗时</span><span className="font-semibold">{formatSeconds(report.phase1.avgTimeMs)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">JSON解析成功率</span><span className="font-semibold">{report.phase1.parseSuccessRate}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">平均Token</span><span className="font-semibold">{report.phase1.avgTokensPerRequest.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">总Token</span><span className="font-semibold">{report.phase1.totalTokens.toLocaleString()}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>阶段2：补充信息</CardTitle>
            <CardDescription>highlight、missedPoints</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">平均耗时</span><span className="font-semibold">{formatSeconds(report.phase2.avgTimeMs)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">JSON解析成功率</span><span className="font-semibold">{report.phase2.parseSuccessRate}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">平均Token</span><span className="font-semibold">{report.phase2.avgTokensPerRequest.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">总Token</span><span className="font-semibold">{report.phase2.totalTokens.toLocaleString()}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Token与成本估算</CardTitle>
          <CardDescription>按 $15 / 1M tokens 粗略估算，仅用于观察趋势。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div><div className="text-sm text-slate-500">Prompt</div><div className="text-xl font-semibold">{report.totalTokenUsage.prompt.toLocaleString()}</div></div>
          <div><div className="text-sm text-slate-500">Completion</div><div className="text-xl font-semibold">{report.totalTokenUsage.completion.toLocaleString()}</div></div>
          <div><div className="text-sm text-slate-500">Total</div><div className="text-xl font-semibold">{report.totalTokenUsage.total.toLocaleString()}</div></div>
          <div><div className="text-sm text-slate-500">估算成本</div><div className="text-xl font-semibold text-blue-600">${estimatedCost.toFixed(4)}</div></div>
        </CardContent>
      </Card>
    </div>
  );
}
