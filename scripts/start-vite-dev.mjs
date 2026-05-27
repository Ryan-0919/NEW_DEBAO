import { createServer } from "vite";

const host = process.env.VITE_DEV_HOST || "127.0.0.1";
const port = Number(process.env.VITE_DEV_PORT || "5174");

const server = await createServer({
  server: {
    host,
    port,
  },
});

await server.listen();
server.printUrls();

setInterval(() => {}, 2147483647);
