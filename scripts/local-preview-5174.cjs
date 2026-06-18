const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "../dist");
const port = 5174;
const apiPort = 3011;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const sendFile = (res, filePath) => {
  res.writeHead(200, {
    "content-type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(res);
};

http
  .createServer((req, res) => {
    if (req.url?.startsWith("/api/")) {
      const proxy = http.request(
        {
          hostname: "127.0.0.1",
          port: apiPort,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${apiPort}`,
          },
        },
        (apiRes) => {
          res.writeHead(apiRes.statusCode || 500, apiRes.headers);
          apiRes.pipe(res);
        },
      );

      proxy.on("error", (error) => {
        res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ code: 502, message: error.message, data: null }));
      });

      req.pipe(proxy);
      return;
    }

    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.join(root, pathname === "/" ? "index.html" : pathname);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(root, "index.html");
    }
    sendFile(res, filePath);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Local preview ready: http://127.0.0.1:${port}`);
  });
