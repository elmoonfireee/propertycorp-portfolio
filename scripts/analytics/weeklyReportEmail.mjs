import { INTERACTION_EVENTS, INTERACTION_LABELS, formatDateRange } from "./weeklyReport.mjs";

const COLORS = Object.freeze({
  navy: "#132947",
  navyMuted: "#40526A",
  beige: "#F5F0E7",
  beigeDark: "#E7DCCD",
  gold: "#A57A3C",
  white: "#FFFFFF",
  line: "#DDD4C6",
  ink: "#202A34",
  muted: "#637080",
  positive: "#2B6A4B",
  negative: "#A1463B",
});

const ACQUISITION_CHANNEL_LABELS = Object.freeze({
  Direct: "Wejścia bezpośrednie",
  Referral: "Odesłania z innych stron",
  "Organic Search": "Bezpłatne wyniki wyszukiwania",
  "Paid Search": "Płatne wyniki wyszukiwania",
  "Organic Social": "Social media",
  "Paid Social": "Płatne social media",
  Email: "E-mail",
  Display: "Reklamy display",
  Unassigned: "Nieprzypisane",
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(finiteNumber(value));
}

function isGa4NotSet(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "(not set)";
}

/** Keeps GA4's raw acquisition values in the model, translating only output. */
export function formatAcquisitionChannelLabel(value) {
  if (isGa4NotSet(value)) return "Brak danych";
  return ACQUISITION_CHANNEL_LABELS[String(value).trim()] || String(value).trim();
}

export function formatAcquisitionSourceLabel(source, medium) {
  const normalizedSource = String(source || "").trim();
  const normalizedMedium = String(medium || "").trim();
  const directSource = /^(?:\(direct\)|direct)$/i.test(normalizedSource);
  const directMedium = /^(?:\(none\)|none)$/i.test(normalizedMedium);
  if (directSource && directMedium) return "Bezpośrednio";

  const sourceLabel = isGa4NotSet(normalizedSource) ? "Brak danych" : normalizedSource;
  const mediumLabel = isGa4NotSet(normalizedMedium) ? "Brak danych" : normalizedMedium;
  return sourceLabel === mediumLabel ? sourceLabel : `${sourceLabel} / ${mediumLabel}`;
}

/** Applies only a visual spacing correction to source offer titles. */
export function formatOfferTitle(value) {
  return String(value || "").replace(/\s*\|\s*/g, " | ").trim();
}

export function formatOfferViewWord(value) {
  const count = Math.abs(finiteNumber(value));
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (count === 1) return "wyświetlenie";
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)) return "wyświetlenia";
  return "wyświetleń";
}

export function formatOfferViewCount(value) {
  return `${formatNumber(value)} ${formatOfferViewWord(value)}`;
}

