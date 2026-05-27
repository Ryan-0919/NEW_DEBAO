import { ClipboardCheck, FileText, Home, Library, UserRound } from "lucide-react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router";
import { AppLogo } from "../components/branding/AppLogo";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { cn } from "../components/ui/utils";
import { getUserAvatarUrl, getUserDisplayName, getUserToken } from "../lib/user-session";

const desktopNavigation = [
  {
    label: "首页",
    to: "/user/courses",
    icon: Home,
    isActive: (pathname: string) => pathname === "/user/courses",
  },
  {
    label: "课程学习",
    to: "/user/my-courses",
    icon: Library,
    isActive: (pathname: string) =>
      pathname === "/user/my-courses" ||
      pathname.startsWith("/user/course/") ||
      pathname.startsWith("/user/player/") ||
      pathname.startsWith("/user/video-course/") ||
      pathname.startsWith("/user/video-player/"),
  },
  {
    label: "我的题库",
    to: "/user/book-question-banks",
    icon: ClipboardCheck,
    isActive: (pathname: string) => pathname.startsWith("/user/book-question-banks"),
  },
  {
    label: "机考试卷",
    to: "/user/mock-exams",
    icon: FileText,
    isActive: (pathname: string) =>
      pathname.startsWith("/user/mock-exams") ||
      pathname.startsWith("/user/objective-mock-exams") ||
      pathname.startsWith("/user/my-exams") ||
      pathname.startsWith("/user/exam-leaderboard"),
  },
  {
    label: "我的",
    to: "/user/me",
    icon: UserRound,
    isActive: (pathname: string) => pathname.startsWith("/user/me"),
  },
];

const mobileNavigation = [
  {
    label: "首页",
    to: "/user/courses",
    icon: Home,
    isActive: (pathname: string) =>
      pathname === "/user/courses" ||
      pathname === "/user/my-courses" ||
      pathname.startsWith("/user/book-question-banks") ||
      pathname.startsWith("/user/player/") ||
      pathname.startsWith("/user/video-player/") ||
      pathname.startsWith("/user/video-course/") ||
      pathname.startsWith("/user/course/"),
  },
  {
    label: "我的",
    to: "/user/me",
    icon: UserRound,
    isActive: (pathname: string) =>
      pathname.startsWith("/user/me") ||
      pathname.startsWith("/user/my-exams") ||
      pathname.startsWith("/user/exam-leaderboard"),
  },
];

export function UserLayout() {
  const token = getUserToken();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const isImmersiveMode =
    location.pathname.startsWith("/user/player/") ||
    location.pathname.startsWith("/user/video-player/") ||
    location.pathname.startsWith("/user/mock-exams/papers/") ||
    location.pathname.startsWith("/user/mock-exams/records/");
  const isHomePage = location.pathname === "/user/courses";

  const isDarkShell =
    location.pathname.startsWith("/user") &&
    !location.pathname.startsWith("/user/shop");

  const displayName = getUserDisplayName() || "已登录用户";
  const avatarUrl = getUserAvatarUrl();
  const avatarInitial = displayName.trim().charAt(0) || "学";

  return (
    <div
      className={cn(
        "min-h-screen text-slate-900 selection:bg-slate-900 selection:text-white",
        isDarkShell ? "bg-[#040816]" : "bg-[#f4f5f7]",
      )}
    >
      {!isHomePage && !isImmersiveMode && (
        <header
          className={cn(
            "sticky top-0 z-40 hidden md:block",
            isDarkShell
              ? "border-b border-white/8 bg-[#050b16]/72 backdrop-blur-2xl"
              : "border-b border-slate-200/50 bg-white/80 backdrop-blur-xl",
          )}
        >
          <div className="mx-auto flex h-[76px] max-w-7xl items-center gap-5 px-6 xl:px-8">
            <AppLogo compact className={cn("shrink-0", isDarkShell ? "text-white" : "")} />

            <nav
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full p-1",
                isDarkShell ? "border border-white/10 bg-white/[0.05]" : "border border-slate-200/60 bg-slate-100/50",
              )}
            >
              {desktopNavigation.map((item) => {
                const Icon = item.icon;
                const active = item.isActive(location.pathname);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-bold leading-none transition-all xl:px-5",
                      active
                        ? isDarkShell
                          ? "bg-white text-slate-950 shadow-[0_14px_34px_rgba(255,255,255,0.14)]"
                          : "bg-slate-900 text-white shadow-lg shadow-black/10"
                        : isDarkShell
                          ? "text-white/54 hover:bg-white/[0.08] hover:text-white"
                          : "text-slate-500 hover:bg-white hover:text-slate-900",
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <NavLink
              to="/user/me"
              className={cn(
                "inline-flex shrink-0 items-center gap-3 rounded-full px-4 py-2 text-[13px] font-bold tracking-tight shadow-sm",
                isDarkShell
                  ? "border border-white/10 bg-white/[0.05] text-white/72"
                  : "border border-slate-200/60 bg-white/80 text-slate-500",
              )}
            >
              <Avatar className="size-8 border border-white/10">
                <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                <AvatarFallback className={cn(isDarkShell ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700")}>
                  {avatarInitial}
                </AvatarFallback>
              </Avatar>
              <span className="max-w-[220px] truncate">{displayName}</span>
            </NavLink>
          </div>
        </header>
      )}

      <main className={cn("relative", !isImmersiveMode && "pb-24 md:pb-0")}>
        <Outlet />
      </main>

      {!isImmersiveMode && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 pb-safe md:hidden",
            isDarkShell
              ? "border-t border-white/10 bg-[#07101b]/82 backdrop-blur-2xl"
              : "border-t border-slate-200/50 bg-white/80 backdrop-blur-xl",
          )}
        >
          <div className="mx-auto grid h-16 max-w-md grid-cols-2 px-4">
            {mobileNavigation.map((item) => {
              const Icon = item.icon;
              const active = item.isActive(location.pathname);

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 transition-all active:scale-95",
                    active ? (isDarkShell ? "text-white" : "text-slate-900") : isDarkShell ? "text-white/40" : "text-slate-400",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full px-4 py-1 transition-all",
                      active && (isDarkShell ? "bg-white/10" : "bg-slate-900/5"),
                    )}
                  >
                    <Icon className={cn("size-6 transition-transform", active && "scale-110")} />
                  </div>
                  <span className={cn("text-[10px] font-bold uppercase tracking-widest", active ? "opacity-100" : "opacity-60")}>
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
