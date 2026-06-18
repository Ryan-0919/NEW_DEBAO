import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, CheckCircle2, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { cn } from "../../components/ui/utils";
import {
  dictationService,
  type DictationChapter,
  type DictationItem,
  type DictationSegment,
  type DictationSubject,
} from "../../services/dictationService";

type BlankDraftMap = Record<string, Record<string, string>>;

const normalizeAnswer = (value = "") => value.replace(/\s+/g, "").trim();

const EMPTY_SUBJECTS: DictationSubject[] = [];
const EMPTY_CHAPTERS: DictationChapter[] = [];

function DictationBlankInput({
  segment,
  value,
  showAnswer,
  onChange,
}: {
  segment: Extract<DictationSegment, { type: "blank" }>;
  value: string;
  showAnswer: boolean;
  onChange: (value: string) => void;
}) {
  const answer = segment.answer ?? "";
  const isCorrect = showAnswer && normalizeAnswer(value) === normalizeAnswer(answer);
  const isWrong = showAnswer && value.trim() && normalizeAnswer(value) !== normalizeAnswer(answer);
  const width = `${Math.min(Math.max((value || answer || "").length + 3, 7), 18)}em`;

  return (
    <span className="mx-1 inline-flex translate-y-[2px] flex-col items-center align-baseline">
      <input
        aria-label={`第 ${segment.index} 个挖空`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-8 rounded-none border-0 border-b-2 bg-transparent px-2 text-center text-[16px] font-semibold outline-none transition",
          showAnswer
            ? isCorrect
              ? "border-emerald-500 text-emerald-700"
              : isWrong
                ? "border-rose-500 text-rose-700"
                : "border-amber-500 text-amber-700"
            : "border-slate-400 text-slate-950 focus:border-[#386f9e]",
        )}
        style={{ width }}
        placeholder=""
      />
      {showAnswer ? (
        <span className={cn("mt-1 max-w-[220px] rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4", isCorrect ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
          {answer || "未配置答案"}
        </span>
      ) : null}
    </span>
  );
}

function DictationPaperItem({
  item,
  index,
  drafts,
  showAnswer,
  onDraftChange,
}: {
  item: DictationItem;
  index: number;
  drafts: Record<string, string>;
  showAnswer: boolean;
  onDraftChange: (blankId: string, value: string) => void;
}) {
  const correctCount = useMemo(
    () =>
      item.blanks.filter((blank) => {
        const answer = blank.answer ?? "";
        return normalizeAnswer(drafts[blank.id] ?? "") === normalizeAnswer(answer);
      }).length,
    [drafts, item.blanks],
  );

  return (
    <article className="relative border-b border-dashed border-slate-200 py-5 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full border border-[#d9e5ea] bg-[#f7fbfd] text-sm font-black text-[#31556d]">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-black leading-7 text-slate-900">{item.title}</h3>
            {item.source ? <span className="rounded-full bg-[#edf4f7] px-2 py-0.5 text-xs font-semibold text-slate-500">{item.source}</span> : null}
            {showAnswer ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                答对 {correctCount}/{item.blankCount}
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{item.blankCount} 个挖空</span>
            )}
          </div>

          <div className="font-serif text-[18px] leading-[2.25] text-slate-900">
            {item.segments.map((segment, segmentIndex) =>
              segment.type === "text" ? (
                <span key={`${item.id}-text-${segmentIndex}`} className="whitespace-pre-wrap">
                  {segment.text}
                </span>
              ) : (
                <DictationBlankInput
                  key={`${item.id}-${segment.id}`}
                  segment={segment}
                  value={drafts[segment.id] ?? ""}
                  showAnswer={showAnswer}
                  onChange={(value) => onDraftChange(segment.id, value)}
                />
              ),
            )}
          </div>

          {showAnswer ? (
            <div className="mt-4 rounded-xl border border-[#d9e5ea] bg-[#f8fbfd] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-black text-[#31556d]">
                <CheckCircle2 className="size-4 text-emerald-600" />
                标准答案
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {item.blanks.map((blank) => (
                  <span key={blank.id} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                    {blank.index}. <strong className="text-slate-950">{blank.answer || "未配置"}</strong>
                  </span>
                ))}
              </div>
              {item.explanation ? <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{item.explanation}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function DictationNotebook({ setPage }: { setPage?: (page: string) => void }) {
  const initialChapterId =
    typeof window !== "undefined"
      ? window.location.pathname.match(/^\/user\/dictation\/chapters\/([^/]+)\/?$/)?.[1] ?? ""
      : "";
  const [subjects, setSubjects] = useState<DictationSubject[]>(EMPTY_SUBJECTS);
  const [chapters, setChapters] = useState<DictationChapter[]>(EMPTY_CHAPTERS);
  const [items, setItems] = useState<DictationItem[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState("");
  const [activeChapterId, setActiveChapterId] = useState(initialChapterId);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [drafts, setDrafts] = useState<BlankDraftMap>({});
  const isPracticePage = Boolean(activeChapterId);

  const activeSubject = useMemo(() => subjects.find((subject) => subject.id === activeSubjectId) ?? null, [subjects, activeSubjectId]);
  const activeChapter = useMemo(() => chapters.find((chapter) => chapter.id === activeChapterId) ?? null, [chapters, activeChapterId]);
  const filledCount = useMemo(
    () =>
      items.reduce((total, item) => {
        const itemDrafts = drafts[item.id] ?? {};
        return total + item.blanks.filter((blank) => (itemDrafts[blank.id] ?? "").trim()).length;
      }, 0),
    [drafts, items],
  );
  const blankCount = useMemo(() => items.reduce((total, item) => total + item.blankCount, 0), [items]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingSubjects(true);
      try {
        const payload = await dictationService.getSubjects();
        if (!active) return;
        setSubjects(payload);
        if (!initialChapterId && !activeSubjectId && payload[0]?.id) {
          setActiveSubjectId(payload[0].id);
        }
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "默写本加载失败");
      } finally {
        if (active) setLoadingSubjects(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeSubjectId || isPracticePage) {
      setChapters([]);
      if (!isPracticePage) setActiveChapterId("");
      setItems([]);
      return;
    }

    let active = true;
    const load = async () => {
      setLoadingChapters(true);
      if (!isPracticePage) setActiveChapterId("");
      setItems([]);
      setShowAnswers(false);
      try {
        const payload = await dictationService.getChapters(activeSubjectId);
        if (active) setChapters(payload);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "章节加载失败");
      } finally {
        if (active) setLoadingChapters(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [activeSubjectId, isPracticePage]);

  useEffect(() => {
    if (!activeChapterId) {
      setItems([]);
      setShowAnswers(false);
      return;
    }

    let active = true;
    const load = async () => {
      setLoadingItems(true);
      setShowAnswers(false);
      try {
        const payload = await dictationService.getChapterItems(activeChapterId);
        if (!active) return;
        setItems(payload.items);
        setChapters(payload.chapters);
        setActiveSubjectId(payload.subject.id);
        setDrafts((current) => {
          const next = { ...current };
          payload.items.forEach((item) => {
            if (!next[item.id]) next[item.id] = {};
          });
          return next;
        });
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "默写题加载失败");
      } finally {
        if (active) setLoadingItems(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [activeChapterId]);

  const updateDraft = (itemId: string, blankId: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {}),
        [blankId]: value,
      },
    }));
  };

  const resetCurrentChapter = () => {
    if (!activeChapterId) return;
    setDrafts((current) => {
      const next = { ...current };
      items.forEach((item) => {
        next[item.id] = {};
      });
      return next;
    });
    setShowAnswers(false);
    toast.success("本章节填写内容已清空");
  };

  const goHome = () => {
    if (setPage) {
      setPage("home");
      return;
    }
    window.location.href = "/";
  };

  const openChapter = (chapterId: string) => {
    if (!chapterId) return;
    const nextPath = `/user/dictation/chapters/${encodeURIComponent(chapterId)}`;
    setActiveChapterId(chapterId);
    setShowAnswers(false);
    setItems([]);
    if (typeof window !== "undefined" && window.location.pathname !== nextPath) {
      window.history.pushState({ page: "dictationNotebook", chapterId }, "", nextPath);
    }
  };

  const backToDirectory = () => {
    setActiveChapterId("");
    setItems([]);
    setShowAnswers(false);
    if (typeof window !== "undefined" && window.location.pathname !== "/user/dictation") {
      window.history.pushState({ page: "dictationNotebook" }, "", "/user/dictation");
    }
  };

  return (
    <div className="min-h-screen bg-[#e8f0f3] px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <button type="button" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-900" onClick={goHome}>
              <ArrowLeft className="size-4" />
              返回首页
            </button>
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl border border-[#b9d2df] bg-white text-[#31556d] shadow-sm">
                <BookOpenCheck className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-normal text-slate-950">默写本</h1>
                <p className="mt-1 text-sm text-slate-500">选择章节后直接展示整章内容，先填写挖空，再统一查看答案。</p>
              </div>
            </div>
          </div>

          {isPracticePage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]" onClick={backToDirectory}>
                <ArrowLeft className="size-4" />
                章节目录
              </Button>
              <Button variant="outline" className="rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]" onClick={resetCurrentChapter}>
                <RefreshCw className="size-4" />
                重做本章
              </Button>
              <Button className="rounded-full bg-[#31556d] text-white hover:bg-[#27475d]" onClick={() => setShowAnswers((current) => !current)}>
                {showAnswers ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                {showAnswers ? "隐藏答案" : "查看答案"}
              </Button>
            </div>
          ) : null}
        </div>

        {loadingSubjects ? (
          <div className="grid min-h-[360px] place-items-center rounded-3xl border border-white bg-white/80 shadow-sm">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 className="size-5 animate-spin" />
              正在加载默写本科目...
            </div>
          </div>
        ) : (
          <div className={cn("grid gap-5", isPracticePage ? "lg:grid-cols-1" : "lg:grid-cols-[280px_1fr]")}>
            {!isPracticePage ? <aside className="h-fit rounded-3xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="mb-3">
                <div className="text-sm font-black text-slate-900">选择科目</div>
                <div className="mt-1 text-xs text-slate-500">法考八科，可在后台继续维护</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {subjects.map((subject) => (
                  <button
                    type="button"
                    key={subject.id}
                    onClick={() => setActiveSubjectId(subject.id)}
                    className={cn(
                      "group rounded-2xl border px-4 py-3 text-left transition",
                      activeSubjectId === subject.id
                        ? "border-[#8bb1c6] bg-[#edf6fa] shadow-sm"
                        : "border-slate-200 bg-white hover:border-[#b9d2df] hover:bg-[#f7fbfd]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: subject.color }} />
                        <span className="truncate text-sm font-black text-slate-900">{subject.name}</span>
                      </span>
                      <span className="text-xs font-bold text-slate-400">{subject.itemCount}题</span>
                    </div>
                    {subject.description ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{subject.description}</div> : null}
                  </button>
                ))}
              </div>
            </aside> : null}

            <main className="min-w-0 space-y-5">
              {!activeSubjectId && !isPracticePage ? (
                <div className="grid min-h-[460px] place-items-center rounded-3xl border border-white bg-white/80 p-8 text-center shadow-sm">
                  <div>
                    <BookOpenCheck className="mx-auto size-12 text-[#8bb1c6]" />
                    <h2 className="mt-4 text-xl font-black text-slate-950">先选择一个科目</h2>
                    <p className="mt-2 text-sm text-slate-500">选择后会展示该科目下的章节，点进章节即可连续练完整章。</p>
                  </div>
                </div>
              ) : isPracticePage ? (
                <>
                  <section className="space-y-4">
                      <div className="sticky top-4 z-10 rounded-3xl border border-white bg-white/90 p-4 shadow-sm backdrop-blur">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-lg font-black text-slate-950">{activeChapter?.title ?? "默写练习"}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {items.length} 道题 · {filledCount}/{blankCount} 个挖空已填写
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" className="rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]" onClick={resetCurrentChapter}>
                              重做
                            </Button>
                            <Button className="rounded-full bg-[#31556d] text-white hover:bg-[#27475d]" onClick={() => setShowAnswers((current) => !current)}>
                              {showAnswers ? "隐藏答案" : "查看答案"}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {loadingItems ? (
                        <div className="grid min-h-[320px] place-items-center rounded-3xl border border-white bg-white/80 shadow-sm">
                          <div className="flex items-center gap-3 text-sm text-slate-500">
                            <Loader2 className="size-5 animate-spin" />
                            正在加载默写题...
                          </div>
                        </div>
                      ) : items.length === 0 ? (
                        <div className="rounded-3xl border border-white bg-white/80 p-10 text-center shadow-sm">
                          <div className="text-lg font-black text-slate-950">本章节暂无默写题</div>
                          <p className="mt-2 text-sm text-slate-500">后台发布题目后，这里会显示挖空填空练习。</p>
                        </div>
                      ) : (
                        <div className="relative overflow-hidden rounded-[28px] border border-[#d5e2e8] bg-white shadow-[0_24px_80px_rgba(47,79,98,0.16)]">
                          <div className="absolute left-7 top-0 h-full border-l border-dashed border-[#b7cbd6]" />
                          <div className="absolute left-[19px] top-10 hidden flex-col gap-9 md:flex">
                            {Array.from({ length: 10 }).map((_, index) => (
                              <span key={index} className="size-4 rounded-full border border-[#c9dce5] bg-[#e8f0f3] shadow-inner" />
                            ))}
                          </div>

                          <div className="relative p-6 pl-10 md:p-10 md:pl-16">
                            <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[#d8e4ea] pb-6">
                              <div>
                                <div className="mb-3 inline-flex rounded-full bg-[#e8f3f7] px-4 py-1.5 text-sm font-black text-[#31556d]">{activeSubject?.name ?? "默写本"}</div>
                                <h2 className="text-2xl font-black tracking-wide text-slate-950 md:text-3xl">
                                  {activeSubject?.name ? `${activeSubject.name}背诵版默写真题` : "背诵版默写本"}
                                </h2>
                                <p className="mt-2 text-sm font-semibold text-slate-500">{activeChapter?.title ?? "当前章节"} · 共 {items.length} 题</p>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-black tracking-[0.18em] text-[#31556d]">得恩法考</div>
                                <div className="mt-1 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Dictation Notebook</div>
                              </div>
                            </div>

                            <div className="space-y-0">
                              {items.map((item, index) => (
                                <DictationPaperItem
                                  key={item.id}
                                  item={item}
                                  index={index}
                                  drafts={drafts[item.id] ?? {}}
                                  showAnswer={showAnswers}
                                  onDraftChange={(blankId, value) => updateDraft(item.id, blankId, value)}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                  </section>
                </>
              ) : (
                <section className="rounded-3xl border border-white bg-white/80 p-5 shadow-sm backdrop-blur">
                  <div className="mb-4">
                    <div className="text-sm font-black text-slate-900">{activeSubject?.name ?? "当前科目"} · 章节目录</div>
                    <div className="mt-1 text-xs text-slate-500">这一页只显示章节。点击章节后，会进入新的默写练习页。</div>
                  </div>

                  {loadingChapters ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                      <Loader2 className="size-4 animate-spin" />
                      正在加载章节...
                    </div>
                  ) : chapters.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">当前科目暂无章节，请等待后台配置。</div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {chapters.map((chapter) => (
                        <button
                          key={chapter.id}
                          type="button"
                          onClick={() => openChapter(chapter.id)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-[#8bb1c6] hover:bg-[#f8fbfd] hover:shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-base font-black text-slate-900">{chapter.title}</span>
                            <span className="shrink-0 rounded-full bg-[#edf4f7] px-2.5 py-1 text-xs font-bold text-slate-500">{chapter.itemCount}题</span>
                          </div>
                          {chapter.description ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{chapter.description}</div> : null}
                          <div className="mt-3 text-xs font-bold text-[#31556d]">进入默写 →</div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
