import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Clock, FileText, Lock, Minus, RefreshCw, Save, Search, Send, ShieldCheck, Trash2, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { AnnotatedAnswerText } from "../../components/AnnotatedAnswerText";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  AdminMockExamReviewDetail,
  AdminMockExamReviewPaper,
  AdminMockExamReviewRecord,
  AdminMockExamReviewStats,
  AdminMockExamReviewSubQuestion,
  adminMockExamReviewService,
} from "../../services/adminMockExamReviewService";

type ViewMode = "papers" | "queue" | "detail";
type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

type MockExamReviewManagementProps = {
  initialPaperId?: string;
  initialRecordId?: string;
  initialRecordStatus?: string;
  returnTo?: string;
  embedded?: boolean;
};

const queueStatusKeys = new Set(["all", "ai_pending", "ai_processing", "manual_pending", "mine", "published", "locked", "ai_problem"]);

const normalizeQueueStatus = (status?: string) => {
  const value = `${status ?? ""}`.trim();
  if (value === "teacher") return "manual_pending";
  return queueStatusKeys.has(value) ? value : "all";
};

const normalizeAdminReturnTo = (value?: string) => {
  const trimmed = `${value ?? ""}`.trim();
  if (!trimmed || trimmed.startsWith("//") || !trimmed.startsWith("/adminpg/")) {
    return "";
  }
  return trimmed;
};

type ReviewFormQuestion = {
  questionId: string;
  subQuestions: AdminMockExamReviewSubQuestion[];
};

const emptyStats: AdminMockExamReviewStats = {
  paperCount: 0,
  total: 0,
  aiPending: 0,
  aiProcessing: 0,
  aiProblem: 0,
  manualPending: 0,
  published: 0,
  mine: 0,
  locked: 0,
};

const statusMeta: Record<string, { label: string; className: string }> = {
  all: { label: "全部", className: "border-slate-200 bg-slate-50 text-slate-700" },
  ai_pending: { label: "AI待批改", className: "border-amber-200 bg-amber-50 text-amber-800" },
  ai_processing: { label: "AI正在批改", className: "border-blue-200 bg-blue-50 text-blue-800" },
  manual_pending: { label: "待老师批改", className: "border-violet-200 bg-violet-50 text-violet-800" },
  published: { label: "已批改", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  mine: { label: "我领取的", className: "border-sky-200 bg-sky-50 text-sky-800" },
  locked: { label: "已锁定", className: "border-slate-200 bg-slate-100 text-slate-700" },
  ai_problem: { label: "AI异常", className: "border-rose-200 bg-rose-50 text-rose-800" },
};

const formatDuration = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
};

const toReviewForm = (detail: AdminMockExamReviewDetail): ReviewFormQuestion[] =>
  detail.questions.map((question) => ({
    questionId: question.id,
    subQuestions: question.subQuestions.map((subQuestion) => {
      const answerMarks = subQuestion.answerMarks.length > 0 ? subQuestion.answerMarks : [];
      const nextSubQuestion = {
        ...subQuestion,
        missedPoints: subQuestion.missedPoints.length > 0 ? subQuestion.missedPoints : [],
        answerMarks,
      };

      return {
        ...nextSubQuestion,
        score: getSubQuestionMarkScore(nextSubQuestion),
      };
    }),
  }));

const parseScore = (value: unknown) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const clampScore = (value: unknown, maxScore: number) => Math.min(Math.max(0, parseScore(value)), Math.max(0, Number(maxScore) || 0));

const isPositiveMark = (mark: Pick<ReviewAnswerMark, "status">) => mark.status === "correct" || mark.status === "score";

const sumPositiveMarkScores = (marks: ReviewAnswerMark[]) =>
  (Array.isArray(marks) ? marks : []).reduce((sum, mark) => sum + (isPositiveMark(mark) ? Math.max(0, parseScore(mark.score)) : 0), 0);

const getSubQuestionMarkScore = (subQuestion: AdminMockExamReviewSubQuestion) =>
  clampScore(sumPositiveMarkScores(subQuestion.answerMarks ?? []), subQuestion.maxScore);

const getQuestionTotalScore = (question?: ReviewFormQuestion | null) =>
  (question?.subQuestions ?? []).reduce((sum, item) => sum + getSubQuestionMarkScore(item), 0);

const buildSavePayload = (detail: AdminMockExamReviewDetail, form: ReviewFormQuestion[]) => ({
  lockToken: detail.record.lock.lockToken,
  manualReviewVersion: detail.record.manualReviewVersion,
  answers: form.map((question) => ({
    questionId: question.questionId,
    subQuestions: question.subQuestions.map((subQuestion) => ({
      id: subQuestion.id,
      score: getSubQuestionMarkScore(subQuestion),
      maxScore: Number(subQuestion.maxScore) || 0,
      reviewComment: subQuestion.reviewComment,
      referenceAnswer: subQuestion.referenceAnswer,
      abilityLabel: subQuestion.abilityLabel,
      rubricGuidance: subQuestion.rubricGuidance,
      rubricPoints: subQuestion.rubricPoints,
      missedPoints: subQuestion.missedPoints,
      answerMarks: subQuestion.answerMarks,
      skippedReview: subQuestion.skippedReview,
      skippedReviewReason: subQuestion.skippedReviewReason,
    })),
  })),
});

const serializeReviewForm = (form: ReviewFormQuestion[]) => JSON.stringify(form);

const hasMissingComment = (form: ReviewFormQuestion[]) => form.some((question) => question.subQuestions.some((subQuestion) => !subQuestion.reviewComment.trim()));

const getAutoSaveLabel = (status: AutoSaveStatus, hasUnsavedChanges: boolean) => {
  if (status === "saving") return "自动保存中...";
  if (status === "pending" || hasUnsavedChanges) return "等待自动保存";
  if (status === "error") return "自动保存失败";
  if (status === "saved") return "已自动保存";
  return "未开始保存";
};

type ReviewQuestion = AdminMockExamReviewDetail["questions"][number];
type ReviewAnswerMark = AdminMockExamReviewSubQuestion["answerMarks"][number];
const getQuestionAnchorId = (questionId: string) => `review-question-${questionId}`;

const hasMarkRange = (mark: Pick<ReviewAnswerMark, "start" | "end">) =>
  Number.isInteger(Number(mark.start)) && Number.isInteger(Number(mark.end)) && Number(mark.end) > Number(mark.start);

const marksRangeOverlap = (left: Pick<ReviewAnswerMark, "start" | "end">, right: Pick<ReviewAnswerMark, "start" | "end">) => {
  if (!hasMarkRange(left) || !hasMarkRange(right)) {
    return false;
  }
  return Number(left.start) < Number(right.end) && Number(right.start) < Number(left.end);
};

const buildAnswerMarkDedupeKey = (mark: ReviewAnswerMark) =>
  [
    mark.status,
    hasMarkRange(mark) ? Number(mark.start) : "",
    hasMarkRange(mark) ? Number(mark.end) : "",
    mark.highlight.trim(),
    isPositiveMark(mark) ? parseScore(mark.score) : "",
    mark.comment.trim(),
  ].join("::");

