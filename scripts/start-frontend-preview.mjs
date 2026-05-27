import express from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const logFile = path.join(rootDir, "frontend-5174-runtime.log");
const host = process.env.FRONTEND_HOST || "127.0.0.1";
const port = Number(process.env.FRONTEND_PORT || "5174");
const apiTarget = new URL(process.env.FRONTEND_API_TARGET || "http://127.0.0.1:3011");

const log = (message) => {
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
};

process.on("uncaughtException", (error) => {
  log(`uncaughtException ${error?.stack || error}`);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  log(`unhandledRejection ${error?.stack || error}`);
  process.exit(1);
});

const app = express();

log(`starting pid=${process.pid} cwd=${process.cwd()} dist=${distDir}`);

app.use("/api", (req, res) => {
  const targetPath = `${req.originalUrl}`;
  const proxyReq = http.request(
    {
      hostname: apiTarget.hostname,
      port: apiTarget.port || 80,
      path: targetPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: apiTarget.host,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (error) => {
    res.status(502).json({
      code: 1,
      message: `API proxy failed: ${error.message}`,
    });
  });

  req.pipe(proxyReq);
});

app.use(express.static(distDir));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, host, () => {
  const message = `New Debao frontend listening on http://${host}:${port}`;
  console.log(message);
  log(message);
});
