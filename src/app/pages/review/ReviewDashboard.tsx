import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { AdminMockExamReviewPaper, adminMockExamReviewService } from "../../services/adminMockExamReviewService";
import { emptyReviewStats, ReviewMetricCard, ReviewPaperCard } from "./reviewShared";

export function ReviewDashboard() {
  const [stats, setStats] = useState(emptyReviewStats);
  const [papers, setPapers] = useState<AdminMockExamReviewPaper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [summary, paperPage] = await Promise.all([
          adminMockExamReviewService.getSummary(),
          adminMockExamReviewService.getPapers({ page: 1, pageSize: 10 }),
        ]);
        setStats(summary);
        setPapers(paperPage.items);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载批改工作台失败");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const urgentPaper = useMemo(
    () =>
      [...papers].sort(
        (left, right) =>
          right.stats.mine + right.stats.manualPending + right.stats.aiProblem - (left.stats.mine + left.stats.manualPending + left.stats.aiProblem),
      )[0] ?? null,
    [papers],
  );

  const taskCards = [
    {
      title: "我领取的试卷",
      value: stats.mine,
      helper: "继续处理已经领取的记录",
      href: "/adminpg/mine",
      className: "border-sky-200 bg-sky-50 text-sky-900",
      button: "继续批改",
    },
    {
      title: "待老师批改",
      value: stats.manualPending,
      helper: "可领取的人工确认记录",
      href: "/adminpg/reviews?status=teacher",
      className: "border-violet-200 bg-violet-50 text-violet-900",
      button: "去领取",
    },
    {
      title: "AI异常",
      value: stats.aiProblem,
      helper: "需要人工检查或重新入队",
      href: "/adminpg/reviews?status=ai_problem",
      className: "border-rose-200 bg-rose-50 text-rose-900",
      button: "查看异常",
    },
    {
      title: "AI正在批改",
      value: stats.aiProcessing,
      helper: "观察队列是否正常流转",
      href: "/adminpg/reviews?status=ai_processing",
      className: "border-blue-200 bg-blue-50 text-blue-900",
      button: "查看队列",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">主观题批改工作台</h1>
            <p className="mt-2 text-sm text-slate-500">优先处理自己已领取和待老师确认的记录；AI 队列只作为监控入口。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.assign("/adminpg/mine")}>我领取的试卷</Button>
            <Button onClick={() => window.location.assign("/adminpg/reviews")}>进入批改队列</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {taskCards.map((task) => (
          <button
            key={task.title}
            type="button"
            className={`rounded-[24px] border px-5 py-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 ${task.className}`}
            onClick={() => window.location.assign(task.href)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{task.title}</p>
                <p className="mt-1 text-xs opacity-70">{task.helper}</p>
              </div>
              <p className="text-[32px] font-semibold leading-none tracking-[-0.04em]">{task.value}</p>
            </div>
            <p className="mt-4 text-sm font-semibold opacity-80">{task.button}</p>
          </button>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <ReviewMetricCard label="开启批改试卷" value={stats.paperCount ?? 0} />
        <ReviewMetricCard label="AI待批改" value={stats.aiPending} tone="amber" />
        <ReviewMetricCard label="AI正在批改" value={stats.aiProcessing} tone="blue" />
        <ReviewMetricCard label="待老师批改" value={stats.manualPending} tone="violet" />
        <ReviewMetricCard label="我领取的" value={stats.mine} tone="blue" />
        <ReviewMetricCard label="已批改" value={stats.published} tone="emerald" />
        <ReviewMetricCard label="AI异常" value={stats.aiProblem} tone="amber" />
      </div>

      {urgentPaper ? (
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">优先处理</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{urgentPaper.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                我领取 {urgentPaper.stats.mine}，待老师 {urgentPaper.stats.manualPending}，AI异常 {urgentPaper.stats.aiProblem}，已批改 {urgentPaper.stats.published}
              </p>
            </div>
            <Button onClick={() => window.location.assign(`/adminpg/papers/${urgentPaper.id}`)}>进入这张试卷</Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">近期批改试卷</h2>
          <Button variant="outline" onClick={() => window.location.assign("/adminpg/papers")}>查看全部</Button>
        </div>
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-slate-500">工作台加载中...</div>
        ) : papers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">暂无开启批改的主观题试卷</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {papers.slice(0, 5).map((paper) => (
              <ReviewPaperCard
                key={paper.id}
                paper={paper}
                onOpen={() => window.location.assign(`/adminpg/papers/${paper.id}`)}
                onOpenStatus={(status) => window.location.assign(`/adminpg/papers/${paper.id}?status=${encodeURIComponent(status)}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
