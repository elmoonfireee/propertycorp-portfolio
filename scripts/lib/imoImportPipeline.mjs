import { createHash, randomUUID } from "node:crypto";
import {
  access, copyFile, cp, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile,
} from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { parseOfferDescription } from "../../src/domain/offers/parseOfferDescription.js";
import { normalizeOffer } from "../../src/domain/offers/normalizeOffer.js";
import { resolvePropertyCorpStatePaths } from "../../server/statePaths.mjs";
import { validateOfferSnapshot } from "./offerValidation.mjs";
import { extractAndAdaptImoZip } from "./imoZipAdapter.mjs";

export const IMO_IMPORT_SCHEMA_VERSION = 1;
export const MAX_REMOVAL_PERCENT = 50;
export const MIN_OFFERS_FOR_MASS_REMOVAL_GUARD = 5;

export class ImportPipelineError extends Error {
  constructor(stage, message, { cause, report } = {}) {
    super(message, { cause });
    this.name = "ImportPipelineError";
    this.stage = stage;
    this.report = report;
  }
}

export class ImportLockError extends ImportPipelineError {
  constructor(lockPath, lock) {
    super("lock", `Another apply or rollback owns ${lockPath}.${lock ? ` Lock owner: ${JSON.stringify(lock)}` : ""}`);
    this.name = "ImportLockError";
  }
}

function nowIso() {
  return new Date().toISOString();
}

