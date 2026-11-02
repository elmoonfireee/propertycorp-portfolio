const namedEntities = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
    const normalized = token.toLowerCase();
    if (namedEntities[normalized]) return namedEntities[normalized];
    if (normalized.startsWith("#")) {
      const codePoint = normalized.startsWith("#x")
        ? Number.parseInt(normalized.slice(2), 16)
        : Number.parseInt(normalized.slice(1), 10);
      return codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return entity;
  });
}

function decodeRepeatedly(value) {
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    const next = decodeEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function toPlainText(html) {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * IMO exports descriptions as a list of lines and can encode HTML entities
 * multiple times. The decoded HTML is not sanitized and must not be injected
 * into the page as HTML; the structured renderer parses it into text nodes.
 */
export function normalizeDescription(rawDescription) {
  const lines = Array.isArray(rawDescription)
    ? rawDescription
    : rawDescription == null
      ? []
      : [rawDescription];
  const html = decodeRepeatedly(lines.map((line) => String(line || "")).join("\n"))
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text: toPlainText(html),
    html,
    hasHtml: /<\/?[a-z][^>]*>/i.test(html),
    isSanitized: false,
  };
}
