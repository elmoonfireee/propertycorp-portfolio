import { inflateRaw } from "node:zlib";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

export const ZIP_LIMITS = Object.freeze({
  maxArchiveBytes: 512 * 1024 * 1024,
  maxEntries: 2_000,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxXmlBytes: 16 * 1024 * 1024,
});

export class ImoZipError extends Error {
  constructor(stage, message, { cause } = {}) {
    super(message, { cause });
    this.name = "ImoZipError";
    this.stage = stage;
  }
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function readUInt32(buffer, offset, stage) {
  if (offset < 0 || offset + 4 > buffer.length) throw new ImoZipError(stage, "Truncated ZIP structure.");
  return buffer.readUInt32LE(offset);
}

function readUInt16(buffer, offset, stage) {
  if (offset < 0 || offset + 2 > buffer.length) throw new ImoZipError(stage, "Truncated ZIP structure.");
  return buffer.readUInt16LE(offset);
}

function decodeZipName(bytes, utf8) {
  return bytes.toString(utf8 ? "utf8" : "latin1");
}

function assertSafeFlatEntryName(name) {
  const windowsReserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
  if (!name || name.includes("\0") || name.includes(":") || name.includes("\\") || name.includes("/") || name === "." || name === ".." || windowsReserved.test(name)) {
    throw new ImoZipError("archive-inspection", `Unsafe or non-flat archive entry name: ${JSON.stringify(name)}`);
  }
  if (basename(name) !== name) throw new ImoZipError("archive-inspection", `Unsafe archive entry name: ${JSON.stringify(name)}`);
}

function findEndOfCentralDirectory(buffer) {
  const minimum = 22;
  const start = Math.max(0, buffer.length - minimum - 0xffff);
  for (let offset = buffer.length - minimum; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + minimum + commentLength === buffer.length) return offset;
  }
  throw new ImoZipError("archive-inspection", "ZIP end-of-central-directory record was not found.");
}

function inspectZip(buffer, limits = ZIP_LIMITS) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = readUInt16(buffer, eocdOffset + 4, "archive-inspection");
  const centralDisk = readUInt16(buffer, eocdOffset + 6, "archive-inspection");
  const entriesOnDisk = readUInt16(buffer, eocdOffset + 8, "archive-inspection");
  const entryCount = readUInt16(buffer, eocdOffset + 10, "archive-inspection");
  const centralSize = readUInt32(buffer, eocdOffset + 12, "archive-inspection");
  const centralOffset = readUInt32(buffer, eocdOffset + 16, "archive-inspection");
  if (diskNumber || centralDisk || entriesOnDisk !== entryCount) throw new ImoZipError("archive-inspection", "Multi-disk ZIP archives are not supported.");
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new ImoZipError("archive-inspection", "ZIP64 archives are not supported.");
  if (entryCount > limits.maxEntries) throw new ImoZipError("archive-inspection", `ZIP has ${entryCount} entries; limit is ${limits.maxEntries}.`);
  if (centralOffset + centralSize > eocdOffset) throw new ImoZipError("archive-inspection", "Invalid ZIP central-directory bounds.");

  let offset = centralOffset;
  let totalUncompressedBytes = 0;
  const entries = [];
  const names = new Set();
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, offset, "archive-inspection") !== 0x02014b50) throw new ImoZipError("archive-inspection", "Invalid ZIP central-directory entry.");
    const versionMadeBy = readUInt16(buffer, offset + 4, "archive-inspection");
    const flags = readUInt16(buffer, offset + 8, "archive-inspection");
    const method = readUInt16(buffer, offset + 10, "archive-inspection");
    const crc = readUInt32(buffer, offset + 16, "archive-inspection");
    const compressedSize = readUInt32(buffer, offset + 20, "archive-inspection");
    const uncompressedSize = readUInt32(buffer, offset + 24, "archive-inspection");
    const nameLength = readUInt16(buffer, offset + 28, "archive-inspection");
    const extraLength = readUInt16(buffer, offset + 30, "archive-inspection");
    const commentLength = readUInt16(buffer, offset + 32, "archive-inspection");
    const externalAttributes = readUInt32(buffer, offset + 38, "archive-inspection");
    const localHeaderOffset = readUInt32(buffer, offset + 42, "archive-inspection");
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > centralOffset + centralSize) throw new ImoZipError("archive-inspection", "Truncated ZIP central-directory entry.");
    const name = decodeZipName(buffer.subarray(offset + 46, offset + 46 + nameLength), Boolean(flags & 0x0800));
    assertSafeFlatEntryName(name);
    if (names.has(name)) throw new ImoZipError("archive-inspection", `Duplicate archive entry name: ${name}`);
    names.add(name);
    if (flags & 0x0001 || flags & 0x0040) throw new ImoZipError("archive-inspection", `Encrypted ZIP entry is not supported: ${name}`);
    if (![0, 8].includes(method)) throw new ImoZipError("archive-inspection", `Unsupported ZIP compression method for ${name}.`);
    if (uncompressedSize > limits.maxEntryUncompressedBytes) throw new ImoZipError("archive-inspection", `ZIP entry exceeds per-file limit: ${name}`);
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) throw new ImoZipError("archive-inspection", `ZIP uncompressed size exceeds ${limits.maxTotalUncompressedBytes} bytes.`);
    // If POSIX mode is present, allow only regular files. Windows-produced
    // archives commonly leave this field at zero, which is also accepted.
    if ((versionMadeBy >>> 8) === 3) {
      const mode = externalAttributes >>> 16;
      const type = mode & 0o170000;
      if (type && type !== 0o100000) throw new ImoZipError("archive-inspection", `Unsafe special ZIP entry: ${name}`);
    }
    entries.push({ name, flags, method, crc, compressedSize, uncompressedSize, localHeaderOffset });
    offset = entryEnd;
  }
  if (offset !== centralOffset + centralSize) throw new ImoZipError("archive-inspection", "Unexpected ZIP central-directory data.");
  return { entries, totalUncompressedBytes };
}