function makeRunId(prefix = "import") {
  return `${prefix}-${nowIso().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : stableJson(value)).digest("hex");
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
}

async function removeIfPresent(path) {
  if (await exists(path)) await rm(path, { recursive: true, force: true });
}

async function listFilesByBasename(directory) {
  if (!(await exists(directory))) return new Map();
  const result = new Map();
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) {
        if (result.has(entry.name)) throw new ImportPipelineError("media", `Duplicate media filename in one package: ${entry.name}`);
        result.set(entry.name, child);
      }
    }
  }
  await visit(directory);
  return result;
}

function referencedImageNames(rawSnapshot) {
  const names = new Set();
  for (const rawOffer of Object.values(rawSnapshot || {})) {
    for (const [key, value] of Object.entries(rawOffer || {})) {
      if (!/^zdjecie\d+$/i.test(key) || !value) continue;
      const filename = String(value).trim();
      if (!filename || [".", ".."].includes(filename) || /[\\/\0]/u.test(filename) || basename(filename) !== filename) {
        throw new ImportPipelineError("media", `Unsafe IMO image filename: ${String(value)}`);
      }
      names.add(filename);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right, "en"));
}

async function fileHash(path) {
  const file = await readFile(path);
  return sha256(file);
}

async function mediaManifest(names, sourceByFilename) {
  const files = [];
  for (const filename of [...names].sort((left, right) => left.localeCompare(right, "en"))) {
    const path = sourceByFilename.get(filename);
    if (path) files.push({ filename, sha256: await fileHash(path) });
    else files.push({ filename, sha256: null });
  }
  return { files, hash: sha256(files) };
}

function rawOfferMap(rawSnapshot) {
  return new Map(Object.values(rawSnapshot).map((offer) => [String(offer.id).trim(), offer]));
}

function cloneRawSnapshot(rawSnapshot) {
  // Accepted snapshots are JSON documents. A JSON clone keeps a differential
  // dry-run from sharing or mutating any baseline offer object.
  return JSON.parse(JSON.stringify(rawSnapshot));
}

function snapshotKeysByOfferId(rawSnapshot) {
  return new Map(Object.entries(rawSnapshot).map(([key, offer]) => [String(offer?.id || "").trim(), key]));
}

function nextSnapshotKey(snapshot, id) {
  const base = `imo-offer-${id}`;
  if (!Object.hasOwn(snapshot, base)) return base;
  let suffix = 2;
  while (Object.hasOwn(snapshot, `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function operationImageNames(rawOffer) {
  return referencedImageNames({ operation: rawOffer });
}

function mergeDifferentialPackage({ currentSnapshot, currentMedia, differentialSnapshot, incomingMedia, deletedOfferIds }) {
  const candidateSnapshot = cloneRawSnapshot(currentSnapshot);
  const keysById = snapshotKeysByOfferId(candidateSnapshot);
  for (const id of deletedOfferIds) {
    const key = keysById.get(id);
    if (!key) {
      throw new ImportPipelineError(
        "differential",
        `Differential package requests deletion of unknown current IMO id: ${id}. Refusing to infer a delete.`,
      );
    }
    delete candidateSnapshot[key];
    keysById.delete(id);
  }

  const changedOfferIds = [];
  for (const rawOffer of Object.values(differentialSnapshot)) {
    const id = String(rawOffer?.id || "").trim();
    if (!id) throw new ImportPipelineError("differential", "Differential package contains an upsert without an IMO id.");
    const key = keysById.get(id) || nextSnapshotKey(candidateSnapshot, id);
    candidateSnapshot[key] = cloneRawSnapshot({ offer: rawOffer }).offer;
    keysById.set(id, key);
    changedOfferIds.push(id);

    // A differential offer owns its complete resulting media set. Its XML
    // references (including names supplied by physical JPG mapping) must be
    // present in this package; an old baseline byte must never mask a missing
    // changed-offer image.
    for (const filename of operationImageNames(rawOffer)) {
      if (!incomingMedia.has(filename)) {
        throw new ImportPipelineError("media", `Differential offer ${id} references image absent from the package: ${filename}`);
      }
    }
  }
  const candidateMedia = new Map(currentMedia);
  for (const [filename, path] of incomingMedia) candidateMedia.set(filename, path);
  return { candidateSnapshot, candidateMedia, changedOfferIds };
}

function differentialPhotoOperationAudit(photoOperations, differentialSnapshot) {
  const resultingChangedOfferMedia = new Set(
    Object.values(differentialSnapshot).flatMap((rawOffer) => operationImageNames(rawOffer)),
  );
  return photoOperations.map(({ action, filename }) => {
    const presentInChangedOfferResult = filename ? resultingChangedOfferMedia.has(filename) : null;
    return {
      action,
      filename,
      presentInChangedOfferResult,
      // This records the observed IMO pattern only. Candidate media always
      // comes from the upsert offer's complete physical/reference set, never
      // from an action record or this inferred diagnostic.
      observedRemovalConsistent: action === "u" && filename ? !presentInChangedOfferResult : null,
    };
  });
}

function renderedInline(parts = []) {
  // RichOfferDescription renders only these three inline fields. In
  // particular, the parser's underline hint and diagnostics are not rendered.
  return parts.map((part) => ({
    text: part.text,
    strong: Boolean(part.strong),
    emphasis: Boolean(part.emphasis),
  }));
}

function renderedBlock(block) {
  if (block.type === "paragraph") return { type: block.type, text: block.text, inline: renderedInline(block.inline) };
  if (block.type === "list") {
    return {
      type: block.type,
      items: block.items.map((item) => ({ label: item.label, content: renderedInline(item.content) })),
    };
  }
  if (block.type === "keyValue") return { type: block.type, label: block.label, content: renderedInline(block.content) };
  if (block.type === "summary") return { type: block.type, label: block.label, measurement: block.measurement };
  if (block.type === "subheading") return { type: block.type, title: block.title };
  return { type: block.type };
}

function renderedSection(section) {
  if (section.type === "layout") {
    return {
      type: section.type,
      title: section.title,
      groups: section.groups.map((group) => ({
        title: group.title,
        rows: group.rows.map(({ label, value, note, isSummary }) => ({ label, value, note, isSummary })),
      })),
      tailBlocks: section.tailBlocks.map(renderedBlock),
    };
  }
  return {
    type: section.type,
    title: section.title,
    source: section.source,
    legacyList: Boolean(section.legacyList),
    blocks: section.blocks.map(renderedBlock),
  };
}

function inlineText(parts = []) {
  return parts.map((part) => String(part.text || "")).join(" ").replace(/\s+/gu, " ").trim();
}

function renderedBlockText(block) {
  if (block.type === "paragraph") return inlineText(block.inline);
  if (block.type === "list") return block.items.map((item) => [item.label, inlineText(item.content)].filter(Boolean).join(": ")).filter(Boolean).join("\n");
  if (block.type === "keyValue") return [block.label, inlineText(block.content)].filter(Boolean).join(": ");
  if (block.type === "summary") return [block.label, block.measurement].filter(Boolean).join(": ");
  if (block.type === "subheading") return block.title || "";
  return "";
}

function renderedDescriptionText(description) {
  const groups = [
    description.presentation.intro.map(renderedBlockText),
    ...description.presentation.sections.map((section) => {
      if (section.type === "layout") {
        return [
          section.title,
          ...section.groups.flatMap((group) => [
            group.title,
            ...group.rows.map((row) => [row.label, row.value, row.note].filter(Boolean).join(": ")),
          ]),
          ...section.tailBlocks.map(renderedBlockText),
        ];
      }
      return [section.title, ...section.blocks.map(renderedBlockText)];
    }),
    description.presentation.closing.map(renderedBlockText),
    description.presentation.legal ? [inlineText(description.presentation.legal.inline)] : [],
  ];
  return groups.flat().filter(Boolean).join("\n");
}

const technicalFooter = /^oferta wysłana z programu imo dla biur nieruchomości\.?$/iu;

function withoutKnownTechnicalFooter(value) {
  return String(value || "").split("\n").filter((line) => !technicalFooter.test(line.trim())).join("\n").trim();
}

function descriptionSemantic(rawOffer, normalizedOffer) {
  const model = parseOfferDescription(normalizedOffer.description, { agent: normalizedOffer.agent });
  const presentation = {
    intro: model.intro.map(renderedBlock),
    sections: model.sections.map(renderedSection),
    closing: model.closing.map(renderedBlock),
    legal: model.legal ? { inline: renderedInline(model.legal.inline) } : null,
  };
  const semantic = { presentation };
  const text = renderedDescriptionText(semantic);
  return {
    ...semantic,
    text,
    textHash: sha256(text),
    presentationHash: sha256(presentation),
    sourceHtml: normalizedOffer.description.html,
    sourceText: normalizedOffer.description.text,
    sourceRepresentation: Array.isArray(rawOffer?.opis) ? "legacy-line-array" : "xml-or-string",
    rawSourceHash: sha256(rawOffer?.opis ?? null),
  };
}

function descriptionSummary(description) {
  return {
    lineCount: description.text ? description.text.split("\n").length : 0,
    canonicalTextHash: description.textHash,
    presentationHash: description.presentationHash,
    firstCharacters: description.text.slice(0, 150),
    lastCharacters: description.text.slice(-150),
    sourceRepresentation: description.sourceRepresentation,
  };
}

function descriptionDifference(before, after) {
  const equivalentForSite = sameCanonical(before.presentation, after.presentation);
  const rawSourceChanged = before.rawSourceHash !== after.rawSourceHash;
  const footerOnly = withoutKnownTechnicalFooter(before.sourceText) === withoutKnownTechnicalFooter(after.sourceText)
    && before.sourceText !== after.sourceText;
  return {
    changedForSite: !equivalentForSite,
    equivalentForSite,
    onlyKnownBoilerplate: equivalentForSite && footerOnly,
    onlySerializationOrHtmlEntityHandling: equivalentForSite && rawSourceChanged && !footerOnly,
  };
}

function effectiveDetails(details) {
  // These pairs are rendering aliases in offerPresentation: it uses the
  // first non-empty building value and the visible balcony label. Compare
  // that consumer-facing shape, not the source field which happened to win.
  const { residentialBuildingType, balcony, balconyType, ...rest } = details;
  return {
    ...rest,
    buildingType: details.buildingType || residentialBuildingType || null,
    balcony: balconyType || (balcony ? "Balkon" : null),
  };
}

function semanticOffer(rawOffer) {
  const normalized = normalizeOffer(rawOffer);
  const description = descriptionSemantic(rawOffer, normalized);
  return {
    normalized,
    price: normalized.price,
    location: normalized.location,
    media: normalized.images.map(({ order, filename }) => ({ order, filename })),
    description,
    data: {
      transaction: normalized.transaction,
      type: normalized.type,
      title: normalized.title,
      area: normalized.area,
      rooms: normalized.rooms,
      floor: normalized.floor,
      floors: normalized.floors,
      yearBuilt: normalized.yearBuilt,
      flags: normalized.flags,
      agent: normalized.agent,
      details: effectiveDetails(normalized.details),
      attributes: normalized.attributes,
      dates: normalized.dates,
    },
  };
}

function sameCanonical(left, right) {
  return stableJson(left) === stableJson(right);
}

function changedFieldPaths(before, after, prefix = "") {
  if (sameCanonical(before, after)) return [];
  const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
  if (!isObject(before) || !isObject(after)) return [prefix];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.flatMap((key) => changedFieldPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}

function valueAtPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function changedValues(before, after, paths) {
  return Object.fromEntries(paths.map((path) => [path, {
    before: valueAtPath(before, path),
    candidate: valueAtPath(after, path),
  }]));
}

export function compareOfferValues(beforeRaw, afterRaw) {
  const before = semanticOffer(beforeRaw);
  const after = semanticOffer(afterRaw);
  const description = descriptionDifference(before.description, after.description);
  const fields = {
    price: changedFieldPaths(before.price, after.price),
    description: description.changedForSite ? ["renderedDescription"] : [],
    location: changedFieldPaths(before.location, after.location),
    media: sameCanonical(before.media, after.media) ? [] : ["orderedFilenames"],
    data: changedFieldPaths(before.data, after.data),
  };
  const categories = [];
  if (fields.description.length) categories.push("description changed");
  if (fields.price.length) categories.push("price changed");
  if (fields.location.length) categories.push("location changed");
  if (fields.media.length) categories.push("media references changed");
  if (fields.data.length) categories.push("data changed");
  return { before, after, description, fields, categories };
}

export function describeOfferComparison(beforeRaw, afterRaw) {
  const comparison = compareOfferValues(beforeRaw, afterRaw);
  return {
    id: String(afterRaw?.id || beforeRaw?.id || "").trim(),
    categories: comparison.categories,
    changedFieldNames: comparison.fields,
    changedDataValues: changedValues(comparison.before.data, comparison.after.data, comparison.fields.data),
    price: { before: comparison.before.price, candidate: comparison.after.price },
    area: { before: comparison.before.data.area, candidate: comparison.after.data.area },
    rooms: { before: comparison.before.data.rooms, candidate: comparison.after.data.rooms },
    publicCoordinates: {
      before: { latitude: comparison.before.location.latitude, longitude: comparison.before.location.longitude },
      candidate: { latitude: comparison.after.location.latitude, longitude: comparison.after.location.longitude },
    },
    title: {
      before: comparison.before.data.title,
      candidate: comparison.after.data.title,
      beforeAdvertisementText: beforeRaw.advertisement_text || null,
      candidateAdvertisementText: afterRaw.advertisement_text || null,
    },
    dates: { before: comparison.before.data.dates, candidate: comparison.after.data.dates },
    agentName: { before: comparison.before.data.agent.name, candidate: comparison.after.data.agent.name },
    description: {
      before: descriptionSummary(comparison.before.description),
      candidate: descriptionSummary(comparison.after.description),
      difference: comparison.description,
    },
    media: { before: comparison.before.media, candidate: comparison.after.media },
  };
}

export function compareOfferSnapshots(currentSnapshot, candidateSnapshot) {
  const current = rawOfferMap(currentSnapshot);
  const candidate = rawOfferMap(candidateSnapshot);
  const currentIds = [...current.keys()].sort();
  const candidateIds = [...candidate.keys()].sort();
  const addedIds = candidateIds.filter((id) => !current.has(id));
  const removedIds = currentIds.filter((id) => !candidate.has(id));
  const retainedIds = candidateIds.filter((id) => current.has(id));
  const changes = retainedIds.flatMap((id) => {
    const before = current.get(id);
    const after = candidate.get(id);
    const comparison = compareOfferValues(before, after);
    if (!comparison.categories.length) return [];
    return [{ id, categories: comparison.categories, changedFieldNames: comparison.fields }];
  });
  return {
    addedIds, removedIds, retainedIds,
    changed: changes,
    changedIds: changes.map(({ id }) => id),
    unchangedIds: retainedIds.filter((id) => !changes.some((change) => change.id === id)),
  };
}

function evaluateGuardrails(currentCount, candidateCount, removedCount) {
  const triggers = [];
  if (candidateCount === 0) triggers.push({ code: "ZERO_OFFER_SNAPSHOT", message: "Incoming authoritative snapshot contains zero offers." });
  const removalPercent = currentCount ? (removedCount / currentCount) * 100 : 0;
  if (currentCount >= MIN_OFFERS_FOR_MASS_REMOVAL_GUARD && removedCount >= 3 && removalPercent > MAX_REMOVAL_PERCENT) {
    triggers.push({
      code: "MASS_REMOVAL",
      message: `${removedCount}/${currentCount} current offers (${removalPercent.toFixed(1)}%) would disappear; threshold is more than ${MAX_REMOVAL_PERCENT}% with at least 3 removed offers.`,
    });
  }
  return { passed: triggers.length === 0, requiresForce: triggers.length > 0, removalPercent, triggers };
}

function descriptionDiagnostics(rawSnapshot, offers) {
  const diagnosticById = [];
  for (const offer of offers) {
    const raw = rawOfferMap(rawSnapshot).get(offer.externalId);
    const model = parseOfferDescription(raw?.opis, { agent: offer.agent });
    const diagnostics = model.diagnostics;
    if (diagnostics.errors.length || diagnostics.warnings.length || diagnostics.sourceMode === "prose-only") {
      diagnosticById.push({
        id: offer.externalId,
        sourceMode: diagnostics.sourceMode,
        errors: diagnostics.errors,
        warnings: diagnostics.warnings,
        proseOnly: diagnostics.sourceMode === "prose-only",
      });
    }
  }
  return diagnosticById;
}

function normalizedDiagnosticIds(ids = []) {
  const result = [];
  for (const value of ids) {
    const id = String(value || "").trim();
    if (id && !result.includes(id)) result.push(id);
  }
  return result;
}

function offerDiagnostics(currentSnapshot, candidateSnapshot, ids) {
  const current = rawOfferMap(currentSnapshot);
  const candidate = rawOfferMap(candidateSnapshot);
  return normalizedDiagnosticIds(ids).map((id) => {
    const before = current.get(id);
    const after = candidate.get(id);
    if (before && after) return describeOfferComparison(before, after);
    return {
      id,
      status: before ? "removed" : after ? "added" : "absent-from-both-snapshots",
      categories: before ? ["removed"] : after ? ["added"] : [],
    };
  });
}

export function resolveImportPaths(repoRoot, { stateRoot, environment = process.env } = {}) {
  const statePaths = resolvePropertyCorpStatePaths({ projectRoot: repoRoot, stateRoot, environment });
  const operationalDirectory = statePaths.imoImportDirectory;
  return {
    repoRoot: statePaths.projectRoot,
    stateRoot: statePaths.stateRoot,
    usesStateRoot: statePaths.usesStateRoot,
    inputDirectory: statePaths.inputDirectory,
    currentSnapshotPath: statePaths.currentSnapshotPath,
    currentPhotosDirectory: statePaths.currentPhotosDirectory,
    publicMediaDirectory: statePaths.publicMediaDirectory,
    varDirectory: statePaths.varDirectory,
    operationalDirectory,
    stagingDirectory: join(operationalDirectory, "staging"),
    reportsDirectory: join(operationalDirectory, "reports"),
    backupsDirectory: join(operationalDirectory, "backups"),
    acceptedPackagesDirectory: join(operationalDirectory, "accepted-packages"),
    lockPath: join(operationalDirectory, "import.lock"),
  };
}

function isDifferentialPackageReport(report, archiveSha256) {
  return report?.type === "imo-import"
    && String(report?.packageMode?.value || "").trim().toLowerCase() === "roznica"
    && report?.archive?.sha256 === archiveSha256
    && (report?.applied === true || (!report?.error && report?.acceptedPackage?.accepted === true));
}

async function readJsonIfPresent(path) {
  if (!(await exists(path))) return null;
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function findAcceptedDifferentialPackage(paths, archiveSha256) {
  if (!archiveSha256) return null;
  const receipt = await readJsonIfPresent(join(paths.acceptedPackagesDirectory, `${archiveSha256}.json`));
  if (receipt?.type === "imo-differential-package" && receipt.archiveSha256 === archiveSha256) return receipt;

  // Reports written by the first PC-12D release also form a safe replay
  // ledger. This fallback recognizes successful packages if a deployment has
  // reports from before the dedicated receipt directory exists.
  if (!(await exists(paths.reportsDirectory))) return null;
  const entries = await readdir(paths.reportsDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const report = await readJsonIfPresent(join(paths.reportsDirectory, entry.name));
    if (isDifferentialPackageReport(report, archiveSha256)) {
      return { type: "imo-differential-package", archiveSha256, sourceRunId: report.runId, acceptedAt: report.timestamp, source: "report" };
    }
  }
  return null;
}

async function recordAcceptedDifferentialPackage(paths, report) {
  const archiveSha256 = report.archive?.sha256;
  if (!archiveSha256) throw new ImportPipelineError("replay", "Cannot record a differential package without its archive SHA-256.", { report });
  await ensureDirectory(paths.acceptedPackagesDirectory);
  const receiptPath = join(paths.acceptedPackagesDirectory, `${archiveSha256}.json`);
  const existing = await readJsonIfPresent(receiptPath);
  if (existing?.type === "imo-differential-package" && existing.archiveSha256 === archiveSha256) return existing;
  const receipt = {
    schemaVersion: IMO_IMPORT_SCHEMA_VERSION,
    type: "imo-differential-package",
    archiveSha256,
    sourceRunId: report.runId,
    acceptedAt: nowIso(),
    candidateManifestHash: report.manifests?.importManifest?.hash || null,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" }).catch(async (error) => {
    if (error.code !== "EEXIST") throw error;
  });
  return (await readJsonIfPresent(receiptPath)) || receipt;
}

async function readSnapshot(path, stage) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new ImportPipelineError(stage, `Cannot parse ${path}: ${error.message}`, { cause: error });
  }
}

