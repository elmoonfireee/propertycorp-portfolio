import { normalizeDescription } from "./normalizeDescription.js";

// Strict V1 recognition and legacy recovery live in separate phases. A known
// title is never needed to recognise a V1 section: its standalone uppercase
// syntax is the contract.
const LIST_SECTION_TYPES = new Set([
  "locationBenefits", "propertyBenefits", "investmentBenefits", "plotBenefits",
  "standard", "businessUses", "audience", "benefits", "additional",
  "additionalInfo", "keyFacts",
]);
const WELL_SECTION_TYPES = new Set(["location", "property", "investment", "plot", "costs", "generic", "important"]);

const LEGAL_PREFIX = /^(treść niniejszego|niniejsze ogłoszenie|ogłoszenie nie stanowi|opis oferty zawarty na stronie|oferta nie stanowi)/iu;
const TECHNICAL_SOURCE = /^oferta wysłana z programu imo/iu;
const CTA_PREFIX = /^(serdecznie zaprasza(?:m|my)?|zaprasza(?:m|my)? na prezentacj|w celu uzyskania szczegółowych informacji.*kontakt|(?:mieszkanie|apartament|dom|lokal).{0,65}(?:zaprasza|kontakt))/iu;

const CANONICAL_MEASUREMENT = /^(?:ok\. )?\d+,\d{2} m²$/u;
const AREA_TOKEN_SOURCE = String.raw`(?:(?:ok\.?|około)\s*)?\d+(?:[,.]\d+)?\s*m(?:²|2)?`;
const AREA_SEQUENCE_SOURCE = String.raw`${AREA_TOKEN_SOURCE}(?:\s*(?:,|i|oraz)\s*${AREA_TOKEN_SOURCE})*`;
const LAYOUT_AREA_AT_END = new RegExp(String.raw`^(.+?)(?:\s*(?::|[-–—])\s*|\s+)(${AREA_SEQUENCE_SOURCE})(?:\s*\(([^()]{1,140})\))?\s*[,.;:]*$`, "iu");
const ACCESSORY_KEYWORD = /\b(komórka\s+lokatorska|komórka|piwnica|garaż|miejsce\s+parkingowe|balkon|taras|ogródek)\b/iu;
const ACCESSORY_AREA_IN_PARENS = new RegExp(String.raw`\(\s*(${AREA_SEQUENCE_SOURCE})\s*\)`, "iu");
const SUMMARY_LABEL = /^(suma|powierzchnia (mieszkania|lokalu|domu|użytkowa))$/iu;

