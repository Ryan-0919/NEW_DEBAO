import { config } from "./config.js";

export const DEFAULT_SMS_CONFIG = {
  enabled: config.aliyunSms.enabled,
  signName: config.aliyunSms.signName,
  loginTemplateCode: config.aliyunSms.templateCode,
  registerTemplateCode: config.aliyunSms.registerTemplateCode,
};

const trim = (value = "") => `${value ?? ""}`.trim();

const parseSmsConfigJson = (value) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const normalizeSmsConfig = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const signName = trim(source.signName) || DEFAULT_SMS_CONFIG.signName;
  const loginTemplateCode = trim(source.loginTemplateCode) || DEFAULT_SMS_CONFIG.loginTemplateCode;
  const registerTemplateCode = trim(source.registerTemplateCode) || DEFAULT_SMS_CONFIG.registerTemplateCode || loginTemplateCode;

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_SMS_CONFIG.enabled,
    signName,
    loginTemplateCode,
    registerTemplateCode,
  };
};

export const readSmsConfigFromSystemConfig = (systemConfig) => normalizeSmsConfig(parseSmsConfigJson(systemConfig?.smsConfigJson));

export const readSmsConfigForAdmin = (systemConfig) => {
  const normalized = readSmsConfigFromSystemConfig(systemConfig);
  return {
    ...normalized,
    hasEnvSignName: Boolean(DEFAULT_SMS_CONFIG.signName),
    hasEnvLoginTemplateCode: Boolean(DEFAULT_SMS_CONFIG.loginTemplateCode),
    hasEnvRegisterTemplateCode: Boolean(DEFAULT_SMS_CONFIG.registerTemplateCode),
  };
};
