import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { fail, ok } from "../lib/response.js";
import {
  createTypingPracticeFolder,
  createTypingPracticeText,
  deleteTypingPracticeFolder,
  deleteTypingPracticeText,
  getTypingPracticeDifficultyConfigs,
  getTypingPracticeSummary,
  listTypingPracticeFolders,
  listTypingPracticeRecordsForAdmin,
  listTypingPracticeTexts,
  updateTypingPracticeDifficultyConfigs,
  updateTypingPracticeFolder,
  updateTypingPracticeText,
} from "../lib/typing-practice.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";

export const typingPracticeAdminRouter = Router();

typingPracticeAdminRouter.use(requireAdminAuth);
typingPracticeAdminRouter.use(requireAdminRoles("super_admin", "operations_admin"));

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(`${value ?? ""}`.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const handleError = (res, error, fallbackMessage) => fail(res, error.message || fallbackMessage, error.statusCode || 400);

typingPracticeAdminRouter.get("/summary", async (_req, res) => {
  try {
    return ok(res, await getTypingPracticeSummary({ db: prisma }));
  } catch (error) {
    return handleError(res, error, "加载打字练习统计失败");
  }
});

typingPracticeAdminRouter.get("/folders", async (_req, res) => {
  try {
    return ok(res, await listTypingPracticeFolders({ db: prisma }));
  } catch (error) {
    return handleError(res, error, "加载打字练习文件夹失败");
  }
});

typingPracticeAdminRouter.post("/folders", async (req, res) => {
  try {
    const folder = await createTypingPracticeFolder({
      db: prisma,
      name: req.body?.name,
      sortOrder: req.body?.sortOrder,
    });
    await writeAdminAuditLog(req, {
      action: "create_typing_practice_folder",
      entityType: "typing_practice_folder",
      entityId: folder.id,
      entityName: folder.name,
      detail: { name: folder.name, sortOrder: folder.sortOrder },
    });
    return ok(
      res,
      folder,
      "文件夹已创建",
    );
  } catch (error) {
    return handleError(res, error, "创建文件夹失败");
  }
});

typingPracticeAdminRouter.patch("/folders/:folderId", async (req, res) => {
  try {
    const folder = await updateTypingPracticeFolder({
      db: prisma,
      folderId: req.params.folderId,
      name: req.body?.name,
      sortOrder: req.body?.sortOrder,
    });
    await writeAdminAuditLog(req, {
      action: "update_typing_practice_folder",
      entityType: "typing_practice_folder",
      entityId: folder.id,
      entityName: folder.name,
      detail: { payload: req.body, next: folder },
    });
    return ok(
      res,
      folder,
      "文件夹已更新",
    );
  } catch (error) {
    return handleError(res, error, "更新文件夹失败");
  }
});

typingPracticeAdminRouter.delete("/folders/:folderId", async (req, res) => {
  try {
    const result = await deleteTypingPracticeFolder({ db: prisma, folderId: req.params.folderId });
    await writeAdminAuditLog(req, {
      action: "delete_typing_practice_folder",
      entityType: "typing_practice_folder",
      entityId: req.params.folderId,
      detail: result,
    });
    return ok(res, result, "文件夹已删除");
  } catch (error) {
    return handleError(res, error, "删除文件夹失败");
  }
});

typingPracticeAdminRouter.get("/texts", async (req, res) => {
  try {
    return ok(
      res,
      await listTypingPracticeTexts({
        db: prisma,
        folderId: `${req.query?.folderId ?? ""}`.trim(),
        keyword: `${req.query?.keyword ?? ""}`.trim(),
        status: `${req.query?.status ?? ""}`.trim(),
        page: toPositiveInt(req.query?.page, 1),
        pageSize: Math.min(toPositiveInt(req.query?.pageSize, 20), 100),
      }),
    );
  } catch (error) {
    return handleError(res, error, "加载练习文本失败");
  }
});

typingPracticeAdminRouter.post("/texts", async (req, res) => {
  try {
    const text = await createTypingPracticeText({ db: prisma, payload: req.body });
    const auditPayload = {
      title: text.title,
      folderId: text.folderId,
      difficulty: text.difficulty,
      status: text.status,
      source: text.source,
      tagCount: text.tags.length,
      contentLength: text.contentLength,
    };
    await writeAdminAuditLog(req, {
      action: "create_typing_practice_text",
      entityType: "typing_practice_text",
      entityId: text.id,
      entityName: text.title,
      detail: auditPayload,
    });
    return ok(res, text, "练习文本已创建");
  } catch (error) {
    return handleError(res, error, "创建练习文本失败");
  }
});

typingPracticeAdminRouter.patch("/texts/:textId", async (req, res) => {
  try {
    const text = await updateTypingPracticeText({
      db: prisma,
      textId: req.params.textId,
      payload: req.body,
    });
    const auditPayload = {
      title: text.title,
      folderId: text.folderId,
      difficulty: text.difficulty,
      status: text.status,
      source: text.source,
      tagCount: text.tags.length,
      contentLength: text.contentLength,
    };
    await writeAdminAuditLog(req, {
      action: "update_typing_practice_text",
      entityType: "typing_practice_text",
      entityId: text.id,
      entityName: text.title,
      detail: auditPayload,
    });
    return ok(
      res,
      text,
      "练习文本已更新",
    );
  } catch (error) {
    return handleError(res, error, "更新练习文本失败");
  }
});

typingPracticeAdminRouter.delete("/texts/:textId", async (req, res) => {
  try {
    const result = await deleteTypingPracticeText({ db: prisma, textId: req.params.textId });
    await writeAdminAuditLog(req, {
      action: result.archived ? "archive_typing_practice_text" : "delete_typing_practice_text",
      entityType: "typing_practice_text",
      entityId: req.params.textId,
      detail: result,
    });
    return ok(res, result, "练习文本已处理");
  } catch (error) {
    return handleError(res, error, "删除练习文本失败");
  }
});

typingPracticeAdminRouter.get("/records", async (req, res) => {
  try {
    return ok(
      res,
      await listTypingPracticeRecordsForAdmin({
        db: prisma,
        keyword: `${req.query?.keyword ?? ""}`.trim(),
        page: toPositiveInt(req.query?.page, 1),
        pageSize: Math.min(toPositiveInt(req.query?.pageSize, 20), 100),
      }),
    );
  } catch (error) {
    return handleError(res, error, "加载练习记录失败");
  }
});

typingPracticeAdminRouter.get("/difficulty-configs", async (_req, res) => {
  try {
    return ok(res, await getTypingPracticeDifficultyConfigs({ db: prisma }));
  } catch (error) {
    return handleError(res, error, "加载难度配置失败");
  }
});

typingPracticeAdminRouter.patch("/difficulty-configs", async (req, res) => {
  try {
    const configs = await updateTypingPracticeDifficultyConfigs({
      db: prisma,
      items: req.body?.items,
    });
    await writeAdminAuditLog(req, {
      action: "update_typing_practice_difficulty_configs",
      entityType: "typing_practice_config",
      entityId: "difficulty_configs",
      detail: { items: configs },
    });
    return ok(
      res,
      configs,
      "难度配置已更新",
    );
  } catch (error) {
    return handleError(res, error, "保存难度配置失败");
  }
});
