import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolvePropertyCorpStatePaths } from "../server/statePaths.mjs";
import { aggregateOfferTotals } from "./analytics/weeklyReport.mjs";
import {
  createOfferEnrichmentIndex,
  enrichOfferPerformance,
  enrichWeeklyAnalyticsReport,
  normalizeWeeklyReportSiteUrl,
} from "./analytics/offerEnrichment.mjs";
import {
  formatAcquisitionChannelLabel,
  formatAcquisitionSourceLabel,
  formatOfferTitle,
  formatOfferViewCount,
  formatOfferViewWord,
  formatWeeklyComparison,
  getWeeklyReportEmailSubject,
  renderWeeklyReportHtml,
  renderWeeklyReportText,
} from "./analytics/weeklyReportEmail.mjs";
import {
  archiveWeeklyReport,
  getWeeklyReportArchiveFileNames,
  hasWeeklyReportBeenSent,
  markWeeklyReportSent,
  shouldSkipWeeklyReportDelivery,
} from "./analytics/weeklyReportArchive.mjs";
import {
  getWeeklyReportSmtpConfig,
  parseWeeklyReportRecipients,
  sendWeeklyReportEmail,
} from "./analytics/weeklyReportEmailTransport.mjs";

const normalizedOffer = {
  id: "17",
  externalId: "17",
  slug: "mieszkanie-na-jagnodzie",
  title: "Mieszkanie blisko parku",
  transaction: "sale",
  type: "apartment",
  price: { amount: 470000, currency: "PLN" },
  area: 30.1,
  rooms: 1,
  location: { locality: "Jagodno", municipality: "Wrocław" },
};

const offerPerformance = [
  { offerId: "17", views: 7, galleryOpens: 2, fullDescriptionOpens: 1, mapOpens: 0, phoneClicks: 1, emailClicks: 0 },
  { offerId: "999", views: 1, galleryOpens: 0, fullDescriptionOpens: 0, mapOpens: 0, phoneClicks: 0, emailClicks: 0 },
];

assert.equal(normalizeWeeklyReportSiteUrl("https://reports-preview.example.test"), "https://reports-preview.example.test");
assert.equal(normalizeWeeklyReportSiteUrl("https://reports-preview.example.test/"), "https://reports-preview.example.test");
assert.throws(() => normalizeWeeklyReportSiteUrl("not a URL"), /weekly_report_site_url_invalid/);
assert.throws(() => normalizeWeeklyReportSiteUrl(""), /weekly_report_site_url_missing/);

const localStatePaths = resolvePropertyCorpStatePaths({ projectRoot: "/project" });
assert.equal(localStatePaths.weeklyReportsDirectory, resolve("/project", "var", "reports", "weekly"));
const persistentStatePaths = resolvePropertyCorpStatePaths({ projectRoot: "/separate-project", stateRoot: "/persistent/propertycorp-state" });
assert.equal(persistentStatePaths.weeklyReportsDirectory, resolve("/persistent/propertycorp-state", "var", "reports", "weekly"));

const reportSiteUrl = "https://reports-preview.example.test/";
const enrichedOffers = enrichOfferPerformance(offerPerformance, createOfferEnrichmentIndex([normalizedOffer]), { siteUrl: reportSiteUrl });
assert.deepEqual(enrichedOffers[0], {
  ...offerPerformance[0],
  offerId: "17",
  knownOffer: true,
  title: "Mieszkanie blisko parku",
  location: "Jagodno · Wrocław",
  transactionType: "Sprzedaż",
  offerType: "Mieszkanie",
  price: 470000,
  area: 30.1,
  rooms: 1,
  url: "https://reports-preview.example.test/oferty/mieszkanie-na-jagnodzie--17",
});
assert.deepEqual(enrichedOffers[1], {
  ...offerPerformance[1],
  offerId: "999",
  knownOffer: false,
  title: null,
  location: null,
  transactionType: null,
  offerType: null,
  price: null,
  area: null,
  rooms: null,
  url: null,
}, "unknown IDs are retained without invented offer data");
assert.equal(
  enrichOfferPerformance([offerPerformance[0]], createOfferEnrichmentIndex([normalizedOffer]), { siteUrl: "https://reports-preview.example.test" })[0].url,
  "https://reports-preview.example.test/oferty/mieszkanie-na-jagnodzie--17",
  "a base URL without a trailing slash generates the same canonical offer URL",
);

