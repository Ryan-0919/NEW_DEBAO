import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { comparePassword, hashPassword, signAdminToken, signUserToken } from "../lib/auth.js";
import { ok, fail } from "../lib/response.js";
import { serializeUser } from "../lib/serializers.js";
import { config } from "../lib/config.js";
import { getClientIp, getNormalizedDeviceInfo } from "../lib/request.js";
import {
  consumeAdminLoginAttempt,
  consumeUserSmsSendAttempt,
  consumeUserLoginAttempt,
  consumeUserRegisterAttempt,
  resetAdminLoginAttempts,
  resetUserLoginAttempts,
  resetUserRegisterAttempts,
  validatePhoneOrThrow,
  validatePasswordOrThrow,
} from "../lib/security.js";
import {
  assertAliyunSmsConfigured,
  generateSmsCode,
  getSmsLoginScene,
  getSmsRegisterScene,
  hashSmsCode,
  isSmsCodeMatched,
  sendSmsCode,
  validateSmsCodeOrThrow,
} from "../lib/sms.js";
import { readSmsConfigFromSystemConfig } from "../lib/sms-config.js";
import { requireUserAuth } from "../middleware/auth.js";
import { getReadableObjectUrl, uploadBuffer } from "../lib/upload.js";
import { cleanupObjectIfUnused } from "../lib/assets.js";
import { getDevicesToEvictForNewLogin } from "../lib/device-limit.js";
import { normalizePortalConfig } from "../../src/shared/portal-config.js";
import { normalizeDisplayText } from "../lib/text.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";

const DEVICE_LIMIT = 5;
const USER_LOGIN_RATE_LIMIT_ERROR_CODE = 10041;
const ADMIN_LOGIN_RATE_LIMIT_ERROR_CODE = 10042;
const USER_REGISTER_RATE_LIMIT_ERROR_CODE = 10043;
const USER_SMS_SEND_RATE_LIMIT_ERROR_CODE = 10044;
const USER_PROFILE_NICKNAME_MAX_LENGTH = 20;
const USER_AVATAR_MAX_FILE_SIZE = 2 * 1024 * 1024;
const USER_AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: USER_AVATAR_MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter(_req, file, callback) {
    if (USER_AVATAR_MIME_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(createHttpError("头像仅支持 JPG、PNG、WebP 格式"));
  },
});

const isUniqueConstraintError = (error) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");

const normalizeNickname = (value = "") => {
  const text = normalizeDisplayText(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, USER_PROFILE_NICKNAME_MAX_LENGTH);
};

const getUserLoginInclude = () => ({
  permissions: true,
  devices: true,
  mockExamSeriesPermissions: true,
  mockExamPermissions: true,
  bookQuestionBankPermissions: true,
});