const normalizeAnswerMarks = (marks: ReviewAnswerMark[]) => {
  const seen = new Set<string>();

  return (Array.isArray(marks) ? marks : [])
    .map((mark, index) => {
      const status = mark.status === "wrong" ? "wrong" : mark.status === "neutral" ? "neutral" : mark.status === "score" ? "score" : "correct";
      const normalizedMark: ReviewAnswerMark = {
        id: mark.id || `mark_${Date.now()}_${index}`,
        highlight: `${mark.highlight ?? ""}`.trim(),
        comment: `${mark.comment ?? ""}`.trim(),
        status,
        score: isPositiveMark({ status }) && Number.isFinite(Number(mark.score)) ? Number(mark.score) : undefined,
        start: hasMarkRange(mark) ? Number(mark.start) : undefined,
        end: hasMarkRange(mark) ? Number(mark.end) : undefined,
      };
      return normalizedMark;
    })
    .filter((mark) => {
      if (!mark.highlight) {
        return false;
      }
      const key = buildAnswerMarkDedupeKey(mark);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

const createDraftAnswerMark = (
  highlight = "",
  status: ReviewAnswerMark["status"] = "wrong",
  range?: { start: number; end: number },
): ReviewAnswerMark => ({
  id: `draft_mark_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  highlight,
  comment: "",
  status,
  score: undefined,
  start: range?.start,
  end: range?.end,
});

const isSelectionInsideContainer = (container: HTMLElement | null, node: Node | null) => {
  if (!container || !node) {
    return false;
  }
  if (node instanceof HTMLElement) {
    return container.contains(node);
  }
  return container.contains(node.parentElement);
};

const trimSelectionRange = (selectionText: string, start: number, end: number) => {
  const leadingWhitespace = selectionText.match(/^\s+/u)?.[0].length ?? 0;
  const trailingWhitespace = selectionText.match(/\s+$/u)?.[0].length ?? 0;
  const nextStart = start + leadingWhitespace;
  const nextEnd = Math.max(nextStart, end - trailingWhitespace);
  const highlight = selectionText.trim();

  if (!highlight || nextEnd <= nextStart) {
    return null;
  }

  return { highlight, start: nextStart, end: nextEnd };
};

const getSelectionRangeInContainer = (container: HTMLElement | null) => {
  if (typeof window === "undefined" || !container) {
    return null;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount <= 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!isSelectionInsideContainer(container, range.commonAncestorContainer)) {
    return null;
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(container);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(container);
  endRange.setEnd(range.endContainer, range.endOffset);

  return trimSelectionRange(range.toString(), startRange.toString().length, endRange.toString().length);
};

const resolveAnswerSelectionRange = (answer: string, selectionRange: { highlight: string; start: number; end: number }) => {
  if (answer.slice(selectionRange.start, selectionRange.end) === selectionRange.highlight) {
    return selectionRange;
  }

  const firstIndex = answer.indexOf(selectionRange.highlight);
  if (firstIndex >= 0) {
    return {
      highlight: selectionRange.highlight,
      start: firstIndex,
      end: firstIndex + selectionRange.highlight.length,
    };
  }

  return selectionRange;
};

function WorkbenchMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "amber" | "blue" | "emerald" }) {
  const toneClassName =
    tone === "amber"
      ? "border-amber-100 bg-amber-50 text-amber-900"
      : tone === "blue"
        ? "border-blue-100 bg-blue-50 text-blue-900"
        : tone === "emerald"
          ? "border-emerald-100 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-slate-50 text-slate-900";
  return (
    <div className={`rounded-[14px] border px-3 py-2 ${toneClassName}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold leading-tight">{value}</p>
    </div>
  );
}

function StatsPanel({ stats }: { stats: AdminMockExamReviewStats }) {
  const items = [
    { label: "批改试卷", value: stats.paperCount ?? 0, icon: FileText },
    { label: "总记录", value: stats.total, icon: ShieldCheck },
    { label: "AI待批改", value: stats.aiPending, icon: Clock },
    { label: "AI正在批改", value: stats.aiProcessing, icon: RefreshCw },
    { label: "AI异常", value: stats.aiProblem, icon: RefreshCw },
    { label: "待老师批改", value: stats.manualPending, icon: UserCheck },
    { label: "我领取的", value: stats.mine, icon: Lock },
    { label: "已批改", value: stats.published, icon: CheckCircle2 },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{item.label}</p>
              <Icon className="size-4 text-slate-400" />
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function PaperCard({ paper, onOpen }: { paper: AdminMockExamReviewPaper; onOpen: (paper: AdminMockExamReviewPaper) => void }) {
  return (
    <button type="button" className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/30" onClick={() => onOpen(paper)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-emerald-100 bg-emerald-50 text-emerald-700">主观题</Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{paper.code}</Badge>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">满分 {paper.totalScore} 分</Badge>
            {paper.seriesName ? <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">{paper.seriesName}</Badge> : null}
          </div>
          <h3 className="mt-3 break-words text-base font-semibold text-slate-950">{paper.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
            {paper.subtitle || paper.phase || "主观题批改试卷"} · {paper.subjectiveQuestionCount} 题 · {paper.durationMinutes} 分钟
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-right">
          <p className="text-xs text-slate-500">总记录</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{paper.stats.total}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-6">
        <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-800"><p className="text-xs">AI待批改</p><p className="font-semibold">{paper.stats.aiPending}</p></div>
        <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-800"><p className="text-xs">AI正在批改</p><p className="font-semibold">{paper.stats.aiProcessing}</p></div>
        <div className="rounded-md bg-rose-50 px-3 py-2 text-rose-800"><p className="text-xs">AI异常</p><p className="font-semibold">{paper.stats.aiProblem}</p></div>
        <div className="rounded-md bg-violet-50 px-3 py-2 text-violet-800"><p className="text-xs">待老师</p><p className="font-semibold">{paper.stats.manualPending}</p></div>
        <div className="rounded-md bg-sky-50 px-3 py-2 text-sky-800"><p className="text-xs">我领取</p><p className="font-semibold">{paper.stats.mine}</p></div>
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800"><p className="text-xs">已批改</p><p className="font-semibold">{paper.stats.published}</p></div>
      </div>
    </button>
  );
}

function RecordRow({
  record,
  selected,
  onSelect,
  onOpen,
  onClaim,
  onRecall,
}: {
  record: AdminMockExamReviewRecord;
  selected: boolean;
  onSelect: (recordId: string, selected: boolean) => void;
  onOpen: (record: AdminMockExamReviewRecord) => void;
  onClaim: (record: AdminMockExamReviewRecord) => void;
  onRecall: (record: AdminMockExamReviewRecord) => void;
}) {
  const status = statusMeta[record.reviewWorkflowStatus] ?? statusMeta.all;
  const claimLabel = record.lock.ownedByMe ? "继续批改" : record.reviewWorkflowStatus === "published" ? "重新修改" : "领取";
  const publishedCount = Number(record.publishedSubjectiveCount ?? 0);
  return (
    <tr className="group hover:bg-slate-50">
      <td className="px-5 py-4">
        <input
          type="checkbox"
          className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          checked={selected}
          aria-label={`选择 ${record.userLabel}`}
          onChange={(event) => onSelect(record.id, event.target.checked)}
        />
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold text-slate-950">{record.userLabel}</p>
        <p className="mt-1 text-xs text-slate-500">{record.userPhone || record.userId}</p>
      </td>
      <td className="px-5 py-4">
        <Badge variant="outline" className={status.className}>{status.label}</Badge>
        {record.lock.active ? <p className="mt-2 text-xs text-slate-500">锁定：{record.lock.reviewerName || "老师"} 至 {record.lock.expiresAt}</p> : null}
        {record.lastAiReviewError ? <p className="mt-2 line-clamp-2 text-xs text-rose-600">{record.lastAiReviewError}</p> : null}
      </td>
      <td className="px-5 py-4 text-slate-600">
        <p>{record.reviewedSubjectiveCount}/{record.subjectiveQuestionCount} 题已批</p>
        <p className="mt-1 text-xs text-slate-500">作答 {record.answeredSubjectiveCount}/{record.subjectiveQuestionCount} · 得分 {record.totalScore}</p>
        {publishedCount > 0 && record.reviewWorkflowStatus !== "published" ? <p className="mt-1 text-xs text-emerald-700">学生端仍显示上一版批改</p> : null}
      </td>
      <td className="px-5 py-4 text-slate-600">
        <p>第 {record.attemptNo} 次</p>
        <p className="mt-1 text-xs text-slate-500">{formatDuration(record.consumedSeconds)}</p>
      </td>
      <td className="px-5 py-4 text-xs text-slate-500">
        <p>{record.submittedAt || "-"}</p>
        <p className="mt-1">更新 {record.updatedAt || "-"}</p>
      </td>
      <td className="sticky right-0 bg-white px-5 py-4 shadow-[-8px_0_16px_rgba(15,23,42,0.04)] group-hover:bg-slate-50">
        <div className="flex flex-wrap justify-end gap-2">
          {record.lock.canClaim ? (
            <Button variant="outline" size="sm" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => onClaim(record)}>
              <UserCheck className="size-4" />
              {claimLabel}
            </Button>
          ) : null}
          {record.reviewWorkflowStatus === "published" || record.hasPublishedReview ? (
            <Button variant="outline" size="sm" className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={() => onRecall(record)}>
              收回
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => onOpen(record)}>
            查看批改
          </Button>
        </div>
      </td>
    </tr>
  );
}

function SubQuestionReviewWorkbench({
  question,
  subQuestion,
  disabled,
  onChange,
}: {
  question: ReviewQuestion;
  subQuestion: AdminMockExamReviewSubQuestion;
  disabled: boolean;
  onChange: (patch: Partial<AdminMockExamReviewSubQuestion>) => void;
}) {
  const [selectionHint, setSelectionHint] = useState("");
  const [editingMarkId, setEditingMarkId] = useState("");
  const annotatedAnswerSelectionRef = useRef<HTMLDivElement | null>(null);
  const plainAnswerSelectionRef = useRef<HTMLDivElement | null>(null);
  const marks = normalizeAnswerMarks(subQuestion.answerMarks ?? []);
  const hasAnswer = Boolean(subQuestion.answer?.trim());
  const wrongMarkCount = marks.filter((mark) => mark.status === "wrong").length;
  const positiveMarkCount = marks.filter((mark) => isPositiveMark(mark)).length;
  const neutralMarkCount = marks.filter((mark) => mark.status === "neutral").length;
  const markScore = getSubQuestionMarkScore({ ...subQuestion, answerMarks: marks });
  const commentLength = subQuestion.reviewComment.trim().length;
  const editingMark = marks.find((mark) => mark.id === editingMarkId) ?? null;
  const markTypeMeta: Array<{ value: ReviewAnswerMark["status"]; label: string; className: string; icon: ReactNode }> = [
    { value: "correct", label: "对勾", className: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100", icon: <Check className="size-4" /> },
    { value: "wrong", label: "叉号", className: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100", icon: <X className="size-4" /> },
    { value: "neutral", label: "横杠", className: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100", icon: <Minus className="size-4" /> },
  ];

  const handleMarksChange = (nextMarks: ReviewAnswerMark[]) => {
    const normalizedMarks = normalizeAnswerMarks(nextMarks);
    const markScore = sumPositiveMarkScores(normalizedMarks);
    onChange({
      answerMarks: normalizedMarks,
      score: clampScore(markScore, subQuestion.maxScore),
    });
  };

  const appendMarkFromSelection = (status: ReviewAnswerMark["status"]) => {
    if (disabled) {
      toast.error("请先领取批改记录后再编辑");
      return;
    }

    const selectedRange =
      getSelectionRangeInContainer(plainAnswerSelectionRef.current) ??
      getSelectionRangeInContainer(annotatedAnswerSelectionRef.current);
    if (!selectedRange?.highlight) {
      toast.error("请先在左侧学员作答里选中要标注的文字");
      return;
    }

    if (subQuestion.answer && !subQuestion.answer.includes(selectedRange.highlight)) {
      toast.error("标注内容必须来自学员原答案");
      return;
    }

    const resolvedRange = resolveAnswerSelectionRange(subQuestion.answer ?? "", selectedRange);
    const nextMark = createDraftAnswerMark(resolvedRange.highlight, status, resolvedRange);
    const duplicatedMark = marks.some(
      (mark) =>
        mark.status === status &&
        hasMarkRange(mark) &&
        hasMarkRange(nextMark) &&
        Number(mark.start) === Number(nextMark.start) &&
        Number(mark.end) === Number(nextMark.end),
    );
    if (duplicatedMark) {
      toast.error("这段内容已经标注过了");
      return;
    }

    if (marks.some((mark) => marksRangeOverlap(mark, nextMark))) {
      toast.error("这段内容和现有批注重叠了，请缩小选区后再标");
      return;
    }

    handleMarksChange([...marks, nextMark]);
    setSelectionHint(resolvedRange.highlight);
    window.getSelection()?.removeAllRanges();
  };

  const updateMark = (markId: string, updater: (mark: ReviewAnswerMark) => ReviewAnswerMark) =>
    handleMarksChange(marks.map((mark) => (mark.id === markId ? updater(mark) : mark)));

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-100 pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-blue-50 text-blue-700">{subQuestion.title || `${question.sortOrder} 题小问`}</Badge>
              <Badge className="bg-amber-50 text-amber-800">本问满分 {subQuestion.maxScore} 分</Badge>
              <Badge className="bg-white text-slate-600">{hasAnswer ? "已作答" : "未作答"}</Badge>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:w-[300px]">
            <WorkbenchMetric label="本问得分" value={`${markScore} 分`} tone="amber" />
            <WorkbenchMetric label="作答字数" value={`${subQuestion.wordCount || 0} 字`} tone="blue" />
            <WorkbenchMetric label="批注数量" value={`${marks.length} 条`} tone="emerald" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(390px,0.9fr)]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.035)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">学员作答（当前得分：{markScore}分）</h4>
                <p className="mt-1 text-xs text-slate-500">保留答案展示和划线结果。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white text-slate-600">错点 {wrongMarkCount}</Badge>
                <Badge className="bg-white text-slate-600">得分点 {positiveMarkCount}</Badge>
                <Badge className="bg-white text-slate-600">批注得分 {markScore}</Badge>
                <Badge className="bg-white text-slate-600">横杠 {neutralMarkCount}</Badge>
              </div>
            </div>
            <div className="mt-3 rounded-[18px] border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3">
              <div ref={annotatedAnswerSelectionRef} className="max-h-[360px] overflow-y-auto pr-1">
                <AnnotatedAnswerText
                  answer={subQuestion.answer || ""}
                  marks={marks}
                  paragraphClassName="whitespace-pre-wrap text-[14px] leading-[1.9] text-slate-800"
                  plainTextClassName="select-text"
                />
              </div>
            </div>
            <div ref={plainAnswerSelectionRef} className="mt-3 max-h-[130px] overflow-y-auto rounded-[18px] bg-slate-50 px-3 py-2 text-[13px] leading-7 text-slate-700">
              {subQuestion.answer || "学生未作答"}
            </div>
          </section>

          <section className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.035)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">老师点评</h4>
                <p className="mt-1 text-xs text-slate-500">学生端按这里展示。</p>
              </div>
              <Badge className="bg-slate-100 text-slate-700">当前 {commentLength} 字</Badge>
            </div>
            <Textarea
              className="mt-3 min-h-[150px] text-[13px] leading-6"
              value={subQuestion.reviewComment}
              disabled={disabled}
              onChange={(event) => onChange({ reviewComment: event.target.value })}
              placeholder="填写给学生看的整体点评"
            />
          </section>
        </div>

        <div className="space-y-4 2xl:sticky 2xl:top-4 2xl:self-start">
          <section className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.035)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">录分信息</h4>
                <p className="mt-1 text-xs text-slate-500">录分和能力标签。</p>
              </div>
              <Badge className="bg-slate-100 text-slate-700">工作区</Badge>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>本问得分</Label>
                <Input
                  type="number"
                  min={0}
                  max={subQuestion.maxScore}
                  className="h-10 text-sm"
                  value={markScore}
                  readOnly
                  disabled={disabled}
                />
                <p className="text-xs leading-5 text-slate-500">按左侧正向批注分数自动合计；如需调整，请修改对应得分点批注。</p>
              </div>
              <div className="space-y-1.5">
                <Label>能力标签</Label>
                <Input className="h-10 text-sm" value={subQuestion.abilityLabel} disabled={disabled} onChange={(event) => onChange({ abilityLabel: event.target.value })} />
              </div>
            </div>
          </section>

          <section className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.035)]">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">局部批注</h4>
              <p className="mt-1 text-xs text-slate-500">左侧选中文字后添加对勾、叉号或横杠。</p>
              {selectionHint ? <p className="mt-2 text-xs text-blue-600">最近一次选中：{selectionHint}</p> : null}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {markTypeMeta.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => appendMarkFromSelection(item.value)}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-full border text-xs font-medium transition disabled:pointer-events-none disabled:opacity-50 ${item.className}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-3">
              {marks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs leading-6 text-slate-500">
                  当前还没有局部批注。你可以先选中左侧答案中的一段文字，再点上面的批注按钮。
                </div>
              ) : (
                marks.map((mark, index) => (
                  <div
                    key={mark.id}
                    className={`rounded-[16px] border px-3 py-2.5 ${
                      mark.status === "wrong"
                        ? "border-rose-100 bg-rose-50/70"
                        : mark.status === "neutral"
                          ? "border-amber-100 bg-amber-50/55"
                          : "border-emerald-100 bg-emerald-50/55"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">批注 {index + 1}</p>
                          {isPositiveMark(mark) && Number(mark.score) > 0 ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">+{mark.score}分</span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-700">{mark.highlight || "未填写对应原文"}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{mark.comment || "暂无局部评语"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {markTypeMeta.map((item) => (
                          <button
                            key={`${mark.id}_${item.value}`}
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              updateMark(mark.id, (current) => ({
                                ...current,
                                status: item.value,
                                score: isPositiveMark({ status: item.value }) ? current.score : undefined,
                              }))
                            }
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:pointer-events-none disabled:opacity-50 ${
                              mark.status === item.value ? item.className : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                            }`}
                            aria-label={item.label}
                            title={item.label}
                          >
                            {item.icon}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setEditingMarkId(mark.id)}
                          className="rounded-full px-2 py-1 text-sm font-medium text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:pointer-events-none disabled:opacity-50"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleMarksChange(marks.filter((item) => item.id !== mark.id))}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-50"
                          aria-label="删除"
                          title="删除"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.035)]">
            <h4 className="text-sm font-semibold text-slate-900">参考答案</h4>
            <Textarea
              className="mt-3 min-h-[130px] text-[13px] leading-6"
              value={subQuestion.referenceAnswer}
              disabled={disabled}
              onChange={(event) => onChange({ referenceAnswer: event.target.value })}
            />
          </section>
        </div>
      </div>

      <Dialog open={Boolean(editingMark)} onOpenChange={(open) => (!open ? setEditingMarkId("") : null)}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>编辑局部批注</DialogTitle>
            <DialogDescription>这里再细改对应原文、批注类型、分数和局部评语，不影响主页面总览效率。</DialogDescription>
          </DialogHeader>

          {editingMark ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">对应原文</p>
                <Textarea
                  className="min-h-[96px] rounded-2xl border-slate-200 bg-white text-[15px] leading-7"
                  value={editingMark.highlight}
                  disabled={disabled}
                  onChange={(event) => updateMark(editingMark.id, (mark) => ({ ...mark, highlight: event.target.value }))}
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">批注类型</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {markTypeMeta.map((item) => (
                    <button
                      key={`dialog_${editingMark.id}_${item.value}`}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        updateMark(editingMark.id, (current) => ({
                          ...current,
                          status: item.value,
                          score: isPositiveMark({ status: item.value }) ? current.score : undefined,
                        }))
                      }
                      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 ${
                        editingMark.status === item.value ? item.className : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {isPositiveMark(editingMark) ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-900">得分数值</p>
                  <Input
                    type="number"
                    min={0}
                    className="h-11 rounded-2xl bg-white"
                    value={editingMark.score ?? ""}
                    disabled={disabled}
                    onChange={(event) => updateMark(editingMark.id, (mark) => ({ ...mark, score: Math.max(0, Number(event.target.value) || 0) }))}
                    placeholder="如 1"
                  />
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">局部评语</p>
                <Textarea
                  className="min-h-[150px] rounded-2xl border-slate-200 bg-white text-[15px] leading-7"
                  value={editingMark.comment}
                  disabled={disabled}
                  onChange={(event) => updateMark(editingMark.id, (mark) => ({ ...mark, comment: event.target.value }))}
                  placeholder={
                    editingMark.status === "wrong"
                      ? "这里具体错在哪、漏了什么，以及建议怎么改"
                      : editingMark.status === "neutral"
                        ? "这里没有答到哪个点，建议补哪一层"
                        : "补充这段为什么可以得分，或者这段答得好的地方"
                  }
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingMarkId("")}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewQuestionWorkbench({
  question,
  formQuestion,
  disabled,
  onSubQuestionChange,
}: {
  question: ReviewQuestion;
  formQuestion?: ReviewFormQuestion | null;
  disabled: boolean;
  onSubQuestionChange: (subQuestionId: string, patch: Partial<AdminMockExamReviewSubQuestion>) => void;
}) {
  const totalScore = getQuestionTotalScore(formQuestion);

  return (
    <div id={getQuestionAnchorId(question.id)} className="scroll-mt-6 rounded-[28px] border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-slate-100 text-slate-700">第 {question.sortOrder} 题</Badge>
              <Badge className="bg-blue-50 text-blue-700">{question.sectionLabel || "主观题"}</Badge>
              <Badge className="bg-white text-slate-600">{question.subQuestions.length} 个小问</Badge>
              <Badge className="bg-amber-50 text-amber-800">满分 {question.score} 分</Badge>
            </div>
            {question.material ? (
              <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                {question.material}
              </div>
            ) : null}
            <p className="mt-3 whitespace-pre-wrap text-[16px] font-semibold leading-7 text-slate-900">{question.stem}</p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1.5 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 xl:min-w-[200px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400">本题录入得分</p>
            <p className="text-[24px] font-semibold text-slate-900">
              {totalScore}
              <span className="ml-1 text-base font-medium text-slate-500">/ {question.score}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {question.subQuestions.map((subQuestion) => {
          const formSubQuestion = formQuestion?.subQuestions.find((item) => item.id === subQuestion.id) ?? subQuestion;
          return (
            <SubQuestionReviewWorkbench
              key={subQuestion.id}
              question={question}
              subQuestion={formSubQuestion}
              disabled={disabled}
              onChange={(patch) => onSubQuestionChange(subQuestion.id, patch)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function MockExamReviewManagement({ initialPaperId = "", initialRecordId = "", initialRecordStatus = "", returnTo = "", embedded = false }: MockExamReviewManagementProps = {}) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialPaperId ? "queue" : "papers");
  const [summary, setSummary] = useState<AdminMockExamReviewStats>(emptyStats);
  const [papers, setPapers] = useState<AdminMockExamReviewPaper[]>([]);
  const [papersPage, setPapersPage] = useState({ page: 1, totalPages: 1, total: 0 });
  const [paperKeyword, setPaperKeyword] = useState("");
  const [selectedPaper, setSelectedPaper] = useState<AdminMockExamReviewPaper | null>(null);
  const [records, setRecords] = useState<AdminMockExamReviewRecord[]>([]);
  const [recordsPage, setRecordsPage] = useState({ page: 1, totalPages: 1, total: 0 });
  const [recordStatus, setRecordStatus] = useState(() => normalizeQueueStatus(initialRecordStatus));
  const [recordKeyword, setRecordKeyword] = useState("");
  const [detail, setDetail] = useState<AdminMockExamReviewDetail | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewFormQuestion[]>([]);
  const [savedFormSnapshot, setSavedFormSnapshot] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [batchAiReviewLoading, setBatchAiReviewLoading] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const pendingAutoSaveRef = useRef(false);
  const autoSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const latestReviewFormRef = useRef<ReviewFormQuestion[]>([]);
  const latestDetailRef = useRef<AdminMockExamReviewDetail | null>(null);
  const latestSavedSnapshotRef = useRef("");

  const totalDraftScore = useMemo(() => reviewForm.reduce((sum, question) => sum + getQuestionTotalScore(question), 0), [reviewForm]);
  const detailReturnTo = useMemo(() => normalizeAdminReturnTo(returnTo), [returnTo]);
  const canEdit = Boolean(detail?.record.lock.canEdit);
  const hasUnsavedChanges = canEdit && Boolean(savedFormSnapshot) && serializeReviewForm(reviewForm) !== savedFormSnapshot;
  const selectedRecordIdSet = useMemo(() => new Set(selectedRecordIds), [selectedRecordIds]);
  const allCurrentPageSelected = records.length > 0 && records.every((record) => selectedRecordIdSet.has(record.id));

  useEffect(() => {
    latestReviewFormRef.current = reviewForm;
  }, [reviewForm]);

  useEffect(() => {
    latestDetailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    latestSavedSnapshotRef.current = savedFormSnapshot;
  }, [savedFormSnapshot]);

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (!hasUnsavedChanges || !detail?.record.lock.canEdit) {
      if (!autoSaveInFlightRef.current) {
        setAutoSaveStatus(savedFormSnapshot ? "saved" : "idle");
      }
      return;
    }

    setAutoSaveStatus("pending");
    autoSaveTimerRef.current = window.setTimeout(() => {
      void persistDraft({ silent: true });
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [detail?.record.id, hasUnsavedChanges, reviewForm, savedFormSnapshot]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const loadPapers = async (page = papersPage.page) => {
    setLoading(true);
    try {
      const [summaryPayload, paperPayload] = await Promise.all([
        adminMockExamReviewService.getSummary(),
        adminMockExamReviewService.getPapers({ page, pageSize: 12, keyword: paperKeyword.trim() }),
      ]);
      setSummary(summaryPayload);
      setPapers(paperPayload.items);
      setPapersPage({ page: paperPayload.page, totalPages: paperPayload.totalPages, total: paperPayload.total });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载批改中心失败");
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (paper = selectedPaper, page = recordsPage.page, status = recordStatus) => {
    if (!paper) return;
    const nextStatus = normalizeQueueStatus(status);
    setLoading(true);
    try {
      const payload = await adminMockExamReviewService.getPaperRecords(paper.id, {
        page,
        pageSize: 20,
        status: nextStatus,
        keyword: recordKeyword.trim(),
      });
      setSelectedRecordIds([]);
      setSelectedPaper((current) => (current ? { ...current, stats: payload.paper.stats } : current));
      setRecords(payload.items);
      setRecordsPage({ page: payload.page, totalPages: payload.totalPages, total: payload.total });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载批改队列失败");
    } finally {
      setLoading(false);
    }
  };

  const loadRecordsWithStatus = async (status: string) => {
    if (!selectedPaper) return;
    const nextStatus = normalizeQueueStatus(status);
    setRecordStatus(nextStatus);
    setLoading(true);
    try {
      const payload = await adminMockExamReviewService.getPaperRecords(selectedPaper.id, {
        page: 1,
        pageSize: 20,
        status: nextStatus,
        keyword: recordKeyword.trim(),
      });
      setSelectedRecordIds([]);
      setSelectedPaper((current) => (current ? { ...current, stats: payload.paper.stats } : current));
      setRecords(payload.items);
      setRecordsPage({ page: payload.page, totalPages: payload.totalPages, total: payload.total });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载批改队列失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialPaperId) return;
    void loadPapers(1);
  }, [initialPaperId]);

  useEffect(() => {
    if (!initialPaperId) return;
    const loadInitialPaper = async () => {
      setLoading(true);
      try {
        const paperPayload = await adminMockExamReviewService.getPapers({ page: 1, pageSize: 1, keyword: "" });
        const matchedPaper =
          paperPayload.items.find((item) => item.id === initialPaperId) ??
          (await adminMockExamReviewService.getPaperRecords(initialPaperId, { page: 1, pageSize: 1 })).paper;
        const paper = {
          id: matchedPaper.id,
          code: matchedPaper.code,
          title: matchedPaper.title,
          subtitle: matchedPaper.subtitle,
          seriesId: "seriesId" in matchedPaper ? matchedPaper.seriesId : "",
          seriesName: matchedPaper.seriesName,
          status: "status" in matchedPaper ? matchedPaper.status : "",
          year: matchedPaper.year,
          phase: matchedPaper.phase,
          durationMinutes: "durationMinutes" in matchedPaper ? matchedPaper.durationMinutes : 0,
          totalScore: matchedPaper.totalScore,
          questionCount: matchedPaper.questionCount,
          subjectiveQuestionCount: matchedPaper.subjectiveQuestionCount,
          reviewEnabled: "reviewEnabled" in matchedPaper ? matchedPaper.reviewEnabled : true,
          updatedAt: "updatedAt" in matchedPaper ? matchedPaper.updatedAt : "",
          stats: matchedPaper.stats,
        };
        setSelectedPaper(paper);
        setViewMode("queue");
        const nextStatus = normalizeQueueStatus(initialRecordStatus);
        setRecordStatus(nextStatus);
        await loadRecords(paper, 1, nextStatus);
        if (initialRecordId) {
          const recordPayload = await adminMockExamReviewService.getRecord(initialRecordId);
          setDetail(recordPayload);
          const nextForm = toReviewForm(recordPayload);
          setReviewForm(nextForm);
          setSavedFormSnapshot(serializeReviewForm(nextForm));
          setViewMode("detail");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载批改试卷失败");
      } finally {
        setLoading(false);
      }
    };

    void loadInitialPaper();
  }, [initialPaperId, initialRecordId, initialRecordStatus]);

  const openPaper = async (paper: AdminMockExamReviewPaper) => {
    setSelectedPaper(paper);
    setViewMode("queue");
    setRecordsPage({ page: 1, totalPages: 1, total: 0 });
    setRecords([]);
    setRecordStatus("all");
    setSelectedRecordIds([]);
    await loadRecords(paper, 1, "all");
  };

  const openDetail = async (record: AdminMockExamReviewRecord) => {
    setActionLoading(true);
    try {
      const payload = await adminMockExamReviewService.getRecord(record.id);
      setDetail(payload);
      const nextForm = toReviewForm(payload);
      setReviewForm(nextForm);
      setSavedFormSnapshot(serializeReviewForm(nextForm));
      setViewMode("detail");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载批改详情失败");
    } finally {
      setActionLoading(false);
    }
  };

  const toggleRecordSelected = (recordId: string, selected: boolean) => {
    setSelectedRecordIds((current) => {
      if (selected) return current.includes(recordId) ? current : [...current, recordId];
      return current.filter((id) => id !== recordId);
    });
  };

  const toggleCurrentPageSelected = (selected: boolean) => {
    setSelectedRecordIds(selected ? records.map((record) => record.id) : []);
  };

  const claimRecord = async (record: AdminMockExamReviewRecord) => {
    setActionLoading(true);
    try {
      const wasPublished = record.reviewWorkflowStatus === "published";
      const payload = await adminMockExamReviewService.claimRecord(record.id);
      setDetail(payload);
      const nextForm = toReviewForm(payload);
      setReviewForm(nextForm);
      setSavedFormSnapshot(serializeReviewForm(nextForm));
      setViewMode("detail");
      toast.success(wasPublished ? "已进入二次修改" : "已领取批改记录");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "领取失败");
    } finally {
      setActionLoading(false);
    }
  };

  const releaseRecord = async () => {
    if (!detail) return;
    if (hasUnsavedChanges) {
      const saved = await persistDraft({ silent: true, blockUi: true, flush: true });
      if (!saved) {
        toast.error("当前批改内容自动保存失败，暂不释放锁，避免丢失修改");
        return;
      }
    }
    if (!window.confirm("确认释放这条批改记录吗？释放后其他老师可以领取。")) return;
    setActionLoading(true);
    try {
      const payload = await adminMockExamReviewService.releaseRecord(detail.record.id);
      setDetail(payload);
      const nextForm = toReviewForm(payload);
      setReviewForm(nextForm);
      setSavedFormSnapshot(serializeReviewForm(nextForm));
      toast.success("已释放批改记录");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "释放失败");
    } finally {
      setActionLoading(false);
    }
  };

  const recallPublishedReview = async (record: AdminMockExamReviewRecord) => {
    if (!window.confirm(`确认收回这份已经发送给学生的批改结果吗？\n考生：${record.userLabel}\n收回后学生端将显示为待批改，后台保留当前批改草稿，可修改后重新发送。`)) return;

    setActionLoading(true);
    try {
      const payload = await adminMockExamReviewService.recallPublishedReview(record.id);
      if (detail?.record.id === record.id) {
        setDetail(payload);
        const nextForm = toReviewForm(payload);
        setReviewForm(nextForm);
        setSavedFormSnapshot(serializeReviewForm(nextForm));
      }
      toast.success("批改结果已收回，学生端不可见");
      await loadRecords(selectedPaper, recordsPage.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "收回批改结果失败");
    } finally {
      setActionLoading(false);
    }
  };

  const updateReviewSubQuestion = (questionId: string, subQuestionId: string, patch: Partial<AdminMockExamReviewSubQuestion>) => {
    if (!canEdit) return;
    setReviewForm((current) =>
      current.map((question) =>
        question.questionId !== questionId
          ? question
          : {
              ...question,
              subQuestions: question.subQuestions.map((subQuestion) =>
                subQuestion.id === subQuestionId ? { ...subQuestion, ...patch } : subQuestion,
              ),
            },
      ),
    );
  };

  const persistDraft = async ({
    silent = false,
    blockUi = false,
    flush = false,
  }: { silent?: boolean; blockUi?: boolean; flush?: boolean } = {}): Promise<boolean> => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (autoSaveInFlightRef.current) {
      pendingAutoSaveRef.current = true;
      if (flush) {
        return (autoSavePromiseRef.current ?? Promise.resolve(false)).then(() => persistDraft({ silent, blockUi, flush: true }));
      }
      return autoSavePromiseRef.current ?? Promise.resolve(false);
    }

    const draftDetail = latestDetailRef.current;
    const draftForm = latestReviewFormRef.current;
    const draftSnapshot = serializeReviewForm(draftForm);
    if (!draftDetail || !draftDetail.record.lock.canEdit || !latestSavedSnapshotRef.current || draftSnapshot === latestSavedSnapshotRef.current) {
      if (!silent) {
        toast.info("当前没有新的修改，不需要保存草稿");
      }
      setAutoSaveStatus("saved");
      return true;
    }

    const runSave = (async () => {
      autoSaveInFlightRef.current = true;
      pendingAutoSaveRef.current = false;
      setAutoSaveStatus("saving");
      if (blockUi) {
        setActionLoading(true);
      }

      try {
        const payload = await adminMockExamReviewService.saveDraft(draftDetail.record.id, buildSavePayload(draftDetail, draftForm));
        const latestSnapshot = serializeReviewForm(latestReviewFormRef.current);
        const nextForm = toReviewForm(payload);
        const nextSnapshot = serializeReviewForm(nextForm);

        const stillEditingSameRecord = latestDetailRef.current?.record.id === payload.record.id;
        setDetail((current) => (current?.record.id === payload.record.id ? payload : current));
        if (!stillEditingSameRecord) {
          return true;
        }

        latestDetailRef.current = payload;
        if (latestSnapshot === draftSnapshot) {
          setReviewForm(nextForm);
          setSavedFormSnapshot(nextSnapshot);
          latestReviewFormRef.current = nextForm;
          latestSavedSnapshotRef.current = nextSnapshot;
          setAutoSaveStatus("saved");
        } else {
          setSavedFormSnapshot(draftSnapshot);
          latestSavedSnapshotRef.current = draftSnapshot;
          setAutoSaveStatus("saving");
          pendingAutoSaveRef.current = true;
        }

        if (!silent) {
          toast.success("批改草稿已保存");
        }
        return true;
      } catch (error) {
        setAutoSaveStatus("error");
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "保存失败");
        }
        return false;
      } finally {
        autoSaveInFlightRef.current = false;
        autoSavePromiseRef.current = null;
        if (blockUi) {
          setActionLoading(false);
        }

        if (pendingAutoSaveRef.current) {
          pendingAutoSaveRef.current = false;
          if (autoSaveTimerRef.current) {
            window.clearTimeout(autoSaveTimerRef.current);
          }
          autoSaveTimerRef.current = window.setTimeout(() => {
            void persistDraft({ silent: true });
          }, 300);
        }
      }
    })();

    autoSavePromiseRef.current = runSave;
    return runSave;
  };

  const saveDraft = async () => {
    await persistDraft({ silent: false, blockUi: true, flush: true });
  };

  const rerunAiReview = async () => {
    if (!detail) return;
    if (hasUnsavedChanges && !window.confirm("当前批改内容还没有保存，AI重批会覆盖当前本地修改，确认继续吗？")) return;
    if (detail.record.hasPublishedReview && !detail.record.lock.ownedByMe) {
      toast.error("已发送的试卷请先点击“重新修改”领取后，再进行 AI 重批");
      return;
    }
    const publishedNotice = detail.record.hasPublishedReview ? "\n学生端会继续显示上一版批改，重新发送后才会替换为新版。" : "";
    if (!window.confirm(`确认让 AI 重新批改这份试卷吗？\n考生：${detail.record.userLabel}\n试卷：${detail.paper.title}${publishedNotice}`)) return;

    setAiReviewLoading(true);
    try {
      const payload = await adminMockExamReviewService.runAiReview(detail.record.id);
      setDetail(payload);
      const nextForm = toReviewForm(payload);
      setReviewForm(nextForm);
      setSavedFormSnapshot(serializeReviewForm(nextForm));
      toast.success("已加入自动批改队列");
      await loadRecords(selectedPaper, recordsPage.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI重批失败");
    } finally {
      setAiReviewLoading(false);
    }
  };

  const batchRerunAiReview = async () => {
    if (selectedRecordIds.length === 0) {
      toast.error("请先选择需要重批的试卷");
      return;
    }
    if (!window.confirm(`确认将已选择的 ${selectedRecordIds.length} 份试卷批量加入 AI 批改队列吗？\n已发送给学生的试卷会保留上一版结果，重新发送后才替换。`)) return;

    setBatchAiReviewLoading(true);
    try {
      const payload = await adminMockExamReviewService.batchRunAiReview(selectedRecordIds);
      if (payload.failedCount > 0) {
        const failedMessage = payload.results.find((item) => !item.success)?.message ?? "部分试卷加入失败";
        toast.warning(`已加入 ${payload.successCount} 份，失败 ${payload.failedCount} 份：${failedMessage}`);
      } else {
        toast.success(`已将 ${payload.successCount} 份试卷加入 AI 批改队列`);
      }
      setSelectedRecordIds([]);
      await loadRecords(selectedPaper, recordsPage.page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量AI重批失败");
    } finally {
      setBatchAiReviewLoading(false);
    }
  };

  const publishReview = async () => {
    if (!detail) return;
    const isRepublish = Boolean(detail.record.hasPublishedReview || detail.record.publishedAt);
    if (hasMissingComment(reviewForm)) {
      toast.error("还有小问没有填写老师点评，不能发送给学生");
      return;
    }
    if (!window.confirm(`确认把这份批改${isRepublish ? "重新发送" : "发送"}给学生？\n考生：${detail.record.userLabel}\n试卷：${detail.paper.title}\n当前总分：${totalDraftScore}/${detail.paper.totalScore}`)) return;

    setActionLoading(true);
    try {
      const payload = await adminMockExamReviewService.publish(detail.record.id, buildSavePayload(detail, reviewForm));
      setDetail(payload);
      const nextForm = toReviewForm(payload);
      setReviewForm(nextForm);
      setSavedFormSnapshot(serializeReviewForm(nextForm));
      toast.success(isRepublish ? "批改结果已重新发送给学生" : "批改结果已发送给学生");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送失败");
    } finally {
      setActionLoading(false);
    }
  };

  const goBackToQueue = async () => {
    if (actionLoading) return;
    if (hasUnsavedChanges) {
      const saved = await persistDraft({ silent: true, blockUi: true, flush: true });
      if (!saved) {
        toast.error("当前批改内容自动保存失败，暂不返回队列，避免丢失修改");
        return;
      }
    }
    if (detailReturnTo) {
      window.location.assign(detailReturnTo);
      return;
    }
    setViewMode("queue");
    setDetail(null);
    setReviewForm([]);
    setSavedFormSnapshot("");
    await loadRecords(selectedPaper, recordsPage.page);
  };

  const goBackFromQueue = () => {
    if (initialPaperId && embedded) {
      window.location.assign("/adminpg/papers");
      return;
    }
    setViewMode("papers");
  };

  if (viewMode === "detail" && detail) {
    const status = statusMeta[detail.record.reviewWorkflowStatus] ?? statusMeta.all;
    const isRepublishDetail = Boolean(detail.record.hasPublishedReview || detail.record.publishedAt);
    const isRevisingPublishedReview = isRepublishDetail && detail.record.lock.ownedByMe;
    const detailClaimLabel = isRepublishDetail ? "重新修改" : "领取批改";
    const sendReviewLabel = isRepublishDetail ? "重新发送给学生" : "发送给学生";
    const autoSaveLabel = getAutoSaveLabel(autoSaveStatus, hasUnsavedChanges);
    return (
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" disabled={actionLoading} onClick={() => void goBackToQueue()}>
            <ArrowLeft className="size-4" />
            返回队列
          </Button>
          <div className="flex flex-wrap gap-2">
            {!canEdit && detail.record.lock.canClaim ? (
              <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={actionLoading || aiReviewLoading} onClick={() => void claimRecord(detail.record)}>
                <UserCheck className="size-4" />
                {detailClaimLabel}
              </Button>
            ) : null}
            {isRepublishDetail ? (
              <Button
                variant="outline"
                className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                disabled={actionLoading || aiReviewLoading}
                onClick={() => void recallPublishedReview(detail.record)}
              >
                收回批改
              </Button>
            ) : null}
            <Button variant="outline" disabled={actionLoading || aiReviewLoading || !detail.record.lock.canClaim || (isRepublishDetail && !detail.record.lock.ownedByMe)} onClick={() => void rerunAiReview()}>
              <RefreshCw className={`size-4 ${aiReviewLoading ? "animate-spin" : ""}`} />
              {aiReviewLoading ? "AI重批中..." : "AI重批"}
            </Button>
            {canEdit ? (
              <>
                <Button variant="outline" disabled={actionLoading || aiReviewLoading} onClick={() => void releaseRecord()}>
                  释放
                </Button>
                <Button variant="outline" disabled={actionLoading || aiReviewLoading} onClick={() => void saveDraft()}>
                  <Save className="size-4" />
                  {isRepublishDetail ? "保存二次修改草稿" : "保存草稿"}
                </Button>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={actionLoading || aiReviewLoading} onClick={() => void publishReview()}>
                  <Send className="size-4" />
                  {sendReviewLabel}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={status.className}>{status.label}</Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{detail.paper.code}</Badge>
                {detail.record.lock.active ? <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">锁定至 {detail.record.lock.expiresAt}</Badge> : null}
                {isRevisingPublishedReview ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">二次修改中，学生端仍显示上一版</Badge> : null}
                {hasUnsavedChanges ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">有未保存修改</Badge> : null}
                {canEdit ? (
                  <Badge
                    variant="outline"
                    className={
                      autoSaveStatus === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : autoSaveStatus === "saving" || autoSaveStatus === "pending" || hasUnsavedChanges
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }
                  >
                    {autoSaveLabel}
                  </Badge>
                ) : null}
              </div>
              <h2 className="mt-3 break-words text-2xl font-semibold text-slate-950">{detail.paper.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {detail.record.userLabel} · {detail.record.userPhone || detail.record.userId} · 提交 {detail.record.submittedAt || "-"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm xl:grid-cols-4">
              <WorkbenchMetric label="草稿分" value={`${totalDraftScore}`} tone="amber" />
              <WorkbenchMetric label="满分" value={`${detail.paper.totalScore}`} tone="slate" />
              <WorkbenchMetric label="用时" value={formatDuration(detail.record.consumedSeconds)} tone="blue" />
              <WorkbenchMetric label="版本" value={`${detail.record.manualReviewVersion}`} tone="emerald" />
            </div>
          </div>
        </section>

        <div className="sticky top-0 z-10 rounded-[24px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">题号导航</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.questions.map((question) => {
                const formQuestion = reviewForm.find((item) => item.questionId === question.id);
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => {
                      const target = document.getElementById(getQuestionAnchorId(question.id));
                      target?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    <span>第 {question.sortOrder} 题</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{getQuestionTotalScore(formQuestion)}/{question.score}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {detail.questions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white py-20 text-center text-slate-500">暂无可批改题目</div>
          ) : (
            detail.questions.map((question) => (
              <ReviewQuestionWorkbench
                key={question.id}
                question={question}
                formQuestion={reviewForm.find((item) => item.questionId === question.id)}
                disabled={!canEdit}
                onSubQuestionChange={(subQuestionId, patch) => updateReviewSubQuestion(question.id, subQuestionId, patch)}
              />
            ))
          )}
        </div>

        {canEdit ? (
          <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/95 px-5 py-4 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-slate-950">当前草稿 {totalDraftScore}/{detail.paper.totalScore} 分</span>
              <span className={autoSaveStatus === "error" ? "ml-3 text-rose-700" : hasUnsavedChanges ? "ml-3 text-amber-700" : "ml-3 text-emerald-700"}>
                {autoSaveLabel}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={actionLoading || aiReviewLoading || !detail.record.lock.canClaim || (isRepublishDetail && !detail.record.lock.ownedByMe)} onClick={() => void rerunAiReview()}>
                <RefreshCw className={`size-4 ${aiReviewLoading ? "animate-spin" : ""}`} />
                {aiReviewLoading ? "AI重批中..." : "重新批改"}
              </Button>
              <Button variant="outline" disabled={actionLoading || aiReviewLoading} onClick={() => void saveDraft()}>
                <Save className="size-4" />
                {isRepublishDetail ? "保存二次修改草稿" : "保存草稿"}
              </Button>
              <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={actionLoading || aiReviewLoading} onClick={() => void publishReview()}>
                <Send className="size-4" />
                {sendReviewLabel}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (viewMode === "queue" && selectedPaper) {
    const queueTabs = [
      ["mine", "我领取", selectedPaper.stats.mine],
      ["manual_pending", "待老师批改", selectedPaper.stats.manualPending],
      ["ai_problem", "AI异常", selectedPaper.stats.aiProblem],
      ["ai_processing", "AI正在批改", selectedPaper.stats.aiProcessing],
      ["ai_pending", "AI待批改", selectedPaper.stats.aiPending],
      ["locked", "已锁定", selectedPaper.stats.locked],
      ["published", "已批改", selectedPaper.stats.published],
      ["all", "全部", selectedPaper.stats.total],
    ] as const;
    return (
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={goBackFromQueue}>
            <ArrowLeft className="size-4" />
            返回试卷
          </Button>
          <Button variant="outline" onClick={() => void loadRecords(selectedPaper, recordsPage.page)} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            刷新队列
          </Button>
        </div>

        <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(560px,720px)] xl:items-end">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">单卷批改队列</p>
              <h2 className="mt-2 break-words text-[26px] font-semibold leading-tight text-slate-950">{selectedPaper.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">{selectedPaper.code} · {selectedPaper.seriesName || "未分套卷"} · 共 {selectedPaper.stats.total} 条记录</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {queueTabs.map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  disabled={loading}
                  className={[
                    "rounded-[14px] border px-3 py-2 text-left transition disabled:pointer-events-none disabled:opacity-60",
                    recordStatus === key ? "border-blue-600 bg-blue-600 text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)]" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50",
                  ].join(" ")}
                  onClick={() => {
                    void loadRecordsWithStatus(`${key}`);
                  }}
                >
                  <p className="text-xs font-semibold">{label}</p>
                  <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.04em]">{count}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input className="h-11 rounded-full bg-white pl-9" value={recordKeyword} onChange={(event) => setRecordKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadRecords(selectedPaper, 1); }} placeholder="搜索手机号、昵称或用户ID" />
            </div>
            <Button className="h-11 rounded-full px-5" variant="outline" onClick={() => void loadRecords(selectedPaper, 1)}>搜索</Button>
            <Button
              className="h-11 rounded-full bg-amber-600 px-5 text-white hover:bg-amber-700"
              disabled={selectedRecordIds.length === 0 || batchAiReviewLoading}
              onClick={() => void batchRerunAiReview()}
            >
              <RefreshCw className={`size-4 ${batchAiReviewLoading ? "animate-spin" : ""}`} />
              批量AI重批{selectedRecordIds.length > 0 ? `（${selectedRecordIds.length}）` : ""}
            </Button>
          </div>
        </section>

        <section className="rounded-[26px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-4">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={allCurrentPageSelected}
                      aria-label="选择当前页全部记录"
                      onChange={(event) => toggleCurrentPageSelected(event.target.checked)}
                    />
                  </th>
                  <th className="px-5 py-4">考生</th>
                  <th className="px-5 py-4">状态</th>
                  <th className="px-5 py-4">批改进度</th>
                  <th className="px-5 py-4">次数/用时</th>
                  <th className="px-5 py-4">提交时间</th>
                  <th className="sticky right-0 bg-slate-50 px-5 py-4 text-right shadow-[-8px_0_16px_rgba(15,23,42,0.04)]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-slate-500">{loading ? "批改队列加载中..." : "暂无匹配记录"}</td></tr>
                ) : (
                  records.map((record) => (
                    <RecordRow
                      key={record.id}
                      record={record}
                      selected={selectedRecordIdSet.has(record.id)}
                      onSelect={toggleRecordSelected}
                      onOpen={openDetail}
                      onClaim={claimRecord}
                      onRecall={recallPublishedReview}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
            <span>第 {recordsPage.page} / {recordsPage.totalPages} 页，共 {recordsPage.total} 条</span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={recordsPage.page <= 1 || loading} onClick={() => void loadRecords(selectedPaper, recordsPage.page - 1)}>上一页</Button>
              <Button variant="outline" disabled={recordsPage.page >= recordsPage.totalPages || loading} onClick={() => void loadRecords(selectedPaper, recordsPage.page + 1)}>下一页</Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StatsPanel stats={summary} />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">批改试卷</h2>
            <p className="mt-1 text-sm text-slate-500">只显示已开启批改的主观题试卷，点击进入单卷批改队列。</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" value={paperKeyword} onChange={(event) => setPaperKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadPapers(1); }} placeholder="搜索试卷、编号、阶段" />
            </div>
            <Button variant="outline" onClick={() => void loadPapers(1)}>搜索</Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {papers.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">
            {loading ? "批改试卷加载中..." : "暂无已开启批改的主观题试卷"}
          </div>
        ) : (
          papers.map((paper) => <PaperCard key={paper.id} paper={paper} onOpen={openPaper} />)
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
        <span>第 {papersPage.page} / {papersPage.totalPages} 页，共 {papersPage.total} 张试卷</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={papersPage.page <= 1 || loading} onClick={() => void loadPapers(papersPage.page - 1)}>上一页</Button>
          <Button variant="outline" disabled={papersPage.page >= papersPage.totalPages || loading} onClick={() => void loadPapers(papersPage.page + 1)}>下一页</Button>
        </div>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
        <div className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>保存草稿不会让学生看到批改内容；只有点击“发送给学生”并确认后，学生端批改记录才会显示成绩、评语和批注。</span>
        </div>
      </div>
    </div>
  );
}
