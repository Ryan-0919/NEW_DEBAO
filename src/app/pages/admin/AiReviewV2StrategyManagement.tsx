import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Loader2, RefreshCw, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import { AdminAiReviewV2Strategy, adminOperationsService } from "../../services/adminOperationsService";

const inputClass = "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-100";

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {helper ? <p className="text-xs leading-5 text-slate-500">{helper}</p> : null}
    </div>
  );
}

const numberValue = (value: number | string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function AiReviewV2StrategyManagement() {
  const [strategy, setStrategy] = useState<AdminAiReviewV2Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const status = useMemo(() => {
    if (!strategy) return { label: "未加载", className: "border-slate-200 bg-slate-50 text-slate-600" };
    if (!strategy.isActive) return { label: "未启用", className: "border-amber-200 bg-amber-50 text-amber-800" };
    return { label: "已启用，保存后下次批改即时生效", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }, [strategy]);

  const loadStrategy = async () => {
    setLoading(true);
    try {
      setStrategy(await adminOperationsService.getAiReviewV2Strategy());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载AI批改2.0提示词失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStrategy();
  }, []);

  const patchStrategy = (patch: Partial<AdminAiReviewV2Strategy>) => {
    setStrategy((current) => (current ? { ...current, ...patch } : current));
  };

  const saveStrategy = async () => {
    if (!strategy) return;
    setSaving(true);
    try {
      const next = await adminOperationsService.updateAiReviewV2Strategy(strategy);
      setStrategy(next);
      toast.success("AI批改2.0提示词已保存，下一次重批立即生效");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存AI批改2.0提示词失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !strategy) {
    return <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-slate-500">AI批改2.0提示词加载中...</div>;
  }

  if (!strategy) {
    return <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-slate-500">AI批改2.0提示词不可用</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              <BrainCircuit className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-950">AI批改2.0提示词</h2>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                这里控制 V2 分阶段批改链路。保存后写入数据库，下一次 AI 重批或队列处理会重新读取，不需要重启后端。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading || saving} onClick={() => void loadStrategy()}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              重新加载
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void saveStrategy()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存并热更新
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">策略与模型</h3>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Field label="策略名称">
                <Input className={inputClass} value={strategy.name} onChange={(event) => patchStrategy({ name: event.target.value })} />
              </Field>
              <Field label="版本">
                <Input className={inputClass} value={strategy.version} onChange={(event) => patchStrategy({ version: event.target.value })} />
              </Field>
              <Field label="批改模型" helper="V2当前直接使用这里的模型，不再读取旧AI批改配置里的模型。">
                <Input className={inputClass} value={strategy.model} onChange={(event) => patchStrategy({ model: event.target.value })} />
              </Field>
              <Field label="Temperature">
                <Input
                  className={inputClass}
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={strategy.temperature}
                  onChange={(event) => patchStrategy({ temperature: Math.min(2, Math.max(0, numberValue(event.target.value, 0.5))) })}
                />
              </Field>
              <Field label="最大输出 Token">
                <Input
                  className={inputClass}
                  type="number"
                  min={1}
                  value={strategy.maxTokens}
                  onChange={(event) => patchStrategy({ maxTokens: Math.max(1, Math.round(numberValue(event.target.value, 25000))) })}
                />
              </Field>
              <Field label="超时毫秒">
                <Input
                  className={inputClass}
                  type="number"
                  min={1000}
                  value={strategy.timeoutMs}
                  onChange={(event) => patchStrategy({ timeoutMs: Math.max(1000, Math.round(numberValue(event.target.value, 120000))) })}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">核心提示词</h3>
            <div className="mt-5 space-y-4">
              <Field label="System Prompt" helper="控制V2阅卷老师身份、语气、总原则。">
                <Textarea className={`${inputClass} font-mono text-xs`} rows={12} value={strategy.systemPrompt} onChange={(event) => patchStrategy({ systemPrompt: event.target.value })} />
              </Field>
              <Field label="批改原则" helper="会插入阶段1提示词的【批改原则】区域，适合放评分尺度、不得暴露AI痕迹、点评语言要求。">
                <Textarea className={`${inputClass} font-mono text-xs`} rows={7} value={strategy.gradingPrinciples} onChange={(event) => patchStrategy({ gradingPrinciples: event.target.value })} />
              </Field>
              <Field label="错误标注重点" helper="目前用于后台记录和后续扩展，也建议写清楚哪些错误必须打叉。">
                <Textarea className={`${inputClass} font-mono text-xs`} rows={5} value={strategy.errorEmphasis} onChange={(event) => patchStrategy({ errorEmphasis: event.target.value })} />
              </Field>
              <Field label="点评模板" helper="预留字段。可以先维护标准话术，后续需要我可以继续把它接入阶段1提示词。">
                <Textarea className={`${inputClass} font-mono text-xs`} rows={5} value={strategy.commentTemplate} onChange={(event) => patchStrategy({ commentTemplate: event.target.value })} />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">阶段输出要求</h3>
            <div className="mt-5 space-y-4">
              <Field label="阶段1输出要求" helper="阶段1负责 score、reviewComment、answerMarks。这里改错号、得分点、点评字数和JSON结构要求。">
                <Textarea className={`${inputClass} font-mono text-xs`} rows={18} value={strategy.phase1OutputRequirements} onChange={(event) => patchStrategy({ phase1OutputRequirements: event.target.value })} />
              </Field>
              <Field label="阶段2输出要求" helper="阶段2负责 answerMarkHighlights 和 missedPoints。这里改划线精度、遗漏点格式和JSON结构要求。">
                <Textarea className={`${inputClass} font-mono text-xs`} rows={14} value={strategy.phase2OutputRequirements} onChange={(event) => patchStrategy({ phase2OutputRequirements: event.target.value })} />
              </Field>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">校验开关</h3>
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>启用策略</Label>
                    <p className="mt-1 text-xs leading-5 text-slate-500">关闭后不会再作为当前active策略使用，不建议关闭。</p>
                  </div>
                  <Switch checked={strategy.isActive} onCheckedChange={(checked) => patchStrategy({ isActive: checked })} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>要求错误标注</Label>
                    <p className="mt-1 text-xs leading-5 text-slate-500">有遗漏点时要求生成 wrong 批注。</p>
                  </div>
                  <Switch checked={strategy.requireErrorMarks} onCheckedChange={(checked) => patchStrategy({ requireErrorMarks: checked })} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>严格校验</Label>
                    <p className="mt-1 text-xs leading-5 text-slate-500">用于V2日志和质量监控。当前批改链路会优先保证结果可落库。</p>
                  </div>
                  <Switch checked={strategy.strictValidation} onCheckedChange={(checked) => patchStrategy({ strictValidation: checked })} />
                </div>
              </div>
              <Field label="最少错误标注数">
                <Input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={strategy.minErrorMarksCount}
                  onChange={(event) => patchStrategy({ minErrorMarksCount: Math.max(0, Math.round(numberValue(event.target.value, 1))) })}
                />
              </Field>
              <Field label="最低覆盖率" helper="0到1之间。比如0.3代表30%。">
                <Input
                  className={inputClass}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={strategy.minCoverageRate}
                  onChange={(event) => patchStrategy({ minCoverageRate: Math.min(1, Math.max(0, numberValue(event.target.value, 0.3))) })}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">默认模板</h3>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-500">
              <p>只恢复当前输入框内容，不会自动保存。确认后点击“保存并热更新”才生效。</p>
              <Button variant="outline" className="w-full justify-start border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => patchStrategy({ systemPrompt: strategy.defaults.systemPrompt })}>
                <RotateCcw className="size-4" />
                恢复 System Prompt
              </Button>
              <Button variant="outline" className="w-full justify-start border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => patchStrategy({ phase1OutputRequirements: strategy.defaults.phase1OutputRequirements })}>
                <RotateCcw className="size-4" />
                恢复阶段1模板
              </Button>
              <Button variant="outline" className="w-full justify-start border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => patchStrategy({ phase2OutputRequirements: strategy.defaults.phase2OutputRequirements })}>
                <RotateCcw className="size-4" />
                恢复阶段2模板
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
            <h3 className="font-semibold">热更新说明</h3>
            <p className="mt-2">V2批改每次开始都会读取当前启用策略。保存后，已经在处理中的试卷不会中途切换；下一张试卷或下一次重批会使用新提示词。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