async function readZipEntry(buffer, entry, limits = ZIP_LIMITS) {
  const offset = entry.localHeaderOffset;
  if (readUInt32(buffer, offset, "archive-extraction") !== 0x04034b50) throw new ImoZipError("archive-extraction", `Invalid local ZIP header for ${entry.name}.`);
  const flags = readUInt16(buffer, offset + 6, "archive-extraction");
  const method = readUInt16(buffer, offset + 8, "archive-extraction");
  const nameLength = readUInt16(buffer, offset + 26, "archive-extraction");
  const extraLength = readUInt16(buffer, offset + 28, "archive-extraction");
  if (flags !== entry.flags || method !== entry.method) throw new ImoZipError("archive-extraction", `ZIP header mismatch for ${entry.name}.`);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw new ImoZipError("archive-extraction", `Truncated ZIP payload for ${entry.name}.`);
  const compressed = buffer.subarray(dataStart, dataEnd);
  let data;
  try {
    data = entry.method === 0
      ? Buffer.from(compressed)
      : await new Promise((resolve, reject) => inflateRaw(compressed, { maxOutputLength: limits.maxEntryUncompressedBytes }, (error, output) => error ? reject(error) : resolve(output)));
  } catch (error) {
    throw new ImoZipError("archive-extraction", `Cannot decompress ${entry.name}: ${error.message}`, { cause: error });
  }
  if (data.length !== entry.uncompressedSize) throw new ImoZipError("archive-extraction", `ZIP size check failed for ${entry.name}.`);
  if (crc32(data) !== entry.crc) throw new ImoZipError("archive-extraction", `ZIP checksum failed for ${entry.name}.`);
  return data;
}

function decodeXml(buffer) {
  if (buffer.length > ZIP_LIMITS.maxXmlBytes) throw new ImoZipError("xml", `oferty.xml exceeds ${ZIP_LIMITS.maxXmlBytes} bytes.`);
  const declaration = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("ascii").match(/<\?xml\s+[^>]*encoding\s*=\s*["']([^"']+)["']/i);
  const requested = declaration?.[1]?.toLowerCase().replace(/_/g, "-") || "utf-8";
  const encoding = { utf8: "utf-8", "utf-8": "utf-8", "windows-1250": "windows-1250", "cp1250": "windows-1250", "iso-8859-2": "iso-8859-2" }[requested];
  if (!encoding) throw new ImoZipError("xml", `Unsupported XML encoding: ${requested}`);
  try { return new TextDecoder(encoding, { fatal: true }).decode(buffer); }
  catch (error) { throw new ImoZipError("xml", `Cannot decode XML as ${encoding}: ${error.message}`, { cause: error }); }
}

