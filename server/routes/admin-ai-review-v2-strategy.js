import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../lib/response.js";
import {
  BASE_SYSTEM_PROMPT,
  PHASE1_OUTPUT_REQUIREMENTS,
  PHASE2_OUTPUT_REQUIREMENTS,
} from "../lib/ai-review-v2/phase-prompt.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";

const router = Router();
router.use(requireAdminAuth);
router.use(requireAdminRoles("super_admin", "operations_admin"));

const DEFAULT_STRATEGY_NAME = "标准批改v2.0";
const DEFAULT_STRATEGY_VERSION = "v2.0";

const normalizeText = (value, fallback = "") => {
  const text = `${value ?? ""}`.trim();
  return text || fallback;
};

const normalizeNumber = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const serializeStrategy = (strategy) => ({
  id: strategy.id,
  name: strategy.name,
  version: strategy.version,
  isActive: Boolean(strategy.isActive),
  model: strategy.model || "claude-opus-4-8",
  temperature: Number(strategy.temperature ?? 0.5),
  maxTokens: Number(strategy.maxTokens ?? 25000),
  timeoutMs: Number(strategy.timeoutMs ?? 120000),
  requireErrorMarks: Boolean(strategy.requireErrorMarks ?? true),
  minErrorMarksCount: Number(strategy.minErrorMarksCount ?? 1),
  minCoverageRate: Number(strategy.minCoverageRate ?? 0.3),
  strictValidation: Boolean(strategy.strictValidation ?? true),
  systemPrompt: strategy.systemPrompt || BASE_SYSTEM_PROMPT,
  gradingPrinciples: strategy.gradingPrinciples || "严格按照采分点评分，必须同时标注得分点和错误点",
  errorEmphasis: strategy.errorEmphasis || "重点标注法律主体错误、法律关系错误、法律概念误用、事实认定错误、结论相反、逻辑错误",
  commentTemplate: strategy.commentTemplate || "",
  phase1OutputRequirements: strategy.phase1OutputRequirements || PHASE1_OUTPUT_REQUIREMENTS,
  phase2OutputRequirements: strategy.phase2OutputRequirements || PHASE2_OUTPUT_REQUIREMENTS,
  defaults: {
    systemPrompt: BASE_SYSTEM_PROMPT,
    phase1OutputRequirements: PHASE1_OUTPUT_REQUIREMENTS,
    phase2OutputRequirements: PHASE2_OUTPUT_REQUIREMENTS,
  },
  createdAt: strategy.createdAt,
  updatedAt: strategy.updatedAt,
});

const isUniqueStrategyConflict = (error) => {
  if (error?.code !== "P2002") return false;
  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : `${error.meta?.target ?? ""}`;
  return !target || target.includes("name") || target.includes("version") || target.includes("uk_name_version");
};

