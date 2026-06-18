import express from "express";
import cors from "cors";
import multer from "multer";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./lib/config.js";
import { prisma } from "./lib/prisma.js";
import { ok, fail } from "./lib/response.js";
import { authRouter } from "./routes/auth.js";
import { userRouter } from "./routes/user.js";
import { adminUsersRouter } from "./routes/admin-users.js";
import { adminOperationsRouter } from "./routes/admin-operations.js";
import { adminContentRouter } from "./routes/admin-content.js";
import { adminExamQuestionBankRouter } from "./routes/admin-exam-question-bank.js";
import { adminMockExamReviewRouter } from "./routes/admin-mock-exam-review.js";
import adminAiReviewMonitorRouter from "./routes/admin-ai-review-monitor-routes.js";
import adminAiReviewV2PerformanceRouter from "./routes/admin-ai-review-v2-performance.js";
import adminAiReviewV2StrategyRouter from "./routes/admin-ai-review-v2-strategy.js";
import { adminQuestionLibraryRouter } from "./routes/admin-question-library.js";
import { adminQuestionBankRouter } from "./routes/admin-question-bank.js";
import { startMockExamAiReviewQueue } from "./lib/mock-exam-ai-review-queue.js";
import { resumePendingMediaProcessingJobs } from "./lib/media-processing.js";
import { lawUserRouter } from "./routes/law-user.js";
import { lawAdminRouter } from "./routes/law-admin.js";
import { adminLawPracticeRouter } from "./routes/admin-law-practice.js";
import { lawPracticeUserRouter } from "./routes/law-practice-user.js";
import { dictationAdminRouter } from "./routes/dictation-admin.js";
import { dictationUserRouter } from "./routes/dictation-user.js";
import { recitationAdminRouter } from "./routes/recitation-admin.js";
import { recitationUserRouter } from "./routes/recitation-user.js";
import { typingPracticeAdminRouter } from "./routes/typing-practice-admin.js";
import { typingPracticeUserRouter } from "./routes/typing-practice-user.js";
import { shopUserRouter } from "./routes/shop-user.js";
import { shopPaymentRouter } from "./routes/shop-payment.js";
import { adminShopRouter } from "./routes/admin-shop.js";

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");

const allowedOrigins = new Set(config.corsOrigins);
const isAllowedOrigin = (origin = "") => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
    return hostname === "frp-box.com" || hostname.endsWith(".frp-box.com");
  } catch {
    return false;
  }
};

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);

const captureRawBody = (req, _res, buf, encoding) => {
  if (!buf?.length) return;
  req.rawBody = buf.toString(encoding || "utf8");
};

app.use(express.json({ limit: "20mb", verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, limit: "20mb", verify: captureRawBody }));

app.get("/api/health", (_req, res) => {
  ok(res, {
    status: "ok",
    service: "new-debao-api",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/shop/payments", shopPaymentRouter);
app.use("/api/shop", shopUserRouter);
app.use("/api/user/laws", lawUserRouter);
app.use("/api/user/law-practice", lawPracticeUserRouter);
app.use("/api/user/dictation", dictationUserRouter);
app.use("/api/user/recitation", recitationUserRouter);
app.use("/api/user/typing-practice", typingPracticeUserRouter);
app.use("/api/admin/laws", lawAdminRouter);
app.use("/api/admin/law-practice", adminLawPracticeRouter);
app.use("/api/admin/dictation", dictationAdminRouter);
app.use("/api/admin/recitation", recitationAdminRouter);
app.use("/api/admin/typing-practice", typingPracticeAdminRouter);
app.use("/api/admin/shop", adminShopRouter);
app.use("/api/admin/mock-exam-reviews", adminMockExamReviewRouter);
app.use("/api/admin/ai-review/monitor", adminAiReviewMonitorRouter);
app.use("/api/admin/ai-review-v2", adminAiReviewV2PerformanceRouter);
app.use("/api/admin/ai-review-v2", adminAiReviewV2StrategyRouter);
app.use("/api/admin/content/exam-question-bank", adminExamQuestionBankRouter);
app.use("/api/admin/content/question-library", adminQuestionLibraryRouter);
app.use("/api/admin/content/question-banks", adminQuestionBankRouter);
app.use("/api/admin", adminOperationsRouter);
app.use("/api/admin", adminUsersRouter);
app.use("/api/admin/content", adminContentRouter);
app.use("/api/user", userRouter);

if (process.env.NODE_ENV === "production") {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const distDir = path.resolve(__dirname, "../dist");

  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") return fail(res, "上传文件过大，请压缩后重试", 400);
    if (error.code === "LIMIT_FILE_COUNT") return fail(res, "本次上传文件数量超出限制，请分批上传", 400);
    if (error.code === "LIMIT_UNEXPECTED_FILE") return fail(res, "上传字段不正确，请刷新页面后重试", 400);
    return fail(res, "上传文件失败，请检查文件后重试", 400);
  }

  if (error?.statusCode && Number.isInteger(error.statusCode)) {
    return fail(res, error.message || "请求失败", error.statusCode);
  }

  console.error(error);
  return fail(res, error.message || "服务异常", 500);
});

const start = async () => {
  try {
    await prisma.$connect();
    if (!config.mockExamAiReview.disableQueue) {
      startMockExamAiReviewQueue({ db: prisma });
    } else {
      console.warn("Mock exam AI review queue disabled by MOCK_EXAM_AI_DISABLE_QUEUE");
    }
    await resumePendingMediaProcessingJobs();
    app.listen(config.port, () => {
      console.log(`New Debao API listening on http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error("Server start failed:", error);
    process.exit(1);
  }
};

void start();