async function copyReferencedMedia(targetDirectory, names, sourceByFilename) {
  await ensureDirectory(targetDirectory);
  for (const filename of names) {
    const source = sourceByFilename.get(filename);
    if (source) await copyFile(source, join(targetDirectory, filename));
  }
}

async function prepareCandidateFiles(stagingPath, rawSnapshot, names, mediaByFilename, { publicKeepFilePath } = {}) {
  const candidateInput = join(stagingPath, "candidate", "input");
  const candidatePhotos = join(candidateInput, "photos");
  const candidatePublicMedia = join(stagingPath, "candidate", "public-media");
  await ensureDirectory(candidateInput);
  await writeFile(join(candidateInput, "oferty.json"), `${JSON.stringify(rawSnapshot, null, 2)}\n`);
  await copyReferencedMedia(candidatePhotos, names, mediaByFilename);
  await copyReferencedMedia(candidatePublicMedia, names, mediaByFilename);
  // This is a repository marker, not IMO media. Keep it in the promoted
  // public directory so a normal import does not delete a tracked .gitkeep.
  if (publicKeepFilePath && await exists(publicKeepFilePath)) await copyFile(publicKeepFilePath, join(candidatePublicMedia, ".gitkeep"));
  return { inputSnapshot: join(candidateInput, "oferty.json"), inputPhotos: candidatePhotos, publicMedia: candidatePublicMedia };
}

