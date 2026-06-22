import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, CheckCircle2, Eye, Loader2, RefreshCw, Shuffle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { cn } from "../../components/ui/utils";
import {
  recitationService,
  type RecitationChapter,
  type RecitationItem,
  type RecitationSubject,
} from "../../services/recitationService";

type TrainingView = "home" | "quiz";
type QuizStep = "subjects" | "chapters" | "practice";
type AnswerState = "idle" | "correct" | "wrong" | "revealed";

type RecallQuestion = {
  key: string;
  item: RecitationItem;
  itemIndex: number;
};

const normalizeAnswer = (value = "") => value.replace(/\s+/g, "").trim();

const getInitialTrainingView = (): TrainingView => {
  if (typeof window === "undefined") return "home";
  return window.location.pathname.startsWith("/user/recitation/quiz") ? "quiz" : "home";
};

const buildQuestions = (items: RecitationItem[]) =>
  items.map((item, itemIndex) => ({
    key: item.id,
    item,
    itemIndex,
  }));

const randomFrom = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

function RecallPrompt({ question }: { question: RecallQuestion }) {
  return (
    <div className="rounded-3xl border border-[#d8e6ee] bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#edf4f7] px-3 py-1 text-xs font-black text-[#31556d]">随机抽背</span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">第 {question.itemIndex + 1} 题</span>
        {question.item.source ? <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{question.item.source}</span> : null}
      </div>
      <div className="mb-4 text-lg font-black text-slate-950">{question.item.title}</div>
      <div className="whitespace-pre-wrap rounded-2xl bg-[#f7fbfd] p-5 font-serif text-[20px] leading-[2.1] text-slate-900">
        {question.item.question || question.item.content}
      </div>
    </div>
  );
}

