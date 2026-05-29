import fs from "node:fs";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { lookup as lookupMime } from "mime-types";
import { config } from "./config.js";
import { getMediaDurationFromFile } from "./media-duration.js";
import { prisma } from "./prisma.js";
import { deleteObject, deleteObjectPrefix, downloadObjectToFile, uploadFile, uploadFileToObjectKey } from "./upload.js";

const MEDIA_SOURCE_BASENAME = "source";
const AUDIO_OUTPUT_FILE = "processed.mp3";
const VIDEO_OUTPUT_FILE = "processed.mp4";
const VIDEO_HLS_OUTPUT_DIR = "hls";
const VIDEO_HLS_PLAYLIST_FILE = "index.m3u8";

const MEDIA_OBJECT_FOLDERS = {
  audio: "audios/library",
  video: "videos/library",
};

const PROCESSING_LABELS = {
  audio: "音频",
  video: "视频",
};

const getProcessingRoot = () => resolve(process.cwd(), config.audioProcessingDir || join("storage", "media-processing"));
const getWorkDir = (type, itemId) => join(getProcessingRoot(), type, `${itemId}`);

const queues = {
  audio: [],
  video: [],
};

const queuedIds = {
  audio: new Set(),
  video: new Set(),
};

const activeCounts = {
  audio: 0,
  video: 0,
};

const printedMissingFfmpegWarning = {
  audio: false,
  video: false,
};

const cleanupFile = async (filePath = "") => {
  if (!filePath) return;
  await rm(filePath, { force: true }).catch(() => {});
};

const cleanupDir = async (dirPath = "") => {
  if (!dirPath) return;
  await rm(dirPath, { recursive: true, force: true }).catch(() => {});
};

const moveFile = async (sourcePath, targetPath) => {
  await mkdir(dirname(targetPath), { recursive: true });

  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    await copyFile(sourcePath, targetPath);
    await cleanupFile(sourcePath);
  }
};

const normalizeErrorMessage = (error, fallback = "媒体后台处理失败") => {
  const message = error instanceof Error ? error.message : `${error ?? ""}`.trim();
  return (message || fallback).slice(0, 500);
};

const findSourceFilePath = async (type, itemId) => {
  const workDir = getWorkDir(type, itemId);
  const entries = await readdir(workDir, { withFileTypes: true }).catch(() => []);
  const sourceEntry = entries.find((entry) => entry.isFile() && entry.name.startsWith(MEDIA_SOURCE_BASENAME));
  return sourceEntry ? join(workDir, sourceEntry.name) : "";
};

const isMissingCommandError = (error) => Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");

const runFfmpeg = ({ inputPath, outputPath, type }) =>
  new Promise((resolvePromise, rejectPromise) => {
    const command = config.ffmpegPath || "ffmpeg";
    const args =
      type === "video"
        ? [
            "-y",
            "-i",
            inputPath,
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            outputPath,
          ]
        : ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-ar", "44100", "-ac", "2", "-b:a", "128k", outputPath];

    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12_000) stderr = stderr.slice(-12_000);
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const lastLine = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1);

      rejectPromise(new Error(lastLine ? `FFmpeg 处理失败：${lastLine}` : "FFmpeg 处理失败"));
    });
  });

const runFfmpegHls = ({ inputPath, outputDir }) =>
  new Promise((resolvePromise, rejectPromise) => {
    const command = config.ffmpegPath || "ffmpeg";
    const playlistPath = join(outputDir, VIDEO_HLS_PLAYLIST_FILE);
    const segmentPath = join(outputDir, "segment-%05d.ts");
    const args = [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-hls_time",
      "8",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      segmentPath,
      "-f",
      "hls",
      playlistPath,
    ];

    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12_000) stderr = stderr.slice(-12_000);
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const lastLine = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1);

      rejectPromise(new Error(lastLine ? `FFmpeg HLS 处理失败：${lastLine}` : "FFmpeg HLS 处理失败"));
    });
  });

const listFilesRecursive = async (dirPath) => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }

  return files;
};

const getHlsMimeType = (filePath) => {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".m3u8") return "application/vnd.apple.mpegurl";
  if (extension === ".ts") return "video/mp2t";
  return lookupMime(filePath) || "application/octet-stream";
};