function normalizeWhitespace(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHeading(value) {
  return normalizeWhitespace(value)
    .replace(/^[\-–—•]+\s*/, "")
    .replace(/[\s:!?]+$/, "")
    .toLocaleLowerCase("pl-PL");
}

function sentenceCase(value) {
  const clean = normalizeWhitespace(value).replace(/^[\-–—•]+\s*/, "").replace(/[\s:!]+$/, "");
  if (!clean) return "";
  const source = clean === clean.toLocaleUpperCase("pl-PL") ? clean.toLocaleLowerCase("pl-PL") : clean;
  return source.charAt(0).toLocaleUpperCase("pl-PL") + source.slice(1);
}

function titleCase(value) {
  const source = sentenceCase(value).toLocaleLowerCase("pl-PL");
  const lowerCaseWords = new Set(["i", "w", "z", "na", "od", "do", "oraz"]);
  return source.split(" ").map((word, index) => (
    index > 0 && lowerCaseWords.has(word) ? word : word.charAt(0).toLocaleUpperCase("pl-PL") + word.slice(1)
  )).join(" ");
}

function isAllCapsLabel(value) {
  const letters = String(value || "").replace(/[^\p{L}]/gu, "");
  return Boolean(letters) && letters === letters.toLocaleUpperCase("pl-PL");
}

function hasLowercaseLetter(value) {
  const letters = String(value || "").replace(/[^\p{L}]/gu, "");
  return Boolean(letters) && letters !== letters.toLocaleUpperCase("pl-PL");
}

function startsWithUppercaseOrDigit(value) {
  const first = [...String(value || "").trim()][0] || "";
  return /\d/u.test(first) || (/[\p{L}]/u.test(first) && first === first.toLocaleUpperCase("pl-PL"));
}

/** Semantic mapping only. It never determines whether a V1 heading exists. */
function classifySemantic(rawTitle, { legacy = false } = {}) {
  const heading = normalizeHeading(rawTitle);
  if (!heading) return null;
  if (heading === "lokalizacja") return { type: "location", title: "Lokalizacja" };
  if (/^(atuty|najważniejsze atuty) lokalizacji$/u.test(heading)) return { type: "locationBenefits", title: "Atuty lokalizacji" };
  if (["mieszkanie", "apartament", "dom", "budynek", "lokal"].includes(heading)) return { type: "property", title: sentenceCase(rawTitle) };
  if (/^(najważniejsze atuty|atuty mieszkania|atuty apartamentu|atuty nieruchomości|najważniejsze atuty nieruchomości|atuty lokalu|najważniejsze atuty lokalu)$/u.test(heading)) return { type: "propertyBenefits", title: sentenceCase(rawTitle) };
  if (heading === "inwestycja" || /^inwestycja\s+/u.test(heading)) return { type: "investment", title: titleCase(rawTitle) };
  if (/^(charakterystyka inwestycji|atuty inwestycji|najważniejsze atuty inwestycji)$/u.test(heading)) return { type: "investmentBenefits", title: sentenceCase(rawTitle) };
  if (heading === "działka") return { type: "plot", title: "Działka" };
  if (/^(najważniejsze cechy działki|atuty działki)$/u.test(heading)) return { type: "plotBenefits", title: sentenceCase(rawTitle) };
  if (/^(układ pomieszczeń|spis pomieszczeń|na powierzchnię (lokalu|mieszkania|domu) składa się)$/u.test(heading)) return { type: "layout", title: sentenceCase(rawTitle) };
  if (heading === "dodatkowe informacje") return { type: "additionalInfo", title: "Dodatkowe informacje" };
  if (/^(standard i wyposażenie|standard i stan|standard wykończeń|standard wykończeń i wyposażenie|udogodnienia i standard wykończeń)$/u.test(heading)) return { type: "standard", title: sentenceCase(rawTitle) };
  if (heading === "najważniejsze informacje") return { type: "keyFacts", title: "Najważniejsze informacje" };
  if (/^(możliwe|przykładowe) przeznaczenie(?: lokalu)?$/u.test(heading)) return { type: "businessUses", title: sentenceCase(rawTitle) };
  if (heading === "dla kogo") return { type: "audience", title: "Dla kogo" };
  if (heading === "dlaczego warto") return { type: legacy ? "audience" : "benefits", title: "Dlaczego warto" };
  if (heading === "dla kogo i dlaczego warto") return { type: "audience", title: "Dla kogo i dlaczego warto" };
  if (heading === "ważne") return { type: "important", title: "Ważne" };
  if (heading === "kontakt i prezentacja") return { type: "contact", title: "Kontakt i prezentacja" };
  if (heading === "informacje prawne") return { type: "legal", title: "Informacje prawne" };
  if (/^(koszty|cena|cena apartamentu|cena komórki lokatorskiej|cena miejsc postojowych w garażu podziemnym)$/u.test(heading)) return { type: "costs", title: sentenceCase(rawTitle) };
  if (/^(ogródek i dodatki|taras)$/u.test(heading)) return { type: "additional", title: sentenceCase(rawTitle) };
  return null;
}

function inlineFromPlain(text) {
  const clean = normalizeWhitespace(text);
  return clean ? [{ text: clean, strong: false, emphasis: false }] : [];
}

function textFromInline(inline) {
  return inline.map((part) => part.text).join(" ");
}

function appendInline(left, right) {
  const result = [...left];
  right.forEach((part) => {
    const previous = result.at(-1);
    if (previous && previous.strong === part.strong && previous.emphasis === part.emphasis) previous.text = `${previous.text} ${part.text}`;
    else result.push({ ...part });
  });
  return result;
}

function createInlineParser() {
  let strongDepth = 0;
  let emphasisDepth = 0;
  let underlineDepth = 0;
  return (html) => {
    const parts = [];
    const tagExpression = /<\/?(?:strong|b|em|i|u)\b[^>]*>|<\s*br\s*\/?\s*>|<[^>]*>/giu;
    let cursor = 0;
    let match;
    const addText = (value) => {
      const text = normalizeWhitespace(value);
      if (!text) return;
      const formatting = { strong: strongDepth > 0, emphasis: emphasisDepth > 0, underline: underlineDepth > 0 };
      const previous = parts.at(-1);
      if (previous && previous.strong === formatting.strong && previous.emphasis === formatting.emphasis && previous.underline === formatting.underline) previous.text = `${previous.text} ${text}`;
      else parts.push({ text, ...formatting });
    };
    while ((match = tagExpression.exec(html))) {
      addText(html.slice(cursor, match.index));
      const tagMatch = match[0].match(/^<\s*(\/?)\s*([a-z]+)/iu);
      const closing = Boolean(tagMatch?.[1]);
      const tagName = tagMatch?.[2]?.toLocaleLowerCase("pl-PL");
      const delta = closing ? -1 : 1;
      if (["strong", "b"].includes(tagName)) strongDepth = Math.max(0, strongDepth + delta);
      if (["em", "i"].includes(tagName)) emphasisDepth = Math.max(0, emphasisDepth + delta);
      if (tagName === "u") underlineDepth = Math.max(0, underlineDepth + delta);
      cursor = match.index + match[0].length;
    }
    addText(html.slice(cursor));
    return parts;
  };
}

function sourceHtml(description) {
  const raw = description && typeof description === "object" && "html" in description ? description.html : description;
  return normalizeDescription(raw).html;
}

function tokenize(description) {
  const parseInline = createInlineParser();
  const html = sourceHtml(description)
    .replace(/<\s*br\s*\/?\s*>/giu, "\n")
    .replace(/<\/?(?:p|div|li|h[1-6])\b[^>]*>/giu, "\n");
  let blankBefore = false;
  return html.split(/\r?\n/u).flatMap((raw, index) => {
    const inline = parseInline(raw);
    const text = normalizeWhitespace(textFromInline(inline));
    if (!text) {
      // IMO often splits <b> and <u> across physical lines. That is not a
      // visible paragraph break.
      if (!/<[^>]+>/u.test(raw) || !raw.trim()) blankBefore = true;
      return [];
    }
    // Only leading decoration is a heading signal. A bold phrase later in a
    // normal sentence is common in IMO exports and must not create a section.
    const line = { line: index + 1, text, inline, blankBefore, richHeadingSignal: Boolean(inline[0]?.strong || inline[0]?.underline) };
    blankBefore = false;
    return [line];
  });
}

function diagnostic(model, level, code, detail = {}) {
  model.diagnostics[`${level.toLowerCase()}s`].push({ level, code, ...detail });
}

function plainBlock(line, { source = "legacy" } = {}) {
  return { type: "paragraph", text: line.text, inline: line.inline, source };
}

function makeSection(rawTitle, source, model, line) {
  const semantic = classifySemantic(rawTitle, { legacy: source === "legacy" });
  const section = {
    type: semantic?.type || "generic",
    semanticType: semantic?.type || "unknown",
    title: semantic?.title || sentenceCase(rawTitle),
    rawTitle: normalizeWhitespace(rawTitle),
    blocks: [],
    source,
  };
  if (!semantic) {
    model.diagnostics.unknownSemanticSections.push(section.title);
    diagnostic(model, "INFO", "UNKNOWN_SEMANTIC_SECTION", { line: line.line, title: section.title });
  }
  model.sections.push(section);
  return section;
}

function isCanonicalMeasurement(value) {
  return CANONICAL_MEASUREMENT.test(normalizeWhitespace(value));
}

// IMO transport can strip the superscript from an otherwise canonical V1
// authoring value. This accepts only that lossless form and always returns the
// canonical model value; the V1 authoring contract itself remains m².
function normalizeV1MeasurementTransport(value) {
  const match = normalizeWhitespace(value).match(/^((?:ok\. )?\d+,\d{2}) m(?:²|2)?$/u);
  return match ? `${match[1]} m²` : null;
}

function looksLikeMeasurement(value) {
  return /\d\s*(?:m(?:2|²)?)(?:\b|$)/iu.test(normalizeWhitespace(value));
}

function parseMeasurementNote(value) {
  const separator = value.indexOf("|");
  if (separator < 0) return null;
  return {
    measurement: normalizeWhitespace(value.slice(0, separator)),
    note: normalizeWhitespace(value.slice(separator + 1)),
  };
}

function createListItem(payload, line, model) {
  const text = normalizeWhitespace(payload);
  const split = text.match(/^([^:]+):\s+(.+)$/u);
  if (!split) return { type: "listItem", text, label: null, content: inlineFromPlain(text), measurement: null, note: null, approximate: false, inline: line.inline };
  const label = normalizeWhitespace(split[1]);
  const value = normalizeWhitespace(split[2]);
  const measurementNote = parseMeasurementNote(value);
  const measurementCandidate = measurementNote?.measurement || value;
  const normalizedMeasurement = normalizeV1MeasurementTransport(value);
  const normalizedNoteMeasurement = measurementNote && normalizeV1MeasurementTransport(measurementNote.measurement);
  const measurement = normalizedMeasurement || (normalizedNoteMeasurement && measurementNote.note ? normalizedNoteMeasurement : null);
  const note = normalizedNoteMeasurement && measurementNote.note ? measurementNote.note : null;
  if (normalizedNoteMeasurement && !measurementNote.note) diagnostic(model, "WARNING", "EMPTY_MEASUREMENT_NOTE", { line: line.line, value });
  if (looksLikeMeasurement(measurementCandidate) && !normalizeV1MeasurementTransport(measurementCandidate)) {
    diagnostic(model, "WARNING", "NON_CANONICAL_MEASUREMENT", { line: line.line, value: measurementCandidate });
  }
  return { type: "listItem", text, label, content: inlineFromPlain(value), measurement, note, approximate: Boolean(measurement?.startsWith("ok. ")), inline: line.inline };
}

// V1 contract §3.1: list, row, section heading, subheading, prose.
function classifyV1(line, currentSection, model) {
  const text = line.text;
  if (text.startsWith("- ")) {
    const payload = text.slice(2).trim();
    if (!payload) diagnostic(model, "ERROR", "EMPTY_LIST_ITEM", { line: line.line });
    return { kind: "list", item: createListItem(payload, line, model) };
  }
  // A malformed legacy list marker such as "-Salon" must reach the legacy
  // layer instead of being misclassified as a key/value label.
  const row = !/^[\-–—•]/u.test(text) && text.match(/^([^:]{1,80}):\s+(.+)$/u);
  if (row) {
    const label = normalizeWhitespace(row[1]);
    const value = normalizeWhitespace(row[2]);
    if (label === "SUMA" && isCanonicalMeasurement(value)) return { kind: "summary", label, measurement: value, approximate: value.startsWith("ok. ") };
    if (looksLikeMeasurement(value) && !isCanonicalMeasurement(value)) diagnostic(model, "WARNING", "NON_CANONICAL_MEASUREMENT", { line: line.line, value });
    if (isAllCapsLabel(label) && /^(lokalizacja|ważne|dla kogo|układ pomieszczeń)$/iu.test(label)) diagnostic(model, "WARNING", "V1_HEADING_WITH_INLINE_CONTENT", { line: line.line, title: sentenceCase(label) });
    return { kind: "keyValue", label, value, content: inlineFromPlain(value) };
  }
  const standalone = text.match(/^([^:]{1,80}):$/u);
  if (!standalone) return null;
  const label = normalizeWhitespace(standalone[1]);
  if (label.length >= 2 && isAllCapsLabel(label)) {
    if (label === "SUMA") diagnostic(model, "WARNING", "RESERVED_SUMMARY_HEADING", { line: line.line });
    return { kind: "section", rawTitle: label };
  }
  // A decorated known Title Case label is a historical top-level heading,
  // not a V1 subheading. Plain Title Case remains a valid V1 subheading.
  if (line.richHeadingSignal && classifySemantic(label, { legacy: true })) return null;
  if (currentSection && label.length <= 60 && hasLowercaseLetter(label) && startsWithUppercaseOrDigit(label)) return { kind: "subheading", title: sentenceCase(label) };
  return null;
}

function detectLegacyHeading(line) {
  const standalone = line.text.match(/^(.+?)[!?:]$/u);
  const directTitle = standalone ? standalone[1] : line.text;
  const semantic = classifySemantic(directTitle, { legacy: true });
  if (semantic && (Boolean(standalone) || line.richHeadingSignal || isAllCapsLabel(line.text))) return { ...semantic, rawTitle: directTitle, remainder: "" };
  // A legacy rich heading may share its line with its first sentence. This is
  // deliberately restricted to a known decorated heading.
  if (line.richHeadingSignal) {
    const inlineHeading = line.text.match(/^([^:!?]{2,80})[:!?]\s*(.+)$/u);
    if (inlineHeading) {
      const richSemantic = classifySemantic(inlineHeading[1], { legacy: true });
      if (richSemantic) return { ...richSemantic, rawTitle: inlineHeading[1], remainder: inlineHeading[2] };
    }
  }
  return null;
}

function addParagraph(target, line, { v1 = false } = {}) {
  const previous = target.at(-1);
  if (v1 && !line.blankBefore && previous?.type === "paragraph") {
    previous.text = `${previous.text} ${line.text}`;
    previous.inline = appendInline(previous.inline, line.inline);
  } else target.push(plainBlock(line, { source: v1 ? "v1" : "legacy" }));
}

function appendListItem(section, item, line) {
  const previous = section.blocks.at(-1);
  if (!line.blankBefore && previous?.type === "list") previous.items.push(item);
  else section.blocks.push({ type: "list", items: [item], source: "v1" });
}

function looksLikeLegacyBareListContinuation(section, line) {
  const previous = section.blocks.at(-1);
  return section.source === "v1"
    && LIST_SECTION_TYPES.has(section.type)
    && !line.blankBefore
    && previous?.type === "paragraph"
    && previous.text.length <= 120
    && line.text.length <= 120
    && !isLayoutNarrativeProse(previous.text)
    && !isLayoutNarrativeProse(line.text);
}

function isAgentSignature(text, agent, signatureStarted) {
  const normalized = normalizeHeading(text);
  const name = normalizeHeading(agent?.name);
  const phone = String(agent?.phone || "").replace(/\D/g, "");
  const digits = String(text || "").replace(/\D/g, "");
  if (name && normalized === name) return true;
  if (phone.length >= 7 && digits === phone) return true;
  return signatureStarted && /^(property\s*corp|propertycorp)$/iu.test(normalized);
}

function removeListMarker(text) {
  return normalizeWhitespace(text).replace(/^[\-–—•]+\s*/, "");
}

function parseStructuredItem(block) {
  const text = removeListMarker(block.text);
  const separator = text.match(/^(.{1,86}?)(?:\s*:\s*|\s+[–—-]\s+)(.+)$/u);
  if (!separator) return { type: "listItem", text, label: null, content: inlineFromPlain(text), measurement: null, approximate: false };
  return { type: "listItem", text, label: normalizeWhitespace(separator[1]), content: inlineFromPlain(separator[2]), measurement: null, approximate: false };
}

function trimTerminalPunctuation(value) {
  return normalizeWhitespace(value).replace(/[\s,.;:]+$/u, "");
}

function normalizeAreaValue(value) {
  return trimTerminalPunctuation(value).replace(/\bokoło\b/iu, "ok.").replace(/\s*m(?:²|2)?/giu, " m²").replace(/\s+/gu, " ").trim();
}

function isLayoutNarrativeProse(text) {
  const clean = normalizeWhitespace(text);
  const words = clean.split(/\s+/u).filter(Boolean);
  if (words.length < 8) return false;
  if (/^(mieszkanie|dom|lokal|apartament|nieruchomość|budynek|obiekt|powierzchnia)\b/iu.test(clean)) return true;
  return words.length > 12 && (/[.!?](?:\s|$)/u.test(clean) || /\b(który|która|które|ponieważ|został|została|znajduje|zapewnia|komfort|propozycj|miesięczn|po remoncie|gotowe do zamieszkania)\b/iu.test(clean));
}

function recoveredLegacyListItem(text, { label = null, content = text } = {}) {
  const normalizedText = normalizeWhitespace(text);
  const normalizedContent = normalizeWhitespace(content);
  return {
    type: "listItem", text: normalizedText, label: label ? normalizeWhitespace(label) : null,
    content: inlineFromPlain(normalizedContent), measurement: null, note: null, approximate: false,
    inline: inlineFromPlain(normalizedText),
  };
}

function recoverLegacyListItem(block) {
  const text = normalizeWhitespace(block.text);
  if (block.type === "paragraph") {
    const malformedMarker = text.match(/^[\-–—•](?!\s)(.+)$/u);
    if (malformedMarker) {
      const structured = parseStructuredItem({ text: malformedMarker[1] });
      return structured.label
        ? recoveredLegacyListItem(structured.text, { label: structured.label, content: structured.content.map((part) => part.text).join(" ") })
        : recoveredLegacyListItem(malformedMarker[1]);
    }
  } else if (block.type !== "keyValue") return null;

  // A short decorated label plus a legacy separator is strong evidence of a
  // historical list row. Decoration elsewhere, or ordinary prose, is not.
  const firstInline = block.inline?.[0];
  if (!(firstInline?.strong || firstInline?.underline) || text.length > 180 || isLayoutNarrativeProse(text)) return null;
  const structured = block.type === "keyValue"
    ? { text, label: block.label, content: block.content }
    : parseStructuredItem(block);
  if (!structured.label || !structured.content.length || normalizeWhitespace(firstInline.text) !== structured.label) return null;
  return recoveredLegacyListItem(structured.text, {
    label: structured.label,
    content: structured.content.map((part) => part.text).join(" "),
  });
}

function normalizeListSection(section) {
  if (!LIST_SECTION_TYPES.has(section.type)) return section;
  const blocks = [];
  let recovered = false;
  const appendListItems = (items, source) => {
    const previous = blocks.at(-1);
    if (previous?.type === "list") {
      previous.items.push(...items);
      if (previous.source !== source) previous.source = "mixed";
    } else blocks.push({ type: "list", items: [...items], source });
  };

  section.blocks.forEach((block) => {
    if (block.type === "list") {
      appendListItems(block.items, block.source || "v1");
      return;
    }
    const item = recoverLegacyListItem(block);
    if (item) {
      recovered = true;
      appendListItems([item], "legacy");
    } else blocks.push(block);
  });
  return recovered ? { ...section, blocks, legacy: true } : section;
}

function isShortStructuredLabel(block) {
  const source = normalizeWhitespace(block.text);
  const text = trimTerminalPunctuation(removeListMarker(source));
  if (!text || isLayoutNarrativeProse(text)) return false;
  const words = text.split(/\s+/u).filter(Boolean);
  return text.length <= 140 && (/^[\-–—•]/u.test(source) || ACCESSORY_KEYWORD.test(text) || words.length <= 11 || /\([^()]{1,100}\)$/u.test(text));
}

function parseAccessorySentence(text) {
  const keyword = text.match(ACCESSORY_KEYWORD);
  const area = text.match(ACCESSORY_AREA_IN_PARENS);
  if (!keyword || !area || area.index == null || keyword.index == null || keyword.index > area.index) return null;
  const prefix = normalizeWhitespace(text.slice(0, keyword.index)).toLocaleLowerCase("pl-PL");
  if (!/^(dodatkowo|do mieszkania|w cenie|wraz z|przynależy)/u.test(prefix)) return null;
  const note = trimTerminalPunctuation(text.slice(area.index + area[0].length).replace(/^[\s,;:–—-]+/u, ""));
  return { label: sentenceCase(keyword[1]), value: normalizeAreaValue(area[1]), note: note || null, isSummary: false };
}

function parseLegacyLayoutRow(block) {
  const text = removeListMarker(block.text);
  const accessory = parseAccessorySentence(text);
  if (accessory) return accessory;
  const measurement = text.match(LAYOUT_AREA_AT_END);
  if (measurement) {
    const label = trimTerminalPunctuation(measurement[1]);
    const embeddedAreas = label.match(new RegExp(AREA_TOKEN_SOURCE, "giu")) || [];
    if (!label || embeddedAreas.length || isLayoutNarrativeProse(label)) return null;
    return { label, value: normalizeAreaValue(measurement[2]), note: measurement[3] ? trimTerminalPunctuation(measurement[3]) : null, isSummary: SUMMARY_LABEL.test(normalizeHeading(label)) };
  }
  if (isShortStructuredLabel(block)) return { label: trimTerminalPunctuation(text), value: null, note: null, isSummary: false };
  return null;
}

function isLegacyLayoutSubheading(text) {
  return /^(parter|piętro|poddasze|przyziemie|poziom [ivx]+|[ivx]+ poziom)$/iu.test(normalizeHeading(text));
}

function rowFromV1Item(item) {
  if (item.measurement) return { label: item.label, value: item.measurement, note: item.note || null, isSummary: false };
  return parseLegacyLayoutRow({ text: item.text }) || { label: item.text, value: null, note: null, isSummary: false };
}

function shapeLayoutSection(section) {
  const groups = [];
  let currentGroup = { title: null, rows: [] };
  let layoutComplete = false;
  const tailBlocks = [];
  const pushGroup = () => { if (currentGroup.rows.length || currentGroup.title) groups.push(currentGroup); };
  const addRow = (row, legacy = false) => {
    if (layoutComplete) return false;
    currentGroup.rows.push(row);
    if (legacy) section.legacy = true;
    return true;
  };
  section.blocks.forEach((block) => {
    if (block.type === "subheading") {
      pushGroup();
      currentGroup = { title: block.title, rows: [] };
    } else if (block.type === "list") {
      block.items.forEach((item) => addRow(rowFromV1Item(item), !item.measurement));
    } else if (block.type === "summary") {
      addRow({ label: block.label, value: block.measurement, note: null, isSummary: true });
    } else if (block.type === "keyValue") {
      const row = parseLegacyLayoutRow({ text: `${block.label}: ${block.value}` });
      if (row) addRow(row, !isCanonicalMeasurement(block.value));
      else { layoutComplete = true; tailBlocks.push(block); }
    } else if (block.type === "paragraph" && isLegacyLayoutSubheading(block.text)) {
      if (!layoutComplete) { pushGroup(); currentGroup = { title: sentenceCase(block.text), rows: [] }; }
      else tailBlocks.push(block);
    } else {
      const legacyRow = block.type === "paragraph" ? parseLegacyLayoutRow(block) : null;
      if (legacyRow && addRow(legacyRow, true)) return;
      layoutComplete = true;
      tailBlocks.push(block);
    }
  });
  pushGroup();
  return { ...section, groups, tailBlocks };
}

function collectListItems(section) {
  return section.blocks.flatMap((block) => {
    if (block.type === "list") return block.items;
    if (block.type === "keyValue") return [{ type: "listItem", text: `${block.label}: ${block.value}`, label: block.label, content: block.content, measurement: null, note: null, approximate: false }];
    if (block.type === "paragraph") return [parseStructuredItem(block)];
    return [];
  });
}

function shapeSection(section) {
  const normalizedSection = normalizeListSection(section);
  if (normalizedSection.type === "layout") return shapeLayoutSection(normalizedSection);
  const items = collectListItems(normalizedSection);
  if (items.length) {
    const hasV1List = normalizedSection.blocks.some((block) => block.type === "list");
    return { ...normalizedSection, items, legacyList: LIST_SECTION_TYPES.has(normalizedSection.type) && !hasV1List };
  }
  return normalizedSection;
}

function selectLegalBlock(lines) {
  if (!lines.length) return null;
  const unique = [...new Map(lines.map((line) => [line.text, line])).values()];
  const ordered = [...unique].sort((left, right) => right.text.length - left.text.length);
  const retained = ordered.filter((line, index) => !ordered.slice(0, index).some((candidate) => candidate.text.includes(line.text)));
  const text = retained.map((line) => line.text).join(" ");
  return { text, inline: inlineFromPlain(text) };
}

function finalizeDiagnostics(model) {
  model.sections.forEach((section) => {
    if (!section.blocks.length) diagnostic(model, "ERROR", "EMPTY_SECTION", { title: section.title });
    if (section.type === "audience") {
      const prose = section.blocks.filter((block) => block.type === "paragraph");
      const lists = section.blocks.filter((block) => block.type === "list");
      if (!lists.length && prose.length >= 2) diagnostic(model, "WARNING", "SUSPICIOUS_MULTI_VALUE_PROSE", { title: section.title });
    }
  });
  model.sections = model.sections.filter((section) => section.blocks.length);
  const hasLegacy = model._usedLegacy || model.sections.some((section) => section.legacy);
  model.diagnostics.sourceMode = model._usedV1 && hasLegacy ? "mixed" : model._usedV1 ? "v1" : hasLegacy ? "legacy" : "prose-only";
  delete model._usedV1;
  delete model._usedLegacy;
}

/**
 * Returns a renderer-neutral description model. React receives only text and
 * formatting flags; raw IMO HTML is never injected into the page.
 */
export function parseOfferDescription(description, { agent } = {}) {
  const model = {
    intro: [], sections: [], closing: [], legal: null,
    diagnostics: { sourceMode: "prose-only", unknownSemanticSections: [], infos: [], warnings: [], errors: [] },
    _usedV1: false, _usedLegacy: false,
  };
  let currentSection = null;
  let signatureStarted = false;
  let legalMode = false;
  const legalLines = [];

  tokenize(description).forEach((line) => {
    if (TECHNICAL_SOURCE.test(line.text)) return;
    if (isAgentSignature(line.text, agent, signatureStarted)) { signatureStarted = true; return; }

    const v1 = classifyV1(line, currentSection, model);
    const richLegacyInlineHeading = v1?.kind === "keyValue" && !currentSection && line.richHeadingSignal ? detectLegacyHeading(line) : null;

    if (v1?.kind === "section") {
      legalMode = false;
      model._usedV1 = true;
      if (classifySemantic(v1.rawTitle)?.type === "legal") { currentSection = null; legalMode = true; }
      else currentSection = makeSection(v1.rawTitle, "v1", model, line);
      return;
    }
    if (legalMode) { legalLines.push(line); return; }
    if (LEGAL_PREFIX.test(line.text)) { legalLines.push(line); currentSection = null; return; }
    if (richLegacyInlineHeading) {
      currentSection = makeSection(richLegacyInlineHeading.rawTitle, "legacy", model, line);
      model._usedLegacy = true;
      if (richLegacyInlineHeading.remainder) addParagraph(currentSection.blocks, { ...line, text: richLegacyInlineHeading.remainder, inline: inlineFromPlain(richLegacyInlineHeading.remainder) });
      return;
    }
    if (v1?.kind === "list") {
      model._usedV1 = true;
      if (!currentSection) { diagnostic(model, "ERROR", "LIST_ITEM_OUTSIDE_SECTION", { line: line.line }); addParagraph(model.sections.length ? model.closing : model.intro, line); }
      else appendListItem(currentSection, v1.item, line);
      return;
    }
    if (v1?.kind === "summary") {
      model._usedV1 = true;
      if (!currentSection) { diagnostic(model, "ERROR", "SUMMARY_OUTSIDE_SECTION", { line: line.line }); addParagraph(model.sections.length ? model.closing : model.intro, line); }
      else currentSection.blocks.push({ type: "summary", label: v1.label, measurement: v1.measurement, approximate: v1.approximate, source: "v1" });
      return;
    }
    if (v1?.kind === "keyValue") {
      model._usedV1 = true;
      if (!currentSection) { diagnostic(model, "ERROR", "KEY_VALUE_OUTSIDE_SECTION", { line: line.line, label: v1.label }); addParagraph(model.sections.length ? model.closing : model.intro, line); }
      else currentSection.blocks.push({ type: "keyValue", label: v1.label, value: v1.value, content: v1.content, text: line.text, inline: line.inline, source: "v1" });
      return;
    }
    if (v1?.kind === "subheading") {
      model._usedV1 = true;
      currentSection.blocks.push({ type: "subheading", title: v1.title, source: "v1" });
      return;
    }

    const legacyHeading = detectLegacyHeading(line);
    if (legacyHeading) {
      currentSection = makeSection(legacyHeading.rawTitle, "legacy", model, line);
      model._usedLegacy = true;
      if (legacyHeading.remainder) addParagraph(currentSection.blocks, { ...line, text: legacyHeading.remainder, inline: inlineFromPlain(legacyHeading.remainder) });
      return;
    }
    if (CTA_PREFIX.test(line.text)) {
      model.closing.push(plainBlock(line));
      currentSection = null;
      model._usedLegacy = true;
      return;
    }
    if (currentSection) {
      // Explicit historical headings are sometimes uppercase but contain an
      // old unmarked list. Once that local pattern is evident, retain the
      // compatibility behaviour without changing any already-valid V1 list.
      if (looksLikeLegacyBareListContinuation(currentSection, line)) {
        currentSection.source = "legacy";
        model._usedLegacy = true;
      }
      addParagraph(currentSection.blocks, line, { v1: currentSection.source === "v1" });
    }
    else if (!model.sections.length) addParagraph(model.intro, line);
    else addParagraph(model.closing, line);
  });

  model.legal = selectLegalBlock(legalLines);
  model.sections = model.sections.map(shapeSection);
  finalizeDiagnostics(model);
  return model;
}

export function hasRichDescriptionContent(model) {
  return Boolean(model?.intro?.length || model?.sections?.length || model?.closing?.length || model?.legal);
}

export const descriptionSectionKinds = { list: LIST_SECTION_TYPES, well: WELL_SECTION_TYPES };
