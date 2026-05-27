import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import { AdminSystemConfig, PortalConfig, adminOperationsService } from "../../services/adminOperationsService";

type FieldPath = (string | number)[];

const textInputClass = "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-100";

const getPathValue = (source: any, path: FieldPath, fallback = "") =>
  path.reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source) ?? fallback;

const setPathValue = (source: any, path: FieldPath, value: unknown) => {
  const next = structuredClone(source ?? {});
  let cursor = next;
  path.forEach((key, index) => {
    if (index === path.length - 1) {
      cursor[key] = value;
      return;
    }
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = typeof path[index + 1] === "number" ? [] : {};
    cursor = cursor[key];
  });
  return next;
};

function TextField({
  label,
  value,
  onChange,
  textarea = false,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {textarea ? (
        <Textarea className={textInputClass} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      ) : (
        <Input className={textInputClass} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

function ImageField({
  label,
  url,
  onUpload,
  onClear,
  uploading,
}: {
  label: string;
  url: string;
  onUpload: (file: File) => void;
  onClear: () => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onUpload(file);
    event.target.value = "";
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>{label}</Label>
        <div className="flex gap-2">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
          <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            上传
          </Button>
          <Button variant="outline" size="sm" className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50" disabled={uploading || !url} onClick={onClear}>
            <Trash2 className="size-4" />
            清空
          </Button>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
        {url ? (
          <img src={url} alt={label} className="h-40 w-full object-contain" />
        ) : (
          <div className="grid h-40 place-items-center text-sm text-slate-400">暂无图片</div>
        )}
      </div>
      {url ? <p className="mt-2 break-all text-xs text-slate-500">{url}</p> : null}
    </div>
  );
}

export function SystemConfigManagement() {
  const [config, setConfig] = useState<AdminSystemConfig | null>(null);
  const [portalConfig, setPortalConfig] = useState<PortalConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [uploadingKey, setUploadingKey] = useState("");

  const dirtyPayload = useMemo(
    () =>
      config
        ? {
            webhookUrl: config.webhookUrl,
            customerServiceUrl: config.customerServiceUrl,
            brandLogoUrl: config.brandLogoUrl,
            brandLogoObjectKey: config.brandLogoObjectKey,
            playerDiscImageUrl: config.playerDiscImageUrl,
            playerDiscImageObjectKey: config.playerDiscImageObjectKey,
            portalConfig,
          }
        : null,
    [config, portalConfig],
  );

  const loadConfig = async () => {
    setLoading(true);
    try {
      const payload = await adminOperationsService.getSystemConfig();
      setConfig(payload);
      setPortalConfig(payload.portalConfig ?? {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载系统配置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const patchConfig = (patch: Partial<AdminSystemConfig>) => {
    setConfig((current) => (current ? { ...current, ...patch } : current));
  };

  const updatePortalPath = (path: FieldPath, value: string) => {
    setPortalConfig((current) => setPathValue(current, path, value));
  };

  const uploadImage = async (key: string, file: File, apply: (url: string, objectKey: string) => void) => {
    setUploadingKey(key);
    try {
      const uploaded = await adminOperationsService.uploadSystemImage(file);
      apply(uploaded.url, uploaded.objectKey);
      toast.success("图片已上传，保存后生效");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploadingKey("");
    }
  };

  const handleSave = async () => {
    if (!dirtyPayload) return;
    setSaving(true);
    try {
      const payload = await adminOperationsService.updateSystemConfig(dirtyPayload);
      setConfig(payload);
      setPortalConfig(payload.portalConfig ?? {});
      toast.success("系统配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存系统配置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    try {
      await adminOperationsService.testWebhook(config?.webhookUrl);
      toast.success("Webhook 测试发送成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Webhook 测试失败");
    } finally {
      setTestingWebhook(false);
    }
  };

  if (loading && !config) {
    return <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-slate-500">系统配置加载中...</div>;
  }

  if (!config) {
    return <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-slate-500">系统配置不可用</div>;
  }

  const field = (path: FieldPath, fallback = "") => `${getPathValue(portalConfig, path, fallback) ?? ""}`;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">系统与门户配置</h2>
            <p className="mt-1 text-sm text-slate-500">保存后会影响登录页、门户首页、会员首页和我的页面展示。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading || saving} onClick={() => void loadConfig()}>
              <RefreshCw className="size-4" />
              重新加载
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存配置
            </Button>
          </div>
        </div>
      </section>

      <Tabs defaultValue="basic" className="gap-5">
        <TabsList className="flex h-auto w-full flex-wrap justify-start rounded-lg bg-slate-100 p-1">
          <TabsTrigger value="basic">基础配置</TabsTrigger>
          <TabsTrigger value="portal">门户文案</TabsTrigger>
          <TabsTrigger value="member">会员首页</TabsTrigger>
          <TabsTrigger value="exam">考试倒计时</TabsTrigger>
          <TabsTrigger value="images">图片资源</TabsTrigger>
          <TabsTrigger value="legal">协议页脚</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-5">
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:grid-cols-2">
            <TextField label="Webhook 地址" value={config.webhookUrl} onChange={(value) => patchConfig({ webhookUrl: value })} placeholder="https://..." />
            <TextField label="客服链接" value={config.customerServiceUrl} onChange={(value) => patchConfig({ customerServiceUrl: value })} placeholder="企业微信、表单或客服链接" />
            <TextField label="SEO 标题" value={field(["seo", "title"])} onChange={(value) => updatePortalPath(["seo", "title"], value)} />
            <TextField label="SEO 关键词" value={field(["seo", "keywords"])} onChange={(value) => updatePortalPath(["seo", "keywords"], value)} />
            <div className="lg:col-span-2">
              <TextField label="SEO 描述" textarea rows={4} value={field(["seo", "description"])} onChange={(value) => updatePortalPath(["seo", "description"], value)} />
            </div>
            <div className="lg:col-span-2 flex justify-end">
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={testingWebhook} onClick={() => void handleTestWebhook()}>
                {testingWebhook ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                测试 Webhook
              </Button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="portal" className="space-y-5">
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:grid-cols-2">
            <TextField label="首页徽标" value={field(["hero", "badge"])} onChange={(value) => updatePortalPath(["hero", "badge"], value)} />
            <TextField label="首页标题" value={field(["hero", "title"])} onChange={(value) => updatePortalPath(["hero", "title"], value)} />
            <TextField label="标题高亮" value={field(["hero", "highlight"])} onChange={(value) => updatePortalPath(["hero", "highlight"], value)} />
            <TextField label="产品区标题" value={field(["products", "title"])} onChange={(value) => updatePortalPath(["products", "title"], value)} />
            <div className="lg:col-span-2">
              <TextField label="首页描述" textarea rows={4} value={field(["hero", "description"])} onChange={(value) => updatePortalPath(["hero", "description"], value)} />
            </div>
            <TextField label="联系区标题" value={field(["contact", "title"])} onChange={(value) => updatePortalPath(["contact", "title"], value)} />
            <TextField label="联系按钮文字" value={field(["contact", "buttonLabel"])} onChange={(value) => updatePortalPath(["contact", "buttonLabel"], value)} />
            <div className="lg:col-span-2">
              <TextField label="联系区描述" textarea rows={3} value={field(["contact", "description"])} onChange={(value) => updatePortalPath(["contact", "description"], value)} />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="member" className="space-y-5">
          <section className="rounded-lg border border-blue-100 bg-blue-50 p-5">
            <div className="text-sm font-semibold text-slate-950">会员首页顶部 Banner 已独立管理</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              首页顶部横幅现在按多图轮播展示。标题、描述、图片和排序请到“首页Banner管理”维护；这里继续保留考试入口和我的页面文案。
            </p>
            <Button className="mt-4 bg-blue-600 text-white hover:bg-blue-700" onClick={() => window.location.assign("/admin/home-banner")}>
              去管理首页 Banner
            </Button>
          </section>
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:grid-cols-2">
            <TextField label="考试页眉标题" value={field(["examHome", "title"])} onChange={(value) => updatePortalPath(["examHome", "title"], value)} />
            <TextField label="客观题入口文案" value={field(["examHome", "objectiveModeLabel"])} onChange={(value) => updatePortalPath(["examHome", "objectiveModeLabel"], value)} />
            <TextField label="主观题入口文案" value={field(["examHome", "subjectiveModeLabel"])} onChange={(value) => updatePortalPath(["examHome", "subjectiveModeLabel"], value)} />
            <TextField label="我的页面快捷标题" value={field(["accountCenter", "shortcutTitle"])} onChange={(value) => updatePortalPath(["accountCenter", "shortcutTitle"], value)} />
            <div className="lg:col-span-2">
              <TextField label="我的页面描述" textarea rows={3} value={field(["accountCenter", "description"])} onChange={(value) => updatePortalPath(["accountCenter", "description"], value)} />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="exam" className="space-y-5">
          <section className="rounded-lg border border-blue-100 bg-blue-50 p-5">
            <div className="text-sm font-semibold text-slate-950">题库首页考试倒计时</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              这里控制题库首页左侧的“法考客观题/主观题倒计时”。它只影响展示日期，不会改变机考试卷进入考场后的作答时长；作答时长仍在“机考试卷发布管理”的试卷时长里配置。
            </p>
          </section>
          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:grid-cols-2">
            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <h3 className="text-base font-semibold text-slate-950">客观题倒计时</h3>
                <p className="mt-1 text-sm text-slate-500">用户切换到客观题题库时展示。</p>
              </div>
              <TextField label="标题" value={field(["examCountdown", "objective", "label"], "法考客观题倒计时")} onChange={(value) => updatePortalPath(["examCountdown", "objective", "label"], value)} />
              <TextField label="描述" value={field(["examCountdown", "objective", "description"], "距 2026 年客观题考试还有")} onChange={(value) => updatePortalPath(["examCountdown", "objective", "description"], value)} />
              <div className="space-y-2">
                <Label>考试日期</Label>
                <Input
                  type="date"
                  className={textInputClass}
                  value={field(["examCountdown", "objective", "targetDate"], "2026-09-13").slice(0, 10)}
                  onChange={(event) => updatePortalPath(["examCountdown", "objective", "targetDate"], event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <h3 className="text-base font-semibold text-slate-950">主观题倒计时</h3>
                <p className="mt-1 text-sm text-slate-500">用户切换到主观题题库时展示。</p>
              </div>
              <TextField label="标题" value={field(["examCountdown", "subjective", "label"], "法考主观题倒计时")} onChange={(value) => updatePortalPath(["examCountdown", "subjective", "label"], value)} />
              <TextField label="描述" value={field(["examCountdown", "subjective", "description"], "距 2026 年主观题考试还有")} onChange={(value) => updatePortalPath(["examCountdown", "subjective", "description"], value)} />
              <div className="space-y-2">
                <Label>考试日期</Label>
                <Input
                  type="date"
                  className={textInputClass}
                  value={field(["examCountdown", "subjective", "targetDate"], "2026-10-11").slice(0, 10)}
                  onChange={(event) => updatePortalPath(["examCountdown", "subjective", "targetDate"], event.target.value)}
                />
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="images" className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-2">
            <ImageField
              label="品牌 Logo"
              url={config.brandLogoUrl}
              uploading={uploadingKey === "brandLogo"}
              onUpload={(file) =>
                void uploadImage("brandLogo", file, (url, objectKey) => patchConfig({ brandLogoUrl: url, brandLogoObjectKey: objectKey }))
              }
              onClear={() => patchConfig({ brandLogoUrl: "", brandLogoObjectKey: "" })}
            />
            <ImageField
              label="播放器圆图"
              url={config.playerDiscImageUrl}
              uploading={uploadingKey === "playerDisc"}
              onUpload={(file) =>
                void uploadImage("playerDisc", file, (url, objectKey) => patchConfig({ playerDiscImageUrl: url, playerDiscImageObjectKey: objectKey }))
              }
              onClear={() => patchConfig({ playerDiscImageUrl: "", playerDiscImageObjectKey: "" })}
            />
            <ImageField
              label="创始人头像"
              url={field(["founder", "imageUrl"])}
              uploading={uploadingKey === "founder"}
              onUpload={(file) =>
                void uploadImage("founder", file, (url, objectKey) => {
                  setPortalConfig((current) => setPathValue(setPathValue(current, ["founder", "imageUrl"], url), ["founder", "imageObjectKey"], objectKey));
                })
              }
              onClear={() => {
                setPortalConfig((current) => setPathValue(setPathValue(current, ["founder", "imageUrl"], ""), ["founder", "imageObjectKey"], ""));
              }}
            />
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
              <div className="text-sm font-semibold text-slate-950">会员首页 Banner 轮播</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                会员首页顶部 Banner 已改为多图轮播，请到独立的“首页Banner管理”里新增图片、调整顺序和控制展示状态。
              </p>
              <Button className="mt-4 bg-blue-600 text-white hover:bg-blue-700" onClick={() => window.location.assign("/admin/home-banner")}>
                去管理轮播图
              </Button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="legal" className="space-y-5">
          <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
            <TextField label="页脚描述" textarea rows={3} value={field(["footer", "description"])} onChange={(value) => updatePortalPath(["footer", "description"], value)} />
            <TextField label="版权信息" value={field(["footer", "copyright"])} onChange={(value) => updatePortalPath(["footer", "copyright"], value)} />
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <TextField label={`协议 ${index + 1} 标题`} value={field(["footer", "legalDocuments", index, "title"])} onChange={(value) => updatePortalPath(["footer", "legalDocuments", index, "title"], value)} />
                  <TextField label={`协议 ${index + 1} slug`} value={field(["footer", "legalDocuments", index, "slug"])} onChange={(value) => updatePortalPath(["footer", "legalDocuments", index, "slug"], value)} />
                  <div className="lg:col-span-2">
                    <TextField
                      label={`协议 ${index + 1} 正文`}
                      textarea
                      rows={6}
                      value={(getPathValue(portalConfig, ["footer", "legalDocuments", index, "content"], []) as string[]).join("\n")}
                      onChange={(value) => updatePortalPath(["footer", "legalDocuments", index, "content"], value.split(/\r?\n/).filter(Boolean))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