const uploadHlsDirectory = async ({ type, itemId, outputDir }) => {
  const files = await listFilesRecursive(outputDir);
  const playlistPath = join(outputDir, VIDEO_HLS_PLAYLIST_FILE);
  if (!files.includes(playlistPath)) throw new Error("HLS 播放列表生成失败");

  const baseObjectPrefix = `${MEDIA_OBJECT_FOLDERS[type]}/hls/${itemId}`;
  let playlistUpload = null;

  for (const filePath of files) {
    const relativePath = relative(outputDir, filePath).replace(/\\/g, "/");
    const uploaded = await uploadFileToObjectKey({
      objectKey: `${baseObjectPrefix}/${relativePath}`,
      filePath,
      mimeType: getHlsMimeType(filePath),
    });
    if (relativePath === VIDEO_HLS_PLAYLIST_FILE) playlistUpload = uploaded;
  }

  if (!playlistUpload) throw new Error("HLS 播放列表上传失败");
  return playlistUpload;
};

const buildProcessedPayload = async ({ type, item, sourcePath }) => {
  const outputFile = type === "video" ? VIDEO_OUTPUT_FILE : AUDIO_OUTPUT_FILE;
  const outputPath = join(getWorkDir(type, item.id), outputFile);
  const shouldTranscode = type === "video" || config.audioTranscodeEnabled;

  if (type === "video") {
    const outputDir = join(getWorkDir(type, item.id), VIDEO_HLS_OUTPUT_DIR);
    await mkdir(outputDir, { recursive: true });
    await runFfmpegHls({ inputPath: sourcePath, outputDir });
    return {
      directoryPath: outputDir,
      mimeType: "application/vnd.apple.mpegurl",
      fileName: `${item.name || type}.m3u8`,
      hls: true,
    };
  }

  if (shouldTranscode) {
    try {
      await runFfmpeg({ inputPath: sourcePath, outputPath, type });
      return {
        filePath: outputPath,
        mimeType: type === "video" ? "video/mp4" : "audio/mpeg",
        fileName: `${item.name || type}.${type === "video" ? "mp4" : "mp3"}`,
      };
    } catch (error) {
      if (!isMissingCommandError(error) || type === "video") throw error;

      if (!printedMissingFfmpegWarning.audio) {
        printedMissingFfmpegWarning.audio = true;
        console.warn("FFmpeg not found. Audio uploads will skip transcoding and keep the original format.");
      }
    }
  }

  const sourceExtension = extname(sourcePath).toLowerCase() || ".bin";
  const sourceMimeType = `${item.mimeType || lookupMime(sourcePath) || "application/octet-stream"}`;

  return {
    filePath: sourcePath,
    mimeType: sourceMimeType,
    fileName: `${item.name || type}${sourceExtension}`,
  };
};

