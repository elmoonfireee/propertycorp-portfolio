import { ImoAutomationWorker } from "./lib/imoAutomation.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/imo-auto-sync.mjs --initialize",
    "  node scripts/imo-auto-sync.mjs --status",
    "  node scripts/imo-auto-sync.mjs --retry <oferty_YYYYMMDDHHMMSS.zip>",
    "  node scripts/imo-auto-sync.mjs --watch",
  ].join("\n");
}

function parseArguments(args) {
  if (args.length === 1 && ["--initialize", "--status", "--watch"].includes(args[0])) return { command: args[0] };
  if (args.length === 2 && args[0] === "--retry") return { command: "--retry", filename: args[1] };
  if (args.includes("--help") || args.includes("-h")) return { command: "--help" };
  throw new Error(usage());
}

function conciseStatus(status) {
  return [
    "PropertyCorp IMO sync",
    `status: ${status.status}`,
    `last handled package: ${status.lastHandledPackage || "none"}`,
    `last result: ${status.lastResult || "none"}`,
    `last run: ${status.lastRunId || "none"}`,
    `queue: ${status.queue}`,
    `incoming: ${status.incomingPackageCount} packages, ${status.incomingBytes} bytes`,
    `blocked package: ${status.blockedPackage?.filename || "none"}`,
    `last effective change: ${status.lastEffectiveChange ? `+${status.lastEffectiveChange.added} -${status.lastEffectiveChange.removed} ~${status.lastEffectiveChange.changed}` : "none"}`,
    `log: ${status.auditLogPath}`,
    `free disk: ${status.freeBytes ?? "unavailable"}`,
  ].join("\n");
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "--help") {
    console.log(usage());
  } else {
    const worker = new ImoAutomationWorker({ repoRoot: process.cwd() });
    if (options.command === "--initialize") {
      const result = await worker.initialize();
      console.log(`PropertyCorp IMO sync initialized: ${result.preexistingCount} preexisting package(s).`);
    } else if (options.command === "--status") {
      console.log(conciseStatus(await worker.status()));
    } else if (options.command === "--retry") {
      const result = await worker.retry(options.filename);
      console.log(`PropertyCorp IMO retry: ${result.status}`);
    } else {
      if (!(await worker.status()).initialized) {
        throw new Error("Automation has not been initialized. Run --initialize before --watch.");
      }
      const controller = new AbortController();
      const shutdown = () => controller.abort();
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      console.log("PropertyCorp IMO worker started.");
      await worker.watch({ signal: controller.signal });
      console.log("PropertyCorp IMO worker stopped.");
    }
  }
} catch (error) {
  console.error(`PropertyCorp IMO worker failed: ${error.message}`);
  process.exitCode = 1;
}
