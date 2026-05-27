import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  History,
  House,
  Keyboard,
  Medal,
  Play,
  Timer,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { cn } from "../../components/ui/utils";
import {
  type TypingPracticeHomePayload,
  type TypingPracticeLeaderboardEntry,
  type TypingPracticeMode,
  type TypingPracticeRecordListPayload,
  type TypingPracticeText,
  mockApi,
} from "../../lib/mockData";
import {
  buildTypingAccuracyText,
  buildTypingPracticeIdleHint,
  buildTypingPracticeSearch,
  pickNextTypingPracticeText,
  typingPracticeModeMeta,
} from "./typingPracticeShared";
import { useMockExamDesktopGuard } from "./mockExamDesktopGuard";
import { TypingPracticeDeviceNotice } from "./TypingPracticeDeviceNotice";

const EMPTY_HOME: TypingPracticeHomePayload = {
  homeConfig: {
    hero: {
      title: "",
      englishTitle: "",
      description: "",
      topNotice: "",
      policeImageUrl: "",
      policeImageObjectKey: "",
      thiefImageUrl: "",
      thiefImageObjectKey: "",
    },
    modeHints: {
      guided: "",
      sprint: "",
      memorize: "",
    },
    rules: {
      paragraphs: [],
      cards: [],
    },
  },
  summary: {
    totalFolders: 0,
    totalTexts: 0,
    practiceCount: 0,
    avgAccuracyRate: 0,
    avgCpm: 0,
    bestCpm: 0,
    bestScore: 0,
    totalTypedLength: 0,
  },
  folders: [],
  texts: [],
  recentRecords: [],
};

const HISTORY_PAGE_SIZE = 5;
const VISIBLE_TYPING_PRACTICE_MODES: TypingPracticeMode[] = ["guided", "sprint"];
const VISIBLE_TYPING_DIFFICULTIES = [
  { value: "easy", label: "入门" },
  { value: "medium", label: "标准" },
  { value: "hard", label: "挑战" },
] as const;

const getTypingSpeedRank = (cpm: number) => {
  const speed = Math.max(0, Math.round(Number(cpm) || 0));
  if (speed >= 90) return { label: "王者", className: "text-rose-600" };
  if (speed >= 60) return { label: "黄金", className: "text-amber-600" };
  if (speed >= 45) return { label: "白银", className: "text-slate-600" };
  return { label: "青铜", className: "text-orange-700" };
};

const EMPTY_RECORD_LIST: TypingPracticeRecordListPayload = {
  items: [],
  total: 0,
  page: 1,
  pageSize: HISTORY_PAGE_SIZE,
  totalPages: 1,
};

const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN").format(Math.max(0, Number(value) || 0));

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: typeof Trophy;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-500">{label}</span>
        <Icon className="size-4" style={{ color: accent }} />
      </div>
      <div className="mt-3 text-2xl font-bold leading-none text-slate-950">{value}</div>
    </div>
  );
}

function ModeButton({
  mode,
  active,
  onClick,
}: {
  mode: TypingPracticeMode;
  active: boolean;
  onClick: () => void;
}) {
  const meta = typingPracticeModeMeta[mode];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-bold transition",
        active ? "border-[#c9973e] bg-[#c9973e] text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950",
      )}
    >
      {meta.label}
    </button>
  );
}

function DifficultyButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-lg border px-4 text-sm font-bold transition",
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950",
      )}
    >
      {label}
    </button>
  );
}

