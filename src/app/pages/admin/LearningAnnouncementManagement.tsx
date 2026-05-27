import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import {
  AdminLearningAnnouncementItem,
  AdminLearningAnnouncements,
  adminOperationsService,
} from "../../services/adminOperationsService";

const inputClass = "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-100";
const colorOptions = ["#f76e6e", "#4e8ef7", "#1dc9a4", "#c9973e", "#c97ef5", "#f7a94e"];

const emptyAnnouncement = (sortOrder = 0): AdminLearningAnnouncementItem => ({
  title: "",
  description: "",
  tag: "公告",
  color: colorOptions[sortOrder % colorOptions.length],
  time: "",
  link: "",
  isVisible: true,
  sortOrder,
});

export function LearningAnnouncementManagement() {
  const [form, setForm] = useState<AdminLearningAnnouncements>({
    title: "学习公告",
    subtitle: "Announcement",
    badge: "最新",
    items: [],
    updatedAt: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const visibleCount = useMemo(() => form.items.filter((item) => item.isVisible !== false).length, [form.items]);

  const loadData = async () => {
    setLoading(true);
    try {
      const payload = await adminOperationsService.getLearningAnnouncements();
      setForm({
        ...payload,
        items: payload.items.length > 0 ? payload.items : [emptyAnnouncement(0)],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "学习公告加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const patchItem = (index: number, patch: Partial<AdminLearningAnnouncementItem>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => {
    setForm((current) => ({
      ...current,
      items: [...current.items, emptyAnnouncement(current.items.length)],
    }));
  };

  const removeItem = (index: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
    }));
  };

  const handleSave = async () => {
    const items = form.items
      .map((item, index) => ({ ...item, sortOrder: index }))
      .filter((item) => item.title.trim() || item.description.trim());

    if (items.length === 0) {
      toast.warning("请至少保留一条公告");
      return;
    }

    setSaving(true);
    try {
      const payload = await adminOperationsService.updateLearningAnnouncements({
        title: form.title,
        subtitle: form.subtitle,
        badge: form.badge,
        items,
      });
      setForm(payload);
      toast.success("学习公告已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "学习公告保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading && form.items.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-slate-500">学习公告加载中...</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">学习公告管理</h2>
            <p className="mt-1 text-sm text-slate-500">
              管理用户首页右侧学习公告。保存后，前端首页会直接读取真实接口展示，不再使用本地 mock 文案。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading || saving} onClick={() => void loadData()}>
              <RefreshCw className="size-4" />
              重新加载
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void handleSave()}>
              <Save className="size-4" />
              保存公告
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:grid-cols-3">
        <div className="space-y-2">
          <Label>模块标题</Label>
          <Input className={inputClass} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>英文副标题</Label>
          <Input className={inputClass} value={form.subtitle} onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>默认标签</Label>
          <Input className={inputClass} value={form.badge} onChange={(event) => setForm((current) => ({ ...current, badge: event.target.value }))} />
        </div>
        <div className="lg:col-span-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          当前共 {form.items.length} 条，前端展示 {visibleCount} 条。更新时间：{form.updatedAt || "-"}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-950">公告列表</h3>
            <p className="mt-1 text-sm text-slate-500">排序按当前列表顺序保存，隐藏的公告不会展示在用户首页。</p>
          </div>
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={addItem}>
            <Plus className="size-4" />
            新增公告
          </Button>
        </div>
        <div className="divide-y divide-slate-100">
          {form.items.map((item, index) => (
            <div key={`${item.id ?? "item"}-${index}`} className="grid gap-4 p-5 xl:grid-cols-[88px_minmax(0,1fr)_260px]">
              <div className="flex items-start gap-3 xl:block">
                <div className="grid size-10 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</div>
                <div className="mt-0 flex items-center gap-2 xl:mt-4">
                  <Switch checked={item.isVisible !== false} onCheckedChange={(checked) => patchItem(index, { isVisible: checked })} />
                  <span className="text-xs text-slate-500">{item.isVisible !== false ? "展示" : "隐藏"}</span>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-2 lg:col-span-2">
                  <Label>公告标题</Label>
                  <Input className={inputClass} value={item.title} onChange={(event) => patchItem(index, { title: event.target.value })} placeholder="例如：阶段课程更新提醒" />
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <Label>公告内容</Label>
                  <Textarea className={inputClass} rows={3} value={item.description} onChange={(event) => patchItem(index, { description: event.target.value })} placeholder="公告正文，会在用户首页展示两行摘要" />
                </div>
                <div className="space-y-2">
                  <Label>标签</Label>
                  <Input className={inputClass} value={item.tag} onChange={(event) => patchItem(index, { tag: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>时间文案</Label>
                  <Input className={inputClass} value={item.time} onChange={(event) => patchItem(index, { time: event.target.value })} placeholder="今天 09:12 / 2026-05-26" />
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <Label>跳转链接</Label>
                  <Input className={inputClass} value={item.link} onChange={(event) => patchItem(index, { link: event.target.value })} placeholder="/user/courses，可留空" />
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div>
                  <Label>颜色</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`size-7 rounded-full border-2 ${item.color === color ? "border-slate-950" : "border-white"} shadow-sm`}
                        style={{ background: color }}
                        onClick={() => patchItem(index, { color })}
                        aria-label={`选择颜色 ${color}`}
                      />
                    ))}
                  </div>
                </div>
                <Input className={inputClass} value={item.color} onChange={(event) => patchItem(index, { color: event.target.value })} />
                <div className="mt-auto flex justify-end">
                  <Button
                    variant="outline"
                    className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                    disabled={form.items.length <= 1}
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 className="size-4" />
                    删除
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
