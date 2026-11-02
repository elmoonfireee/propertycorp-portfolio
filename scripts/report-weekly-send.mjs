import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePropertyCorpStatePaths } from "../server/statePaths.mjs";
import {
  buildWeeklyAnalyticsReport,
  createGoogleAnalyticsDataClient,
  getWeeklyAnalyticsConfig,
  getWeeklyReportingPeriods,
  loadServerEnvironment,
  renderWeeklyAnalyticsReport,
} from "./analytics/weeklyReport.mjs";
import { enrichWeeklyAnalyticsReportFromPropertyCorp, normalizeWeeklyReportSiteUrl } from "./analytics/offerEnrichment.mjs";
import { getWeeklyReportEmailSubject, renderWeeklyReportHtml, renderWeeklyReportText } from "./analytics/weeklyReportEmail.mjs";
import {
  archiveWeeklyReport,
  hasWeeklyReportBeenSent,
  markWeeklyReportSent,
  shouldSkipWeeklyReportDelivery,
} from "./analytics/weeklyReportArchive.mjs";
import { getWeeklyReportSmtpConfig, sendWeeklyReportEmail } from "./analytics/weeklyReportEmailTransport.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let deliveryStage = "configuration";

function parseArguments(argumentsList) {
  const options = { date: null, dryRun: false, force: false };
  argumentsList.forEach((argument) => {
    if (argument.startsWith("--date=")) options.date = argument.slice("--date=".length);
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--force") options.force = true;
    else throw new Error("weekly_report_delivery_usage:pnpm run report:weekly:send -- [--date=YYYY-MM-DD] [--dry-run] [--force]");
  });
  return options;
}

function safeErrorMessage(error) {
  let message = error instanceof Error ? error.message : "weekly_report_delivery_unknown_error";
  const secrets = [
    process.env.GOOGLE_ANALYTICS_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_ANALYTICS_OAUTH_REFRESH_TOKEN,
    process.env.WEEKLY_REPORT_SMTP_PASSWORD,
  ].filter(Boolean);
  secrets.forEach((secret) => {
    message = message.replaceAll(secret, "[redacted]");
  });
  return message.replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await loadServerEnvironment({ cwd: projectRoot });
  const archiveDirectory = resolvePropertyCorpStatePaths({ projectRoot }).weeklyReportsDirectory;
  const config = getWeeklyAnalyticsConfig();
  const siteUrl = normalizeWeeklyReportSiteUrl(process.env.WEEKLY_REPORT_SITE_URL);
  const referenceDate = options.date || new Date();
  const period = getWeeklyReportingPeriods(referenceDate);
  const hostnameFilter = config.hostnames.length ? config.hostnames.join(",") : "inactive (not configured)";
  console.error(`[weekly-report] building ${period.current.start}..${period.current.end}`);
  console.error(`[weekly-report] hostname filter: ${hostnameFilter}`);

  deliveryStage = "duplicate guard";
  const alreadySent = await hasWeeklyReportBeenSent({ archiveDirectory, period: period.current });
  if (shouldSkipWeeklyReportDelivery({ alreadySent, force: options.force, dryRun: options.dryRun })) {
    console.error("[weekly-report] delivery already completed for this period; use --force to resend");
    return;
  }

  deliveryStage = "GA4 retrieval";
  const client = createGoogleAnalyticsDataClient(config);
  const rawReport = await buildWeeklyAnalyticsReport({
    runReport: client.runReport,
    referenceDate,
    hostnames: config.hostnames,
  });

  deliveryStage = "offer enrichment";
  const report = await enrichWeeklyAnalyticsReportFromPropertyCorp(rawReport, { siteUrl });
  const markdown = renderWeeklyAnalyticsReport(report);
  const html = renderWeeklyReportHtml(report);
  const text = renderWeeklyReportText(report);

  deliveryStage = "archive";
  await archiveWeeklyReport({ archiveDirectory, report, markdown, html });
  console.error("[weekly-report] archived report");

  if (options.dryRun) {
    console.error("[weekly-report] dry run complete; SMTP was not contacted");
    return;
  }

  deliveryStage = "email delivery";
  const smtpConfig = getWeeklyReportSmtpConfig();
  const delivery = await sendWeeklyReportEmail({
    config: smtpConfig,
    subject: getWeeklyReportEmailSubject(report),
    html,
    text,
  });

  deliveryStage = "delivery state";
  await markWeeklyReportSent({ archiveDirectory, period: period.current });
  console.error(`[weekly-report] email sent to ${delivery.recipientCount} recipient(s)`);
}

try {
  await main();
} catch (error) {
  const message = safeErrorMessage(error);
  console.error(`[weekly-report] ${deliveryStage} failed: ${message}`);
  process.exitCode = 1;
}
