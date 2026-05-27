import { ArrowLeft, Keyboard, MonitorSmartphone } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";

export function TypingPracticeDeviceNotice() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f5f7fb] px-6 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center">
        <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-[#fff7e1] text-[#8a6200]">
              <MonitorSmartphone className="size-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                <Keyboard className="size-3.5" />
                打字练习
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-950">请使用电脑键盘进行练习</h1>
              <p className="mt-3 text-sm leading-7 text-slate-500">
                打字练习需要稳定的中文输入法、键盘事件和计时校验。手机端容易受到软键盘和输入法组合状态影响，当前暂不开放练习。
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">
            建议使用 Chrome 或 Edge 浏览器，并保持页面聚焦。练习过程中剪切、粘贴和删除会被禁用，用于模拟主观题正式输入节奏。
          </div>

          <div className="mt-5">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-slate-200 bg-white text-slate-700"
              onClick={() => navigate("/user/courses")}
            >
              <ArrowLeft className="size-4" />
              返回主页
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
