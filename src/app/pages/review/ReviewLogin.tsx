import { FormEvent, useState } from "react";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppLogo } from "../../components/branding/AppLogo";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Toaster } from "../../components/ui/sonner";
import { getAdminRole, isReviewManagementRole, saveAdminSession } from "../../lib/admin-session";
import { adminAuthService } from "../../services/adminAuthService";

export function ReviewLogin() {
  const [account, setAccount] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!account.trim() || !password) {
      toast.error("请输入批改后台账号和密码");
      return;
    }

    setSubmitting(true);
    try {
      const payload = await adminAuthService.login(account.trim(), password);
      saveAdminSession(payload);
      if (!isReviewManagementRole(getAdminRole())) {
        toast.error("当前账号不是批改管理员");
        return;
      }
      window.location.href = "/adminpg/dashboard";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批改后台登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#f3f6fb] px-6">
      <Toaster richColors position="top-center" />
      <form onSubmit={handleSubmit} className="w-full max-w-[420px] rounded-lg border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <div className="mb-7">
          <AppLogo />
          <div className="mt-7 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-950">批改后台登录</h1>
              <p className="mt-1 text-sm text-slate-500">主观题阅卷与结果发送</p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <ShieldCheck className="size-4 text-blue-600" />
            仅限批改管理员访问
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="review-account">账号</Label>
            <Input id="review-account" className="h-10" value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="username" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-password">密码</Label>
            <Input
              id="review-password"
              className="h-10"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            进入批改后台
          </Button>
        </div>
      </form>
    </div>
  );
}