function initialReport({ runId, sourcePath, mode }) {
  return {
    schemaVersion: IMO_IMPORT_SCHEMA_VERSION,
    type: "imo-import",
    runId,
    timestamp: nowIso(),
    mode,
    sourcePath,
    sourceType: null,
    archive: null,
    packageMode: null,
    operations: null,
    replay: { detected: false, sourceRunId: null },
    acceptedPackage: null,
    currentOfferCount: null,
    candidateOfferCount: null,
    addedIds: [], removedIds: [], retainedIds: [], changed: [], changedIds: [], unchangedCount: 0,
    media: { incomingFiles: [], reusedExistingFiles: [], newOrReplacedFiles: [], unchangedIncomingFiles: [], unreferencedRemovedFromCandidate: [], missingRequiredFiles: [] },
    validation: { passed: false, errors: [], summary: null },
    guardrails: { passed: false, requiresForce: false, removalPercent: null, triggers: [] },
    descriptionDiagnostics: [],
    offerDiagnostics: [],
    manifests: {},
    applied: false,
    noOp: false,
  };
}

async function prepareImport({ repoRoot, stateRoot, environment, sourceDirectory, runId, report, diagnosticIds = [] }) {
  const paths = resolveImportPaths(repoRoot, { stateRoot, environment });
  const stagingPath = join(paths.stagingDirectory, runId);
  await ensureDirectory(stagingPath);
  if (!(await exists(paths.currentSnapshotPath))) throw new ImportPipelineError("current-state", `Current snapshot is missing: ${paths.currentSnapshotPath}`, { report });
  let sourceStat;
  try { sourceStat = await stat(sourceDirectory); }
  catch (error) { throw new ImportPipelineError("source", `Cannot read source ${sourceDirectory}: ${error.message}`, { cause: error, report }); }
  const [currentSnapshot, currentMedia, publicMedia] = await Promise.all([
    readSnapshot(paths.currentSnapshotPath, "current-state"),
    listFilesByBasename(paths.currentPhotosDirectory),
    listFilesByBasename(paths.publicMediaDirectory),
  ]);
  const currentReferences = referencedImageNames(currentSnapshot);
  let currentValidation;
  try {
    currentValidation = validateOfferSnapshot(currentSnapshot, { availableFilenames: [...currentMedia.keys()] });
  } catch (error) {
    throw new ImportPipelineError("current-state", `Current accepted state is not safe to use as a media baseline: ${error.message}`, { cause: error, report });
  }
  report.currentOfferCount = currentValidation.offers.length;
  let candidateSnapshot;
  let incomingMedia;
  let candidateIncomingMedia;
  let candidateMedia;
  if (sourceStat.isFile() && extname(sourceDirectory).toLowerCase() === ".zip") {
    let adapted;
    try {
      adapted = await extractAndAdaptImoZip({ archivePath: sourceDirectory, stagingDirectory: stagingPath });
    } catch (error) {
      throw new ImportPipelineError(error.stage || "archive", error.message, { cause: error, report });
    }
    report.sourceType = "zip";
    report.archive = adapted.archive;
    const packageMode = String(adapted.archive.header.zawartosc_pliku || "").trim().toLowerCase();
    const supportedPackageMode = packageMode === "calosc" || packageMode === "roznica";
    report.packageMode = {
      value: adapted.archive.header.zawartosc_pliku,
      supported: supportedPackageMode,
      message: supportedPackageMode ? null : "Only complete (zawartosc_pliku=calosc) or supported differential (zawartosc_pliku=roznica) OfertyNET packages are safe to apply.",
    };
    incomingMedia = adapted.media;
    candidateIncomingMedia = incomingMedia;
    if (packageMode === "roznica") {
      report.operations = {
        offerDeletes: adapted.archive.deletedOfferIds,
        offerUpserts: adapted.archive.upsertOfferIds,
        changedOfferMedia: adapted.archive.upsertOfferIds,
        photoOperationCounts: adapted.archive.photoOperationCounts,
        photoOperations: adapted.archive.photoOperations,
        photoOperationAudit: differentialPhotoOperationAudit(adapted.archive.photoOperations, adapted.rawSnapshot),
      };
      const replay = await findAcceptedDifferentialPackage(paths, adapted.archive.sha256);
      if (replay) {
        // A known accepted archive is deliberately never reinterpreted against
        // later state. It is a safe no-op/reconciliation candidate, even if a
        // later full export has reintroduced an ID it once deleted.
        report.replay = { detected: true, sourceRunId: replay.sourceRunId || null, acceptedAt: replay.acceptedAt || null };
        candidateSnapshot = cloneRawSnapshot(currentSnapshot);
        candidateMedia = new Map(currentMedia);
        candidateIncomingMedia = new Map();
      } else {
        const merged = mergeDifferentialPackage({
          currentSnapshot,
          currentMedia,
          differentialSnapshot: adapted.rawSnapshot,
          incomingMedia,
          deletedOfferIds: adapted.archive.deletedOfferIds,
        });
        candidateSnapshot = merged.candidateSnapshot;
        candidateMedia = merged.candidateMedia;
      }
    } else {
      candidateSnapshot = adapted.rawSnapshot;
      // A complete ZIP is authoritative and is intentionally built from its
      // own XML and physical media, never from a historical media overlay.
      candidateMedia = new Map(incomingMedia);
    }
  } else if (sourceStat.isDirectory()) {
    const sourceSnapshotPath = join(sourceDirectory, "oferty.json");
    const sourcePhotosDirectory = join(sourceDirectory, "photos");
    if (!(await exists(sourceSnapshotPath))) throw new ImportPipelineError("source", `Source package has no oferty.json: ${sourceSnapshotPath}`, { report });
    report.sourceType = "legacy-directory";
    report.packageMode = { value: "legacy-directory", supported: true, message: null };
    candidateSnapshot = await readSnapshot(sourceSnapshotPath, "source");
    incomingMedia = await listFilesByBasename(sourcePhotosDirectory);
    candidateIncomingMedia = incomingMedia;
    // Retain JSON-directory fixtures and their differential photo semantics;
    // real OfertyNET ZIP packages do not enter this legacy branch.
    candidateMedia = new Map(currentMedia);
    for (const [filename, path] of incomingMedia) candidateMedia.set(filename, path);
  } else {
    throw new ImportPipelineError("source", "Source must be an extracted legacy directory or an .zip archive.", { report });
  }

  const candidateReferences = referencedImageNames(candidateSnapshot);
  report.media.incomingFiles = [...incomingMedia.keys()].sort();
  const missing = candidateReferences.filter((filename) => !candidateMedia.has(filename));
  report.media.missingRequiredFiles = missing;
  report.media.reusedExistingFiles = candidateReferences.filter((filename) => !candidateIncomingMedia.has(filename) && currentMedia.has(filename));
  const newOrReplaced = [];
  const unchangedIncoming = [];
  for (const filename of candidateReferences.filter((name) => candidateIncomingMedia.has(name))) {
    if (!currentMedia.has(filename) || await fileHash(currentMedia.get(filename)) !== await fileHash(candidateIncomingMedia.get(filename))) newOrReplaced.push(filename);
    else unchangedIncoming.push(filename);
  }
  report.media.newOrReplacedFiles = newOrReplaced;
  report.media.unchangedIncomingFiles = unchangedIncoming;
  report.media.unreferencedRemovedFromCandidate = [...candidateMedia.keys()].filter((name) => !candidateReferences.includes(name)).sort();

  let candidateValidation;
  try {
    candidateValidation = validateOfferSnapshot(candidateSnapshot, { availableFilenames: [...candidateMedia.keys()] });
  } catch (error) {
    report.validation.errors = error.errors || [error.message];
    report.validation.summary = error.summary || null;
    throw new ImportPipelineError("validation", error.message, { cause: error, report });
  }
  report.validation = { passed: true, errors: [], summary: candidateValidation.summary };
  report.candidateOfferCount = candidateValidation.offers.length;
  const comparison = compareOfferSnapshots(currentSnapshot, candidateSnapshot);
  Object.assign(report, {
    addedIds: comparison.addedIds,
    removedIds: comparison.removedIds,
    retainedIds: comparison.retainedIds,
    changed: comparison.changed,
    changedIds: comparison.changedIds,
    unchangedCount: comparison.unchangedIds.length,
  });
  report.guardrails = evaluateGuardrails(report.currentOfferCount, report.candidateOfferCount, comparison.removedIds.length);
  report.descriptionDiagnostics = descriptionDiagnostics(candidateSnapshot, candidateValidation.offers);
  report.offerDiagnostics = offerDiagnostics(currentSnapshot, candidateSnapshot, diagnosticIds);

  const [candidateMediaManifest, currentMediaManifest, publicMediaManifest] = await Promise.all([
    mediaManifest(candidateReferences, candidateMedia), mediaManifest(currentReferences, currentMedia), mediaManifest(currentReferences, publicMedia),
  ]);
  const snapshotHash = sha256(candidateSnapshot);
  const currentSnapshotHash = sha256(currentSnapshot);
  const candidateManifest = {
    schemaVersion: IMO_IMPORT_SCHEMA_VERSION,
    snapshotHash,
    referencedMediaHash: candidateMediaManifest.hash,
    offerIds: candidateValidation.offers.map((offer) => offer.externalId).sort(),
  };
  candidateManifest.hash = sha256(candidateManifest);
  report.manifests = {
    authoritativeSnapshotSha256: snapshotHash,
    referencedMedia: candidateMediaManifest,
    importManifest: candidateManifest,
    current: {
      authoritativeSnapshotSha256: currentSnapshotHash,
      referencedMediaHash: currentMediaManifest.hash,
      publicReferencedMediaHash: publicMediaManifest.hash,
    },
  };
  report.noOp = snapshotHash === currentSnapshotHash
    && candidateMediaManifest.hash === currentMediaManifest.hash
    && candidateMediaManifest.hash === publicMediaManifest.hash;
  const candidatePaths = await prepareCandidateFiles(stagingPath, candidateSnapshot, candidateReferences, candidateMedia, {
    publicKeepFilePath: join(paths.publicMediaDirectory, ".gitkeep"),
  });
  return { paths, stagingPath, candidatePaths, currentSnapshot, candidateSnapshot, candidateReferences, candidateMedia, report };
}

