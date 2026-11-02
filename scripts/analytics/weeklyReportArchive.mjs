import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function assertPeriod(period) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period?.start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(period?.end || "")) {
    throw new Error("weekly_report_archive_period_invalid");
  }
}

export function getWeeklyReportArchiveFileNames(period) {
  assertPeriod(period);
  const stem = `${period.start}_${period.end}`;
  return {
    markdown: `${stem}.md`,
    html: `${stem}.html`,
    json: `${stem}.json`,
    sentMarker: `${stem}.sent.json`,
  };
}

export function getWeeklyReportArchivePaths(archiveDirectory, period) {
  const directory = resolve(archiveDirectory);
  const names = getWeeklyReportArchiveFileNames(period);
  return Object.fromEntries(Object.entries(names).map(([key, name]) => [key, resolve(directory, name)]));
}

async function writeFileAtomically(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, path);
}

/** Whitelist report fields so archive JSON cannot accidentally contain config. */
export function createWeeklyReportArchivePayload(report) {
  return {
    generatedAt: report?.generatedAt || null,
    period: report?.period || null,
    filtering: report?.filtering || { hostnames: [] },
    traffic: report?.traffic || {},
    acquisition: report?.acquisition || [],
    daily: report?.daily || [],
    interactions: report?.interactions || {},
    offerTotals: report?.offerTotals || null,
    offers: report?.offers || [],
  };
}

export async function archiveWeeklyReport({ archiveDirectory, report, markdown, html }) {
  const paths = getWeeklyReportArchivePaths(archiveDirectory, report?.period?.current);
  await Promise.all([
    writeFileAtomically(paths.markdown, String(markdown || "")),
    writeFileAtomically(paths.html, String(html || "")),
    writeFileAtomically(paths.json, `${JSON.stringify(createWeeklyReportArchivePayload(report), null, 2)}\n`),
  ]);
  return paths;
}

export async function hasWeeklyReportBeenSent({ archiveDirectory, period }) {
  const { sentMarker } = getWeeklyReportArchivePaths(archiveDirectory, period);
  try {
    await access(sentMarker);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function shouldSkipWeeklyReportDelivery({ alreadySent, force = false, dryRun = false }) {
  return Boolean(alreadySent && !force && !dryRun);
}

export async function markWeeklyReportSent({ archiveDirectory, period, sentAt = new Date().toISOString() }) {
  const { sentMarker } = getWeeklyReportArchivePaths(archiveDirectory, period);
  await writeFileAtomically(sentMarker, `${JSON.stringify({ period, sentAt }, null, 2)}\n`);
  return sentMarker;
}
