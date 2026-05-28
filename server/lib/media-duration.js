import { spawn } from "node:child_process";

const parseDuration = (value = "") => {
  const parsed = Number.parseFloat(`${value}`.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

export const getMediaDurationFromFile = async ({ filePath, ffprobePath = "ffprobe" }) => {
  if (!filePath) return 0;

  return new Promise((resolve) => {
    const child = spawn(
      ffprobePath,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { stdio: ["ignore", "pipe", "ignore"] },
    );

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 1000) stdout = stdout.slice(-1000);
    });

    child.on("error", () => resolve(0));
    child.on("close", (code) => {
      resolve(code === 0 ? parseDuration(stdout) : 0);
    });
  });
};
