import { prisma } from "./prisma.js";
import { getClientIp } from "./request.js";

const DETAIL_STORE_LIMIT = 10000;
const DETAIL_DISPLAY_LIMIT = 500;
const sensitiveAuditKeys =
  /passwordHash|password|token|secret|rawPayload|answerJson|draftText|paperSnapshotJson|activeKey|accessKey|privateKey/i;

const truncate = (value, maxLength) => {
  const text = `${value ?? ""}`;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
};

export const redactSensitiveAuditValue = (value) => {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redactSensitiveAuditValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sensitiveAuditKeys.test(key) ? "***" : redactSensitiveAuditValue(item)]),
  );
};

export const sanitizeAuditDetailText = (value, maxLength = DETAIL_DISPLAY_LIMIT) => {
  if (!value) return "";
  const text = `${value}`;
  try {
    return truncate(JSON.stringify(redactSensitiveAuditValue(JSON.parse(text))), maxLength);
  } catch {
    return truncate(
      text
        .replace(
          /"(passwordHash|password|token|secret|rawPayload|answerJson|draftText|paperSnapshotJson|activeKey|accessKey|privateKey)"\s*:\s*"[^"]*"/gi,
          '"$1":"***"',
        )
        .replace(
          /"(passwordHash|password|token|secret|rawPayload|answerJson|draftText|paperSnapshotJson|activeKey|accessKey|privateKey)"\s*:\s*[^,}\]]+/gi,
          '"$1":"***"',
        )
        .replace(
          /(passwordHash|password|token|secret|rawPayload|answerJson|draftText|paperSnapshotJson|activeKey|accessKey|privateKey)\s*[:=]\s*[^,}\s]+/gi,
          "$1=***",
        ),
      maxLength,
    );
  }
};

const stringifyAuditDetail = (detail) => {
  if (detail === undefined || detail === null) return null;
  try {
    return sanitizeAuditDetailText(JSON.stringify(redactSensitiveAuditValue(detail)), DETAIL_STORE_LIMIT);
  } catch {
    return sanitizeAuditDetailText(`${detail}`, DETAIL_STORE_LIMIT);
  }
};

const getRequestAuditMeta = (req) => {
  if (!req) return {};
  const userAgent = `${req.headers?.["user-agent"] ?? ""}`.slice(0, 500);
  return {
    ip: getClientIp(req),
    method: req.method ?? "",
    path: req.originalUrl ?? req.url ?? "",
    userAgent,
  };
};

export const writeAdminAuditLog = async (
  req,
  { action, entityType, entityId = "", entityName = "", detail = null, adminId, operatorAccount, operatorName } = {},
) => {
  if (!action || !entityType) return;

  const requestMeta = getRequestAuditMeta(req);
  const detailPayload = {
    ...(detail && typeof detail === "object" && !Array.isArray(detail) ? detail : detail === null ? {} : { value: detail }),
    request: requestMeta,
  };

  try {
    await prisma.auditLog.create({
      data: {
        adminId: adminId ?? req?.auth?.adminId ?? null,
        operatorAccount: truncate(operatorAccount ?? req?.auth?.admin?.account ?? "", 50),
        operatorName: truncate(operatorName ?? req?.auth?.admin?.name ?? "", 100),
        action: truncate(action, 100),
        entityType: truncate(entityType, 50),
        entityId: entityId ? truncate(entityId, 191) : null,
        entityName: entityName ? truncate(entityName, 191) : null,
        detail: stringifyAuditDetail(detailPayload),
      },
    });
  } catch (error) {
    console.error("Admin audit log failed:", error);
  }
};