assert.deepEqual([
  "Direct",
  "Referral",
  "Organic Search",
  "Paid Search",
  "Organic Social",
  "Paid Social",
  "Email",
  "Display",
  "Unassigned",
].map(formatAcquisitionChannelLabel), [
  "Wejścia bezpośrednie",
  "Odesłania z innych stron",
  "Bezpłatne wyniki wyszukiwania",
  "Płatne wyniki wyszukiwania",
  "Social media",
  "Płatne social media",
  "E-mail",
  "Reklamy display",
  "Nieprzypisane",
]);
assert.equal(formatAcquisitionChannelLabel("(not set)"), "Brak danych");
assert.equal(formatAcquisitionSourceLabel("(direct)", "(none)"), "Bezpośrednio");
assert.equal(formatAcquisitionSourceLabel("(not set)", "(not set)"), "Brak danych");
assert.equal(formatOfferTitle("Nowoczesne|2pokoje z ogródkiem|Klima|Garaż"), "Nowoczesne | 2pokoje z ogródkiem | Klima | Garaż");
assert.equal(formatOfferViewWord(1), "wyświetlenie");
assert.equal(formatOfferViewWord(2), "wyświetlenia");
assert.equal(formatOfferViewWord(5), "wyświetleń");
assert.equal(formatOfferViewCount(1), "1 wyświetlenie");

assert.deepEqual(aggregateOfferTotals([
  { dimensions: { eventName: "view_offer", "customEvent:offer_id": "17" }, metrics: { eventCount: 7 } },
  { dimensions: { eventName: "view_offer", "customEvent:offer_id": "(not set)" }, metrics: { eventCount: 3 } },
]), { totalOfferViews: 10, assignedOfferViews: 7, unassignedOfferViews: 3 });

const report = enrichWeeklyAnalyticsReport({
  secret: "smtp-password-secret",
  generatedAt: "2026-09-17T12:00:00.000Z",
  period: {
    timezone: "Europe/Warsaw",
    current: { start: "2026-09-07", end: "2026-09-13" },
    previous: { start: "2026-08-31", end: "2026-09-06" },
  },
  filtering: { hostnames: ["demo.example.test", "demo.example.test"] },
  traffic: {
    activeUsers: { current: 12, previous: 0, absoluteDelta: 12, percentDelta: null },
    sessions: { current: 14, previous: 10, absoluteDelta: 4, percentDelta: 40 },
    screenPageViews: { current: 22, previous: 25, absoluteDelta: -3, percentDelta: -12 },
    eventCount: { current: 35, previous: 35, absoluteDelta: 0, percentDelta: 0 },
  },
  acquisition: [{ channel: "Organic Search", source: "google", medium: "organic", activeUsers: 8, sessions: 9, screenPageViews: 12 }],
  daily: [
    { date: "2026-09-07", activeUsers: 2, sessions: 3, screenPageViews: 4 },
    { date: "2026-09-08", activeUsers: 0, sessions: 0, screenPageViews: 0 },
  ],
  interactions: {
    view_offer: 10,
    view_offer_gallery: 2,
    view_full_description: 1,
    view_offer_map: 0,
    open_full_offers_map: 1,
    filter_offers: 4,
    click_agent_phone: 1,
    click_agent_email: 0,
    click_instagram: 2,
  },
  offerTotals: { totalOfferViews: 10, assignedOfferViews: 7, unassignedOfferViews: 3 },
  offers: offerPerformance,
}, { offers: [normalizedOffer], siteUrl: reportSiteUrl });

assert.equal(getWeeklyReportEmailSubject(report), "PropertyCorp — raport tygodniowy 07.09–13.09.2026");
assert.equal(formatWeeklyComparison({ current: 4, previous: 0, percentDelta: null }), "brak porównywalnej bazy");
assert.equal(formatWeeklyComparison({ current: 0, previous: 0, percentDelta: null }), "bez zmiany");
assert.equal(formatWeeklyComparison({ current: 7, previous: 10, percentDelta: -30 }), "-30%");