const findFallbackStrategy = async (client = prisma) => {
  const active = await client.aiReviewStrategy.findFirst({
    where: { isActive: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  if (active) return active;

  // Turning the strategy off must not make the admin page attempt to insert
  // the same default (name, version) pair on the next load.
  const defaultStrategy = await client.aiReviewStrategy.findFirst({
    where: { name: DEFAULT_STRATEGY_NAME, version: DEFAULT_STRATEGY_VERSION },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  if (defaultStrategy) return defaultStrategy;

  return client.aiReviewStrategy.findFirst({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
};

const createDefaultStrategy = () => prisma.aiReviewStrategy.create({
    data: {
      name: DEFAULT_STRATEGY_NAME,
      version: DEFAULT_STRATEGY_VERSION,
      isActive: true,
      model: "claude-opus-4-8",
      temperature: 0.5,
      maxTokens: 25000,
      timeoutMs: 120000,
      requireErrorMarks: true,
      minErrorMarksCount: 1,
      minCoverageRate: 0.3,
      strictValidation: true,
      systemPrompt: BASE_SYSTEM_PROMPT,
      gradingPrinciples: "严格按照采分点评分，必须同时标注得分点和错误点",
      errorEmphasis: "重点标注法律主体错误、法律关系错误、法律概念误用、事实认定错误、结论相反、逻辑错误",
      phase1OutputRequirements: PHASE1_OUTPUT_REQUIREMENTS,
      phase2OutputRequirements: PHASE2_OUTPUT_REQUIREMENTS,
      createdBy: "system",
    },
  });

const getOrCreateActiveStrategy = async () => {
  const existing = await findFallbackStrategy();
  if (existing) return existing;

  try {
    return await createDefaultStrategy();
  } catch (error) {
    // Two admins can open this page at the same time during first setup. If
    // both observe an empty table, the loser should reuse the row just created.
    if (!isUniqueStrategyConflict(error)) throw error;
    const createdByAnotherRequest = await prisma.aiReviewStrategy.findFirst({
      where: { name: DEFAULT_STRATEGY_NAME, version: DEFAULT_STRATEGY_VERSION },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    if (createdByAnotherRequest) return createdByAnotherRequest;
    throw error;
  }
};

router.get("/strategy", async (_req, res) => {
  try {
    const strategy = await getOrCreateActiveStrategy();
    return ok(res, serializeStrategy(strategy));
  } catch (error) {
    return fail(res, error.message || "加载AI批改2.0提示词配置失败", error.statusCode || 500);
  }
});

router.patch("/strategy", async (req, res) => {
  try {
    const current = await getOrCreateActiveStrategy();
    const body = req.body ?? {};

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isActive !== false) {
        await tx.aiReviewStrategy.updateMany({
          where: { id: { not: current.id }, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.aiReviewStrategy.update({
        where: { id: current.id },
        data: {
          name: normalizeText(body.name, current.name),
          version: normalizeText(body.version, current.version),
          isActive: body.isActive === false ? false : true,
          model: normalizeText(body.model, current.model || "claude-opus-4-8"),
          temperature: normalizeNumber(body.temperature, Number(current.temperature ?? 0.5), { min: 0, max: 2 }),
          maxTokens: Math.round(normalizeNumber(body.maxTokens, Number(current.maxTokens ?? 25000), { min: 1 })),
          timeoutMs: Math.round(normalizeNumber(body.timeoutMs, Number(current.timeoutMs ?? 120000), { min: 1000 })),
          requireErrorMarks: body.requireErrorMarks !== false,
          minErrorMarksCount: Math.round(normalizeNumber(body.minErrorMarksCount, Number(current.minErrorMarksCount ?? 1), { min: 0 })),
          minCoverageRate: normalizeNumber(body.minCoverageRate, Number(current.minCoverageRate ?? 0.3), { min: 0, max: 1 }),
          strictValidation: body.strictValidation !== false,
          systemPrompt: normalizeText(body.systemPrompt, BASE_SYSTEM_PROMPT),
          gradingPrinciples: normalizeText(body.gradingPrinciples, "严格按照采分点评分，必须同时标注得分点和错误点"),
          errorEmphasis: normalizeText(body.errorEmphasis, "重点标注法律主体错误、法律关系错误、法律概念误用、事实认定错误、结论相反、逻辑错误"),
          commentTemplate: `${body.commentTemplate ?? ""}`.trim() || null,
          phase1OutputRequirements: normalizeText(body.phase1OutputRequirements, PHASE1_OUTPUT_REQUIREMENTS),
          phase2OutputRequirements: normalizeText(body.phase2OutputRequirements, PHASE2_OUTPUT_REQUIREMENTS),
        },
      });
    });

    await writeAdminAuditLog(req, {
      action: "update_ai_review_v2_strategy",
      entityType: "ai_review_strategy",
      entityId: `${updated.id}`,
      entityName: `${updated.name} ${updated.version}`,
      detail: {
        model: updated.model,
        maxTokens: updated.maxTokens,
        timeoutMs: updated.timeoutMs,
        strictValidation: updated.strictValidation,
      },
    });

    return ok(res, serializeStrategy(updated), "AI批改2.0提示词配置已保存");
  } catch (error) {
    if (isUniqueStrategyConflict(error)) {
      return fail(res, "策略名称和版本的组合已存在，请修改名称或版本后再保存", 409);
    }
    return fail(res, error.message || "保存AI批改2.0提示词配置失败", error.statusCode || 500);
  }
});

export default router;