function TextListItem({
  text,
  active,
  onClick,
}: {
  text: TypingPracticeText;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-lg border px-4 py-3 text-left transition",
        active ? "border-[#c9973e] bg-[#fffaf0] shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-950">{text.title}</div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {text.folderName} · {formatNumber(text.contentLength)} 字符
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-1 text-xs font-bold",
            text.difficulty === "hard"
              ? "bg-rose-50 text-rose-600"
              : text.difficulty === "easy"
                ? "bg-emerald-50 text-emerald-600"
                : "bg-blue-50 text-blue-600",
          )}
        >
          {text.difficultyLabel}
        </span>
      </div>
      {text.preview ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{text.preview}</div> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {text.source ? <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-500">{text.source}</span> : null}
        {text.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-slate-500">
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

function TrainingTrack({
  policeImageUrl,
  thiefImageUrl,
  policePosition,
  thiefPosition,
}: {
  policeImageUrl: string;
  thiefImageUrl: string;
  policePosition: number;
  thiefPosition: number;
}) {
  return (
    <div className="relative h-[190px] overflow-hidden rounded-lg border border-slate-200 bg-[linear-gradient(180deg,#dff4ff_0%,#f6fbff_52%,#e5f6dc_52%,#c9edb7_100%)]">
      <div className="absolute inset-x-8 top-[54%] h-3 -translate-y-1/2 rounded-full border border-sky-200 bg-white" />
      <div className="absolute inset-x-10 top-[54%] h-1 -translate-y-1/2 rounded-full bg-[repeating-linear-gradient(90deg,#b8d5e4_0_14px,transparent_14px_26px)]" />
      {policeImageUrl ? (
        <img
          src={policeImageUrl}
          alt=""
          className="absolute bottom-5 w-[104px] max-w-none -translate-x-1/2 drop-shadow-sm"
          style={{ left: `${policePosition}%` }}
        />
      ) : null}
      {thiefImageUrl ? (
        <img
          src={thiefImageUrl}
          alt=""
          className="absolute bottom-5 w-[104px] max-w-none -translate-x-1/2 drop-shadow-sm"
          style={{ left: `${thiefPosition}%` }}
        />
      ) : null}
    </div>
  );
}

export function TypingPracticeHome() {
  const navigate = useNavigate();
  const isMobileBlocked = useMockExamDesktopGuard();
  const [payload, setPayload] = useState<TypingPracticeHomePayload>(EMPTY_HOME);
  const [historyPayload, setHistoryPayload] = useState<TypingPracticeRecordListPayload>(EMPTY_RECORD_LIST);
  const [leaderboard, setLeaderboard] = useState<TypingPracticeLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<TypingPracticeMode>("guided");
  const [selectedDifficulty, setSelectedDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [selectedTextId, setSelectedTextId] = useState("");
  const [sprintSeconds, setSprintSeconds] = useState<180 | 300>(180);

  const loadHistory = async (page = 1) => {
    try {
      setHistoryLoading(true);
      const next = await mockApi.getTypingPracticeRecords({ page, pageSize: HISTORY_PAGE_SIZE });
      setHistoryPayload(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载练习记录失败");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (isMobileBlocked) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const [homeResult, historyResult, leaderboardResult] = await Promise.allSettled([
          mockApi.getTypingPracticeHome(),
          mockApi.getTypingPracticeRecords({ page: 1, pageSize: HISTORY_PAGE_SIZE }),
          mockApi.getTypingPracticeLeaderboard({ limit: 10 }),
        ]);

        if (homeResult.status === "fulfilled") {
          setPayload(homeResult.value);
        } else {
          throw homeResult.reason;
        }

        if (historyResult.status === "fulfilled") {
          setHistoryPayload(historyResult.value);
        } else {
          toast.error(historyResult.reason instanceof Error ? historyResult.reason.message : "加载练习记录失败");
        }

        if (leaderboardResult.status === "fulfilled") {
          setLeaderboard(leaderboardResult.value);
        } else {
          toast.error(leaderboardResult.reason instanceof Error ? leaderboardResult.reason.message : "加载排行榜失败");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载打字练习失败");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isMobileBlocked]);

  const texts = payload.texts;
  const homeConfig = payload.homeConfig;
  const filteredTexts = texts;
  const visibleRuleParagraphs = useMemo(
    () => homeConfig.rules.paragraphs.filter((item) => !/(法条默写|默写)/.test(item.text)),
    [homeConfig.rules.paragraphs],
  );

  useEffect(() => {
    if (filteredTexts.length === 0) {
      setSelectedTextId("");
      return;
    }

    setSelectedTextId((current) => (filteredTexts.some((text) => text.id === current) ? current : filteredTexts[0]?.id ?? ""));
  }, [filteredTexts]);

  const selectedText = useMemo(
    () => filteredTexts.find((text) => text.id === selectedTextId) ?? filteredTexts[0] ?? null,
    [filteredTexts, selectedTextId],
  );
  const recentRecord = payload.recentRecords[0] ?? null;
  const speedRank = getTypingSpeedRank(payload.summary.bestCpm);
  const policePosition = recentRecord ? Math.min(74, 16 + Math.round(recentRecord.completionRate * 0.58)) : 18;
  const thiefPosition = 82;

  if (isMobileBlocked) {
    return <TypingPracticeDeviceNotice />;
  }

  const cycleText = (direction: "next" | "prev") => {
    const next = pickNextTypingPracticeText(filteredTexts, selectedTextId, direction);
    if (next) {
      setSelectedTextId(next.id);
    }
  };

  const startPractice = () => {
    if (filteredTexts.length === 0 || !selectedText) {
      toast.error("当前还没有可练习的文本");
      return;
    }

    navigate(
      `/user/typing-practice/texts/${selectedText.id}/play${buildTypingPracticeSearch(selectedMode, {
        difficulty: selectedDifficulty,
        timeLimitSeconds: selectedMode === "sprint" ? sprintSeconds : undefined,
      })}`,
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] px-6 py-8 text-slate-900">
        <div className="mx-auto max-w-7xl rounded-lg border border-slate-200 bg-white px-6 py-20 text-center text-sm text-slate-500 shadow-sm">
          页面加载中...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900 selection:bg-slate-900 selection:text-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase text-[#c9973e]">{homeConfig.hero.englishTitle || "Typing Practice"}</div>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">{homeConfig.hero.title || "打字练习"}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              {homeConfig.hero.description || "围绕法考表达场景训练输入速度、准确率和连续作答节奏。"}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/user/courses")}
            className="h-10 rounded-lg border-slate-200 bg-white px-4 text-slate-700"
          >
            <House className="size-4" />
            返回主页
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-5 rounded-lg border border-[#f0d790] bg-[#fff8df] px-4 py-3 text-center text-sm font-medium text-[#76591c]">
          {homeConfig.hero.topNotice || "请使用中文输入法进行练习，删除、剪切、粘贴均已禁用"}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="最高得分" value={recentRecord?.score ?? payload.summary.bestScore} icon={Trophy} accent="#c9973e" />
          <StatCard label="练习次数" value={payload.summary.practiceCount} icon={Keyboard} accent="#4e8ef7" />
          <StatCard label="平均正确率" value={buildTypingAccuracyText(payload.summary.avgAccuracyRate)} icon={BarChart3} accent="#1dc9a4" />
          <StatCard label="最佳速度" value={`${payload.summary.bestCpm}字/分钟`} icon={Timer} accent="#f76e6e" />
          <StatCard label="字速段位" value={speedRank.label} icon={Medal} accent="#c97ef5" />
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <span className="font-semibold text-slate-900">字速段位：</span>
          45字/分钟以下为青铜，45-60为白银，60以上为黄金，90以上为王者。
          <span className="ml-2 text-xs text-slate-500">建议练习至白银及以上段位。</span>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-[#c9973e]">本次练习</div>
                    <h2 className="mt-1 text-xl font-bold text-slate-950">{selectedText?.title ?? "暂无练习文本"}</h2>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                  {selectedText ? (
                    <>
                      <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">{selectedText.folderName}</span>
                      <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">{formatNumber(selectedText.contentLength)} 字符</span>
                      <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">{selectedText.difficultyLabel}</span>
                    </>
                  ) : (
                    <span>暂无可练习的法律文本</span>
                  )}
                </div>

                <p className="mt-4 min-h-[72px] rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                  {selectedText?.preview || "选择一篇文本后，这里会显示练习内容预览。"}
                </p>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">练习模式</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {VISIBLE_TYPING_PRACTICE_MODES.map((mode) => (
                        <ModeButton key={mode} mode={mode} active={selectedMode === mode} onClick={() => setSelectedMode(mode)} />
                      ))}
                    </div>
                    <div className="mt-3 text-sm leading-6 text-slate-500">{buildTypingPracticeIdleHint(selectedMode, homeConfig.modeHints)}</div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">难度与时长</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {VISIBLE_TYPING_DIFFICULTIES.map((difficulty) => (
                        <DifficultyButton
                          key={difficulty.value}
                          label={difficulty.label}
                          active={selectedDifficulty === difficulty.value}
                          onClick={() => setSelectedDifficulty(difficulty.value)}
                        />
                      ))}
                    </div>
                    {selectedMode === "sprint" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <DifficultyButton label="3 分钟" active={sprintSeconds === 180} onClick={() => setSprintSeconds(180)} />
                        <DifficultyButton label="5 分钟" active={sprintSeconds === 300} onClick={() => setSprintSeconds(300)} />
                      </div>
                    ) : null}
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={startPractice}
                  className="mt-4 h-12 w-full rounded-lg bg-slate-950 text-base font-bold text-white hover:bg-slate-800"
                >
                  <Play className="size-4" />
                  {typingPracticeModeMeta[selectedMode].startLabel}
                </Button>
              </div>

              <div className="min-w-0">
                <TrainingTrack
                  policeImageUrl={homeConfig.hero.policeImageUrl}
                  thiefImageUrl={homeConfig.hero.thiefImageUrl}
                  policePosition={policePosition}
                  thiefPosition={thiefPosition}
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-xs text-slate-500">当前模式</div>
                    <div className="mt-1 truncate text-sm font-bold text-slate-950">{typingPracticeModeMeta[selectedMode].label}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-xs text-slate-500">最近得分</div>
                    <div className="mt-1 text-sm font-bold text-slate-950">{recentRecord?.score ?? 0} 分</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-xs text-slate-500">最近速度</div>
                    <div className="mt-1 text-sm font-bold text-slate-950">{recentRecord?.cpm ?? 0} CPM</div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-[#ead8aa] bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-950">选择练习文本</div>
                      <div className="mt-1 text-xs text-slate-500">{formatNumber(filteredTexts.length)} 篇可练习文本</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cycleText("prev")}
                        disabled={filteredTexts.length === 0}
                        className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-50"
                        aria-label="上一篇"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => cycleText("next")}
                        disabled={filteredTexts.length === 0}
                        className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-50"
                        aria-label="下一篇"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-xs font-bold text-slate-500">练习文本</span>
                    <select
                      value={selectedTextId}
                      onChange={(event) => setSelectedTextId(event.target.value)}
                      disabled={filteredTexts.length === 0}
                      className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-[#c9973e] focus:ring-2 focus:ring-[#c9973e]/15 disabled:text-slate-400"
                      aria-label="选择练习文本"
                    >
                      {filteredTexts.length === 0 ? (
                        <option value="">暂无可选文本</option>
                      ) : (
                        filteredTexts.map((text) => (
                          <option key={text.id} value={text.id}>
                            {text.title}
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  {selectedText ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="truncate text-sm font-bold text-slate-950">{selectedText.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {selectedText.folderName} · {formatNumber(selectedText.contentLength)} 字符 · {selectedText.difficultyLabel}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-950">文本库</div>
                  <div className="mt-1 text-xs text-slate-500">{formatNumber(filteredTexts.length)} 篇可练习文本，点击后切换本次练习内容</div>
                </div>
              </div>

              <div className="mt-4 grid max-h-[260px] gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
                {filteredTexts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 lg:col-span-2">
                    当前还没有可练习文本。
                  </div>
                ) : (
                  filteredTexts.map((text) => (
                    <TextListItem key={text.id} text={text} active={text.id === selectedTextId} onClick={() => setSelectedTextId(text.id)} />
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-[#4e8ef7]" />
                  <div className="text-sm font-bold text-slate-950">历史战绩</div>
                </div>
                <div className="text-xs text-slate-500">
                  第 {historyPayload.page} / {historyPayload.totalPages} 页
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {historyLoading ? (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">战绩加载中...</div>
                ) : historyPayload.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">你还没有练习记录。</div>
                ) : (
                  historyPayload.items.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => navigate(`/user/typing-practice/records/${record.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-slate-300"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-950">{record.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {record.modeLabel} · {record.completedAt}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-slate-950">{record.score} 分</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {record.cpm} CPM · {buildTypingAccuracyText(record.accuracyRate)}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={historyLoading || historyPayload.page <= 1}
                  className="h-9 rounded-lg border-slate-200 bg-white text-slate-700"
                  onClick={() => void loadHistory(Math.max(1, historyPayload.page - 1))}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={historyLoading || historyPayload.page >= historyPayload.totalPages}
                  className="h-9 rounded-lg border-slate-200 bg-white text-slate-700"
                  onClick={() => void loadHistory(Math.min(historyPayload.totalPages, historyPayload.page + 1))}
                >
                  下一页
                </Button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Medal className="size-4 text-[#c9973e]" />
                <div className="text-sm font-bold text-slate-950">排行榜</div>
              </div>

              <div className="mt-4 space-y-2">
                {leaderboard.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">还没有排行榜数据。</div>
                ) : (
                  leaderboard.slice(0, 8).map((entry) => (
                    <div key={`${entry.rank}-${entry.userId}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-2 text-xs font-bold",
                              entry.rank <= 3 ? "bg-[#fff2cf] text-[#8a6200]" : "bg-slate-100 text-slate-600",
                            )}
                          >
                            {entry.rank}
                          </span>
                          <span className="truncate text-sm font-bold text-slate-950">{entry.userLabel}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {entry.practiceCount} 局 · 平均正确率 {buildTypingAccuracyText(entry.avgAccuracyRate)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-slate-950">{entry.bestScore} 分</div>
                        <div className="mt-1 text-xs text-slate-500">{entry.bestCpm} CPM</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>

        {visibleRuleParagraphs.length > 0 || homeConfig.rules.cards.length > 0 ? (
          <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-bold text-slate-950">训练规则</div>
            {visibleRuleParagraphs.length > 0 ? (
              <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-600 md:grid-cols-2">
                {visibleRuleParagraphs.map((item, index) => (
                  <p key={`${index}-${item.text}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {item.text}
                  </p>
                ))}
              </div>
            ) : null}
            {homeConfig.rules.cards.length > 0 ? (
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                {homeConfig.rules.cards.map((item) => (
                  <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-sm font-bold text-slate-950">{item.title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