function formatDate(date) {
  const [year, month, day] = String(date || "").split("-");
  return year && month && day ? `${day}.${month}.${year}` : "—";
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatWeeklyComparison(metric = {}) {
  const current = finiteNumber(metric.current);
  const previous = finiteNumber(metric.previous);
  if (previous === 0 && current > 0) return "brak porównywalnej bazy";
  if (previous === 0 && current === 0) return "bez zmiany";
  return formatPercent(metric.percentDelta);
}

function comparisonColor(metric) {
  const comparison = formatWeeklyComparison(metric);
  if (comparison.startsWith("+")) return COLORS.positive;
  if (comparison.startsWith("-")) return COLORS.negative;
  return COLORS.muted;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function offerTotals(report) {
  if (report?.offerTotals) return report.offerTotals;
  const assignedOfferViews = (report?.offers || []).reduce((total, offer) => total + finiteNumber(offer.views), 0);
  return { totalOfferViews: assignedOfferViews, assignedOfferViews, unassignedOfferViews: 0 };
}

function formatOfferFacts(offer) {
  const facts = [];
  if (offer.area != null && offer.area !== "") facts.push(`${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(Number(offer.area))} m²`);
  if (offer.price != null && offer.price !== "") facts.push(`${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(Number(offer.price))} zł`);
  return facts.join(" · ");
}

function offerTitle(offer) {
  return offer.title ? formatOfferTitle(offer.title) : offer.location || `Oferta nr ${offer.offerId}`;
}

function offerCategory(offer) {
  return [offer.offerType, offer.transactionType?.toLocaleLowerCase("pl-PL")].filter(Boolean).join(" · ");
}

function offerInteractionSummary(offer) {
  return [
    ["Galeria", offer.galleryOpens],
    ["Pełny opis", offer.fullDescriptionOpens],
    ["Mapa", offer.mapOpens],
    ["Telefon", offer.phoneClicks],
    ["E-mail", offer.emailClicks],
  ].filter(([, value]) => finiteNumber(value) > 0)
    .map(([label, value]) => `${label}: ${formatNumber(value)}`)
    .join(" · ");
}

function metricCard(label, metric) {
  const comparison = formatWeeklyComparison(metric);
  return `<td width="50%" valign="top" style="padding:6px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid ${COLORS.line}; border-radius:8px; background:${COLORS.white};">
      <tr><td style="padding:15px 16px 14px; font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:12px; line-height:17px; color:${COLORS.muted}; text-transform:uppercase; letter-spacing:0.6px;">${escapeHtml(label)}</div>
        <div style="padding-top:5px; font-size:26px; line-height:31px; color:${COLORS.navy}; font-weight:700;">${formatNumber(metric?.current)}</div>
        <div style="padding-top:5px; font-size:12px; line-height:17px; color:${comparisonColor(metric)}; font-weight:700;">${escapeHtml(comparison)}</div>
      </td></tr>
    </table>
  </td>`;
}

function sectionHeading(title, subtitle = "") {
  return `<tr><td style="padding:29px 0 10px; font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:20px; line-height:26px; color:${COLORS.navy}; font-weight:700;">${escapeHtml(title)}</div>
    ${subtitle ? `<div style="padding-top:3px; font-size:13px; line-height:19px; color:${COLORS.muted};">${escapeHtml(subtitle)}</div>` : ""}
  </td></tr>`;
}

function dailyTrafficRows(daily = []) {
  const largestSessions = Math.max(1, ...daily.map((row) => finiteNumber(row.sessions)));
  return daily.map((row) => {
    const width = Math.max(0, Math.min(100, Math.round((finiteNumber(row.sessions) / largestSessions) * 100)));
    return `<tr>
      <td style="padding:8px 8px 8px 0; border-top:1px solid ${COLORS.line}; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:18px; color:${COLORS.ink}; white-space:nowrap;">${escapeHtml(formatDate(row.date))}</td>
      <td style="padding:8px; border-top:1px solid ${COLORS.line}; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:18px; color:${COLORS.ink}; text-align:right;">${formatNumber(row.activeUsers)}</td>
      <td style="padding:8px; border-top:1px solid ${COLORS.line}; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:18px; color:${COLORS.ink}; text-align:right;">${formatNumber(row.sessions)}</td>
      <td style="padding:8px 0 8px 8px; border-top:1px solid ${COLORS.line};">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:7px; background:${COLORS.beigeDark}; border-radius:4px;"><div style="height:7px; width:${width}%; min-width:${width ? 3 : 0}px; background:${COLORS.gold}; border-radius:4px; font-size:1px; line-height:1px;">&nbsp;</div></td></tr></table>
      </td>
    </tr>`;
  }).join("");
}

function acquisitionRows(acquisition = []) {
  if (!acquisition.length) return `<tr><td colspan="3" style="padding:12px 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:${COLORS.muted};">Brak danych w tym okresie.</td></tr>`;
  return acquisition.map((row) => `<tr>
    <td style="padding:9px 8px 9px 0; border-top:1px solid ${COLORS.line}; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:18px; color:${COLORS.ink}; font-weight:700;">${escapeHtml(formatAcquisitionChannelLabel(row.channel))}</td>
    <td style="padding:9px 8px; border-top:1px solid ${COLORS.line}; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:${COLORS.muted};">${escapeHtml(formatAcquisitionSourceLabel(row.source, row.medium))}</td>
    <td style="padding:9px 0 9px 8px; border-top:1px solid ${COLORS.line}; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:18px; color:${COLORS.ink}; text-align:right;">${formatNumber(row.sessions)}</td>
  </tr>`).join("");
}

function interactionRows(interactions = {}) {
  return INTERACTION_EVENTS.map((eventName) => `<tr>
    <td style="padding:8px 8px 8px 0; border-top:1px solid ${COLORS.line}; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:18px; color:${COLORS.ink};">${escapeHtml(INTERACTION_LABELS[eventName])}</td>
    <td style="padding:8px 0 8px 8px; border-top:1px solid ${COLORS.line}; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:18px; color:${COLORS.ink}; text-align:right; font-weight:700;">${formatNumber(interactions[eventName])}</td>
  </tr>`).join("");
}

function offerRows(offers = []) {
  if (!offers.length) return `<tr><td style="padding:13px 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:${COLORS.muted};">Brak przypisanych wyświetleń ofert w tym okresie.</td></tr>`;
  return offers.map((offer) => {
    const title = offerTitle(offer);
    const url = safeUrl(offer.url);
    const heading = url ? `<a href="${escapeHtml(url)}" style="color:${COLORS.navy}; text-decoration:none;">${escapeHtml(title)}</a>` : escapeHtml(title);
    const category = offerCategory(offer);
    const facts = formatOfferFacts(offer);
    const interactions = offerInteractionSummary(offer);
    const details = [category, facts, interactions].filter(Boolean).map(escapeHtml).join("<br>");
    return `<tr><td style="padding:13px 0; border-top:1px solid ${COLORS.line};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
        <td valign="top" style="font-family:Arial,Helvetica,sans-serif; padding-right:12px;">
          <div style="font-size:14px; line-height:20px; color:${COLORS.navy}; font-weight:700;">${heading}</div>
          ${offer.location && offer.title ? `<div style="padding-top:2px; font-size:12px; line-height:17px; color:${COLORS.muted};">${escapeHtml(offer.location)}</div>` : ""}
          ${details ? `<div style="padding-top:5px; font-size:12px; line-height:18px; color:${COLORS.muted};">${details}</div>` : ""}
          <div style="padding-top:5px; font-size:11px; line-height:15px; color:${COLORS.muted};">ID oferty: ${escapeHtml(offer.offerId)}</div>
        </td>
        <td valign="top" style="width:82px; font-family:Arial,Helvetica,sans-serif; text-align:right; color:${COLORS.navy};"><div style="font-size:22px; line-height:25px; font-weight:700;">${formatNumber(offer.views)}</div><div style="font-size:11px; line-height:15px; color:${COLORS.muted};">${escapeHtml(formatOfferViewWord(offer.views))}</div></td>
      </tr></table>
    </td></tr>`;
  }).join("");
}

export function getWeeklyReportEmailSubject(report) {
  return `PropertyCorp — raport tygodniowy ${formatDateRange(report.period.current)}`;
}

export function renderWeeklyReportHtml(report) {
  const totals = offerTotals(report);
  const cards = [
    ["Użytkownicy", report.traffic?.activeUsers],
    ["Sesje", report.traffic?.sessions],
    ["Odsłony", report.traffic?.screenPageViews],
    ["Zdarzenia", report.traffic?.eventCount],
  ];
  const cardRows = [cards.slice(0, 2), cards.slice(2, 4)].map((row) => `<tr>${row.map(([label, metric]) => metricCard(label, metric)).join("")}</tr>`).join("");
  const unassignedNote = finiteNumber(totals.unassignedOfferViews) > 0
    ? `<div style="padding-top:7px; font-size:12px; line-height:18px; color:${COLORS.muted};">Nieprzypisane do konkretnej oferty: ${formatNumber(totals.unassignedOfferViews)}. Są ujęte w łącznej liczbie wyświetleń, ale nie w poniższych wierszach ofert.</div>`
    : "";

  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(getWeeklyReportEmailSubject(report))}</title></head>
<body style="margin:0; padding:0; background:${COLORS.beige};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${COLORS.beige};"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px; background:${COLORS.white}; border:1px solid ${COLORS.line};">
      <tr><td style="padding:28px 28px 24px; background:${COLORS.navy}; font-family:Arial,Helvetica,sans-serif; color:${COLORS.white};">
        <div style="font-size:13px; line-height:18px; letter-spacing:2px; font-weight:700;">PROPERTYCORP</div>
        <div style="padding-top:18px; font-size:26px; line-height:32px; font-weight:700;">Raport tygodniowy</div>
        <div style="padding-top:5px; font-size:15px; line-height:21px; color:#E7DCCD;">${escapeHtml(formatDateRange(report.period.current))}</div>
      </td></tr>
      <tr><td style="padding:0 28px 30px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${sectionHeading("Ruch", `Porównanie z ${formatDateRange(report.period.previous)}`)}
          <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${cardRows}</table></td></tr>
          ${sectionHeading("Źródła ruchu")}
          <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><th align="left" style="padding:0 8px 7px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:${COLORS.muted}; text-transform:uppercase;">Kanał</th><th align="left" style="padding:0 8px 7px; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:${COLORS.muted}; text-transform:uppercase;">Źródło</th><th align="right" style="padding:0 0 7px 8px; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:${COLORS.muted}; text-transform:uppercase;">Sesje</th></tr>${acquisitionRows(report.acquisition)}</table></td></tr>
          ${sectionHeading("Aktywność w tygodniu", "Wysokość paska pokazuje liczbę sesji w relacji do najaktywniejszego dnia.")}
          <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><th align="left" style="padding:0 8px 7px 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:${COLORS.muted}; text-transform:uppercase;">Data</th><th align="right" style="padding:0 8px 7px; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:${COLORS.muted}; text-transform:uppercase;">Użytk.</th><th align="right" style="padding:0 8px 7px; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:${COLORS.muted}; text-transform:uppercase;">Sesje</th><th style="padding:0 0 7px 8px;"></th></tr>${dailyTrafficRows(report.daily)}</table></td></tr>
          ${sectionHeading("Zaangażowanie")}
          <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${interactionRows(report.interactions)}</table></td></tr>
          ${sectionHeading("Najpopularniejsze oferty")}
          <tr><td style="padding:0 0 5px; font-family:Arial,Helvetica,sans-serif;"><div style="font-size:14px; line-height:20px; color:${COLORS.ink};">Wyświetlenia ofert: <strong>${formatNumber(totals.totalOfferViews)}</strong> · przypisane: <strong>${formatNumber(totals.assignedOfferViews)}</strong></div>${unassignedNote}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:10px;">${offerRows(report.offers)}</table></td></tr>
          ${sectionHeading("Uwagi pomiarowe")}
          <tr><td style="font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:${COLORS.muted};">Dane obejmują ruch zmierzony przez Google Analytics po wymaganej zgodzie użytkownika. Użytkownicy GA4 to użytkownicy zmierzeni, a nie możliwe do zidentyfikowania osoby ani adresy IP.<br><br>Kliknięcia telefonu i e-maila oznaczają interakcje w serwisie, nie potwierdzone połączenia ani wysłane wiadomości.</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:15px 28px; background:${COLORS.beige}; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; color:${COLORS.navyMuted};">PropertyCorp · raport wygenerowany automatycznie</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function renderWeeklyReportText(report) {
  const totals = offerTotals(report);
  const metrics = [
    ["Użytkownicy", report.traffic?.activeUsers],
    ["Sesje", report.traffic?.sessions],
    ["Odsłony", report.traffic?.screenPageViews],
    ["Zdarzenia", report.traffic?.eventCount],
  ];
  const offerLines = report.offers?.length
    ? report.offers.map((offer) => {
      const lines = [`- ${offerTitle(offer)} (ID: ${offer.offerId}) — ${formatOfferViewCount(offer.views)}`];
      const category = offerCategory(offer);
      const facts = formatOfferFacts(offer);
      const interactions = offerInteractionSummary(offer);
      if (category || facts || interactions) lines.push(`  ${[category, facts, interactions].filter(Boolean).join(" · ")}`);
      if (safeUrl(offer.url)) lines.push(`  ${offer.url}`);
      return lines.join("\n");
    }).join("\n")
    : "- Brak przypisanych wyświetleń ofert w tym okresie.";
  return [
    "PROPERTYCORP",
    "Raport tygodniowy",
    formatDateRange(report.period.current),
    `Porównanie: ${formatDateRange(report.period.previous)}`,
    "",
    "RUCH",
    ...metrics.map(([label, metric]) => `- ${label}: ${formatNumber(metric?.current)} (${formatWeeklyComparison(metric)})`),
    "",
    "ŹRÓDŁA RUCHU",
    ...(report.acquisition?.length ? report.acquisition.map((row) => `- ${formatAcquisitionChannelLabel(row.channel)}: ${formatNumber(row.sessions)} sesje (${formatAcquisitionSourceLabel(row.source, row.medium)})`) : ["- Brak danych w tym okresie."]),
    "",
    "AKTYWNOŚĆ W TYGODNIU",
    ...(report.daily || []).map((row) => `- ${formatDate(row.date)}: ${formatNumber(row.activeUsers)} użytk., ${formatNumber(row.sessions)} sesje, ${formatNumber(row.screenPageViews)} odsłony`),
    "",
    "ZAANGAŻOWANIE",
    ...INTERACTION_EVENTS.map((eventName) => `- ${INTERACTION_LABELS[eventName]}: ${formatNumber(report.interactions?.[eventName])}`),
    "",
    "NAJPOPULARNIEJSZE OFERTY",
    `Wyświetlenia ofert: ${formatNumber(totals.totalOfferViews)}; przypisane: ${formatNumber(totals.assignedOfferViews)}; nieprzypisane: ${formatNumber(totals.unassignedOfferViews)}.`,
    offerLines,
    "",
    "UWAGI POMIAROWE",
    "Dane obejmują ruch zmierzony przez Google Analytics po wymaganej zgodzie użytkownika.",
    "Użytkownicy GA4 to użytkownicy zmierzeni, a nie możliwe do zidentyfikowania osoby ani adresy IP.",
    "Kliknięcia telefonu i e-maila oznaczają interakcje w serwisie, nie potwierdzone połączenia ani wysłane wiadomości.",
    "",
  ].join("\n");
}
