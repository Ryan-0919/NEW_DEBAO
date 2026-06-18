import { Toaster } from "../../components/ui/sonner";
import { AdminLayout } from "../../layouts/AdminLayout";
import { getAdminRole, getAdminToken, isAnyAdminRole, isContentManagementRole, isReviewManagementRole, isUserManagementRole } from "../../lib/admin-session";
import { AdminAccountManagement } from "./AdminAccountManagement";
import { AdminDashboard } from "./AdminDashboard";
import { AdminLogin } from "./AdminLogin";
import { AiReviewMonitor } from "./AiReviewMonitor";
import { AiReviewV2StrategyManagement } from "./AiReviewV2StrategyManagement";
import { AiReviewV2Performance } from "./AiReviewV2Performance";
import { CourseManagement } from "./CourseManagement";
import { DictationManagement } from "./DictationManagement";
import { RecitationManagement } from "./RecitationManagement";
import { ExamQuestionBankManagement } from "./ExamQuestionBankManagement";
import { HomeBannerManagement } from "./HomeBannerManagement";
import { LawPracticeLibraryManagement, LawPracticePaperManagement } from "./LawPracticeManagement";
import { LawManagement } from "./LawManagement";
import { LearningAnnouncementManagement } from "./LearningAnnouncementManagement";
import { MediaLibraryManagement } from "./MediaLibraryManagement";
import { MockExamAiReviewConfigManagement } from "./MockExamAiReviewConfigManagement";
import { MockExamManagement } from "./MockExamManagement";
import { MockExamRecordManagement } from "./MockExamRecordManagement";
import { MockExamReviewManagement } from "./MockExamReviewManagement";
import { QuestionBankManagement } from "./QuestionBankManagement";
import { QuestionLibraryManagement } from "./QuestionLibraryManagement";
import { ShopManagement } from "./ShopManagement";
import { SystemConfigManagement } from "./SystemConfigManagement";
import { SystemLogs } from "./SystemLogs";
import { TypingPracticeManagement } from "./TypingPracticeManagement";
import { UserList } from "./UserList";

