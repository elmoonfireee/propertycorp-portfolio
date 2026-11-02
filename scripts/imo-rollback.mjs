import { rollbackImport, summarizeReport } from "./lib/imoImportPipeline.mjs";

function usage() {
  return "Usage: pnpm run imo:rollback -- [--run <backup-run-id>] [--apply]";
}

function parseArguments(args) {
  const options = { apply: false, runId: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--run") options.runId = args[++index] || null;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--dry-run") options.apply = false;
    else if (argument === "--help" || argument === "-h") { console.log(usage()); process.exit(0); }
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const report = await rollbackImport({ repoRoot: process.cwd(), ...options });
  console.log(summarizeReport(report));
} catch (error) {
  console.error(`IMO rollback failed at ${error.stage || "arguments"}: ${error.message}`);
  if (error.report) console.error(`Promotion applied: ${error.report.applied}; recovery incomplete: ${Boolean(error.report.recovery?.failures?.length)}`);
  if (error.report?.reportPath) console.error(`Diagnostic report: ${error.report.reportPath}`);
  process.exitCode = 1;
}