const completeUserLogin = async ({ userId, deviceKey, req, type, model }) => {
  const deviceInfo = getNormalizedDeviceInfo(req, { type, model });
  const now = new Date();

  const updatedUser = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${userId} FOR UPDATE`;

    const existingDevice = await tx.userDevice.findUnique({
      where: {
        userId_deviceKey: {
          userId,
          deviceKey,
        },
      },
    });

    if (existingDevice) {
      await tx.userDevice.update({
        where: { id: existingDevice.id },
        data: {
          type: deviceInfo.type,
          model: deviceInfo.model,
          ip: deviceInfo.ip,
          loginAt: now,
        },
      });
    } else {
      const existingDevices = await tx.userDevice.findMany({
        where: { userId },
        select: {
          id: true,
          loginAt: true,
          updatedAt: true,
        },
      });

      const deviceIdsToEvict = getDevicesToEvictForNewLogin(existingDevices, DEVICE_LIMIT);
      if (deviceIdsToEvict.length > 0) {
        await tx.userDevice.deleteMany({
          where: {
            userId,
            id: {
              in: deviceIdsToEvict,
            },
          },
        });
      }

      await tx.userDevice.create({
        data: {
          userId,
          deviceKey,
          type: deviceInfo.type,
          model: deviceInfo.model,
          ip: deviceInfo.ip,
          loginAt: now,
        },
      });
    }

    return tx.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: now,
      },
      include: getUserLoginInclude(),
    });
  });

  const token = signUserToken({
    userId: updatedUser.id,
    phone: updatedUser.phone,
    deviceKey,
  });

  return {
    success: true,
    token,
    user: serializeUser(updatedUser),
  };
};

const resolveMemberHomeBannerUrls = (portalConfig) => {
  portalConfig.memberHome.bannerImageUrl = getReadableObjectUrl({
    objectKey: portalConfig.memberHome.bannerImageObjectKey ?? "",
    fallbackUrl: portalConfig.memberHome.bannerImageUrl ?? "",
  });

  portalConfig.memberHome.banners = (portalConfig.memberHome.banners ?? []).map((item) => ({
    ...item,
    imageUrl: getReadableObjectUrl({
      objectKey: item.imageObjectKey ?? "",
      fallbackUrl: item.imageUrl ?? "",
    }),
    primaryButtonTargetImageUrl: getReadableObjectUrl({
      objectKey: item.primaryButtonTargetImageObjectKey ?? "",
      fallbackUrl: item.primaryButtonTargetImageUrl ?? "",
    }),
    primaryButtonTarget: item.primaryButtonTargetType === "image"
      ? getReadableObjectUrl({
          objectKey: item.primaryButtonTargetImageObjectKey ?? "",
          fallbackUrl: item.primaryButtonTarget ?? item.primaryButtonTargetImageUrl ?? "",
        })
      : item.primaryButtonTarget,
    secondaryButtonTargetImageUrl: getReadableObjectUrl({
      objectKey: item.secondaryButtonTargetImageObjectKey ?? "",
      fallbackUrl: item.secondaryButtonTargetImageUrl ?? "",
    }),
    secondaryButtonTarget: item.secondaryButtonTargetType === "image"
      ? getReadableObjectUrl({
          objectKey: item.secondaryButtonTargetImageObjectKey ?? "",
          fallbackUrl: item.secondaryButtonTarget ?? item.secondaryButtonTargetImageUrl ?? "",
        })
      : item.secondaryButtonTarget,
  }));

  portalConfig.memberHome.sideAds = {
    left: {
      ...(portalConfig.memberHome.sideAds?.left ?? {}),
      imageUrl: getReadableObjectUrl({
        objectKey: portalConfig.memberHome.sideAds?.left?.imageObjectKey ?? "",
        fallbackUrl: portalConfig.memberHome.sideAds?.left?.imageUrl ?? "",
      }),
      targetImageUrl: getReadableObjectUrl({
        objectKey: portalConfig.memberHome.sideAds?.left?.targetImageObjectKey ?? "",
        fallbackUrl: portalConfig.memberHome.sideAds?.left?.targetImageUrl ?? "",
      }),
      target: portalConfig.memberHome.sideAds?.left?.targetType === "image"
        ? getReadableObjectUrl({
            objectKey: portalConfig.memberHome.sideAds?.left?.targetImageObjectKey ?? "",
            fallbackUrl: portalConfig.memberHome.sideAds?.left?.target ?? portalConfig.memberHome.sideAds?.left?.targetImageUrl ?? "",
          })
        : portalConfig.memberHome.sideAds?.left?.target,
    },
    right: {
      ...(portalConfig.memberHome.sideAds?.right ?? {}),
      imageUrl: getReadableObjectUrl({
        objectKey: portalConfig.memberHome.sideAds?.right?.imageObjectKey ?? "",
        fallbackUrl: portalConfig.memberHome.sideAds?.right?.imageUrl ?? "",
      }),
      targetImageUrl: getReadableObjectUrl({
        objectKey: portalConfig.memberHome.sideAds?.right?.targetImageObjectKey ?? "",
        fallbackUrl: portalConfig.memberHome.sideAds?.right?.targetImageUrl ?? "",
      }),
      target: portalConfig.memberHome.sideAds?.right?.targetType === "image"
        ? getReadableObjectUrl({
            objectKey: portalConfig.memberHome.sideAds?.right?.targetImageObjectKey ?? "",
            fallbackUrl: portalConfig.memberHome.sideAds?.right?.target ?? portalConfig.memberHome.sideAds?.right?.targetImageUrl ?? "",
          })
        : portalConfig.memberHome.sideAds?.right?.target,
    },
  };

  portalConfig.memberHome.joinGroup = {
    ...(portalConfig.memberHome.joinGroup ?? {}),
    qrImageUrl: getReadableObjectUrl({
      objectKey: portalConfig.memberHome.joinGroup?.qrImageObjectKey ?? "",
      fallbackUrl: portalConfig.memberHome.joinGroup?.qrImageUrl ?? "",
    }),
  };
};

export const authRouter = Router();

authRouter.get("/branding", async (_req, res) => {
  const config = await prisma.systemConfig.findUnique({
    where: { id: 1 },
  });

  let portalConfig;
  try {
    portalConfig = normalizePortalConfig(config?.portalConfigJson ? JSON.parse(config.portalConfigJson) : null, {
      customerServiceUrl: config?.customerServiceUrl ?? "",
    });
  } catch {
    portalConfig = normalizePortalConfig(null, {
      customerServiceUrl: config?.customerServiceUrl ?? "",
    });
  }

  portalConfig.seo.ogImageUrl = getReadableObjectUrl({
    objectKey: portalConfig.seo.ogImageObjectKey ?? "",
    fallbackUrl: portalConfig.seo.ogImageUrl ?? "",
  });
  resolveMemberHomeBannerUrls(portalConfig);
  portalConfig.founder.imageUrl = getReadableObjectUrl({
    objectKey: portalConfig.founder.imageObjectKey ?? "",
    fallbackUrl: portalConfig.founder.imageUrl ?? "",
  });

  return ok(res, {
    brandLogoUrl: getReadableObjectUrl({
      objectKey: config?.brandLogoObjectKey ?? "",
      fallbackUrl: config?.brandLogoUrl ?? "",
    }),
    customerServiceUrl: config?.customerServiceUrl ?? "",
    playerDiscImageUrl: getReadableObjectUrl({
      objectKey: config?.playerDiscImageObjectKey ?? "",
      fallbackUrl: config?.playerDiscImageUrl ?? "",
    }),
    portalConfig,
  });
});

authRouter.get("/user-home-config", requireUserAuth, async (_req, res) => {
  const config = await prisma.systemConfig.findUnique({
    where: { id: 1 },
  });

  let portalConfig;
  try {
    portalConfig = normalizePortalConfig(config?.portalConfigJson ? JSON.parse(config.portalConfigJson) : null, {
      customerServiceUrl: config?.customerServiceUrl ?? "",
    });
  } catch {
    portalConfig = normalizePortalConfig(null, {
      customerServiceUrl: config?.customerServiceUrl ?? "",
    });
  }

  resolveMemberHomeBannerUrls(portalConfig);

  return ok(res, {
    memberHome: portalConfig.memberHome,
    examHome: portalConfig.examHome,
    examCountdown: portalConfig.examCountdown,
    accountCenter: portalConfig.accountCenter,
    customerServiceUrl: config?.customerServiceUrl ?? "",
  });
});

authRouter.post("/user/login", async (req, res, next) => {
  const { password, deviceKey, type, model } = req.body ?? {};
  const rawPhone = `${req.body?.phone ?? ""}`;

  if (!rawPhone || !password || !deviceKey) {
    return fail(res, "\u8bf7\u8f93\u5165\u5b8c\u6574\u7684\u767b\u5f55\u4fe1\u606f", 400);
  }

  try {
    const phone = validatePhoneOrThrow(rawPhone);
    const ip = getClientIp(req);
    const rateLimitResult = consumeUserLoginAttempt({ ip, phone });

    if (!rateLimitResult.ok) {
      return fail(
        res,
        `\u767b\u5f55\u5c1d\u8bd5\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7 ${rateLimitResult.retryAfterSeconds} \u79d2\u540e\u518d\u8bd5`,
        429,
        USER_LOGIN_RATE_LIMIT_ERROR_CODE,
      );
    }

    const user = await prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatarUrl: true,
        avatarObjectKey: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user) {
      return fail(res, "\u624b\u673a\u53f7\u6216\u5bc6\u7801\u9519\u8bef", 400);
    }

    if (user.status === "disabled") {
      return fail(res, "\u5f53\u524d\u8d26\u53f7\u5df2\u505c\u7528", 403);
    }

    const isMatched = await comparePassword(password, user.passwordHash);
    if (!isMatched) {
      return fail(res, "\u624b\u673a\u53f7\u6216\u5bc6\u7801\u9519\u8bef", 400);
    }

    const loginResult = await completeUserLogin({
      userId: user.id,
      deviceKey,
      req,
      type,
      model,
    });
    resetUserLoginAttempts({ ip, phone });

    return ok(res, loginResult);
  } catch (error) {
    if (error?.statusCode) {
      return fail(res, error.message, error.statusCode, error.code ?? error.statusCode);
    }

    return next(error);
  }
});

authRouter.post("/user/sms/send", async (req, res, next) => {
  const rawPhone = `${req.body?.phone ?? ""}`;
  const rawScene = `${req.body?.scene ?? ""}`.trim().toLowerCase();

  if (!rawPhone) {
    return fail(res, "请输入手机号", 400);
  }

  try {
    const systemConfig = await prisma.systemConfig.findUnique({
      where: { id: 1 },
      select: { smsConfigJson: true },
    });
    const smsConfig = readSmsConfigFromSystemConfig(systemConfig);
    assertAliyunSmsConfigured(smsConfig);

    const phone = validatePhoneOrThrow(rawPhone);
    const ip = getClientIp(req);
    const scene = rawScene === getSmsRegisterScene() ? getSmsRegisterScene() : getSmsLoginScene();
    const now = new Date();
    const cooldownSince = new Date(now.getTime() - config.aliyunSms.sendCooldownSeconds * 1000);

    const latestCode = await prisma.smsVerificationCode.findFirst({
      where: {
        phone,
        scene,
        sendStatus: "sent",
        createdAt: {
          gte: cooldownSince,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        createdAt: true,
      },
    });

    if (latestCode) {
      const retryAfterSeconds = Math.max(
        Math.ceil((latestCode.createdAt.getTime() + config.aliyunSms.sendCooldownSeconds * 1000 - now.getTime()) / 1000),
        1,
      );
      return fail(res, `验证码发送过于频繁，请 ${retryAfterSeconds} 秒后再试`, 429, USER_SMS_SEND_RATE_LIMIT_ERROR_CODE);
    }

    const rateLimitResult = consumeUserSmsSendAttempt({
      ip,
      phone,
      windowMs: config.aliyunSms.sendWindowSeconds * 1000,
      maxAttempts: config.aliyunSms.sendWindowMax,
    });

    if (!rateLimitResult.ok) {
      return fail(
        res,
        `验证码发送过于频繁，请 ${rateLimitResult.retryAfterSeconds} 秒后再试`,
        429,
        USER_SMS_SEND_RATE_LIMIT_ERROR_CODE,
      );
    }

    const code = generateSmsCode();
    const expiresAt = new Date(now.getTime() + config.aliyunSms.codeExpiresSeconds * 1000);
    const record = await prisma.smsVerificationCode.create({
      data: {
        phone,
        scene,
        codeHash: hashSmsCode({ phone, code, scene }),
        expiresAt,
        sendIp: ip,
        sendStatus: "pending",
      },
    });

    try {
      const sendResult = await sendSmsCode({ phone, code, scene, smsConfig });
      await prisma.smsVerificationCode.update({
        where: { id: record.id },
        data: {
          sendStatus: "sent",
          bizId: sendResult.bizId || null,
          requestId: sendResult.requestId || null,
        },
      });
    } catch (error) {
      await prisma.smsVerificationCode.update({
        where: { id: record.id },
        data: {
          sendStatus: "failed",
          consumedAt: new Date(),
          errorMessage: error instanceof Error ? error.message.slice(0, 255) : "短信发送失败",
          requestId: error?.requestId || null,
          bizId: error?.bizId || null,
        },
      });
      throw error;
    }

    return ok(res, {
      success: true,
      expiresIn: config.aliyunSms.codeExpiresSeconds,
      retryAfter: config.aliyunSms.sendCooldownSeconds,
    }, "验证码已发送");
  } catch (error) {
    if (error instanceof Error && error.message) {
      return fail(res, error.message, 400);
    }

    return next(error);
  }
});

authRouter.post("/user/sms/login", async (req, res, next) => {
  const { deviceKey, type, model } = req.body ?? {};
  const rawPhone = `${req.body?.phone ?? ""}`;
  const rawCode = `${req.body?.code ?? ""}`;

  if (!rawPhone || !rawCode || !deviceKey) {
    return fail(res, "请输入完整的登录信息", 400);
  }

  try {
    const phone = validatePhoneOrThrow(rawPhone);
    const code = validateSmsCodeOrThrow(rawCode);
    const ip = getClientIp(req);
    const scene = getSmsLoginScene();
    const rateLimitResult = consumeUserLoginAttempt({ ip, phone });

    if (!rateLimitResult.ok) {
      return fail(
        res,
        `登录尝试过于频繁，请 ${rateLimitResult.retryAfterSeconds} 秒后再试`,
        429,
        USER_LOGIN_RATE_LIMIT_ERROR_CODE,
      );
    }

    const now = new Date();
    const newUserPasswordHash = await hashPassword(crypto.randomBytes(24).toString("hex"));
    const smsCodeRecord = await prisma.smsVerificationCode.findFirst({
      where: {
        phone,
        scene,
        sendStatus: "sent",
        consumedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!smsCodeRecord) {
      return fail(res, "验证码已失效，请重新获取", 400);
    }

    if (smsCodeRecord.verifyAttempts >= config.aliyunSms.verifyMaxAttempts) {
      await prisma.smsVerificationCode.update({
        where: { id: smsCodeRecord.id },
        data: {
          consumedAt: now,
        },
      });
      return fail(res, "验证码错误次数过多，请重新获取", 400);
    }

    if (!isSmsCodeMatched({ phone, code, codeHash: smsCodeRecord.codeHash, scene })) {
      await prisma.smsVerificationCode.update({
        where: { id: smsCodeRecord.id },
        data: {
          verifyAttempts: {
            increment: 1,
          },
        },
      });
      return fail(res, "验证码错误，请重新输入", 400);
    }

    const loginUser = await prisma.$transaction(async (tx) => {
      const consumedResult = await tx.smsVerificationCode.updateMany({
        where: {
          id: smsCodeRecord.id,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });

      if (consumedResult.count !== 1) {
        throw createHttpError("验证码已失效，请重新获取", 400);
      }

      const existingUser = await tx.user.findUnique({
        where: { phone },
        select: {
          id: true,
          status: true,
        },
      });

      if (existingUser) {
        if (existingUser.status === "disabled") {
          throw createHttpError("当前账号已停用", 403);
        }

        return existingUser;
      }

      return tx.user.create({
        data: {
          phone,
          nickname: "",
          avatarUrl: null,
          avatarObjectKey: null,
          passwordHash: newUserPasswordHash,
          status: "active",
          registeredAt: now,
        },
        select: {
          id: true,
          status: true,
        },
      });
    });

    const loginResult = await completeUserLogin({
      userId: loginUser.id,
      deviceKey,
      req,
      type,
      model,
    });
    resetUserLoginAttempts({ ip, phone });

    return ok(res, loginResult, "登录成功");
  } catch (error) {
    if (error?.statusCode) {
      return fail(res, error.message, error.statusCode, error.code ?? error.statusCode);
    }

    if (error instanceof Error && error.message) {
      return fail(res, error.message, 400);
    }

    return next(error);
  }
});

authRouter.post("/user/register", async (req, res, next) => {
  const rawPhone = `${req.body?.phone ?? ""}`;
  const rawCode = `${req.body?.code ?? ""}`;
  const rawPassword = `${req.body?.password ?? ""}`;
  const rawConfirmPassword = `${req.body?.confirmPassword ?? ""}`;
  const agreeTerms =
    req.body?.agreeTerms === true ||
    req.body?.agreeTerms === "true" ||
    req.body?.agreeTerms === 1 ||
    req.body?.agreeTerms === "1";
  const { deviceKey, type, model } = req.body ?? {};

  if (!rawPhone || !rawCode || !rawPassword || !deviceKey) {
    return fail(res, "请输入完整的注册信息", 400);
  }

  try {
    const phone = validatePhoneOrThrow(rawPhone);
    const code = validateSmsCodeOrThrow(rawCode);
    const password = validatePasswordOrThrow(rawPassword);
    const confirmPassword = validatePasswordOrThrow(rawConfirmPassword, "确认密码");

    if (password !== confirmPassword) {
      return fail(res, "两次输入的密码不一致", 400);
    }

    if (!agreeTerms) {
      return fail(res, "请先阅读并同意用户协议与隐私政策", 400);
    }

    const ip = getClientIp(req);
    const scene = getSmsRegisterScene();
    const rateLimitResult = consumeUserRegisterAttempt({ ip, phone });

    if (!rateLimitResult.ok) {
      return fail(
        res,
        `注册尝试过于频繁，请 ${rateLimitResult.retryAfterSeconds} 秒后再试`,
        429,
        USER_REGISTER_RATE_LIMIT_ERROR_CODE,
      );
    }

    const passwordHash = await hashPassword(password);
    const deviceInfo = getNormalizedDeviceInfo(req, { type, model });
    const now = new Date();
    const smsCodeRecord = await prisma.smsVerificationCode.findFirst({
      where: {
        phone,
        scene,
        sendStatus: "sent",
        consumedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!smsCodeRecord) {
      return fail(res, "验证码已失效，请重新获取", 400);
    }

    if (smsCodeRecord.verifyAttempts >= config.aliyunSms.verifyMaxAttempts) {
      await prisma.smsVerificationCode.update({
        where: { id: smsCodeRecord.id },
        data: {
          consumedAt: now,
        },
      });
      return fail(res, "验证码错误次数过多，请重新获取", 400);
    }

    if (!isSmsCodeMatched({ phone, code, codeHash: smsCodeRecord.codeHash, scene })) {
      await prisma.smsVerificationCode.update({
        where: { id: smsCodeRecord.id },
        data: {
          verifyAttempts: {
            increment: 1,
          },
        },
      });
      return fail(res, "验证码错误，请重新输入", 400);
    }

    const createdUser = await prisma.$transaction(async (tx) => {
      const consumedResult = await tx.smsVerificationCode.updateMany({
        where: {
          id: smsCodeRecord.id,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });

      if (consumedResult.count !== 1) {
        throw createHttpError("验证码已失效，请重新获取", 400);
      }

      const user = await tx.user.create({
        data: {
          phone,
          nickname: "",
          avatarUrl: null,
          avatarObjectKey: null,
          passwordHash,
          status: "active",
          lastLoginAt: now,
        },
      });

      await tx.userDevice.create({
        data: {
          userId: user.id,
          deviceKey,
          type: deviceInfo.type,
          model: deviceInfo.model,
          ip: deviceInfo.ip,
          loginAt: now,
        },
      });

      return tx.user.findUnique({
        where: { id: user.id },
        include: {
          permissions: true,
          devices: true,
          mockExamSeriesPermissions: true,
          mockExamPermissions: true,
          bookQuestionBankPermissions: true,
        },
      });
    });

    if (!createdUser) {
      return fail(res, "注册失败，请稍后重试", 500);
    }

    const token = signUserToken({
      userId: createdUser.id,
      phone: createdUser.phone,
      deviceKey,
    });
    resetUserRegisterAttempts({ ip, phone });

    return ok(
      res,
      {
        success: true,
        token,
        user: serializeUser(createdUser),
      },
      "注册成功",
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return fail(res, "该手机号已注册，请直接登录", 400);
    }

    if (error?.statusCode) {
      return fail(res, error.message, error.statusCode, error.code ?? error.statusCode);
    }

    if (error instanceof Error && error.message) {
      return fail(res, error.message, 400);
    }

    return next(error);
  }
});

authRouter.post("/user/logout", requireUserAuth, async (req, res) => {
  const deviceKey = req.body?.deviceKey || req.auth.deviceKey;

  await prisma.userDevice.deleteMany({
    where: {
      userId: req.auth.userId,
      deviceKey,
    },
  });

  return ok(res, { success: true }, "\u9000\u51fa\u6210\u529f");
});

authRouter.get("/user/me", requireUserAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    include: {
      permissions: true,
      devices: true,
      mockExamSeriesPermissions: true,
      mockExamPermissions: true,
      bookQuestionBankPermissions: true,
    },
  });

  return ok(res, user ? serializeUser(user) : null);
});

authRouter.patch("/user/profile", requireUserAuth, async (req, res) => {
  const nickname = normalizeNickname(`${req.body?.nickname ?? ""}`);

  if (!nickname) {
    return fail(res, "昵称不能为空", 400);
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.auth.userId },
    data: {
      nickname,
    },
    include: {
      permissions: true,
      devices: true,
      mockExamSeriesPermissions: true,
      mockExamPermissions: true,
      bookQuestionBankPermissions: true,
    },
  });

  return ok(res, serializeUser(updatedUser), "资料已更新");
});

authRouter.post("/user/profile/avatar", requireUserAuth, avatarUpload.single("file"), async (req, res) => {
  if (!req.file) {
    return fail(res, "请选择要上传的头像", 400);
  }

  const previousUser = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: {
      avatarObjectKey: true,
    },
  });

  const uploaded = await uploadBuffer({
    fileName: req.file.originalname || "avatar",
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    folder: "user-avatars",
  });

  const updatedUser = await prisma.user.update({
    where: { id: req.auth.userId },
    data: {
      avatarUrl: uploaded.url,
      avatarObjectKey: uploaded.objectKey,
    },
    include: {
      permissions: true,
      devices: true,
      mockExamSeriesPermissions: true,
      mockExamPermissions: true,
      bookQuestionBankPermissions: true,
    },
  });

  const previousAvatarObjectKey = previousUser?.avatarObjectKey;
  if (previousAvatarObjectKey && previousAvatarObjectKey !== uploaded.objectKey) {
    res.once("finish", () => {
      void cleanupObjectIfUnused(previousAvatarObjectKey).catch((error) => {
        console.error(`User avatar cleanup failed for ${previousAvatarObjectKey}:`, error);
      });
    });
  }

  return ok(res, serializeUser(updatedUser), "头像已更新");
});

authRouter.patch("/user/password", requireUserAuth, async (req, res) => {
  const currentPassword = `${req.body?.currentPassword ?? ""}`;
  const nextPassword = `${req.body?.newPassword ?? ""}`;
  const confirmPassword = `${req.body?.confirmPassword ?? ""}`;

  if (!currentPassword || !nextPassword || !confirmPassword) {
    return fail(res, "请填写完整的密码信息", 400);
  }

  let validatedPassword;
  let validatedConfirmPassword;

  try {
    validatedPassword = validatePasswordOrThrow(nextPassword, "新密码");
    validatedConfirmPassword = validatePasswordOrThrow(confirmPassword, "确认密码");
  } catch (error) {
    if (error instanceof Error && error.message) {
      return fail(res, error.message, 400);
    }
    throw error;
  }

  if (validatedPassword !== validatedConfirmPassword) {
    return fail(res, "两次输入的新密码不一致", 400);
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  if (!currentUser) {
    return fail(res, "用户不存在", 404);
  }

  const isMatched = await comparePassword(currentPassword, currentUser.passwordHash);
  if (!isMatched) {
    return fail(res, "原密码不正确", 400);
  }

  if (currentPassword === validatedPassword) {
    return fail(res, "新密码不能与原密码一致", 400);
  }

  await prisma.user.update({
    where: { id: req.auth.userId },
    data: {
      passwordHash: await hashPassword(validatedPassword),
    },
  });

  return ok(res, { success: true }, "密码已修改");
});

authRouter.post("/admin/login", async (req, res) => {
  const account = `${req.body?.account ?? ""}`.trim();
  const password = `${req.body?.password ?? ""}`;
  if (!account || !password) {
    return fail(res, "\u8bf7\u8f93\u5165\u540e\u53f0\u8d26\u53f7\u548c\u5bc6\u7801", 400);
  }

  const ip = getClientIp(req);
  const rateLimitResult = consumeAdminLoginAttempt({ ip, account });
  if (!rateLimitResult.ok) {
    await writeAdminAuditLog(req, {
      action: "admin_login_rate_limited",
      entityType: "admin",
      entityName: account,
      operatorAccount: account,
      detail: { account, retryAfterSeconds: rateLimitResult.retryAfterSeconds },
    });
    return fail(
      res,
      `\u540e\u53f0\u767b\u5f55\u5c1d\u8bd5\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7 ${rateLimitResult.retryAfterSeconds} \u79d2\u540e\u518d\u8bd5`,
      429,
      ADMIN_LOGIN_RATE_LIMIT_ERROR_CODE,
    );
  }

  const admin = await prisma.admin.findUnique({
    where: { account },
  });

  if (!admin) {
    await writeAdminAuditLog(req, {
      action: "admin_login_failed",
      entityType: "admin",
      entityName: account,
      operatorAccount: account,
      detail: { account, reason: "account_not_found" },
    });
    return fail(res, "\u8d26\u53f7\u6216\u5bc6\u7801\u9519\u8bef", 400);
  }

  const isMatched = await comparePassword(password, admin.passwordHash);
  if (!isMatched) {
    await writeAdminAuditLog(req, {
      action: "admin_login_failed",
      entityType: "admin",
      entityId: admin.id,
      entityName: admin.account,
      adminId: admin.id,
      operatorAccount: admin.account,
      operatorName: admin.name,
      detail: { account, reason: "password_mismatch" },
    });
    return fail(res, "\u8d26\u53f7\u6216\u5bc6\u7801\u9519\u8bef", 400);
  }

  const token = signAdminToken({
    adminId: admin.id,
    account: admin.account,
    name: admin.name,
    adminRole: admin.role ?? "super_admin",
  });
  resetAdminLoginAttempts({ ip, account });
  await writeAdminAuditLog(req, {
    action: "admin_login_success",
    entityType: "admin",
    entityId: admin.id,
    entityName: admin.account,
    adminId: admin.id,
    operatorAccount: admin.account,
    operatorName: admin.name,
    detail: { account: admin.account, role: admin.role ?? "super_admin" },
  });

  return ok(res, {
    success: true,
    token,
    admin: {
      id: admin.id,
      account: admin.account,
      name: admin.name,
      role: admin.role ?? "super_admin",
    },
  });
});
