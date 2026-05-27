import { useEffect, useState } from "react";
import { FileCheck2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AdminMockExamReviewPaper, adminMockExamReviewService } from "../../services/adminMockExamReviewService";
import { ReviewPaperCard } from "./reviewShared";

export function ReviewPapersPage() {
  const [papers, setPapers] = useState<AdminMockExamReviewPaper[]>([]);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const loadPapers = async (nextPage = page.page) => {
    setLoading(true);
    try {
      const payload = await adminMockExamReviewService.getPapers({
        page: nextPage,
        pageSize: 15,
        keyword: keyword.trim(),
      });
      setPapers(payload.items);
      setPage({ page: payload.page, totalPages: payload.totalPages, total: payload.total });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载批改试卷失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPapers(1);
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_20px_54px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-xs font-medium text-slate-600">
              <FileCheck2 className="size-3.5" />
              单卷批改入口
            </p>
            <h1 className="mt-4 text-[34px] font-semibold leading-tight tracking-[-0.05em] text-slate-950">试卷批改</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">先选择试卷，再进入该试卷自己的批改队列。卡片保持一屏多张，方便批改管理员快速找到目标试卷。</p>
          </div>
          <div className="flex min-w-[320px] flex-1 justify-end gap-2">
            <div className="relative w-full max-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input className="h-11 rounded-full bg-white pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadPapers(1); }} placeholder="搜索试卷、编号、阶段" />
            </div>
            <Button className="h-11 rounded-full px-5" variant="outline" onClick={() => void loadPapers(1)}>搜索</Button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white py-16 text-center text-slate-500">批改试卷加载中...</div>
      ) : papers.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">暂无已开启批改的主观题试卷</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {papers.map((paper) => (
            <ReviewPaperCard
              key={paper.id}
              paper={paper}
              onOpen={() => window.location.assign(`/adminpg/papers/${paper.id}`)}
              onOpenStatus={(status) => window.location.assign(`/adminpg/papers/${paper.id}?status=${encodeURIComponent(status)}`)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
        <span>第 {page.page} / {page.totalPages} 页，共 {page.total} 张试卷</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page.page <= 1 || loading} onClick={() => void loadPapers(page.page - 1)}>上一页</Button>
          <Button variant="outline" disabled={page.page >= page.totalPages || loading} onClick={() => void loadPapers(page.page + 1)}>下一页</Button>
        </div>
      </div>
    </div>
  );
}