function decodeXmlEntities(value) {
  const entityPattern = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/giu;
  if (value.replace(entityPattern, "").includes("&")) throw new ImoZipError("xml", "Malformed XML entity reference.");
  return value.replace(entityPattern, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    const value = entity.slice(2, -1);
    const codePoint = value[0].toLowerCase() === "x" ? Number.parseInt(value.slice(1), 16) : Number.parseInt(value, 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) throw new ImoZipError("xml", `Invalid XML entity: ${entity}`);
    return String.fromCodePoint(codePoint);
  });
}

function parseAttributes(source) {
  const attributes = Object.create(null);
  const expression = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  let cursor = 0;
  let match;
  while ((match = expression.exec(source))) {
    if (!/^\s*$/u.test(source.slice(cursor, match.index))) throw new ImoZipError("xml", `Malformed XML attributes: ${source}`);
    const name = match[1];
    if (Object.hasOwn(attributes, name)) throw new ImoZipError("xml", `Duplicate XML attribute: ${name}`);
    attributes[name] = decodeXmlEntities(match[2] ?? match[3] ?? "");
    cursor = expression.lastIndex;
  }
  if (!/^\s*$/u.test(source.slice(cursor))) throw new ImoZipError("xml", `Malformed XML attributes: ${source}`);
  return attributes;
}

function findTagEnd(xml, start) {
  let quote = null;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) { if (character === quote) quote = null; }
    else if (character === '"' || character === "'") quote = character;
    else if (character === ">") return index;
  }
  throw new ImoZipError("xml", "Unterminated XML tag.");
}

function parseXml(xml) {
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new ImoZipError("xml", "DOCTYPE and ENTITY declarations are not allowed.");
  const document = { name: "#document", attributes: Object.create(null), children: [], texts: [] };
  const stack = [document];
  let cursor = 0;
  while (cursor < xml.length) {
    if (xml[cursor] !== "<") {
      const end = xml.indexOf("<", cursor);
      const text = xml.slice(cursor, end < 0 ? xml.length : end);
      if (text) stack.at(-1).texts.push(decodeXmlEntities(text));
      cursor = end < 0 ? xml.length : end;
      continue;
    }
    if (xml.startsWith("<!--", cursor)) {
      const end = xml.indexOf("-->", cursor + 4);
      if (end < 0) throw new ImoZipError("xml", "Unterminated XML comment.");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", cursor)) {
      const end = xml.indexOf("]]>", cursor + 9);
      if (end < 0) throw new ImoZipError("xml", "Unterminated CDATA section.");
      stack.at(-1).texts.push(xml.slice(cursor + 9, end));
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", cursor)) {
      const end = xml.indexOf("?>", cursor + 2);
      if (end < 0) throw new ImoZipError("xml", "Unterminated XML processing instruction.");
      cursor = end + 2;
      continue;
    }
    const end = findTagEnd(xml, cursor + 1);
    const source = xml.slice(cursor + 1, end).trim();
    if (!source || source.startsWith("!")) throw new ImoZipError("xml", "Unsupported XML declaration.");
    if (source.startsWith("/")) {
      const name = source.slice(1).trim();
      if (!/^[\w:.-]+$/u.test(name) || stack.length === 1 || stack.at(-1).name !== name) throw new ImoZipError("xml", `Malformed XML closing tag: ${source}`);
      stack.pop();
    } else {
      const selfClosing = source.endsWith("/");
      const content = (selfClosing ? source.slice(0, -1) : source).trim();
      const match = content.match(/^([\w:.-]+)([\s\S]*)$/u);
      if (!match) throw new ImoZipError("xml", `Malformed XML start tag: ${source}`);
      const node = { name: match[1], attributes: parseAttributes(match[2]), children: [], texts: [] };
      stack.at(-1).children.push(node);
      if (!selfClosing) stack.push(node);
    }
    cursor = end + 1;
  }
  if (stack.length !== 1 || document.children.length !== 1 || document.texts.some((text) => text.trim())) throw new ImoZipError("xml", "Malformed XML document structure.");
  return document.children[0];
}

