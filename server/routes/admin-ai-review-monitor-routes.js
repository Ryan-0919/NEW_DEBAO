import express from "express";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";
import { getFailures, getQualityMetrics, getRealtimeStats, getTimeseries } from "./admin-ai-review-monitor.js";

const router = express.Router();

router.use(requireAdminAuth);
router.use(requireAdminRoles("super_admin", "operations_admin"));

router.get("/stats", getRealtimeStats);
router.get("/failures", getFailures);
router.get("/quality", getQualityMetrics);
router.get("/timeseries", getTimeseries);

export default router;