export function AdminRouter() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/admin/users";

  if (pathname === "/admin/login") {
    return <AdminLogin />;
  }

  if (!getAdminToken()) {
    window.location.replace("/admin/login");
    return null;
  }

  if (pathname === "/admin" || pathname === "/admin/") {
    const role = getAdminRole();
    const fallbackPath = isAnyAdminRole(role)
      ? "/admin/dashboard"
      : isUserManagementRole(role)
        ? "/admin/users"
      : isReviewManagementRole(role)
        ? "/admin/mock-exam-reviews"
        : isContentManagementRole(role)
          ? "/admin/courses"
          : "/admin/login";
    window.location.replace(fallbackPath);
    return null;
  }

  let pageTitle = "用户管理";
  let pageDescription = "用户、权限、设备与机考状态";
  let content = <UserList />;

  if (pathname.startsWith("/admin/dashboard")) {
    pageTitle = "数据仪表盘";
    pageDescription = "平台用户、内容、机考和后台操作的运行概览";
    content = <AdminDashboard />;
  } else if (pathname.startsWith("/admin/admins")) {
    pageTitle = "管理员账号";
    pageDescription = "后台管理员账号、角色权限和密码重置";
    content = <AdminAccountManagement />;
  } else if (pathname.startsWith("/admin/exam-records")) {
    pageTitle = "学员考试记录";
    pageDescription = "独立查看机考记录、成绩和排行榜，不绕过批改中心流程";
    content = <MockExamRecordManagement />;
  } else if (pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/system-config")) {
    pageTitle = "系统门户配置";
    pageDescription = "配置登录品牌、客服链接、门户文案、首页图片和协议页脚";
    content = <SystemConfigManagement />;
  } else if (pathname.startsWith("/admin/logs")) {
    pageTitle = "系统日志";
    pageDescription = "查看后台操作日志、Webhook 发送日志和失败记录";
    content = <SystemLogs />;
  } else if (pathname.startsWith("/admin/courses")) {
    pageTitle = "课程管理";
    pageDescription = "课程字段、开放状态、讲义、标签与内容概览";
    content = <CourseManagement />;
  } else if (pathname.startsWith("/admin/home-banner")) {
    pageTitle = "首页 Banner 管理";
    pageDescription = "维护用户首页顶部横幅图、标题和描述";
    content = <HomeBannerManagement />;
  } else if (pathname.startsWith("/admin/shop")) {
    pageTitle = "商城与支付";
    pageDescription = "维护课程商品、支付宝收款和订单记录";
    content = <ShopManagement />;
  } else if (pathname.startsWith("/admin/learning-announcements")) {
    pageTitle = "学习公告管理";
    pageDescription = "维护用户首页学习公告，保存后前端通过真实接口展示";
    content = <LearningAnnouncementManagement />;
  } else if (pathname.startsWith("/admin/mock-exams")) {
    pageTitle = "机考试卷发布管理";
    pageDescription = "维护套卷、试卷发布状态、开放时间与权限规则；题源分别在客观/主观机考题库维护";
    content = <MockExamManagement />;
  } else if (pathname.startsWith("/admin/objective-exam-question-bank")) {
    pageTitle = "客观机考题库";
    pageDescription = "客观模考使用的选择题题源，和主观机考题库分开管理";
    content = <ExamQuestionBankManagement paperType="objective" />;
  } else if (pathname.startsWith("/admin/subjective-exam-question-bank")) {
    pageTitle = "主观机考题库";
    pageDescription = "主观批改机考使用的案例题、小问、参考答案和批改说明";
    content = <ExamQuestionBankManagement paperType="subjective" />;
  } else if (pathname.startsWith("/admin/law-practice-library")) {
    pageTitle = "法条练习原题库";
    pageDescription = "维护法条定位原题、文件夹、批量导入和法条源关联";
    content = <LawPracticeLibraryManagement />;
  } else if (pathname.startsWith("/admin/law-practice")) {
    pageTitle = "法条练习管理";
    pageDescription = "从法条练习原题库引用题目，组卷发布给学员练习";
    content = <LawPracticePaperManagement />;
  } else if (pathname.startsWith("/admin/dictation")) {
    pageTitle = "默写本管理";
    pageDescription = "维护默写本科目、章节、挖空填空题，发布后学员可在题库入口中练习";
    content = <DictationManagement />;
  } else if (pathname.startsWith("/admin/recitation")) {
    pageTitle = "抽背管理";
    pageDescription = "维护抽背独立题库、章节和批量导入；不与默写本题库混用";
    content = <RecitationManagement />;
  } else if (pathname.startsWith("/admin/public-question-library") || pathname.startsWith("/admin/question-library")) {
    pageTitle = "免费练习原题库";
    pageDescription = "免费练习题库引用的原始题目，不进入机考流程，不与授权题库原题混用";
    content = <QuestionLibraryManagement accessType="public" />;
  } else if (pathname.startsWith("/admin/authorized-question-library")) {
    pageTitle = "授权题库原题库";
    pageDescription = "授权题库引用的原始题目，只服务需要授权后才能看到的题库";
    content = <QuestionLibraryManagement accessType="authorized" />;
  } else if (pathname.startsWith("/admin/public-question-banks")) {
    pageTitle = "免费练习题库";
    pageDescription = "公开给所有登录学员使用的免费练习题库，按主观/客观分开配置";
    content = <QuestionBankManagement accessType="public" />;
  } else if (pathname.startsWith("/admin/authorized-question-banks")) {
    pageTitle = "授权题库";
    pageDescription = "只在用户被授权后出现在“我的题库”的题库，按主观/客观分开配置";
    content = <QuestionBankManagement accessType="authorized" />;
  } else if (pathname.startsWith("/admin/question-banks")) {
    pageTitle = "免费练习题库";
    pageDescription = "公开给所有登录学员使用的免费练习题库，按主观/客观分开配置";
    content = <QuestionBankManagement accessType="public" />;
  } else if (pathname.startsWith("/admin/mock-exam-ai-review-config")) {
    pageTitle = "AI批改配置";
    pageDescription = "配置主观题自动批改服务、提示词、队列并发和重试策略";
    content = <MockExamAiReviewConfigManagement />;
  } else if (pathname.startsWith("/admin/ai-review-v2-strategy")) {
    pageTitle = "AI批改2.0提示词";
    pageDescription = "维护V2分阶段批改的模型、系统提示词、阶段输出格式和校验规则，保存后下次批改即时生效";
    content = <AiReviewV2StrategyManagement />;
  } else if (pathname.startsWith("/admin/ai-review-monitor")) {
    pageTitle = "AI批改监控";
    pageDescription = "实时监控AI批改系统的运行状态、质量指标和失败记录";
    content = <AiReviewMonitor />;
  } else if (pathname.startsWith("/admin/ai-review-v2-performance")) {
    pageTitle = "AI批改V2性能监控";
    pageDescription = "实时监控AI批改系统V2的性能指标、Token使用和成本统计";
    content = <AiReviewV2Performance />;
  } else if (pathname.startsWith("/admin/mock-exam-reviews")) {
    pageTitle = "批改中心";
    pageDescription = "主观题批改队列、领取锁、草稿保存与发送结果";
    content = <MockExamReviewManagement />;
  } else if (pathname.startsWith("/admin/laws")) {
    pageTitle = "法条检索";
    pageDescription = "同步法条、前台展示、置顶顺序、标签和运营备注";
    content = <LawManagement />;
  } else if (pathname.startsWith("/admin/typing-practice")) {
    pageTitle = "打字练习";
    pageDescription = "练习文本、文件夹、发布状态和练习记录";
    content = <TypingPracticeManagement />;
  } else if (pathname.startsWith("/admin/audio-library")) {
    pageTitle = "音频库";
    pageDescription = "音频文件夹、文稿、讲义和课程引用";
    content = <MediaLibraryManagement type="audio" />;
  } else if (pathname.startsWith("/admin/video-library")) {
    pageTitle = "视频库";
    pageDescription = "视频文件夹、文稿、讲义和课程引用";
    content = <MediaLibraryManagement type="video" />;
  }

  return (
    <AdminLayout pageTitle={pageTitle} pageDescription={pageDescription}>
      <Toaster richColors position="top-center" />
      {content}
    </AdminLayout>
  );
}
