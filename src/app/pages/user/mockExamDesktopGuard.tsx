import {
  ArrowLeft,
  BookOpenCheck,
  FileText,
  Keyboard,
  Laptop,
  MonitorSmartphone,
  Scale,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";

const MOBILE_BREAKPOINT = 768;
const PHONE_DEVICE_RE = /Android.+Mobile|iPhone|iPod|Windows Phone|Mobile/i;
const TOUCH_DEVICE_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

const detectMockExamMobileDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  return PHONE_DEVICE_RE.test(userAgent) || (window.innerWidth < MOBILE_BREAKPOINT && TOUCH_DEVICE_RE.test(userAgent));
};

export function useMockExamDesktopGuard() {
  const [blocked, setBlocked] = useState(() => detectMockExamMobileDevice());

  useEffect(() => {
    const syncBlockedState = () => {
      setBlocked(detectMockExamMobileDevice());
    };

    syncBlockedState();
    window.addEventListener("resize", syncBlockedState);
    window.addEventListener("orientationchange", syncBlockedState);

    return () => {
      window.removeEventListener("resize", syncBlockedState);
      window.removeEventListener("orientationchange", syncBlockedState);
    };
  }, []);

  return blocked;
}

export type DesktopOnlyFeature =
  | "mockExam"
  | "objectiveMock"
  | "subjectiveReview"
  | "myQuestionBank"
  | "lawPractice"
  | "typingPractice";

type DesktopOnlyFeatureConfig = {
  badge: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  tips: string[];
};

const desktopOnlyFeatureConfig: Record<DesktopOnlyFeature, DesktopOnlyFeatureConfig> = {
  mockExam: {
    badge: "电脑端机考",
    title: "请使用电脑打开机考系统",
    description: "机考答题、法条联动、批改查看和交卷流程都依赖较大的屏幕空间。手机端暂不开放，避免影响正式作答体验。",
    icon: Laptop,
    accent: "#8fd6ff",
    tips: ["建议使用 Chrome 或 Edge 浏览器", "保持浏览器窗口完整显示", "进入考试前确认网络稳定"],
  },
  objectiveMock: {
    badge: "客观题模考",
    title: "客观题模考请使用电脑打开",
    description: "客观题模考需要同时查看题干、选项、答题卡、倒计时和交卷状态。手机屏幕会影响定位题号和检查答案。",
    icon: Target,
    accent: "#7fb2ff",
    tips: ["右侧答题卡适合电脑端快速定位", "交卷前可完整检查未答题目", "电脑端更接近真实机考环境"],
  },
  subjectiveReview: {
    badge: "主观批改",
    title: "主观批改请使用电脑打开",
    description: "主观题作答、法条查看、长文本输入、划线批注和批改结果阅读都需要电脑端空间。手机端暂不开放。",
    icon: FileText,
    accent: "#42dfbe",
    tips: ["长答案输入更稳定", "题干和小问切换更清楚", "批改批注在电脑端更容易阅读"],
  },
  myQuestionBank: {
    badge: "我的题库",
    title: "我的题库请使用电脑打开",
    description: "我的题库包含授权题库、客观刷题和主观真机练习。为了保证题目阅读、作答和解析查看体验，请切换到电脑端使用。",
    icon: BookOpenCheck,
    accent: "#caa7ff",
    tips: ["授权题库会保留练习记录", "主观题练习使用真机模考排版", "解析和收藏更适合在大屏查看"],
  },
  lawPractice: {
    badge: "法条练习",
    title: "法条练习请使用电脑打开",
    description: "法条练习需要同时查看法律法规汇编、题目要求和长文本答题区。电脑端可以更接近真实机考检索和作答环境。",
    icon: Scale,
    accent: "#f6c15f",
    tips: ["左侧法条目录需要较大的检索空间", "右侧答题区适合长文本抄录", "提交后统一查看标准答案"],
  },
  typingPractice: {
    badge: "打字练习",
    title: "打字练习请使用电脑键盘打开",
    description: "打字练习依赖稳定的中文输入法、键盘事件和计时校验。手机软键盘容易影响统计结果，暂不开放练习。",
    icon: Keyboard,
    accent: "#ffb15f",
    tips: ["请使用电脑键盘完成练习", "建议保持页面聚焦", "练习规则会模拟主观题输入节奏"],
  },
};

const defaultBack = () => {
  if (typeof window !== "undefined") {
    window.location.assign("/");
  }
};

export function DesktopOnlyNotice({
  feature = "mockExam",
  backLabel = "返回首页",
  onBack,
}: {
  feature?: DesktopOnlyFeature;
  backLabel?: string;
  onBack?: () => void;
}) {
  const config = desktopOnlyFeatureConfig[feature] ?? desktopOnlyFeatureConfig.mockExam;
  const Icon = config.icon;

  return (
    <div className="debao-desktop-only-notice relative min-h-[calc(100vh-5.5rem)] overflow-hidden bg-[#050a14] px-4 py-5 text-white md:min-h-full md:px-6 md:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#07111d_0%,#050a14_54%,#0b1524_100%)]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-10rem)] max-w-md items-center md:max-w-3xl md:min-h-0">
        <div className="debao-desktop-only-panel w-full overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.035))] shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-[18px]">
          <div className="h-px w-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)]" />

          <div className="relative p-5 md:p-8">
            <div className="relative flex items-center justify-end gap-3">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-[0.18em]"
                style={{ borderColor: `${config.accent}33`, background: `${config.accent}16`, color: config.accent }}
              >
                <MonitorSmartphone className="size-3.5" />
                仅支持电脑端
              </div>
            </div>

            <div className="relative mt-6 rounded-[22px] border border-white/10 bg-black/18 p-4 md:mt-7 md:p-5">
              <div className="flex items-start gap-4">
                <div
                  className="flex size-14 shrink-0 items-center justify-center rounded-[18px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_40px_rgba(8,18,36,0.28)]"
                  style={{ borderColor: `${config.accent}26`, color: config.accent }}
                >
                  <Icon className="size-7" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold tracking-[0.16em]" style={{ color: config.accent }}>
                    {config.badge}
                  </div>
                  <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-normal text-white md:text-[34px]">
                    {config.title}
                  </h1>
                  <p className="mt-3 text-sm leading-7 text-white/64 md:text-[15px]">
                    {config.description}
                  </p>
                </div>
              </div>

              <div className="debao-desktop-only-grid mt-5 grid gap-3 md:grid-cols-3">
                {config.tips.map((tip) => (
                  <div key={tip} className="rounded-[16px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-2 h-1 w-8 rounded-full" style={{ background: config.accent }} />
                    <div className="text-sm leading-6 text-white/76">{tip}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[16px] border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white/58">
                手机端仍可继续使用课程学习、学习公告、课程咨询和个人资料。需要作答、批改或打字练习时，请换到电脑端登录同一账号。
              </div>

              <div className="debao-desktop-only-actions mt-5 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  className="h-12 rounded-full border border-white/12 bg-white px-5 text-slate-950 shadow-[0_18px_40px_rgba(255,255,255,0.12)] hover:bg-slate-100"
                  onClick={onBack ?? defaultBack}
                >
                  <ArrowLeft className="size-4" />
                  {backLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MockExamDesktopNotice({ feature = "mockExam" }: { feature?: DesktopOnlyFeature }) {
  return <DesktopOnlyNotice feature={feature} backLabel="返回首页" />;
}