async function writeReport(paths, report) {
  await ensureDirectory(paths.reportsDirectory);
  const reportPath = join(paths.reportsDirectory, `${report.runId}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

export async function acquireApplyLock(repoRoot, runId = makeRunId("lock"), { stateRoot, environment = process.env } = {}) {
  const { operationalDirectory, lockPath } = resolveImportPaths(repoRoot, { stateRoot, environment });
  await ensureDirectory(operationalDirectory);
  let handle;
  try {
    handle = await open(lockPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST") {
      let lock = null;
      try { lock = JSON.parse(await readFile(lockPath, "utf8")); } catch { /* malformed lock is still treated as owned */ }
      throw new ImportLockError(lockPath, lock);
    }
    throw error;
  }
  const payload = { runId, pid: process.pid, createdAt: nowIso() };
  await handle.writeFile(`${JSON.stringify(payload)}\n`);
  await handle.close();
  return async () => { await unlink(lockPath).catch(() => {}); };
}

async function copyDirectory(source, destination) {
  await ensureDirectory(destination);
  if (await exists(source)) await cp(source, destination, { recursive: true });
}

async function createBackup(paths, runId, report) {
  const backupDirectory = join(paths.backupsDirectory, runId);
  const backupInput = join(backupDirectory, "input");
  await ensureDirectory(backupInput);
  await copyFile(paths.currentSnapshotPath, join(backupInput, "oferty.json"));
  await copyDirectory(paths.currentPhotosDirectory, join(backupInput, "photos"));
  await copyDirectory(paths.publicMediaDirectory, join(backupDirectory, "public-media"));
  await writeFile(join(backupDirectory, "manifest.json"), `${JSON.stringify({
    schemaVersion: IMO_IMPORT_SCHEMA_VERSION,
    createdAt: nowIso(),
    sourceRunId: runId,
    current: report.manifests.current,
  }, null, 2)}\n`);
  return backupDirectory;
}

async function moveAside(target, journalDirectory, label) {
  if (!(await exists(target))) return null;
  const backup = join(journalDirectory, label);
  await removeIfPresent(backup);
  await rename(target, backup);
  return backup;
}

async function promoteCandidate(paths, candidatePaths, runId, { failAt } = {}) {
  const journalDirectory = join(paths.stagingDirectory, `${runId}-promotion-journal`);
  await removeIfPresent(journalDirectory);
  await ensureDirectory(journalDirectory);
  const swaps = [];
  async function swap(source, target, label) {
    const previous = await moveAside(target, journalDirectory, label);
    swaps.push({ target, previous, label });
    if (failAt === label || failAt?.promotion === label) throw new Error(`Injected promotion failure at ${label}`);
    await rename(source, target);
  }
  try {
    // There is no portable atomic rename across these three project paths.
    // A journal plus reverse renames provides best-effort all-or-nothing
    // recovery when a filesystem operation fails mid-promotion.
    await swap(candidatePaths.publicMedia, paths.publicMediaDirectory, "public-media");
    await swap(candidatePaths.inputPhotos, paths.currentPhotosDirectory, "input-photos");
    await swap(candidatePaths.inputSnapshot, paths.currentSnapshotPath, "snapshot");
  } catch (error) {
    const failures = [];
    for (const { target, previous, label } of [...swaps].reverse()) {
      try {
        if (failAt?.restore === label) throw new Error(`Injected restore failure at ${label}`);
        await removeIfPresent(target);
        if (previous) await rename(previous, target);
      } catch (restoreError) {
        failures.push({ label, target, previous, message: restoreError.message });
      }
    }
    if (failures.length) {
      const failure = new ImportPipelineError("promotion-recovery", `Promotion failed and recovery was incomplete; journal retained at ${journalDirectory}.`, { cause: error });
      failure.recovery = { journalDirectory, failures };
      throw failure;
    }
    await removeIfPresent(journalDirectory);
    throw new ImportPipelineError("promotion", `Promotion failed and prior state was restored: ${error.message}`, { cause: error });
  }
  try {
    await removeIfPresent(journalDirectory);
  } catch (error) {
    const failure = new ImportPipelineError("promotion-cleanup", `Promotion succeeded but journal cleanup failed: ${error.message}`, { cause: error });
    failure.promoted = true;
    failure.recovery = { journalDirectory, failures: [] };
    throw failure;
  }
}

export async function runImport({
  repoRoot = process.cwd(),
  stateRoot,
  environment = process.env,
  sourceDirectory,
  apply = false,
  force = false,
  runId = makeRunId(),
  failAt,
  diagnosticIds = [],
} = {}) {
  if (!sourceDirectory) throw new ImportPipelineError("arguments", "--source is required.");
  const resolvedRoot = resolve(repoRoot);
  const resolvedSource = resolve(sourceDirectory);
  const report = initialReport({ runId, sourcePath: resolvedSource, mode: apply ? "apply" : "dry-run" });
  let prepared;
  let releaseLock;
  let phase = "prepare";
  let operationError;
  let paths = resolveImportPaths(resolvedRoot, { stateRoot, environment });
  try {
    // Serialise the whole mutating transaction, including baseline inspection
    // and backup creation. Otherwise a second apply could validate an older
    // baseline while waiting to promote after the first one.
    if (apply) releaseLock = await acquireApplyLock(resolvedRoot, runId, { stateRoot, environment });
    prepared = await prepareImport({ repoRoot: resolvedRoot, stateRoot, environment, sourceDirectory: resolvedSource, runId, report, diagnosticIds });
    paths = prepared.paths;
    if (apply) {
      if (report.packageMode?.supported === false) {
        throw new ImportPipelineError("package-mode", report.packageMode.message, { report });
      }
      if (report.guardrails.requiresForce && !force) {
        throw new ImportPipelineError("guardrails", `Candidate is valid but requires --force: ${report.guardrails.triggers.map((trigger) => trigger.message).join(" ")}`, { report });
      }
      if (!report.noOp) {
        report.backupDirectory = await createBackup(paths, runId, report);
        await promoteCandidate(paths, prepared.candidatePaths, runId, { failAt });
        report.applied = true;
      }
      if (String(report.packageMode?.value || "").trim().toLowerCase() === "roznica" && !report.replay?.detected) {
        // Record only after a candidate has either been promoted or proven to
        // match the accepted state. Future encounters with this exact archive
        // then cannot replay its destructive operations against later state.
        phase = "receipt";
        if (failAt?.afterPromotion === "receipt") throw new Error("Injected receipt failure");
        const receipt = await recordAcceptedDifferentialPackage(paths, report);
        report.acceptedPackage = { accepted: true, archiveSha256: receipt.archiveSha256, sourceRunId: receipt.sourceRunId };
      }
    }
    phase = "report";
    if (failAt?.afterPromotion === "report") throw new Error("Injected report failure");
    report.reportPath = await writeReport(paths, report);
    return report;
  } catch (error) {
    const failedReport = error.report || report;
    if (error.promoted) failedReport.applied = true;
    if (error.recovery) failedReport.recovery = error.recovery;
    failedReport.error = { stage: error.stage || phase, message: error.message };
    failedReport.reportPath = await writeReport(paths, failedReport).catch(() => null);
    operationError = error instanceof ImportPipelineError ? error : new ImportPipelineError(phase, error.message, { cause: error });
    operationError.report = failedReport;
    throw operationError;
  } finally {
    await finishImport({ paths, report, operationError, releaseLock, stagingPath: prepared?.stagingPath || join(paths.stagingDirectory, runId), failAt });
  }
}

async function finishImport({ paths, report, operationError, releaseLock, stagingPath, failAt }) {
  const failures = [];
  try {
    if (failAt?.cleanup === "staging") throw new Error("Injected staging cleanup failure");
    if (stagingPath) await removeIfPresent(stagingPath);
  } catch (error) {
    failures.push({ stage: "staging", message: error.message });
  }
  try {
    if (releaseLock) await releaseLock();
  } catch (error) {
    failures.push({ stage: "lock", message: error.message });
  }
  if (!failures.length) return;
  const result = operationError?.report || report;
  result.cleanupFailures = failures;
  if (!operationError) result.error = { stage: "cleanup", message: "Import cleanup failed." };
  result.reportPath = await writeReport(paths, result).catch(() => result.reportPath || null);
  if (!operationError) throw new ImportPipelineError("cleanup", "Import cleanup failed.", { report: result });
}

async function listBackups(paths) {
  if (!(await exists(paths.backupsDirectory))) return [];
  const entries = await readdir(paths.backupsDirectory, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(paths.backupsDirectory, entry.name, "manifest.json");
    if (await exists(manifestPath)) candidates.push({ id: entry.name, manifestPath, modifiedAt: (await stat(manifestPath)).mtimeMs });
  }
  return candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

async function stageBackupCandidate(paths, backupDirectory, runId) {
  const backupInput = join(backupDirectory, "input");
  const rawSnapshot = await readSnapshot(join(backupInput, "oferty.json"), "rollback-validation");
  const media = await listFilesByBasename(join(backupInput, "photos"));
  const references = referencedImageNames(rawSnapshot);
  const validation = validateOfferSnapshot(rawSnapshot, { availableFilenames: [...media.keys()] });
  const stagingPath = join(paths.stagingDirectory, `rollback-${runId}`);
  await ensureDirectory(stagingPath);
  const candidatePaths = await prepareCandidateFiles(stagingPath, rawSnapshot, references, media, {
    publicKeepFilePath: join(backupDirectory, "public-media", ".gitkeep"),
  });
  return { rawSnapshot, media, references, validation, stagingPath, candidatePaths };
}

export async function rollbackImport({ repoRoot = process.cwd(), stateRoot, environment = process.env, runId, apply = false } = {}) {
  const resolvedRoot = resolve(repoRoot);
  const paths = resolveImportPaths(resolvedRoot, { stateRoot, environment });
  const rollbackId = makeRunId("rollback");
  const report = {
    schemaVersion: IMO_IMPORT_SCHEMA_VERSION, type: "imo-rollback", runId: rollbackId, timestamp: nowIso(),
    requestedBackupRunId: runId || null, applied: false, validation: { passed: false, errors: [] }, availableBackups: [],
  };
  let releaseLock;
  let staged;
  let operationError;
  try {
    if (apply) releaseLock = await acquireApplyLock(resolvedRoot, rollbackId, { stateRoot, environment });
    const backups = await listBackups(paths);
    report.availableBackups = backups.map(({ id }) => id);
    const selected = runId ? backups.find((backup) => backup.id === runId) : backups[0];
    if (!selected) throw new ImportPipelineError("rollback", runId ? `Backup not found: ${runId}` : "No IMO import backup is available.", { report });
    report.selectedBackupRunId = selected.id;
    staged = await stageBackupCandidate(paths, join(paths.backupsDirectory, selected.id), rollbackId);
    report.validation = { passed: true, errors: [], summary: staged.validation.summary };
    if (apply) {
      // Preserve the state being replaced, so an accidental rollback is itself recoverable.
      report.backupBeforeRollback = await createBackup(paths, rollbackId, { manifests: { current: { rollbackSource: selected.id } } });
      await promoteCandidate(paths, staged.candidatePaths, rollbackId);
      report.applied = true;
    }
    report.reportPath = await writeReport(paths, report);
    return report;
  } catch (error) {
    const failedReport = error.report || report;
    if (error.promoted) failedReport.applied = true;
    if (error.recovery) failedReport.recovery = error.recovery;
    failedReport.error = { stage: error.stage || "unexpected", message: error.message };
    failedReport.reportPath = await writeReport(paths, failedReport).catch(() => null);
    operationError = error instanceof ImportPipelineError ? error : new ImportPipelineError("rollback", error.message, { cause: error });
    operationError.report = failedReport;
    throw operationError;
  } finally {
    await finishImport({ paths, report, operationError, releaseLock, stagingPath: staged?.stagingPath });
  }
}

export function summarizeReport(report) {
  return [
    `IMO ${report.type === "imo-rollback" ? "rollback" : "import"} ${report.runId}`,
    `mode: ${report.mode || (report.applied ? "apply" : "dry-run")}; applied: ${report.applied}; no-op: ${report.noOp ?? false}`,
    report.candidateOfferCount != null ? `offers: ${report.currentOfferCount} -> ${report.candidateOfferCount}; added ${report.addedIds.length}, removed ${report.removedIds.length}, changed ${report.changedIds.length}` : null,
    report.media ? `media: incoming ${report.media.incomingFiles.length}, reused ${report.media.reusedExistingFiles.length}, new/replaced ${report.media.newOrReplacedFiles.length}, missing ${report.media.missingRequiredFiles.length}` : null,
    report.guardrails?.triggers?.length ? `guardrails: ${report.guardrails.triggers.map((trigger) => trigger.code).join(", ")}` : "guardrails: passed",
    report.reportPath ? `report: ${report.reportPath}` : null,
  ].filter(Boolean).join("\n");
}
