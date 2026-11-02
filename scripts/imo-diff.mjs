import { resolve } from "node:path";
import { runImport, summarizeReport } from "./lib/imoImportPipeline.mjs";

function usage() {
  return "Usage: pnpm run imo:diff -- --source <oferty_YYYYMMDDHHMMSS.zip> --ids <id,id,...>";
}

function parseArguments(args) {
  const options = { sourceDirectory: null, ids: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--source") options.sourceDirectory = args[++index] || null;
    else if (argument === "--ids") options.ids = String(args[++index] || "").split(/[\s,]+/u).map((id) => id.trim()).filter(Boolean);
    else if (argument === "--help" || argument === "-h") { console.log(usage()); process.exit(0); }
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.sourceDirectory || !options.ids.length) throw new Error(`${usage()}\n--source and --ids are required.`);
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  // This command intentionally has no --apply option. runImport defaults to
  // dry-run and only materializes then removes an ignored staging candidate.
  const report = await runImport({
    repoRoot: process.cwd(),
    sourceDirectory: resolve(options.sourceDirectory),
    diagnosticIds: options.ids,
  });
  console.log(summarizeReport(report));
  console.log("\nSelected semantic offer diagnostics:");
  console.log(JSON.stringify(report.offerDiagnostics, null, 2));
} catch (error) {
  console.error(`IMO semantic diff failed at ${error.stage || "arguments"}: ${error.message}`);
  if (error.report?.reportPath) console.error(`Diagnostic report: ${error.report.reportPath}`);
  process.exitCode = 1;
}
