import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { AdminMockExamAiReviewConfig, adminOperationsService } from "../../services/adminOperationsService";

const REQUIRED_PLACEHOLDERS = ["{{批改原则}}", "{{输出要求}}", "{{题目数据}}"] as const;
const GRADING_PLACEHOLDERS = ["{{题目}}", "{{材料}}", "{{参考解析}}", "{{小问批改依据}}"] as const;
const inputClass = "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-100";

const numberValue = (value: number | string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

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

export function MockExamAiReviewConfigManagement() {
  const [config, setConfig] = useState<AdminMockExamAiReviewConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isRemoteMode = config?.provider === "openai-compatible";
  const readiness = useMemo(() => {
    if (!config) return { label: "未加载", className: "border-slate-200 bg-slate-50 text-slate-600" };
    if (config.provider === "rules") return { label: "规则批改模式", className: "border-slate-200 bg-slate-50 text-slate-700" };
    if (config.baseUrl && config.model && (config.apiKeyConfigured || config.apiKey)) {
      return { label: "远程 AI 已配置", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    }
    return { label: "远程 AI 未完整配置", className: "border-amber-200 bg-amber-50 text-amber-800" };
  }, [config]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      setConfig(await adminOperationsService.getMockExamAiReviewConfig());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载 AI 批改配置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const patchConfig = (patch: Partial<AdminMockExamAiReviewConfig>) => {
    setConfig((current) => (current ? { ...current, ...patch } : current));
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const payload = await adminOperationsService.updateMockExamAiReviewConfig(config);
      setConfig(payload);
      toast.success("AI批改配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存 AI 批改配置失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !config) {
    return <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-slate-500">AI批改配置加载中...</div>;
  }

  if (!config) {
    return <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-slate-500">AI批改配置不可用</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <BrainCircuit className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-950">AI批改配置</h2>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${readiness.className}`}>{readiness.label}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-500">配置主观题机考提交后的自动批改服务和批改提示词，队列处理规则按旧得宝后台逻辑执行。</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading || saving} onClick={() => void loadConfig()}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              重新加载
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void saveConfig()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存配置
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">服务配置</h3>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Field label="批改方式" helper="rules 为本地规则批改；openai-compatible 对接兼容 OpenAI Chat Completions 的服务。">
                <Select value={config.provider} onValueChange={(value) => patchConfig({ provider: value as AdminMockExamAiReviewConfig["provider"] })}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rules">本地规则批改</SelectItem>
                    <SelectItem value="openai-compatible">OpenAI 兼容接口</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="模型名称" helper="例如 gpt-4.1、deepseek-chat、qwen-plus；本地规则批改可留空。">
                <Input className={inputClass} value={config.model} onChange={(event) => patchConfig({ model: event.target.value })} placeholder="请输入模型名称" disabled={!isRemoteMode} />
              </Field>
              <Field label="接口 Base URL" helper="填写到 /v1 即可，系统会请求 /chat/completions。">
                <Input className={inputClass} value={config.baseUrl} onChange={(event) => patchConfig({ baseUrl: event.target.value })} placeholder="https://api.example.com/v1" disabled={!isRemoteMode} />
              </Field>
              <Field label="API Key" helper={config.apiKeyConfigured ? "已保存密钥。保持星号不变则继续使用原密钥。" : "密钥只用于后端请求，不会展示明文。"}>
                <Input
                  className={inputClass}
                  value={config.apiKey}
                  onChange={(event) => patchConfig({ apiKey: event.target.value })}
                  placeholder="sk-..."
                  type="password"
                  disabled={!isRemoteMode}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">批改提示词</h3>
            <div className="mt-5 space-y-4">
              <Field label="System Prompt" helper="控制 AI 的整体身份、语气和阅卷原则。">
                <Textarea className={inputClass} rows={6} value={config.systemPrompt} onChange={(event) => patchConfig({ systemPrompt: event.target.value })} />
              </Field>
              <Field label="批改原则模板" helper={`这里会替换 User Prompt 中的 {{批改原则}}。可用占位符：${GRADING_PLACEHOLDERS.join("、")}。`}>
                <div className="mb-2 flex flex-wrap gap-2">
                  {GRADING_PLACEHOLDERS.map((item) => (
                    <code key={item} className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                      {item}
                    </code>
                  ))}
                </div>
                <Textarea
                  className={`${inputClass} font-mono text-xs`}
                  rows={10}
                  value={config.gradingPrinciplesTemplate}
                  onChange={(event) => patchConfig({ gradingPrinciplesTemplate: event.target.value })}
                />
              </Field>
              <Field label="输出要求" helper="这里会替换 User Prompt 中的 {{输出要求}}。JSON 字段、划线规则、分值规则都可以在这里改。">
                <Textarea
                  className={`${inputClass} font-mono text-xs`}
                  rows={13}
                  value={config.outputRequirementsPrompt}
                  onChange={(event) => patchConfig({ outputRequirementsPrompt: event.target.value })}
                />
              </Field>
              <Field label="User Prompt 模板" helper={`必须保留 ${REQUIRED_PLACEHOLDERS.join("、")} 三个占位符；系统会自动兼容旧英文占位符。`}>
                <div className="mb-2 flex flex-wrap gap-2">
                  {REQUIRED_PLACEHOLDERS.map((item) => (
                    <code key={item} className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                      {item}
                    </code>
                  ))}
                </div>
                <Textarea className={`${inputClass} font-mono text-xs`} rows={14} value={config.userPromptTemplate} onChange={(event) => patchConfig({ userPromptTemplate: event.target.value })} />
              </Field>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-950">模型输出</h3>
            <div className="mt-5 space-y-4">
              <Field label="请求超时（毫秒）">
                <Input className={inputClass} type="number" min={0} value={config.timeoutMs} onChange={(event) => patchConfig({ timeoutMs: Math.max(0, numberValue(event.target.value, 0)) })} />
              </Field>
              <Field label="最大输出 Token" helper="用于防止 AI 输出 JSON 被截断。建议主观题批改先设 8192；题目和点评更长时可调到 12000 以上。">
                <Input className={inputClass} type="number" min={1} value={config.maxTokens} onChange={(event) => patchConfig({ maxTokens: Math.max(1, numberValue(event.target.value, 8192)) })} />
              </Field>
              <Field label="Temperature">
                <Input className={inputClass} type="number" min={0} max={2} step={0.1} value={config.temperature} onChange={(event) => patchConfig({ temperature: Math.min(2, Math.max(0, numberValue(event.target.value, 0.2))) })} />
              </Field>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
                AI 队列并发、失败重试和轮询间隔沿用旧得宝后台的内部规则，不再作为日常配置项展示。
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
