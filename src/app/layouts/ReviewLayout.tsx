import { ReactNode } from "react";
import { AlertTriangle, BarChart3, FileText, ListChecks, LogOut, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { AppLogo } from "../components/branding/AppLogo";
import { Button } from "../components/ui/button";
import { clearAdminSession, getAdminAccount, getAdminRole, getAdminToken, isReviewManagementRole } from "../lib/admin-session";

type ReviewLayoutProps = {
  children: ReactNode;
  pageTitle?: string;
  pageDescription?: string;
};

const navItems = [
  { href: "/adminpg/dashboard", label: "工作台", icon: BarChart3 },
  { href: "/adminpg/mine", label: "我领取的试卷", icon: UserCheck },
  { href: "/adminpg/reviews?status=teacher", label: "待老师批改", icon: ListChecks },
  { href: "/adminpg/reviews?status=ai_processing", label: "AI正在批改", icon: RefreshCw },
  { href: "/adminpg/reviews?status=ai_problem", label: "AI异常", icon: AlertTriangle },
  { href: "/adminpg/papers", label: "单卷队列", icon: FileText },
] as const;

export function ReviewLayout({ children, pageTitle = "批改后台", pageDescription = "得恩法考独立阅卷中心" }: ReviewLayoutProps) {
  const token = getAdminToken();
  const role = getAdminRole();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/adminpg/dashboard";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const currentStatus = new URLSearchParams(search).get("status") ?? "";

  if (!token) {
    window.location.replace("/adminpg/login");
    return null;
  }

  if (!isReviewManagementRole(role)) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-700">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">无权访问批改后台</h1>
          <p className="mt-2 text-sm text-slate-500">当前账号不是批改管理员。</p>
          <Button className="mt-5" onClick={() => window.location.replace("/adminpg/login")}>
            重新登录
          </Button>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    clearAdminSession();
    window.location.href = "/adminpg/login";
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f3f6fb] text-slate-900">
      <aside className="flex h-screen w-[240px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-5">
          <AppLogo />
          <div className="mt-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-950">批改后台</h1>
              <p className="mt-1 text-xs leading-5 text-slate-500">独立阅卷中心</p>
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const [itemPath, itemQuery = ""] = item.href.split("?");
            const itemStatus = new URLSearchParams(itemQuery).get("status") ?? "";
            const active = itemQuery
              ? pathname === itemPath && (currentStatus === itemStatus || (itemStatus === "teacher" && !currentStatus))
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                  active ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">当前账号</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{getAdminAccount() || "批改管理员"}</p>
            <p className="mt-1 text-xs text-slate-400">{role || "review_admin"}</p>
          </div>
          {role === "super_admin" ? (
            <a className="mb-2 flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/admin">
              返回总后台
            </a>
          ) : null}
          <Button variant="outline" className="w-full justify-start border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={handleLogout}>
            <LogOut className="mr-2 size-4" />
            退出登录
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-950">{pageTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{pageDescription}</p>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 xl:p-5">{children}</main>
      </div>
    </div>
  );
}
