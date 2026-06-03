import { ReactNode, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  FileQuestion,
  FileText,
  Image,
  Keyboard,
  Library,
  ListChecks,
  ListTree,
  LogOut,
  Menu,
  PenSquare,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  clearAdminSession,
  getAdminAccount,
  getAdminRole,
  getAdminToken,
  isAnyAdminRole,
  isContentManagementRole,
  isReviewManagementRole,
  isSystemManagementRole,
  isUserManagementRole,
} from "../lib/admin-session";
import { Button } from "../components/ui/button";
import { AppLogo } from "../components/branding/AppLogo";

type AdminLayoutProps = {
  children: ReactNode;
  pageTitle?: string;
  pageDescription?: string;
};

const navGroups = [
  {
    label: "总览与账号",
    items: [
      { href: "/admin/dashboard", label: "数据仪表盘", icon: BarChart3, roles: "all" },
      { href: "/admin/admins", label: "管理员账号", icon: UserCog, roles: "super" },
      { href: "/admin/users", label: "用户管理", icon: Users, roles: "user" },
    ],
  },
  {
    label: "课程内容",
    items: [
      { href: "/admin/courses", label: "课程管理", icon: BookOpen, roles: "content" },
      { href: "/admin/audio-library", label: "音频库", icon: Library, roles: "content" },
      { href: "/admin/video-library", label: "视频库", icon: Video, roles: "content" },
      { href: "/admin/laws", label: "法条检索", icon: Scale, roles: "content" },
      { href: "/admin/typing-practice", label: "打字练习", icon: Keyboard, roles: "content" },
    ],
  },
  {
    label: "题库与机考",
    items: [
      { href: "/admin/mock-exams", label: "机考试卷发布管理", icon: FileText, roles: "content" },
      { href: "/admin/objective-exam-question-bank", label: "客观机考题库", icon: ListChecks, roles: "content" },
      { href: "/admin/subjective-exam-question-bank", label: "主观机考题库", icon: PenSquare, roles: "content" },
      { href: "/admin/public-question-library", label: "免费练习原题库", icon: FileQuestion, roles: "content" },
      { href: "/admin/authorized-question-library", label: "授权题库原题库", icon: FileQuestion, roles: "content" },
      { href: "/admin/public-question-banks", label: "免费练习题库", icon: BookOpen, roles: "content" },
      { href: "/admin/authorized-question-banks", label: "授权题库", icon: ShieldCheck, roles: "content" },
      { href: "/admin/exam-records", label: "学员考试记录", icon: ListTree, roles: "exam" },
    ],
  },
  {
    label: "批改运营",
    items: [
      { href: "/admin/mock-exam-reviews", label: "批改中心", icon: ShieldCheck, roles: "review" },
      { href: "/admin/mock-exam-ai-review-config", label: "AI批改配置", icon: BrainCircuit, roles: "system" },
      { href: "/admin/ai-review-v2-strategy", label: "AI批改2.0提示词", icon: BrainCircuit, roles: "system" },
      { href: "/admin/ai-review-monitor", label: "AI批改监控", icon: Activity, roles: "system" },
      { href: "/admin/ai-review-v2-performance", label: "AI批改V2性能", icon: BarChart3, roles: "system" },
    ],
  },
  {
    label: "运营配置",
    items: [
      { href: "/admin/home-banner", label: "首页Banner管理", icon: Image, roles: "system" },
      { href: "/admin/learning-announcements", label: "学习公告管理", icon: Bell, roles: "system" },
      { href: "/admin/settings", label: "系统门户配置", icon: Settings, roles: "system" },
      { href: "/admin/logs", label: "系统日志", icon: ScrollText, roles: "system" },
    ],
  },
] as const;

export function AdminLayout({ children, pageTitle = "后台管理", pageDescription = "得宝平台运营工作台" }: AdminLayoutProps) {
  const token = getAdminToken();
  const role = getAdminRole();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/admin/users";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!token) {
    window.location.replace("/admin/login");
    return null;
  }

  if (!isUserManagementRole(role) && !isContentManagementRole(role) && !isReviewManagementRole(role)) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-700">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">无权访问后台管理</h1>
          <p className="mt-2 text-sm text-slate-500">当前后台账号没有可访问的管理权限。</p>
          <Button className="mt-5" onClick={() => window.location.replace("/admin/login")}>
            重新登录
          </Button>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    clearAdminSession();
    window.location.href = "/admin/login";
  };

  const canShowNavItem = (item: (typeof navGroups)[number]["items"][number]) => {
    if (item.roles === "all") return isAnyAdminRole(role);
    if (item.roles === "super") return role === "super_admin";
    if (item.roles === "user") return isUserManagementRole(role);
    if (item.roles === "review") return isReviewManagementRole(role);
    if (item.roles === "system") return isSystemManagementRole(role);
    if (item.roles === "exam") return isUserManagementRole(role) || isReviewManagementRole(role);
    return isContentManagementRole(role);
  };
  const visibleNavGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter(canShowNavItem) }))
    .filter((group) => group.items.length > 0);

  const renderNavLinks = () =>
    visibleNavGroups.map((group) => (
      <div key={group.label} className="space-y-1.5">
        <div className="px-3 pb-1 pt-3 text-[11px] font-bold tracking-[0.12em] text-slate-400">{group.label}</div>
        {group.items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                active ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </a>
          );
        })}
      </div>
    ));

  return (
    <div className="flex h-screen overflow-hidden bg-[#f3f6fb] text-slate-900">
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <aside className="flex h-full w-[min(320px,calc(100vw-40px))] flex-col bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <AppLogo />
              <Button variant="ghost" size="icon" className="text-slate-600 hover:bg-slate-100 hover:text-slate-950" onClick={() => setMobileMenuOpen(false)} aria-label="关闭后台导航">
                <X className="size-5" />
              </Button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-5">{renderNavLinks()}</nav>
            <div className="border-t border-slate-200 p-4">
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">当前账号</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950">{getAdminAccount() || "管理员"}</p>
                <p className="mt-1 text-xs text-slate-400">{role || "admin"}</p>
              </div>
              <Button variant="outline" className="w-full justify-start border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={handleLogout}>
                <LogOut className="mr-2 size-4" />
                退出登录
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      <aside className="hidden h-screen w-[272px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 px-6 py-6">
          <AppLogo />
          <div className="mt-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-950">后台管理</h1>
              <p className="mt-1 text-xs leading-5 text-slate-500">得宝平台运营工作台</p>
            </div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-5">{renderNavLinks()}</nav>
        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">当前账号</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{getAdminAccount() || "管理员"}</p>
            <p className="mt-1 text-xs text-slate-400">{role || "admin"}</p>
          </div>
          <Button variant="outline" className="w-full justify-start border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={handleLogout}>
            <LogOut className="mr-2 size-4" />
            退出登录
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex min-h-[76px] shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="icon" className="shrink-0 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden" onClick={() => setMobileMenuOpen(true)} aria-label="打开后台导航">
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{pageTitle}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{pageDescription}</p>
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