const processQueuedMedia = async (type, itemId) => {
  const model = type === "video" ? prisma.video : prisma.audio;
  const item = await model.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      mimeType: true,
      objectKey: true,
    },
  });

  if (!item) {
    await cleanupMediaProcessingSource(type, itemId);
    return;
  }

  const sourcePath = await findSourceFilePath(type, itemId);
  if (!sourcePath) {
    await model.updateMany({
      where: { id: itemId },
      data: {
        processStatus: "failed",
        processMessage: "源文件丢失，请重新上传",
      },
    });
    return;
  }

  await model.updateMany({
    where: { id: itemId },
    data: {
      processStatus: "processing",
      processMessage: "正在后台处理",
    },
  });

  let uploaded = null;

  try {
    const uploadPayload = await buildProcessedPayload({ type, item, sourcePath });
    const duration = await getMediaDurationFromFile({ filePath: sourcePath, ffprobePath: config.ffprobePath || "ffprobe" });

    uploaded = uploadPayload.hls
      ? await uploadHlsDirectory({
          type,
          itemId: item.id,
          outputDir: uploadPayload.directoryPath,
        })
      : await uploadFile({
          fileName: uploadPayload.fileName,
          filePath: uploadPayload.filePath,
          mimeType: uploadPayload.mimeType,
          folder: MEDIA_OBJECT_FOLDERS[type],
        });

    await model.update({
      where: { id: itemId },
      data: {
        duration,
        mimeType: uploadPayload.mimeType,
        objectKey: uploaded.objectKey,
        objectUrl: uploaded.url,
        processStatus: "ready",
        processMessage: "",
      },
    });

    if (item.objectKey && item.objectKey !== uploaded.objectKey) {
      const cleanup = type === "video" && item.objectKey.endsWith(`/${VIDEO_HLS_PLAYLIST_FILE}`)
        ? deleteObjectPrefix(item.objectKey.slice(0, -VIDEO_HLS_PLAYLIST_FILE.length))
        : deleteObject(item.objectKey);
      await cleanup.catch((error) => {
        console.error(`Cleanup old ${type} object failed:`, error);
      });
    }

    await cleanupMediaProcessingSource(type, itemId);
  } catch (error) {
    if (uploaded?.objectKey) {
      const cleanup = type === "video" && uploaded.objectKey.endsWith(`/${VIDEO_HLS_PLAYLIST_FILE}`)
        ? deleteObjectPrefix(uploaded.objectKey.slice(0, -VIDEO_HLS_PLAYLIST_FILE.length))
        : deleteObject(uploaded.objectKey);
      await cleanup.catch((cleanupError) => {
        console.error(`Cleanup uploaded ${type} object failed:`, cleanupError);
      });
    }

    await model.updateMany({
      where: { id: itemId },
      data: {
        processStatus: "failed",
        processMessage: normalizeErrorMessage(error, `${PROCESSING_LABELS[type]}后台处理失败`),
      },
    });

    await cleanupMediaProcessingSource(type, itemId);

    console.error(`${type} processing failed:`, {
      itemId,
      message: error instanceof Error ? error.message : `${error ?? ""}`,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};

const drainMediaQueue = (type) => {
  const concurrency = config.audioProcessConcurrency;
  while (activeCounts[type] < concurrency && queues[type].length > 0) {
    const itemId = queues[type].shift();
    if (!itemId) continue;

    activeCounts[type] += 1;

    void processQueuedMedia(type, itemId).finally(() => {
      queuedIds[type].delete(itemId);
      activeCounts[type] = Math.max(activeCounts[type] - 1, 0);
      drainMediaQueue(type);
    });
  }
};

export const getMediaUploadTempRoot = () => {
  const targetPath = join(getProcessingRoot(), "_incoming");
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
};

export const cleanupStagedMediaUploadFile = async (filePath = "") => {
  await cleanupFile(filePath);
};

export const promoteMediaUploadSource = async ({ type, itemId, tempPath, originalName = "" }) => {
  const extension = extname(originalName).toLowerCase() || extname(tempPath).toLowerCase() || ".bin";
  const workDir = getWorkDir(type, itemId);
  const targetPath = join(workDir, `${MEDIA_SOURCE_BASENAME}${extension}`);

  await cleanupDir(workDir);
  await moveFile(tempPath, targetPath);

  return targetPath;
};

export const restageMediaSourceFromObject = async ({ type, itemId, objectKey = "", originalName = "" }) => {
  const normalizedObjectKey = `${objectKey ?? ""}`.trim();
  if (!normalizedObjectKey) throw new Error("当前素材没有可重新处理的文件");
  if (normalizedObjectKey.endsWith(`/${VIDEO_HLS_PLAYLIST_FILE}`)) throw new Error("该视频已经是 HLS 分片格式");

  const extension = extname(originalName).toLowerCase() || extname(normalizedObjectKey).toLowerCase() || ".bin";
  const workDir = getWorkDir(type, itemId);
  const targetPath = join(workDir, `${MEDIA_SOURCE_BASENAME}${extension}`);

  await cleanupDir(workDir);
  await mkdir(workDir, { recursive: true });
  await downloadObjectToFile({
    objectKey: normalizedObjectKey,
    filePath: targetPath,
  });

  return targetPath;
};

export const cleanupMediaProcessingSource = async (type, itemId) => {
  await cleanupDir(getWorkDir(type, itemId));
};

export const enqueueMediaProcessing = (type, itemId) => {
  const normalizedType = type === "video" ? "video" : "audio";
  const normalizedItemId = `${itemId ?? ""}`.trim();
  if (!normalizedItemId || queuedIds[normalizedType].has(normalizedItemId)) return;

  queuedIds[normalizedType].add(normalizedItemId);
  queues[normalizedType].push(normalizedItemId);
  drainMediaQueue(normalizedType);
};

export const resumePendingMediaProcessingJobs = async () => {
  const [pendingAudios, pendingVideos] = await Promise.all([
    prisma.audio.findMany({
      where: {
        processStatus: {
          in: ["pending", "processing"],
        },
      },
      select: { id: true },
    }),
    prisma.video.findMany({
      where: {
        processStatus: {
          in: ["pending", "processing"],
        },
      },
      select: { id: true },
    }),
  ]);

  pendingAudios.forEach((audio) => enqueueMediaProcessing("audio", audio.id));
  pendingVideos.forEach((video) => enqueueMediaProcessing("video", video.id));
};
