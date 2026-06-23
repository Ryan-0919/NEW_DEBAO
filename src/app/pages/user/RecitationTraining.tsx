import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, CheckCircle2, Eye, Loader2, Medal, RefreshCw, Shuffle, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { cn } from "../../components/ui/utils";
import {
  recitationService,
  type RecitationChapter,
  type RecitationItem,
  type RecitationLeaderboardEntry,
  type RecitationLeaderboardPayload,
  type RecitationSubject,
} from "../../services/recitationService";

type TrainingView = "home" | "quiz";
type QuizStep = "subjects" | "chapters" | "practice";
type QuizMode = "subject" | "shuffle";
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

const emptyLeaderboard: RecitationLeaderboardPayload = {
  total: [],
  today: [],
  myTotalPoints: 0,
  myTodayPoints: 0,
};

function LeaderboardPanel({
  title,
  subtitle,
  entries,
  myPoints,
  icon,
}: {
  title: string;
  subtitle: string;
  entries: RecitationLeaderboardEntry[];
  myPoints: number;
  icon: "total" | "today";
}) {
  return (
    <aside className="h-fit rounded-[28px] border border-white bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="mb-4 flex items-center gap-3">
        <div className={cn("grid size-10 place-items-center rounded-2xl", icon === "total" ? "bg-amber-50 text-amber-700" : "bg-[#edf4f7] text-[#31556d]")}>
          {icon === "total" ? <Trophy className="size-5" /> : <Medal className="size-5" />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-black text-slate-950">{title}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</div>
        </div>
      </div>

      <div className="mb-3 rounded-2xl border border-[#d8e6ee] bg-[#f8fbfd] px-3 py-2">
        <div className="text-xs font-bold text-slate-500">我的积分</div>
        <div className="mt-1 text-2xl font-black tracking-tight text-[#31556d]">{myPoints}</div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-400">暂无积分记录</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={`${title}-${entry.userId}`}
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-3 py-2",
                entry.isMine ? "border-[#8bb1c6] bg-[#edf6fa]" : "border-slate-100 bg-white",
              )}
            >
              <div
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-black",
                  entry.rank === 1
                    ? "bg-amber-100 text-amber-700"
                    : entry.rank === 2
                      ? "bg-slate-100 text-slate-600"
                      : entry.rank === 3
                        ? "bg-orange-100 text-orange-700"
                        : "bg-[#edf4f7] text-[#31556d]",
                )}
              >
                {entry.rank}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-slate-900">{entry.nickname || entry.phone || "得宝学员"}</div>
                <div className="truncate text-xs text-slate-400">{entry.phone}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-[#31556d]">{entry.points}</div>
                <div className="text-[10px] font-bold text-slate-400">积分</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function RecallPrompt({ question }: { question: RecallQuestion }) {
  return (
    <div className="rounded-3xl border border-[#d8e6ee] bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#edf4f7] px-3 py-1 text-xs font-black text-[#31556d]">随机抽背</span>
        {question.item.subjectName ? <span className="rounded-full bg-[#31556d] px-3 py-1 text-xs font-black text-white">{question.item.subjectName}</span> : null}
        {question.item.chapterTitle ? <span className="rounded-full bg-[#eef2f6] px-3 py-1 text-xs font-bold text-slate-600">{question.item.chapterTitle}</span> : null}
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
  const [quizMode, setQuizMode] = useState<QuizMode>("subject");
  const [activeSubjectId, setActiveSubjectId] = useState("");
  const [activeChapterId, setActiveChapterId] = useState("");
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectsLoaded, setSubjectsLoaded] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [answerDraft, setAnswerDraft] = useState("");
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const [countdown, setCountdown] = useState(30);
  const [leaderboard, setLeaderboard] = useState<RecitationLeaderboardPayload>(emptyLeaderboard);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [checkingAnswer, setCheckingAnswer] = useState(false);

  const activeSubject = useMemo(() => subjects.find((subject) => subject.id === activeSubjectId) ?? null, [activeSubjectId, subjects]);
  const activeChapter = useMemo(() => chapters.find((chapter) => chapter.id === activeChapterId) ?? null, [activeChapterId, chapters]);
  const step: QuizStep = quizMode === "shuffle" ? "practice" : activeChapterId ? "practice" : activeSubjectId ? "chapters" : "subjects";
  const isShuffleMode = quizMode === "shuffle";

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
    setQuizMode("subject");
    setQuestions([]);
    setItems([]);
    if (typeof window !== "undefined" && window.location.pathname !== "/user/recitation") {
      window.history.pushState({ page: "recitationTraining" }, "", "/user/recitation");
    }
  };

  const openQuiz = () => {
    setView("quiz");
    setQuizMode("subject");
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
    if (view !== "quiz" || subjectsLoaded) return;
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
  }, [subjectsLoaded, view]);

  useEffect(() => {
    if (view !== "quiz" || leaderboardLoaded) return;
    let active = true;
    const load = async () => {
      try {
        const payload = await recitationService.getLeaderboard();
        if (active) setLeaderboard(payload);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "抽背排行榜加载失败");
      } finally {
        if (active) setLeaderboardLoaded(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [leaderboardLoaded, view]);

  useEffect(() => {
    if (view !== "quiz" || quizMode !== "subject" || !activeSubjectId) return;
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
  }, [activeSubjectId, quizMode, view]);

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
    setCountdown(30);
  };

  const openChapter = async (chapterId: string) => {
    setQuizMode("subject");
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
        setCountdown(30);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "抽背题加载失败");
    } finally {
      setLoadingItems(false);
    }
  };

  const openShuffleQuiz = async () => {
    setQuizMode("shuffle");
    setActiveSubjectId("");
    setActiveChapterId("");
    setChapters([]);
    setLoadingItems(true);
    setCurrentQuestion(null);
    setAnswerDraft("");
    setAnswerState("idle");
    try {
      const payload = await recitationService.getAllItems();
      const nextQuestions = buildQuestions(payload.items);
      setItems(payload.items);
      setQuestions(nextQuestions);
      setSeenKeys([]);
      if (nextQuestions.length > 0) {
        const first = randomFrom(nextQuestions);
        setCurrentQuestion(first);
        setSeenKeys([first.key]);
        setCountdown(30);
      }
    } catch (error) {
      setQuizMode("subject");
      toast.error(error instanceof Error ? error.message : "乱序抽背题加载失败");
    } finally {
      setLoadingItems(false);
    }
  };

  const backToSubjects = () => {
    setQuizMode("subject");
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
    setQuizMode("subject");
    setActiveChapterId("");
    setItems([]);
    setQuestions([]);
    setCurrentQuestion(null);
    setAnswerDraft("");
    setAnswerState("idle");
  };

  const checkAnswer = async () => {
    if (!currentQuestion) return;
    if (answerState !== "idle" || checkingAnswer) return;
    if (!answerDraft.trim()) {
      toast.error("先输入答案再检查");
      return;
    }
    setCheckingAnswer(true);
    try {
      const result = await recitationService.submitAnswer(currentQuestion.item.id, answerDraft);
      setLeaderboard(result.leaderboard);
      setLeaderboardLoaded(true);
      setAnswerState(result.correct ? "correct" : "wrong");
      if (result.correct && result.pointsAwarded > 0) toast.success("+1 积分");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "检查答案失败");
    } finally {
      setCheckingAnswer(false);
    }
  };

  const revealAnswer = () => {
    if (!currentQuestion) return;
    setAnswerState("revealed");
  };

  const nextQuestion = () => chooseQuestion();

  useEffect(() => {
    if (!currentQuestion || answerState !== "idle") return;
    setCountdown(30);
  }, [currentQuestion?.key]);

  useEffect(() => {
    if (!currentQuestion || answerState !== "idle") return;
    if (countdown <= 0) {
      if (answerDraft.trim()) {
        void checkAnswer();
      } else {
        setAnswerState("wrong");
      }
      return;
    }
    const timer = window.setTimeout(() => setCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [answerDraft, answerState, countdown, currentQuestion]);

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
      <div className="mx-auto grid max-w-[1900px] gap-5 2xl:grid-cols-[310px_minmax(0,1120px)_310px] 2xl:items-start">
        <div className="order-2 2xl:sticky 2xl:top-24 2xl:order-1">
          <LeaderboardPanel title="总排行榜" subtitle="按累计积分排序" entries={leaderboard.total} myPoints={leaderboard.myTotalPoints} icon="total" />
        </div>
        <main className="order-1 min-w-0 2xl:order-2">
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
          {step === "practice" && !isShuffleMode ? (
            <Button variant="outline" className="rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]" onClick={backToChapters}>
              <ArrowLeft className="size-4" />
              章节目录
            </Button>
          ) : null}
          {step === "practice" && isShuffleMode ? (
            <Button variant="outline" className="rounded-full border-[#bfd2dc] bg-white text-slate-700 hover:bg-[#f5fafc]" onClick={backToSubjects}>
              <ArrowLeft className="size-4" />
              抽背入口
            </Button>
          ) : null}
        </div>

        {step === "subjects" ? (
          <section className="rounded-3xl border border-white bg-white/85 p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">1、选择抽背方式</h2>
                <p className="mt-1 text-sm text-slate-500">可以按科目抽背，也可以不分科目乱序随机抽背。</p>
              </div>
              <Button className="rounded-full bg-[#31556d] text-white hover:bg-[#27475d]" disabled={loadingItems} onClick={() => void openShuffleQuiz()}>
                {loadingItems ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />}
                乱序随机抽背
              </Button>
            </div>
            <div className="mb-4 rounded-2xl border border-dashed border-[#bfd2dc] bg-[#f8fbfd] p-4">
              <div className="font-black text-slate-950">科目随机抽背</div>
              <div className="mt-1 text-sm text-slate-500">选择一个学科后进入章节，再从该章节内随机抽题。</div>
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
                  <div className="text-lg font-black text-slate-950">{isShuffleMode ? "乱序随机抽背" : `${activeSubject?.name ?? "抽背"} · ${activeChapter?.title ?? "当前章节"}`}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    共 {items.length} 道题 · 已抽 {Math.min(seenKeys.length, questions.length)}/{questions.length}
                    {isShuffleMode ? " · 不按科目限制，题目上方会显示所属科目和章节" : ""}
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
                  <div className="mb-3 flex flex-wrap items-center justify-center gap-3 text-sm font-black text-slate-700">
                    <span>3、输入答案</span>
                    {answerState === "idle" ? (
                      <span className={cn("rounded-full px-3 py-1 text-xs", countdown <= 5 ? "bg-rose-50 text-rose-700" : "bg-[#edf4f7] text-[#31556d]")}>
                        倒计时 {countdown}s
                      </span>
                    ) : null}
                  </div>
                  <textarea
                    value={answerDraft}
                    onChange={(event) => {
                      setAnswerDraft(event.target.value);
                      if (answerState === "wrong") {
                        setAnswerState("idle");
                        setCountdown(30);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void checkAnswer();
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
                      {answerState === "revealed" ? <div className="mt-2 text-sm leading-6">
                        正确答案：<strong className="whitespace-pre-wrap">{currentQuestion.item.answer || "未配置答案"}</strong>
                      </div> : null}
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <Button className="rounded-full bg-[#31556d] text-white hover:bg-[#27475d]" disabled={answerState !== "idle" || checkingAnswer} onClick={() => void checkAnswer()}>
                      {checkingAnswer ? <Loader2 className="size-4 animate-spin" /> : null}
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
        </main>
        <div className="order-3 2xl:sticky 2xl:top-24">
          <LeaderboardPanel title="今日排行榜" subtitle="按今日积分排序" entries={leaderboard.today} myPoints={leaderboard.myTodayPoints} icon="today" />
        </div>
      </div>
    </div>
  );
}
