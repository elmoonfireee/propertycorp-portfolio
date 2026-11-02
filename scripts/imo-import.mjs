import { resolve } from "node:path";
import { runImport, summarizeReport } from "./lib/imoImportPipeline.mjs";

function usage() {
  return "Usage: pnpm run imo:import -- --source <oferty_YYYYMMDDHHMMSS.zip> [--apply] [--force]";
}

function parseArguments(args) {
  const options = { apply: false, force: false, sourceDirectory: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--source") options.sourceDirectory = args[++index] || null;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--dry-run") options.apply = false;
    else if (argument === "--force") options.force = true;
    else if (argument === "--help" || argument === "-h") { console.log(usage()); process.exit(0); }
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.sourceDirectory) throw new Error(`${usage()}\n--source is required.`);
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const report = await runImport({
    repoRoot: process.cwd(),
    sourceDirectory: resolve(options.sourceDirectory),
    apply: options.apply,
    force: options.force,
  });
  console.log(summarizeReport(report));
} catch (error) {
  console.error(`IMO import failed at ${error.stage || "arguments"}: ${error.message}`);
  if (error.report) console.error(`Promotion applied: ${error.report.applied}; recovery incomplete: ${Boolean(error.report.recovery?.failures?.length)}`);
  if (error.report?.reportPath) console.error(`Diagnostic report: ${error.report.reportPath}`);
  process.exitCode = 1;
}
