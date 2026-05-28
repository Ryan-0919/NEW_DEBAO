import { config } from "./config.js";
import { prisma } from "./prisma.js";
import {
  getMissingMockExamAiReviewPromptTemplatePlaceholders,
  normalizeMockExamAiReviewConfig,
  serializeMockExamAiReviewConfigForAdmin,
} from "../../src/shared/mock-exam-ai-review-config.js";

const parseConfigJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const getEnvMockExamAiReviewConfig = () => ({ ...(config.mockExamAiReview ?? {}) });

export const getMockExamAiReviewConfig = async ({ db = prisma } = {}) => {
  const systemConfig = await db.systemConfig.findUnique({
    where: { id: 1 },
    select: { mockExamAiReviewConfigJson: true },
  });
  return normalizeMockExamAiReviewConfig(parseConfigJson(systemConfig?.mockExamAiReviewConfigJson), getEnvMockExamAiReviewConfig());
};

export const getMockExamAiReviewConfigForAdmin = async ({ db = prisma } = {}) => {
  const configValue = await getMockExamAiReviewConfig({ db });
  return serializeMockExamAiReviewConfigForAdmin(configValue);
};

export const saveMockExamAiReviewConfig = async ({ db = prisma, input = {} } = {}) => {
  const current = await getMockExamAiReviewConfig({ db });
  const nextInput = { ...current, ...(input ?? {}) };
  if (`${input?.apiKey ?? ""}`.trim() === "********") {
    nextInput.apiKey = current.apiKey;
  }
  if (`${input?.jsonNormalizerApiKey ?? ""}`.trim() === "********") {
    nextInput.jsonNormalizerApiKey = current.jsonNormalizerApiKey;
  }
  const normalized = normalizeMockExamAiReviewConfig(nextInput, getEnvMockExamAiReviewConfig());
  const missingPlaceholders = getMissingMockExamAiReviewPromptTemplatePlaceholders(normalized.userPromptTemplate);
  if (missingPlaceholders.length > 0) {
    throw Object.assign(new Error(`User Prompt 模板缺少必要占位符：${missingPlaceholders.join("、")}`), { statusCode: 400 });
  }
  await db.systemConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      mockExamAiReviewConfigJson: JSON.stringify(normalized),
    },
    update: {
      mockExamAiReviewConfigJson: JSON.stringify(normalized),
    },
  });
  return serializeMockExamAiReviewConfigForAdmin(normalized);
};
