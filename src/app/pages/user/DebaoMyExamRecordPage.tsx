import { AlertCircle, ArrowLeft, BookOpenCheck, CheckCircle2, Clock3, FileText, ListChecks, Pause, PenLine, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnnotatedAnswerText } from "../../components/AnnotatedAnswerText";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { mockExamService } from "../../services/mockExamService";
import type { MockExamQuestion, MockExamRecordDetail, MockExamSubjectiveSubQuestion } from "../../services/mockExamService";

export type MyExamRecordView = "result" | "review-pending";
type ObjectiveResultFilter = "all" | "wrong" | "correct" | "unanswered";
type ObjectiveFilterOption = { value: ObjectiveResultFilter; label: string; count: number };

export const getMyExamRecordRouteFromPath = (pathname: string) => {
  const match = pathname.match(/^\/user\/my-exams\/records\/([^/]+)\/(result|review-pending)\/?$/);
  if (!match) return null;
  return {
    recordId: decodeURIComponent(match[1]),
    view: match[2] as MyExamRecordView,
  };
};

const isSubjectiveQuestion = (question: MockExamQuestion) => question.type === "subjective_case";

const formatDateTime = (value?: string | null) => {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (next: number) => `${next}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDuration = (seconds?: number | null) => {
  const safe = Math.max(0, Number(seconds ?? 0) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remain = safe % 60;
  return [hours, minutes, remain].map((item) => `${item}`.padStart(2, "0")).join(":");
};

const formatClock = (seconds?: number | null) => {
  const safe = Math.max(0, Number(seconds ?? 0) || 0);
  const minutes = Math.floor(safe / 60);
  const remain = safe % 60;
  return `${minutes}:${`${remain}`.padStart(2, "0")}`;
};

const stripHtml = (value?: string | null) => (value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const handwritingStyle = {
  fontFamily: '"KaiTi","STKaiti","Kaiti SC",serif',
};

const isPendingReviewRecord = (record: MockExamRecordDetail) =>
  record.status === "submitted" &&
  record.paper.paperType === "subjective" &&
  record.reviewWorkflowStatus !== "published" &&
  record.reviewWorkflowStatus !== "not_required";

const getQuestionPrompt = (question: MockExamQuestion, subQuestion: MockExamSubjectiveSubQuestion, index: number) => {
  const caseMaterial = stripHtml(question.material);
  const stem = stripHtml(question.stem);
  const title = stripHtml(subQuestion.title) || `第${index + 1}问`;

  return {
    intro: [caseMaterial, stem].filter(Boolean).join("\n\n"),
    title,
  };
};

function PaperSectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="h-[10px] w-[10px] rounded-full bg-[#f43f5e]" />
      <h3 className="text-[22px] font-bold text-[#18181b]">{title}</h3>
    </div>
  );
}

function LessonAudioInlinePlayer({ url, durationSeconds }: { url: string; durationSeconds?: number | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePause = () => setPlaying(false);
    const handlePlay = () => setPlaying(true);
    const handleEnded = () => setPlaying(false);

    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [url]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play().catch(() => undefined);
      return;
    }
    audio.pause();
  };

  return (
    <div className="mt-4 flex justify-start">
      <div className="inline-flex max-w-full items-center gap-4 rounded-full border border-[#ececf1] bg-[#fcfcfd] px-4 py-3 text-[#433b35] shadow-[0_10px_22px_rgba(24,24,27,0.05)]">
        <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
        <span className="text-[18px] font-medium text-[#433b35]">微课</span>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-white transition hover:bg-[#2b2b31]"
          onClick={togglePlay}
          aria-label={playing ? "暂停音频" : "播放音频"}
        >
          {playing ? <Pause className="ml-[1px] size-5" /> : <Play className="ml-[2px] size-5 fill-current" />}
        </button>
        <div className="flex min-w-[132px] items-center gap-[5px]">
          {Array.from({ length: 10 }).map((_, index) => (
            <span
              key={index}
              className="w-[3px] shrink-0 rounded-full bg-[#e2485a]"
              style={{
                height: `${14 + [8, 18, 12, 22, 14, 24, 16, 20, 12, 18][index]}px`,
                opacity: playing ? 0.96 : 0.56,
              }}
            />
          ))}
        </div>
        <span className="shrink-0 text-[15px] font-medium tracking-[0.04em] text-[#71717a]">{formatClock(durationSeconds)}</span>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof CheckCircle2; tone: string }) {
  return (
    <div className="rounded-[22px] border border-[#ececf1] bg-[#fafafa] p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-[16px] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <Icon className={`size-5 ${tone}`} />
        </div>
        <div>
          <div className="text-[13px] text-[#8f8f95]">{label}</div>
          <div className="mt-1 text-xl font-semibold text-[#18181b]">{value}</div>
        </div>
      </div>
    </div>
  );
}

function ObjectiveQuestionBlock({ question, highlighted = false }: { question: MockExamQuestion; highlighted?: boolean }) {
  const correctText = question.correctAnswerKeys?.length ? question.correctAnswerKeys.join("、") : "未配置";
  const userText = question.userAnswerKeys?.length ? question.userAnswerKeys.join("、") : "未作答";
  const correctKeys = new Set(question.correctAnswerKeys ?? []);
  const userKeys = new Set(question.userAnswerKeys ?? []);
  const promptText = [stripHtml(question.material), stripHtml(question.stem)].filter(Boolean).join("\n\n") || `第${question.sortOrder}题`;

  return (
    <article
      id={`question-${question.id}`}
      className={`scroll-mt-24 rounded-[28px] border border-[#ececf1] bg-white px-5 py-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)] transition md:px-6 ${
        highlighted ? "ring-2 ring-[#c9d7ff] shadow-[0_24px_46px_rgba(96,129,214,0.12)]" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-[#18181b] text-[24px] font-black text-white shadow-[0_12px_24px_rgba(24,24,27,0.14)]">
            {question.sortOrder}
          </div>
          <div>
            <div className="text-[23px] font-semibold leading-tight tracking-[-0.04em] text-[#18181b]">第{question.sortOrder}题</div>
            <div className="mt-2 text-[15px] text-[#71717a]">
              {question.typeLabel} · {question.score} 分
            </div>
            {question.sectionLabel ? <div className="mt-2 text-[14px] text-[#a1a1aa]">{question.sectionLabel}</div> : null}
          </div>
        </div>
        <span className={`rounded-full border px-4 py-1 text-[13px] font-semibold ${question.isCorrect ? "border-emerald-200 bg-emerald-50 text-[#1f8a48]" : "border-rose-200 bg-rose-50 text-[#d04d4d]"}`}>
          {question.isCorrect ? "正确" : "错误"}
        </span>
      </div>

      <div className="mt-5 rounded-[22px] border border-[#eef0f3] bg-[#fcfcfd] px-5 py-5 text-[18px] leading-9 text-[#27272a]">
        <div className="whitespace-pre-wrap">{promptText}</div>
      </div>

      <div className="mt-5 space-y-3">
        {question.options.map((option) => {
          const isCorrectOption = correctKeys.has(option.key);
          const isUserOption = userKeys.has(option.key);
          const optionClass = isCorrectOption
            ? "border-emerald-200 bg-emerald-50/70"
            : isUserOption
              ? "border-rose-200 bg-rose-50/70"
              : "border-[#eef0f3] bg-white";

          return (
            <div key={option.id} className={`rounded-[18px] border px-4 py-4 transition ${optionClass}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${
                      isCorrectOption
                        ? "bg-emerald-600 text-white"
                        : isUserOption
                          ? "bg-rose-500 text-white"
                          : "bg-[#f4f4f5] text-[#52525b]"
                    }`}
                  >
                    {option.key}
                  </div>
                  <div className="min-w-0 whitespace-pre-wrap text-[17px] leading-8 text-[#27272a]">{stripHtml(option.content)}</div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {isUserOption ? (
                    <span className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[12px] font-medium text-rose-600">
                      你的选择
                    </span>
                  ) : null}
                  {isCorrectOption ? (
                    <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[12px] font-medium text-emerald-700">
                      正确答案
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-[20px] border border-[#eef0f3] bg-white px-5 py-4">
          <div className="text-[15px] font-medium text-[#8f8f95]">你的答案</div>
          <div className="mt-3 text-[20px] font-semibold text-[#18181b]">{userText}</div>
        </div>
        <div className="rounded-[20px] border border-[#eef0f3] bg-white px-5 py-4">
          <div className="text-[15px] font-medium text-[#8f8f95]">参考答案</div>
          <div className="mt-3 text-[20px] font-semibold text-[#18181b]">{correctText}</div>
        </div>
        <div className="rounded-[20px] border border-[#eef0f3] bg-white px-5 py-4">
          <div className="text-[15px] font-medium text-[#8f8f95]">本题得分</div>
          <div className="mt-3 text-[20px] font-semibold text-[#18181b]">{question.earnedScore}/{question.score}</div>
        </div>
      </div>

      {stripHtml(question.analysis) ? (
        <div className="mt-5 rounded-[20px] border border-[#ececf1] bg-[#fafafa] px-5 py-4 text-[17px] leading-8 text-[#52525b]">
          <div className="mb-2 text-[17px] font-semibold text-[#18181b]">答案解析</div>
          <div className="whitespace-pre-wrap">{stripHtml(question.analysis)}</div>
        </div>
      ) : null}
    </article>
  );
}

const getQuestionPreview = (question: MockExamQuestion) => {
  const preview = stripHtml(question.material ? `${question.material} ${question.stem}` : question.stem);
  return preview || `第${question.sortOrder}题`;
};

const isPlaceholderMissedPointTitle = (value: string) => {
  const compact = stripHtml(value).replace(/\s+/g, "");
  if (!compact) return true;
  return compact === "遗漏点" || /^遗漏点(?:[0-9一二三四五六七八九十]+|[（(][0-9一二三四五六七八九十]+[）)])$/.test(compact);
};

function SubjectiveSubQuestionReview({
  subQuestion,
  pending,
}: {
  subQuestion: MockExamSubjectiveSubQuestion;
  pending: boolean;
}) {
  const skippedReview = Boolean(subQuestion.skippedReview);
  const hasAnswerMarks = Array.isArray(subQuestion.answerMarks) && subQuestion.answerMarks.length > 0;
  const hasReviewComment = `${subQuestion.reviewComment ?? ""}`.trim().length > 0;
  const hasMissedPoints = Array.isArray(subQuestion.missedPoints) && subQuestion.missedPoints.length > 0;
  const hasActualReviewContent = Boolean(subQuestion.isReviewed) && (hasAnswerMarks || hasReviewComment || hasMissedPoints);
  const showReview = !pending && !skippedReview && hasActualReviewContent;
  const missedPoints = (subQuestion.missedPoints ?? [])
    .map((point, pointIndex) => ({
      id: point.id || `missed_${pointIndex + 1}`,
      title: stripHtml(point.title),
      comment: stripHtml(point.comment || point.suggestion || ""),
      score: Number(point.score ?? 0) || 0,
    }))
    .filter((point) => point.title && !isPlaceholderMissedPointTitle(point.title));
  const reviewParagraphs = (subQuestion.reviewComment || "暂无批改评语").split(/\n+/).filter(Boolean);
  const answerTitle = pending ? "我的答案" : skippedReview ? "我的答案（本问已直接展示参考答案）" : `我的答案（得分：${Number(subQuestion.score ?? 0)}）`;

  return (
    <div className="space-y-4">
      {subQuestion.placeholder ? (
        <section className="rounded-[24px] border border-[#ececf1] bg-white px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
          <PaperSectionTitle title="作答提示" />
          <div className="rounded-[18px] border border-[#eef0f3] bg-[#fcfcfd] px-5 py-4 text-[17px] leading-8 text-[#52525b]">
            {stripHtml(subQuestion.placeholder)}
          </div>
        </section>
      ) : null}

      <section className="rounded-[24px] border border-[#ececf1] bg-white px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
        <PaperSectionTitle title={answerTitle} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div>
            <div className="rounded-[18px] border border-[#eef0f3] bg-white px-2 py-2">
              <AnnotatedAnswerText
                answer={subQuestion.answer?.trim() || "未作答"}
                marks={showReview ? subQuestion.answerMarks : []}
                paragraphClassName="whitespace-pre-wrap text-[20px] leading-[2.2] text-[#18181b]"
              />
            </div>

            {showReview ? (
              <div className="relative mt-6 px-5 py-3">
                <img
                  src="/lsyz.png"
                  alt="已批注"
                  className="pointer-events-none absolute right-5 top-[-4px] h-[65px] w-auto select-none opacity-90"
                  style={{ transform: "rotate(-7deg)" }}
                />
                <div className="mb-3 pr-28">
                  <div className="text-[18px] font-semibold text-[#18181b]">老师评语：</div>
                </div>
                <div className="space-y-4 pr-2 text-[17px] leading-[32px] text-[#e2485a]" style={handwritingStyle}>
                  {(reviewParagraphs.length > 0 ? reviewParagraphs : ["暂无批改评语"]).map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="whitespace-pre-wrap">{paragraph}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {showReview ? (
            <aside className="relative px-1 pt-3 xl:sticky xl:top-6 xl:self-start">
              <div className="relative overflow-hidden rounded-[20px] border border-[#ececf1] bg-white px-5 pb-5 pt-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="relative">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="pr-2">
                      <div className="text-[18px] leading-none text-[#e11d48]" style={handwritingStyle}>
                        该问遗漏点：
                      </div>
                    </div>
                    <span className="rounded-full border border-[#fda4af] bg-[#fff1f2] px-3 py-1 text-[13px] font-semibold text-[#e11d48]">
                      {missedPoints.length} 个
                    </span>
                  </div>

                  {missedPoints.length > 0 ? (
                    <div className="relative mt-5 space-y-4">
                      {missedPoints.map((point) => (
                        <div key={point.id} className="relative pl-5">
                          <div className="absolute left-[-4px] top-2.5 size-[9px] rounded-full bg-[#f43f5e]" />
                          <div className="border-b border-dashed border-[#ebecef] pb-3 last:border-b-0">
                            <div className="text-[16px] font-semibold text-[#e2485a]">{point.title}</div>
                            {point.comment ? <p className="mt-2 text-[14px] leading-7 text-[#52525b]">{point.comment}</p> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="relative mt-5">
                      <div className="rounded-[14px] border border-[#ebecef] bg-[#fafafa] px-4 py-4 text-[14px] leading-7 text-[#52525b]">
                        本问暂无遗漏点。
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      {!pending ? (
        <section className="overflow-hidden rounded-[24px] border border-[#ececf1] bg-white shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
          <div className="px-5 py-4">
            <span className="text-[18px] font-semibold text-[#18181b]">参考答案</span>
          </div>
          <div className="border-t border-[#eef0f3] px-5 py-5">
            <div className="whitespace-pre-wrap text-[18px] leading-9 text-[#433b35]">
              {subQuestion.referenceAnswer || "暂无参考答案"}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SubjectiveQuestionBlock({ question, pending }: { question: MockExamQuestion; pending: boolean }) {
  const [activeSubQuestionId, setActiveSubQuestionId] = useState(question.subjectiveSubQuestions[0]?.id ?? "");

  useEffect(() => {
    setActiveSubQuestionId(question.subjectiveSubQuestions[0]?.id ?? "");
  }, [question.id, question.subjectiveSubQuestions]);

  const activeSubQuestionIndex = Math.max(
    0,
    question.subjectiveSubQuestions.findIndex((subQuestion) => subQuestion.id === activeSubQuestionId),
  );
  const activeSubQuestion = question.subjectiveSubQuestions[activeSubQuestionIndex] ?? question.subjectiveSubQuestions[0] ?? null;
  const prompt = activeSubQuestion ? getQuestionPrompt(question, activeSubQuestion, activeSubQuestionIndex) : { intro: "", title: "题干未配置" };
  const audioUrl = question.lessonAudioUrl || question.reviewVoiceUrl || "";
  const audioDuration = Number(question.lessonAudioDurationSeconds ?? 0) > 0 ? question.lessonAudioDurationSeconds : question.reviewVoiceDurationSeconds;
  const answeredSubQuestionCount = question.subjectiveSubQuestions.filter((subQuestion) => subQuestion.answer?.trim()).length;
  const reviewedSubQuestionCount = question.subjectiveSubQuestions.filter((subQuestion) => subQuestion.isReviewed).length;

  return (
    <article id={`question-${question.id}`} className="scroll-mt-24">
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start">
        <aside className="rounded-[28px] border border-[#ececf1] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)] xl:sticky xl:top-24">
          <div className="border-b border-[#eef0f3] px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] tracking-[0.14em] text-[#8f8f95]">题干与音频</div>
                <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#18181b]">第{question.sortOrder}题</h3>
              </div>
              <span className="rounded-full border border-[#ececf1] bg-[#fafafa] px-3 py-1 text-[13px] font-semibold text-[#71717a]">
                {question.score} 分
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-center font-semibold text-[#2563eb]">小问 {question.subjectiveSubQuestions.length}</span>
              <span className="rounded-full bg-[#fff1f2] px-3 py-1 text-center font-semibold text-[#e11d48]">已答 {answeredSubQuestionCount}</span>
              <span className="rounded-full bg-[#f0fdf4] px-3 py-1 text-center font-semibold text-[#166534]">已批 {reviewedSubQuestionCount}</span>
              <span className="rounded-full bg-[#fafafa] px-3 py-1 text-center font-semibold text-[#71717a]">当前 {activeSubQuestionIndex + 1}</span>
            </div>
          </div>

          <div className="px-5 py-5">
            {prompt.intro ? (
              <div className="rounded-[18px] border border-[#eef0f3] bg-[#fcfcfd] px-4 py-4 text-[16px] leading-8 text-[#52525b]">
                <div className="whitespace-pre-wrap">{prompt.intro}</div>
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#ececf1] bg-[#fafafa] px-4 py-6 text-center text-sm text-[#8f8f95]">
                本题暂无公共题干。
              </div>
            )}
            {audioUrl ? <LessonAudioInlinePlayer url={audioUrl} durationSeconds={audioDuration} /> : null}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-[28px] border border-[#ececf1] bg-white px-5 py-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] tracking-[0.14em] text-[#8f8f95]">小问切换</div>
                <div className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#18181b]">
                  当前小问（满分：{Number(activeSubQuestion?.maxScore ?? 0)}分）
                </div>
              </div>
              <span className="rounded-full border border-[#ececf1] bg-[#fafafa] px-3 py-1 text-[13px] font-semibold text-[#71717a]">
                第 {activeSubQuestionIndex + 1} / {question.subjectiveSubQuestions.length} 问
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              {question.subjectiveSubQuestions.map((subQuestion, index) => {
                const active = subQuestion.id === activeSubQuestion?.id;
                return (
                  <button
                    key={subQuestion.id}
                    type="button"
                    onClick={() => setActiveSubQuestionId(subQuestion.id)}
                    className={`rounded-[16px] border px-4 py-3 text-[16px] font-semibold transition ${
                      active
                        ? "border-[#e2485a] bg-[#e2485a] text-white shadow-[0_12px_22px_rgba(226,72,90,0.2)]"
                        : "border-[#e5e7eb] bg-white text-[#52525b] hover:border-[#d1d5db] hover:bg-[#fcfcfd]"
                    }`}
                  >
                    第{index + 1}问
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-[18px] border border-[#eef0f3] bg-[#fcfcfd] px-5 py-5">
              <div className="whitespace-pre-wrap text-[20px] leading-[2] text-[#18181b]">{prompt.title}</div>
            </div>
          </div>

          {activeSubQuestion ? (
            <SubjectiveSubQuestionReview
              key={activeSubQuestion.id}
              subQuestion={activeSubQuestion}
              pending={pending}
            />
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#ececf1] bg-[#fafafa] px-5 py-10 text-center text-sm text-[#8f8f95]">
              这道主观题暂时没有配置小问。
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

function SubjectiveSummaryCard({ question, onOpen }: { question: MockExamQuestion; onOpen: () => void }) {
  const answeredCount = question.subjectiveSubQuestions.filter((subQuestion) => subQuestion.answer?.trim()).length;
  const reviewedCount = question.subjectiveSubQuestions.filter((subQuestion) => subQuestion.isReviewed).length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[26px] border border-[#ececf1] bg-[linear-gradient(180deg,#ffffff_0%,#fbfbfd_100%)] px-5 py-5 text-left shadow-[0_14px_32px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(226,72,90,0),rgba(226,72,90,0.5),rgba(226,72,90,0))]" />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-[#18181b] text-[20px] font-black text-white shadow-[0_10px_18px_rgba(24,24,27,0.18)]">
            {question.sortOrder}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[22px] font-semibold tracking-[-0.04em] text-[#18181b]">第{question.sortOrder}题</div>
              <span className="rounded-full border border-[#ececf1] bg-white px-3 py-1 text-[13px] font-medium text-[#71717a]">
                本题满分 {question.score} 分
              </span>
            </div>
            <div className="mt-3 text-[16px] leading-8 text-[#3f3f46]">{getQuestionPreview(question).slice(0, 116)}</div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#eff6ff] px-3 py-1 font-semibold text-[#2563eb]">小问 {question.subjectiveSubQuestions.length}</span>
              <span className="rounded-full bg-[#fff1f2] px-3 py-1 font-semibold text-[#e11d48]">已答 {answeredCount}</span>
              <span className="rounded-full bg-[#f0fdf4] px-3 py-1 font-semibold text-[#166534]">已批 {reviewedCount}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[#f1f1f4] pt-4 text-[14px] text-[#71717a]">
        <span>点击查看本题做题记录</span>
        <span className="font-semibold text-[#e2485a] transition group-hover:translate-x-0.5">查看详情</span>
      </div>
    </button>
  );
}

function SubjectiveReviewSheet({
  record,
  question,
  open,
  onOpenChange,
}: {
  record: MockExamRecordDetail;
  question: MockExamQuestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeSubQuestionId, setActiveSubQuestionId] = useState("");

  useEffect(() => {
    setActiveSubQuestionId(question?.subjectiveSubQuestions[0]?.id ?? "");
  }, [question?.id]);

  const activeSubQuestionIndex = Math.max(
    0,
    question?.subjectiveSubQuestions.findIndex((subQuestion) => subQuestion.id === activeSubQuestionId) ?? 0,
  );
  const currentSubQuestion = question?.subjectiveSubQuestions[activeSubQuestionIndex] ?? question?.subjectiveSubQuestions[0] ?? null;
  const reviewDisabled = record.reviewWorkflowStatus === "not_required";

  if (!question || !currentSubQuestion) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92vh] rounded-t-[28px] border-0 bg-[#fafafa] p-0 [&>button]:right-5 [&>button]:top-5"
      >
        <SheetHeader className="border-b border-[#ececec] bg-white px-5 py-4 text-left">
          <SheetTitle className="text-center text-[22px] font-semibold tracking-[-0.04em] text-[#18181b]">做题记录</SheetTitle>
          <SheetDescription className="text-center text-[15px] text-[#71717a]">点击题号切换不同小问</SheetDescription>
        </SheetHeader>

        <div className="h-full overflow-y-auto px-4 pb-10 pt-5">
          <div className="flex items-center justify-center gap-3 text-[#18181b]">
            <div className="h-[1px] w-[88px] bg-[linear-gradient(90deg,transparent_0%,#d1d5db_100%)]" />
            <span className="text-[19px] font-semibold tracking-[0.02em]">做题记录</span>
            <div className="h-[1px] w-[88px] bg-[linear-gradient(90deg,#d1d5db_0%,transparent_100%)]" />
          </div>

          <div className="mx-auto mt-5 max-w-[1220px] px-0 py-0">
            <div className="grid grid-cols-3 gap-3">
              {question.subjectiveSubQuestions.map((subQuestion, index) => (
                <button
                  key={subQuestion.id}
                  type="button"
                  onClick={() => setActiveSubQuestionId(subQuestion.id)}
                  className={`rounded-[16px] border px-4 py-3 text-[17px] font-medium transition ${
                    subQuestion.id === currentSubQuestion.id
                      ? "border-[#e2485a] bg-[#e2485a] text-white shadow-[0_12px_22px_rgba(226,72,90,0.2)]"
                      : "border-[#e5e7eb] bg-white text-[#52525b] hover:border-[#d1d5db] hover:bg-[#fcfcfd]"
                  }`}
                >
                  第{index + 1}问
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-4">
              <section className="rounded-[24px] border border-[#ececf1] bg-white px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                <PaperSectionTitle title={reviewDisabled ? "题干与问题" : `当前小问（满分：${Number(currentSubQuestion.maxScore ?? 0)}分）`} />
                {!reviewDisabled ? (
                  <div className="mb-4 text-[16px] text-[#71717a]">
                    本题总分 {Number(question.score ?? 0)} 分，当前查看第 {activeSubQuestionIndex + 1} 问
                  </div>
                ) : null}
                {(() => {
                  const prompt = getQuestionPrompt(question, currentSubQuestion, activeSubQuestionIndex);
                  const audioUrl = question.lessonAudioUrl || question.reviewVoiceUrl || "";
                  const audioDuration = Number(question.lessonAudioDurationSeconds ?? 0) > 0 ? question.lessonAudioDurationSeconds : question.reviewVoiceDurationSeconds;
                  return (
                    <>
                      {prompt.intro ? (
                        <div className="rounded-[18px] border border-[#eef0f3] bg-[#fcfcfd] px-5 py-5 text-[18px] leading-9 text-[#52525b]">
                          <div className="whitespace-pre-wrap">{prompt.intro}</div>
                        </div>
                      ) : null}
                      {audioUrl ? <LessonAudioInlinePlayer url={audioUrl} durationSeconds={audioDuration} /> : null}
                      <div className={prompt.intro ? "mt-4" : ""}>
                        <div className="whitespace-pre-wrap text-[20px] leading-[2] text-[#18181b]">{prompt.title}</div>
                      </div>
                    </>
                  );
                })()}
              </section>

              <SubjectiveSubQuestionReview
                key={currentSubQuestion.id}
                subQuestion={currentSubQuestion}
                pending={record.summary.finalScorePending}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


function AnswerCard({
  questions,
  summaryQuestions,
  activeQuestionId,
  onQuestionSelect,
  objectiveFilter,
  objectiveFilterOptions,
  onObjectiveFilterChange,
}: {
  questions: MockExamQuestion[];
  summaryQuestions?: MockExamQuestion[];
  activeQuestionId: string;
  onQuestionSelect: (questionId: string) => void;
  objectiveFilter?: ObjectiveResultFilter;
  objectiveFilterOptions?: ObjectiveFilterOption[];
  onObjectiveFilterChange?: (filter: ObjectiveResultFilter) => void;
}) {
  const totals = summaryQuestions ?? questions;
  const correctCount = totals.filter((question) => question.isCorrect === true).length;
  const wrongCount = totals.filter((question) => question.isCorrect === false).length;
  const answeredCount = totals.filter((question) => question.answerState !== "unanswered").length;
  const unansweredCount = totals.filter((question) => question.answerState === "unanswered").length;
  const totalLabel = questions.length === totals.length ? `${totals.length} 题` : `${questions.length}/${totals.length} 题`;
  return (
    <aside className="sticky top-24 max-h-[calc(100vh-120px)] overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.08)]">
      <div className="border-b border-[#eef0f3] px-5 pb-5 pt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] tracking-[0.14em] text-[#8f8f95]">快速定位</div>
            <div className="mt-2 text-[26px] font-semibold tracking-[-0.04em] text-[#18181b]">答题卡</div>
          </div>
          <div className="rounded-full border border-[#ececf1] bg-[#fafafa] px-3 py-1 text-[13px] font-medium text-[#71717a]">
            {totalLabel}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-center font-semibold text-[#2563eb]">已答 {answeredCount}</span>
          <span className="rounded-full bg-[#dcfce7] px-3 py-1 text-center font-semibold text-[#166534]">正确 {correctCount}</span>
          <span className="rounded-full bg-[#fff1f2] px-3 py-1 text-center font-semibold text-[#e11d48]">复盘 {wrongCount}</span>
          <span className="rounded-full bg-[#fafafa] px-3 py-1 text-center font-semibold text-[#71717a]">未答 {unansweredCount}</span>
        </div>
        {objectiveFilterOptions?.length && objectiveFilter && onObjectiveFilterChange ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {objectiveFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onObjectiveFilterChange(option.value)}
                className={`rounded-[14px] border px-3 py-2 text-left text-xs font-semibold transition ${
                  objectiveFilter === option.value
                    ? "border-[#18181b] bg-[#18181b] text-white shadow-[0_10px_20px_rgba(24,24,27,0.14)]"
                    : "border-[#ececf1] bg-[#fafafa] text-[#52525b] hover:border-[#d1d5db] hover:bg-white"
                }`}
              >
                <span className="block">{option.label}</span>
                <span className={`mt-1 block text-[18px] leading-none ${objectiveFilter === option.value ? "text-white" : "text-[#18181b]"}`}>{option.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="max-h-[calc(100vh-360px)] overflow-y-auto p-4">
        <div className="flex flex-wrap gap-3">
          {questions.map((question) => {
            const answered = question.answerState !== "unanswered";
            const isCorrect = question.isCorrect === true;
            const isWrong = question.isCorrect === false;
            const active = question.id === activeQuestionId;
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => onQuestionSelect(question.id)}
                className={`flex h-[50px] min-w-[50px] items-center justify-center rounded-[16px] border px-3 text-[15px] font-bold transition hover:-translate-y-0.5 ${
                  active
                    ? "border-[#18181b] bg-[#18181b] text-white shadow-[0_12px_24px_rgba(24,24,27,0.16)]"
                    : isCorrect
                      ? "border-[#86efac] bg-[#f0fdf4] text-[#166534]"
                      : isWrong
                        ? "border-[#fda4af] bg-[#fff1f2] text-[#e11d48]"
                        : answered
                          ? "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]"
                          : "border-[#ececf1] bg-[#fafafa] text-[#8f8f95]"
                }`}
                aria-label={`定位到第 ${question.sortOrder} 题`}
              >
                {question.sortOrder}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#71717a]">
          <span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-[#36a269]" />正确</span>
          <span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-[#d24a3f]" />需复盘</span>
          <span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-[#4d91c6]" />已作答</span>
          <span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-[#c8b89f]" />未作答</span>
        </div>
      </div>
    </aside>
  );
}

export function DebaoMyExamRecordPage({
  recordId,
  view,
  onBackToMyExams,
  onBackToPaperList,
  onResumeRecord,
}: {
  recordId: string;
  view: MyExamRecordView;
  onBackToMyExams?: () => void;
  onBackToPaperList?: (paperType: "objective" | "subjective") => void;
  onResumeRecord?: (recordId: string, paperType: "objective" | "subjective") => void;
}) {
  const [record, setRecord] = useState<MockExamRecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [objectiveFilter, setObjectiveFilter] = useState<ObjectiveResultFilter>("all");
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [activeSubjectiveQuestionId, setActiveSubjectiveQuestionId] = useState("");
  const [subjectiveSheetOpen, setSubjectiveSheetOpen] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        const detail = await mockExamService.getRecord(recordId);
        if (disposed) return;
        if (view === "review-pending" && !isPendingReviewRecord(detail)) {
          window.location.replace(`/user/my-exams/records/${encodeURIComponent(detail.id)}/result`);
          return;
        }
        setRecord(detail);
      } catch (error) {
        if (!disposed) setErrorMessage(error instanceof Error ? error.message : "考试记录加载失败");
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, [recordId, view]);

  const questions = record?.questions ?? [];
  const objectiveQuestions = useMemo(() => questions.filter((question) => !isSubjectiveQuestion(question)), [questions]);
  const subjectiveQuestions = useMemo(() => questions.filter(isSubjectiveQuestion), [questions]);
  const activeSubjectiveQuestion =
    subjectiveQuestions.find((question) => question.id === activeSubjectiveQuestionId) ?? subjectiveQuestions[0] ?? null;
  const filteredObjectiveQuestions = useMemo(
    () =>
      objectiveQuestions.filter((question) => {
        if (objectiveFilter === "wrong") return question.isCorrect === false;
        if (objectiveFilter === "correct") return question.isCorrect === true;
        if (objectiveFilter === "unanswered") return question.answerState === "unanswered";
        return true;
      }),
    [objectiveFilter, objectiveQuestions],
  );
  const objectiveFilterOptions = useMemo<ObjectiveFilterOption[]>(
    () => [
      { value: "all", label: "全部", count: objectiveQuestions.length },
      { value: "wrong", label: "错题", count: objectiveQuestions.filter((question) => question.isCorrect === false).length },
      { value: "correct", label: "正确", count: objectiveQuestions.filter((question) => question.isCorrect === true).length },
      { value: "unanswered", label: "未作答", count: objectiveQuestions.filter((question) => question.answerState === "unanswered").length },
    ],
    [objectiveQuestions],
  );
  const pending = record ? isPendingReviewRecord(record) : view === "review-pending";
  const displayQuestions = filteredObjectiveQuestions.length > 0 || objectiveQuestions.length > 0 ? [...subjectiveQuestions, ...filteredObjectiveQuestions] : questions;

  const backToMyExams = () => {
    if (onBackToMyExams) {
      onBackToMyExams();
      return;
    }
    window.location.assign("/user/my-exams");
  };

  const backToPaperList = () => {
    if (!record) return;
    if (onBackToPaperList) {
      onBackToPaperList(record.paper.paperType);
      return;
    }
    window.location.assign(record.paper.paperType === "subjective" ? "/user/mock-exams" : "/user/objective-mock-exams");
  };

  const resumeRecord = () => {
    if (!record) return;
    if (onResumeRecord) {
      onResumeRecord(record.id, record.paper.paperType);
      return;
    }
    window.location.assign(`/user/mock-exams/records/${encodeURIComponent(record.id)}`);
  };

  const handleQuestionSelect = (questionId: string) => {
    setActiveQuestionId(questionId);
    requestAnimationFrame(() => {
      document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleObjectiveFilterChange = (filter: ObjectiveResultFilter) => {
    setObjectiveFilter(filter);
    setActiveQuestionId("");
    requestAnimationFrame(() => {
      document.getElementById("objective-review-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <main className="min-h-[calc(100vh-72px)] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f7f7f8_58%,#f2f2f3_100%)] px-4 py-6 text-[#18181b] md:px-6 md:py-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={backToMyExams}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white/90 px-4 text-sm font-semibold text-[#18181b] shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur transition hover:bg-white"
            >
              <ArrowLeft className="size-4" />
              我的考试
            </button>
            {record ? (
              <button
                type="button"
                onClick={backToPaperList}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white/90 px-4 text-sm font-semibold text-[#18181b] shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur transition hover:bg-white"
              >
                <ListChecks className="size-4" />
                返回试卷列表
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <section className="rounded-[32px] border border-white/80 bg-white px-6 py-20 text-center text-[#71717a] shadow-[0_28px_80px_rgba(15,23,42,0.08)]">正在加载考试记录...</section>
        ) : errorMessage ? (
          <section className="rounded-[32px] border border-[#fecdd3] bg-[#fff1f2] px-6 py-16 text-center shadow-[0_28px_80px_rgba(15,23,42,0.08)]">
            <AlertCircle className="mx-auto size-10 text-[#e11d48]" />
            <div className="mt-4 text-lg font-semibold text-[#18181b]">考试记录加载失败</div>
            <div className="mt-2 text-sm text-[#e11d48]">{errorMessage}</div>
          </section>
        ) : record ? (
          <>
            <section className="overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.08)]">
              <div className="relative overflow-hidden border-b border-[#eef0f3] px-5 pb-7 pt-6 md:px-8 xl:px-10">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.12),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.08),transparent_26%)]" />
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[13px] tracking-[0.16em] text-[#8f8f95]">机考记录</span>
                    <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#2563eb]">
                      {record.paper.paperType === "subjective" ? "主观题批改" : "客观题模考"}
                    </span>
                    <span className="rounded-full border border-[#fed7aa] bg-[#fff7ed] px-3 py-1 text-xs font-semibold text-[#c2410c]">
                      {pending ? "待批改" : "已完成"}
                    </span>
                  </div>
                  <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.05em] text-[#18181b] md:text-[38px]">{record.paper.title}</h1>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#71717a]">
                    <span>交卷时间：{formatDateTime(record.submittedAt)}</span>
                    <span>考试用时：{formatDuration(record.consumedSeconds)}</span>
                    <span>题量：{record.questionCount} 题</span>
                  </div>
                </div>
              </div>
            </section>

            {record.status === "in_progress" ? (
              <section className="mt-6 rounded-[30px] border border-white/80 bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.08)]">
                <div className="text-lg font-semibold text-[#18181b]">这场考试还没有交卷</div>
                <p className="mt-2 text-sm leading-7 text-[#71717a]">继续答题会进入机考作答页。</p>
                <button
                  type="button"
                  onClick={resumeRecord}
                  className="mt-5 rounded-full bg-[#18181b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#27272a]"
                >
                  继续答题
                </button>
              </section>
            ) : (
              <>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard label="总分" value={pending ? "待批改" : `${record.totalScore}/${record.paper.totalScore}`} icon={CheckCircle2} tone="text-emerald-600" />
                  <SummaryCard label="答题情况" value={`${record.answeredCount}/${record.questionCount} 题`} icon={BookOpenCheck} tone="text-sky-600" />
                  <SummaryCard label="考试用时" value={formatDuration(record.consumedSeconds)} icon={Clock3} tone="text-amber-600" />
                  <SummaryCard label="交卷时间" value={formatDateTime(record.submittedAt)} icon={FileText} tone="text-violet-600" />
                </div>

                {pending ? (
                  <section className="mt-6 rounded-[30px] border border-[#fed7aa] bg-[#fff7ed] p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 items-center justify-center rounded-[18px] bg-white text-[#c2410c] shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                        <PenLine className="size-6" />
                      </div>
                      <div id="objective-review-section" className="scroll-mt-24">
                        <div className="text-lg font-semibold text-[#18181b]">已交卷，等待批改</div>
                        <div className="mt-1 text-sm text-[#9a3412]">批改发布后，这里会自动显示得分、批改意见和参考答案。</div>
                      </div>
                    </div>
                  </section>
                ) : null}

                <section className={`mt-6 grid gap-5 ${objectiveQuestions.length > 0 ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
                  <div className="grid gap-5">
                    {subjectiveQuestions.length > 0 ? (
                      <div>
                        <div className="mb-5">
                          <div className="text-[13px] tracking-[0.14em] text-[#8f8f95]">主观题</div>
                          <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#18181b]">做题记录</h2>
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                          {subjectiveQuestions.map((question) => (
                            <SubjectiveSummaryCard
                              key={question.id}
                              question={question}
                              onOpen={() => {
                                setActiveSubjectiveQuestionId(question.id);
                                setSubjectiveSheetOpen(true);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {objectiveQuestions.length > 0 ? (
                      <div>
                        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                          <div>
                            <div className="text-[13px] tracking-[0.14em] text-[#8f8f95]">客观题</div>
                            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#18181b]">答案解析</h2>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {objectiveFilterOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => handleObjectiveFilterChange(option.value)}
                                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                  objectiveFilter === option.value
                                    ? "border-[#18181b] bg-[#18181b] text-white shadow-[0_12px_22px_rgba(24,24,27,0.14)]"
                                    : "border-[#e5e7eb] bg-white text-[#52525b] hover:border-[#d1d5db] hover:bg-[#fcfcfd]"
                                }`}
                              >
                                {option.label} {option.count}
                              </button>
                            ))}
                          </div>
                        </div>
                        {filteredObjectiveQuestions.length > 0 ? (
                          <div className="grid gap-4">
                            {filteredObjectiveQuestions.map((question) => (
                              <ObjectiveQuestionBlock
                                key={question.id}
                                question={question}
                                highlighted={activeQuestionId === question.id}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[24px] border border-dashed border-[#ececf1] bg-white px-6 py-12 text-center text-[#71717a]">
                            当前筛选下没有题目。
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {objectiveQuestions.length > 0 && displayQuestions.length > 0 ? (
                    <AnswerCard
                      questions={displayQuestions}
                      summaryQuestions={objectiveQuestions.length > 0 ? [...subjectiveQuestions, ...objectiveQuestions] : undefined}
                      activeQuestionId={activeQuestionId}
                      onQuestionSelect={handleQuestionSelect}
                      objectiveFilter={objectiveQuestions.length > 0 ? objectiveFilter : undefined}
                      objectiveFilterOptions={objectiveQuestions.length > 0 ? objectiveFilterOptions : undefined}
                      onObjectiveFilterChange={objectiveQuestions.length > 0 ? handleObjectiveFilterChange : undefined}
                    />
                  ) : null}
                </section>
              </>
            )}

            {activeSubjectiveQuestion ? (
              <SubjectiveReviewSheet
                record={record}
                question={activeSubjectiveQuestion}
                open={subjectiveSheetOpen}
                onOpenChange={setSubjectiveSheetOpen}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
