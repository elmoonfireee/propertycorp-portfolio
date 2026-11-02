import { createServer } from "node:http";
import { createPropertyCorpRuntime } from "./httpRuntime.mjs";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");

const server = createServer(createPropertyCorpRuntime());
server.listen(port, host, () => console.log(`PropertyCorp runtime listening on ${host}:${port}`));

function shutdown(signal) {
  console.log(`PropertyCorp runtime received ${signal}; stopping.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
