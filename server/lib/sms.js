import crypto from "node:crypto";
import DysmsapiClient, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import OpenApiClient from "@alicloud/openapi-client";
import { RuntimeOptions } from "@alicloud/tea-util";
import { config, isConfiguredValue } from "./config.js";

const SMS_SCENE_LOGIN = "login";
const SMS_CODE_LENGTH = 6;
const SMS_CODE_PATTERN = /^\d{6}$/;

let smsClient = null;

const createSmsClient = () => {
  const Client = DysmsapiClient.default ?? DysmsapiClient;

  return new Client(
    new OpenApiClient.Config({
      accessKeyId: config.aliyunSms.accessKeyId,
      accessKeySecret: config.aliyunSms.accessKeySecret,
      endpoint: config.aliyunSms.endpoint,
      regionId: config.aliyunSms.regionId,
    }),
  );
};

const getSmsClient = () => {
  if (!smsClient) {
    smsClient = createSmsClient();
  }

  return smsClient;
};

export const getSmsLoginScene = () => SMS_SCENE_LOGIN;

export const isAliyunSmsConfigured = () =>
  Boolean(
    config.aliyunSms.enabled &&
      isConfiguredValue(config.aliyunSms.accessKeyId) &&
      isConfiguredValue(config.aliyunSms.accessKeySecret) &&
      isConfiguredValue(config.aliyunSms.signName) &&
      isConfiguredValue(config.aliyunSms.templateCode),
  );

export const assertAliyunSmsConfigured = () => {
  if (!config.aliyunSms.enabled) {
    throw new Error("短信验证码登录暂未启用");
  }

  if (!isAliyunSmsConfigured()) {
    throw new Error("短信服务未配置完整，请联系管理员处理");
  }
};

export const generateSmsCode = () =>
  crypto.randomInt(0, 10 ** SMS_CODE_LENGTH).toString().padStart(SMS_CODE_LENGTH, "0");

export const normalizeSmsCode = (value = "") => `${value ?? ""}`.replace(/\D/g, "").slice(0, SMS_CODE_LENGTH);

export const validateSmsCodeOrThrow = (value = "") => {
  const code = normalizeSmsCode(value);
  if (!SMS_CODE_PATTERN.test(code)) {
    throw new Error("请输入 6 位短信验证码");
  }

  return code;
};

export const hashSmsCode = ({ phone, code, scene = SMS_SCENE_LOGIN }) =>
  crypto
    .createHmac("sha256", config.jwtSecret)
    .update(`${scene}:${phone}:${code}`)
    .digest("hex");

export const isSmsCodeMatched = ({ phone, code, codeHash, scene = SMS_SCENE_LOGIN }) => {
  const expected = hashSmsCode({ phone, code, scene });
  const expectedBuffer = Buffer.from(expected, "hex");
  const currentBuffer = Buffer.from(`${codeHash ?? ""}`, "hex");

  if (expectedBuffer.length !== currentBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, currentBuffer);
};

export const sendLoginSmsCode = async ({ phone, code }) => {
  assertAliyunSmsConfigured();

  const request = new SendSmsRequest({
    phoneNumbers: phone,
    signName: config.aliyunSms.signName,
    templateCode: config.aliyunSms.templateCode,
    templateParam: JSON.stringify({ code }),
  });

  const runtime = new RuntimeOptions({
    readTimeout: config.aliyunSms.requestTimeoutMs,
    connectTimeout: config.aliyunSms.requestTimeoutMs,
  });

  const response = await getSmsClient().sendSmsWithOptions(request, runtime);
  const body = response?.body ?? {};

  if (body.code !== "OK") {
    const message = body.message ? `短信发送失败：${body.message}` : "短信发送失败，请稍后重试";
    const error = new Error(message);
    error.code = body.code || "SMS_SEND_FAILED";
    error.requestId = body.requestId || "";
    error.bizId = body.bizId || "";
    throw error;
  }

  return {
    bizId: body.bizId || "",
    requestId: body.requestId || "",
  };
};