function directChildren(node, name) {
  return node.children.filter((child) => child.name === name);
}

function firstDirectChild(node, name) {
  return directChildren(node, name)[0] || null;
}

function textContent(node) {
  return [...node.texts, ...node.children.map(textContent)].join("").trim();
}

function childText(node, name) {
  const child = firstDirectChild(node, name);
  return child ? textContent(child) : null;
}

function descriptionText(param) {
  const lines = directChildren(param, "linia");
  return lines.length ? lines.map(textContent).join("\n") : textContent(param);
}

function readHeader(header) {
  return Object.fromEntries(["informacje", "agencja", "data", "wersja", "cel", "zawartosc_pliku"].map((name) => [name, childText(header, name)]));
}

function normalizedSectionValue(value) {
  return String(value || "").trim().toLowerCase();
}

function rawOfferFromXml(offer, { kategoria, typ } = {}) {
  const raw = Object.create(null);
  raw.id = childText(offer, "id") || "";
  const price = firstDirectChild(offer, "cena");
  if (price) {
    raw.cena = textContent(price);
    if (price.attributes.waluta) raw.waluta = price.attributes.waluta;
  }
  const location = firstDirectChild(offer, "location");
  if (location) {
    for (const area of directChildren(location, "area")) {
      const level = String(area.attributes.level || "").trim();
      if (/^[1-5]$/u.test(level)) raw[`location_level_${level}`] = textContent(area);
    }
  }
  for (const param of directChildren(offer, "param")) {
    const name = String(param.attributes.nazwa || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(name) || ["__proto__", "constructor", "prototype"].includes(name)) throw new ImoZipError("xml", `Unsafe or missing <param nazwa>: ${name || "(empty)"}`);
    raw[name] = name === "opis" ? descriptionText(param) : textContent(param);
  }
  // Parent <dzial> attributes are authoritative. Do this after <param>
  // extraction so no arbitrary child param can silently change section identity.
  if (kategoria != null) raw.kategoria = kategoria;
  if (typ != null) raw.typ = typ;
  return Object.fromEntries(Object.entries(raw));
}

function validDeletedOfferId(value) {
  const id = String(value || "").trim();
  if (!/^\d+$/u.test(id)) throw new ImoZipError("xml", `Invalid <oferta_usun> id: ${id || "(missing)"}`);
  return id;
}

