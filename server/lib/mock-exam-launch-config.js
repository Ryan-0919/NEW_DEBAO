import { normalizeMockExamLaunchConfig } from "../../src/shared/mock-exam-launch-config.js";
import { getReadableObjectUrl } from "./upload.js";

export const parseMockExamLaunchConfigJson = (value) => {
  if (!value) return normalizeMockExamLaunchConfig(null);

  try {
    return normalizeMockExamLaunchConfig(JSON.parse(value));
  } catch {
    return normalizeMockExamLaunchConfig(null);
  }
};

const resolveLaunchConfigAssets = (configValue) => {
  const normalized = normalizeMockExamLaunchConfig(configValue);
  normalized.notice.avatarUrl = getReadableObjectUrl({
    objectKey: normalized.notice.avatarObjectKey ?? "",
    fallbackUrl: normalized.notice.avatarUrl ?? "",
  });
  return normalized;
};

export const getMockExamLaunchConfig = async (db) => {
  const systemConfig = await db.systemConfig.findUnique({
    where: { id: 1 },
    select: {
      mockExamLaunchConfigJson: true,
    },
  });

  return resolveLaunchConfigAssets(parseMockExamLaunchConfigJson(systemConfig?.mockExamLaunchConfigJson ?? null));
};
