import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWeeklyAnalyticsReport,
  createGoogleAnalyticsDataClient,
  getWeeklyAnalyticsConfig,
  getWeeklyReportingPeriods,
  loadServerEnvironment,
  renderWeeklyAnalyticsReport,
} from "./analytics/weeklyReport.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argumentsByName = process.argv.slice(2);
const dateArgument = argumentsByName.find((argument) => argument.startsWith("--date="));
const outputIndex = argumentsByName.indexOf("--output");
const outputPath = outputIndex >= 0 ? argumentsByName[outputIndex + 1] : null;

if (outputIndex >= 0 && !outputPath) throw new Error("Usage: pnpm run report:weekly -- [--date=YYYY-MM-DD] [--output path]");

try {
  await loadServerEnvironment({ cwd: projectRoot });
  const config = getWeeklyAnalyticsConfig();
  const referenceDate = dateArgument ? dateArgument.slice("--date=".length) : new Date();
  const period = getWeeklyReportingPeriods(referenceDate);
  const filterStatus = config.hostnames.length ? `active (${config.hostnames.join(", ")})` : "inactive";
  console.error(`[weekly-report] ${period.current.start}..${period.current.end}; hostname filter: ${filterStatus}`);

  const client = createGoogleAnalyticsDataClient(config);
  const report = await buildWeeklyAnalyticsReport({
    runReport: client.runReport,
    referenceDate,
    hostnames: config.hostnames,
  });
  const markdown = renderWeeklyAnalyticsReport(report);
  if (outputPath) {
    const destination = resolve(projectRoot, outputPath);
    await writeFile(destination, markdown, "utf8");
    console.error(`[weekly-report] report written: ${destination}`);
  } else {
    process.stdout.write(markdown);
  }
} catch (error) {
  // Errors deliberately contain configuration names/statuses only, never OAuth
  // credentials, refresh tokens, response payloads or authorization headers.
  const message = error instanceof Error ? error.message : "ga4_report_unknown_error";
  console.error(`[weekly-report] failed: ${message}`);
  process.exitCode = 1;
}
