import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Play, Scale } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { lawPracticeService, type LawPracticePaperSummary } from "../../services/lawPracticeService";

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")} ${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
};

export function LawPracticeHome() {
  const navigate = useNavigate();
  const [papers, setPapers] = useState<LawPracticePaperSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingPaperId, setStartingPaperId] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const nextPapers = await lawPracticeService.getPapers();
        if (active) setPapers(nextPapers);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "法条练习加载失败");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const startPaper = async (paper: LawPracticePaperSummary) => {
    setStartingPaperId(paper.id);
    try {
      const record = await lawPracticeService.startPaper(paper.id);
      navigate(`/user/law-practice/records/${record.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法开始练习");
    } finally {
      setStartingPaperId("");
    }
  };

  return (
    <div className="min-h-screen bg-[#050a14] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-white/55 hover:text-white"
              onClick={() => { window.location.href = "/"; }}
            >
              <ArrowLeft className="size-4" />
              返回首页
            </button>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-300">
                <Scale className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-normal text-white">法条练习</h1>
                <p className="mt-1 text-sm text-white/48">在法条汇编中快速定位条文，填写条号并抄录原文，整套提交后统一查看答案。</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-[360px] place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
            <div className="flex items-center gap-3 text-sm text-white/60">
              <Loader2 className="size-5 animate-spin" />
              正在加载练习试卷...
            </div>
          </div>
        ) : papers.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-10 text-center">
            <div className="text-lg font-semibold text-white">暂无法条练习试卷</div>
            <p className="mt-2 text-sm text-white/48">后台发布试卷后，这里会显示可练习的套卷。</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {papers.map((paper) => {
              const latest = paper.latestRecord;
              const isStarting = startingPaperId === paper.id;
              const completed = latest?.status === "submitted";
              return (
                <div key={paper.id} className="rounded-lg border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.035))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.24)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold text-white">{paper.title}</h2>
                        {completed ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                            <CheckCircle2 className="size-3.5" />
                            已完成
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/52">{paper.description || "完成整套题后再统一查看标准答案。"}</p>
                    </div>
                    <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-white/72">
                      {paper.questionCount} 题
                    </div>
                  </div>

                  {latest ? (
                    <div className="mt-4 rounded-lg border border-white/10 bg-black/18 px-4 py-3 text-xs leading-6 text-white/48">
                      {latest.status === "in_progress" ? "上次练习未提交" : "上次练习已提交"}
                      {latest.submittedAt || latest.startedAt ? ` · ${formatDateTime(latest.submittedAt || latest.startedAt)}` : ""}
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button
                      className="rounded-full bg-white text-slate-950 hover:bg-slate-100"
                      disabled={isStarting}
                      onClick={() => void startPaper(paper)}
                    >
                      {isStarting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                      {latest?.status === "in_progress" ? "继续练习" : completed ? "重新练习" : "开始练习"}
                    </Button>
                    {completed && latest ? (
                      <Button
                        variant="outline"
                        className="rounded-full border-white/15 bg-white/[0.04] text-white hover:bg-white/10 hover:text-white"
                        onClick={() => navigate(`/user/law-practice/records/${latest.id}`)}
                      >
                        查看上次答案
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