const html = renderWeeklyReportHtml(report);
const text = renderWeeklyReportText(report);
assert.match(html, /PROPERTYCORP/);
assert.match(html, /Nieprzypisane do konkretnej oferty: 3/);
assert.match(html, /Mieszkanie blisko parku/);
assert.match(html, /Galeria: 2/);
assert.match(html, /Oferta nr 999/);
assert.match(html, /Bezpłatne wyniki wyszukiwania/);
assert.match(text, /Bezpłatne wyniki wyszukiwania: 9 sesje/);
assert.equal(report.acquisition[0].channel, "Organic Search", "client labels do not mutate the normalized report model");
assert.doesNotMatch(html, /smtp-password-secret|Infinity|NaN/);
assert.match(text, /NAJPOPULARNIEJSZE OFERTY/);
assert.match(text, /Wyświetlenia ofert: 10; przypisane: 7; nieprzypisane: 3/);
assert.match(text, /Telefon: 1/);
assert.match(text, /1 wyświetlenie/);
const pipeTitleHtml = renderWeeklyReportHtml({ ...report, offers: [{ ...report.offers[0], title: "Nowoczesne|2pokoje z ogródkiem|Klima|Garaż" }] });
assert.match(pipeTitleHtml, /Nowoczesne \| 2pokoje z ogródkiem \| Klima \| Garaż/);
assert.doesNotMatch(text, /<table|smtp-password-secret|Infinity|NaN/);

assert.deepEqual(parseWeeklyReportRecipients(" first@example.com,second@example.com, FIRST@example.com "), ["first@example.com", "second@example.com"]);
assert.throws(() => parseWeeklyReportRecipients("not-an-address"), /weekly_report_smtp_recipient_invalid/);
assert.deepEqual(getWeeklyReportSmtpConfig({
  WEEKLY_REPORT_SMTP_HOST: "smtp.example.com",
  WEEKLY_REPORT_SMTP_PORT: "465",
  WEEKLY_REPORT_SMTP_SECURE: "true",
  WEEKLY_REPORT_SMTP_USER: "mailer",
  WEEKLY_REPORT_SMTP_PASSWORD: "smtp-password-secret",
  WEEKLY_REPORT_FROM: "reports@example.com",
  WEEKLY_REPORT_TO: "first@example.com, second@example.com",
}), {
  host: "smtp.example.com",
  port: 465,
  secure: true,
  user: "mailer",
  password: "smtp-password-secret",
  from: "reports@example.com",
  recipients: ["first@example.com", "second@example.com"],
});

let mailOptions = null;
let sentMessage = null;
const delivery = await sendWeeklyReportEmail({
  config: {
    host: "smtp.example.com", port: 465, secure: true, user: "mailer", password: "smtp-password-secret",
    from: "reports@example.com", recipients: ["first@example.com", "second@example.com"],
  },
  subject: getWeeklyReportEmailSubject(report),
  html,
  text,
  createTransport: async (options) => {
    mailOptions = options;
    return { sendMail: async (message) => { sentMessage = message; } };
  },
});
assert.equal(delivery.recipientCount, 2);
assert.equal(mailOptions.auth.pass, "smtp-password-secret");
assert.equal(sentMessage.subject, getWeeklyReportEmailSubject(report));
assert.equal(sentMessage.to.length, 2, "SMTP mock receives one multipart send call");

assert.deepEqual(getWeeklyReportArchiveFileNames({ start: "2026-09-07", end: "2026-09-13" }), {
  markdown: "2026-09-07_2026-09-13.md",
  html: "2026-09-07_2026-09-13.html",
  json: "2026-09-07_2026-09-13.json",
  sentMarker: "2026-09-07_2026-09-13.sent.json",
});
assert.equal(shouldSkipWeeklyReportDelivery({ alreadySent: true }), true);
assert.equal(shouldSkipWeeklyReportDelivery({ alreadySent: true, force: true }), false);
assert.equal(shouldSkipWeeklyReportDelivery({ alreadySent: true, dryRun: true }), false);

const archiveDirectory = await mkdtemp(join(tmpdir(), "propertycorp-weekly-report-"));
try {
  const paths = await archiveWeeklyReport({ archiveDirectory, report, markdown: "# Diagnostic report\n", html });
  assert.match(await readFile(paths.markdown, "utf8"), /Diagnostic report/);
  assert.doesNotMatch(await readFile(paths.json, "utf8"), /smtp-password-secret/);
  assert.equal(await hasWeeklyReportBeenSent({ archiveDirectory, period: report.period.current }), false);
  await markWeeklyReportSent({ archiveDirectory, period: report.period.current, sentAt: "2026-09-17T12:34:56.000Z" });
  assert.equal(await hasWeeklyReportBeenSent({ archiveDirectory, period: report.period.current }), true);
} finally {
  await rm(archiveDirectory, { recursive: true, force: true });
}

console.log("PC-11 weekly report delivery: enrichment, renderers, SMTP mock, archive and duplicate guard passed.");
