import OSS from "ali-oss";
import { randomUUID } from "node:crypto";
import { lookup as lookupMime, extension as mimeExtension } from "mime-types";
import { config, ossConfigured } from "./config.js";
import { normalizeDisplayText } from "./text.js";

const slugify = (value) =>
  value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const ossClient = ossConfigured
  ? new OSS({
      region: config.ossRegion,
      bucket: config.ossBucket,
      secure: config.ossSecure,
      timeout: config.ossTimeoutMs,
      retryMax: config.ossRetryMax,
      accessKeyId: config.ossAccessKeyId,
      accessKeySecret: config.ossAccessKeySecret,
    })
  : null;

const MAX_OBJECT_KEY_LENGTH = 255;
const MAX_SLUG_LENGTH = 120;

const toHttpsUrl = (value = "") => `${value ?? ""}`.trim().replace(/^http:\/\//i, "https://");
const stripTrailingSlash = (value = "") => `${value ?? ""}`.trim().replace(/\/$/, "");
const getConfiguredPublicBaseCandidates = () => {
  const configured = stripTrailingSlash(config.ossPublicBaseUrl);
  if (!configured) return [];
  return [...new Set([configured, toHttpsUrl(configured)])];
};

const buildPublicUrl = (objectKey, fallbackUrl = "") => {
  if (config.ossPublicBaseUrl) {
    return `${toHttpsUrl(stripTrailingSlash(config.ossPublicBaseUrl))}/${objectKey}`;
  }
  return toHttpsUrl(fallbackUrl);
};

const buildOriginObjectUrl = (objectKey = "") => {
  if (!objectKey) return "";
  return `https://${config.ossBucket}.${config.ossRegion}.aliyuncs.com/${objectKey}`;
};

const resolveUploadMeta = ({ fileName = "file", mimeType = "application/octet-stream", folder = "uploads" } = {}) => {
  const normalizedFileName = normalizeDisplayText(fileName) || fileName;
  const ext =
    (mimeType && mimeExtension(mimeType)) ||
    (normalizedFileName.includes(".") ? normalizedFileName.split(".").pop() : "") ||
    (fileName.includes(".") ? fileName.split(".").pop() : "") ||
    "bin";
  const baseName = normalizedFileName.replace(/\.[^.]+$/, "") || "file";
  const slug = slugify(baseName).slice(0, MAX_SLUG_LENGTH) || "file";
  const suffix = `${Date.now()}-${randomUUID()}-${slug}.${ext}`;
  const folderPrefix = `${folder}/`;
  const maxSuffixLength = Math.max(MAX_OBJECT_KEY_LENGTH - folderPrefix.length, 32);
  const objectKey = `${folderPrefix}${suffix.slice(0, maxSuffixLength)}`;
  const contentType = mimeType || lookupMime(normalizedFileName) || lookupMime(fileName) || "application/octet-stream";

  return { objectKey, contentType };
};

const getDefaultBucketHosts = () => [
  `http://${config.ossBucket}.${config.ossRegion}.aliyuncs.com/`,
  `https://${config.ossBucket}.${config.ossRegion}.aliyuncs.com/`,
];

const stripUrlQueryAndHash = (value = "") => value.split("#", 1)[0].split("?", 1)[0];

export const extractObjectKeyFromUrl = (url = "") => {
  if (!url) return "";

  for (const candidate of getConfiguredPublicBaseCandidates()) {
    const base = `${candidate}/`;
    if (url.startsWith(base)) {
      return decodeURIComponent(stripUrlQueryAndHash(url.slice(base.length)));
    }
  }

  for (const host of getDefaultBucketHosts()) {
    if (url.startsWith(host)) {
      return decodeURIComponent(stripUrlQueryAndHash(url.slice(host.length)));
    }
  }

  return "";
};

export const getReadableObjectUrl = ({ objectKey = "", fallbackUrl = "" }) => {
  const resolvedKey = objectKey || extractObjectKeyFromUrl(fallbackUrl);

  if (!resolvedKey) {
    return toHttpsUrl(fallbackUrl);
  }

  if (config.ossPublicBaseUrl) {
    return buildPublicUrl(resolvedKey, fallbackUrl);
  }

  if (ossClient) {
    return toHttpsUrl(
      ossClient.signatureUrl(resolvedKey, {
        expires: 24 * 60 * 60,
      }),
    );
  }

  return toHttpsUrl(fallbackUrl);
};

export const ensureOssConfigured = () => {
  if (!ossClient) {
    throw new Error("请先完成阿里云 OSS 环境变量配置");
  }
};

export const uploadBuffer = async ({ fileName, buffer, mimeType, folder }) => {
  ensureOssConfigured();

  const { objectKey, contentType } = resolveUploadMeta({ fileName, mimeType, folder });

  const result = await ossClient.multipartUpload(objectKey, buffer, {
    timeout: config.ossTimeoutMs,
    parallel: config.ossMultipartParallel,
    mime: contentType,
    headers: {
      "Content-Type": contentType,
    },
  });

  return {
    objectKey,
    url: buildPublicUrl(objectKey, buildOriginObjectUrl(objectKey)),
    readableUrl: getReadableObjectUrl({
      objectKey,
      fallbackUrl: buildPublicUrl(objectKey, buildOriginObjectUrl(objectKey)),
    }),
  };
};

export const uploadFile = async ({ fileName, filePath, mimeType, folder }) => {
  ensureOssConfigured();

  const { objectKey, contentType } = resolveUploadMeta({ fileName, mimeType, folder });

  await ossClient.multipartUpload(objectKey, filePath, {
    timeout: config.ossTimeoutMs,
    parallel: config.ossMultipartParallel,
    mime: contentType,
    headers: {
      "Content-Type": contentType,
    },
  });

  return {
    objectKey,
    url: buildPublicUrl(objectKey, buildOriginObjectUrl(objectKey)),
    readableUrl: getReadableObjectUrl({
      objectKey,
      fallbackUrl: buildPublicUrl(objectKey, buildOriginObjectUrl(objectKey)),
    }),
  };
};

export const uploadFileToObjectKey = async ({ objectKey, filePath, mimeType }) => {
  ensureOssConfigured();

  const normalizedObjectKey = `${objectKey ?? ""}`.trim();
  if (!normalizedObjectKey) throw new Error("上传对象路径不能为空");
  const contentType = mimeType || lookupMime(filePath) || "application/octet-stream";

  await ossClient.multipartUpload(normalizedObjectKey, filePath, {
    timeout: config.ossTimeoutMs,
    parallel: config.ossMultipartParallel,
    mime: contentType,
    headers: {
      "Content-Type": contentType,
    },
  });

  return {
    objectKey: normalizedObjectKey,
    url: buildPublicUrl(normalizedObjectKey, buildOriginObjectUrl(normalizedObjectKey)),
    readableUrl: getReadableObjectUrl({
      objectKey: normalizedObjectKey,
      fallbackUrl: buildPublicUrl(normalizedObjectKey, buildOriginObjectUrl(normalizedObjectKey)),
    }),
  };
};

export const downloadObjectToFile = async ({ objectKey, filePath }) => {
  ensureOssConfigured();

  const normalizedObjectKey = `${objectKey ?? ""}`.trim();
  if (!normalizedObjectKey) throw new Error("下载对象路径不能为空");
  if (!filePath) throw new Error("下载目标路径不能为空");

  await ossClient.get(normalizedObjectKey, filePath);
  return filePath;
};

export const deleteObject = async (objectKey = "") => {
  ensureOssConfigured();

  const normalized = `${objectKey ?? ""}`.trim();
  if (!normalized) return false;

  await ossClient.delete(normalized);
  return true;
};

export const deleteObjectPrefix = async (prefix = "") => {
  ensureOssConfigured();

  const normalizedPrefix = `${prefix ?? ""}`.trim();
  if (!normalizedPrefix) return false;

  let marker = undefined;
  do {
    const result = await ossClient.list(
      {
        prefix: normalizedPrefix,
        marker,
        "max-keys": 1000,
      },
      {},
    );
    const objects = result.objects ?? [];
    if (objects.length > 0) {
      await ossClient.deleteMulti(objects.map((object) => object.name), { quiet: true });
    }
    marker = result.nextMarker;
  } while (marker);

  return true;
};
