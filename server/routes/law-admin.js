import { Router } from "express";
import { getLawAdminEntries, getLawAdminEntryDetail, getLawAdminSummary, updateLawAdminEntry } from "../lib/law.js";
import { syncLawEntries } from "../lib/law-sync.js";
import { fail, ok } from "../lib/response.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const lawAdminRouter = Router();

lawAdminRouter.use(requireAdminAuth);
lawAdminRouter.use(requireAdminRoles("super_admin", "operations_admin"));

lawAdminRouter.get("/summary", async (_req, res) => {
  return ok(res, await getLawAdminSummary());
});

lawAdminRouter.get("/entries", async (req, res) => {
  return ok(
    res,
    await getLawAdminEntries({
      keyword: `${req.query?.keyword ?? ""}`.trim(),
      topCategoryId: `${req.query?.topCategoryId ?? ""}`.trim(),
      visibility: `${req.query?.visibility ?? "all"}`.trim(),
      pinnedOnly: `${req.query?.pinnedOnly ?? ""}`.trim() === "true",
      page: toPositiveInt(req.query?.page, 1),
      pageSize: toPositiveInt(req.query?.pageSize, 20),
    }),
  );
});

lawAdminRouter.get("/entries/:sourceLawId", async (req, res) => {
  try {
    return ok(res, await getLawAdminEntryDetail(req.params.sourceLawId));
  } catch (error) {
    return fail(res, error.message || "法条记录不存在", error.statusCode || 500);
  }
});

lawAdminRouter.patch("/entries/:sourceLawId", async (req, res) => {
  try {
    const updated = await updateLawAdminEntry(req.params.sourceLawId, {
      isPublished: req.body?.isPublished,
      isPinned: req.body?.isPinned,
      manualSortOrder: req.body?.manualSortOrder,
      customTitle: req.body?.customTitle,
      tags: req.body?.tags,
      operatorNote: req.body?.operatorNote,
    });
    await writeAdminAuditLog(req, {
      action: "update_law_entry_operation",
      entityType: "law_entry",
      entityId: `${updated.sourceLawId}`,
      entityName: updated.displayTitle || updated.title,
      detail: {
        sourceLawId: updated.sourceLawId,
        next: {
          isPublished: updated.isPublished,
          isPinned: updated.isPinned,
          manualSortOrder: updated.manualSortOrder,
          customTitle: updated.customTitle,
          tags: updated.tags,
          operatorNoteLength: `${updated.operatorNote ?? ""}`.length,
        },
      },
    });
    return ok(
      res,
      updated,
      "法条运营配置已更新",
    );
  } catch (error) {
    return fail(res, error.message || "法条运营配置保存失败", error.statusCode || 500);
  }
});

lawAdminRouter.post("/sync", async (req, res) => {
  try {
    const result = await syncLawEntries({
      source: "remote",
    });
    await writeAdminAuditLog(req, {
      action: "sync_law_entries",
      entityType: "law_entry",
      entityName: "remote_law_sync",
      detail: result,
    });
    return ok(
      res,
      result,
      "法条数据同步完成",
    );
  } catch (error) {
    return fail(res, error.message || "法条数据同步失败", 500);
  }
});
