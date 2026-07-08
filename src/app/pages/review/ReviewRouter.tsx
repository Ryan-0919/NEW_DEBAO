import { Toaster } from "../../components/ui/sonner";
import { ReviewLayout } from "../../layouts/ReviewLayout";
import { getAdminRole, getAdminToken, isReviewManagementRole } from "../../lib/admin-session";
import { MockExamReviewManagement } from "../admin/MockExamReviewManagement";
import { ReviewDashboard } from "./ReviewDashboard";
import { ReviewLogin } from "./ReviewLogin";
import { ReviewPapersPage } from "./ReviewPapersPage";
import { RecordStatusGroup, ReviewRecordsPage } from "./ReviewRecordsPage";

const getPaperIdFromPath = (pathname: string) => {
  const match = pathname.match(/^\/adminpg\/papers\/([^/?#]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : "";
};

export function ReviewRouter() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/adminpg/dashboard";
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const role = getAdminRole();
  const isPartTimeReviewer = role === "part_time_reviewer";

  if (pathname === "/adminpg/login") {
    return <ReviewLogin />;
  }

  if (!getAdminToken()) {
    window.location.replace("/adminpg/login");
    return null;
  }

  if (!isReviewManagementRole(role)) {
    window.location.replace("/adminpg/login");
    return null;
  }

  if (pathname === "/adminpg" || pathname === "/adminpg/") {
    window.location.replace("/adminpg/dashboard");
    return null;
  }

  let pageTitle = "批改工作台";
  let pageDescription = "主观题批改任务概览";
  let content = <ReviewDashboard />;
  const paperId = getPaperIdFromPath(pathname);
  const statusParam = `${searchParams.get("status") ?? ""}`.trim();
  const pageParam = Number.parseInt(`${searchParams.get("page") ?? ""}`, 10);
  const initialPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const allowedRecordStatuses = new Set<RecordStatusGroup>(["ai_pending", "ai_processing", "teacher", "mine", "ai_problem", "locked", "published"]);
  const initialRecordStatus = allowedRecordStatuses.has(statusParam as RecordStatusGroup) ? (statusParam as RecordStatusGroup) : undefined;
  const allowedPaperStatuses = new Set(["all", "ai_pending", "ai_processing", "manual_pending", "teacher", "mine", "ai_problem", "locked", "published"]);
  const initialPaperStatus = allowedPaperStatuses.has(statusParam) ? statusParam : undefined;

  if (pathname.startsWith("/adminpg/reviews")) {
    pageTitle = "全局记录";
    pageDescription = isPartTimeReviewer ? "这里只显示分配给当前兼职老师的试卷记录" : "所有试卷下的领取、待老师、AI异常、AI队列和已批改记录";
    content = <ReviewRecordsPage initialStatus={initialRecordStatus} initialPage={initialPage} />;
  } else if (pathname.startsWith("/adminpg/mine")) {
    pageTitle = "我领取的试卷";
    pageDescription = "当前账号已领取且仍在锁定中的批改记录";
    content = <ReviewRecordsPage initialStatus="mine" initialPage={initialPage} />;
  } else if (paperId) {
    pageTitle = "单卷批改";
    pageDescription = isPartTimeReviewer ? "仅展示当前兼职老师被分配到这张试卷的记录" : "当前试卷自己的批改队列和老师工作台";
    content = <MockExamReviewManagement initialPaperId={paperId} initialRecordId={searchParams.get("recordId") ?? ""} initialRecordStatus={initialPaperStatus} returnTo={searchParams.get("returnTo") ?? ""} embedded />;
  } else if (pathname.startsWith("/adminpg/papers")) {
    if (isPartTimeReviewer) {
      window.location.replace("/adminpg/reviews?status=teacher");
      return null;
    }
    pageTitle = "单卷队列";
    pageDescription = "先选试卷，再进入单卷批改队列";
    content = <ReviewPapersPage />;
  } else if (!pathname.startsWith("/adminpg/dashboard")) {
    window.location.replace("/adminpg/dashboard");
    return null;
  }

  return (
    <ReviewLayout pageTitle={pageTitle} pageDescription={pageDescription}>
      <Toaster richColors position="top-center" />
      {content}
    </ReviewLayout>
  );
}