function deletedOfferIds(root, list) {
  // The observed differential export puts <oferta_usun> inside its owning
  // <dzial>. Accept direct list/document records too for narrow compatibility,
  // but never discover arbitrary nested nodes.
  const records = [
    ...directChildren(list, "oferta_usun"),
    ...directChildren(root, "oferta_usun"),
    ...directChildren(list, "dzial").flatMap((section) => directChildren(section, "oferta_usun")),
  ];
  const ids = [];
  const seen = new Set();
  for (const record of records) {
    const idNodes = directChildren(record, "id");
    if (idNodes.length !== 1) throw new ImoZipError("xml", "Each <oferta_usun> must contain exactly one <id>.");
    const id = validDeletedOfferId(textContent(idNodes[0]));
    if (seen.has(id)) throw new ImoZipError("xml", `Duplicate <oferta_usun> id: ${id}`);
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function buildRawOffers(root) {
  if (root.name !== "plik") throw new ImoZipError("xml", `Expected <plik> root, received <${root.name}>.`);
  const header = firstDirectChild(root, "header");
  const list = firstDirectChild(root, "lista_ofert");
  if (!header || !list) throw new ImoZipError("xml", "Expected <header> and <lista_ofert> elements.");
  const rawOffers = [];
  for (const section of directChildren(list, "dzial")) {
    const kategoria = normalizedSectionValue(section.attributes.tab);
    const typ = normalizedSectionValue(section.attributes.typ);
    if (!kategoria || !typ) throw new ImoZipError("xml", "Each <dzial> must provide non-empty tab and typ attributes.");
    // Repeated and empty sections are valid: every section is enumerated and
    // contributes zero or more independently-authoritative child offers.
    for (const offer of directChildren(section, "oferta")) rawOffers.push({ raw: rawOfferFromXml(offer, { kategoria, typ }), index: rawOffers.length });
  }
  // This fallback preserves prior synthetic/legacy XML fixture support only.
  // Real OfertyNET XML uses <dzial>; when present, its attributes always win.
  for (const offer of directChildren(list, "oferta")) rawOffers.push({ raw: rawOfferFromXml(offer), index: rawOffers.length });

  const offerIds = new Set();
  for (const { raw } of rawOffers) {
    const id = String(raw.id || "").trim();
    if (!id) throw new ImoZipError("xml-adapter", "Cannot register an XML offer without an IMO id.");
    if (offerIds.has(id)) throw new ImoZipError("xml-adapter", `Duplicate IMO id: ${id}`);
    offerIds.add(id);
  }
  const deletes = deletedOfferIds(root, list);
  for (const id of deletes) {
    if (offerIds.has(id)) throw new ImoZipError("xml", `IMO offer ${id} appears as both <oferta_usun> and <oferta>.`);
  }
  return { header: readHeader(header), offers: rawOffers, deletedOfferIds: deletes };
}

function photoOperations(root) {
  const photos = firstDirectChild(root, "zdjecia");
  if (!photos) return [];
  const operations = [];
  for (const record of directChildren(photos, "zdjecie")) {
    const action = String(record.attributes.akcja || childText(record, "akcja") || "(missing)").trim().toLowerCase() || "(missing)";
    operations.push({
      action,
      filename: childText(record, "nazwa") || null,
    });
  }
  return operations;
}

function photoOperationCounts(operations) {
  const counts = Object.create(null);
  for (const { action } of operations) counts[action] = (counts[action] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

const photoPrefixByOfferKind = new Map([
  ["domy:sprzedaz", "ds"], ["domy:wynajem", "dw"],
  ["dzialki:sprzedaz", "zs"], ["dzialki:wynajem", "zw"],
  ["lokale:sprzedaz", "ls"], ["lokale:wynajem", "lw"],
  ["mieszkania:sprzedaz", "ms"], ["mieszkania:wynajem", "mw"],
]);
const photoNamePattern = /^propertycorp_imo_(ds|dw|zs|zw|ls|lw|ms|mw)_(\d+)_(\d+)\.jpe?g$/iu;

function canonicalOfferIdentity({ kategoria, typ, id }) {
  const category = normalizedSectionValue(kategoria);
  const transaction = normalizedSectionValue(typ);
  const offerId = String(id || "").trim();
  const prefix = photoPrefixByOfferKind.get(`${category}:${transaction}`);
  if (!prefix) throw new ImoZipError("xml-adapter", `Unsupported XML offer category/transaction: ${category || "(missing)"}/${transaction || "(missing)"}.`);
  if (!offerId) throw new ImoZipError("xml-adapter", "Cannot register an XML offer without an IMO id.");
  return `${prefix}:${offerId}`;
}

function canonicalPhotoIdentity(prefix, id) {
  return `${String(prefix).trim().toLowerCase()}:${String(id).trim()}`;
}

function mapPhysicalPhotos(entries, offers, { packageMode } = {}) {
  const offerByIdentity = new Map();
  const offersById = new Map();
  for (const offer of offers) {
    const id = String(offer.raw.id).trim();
    const identity = canonicalOfferIdentity({ ...offer.raw, id });
    if (offerByIdentity.has(identity)) throw new ImoZipError("xml-adapter", `Duplicate IMO id: ${id}`);
    offerByIdentity.set(identity, offer.raw);
    offersById.set(id, [...(offersById.get(id) || []), { identity, raw: offer.raw }]);
  }
  const mapping = new Map();
  for (const entry of entries) {
    if (!/\.jpe?g$/iu.test(entry.name)) continue;
    const match = entry.name.match(photoNamePattern);
    if (!match) throw new ImoZipError("media", `Malformed IMO physical image filename: ${entry.name}`);
    const [, prefix, id, orderText] = match;
    const order = Number(orderText);
    if (!Number.isSafeInteger(order) || order < 1) throw new ImoZipError("media", `Invalid image order in filename: ${entry.name}`);
    const identity = canonicalPhotoIdentity(prefix, id);
    const raw = offerByIdentity.get(identity);
    if (!raw && !offersById.has(id)) {
      if (packageMode === "roznica") throw new ImoZipError("media", `Physical image maps to a non-upsert differential XML offer ${id}: ${entry.name}`);
      throw new ImoZipError("media", `Physical image maps to nonexistent XML offer ${id}: ${entry.name}`);
    }
    if (!raw) {
      throw new ImoZipError("media", `Image category/transaction prefix does not match XML offer ${id}: ${entry.name}`);
    }
    const images = mapping.get(identity) || new Map();
    if (images.has(order)) throw new ImoZipError("media", `Duplicate physical image order ${order} for IMO offer ${id}.`);
    images.set(order, entry);
    mapping.set(identity, images);
  }
  for (const [identity, images] of mapping) {
    const raw = offerByIdentity.get(identity);
    for (const [order, entry] of [...images.entries()].sort(([left], [right]) => left - right)) raw[`zdjecie${order}`] = entry.name;
  }
  return { mapping, offerByIdentity };
}

/**
 * Reads a complete OfertyNET ZIP without ever extracting into a live path.
 * The returned raw offers deliberately match normalizeOffer's existing input
 * contract; archive/XML parsing stays outside the domain layer.
 */
export async function extractAndAdaptImoZip({ archivePath, stagingDirectory, limits = ZIP_LIMITS }) {
  const archiveStat = await stat(archivePath);
  if (!archiveStat.isFile()) throw new ImoZipError("source", `ZIP source is not a regular file: ${archivePath}`);
  if (archiveStat.size > limits.maxArchiveBytes) throw new ImoZipError("archive-inspection", `ZIP archive exceeds ${limits.maxArchiveBytes} bytes.`);
  const archiveBuffer = await readFile(archivePath);
  const inspection = inspectZip(archiveBuffer, limits);
  const xmlEntries = inspection.entries.filter((entry) => entry.name.toLowerCase() === "oferty.xml");
  if (xmlEntries.length !== 1) throw new ImoZipError("archive-inspection", "ZIP must contain exactly one flat oferty.xml entry.");
  const extractionDirectory = join(stagingDirectory, "archive-extract");
  const mediaDirectory = join(extractionDirectory, "photos");
  await mkdir(mediaDirectory, { recursive: true });
  const xmlBuffer = await readZipEntry(archiveBuffer, xmlEntries[0], limits);
  const xmlPath = join(extractionDirectory, "oferty.xml");
  await writeFile(xmlPath, xmlBuffer);
  const root = parseXml(decodeXml(xmlBuffer));
  const { header, offers, deletedOfferIds: deletes } = buildRawOffers(root);
  const packageMode = normalizedSectionValue(header.zawartosc_pliku);
  const operations = photoOperations(root);
  const { mapping } = mapPhysicalPhotos(inspection.entries, offers, { packageMode });
  const physicalEntries = inspection.entries.filter((entry) => /\.jpe?g$/iu.test(entry.name));
  const media = new Map();
  for (const entry of physicalEntries) {
    const destination = join(mediaDirectory, entry.name);
    await writeFile(destination, await readZipEntry(archiveBuffer, entry, limits));
    media.set(entry.name, destination);
  }
  const rawSnapshot = Object.fromEntries(offers.map(({ raw, index }) => [`xml-offer-${index}`, raw]));
  const offersWithoutMedia = offers
    .filter(({ raw }) => !mapping.has(canonicalOfferIdentity(raw)))
    .map(({ raw }) => String(raw.id));
  const otherEntries = inspection.entries.filter((entry) => entry !== xmlEntries[0] && !/\.jpe?g$/iu.test(entry.name)).map((entry) => entry.name);
  return {
    rawSnapshot,
    media,
    archive: {
      filename: basename(archivePath), byteSize: archiveStat.size, sha256: createHash("sha256").update(archiveBuffer).digest("hex"),
      entryCount: inspection.entries.length, totalUncompressedBytes: inspection.totalUncompressedBytes,
      header, physicalMediaCount: physicalEntries.length, mappedMediaCount: media.size, unmappedMedia: [], offersWithoutMedia,
      photoOperationCounts: photoOperationCounts(operations), photoOperations: operations,
      deletedOfferIds: deletes, upsertOfferIds: offers.map(({ raw }) => String(raw.id).trim()),
      ignoredEntries: otherEntries,
    },
    extracted: { xmlPath, mediaDirectory },
  };
}
