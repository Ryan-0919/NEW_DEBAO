import express from "express";
import { fail, ok } from "../lib/response.js";
import { getPerformanceMonitor, resetPerformanceMonitor } from "../lib/ai-review-v2/performance-monitor.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAdminAuth);
router.use(requireAdminRoles("super_admin", "operations_admin"));

router.get("/performance", async (_req, res) => {
  try {
    const monitor = getPerformanceMonitor();
    return ok(res, {
      report: monitor.getReport(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[AI review V2 performance] Failed to load report:", error);
    return fail(res, error instanceof Error ? error.message : "获取性能报告失败", 500);
  }
});

router.post("/performance/reset", async (_req, res) => {
  try {
    resetPerformanceMonitor();
    return ok(res, { message: "性能统计已重置" });
  } catch (error) {
    console.error("[AI review V2 performance] Failed to reset report:", error);
    return fail(res, error instanceof Error ? error.message : "重置性能统计失败", 500);
  }
});

router.post("/performance/print", async (_req, res) => {
  try {
    getPerformanceMonitor().printReport();
    return ok(res, { message: "性能报告已输出到服务器控制台" });
  } catch (error) {
    console.error("[AI review V2 performance] Failed to print report:", error);
    return fail(res, error instanceof Error ? error.message : "打印性能报告失败", 500);
  }
});

export default router;
