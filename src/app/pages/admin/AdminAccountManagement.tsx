import { useEffect, useMemo, useState } from "react";
import { Edit3, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { getAdminId } from "../../lib/admin-session";
import { AdminAccount, AdminRoleValue, adminOperationsService } from "../../services/adminOperationsService";

const roleOptions: { value: AdminRoleValue; label: string; description: string }[] = [
  { value: "super_admin", label: "超级管理员", description: "拥有全部后台权限" },
  { value: "operations_admin", label: "运营管理员", description: "管理内容、配置和日志" },
  { value: "user_admin", label: "用户管理员", description: "管理学员与授权" },
  { value: "review_admin", label: "批改管理员", description: "处理主观题批改" },
];

const roleMeta: Record<AdminRoleValue, { label: string; className: string }> = {
  super_admin: { label: "超级管理员", className: "border-blue-200 bg-blue-50 text-blue-700" },
  operations_admin: { label: "运营管理员", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  user_admin: { label: "用户管理员", className: "border-amber-200 bg-amber-50 text-amber-800" },
  review_admin: { label: "批改管理员", className: "border-violet-200 bg-violet-50 text-violet-700" },
};

const emptyForm = { account: "", name: "", role: "operations_admin" as AdminRoleValue, password: "" };

export function AdminAccountManagement() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);
  const [passwordAdmin, setPasswordAdmin] = useState<AdminAccount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [password, setPassword] = useState("");
  const currentAdminId = getAdminId();

  const summary = useMemo(
    () => ({
      total: admins.length,
      superAdmin: admins.filter((admin) => admin.role === "super_admin").length,
      operations: admins.filter((admin) => admin.role === "operations_admin").length,
      reviewers: admins.filter((admin) => admin.role === "review_admin").length,
    }),
    [admins],
  );

  const loadAdmins = async () => {
    setLoading(true);
    try {
      setAdmins(await adminOperationsService.getAdmins());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载管理员账号失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdmins();
  }, []);

  const openCreateDialog = () => {
    setEditingAdmin(null);
    setForm({ ...emptyForm, password: "admin123" });
  };

  const openEditDialog = (admin: AdminAccount) => {
    setEditingAdmin(admin);
    setForm({ account: admin.account, name: admin.name, role: admin.role, password: "" });
  };

  const closeFormDialog = () => {
    if (saving) return;
    setEditingAdmin(null);
    setForm(emptyForm);
  };

  const handleSaveAdmin = async () => {
    setSaving(true);
    try {
      if (editingAdmin) {
        const next = await adminOperationsService.updateAdmin(editingAdmin.id, {
          account: form.account.trim(),
          name: form.name.trim(),
          role: form.role,
        });
        setAdmins((current) => current.map((admin) => (admin.id === next.id ? next : admin)));
        toast.success("管理员账号已更新");
      } else {
        const next = await adminOperationsService.createAdmin({
          account: form.account.trim(),
          name: form.name.trim(),
          role: form.role,
          password: form.password.trim(),
        });
        setAdmins((current) => [...current, next]);
        toast.success("管理员账号已创建");
      }
      closeFormDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存管理员账号失败");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!passwordAdmin) return;
    setSaving(true);
    try {
      await adminOperationsService.resetAdminPassword(passwordAdmin.id, password.trim());
      toast.success("管理员密码已重置");
      setPasswordAdmin(null);
      setPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置管理员密码失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdmin = async (admin: AdminAccount) => {
    if (!window.confirm(`确定删除管理员 ${admin.account} 吗？`)) return;
    try {
      await adminOperationsService.deleteAdmin(admin.id);
      setAdmins((current) => current.filter((item) => item.id !== admin.id));
      toast.success("管理员账号已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除管理员账号失败");
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["管理员总数", summary.total],
          ["超级管理员", summary.superAdmin],
          ["运营管理员", summary.operations],
          ["批改管理员", summary.reviewers],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">管理员账号</h2>
            <p className="mt-1 text-sm text-slate-500">后台登录账号、角色权限和密码重置集中管理。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading} onClick={() => void loadAdmins()}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              刷新
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={openCreateDialog}>
              <Plus className="size-4" />
              新增管理员
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-5 py-3">账号</th>
                <th className="px-5 py-3">姓名</th>
                <th className="px-5 py-3">角色</th>
                <th className="px-5 py-3">操作日志</th>
                <th className="px-5 py-3">创建时间</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500">{loading ? "管理员账号加载中..." : "暂无管理员账号"}</td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr key={admin.id} className="bg-white hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                          <UserCog className="size-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-950">{admin.account}</p>
                          {admin.id === currentAdminId ? <p className="mt-1 text-xs text-blue-600">当前登录账号</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{admin.name}</td>
                    <td className="px-5 py-4">
                      <Badge variant="outline" className={roleMeta[admin.role]?.className ?? "border-slate-200 bg-slate-50 text-slate-700"}>
                        {roleMeta[admin.role]?.label ?? admin.role}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{admin.auditCount}</td>
                    <td className="px-5 py-4 text-xs text-slate-500">{admin.createdAt}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => openEditDialog(admin)}>
                          <Edit3 className="size-4" />
                          编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          onClick={() => {
                            setPasswordAdmin(admin);
                            setPassword("admin123");
                          }}
                        >
                          <KeyRound className="size-4" />
                          重置密码
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                          disabled={admin.id === currentAdminId}
                          onClick={() => void handleDeleteAdmin(admin)}
                        >
                          <Trash2 className="size-4" />
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={Boolean(form.account || form.name || editingAdmin || form.password)} onOpenChange={(open) => { if (!open) closeFormDialog(); }}>
        <DialogContent className="w-[calc(100vw-48px)] max-w-[560px] border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>{editingAdmin ? "编辑管理员" : "新增管理员"}</DialogTitle>
            <DialogDescription>账号用于后台登录，角色会直接影响可见菜单和后端接口权限。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>登录账号</Label>
              <Input value={form.account} onChange={(event) => setForm((current) => ({ ...current, account: event.target.value }))} placeholder="例如 admin_ops" />
            </div>
            <div className="space-y-2">
              <Label>管理员姓名</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="后台显示名称" />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={form.role} onValueChange={(value) => setForm((current) => ({ ...current, role: value as AdminRoleValue }))}>
                <SelectTrigger className="border-slate-200 bg-white text-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white text-slate-900">
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label} · {role.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!editingAdmin ? (
              <div className="space-y-2">
                <Label>初始密码</Label>
                <Input value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={saving} onClick={closeFormDialog}>
              取消
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void handleSaveAdmin()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(passwordAdmin)} onOpenChange={(open) => { if (!open) setPasswordAdmin(null); }}>
        <DialogContent className="border border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>重置管理员密码</DialogTitle>
            <DialogDescription>{passwordAdmin ? `${passwordAdmin.account} · ${passwordAdmin.name}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>新密码</Label>
            <Input value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={saving} onClick={() => setPasswordAdmin(null)}>
              取消
            </Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void handleResetPassword()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