export function RecitationTraining({ setPage }: { setPage?: (page: string) => void }) {
  const [view, setView] = useState<TrainingView>(() => getInitialTrainingView());
  const [subjects, setSubjects] = useState<RecitationSubject[]>([]);
  const [chapters, setChapters] = useState<RecitationChapter[]>([]);
  const [items, setItems] = useState<RecitationItem[]>([]);
  const [questions, setQuestions] = useState<RecallQuestion[]>([]);
  const [seenKeys, setSeenKeys] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<RecallQuestion | null>(null);
  const [activeSubjectId, setActiveSubjectId] = useState("");
  const [activeChapterId, setActiveChapterId] = useState("");
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectsLoaded, setSubjectsLoaded] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [answerDraft, setAnswerDraft] = useState("");
  const [answerState, setAnswerState] = useState<AnswerState>("idle");

  const activeSubject = useMemo(() => subjects.find((subject) => subject.id === activeSubjectId) ?? null, [activeSubjectId, subjects]);
  const activeChapter = useMemo(() => chapters.find((chapter) => chapter.id === activeChapterId) ?? null, [activeChapterId, chapters]);
  const step: QuizStep = activeChapterId ? "practice" : activeSubjectId ? "chapters" : "subjects";

  const goHome = () => {
    if (setPage) {
      setPage("home");
      return;
    }
    window.location.href = "/";
  };

  const goTrainingHome = () => {
    setView("home");
    setActiveSubjectId("");
    setActiveChapterId("");
    setCurrentQuestion(null);
    setQuestions([]);
    setItems([]);
    if (typeof window !== "undefined" && window.location.pathname !== "/user/recitation") {
      window.history.pushState({ page: "recitationTraining" }, "", "/user/recitation");
    }
  };

  const openQuiz = () => {
    setView("quiz");
    if (subjects.length === 0) setSubjectsLoaded(false);
    if (typeof window !== "undefined" && window.location.pathname !== "/user/recitation/quiz") {
      window.history.pushState({ page: "recitationTraining", mode: "quiz" }, "", "/user/recitation/quiz");
    }
  };

  const openDictation = () => {
    if (setPage) {
      setPage("dictationNotebook");
      return;
    }
    window.location.href = "/user/dictation";
  };

  useEffect(() => {
    const handlePopState = () => setView(getInitialTrainingView());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (view !== "quiz" || subjectsLoaded || loadingSubjects) return;
    let active = true;
    const load = async () => {
      setLoadingSubjects(true);
      try {
        const payload = await recitationService.getSubjects();
        if (!active) return;
        setSubjects(payload);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "背诵训练科目加载失败");
      } finally {
        if (active) {
          setSubjectsLoaded(true);
          setLoadingSubjects(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [loadingSubjects, subjectsLoaded, view]);

  useEffect(() => {
    if (view !== "quiz" || !activeSubjectId) return;
    let active = true;
    const load = async () => {
      setLoadingChapters(true);
      setActiveChapterId("");
      setItems([]);
      setQuestions([]);
      setCurrentQuestion(null);
      try {
        const payload = await recitationService.getChapters(activeSubjectId);
        if (active) setChapters(payload);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "背诵训练章节加载失败");
      } finally {
        if (active) setLoadingChapters(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [activeSubjectId, view]);

  const chooseQuestion = (sourceQuestions = questions, sourceSeenKeys = seenKeys) => {
    if (sourceQuestions.length === 0) {
      setCurrentQuestion(null);
      return;
    }

    const available = sourceQuestions.filter((question) => !sourceSeenKeys.includes(question.key));
    const nextPool = available.length > 0 ? available : sourceQuestions;
    const next = randomFrom(nextPool);
    setCurrentQuestion(next);
    setSeenKeys(available.length > 0 ? [...sourceSeenKeys, next.key] : [next.key]);
    setAnswerDraft("");
    setAnswerState("idle");
  };

  const openChapter = async (chapterId: string) => {
    setActiveChapterId(chapterId);
    setLoadingItems(true);
    setCurrentQuestion(null);
    setAnswerDraft("");
    setAnswerState("idle");
    try {
      const payload = await recitationService.getChapterItems(chapterId);
      const nextQuestions = buildQuestions(payload.items);
      setItems(payload.items);
      setQuestions(nextQuestions);
      setChapters(payload.chapters);
      setActiveSubjectId(payload.subject.id);
      setSeenKeys([]);
      if (nextQuestions.length > 0) {
        const first = randomFrom(nextQuestions);
        setCurrentQuestion(first);
        setSeenKeys([first.key]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "抽背题加载失败");
    } finally {
      setLoadingItems(false);
    }
  };

  const backToSubjects = () => {
    setActiveSubjectId("");
    setActiveChapterId("");
    setChapters([]);
    setItems([]);
    setQuestions([]);
    setCurrentQuestion(null);
    setAnswerDraft("");
    setAnswerState("idle");
  };

  const backToChapters = () => {
    setActiveChapterId("");
    setItems([]);
    setQuestions([]);
    setCurrentQuestion(null);
    setAnswerDraft("");
    setAnswerState("idle");
  };

  const checkAnswer = () => {
    if (!currentQuestion) return;
    if (!answerDraft.trim()) {
      toast.error("先输入答案再检查");
      return;
    }
    const correct = normalizeAnswer(answerDraft) === normalizeAnswer(currentQuestion.item.answer);
    setAnswerState(correct ? "correct" : "wrong");
  };

  const revealAnswer = () => {
    if (!currentQuestion) return;
    setAnswerState("revealed");
  };

  const nextQuestion = () => chooseQuestion();

  if (view === "home") {
    return (
      <div className="min-h-screen bg-[#e8f0f3] px-4 py-8 text-slate-900 md:px-8">
        <div className="mx-auto max-w-6xl">
          <button type="button" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-900" onClick={goHome}>
            <ArrowLeft className="size-4" />
            返回首页
          </button>

          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl border border-[#b9d2df] bg-white text-[#31556d] shadow-sm">
              <BookOpenCheck className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-950">背诵训练</h1>
              <p className="mt-1 text-sm text-slate-500">默写本用于整章填空，抽背用于随机抽查记忆点。</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <button type="button" onClick={openDictation} className="group rounded-3xl border border-white bg-white/85 p-7 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#8bb1c6] hover:shadow-xl">
              <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-[#edf6fa] text-[#31556d]">
                <BookOpenCheck className="size-7" />
              </div>
              <div className="text-xl font-black text-slate-950">默写本</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">按科目和章节进入，整章连续展示填空内容，适合系统背诵和复盘。</p>
              <div className="mt-6 text-sm font-black text-[#31556d]">进入默写本 →</div>
            </button>

            <button type="button" onClick={openQuiz} className="group rounded-3xl border border-white bg-white/85 p-7 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#8bb1c6] hover:shadow-xl">
              <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                <Shuffle className="size-7" />
              </div>
              <div className="text-xl font-black text-slate-950">抽背</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">选择学科和章节后随机出题，上方显示问题，下方输入答案，答完立即判定。</p>
              <div className="mt-6 text-sm font-black text-[#31556d]">开始抽背 →</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e8f0f3] px-4 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <button type="button" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-900" onClick={goTrainingHome}>
              <ArrowLeft className="size-4" />
              返回背诵训练
            </button>
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl border border-[#b9d2df] bg-white text-[#31556d] shadow-sm">
                <Shuffle className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-950">抽背</h1>
                <p className="mt-1 text-sm text-slate-500">选择学科、章节后随机抽题，答对后进入下一题，答错可再想一下或查看答案。</p>
              </div>
            </div>
          </div>

          {step === "chapters" ? (
            <Button variant="outline" className="rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]" onClick={backToSubjects}>
              <ArrowLeft className="size-4" />
              重新选科
            </Button>
          ) : null}
          {step === "practice" ? (
            <Button variant="outline" className="rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]" onClick={backToChapters}>
              <ArrowLeft className="size-4" />
              章节目录
            </Button>
          ) : null}
        </div>

        {step === "subjects" ? (
          <section className="rounded-3xl border border-white bg-white/85 p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-black text-slate-950">1、选择学科</h2>
              <p className="mt-1 text-sm text-slate-500">选择学科后进入章节目录。</p>
            </div>
            {loadingSubjects ? (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                正在加载学科...
              </div>
            ) : subjects.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                <div>暂无可练习的抽背学科，请在后台“抽背管理”中启用学科并发布题目。</div>
                <Button
                  variant="outline"
                  className="mt-4 rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]"
                  onClick={() => setSubjectsLoaded(false)}
                >
                  <RefreshCw className="size-4" />
                  重新加载
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {subjects.map((subject) => (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => setActiveSubjectId(subject.id)}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#8bb1c6] hover:bg-[#f8fbfd] hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: subject.color }} />
                        <span className="truncate text-base font-black text-slate-950">{subject.name}</span>
                      </span>
                      <span className="text-xs font-bold text-slate-400">{subject.itemCount}题</span>
                    </div>
                    {subject.description ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{subject.description}</div> : null}
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {step === "chapters" ? (
          <section className="rounded-3xl border border-white bg-white/85 p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-black text-slate-950">2、{activeSubject?.name ?? "当前学科"} · 选择章节</h2>
              <p className="mt-1 text-sm text-slate-500">进入章节后系统会随机抽取该章节下的问题。</p>
            </div>
            {loadingChapters ? (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                正在加载章节...
              </div>
            ) : chapters.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">当前学科暂无章节。</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {chapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => void openChapter(chapter.id)}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#8bb1c6] hover:bg-[#f8fbfd] hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-base font-black text-slate-950">{chapter.title}</span>
                      <span className="rounded-full bg-[#edf4f7] px-2.5 py-1 text-xs font-bold text-slate-500">{chapter.itemCount}题</span>
                    </div>
                    {chapter.description ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{chapter.description}</div> : null}
                    <div className="mt-3 text-xs font-black text-[#31556d]">开始随机抽背 →</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {step === "practice" ? (
          <section className="space-y-4">
            <div className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-950">{activeSubject?.name ?? "抽背"} · {activeChapter?.title ?? "当前章节"}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    共 {items.length} 道题 · 已抽 {Math.min(seenKeys.length, questions.length)}/{questions.length}
                  </div>
                </div>
                <Button variant="outline" className="rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]" onClick={() => chooseQuestion(questions, [])}>
                  <RefreshCw className="size-4" />
                  换一题
                </Button>
              </div>
            </div>

            {loadingItems ? (
              <div className="grid min-h-[360px] place-items-center rounded-3xl border border-white bg-white/85 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="size-5 animate-spin" />
                  正在随机出题...
                </div>
              </div>
            ) : !currentQuestion ? (
              <div className="rounded-3xl border border-white bg-white/85 p-10 text-center shadow-sm">
                <div className="text-lg font-black text-slate-950">本章节暂无可抽背内容</div>
                <p className="mt-2 text-sm text-slate-500">需要在后台抽背管理中配置抽背题后才可以抽背。</p>
              </div>
            ) : (
              <>
                <RecallPrompt question={currentQuestion} />

                <div className="rounded-3xl border border-white bg-white/90 p-6 text-center shadow-sm">
                  <div className="mb-3 text-sm font-black text-slate-700">3、输入答案</div>
                  <textarea
                    value={answerDraft}
                    onChange={(event) => {
                      setAnswerDraft(event.target.value);
                      if (answerState === "wrong") setAnswerState("idle");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) checkAnswer();
                    }}
                    className="min-h-[150px] w-full max-w-3xl rounded-2xl border border-[#cbdce6] bg-white px-4 py-3 text-left text-base font-semibold leading-7 text-slate-950 outline-none transition focus:border-[#31556d]"
                    placeholder="在这里输入答案，Ctrl + Enter 检查"
                  />

                  {answerState !== "idle" ? (
                    <div
                      className={cn(
                        "mx-auto mt-5 max-w-xl rounded-2xl border p-4 text-left",
                        answerState === "correct"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : answerState === "wrong"
                            ? "border-rose-200 bg-rose-50 text-rose-800"
                            : "border-amber-200 bg-amber-50 text-amber-800",
                      )}
                    >
                      <div className="flex items-center gap-2 text-base font-black">
                        {answerState === "correct" ? <CheckCircle2 className="size-5" /> : answerState === "wrong" ? <XCircle className="size-5" /> : <Eye className="size-5" />}
                        {answerState === "correct" ? "答对了" : answerState === "wrong" ? "错误，再想一下" : "已查看答案"}
                      </div>
                      <div className="mt-2 text-sm leading-6">
                        正确答案：<strong className="whitespace-pre-wrap">{currentQuestion.item.answer || "未配置答案"}</strong>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <Button className="rounded-full bg-[#31556d] text-white hover:bg-[#27475d]" onClick={checkAnswer}>
                      检查答案
                    </Button>
                    {answerState === "wrong" ? (
                      <Button variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" onClick={revealAnswer}>
                        <Eye className="size-4" />
                        查看答案
                      </Button>
                    ) : null}
                    {answerState === "correct" || answerState === "revealed" || answerState === "wrong" ? (
                      <Button variant="outline" className="rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]" onClick={nextQuestion}>
                        下一题
                      </Button>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
