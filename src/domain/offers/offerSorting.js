const IMPORT_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/;

/**
 * Parses the timestamp format exported by IMO without relying on browser date
 * parsing. Dates are compared as UTC calendar timestamps so every browser
 * orders the same import identically.
 */
export function parseOfferIntroductionTimestamp(value) {
  const match = String(value ?? "").trim().match(IMPORT_TIMESTAMP_PATTERN);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText = "00", minuteText = "00", secondText = "00"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(timestamp);

  const valid = date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
  return valid ? timestamp : null;
}

function offerId(offer) {
  return String(offer?.externalId ?? offer?.id ?? "");
}

function compareOfferIds(left, right) {
  const leftId = offerId(left);
  const rightId = offerId(right);
  if (leftId === rightId) return 0;
  return leftId < rightId ? -1 : 1;
}

/**
 * Newest means the offer introduction date (`datawprowadzenia`), never the
 * later edit date. Invalid or absent dates sort last with a stable ID tie-break.
 */
export function compareOffersByIntroductionDate(left, right) {
  const leftTimestamp = parseOfferIntroductionTimestamp(left?.dates?.createdAt);
  const rightTimestamp = parseOfferIntroductionTimestamp(right?.dates?.createdAt);
  if (leftTimestamp != null && rightTimestamp != null && leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;
  if (leftTimestamp != null && rightTimestamp == null) return -1;
  if (leftTimestamp == null && rightTimestamp != null) return 1;
  return compareOfferIds(left, right);
}

export function sortOffersByIntroductionDate(offers) {
  return [...offers].sort(compareOffersByIntroductionDate);
}
