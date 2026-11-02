import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const [command, edition, ...extraArgs] = process.argv.slice(2);
const supportedCommands = new Set(["dev", "build", "preview"]);
const supportedEditions = new Set(["client", "portfolio"]);

if (!supportedCommands.has(command) || !supportedEditions.has(edition)) {
  throw new Error("Usage: node scripts/run-vite-edition.mjs <dev|build|preview> <client|portfolio>");
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const viteEntry = resolve(projectRoot, "node_modules", "vite", "bin", "vite.js");
const hostArgs = command === "build" ? [] : ["--host", "127.0.0.1"];
const child = spawn(process.execPath, [viteEntry, command, ...hostArgs, ...extraArgs], {
  cwd: projectRoot,
  env: { ...process.env, VITE_SITE_EDITION: edition },
  stdio: "inherit",
});

child.on("error", (error) => {
  throw error;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
