import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  acquireApplyLock, compareOfferSnapshots, describeOfferComparison, resolveImportPaths, rollbackImport, runImport, sha256,
} from "./lib/imoImportPipeline.mjs";

const zipCrcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});

function zipCrc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = zipCrcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  let offset = 0;
  const locals = [];
  const centrals = [];
  for (const { name, content = "", uncompressedSize } of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const size = uncompressedSize ?? data.length;
    const crc = zipCrc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuffer, data);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, eocd]);
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function xmlOffer(raw, { descriptionLines } = {}) {
  const location = [1, 2, 3, 4, 5]
    .filter((level) => raw[`location_level_${level}`] != null)
    .map((level) => `<area level="${level}">${escapeXml(raw[`location_level_${level}`])}</area>`).join("");
  const ignored = new Set(["id", "cena", "waluta", "zdjecie1", "location_level_1", "location_level_2", "location_level_3", "location_level_4", "location_level_5"]);
  const params = Object.entries(raw).filter(([name]) => !ignored.has(name)).map(([name, value]) => {
    if (name === "opis" && descriptionLines) return `<param nazwa="opis">${descriptionLines.map((line) => `<linia>${escapeXml(line)}</linia>`).join("")}</param>`;
    return `<param nazwa="${name}">${escapeXml(value)}</param>`;
  }).join("");
  return `<oferta><id>${escapeXml(raw.id)}</id><cena waluta="${escapeXml(raw.waluta || "PLN")}">${escapeXml(raw.cena)}</cena><location>${location}</location>${params}</oferta>`;
}

function imoXml({ offers, mode = "calosc", operations = [], deletions = [], deletionSections = [], metadata = {} }) {
  const header = {
    informacje: "Plik z IMO v. 1.9", agencja: "propertycorp", data: "2026-09-18", wersja: "0.4", cel: "oferty.net", zawartosc_pliku: mode,
    ...metadata,
  };
  const headerXml = Object.entries(header).map(([name, value]) => `<${name}>${escapeXml(value)}</${name}>`).join("");
  const deletionXml = deletions.map((id) => `<oferta_usun><id>${escapeXml(id)}</id></oferta_usun>`).join("");
  const sectionDeletionXml = deletionSections.map(({ tab, typ, ids }) => (
    `<dzial tab="${escapeXml(tab)}" typ="${escapeXml(typ)}">${ids.map((id) => `<oferta_usun><id>${escapeXml(id)}</id></oferta_usun>`).join("")}</dzial>`
  )).join("");
  const operationXml = operations.map((operation) => {
    const { action, filename } = typeof operation === "string"
      ? { action: operation, filename: `missing-${operation}.jpg` }
      : operation;
    return `<zdjecie><akcja>${escapeXml(action)}</akcja><nazwa>${escapeXml(filename || "")}</nazwa></zdjecie>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><plik><header>${headerXml}</header><lista_ofert>${deletionXml}${sectionDeletionXml}${offers.join("")}</lista_ofert><zdjecia>${operationXml}</zdjecia></plik>`;
}

function xmlSection(tab, typ, offers = []) {
  return `<dzial tab="${escapeXml(tab)}" typ="${escapeXml(typ)}">${offers.join("")}</dzial>`;
}

async function writeZip(path, entries) {
  await writeFile(path, storedZip(entries));
}

function rawOffer(id, { title = `Oferta ${id}`, image = `offer-${id}.jpg`, description = "Krótki opis oferty.", price = "500000" } = {}) {
  return {
    id: String(id), typ: "sprzedaz", kategoria: "mieszkania", nazwaF: title, opis: description,
    cena: price, cena1m: "10000", powierzchnia: "50", liczbapokoi: "2", pietro: "1", liczbapieter: "4",
    n_geo_x: "17.038", n_geo_y: "51.108", location_level_1: "Polska", location_level_5: "Wrocław",
    agent_nazwisko: "Jan Testowy", agent_tel_kom: "123456789", agent_email: "jan@example.test",
    datawprowadzenia: "2026-01-01 12:00:00", zdjecie1: image,
  };
}

function rawOfferWithImages(id, filenames, options = {}) {
  const raw = rawOffer(id, { ...options, image: filenames[0] });
  filenames.forEach((filename, index) => { raw[`zdjecie${index + 1}`] = filename; });
  return raw;
}

function imoPhotoName(id, order) {
  return `propertycorp_imo_ms_${id}_${order}.jpg`;
}

function snapshot(...offers) {
  return Object.fromEntries(offers.map((offer, index) => [`entry-${index}`, offer]));
}

async function writeJson(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeMedia(directory, files) {
  await mkdir(directory, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(join(directory, name), content)));
}

async function makeFixture({ currentOffers, currentMedia, incomingOffers = currentOffers, incomingMedia = {} }) {
  const root = await mkdtemp(join(tmpdir(), "propertycorp-imo-import-"));
  const currentDirectory = join(root, "_input", "imo-current");
  const sourceDirectory = join(root, "incoming");
  await writeJson(join(currentDirectory, "oferty.json"), snapshot(...currentOffers));
  await writeMedia(join(currentDirectory, "photos"), currentMedia);
  await writeMedia(join(root, "public", "media", "offers"), currentMedia);
  await writeJson(join(sourceDirectory, "oferty.json"), snapshot(...incomingOffers));
  await writeMedia(join(sourceDirectory, "photos"), incomingMedia);
  return { root, sourceDirectory, currentDirectory };
}

async function makeStateRootFixture({ currentOffers, currentMedia, incomingOffers, incomingMedia }) {
  const root = await mkdtemp(join(tmpdir(), "propertycorp-imo-state-root-"));
  const repoRoot = join(root, "separate-repository");
  const stateRoot = join(root, "persistent-state");
  const currentDirectory = join(stateRoot, "imo-current");
  const sourceDirectory = join(repoRoot, "incoming");
  await writeJson(join(currentDirectory, "oferty.json"), snapshot(...currentOffers));
  await writeMedia(join(currentDirectory, "photos"), currentMedia);
  await writeMedia(join(stateRoot, "media", "offers"), currentMedia);
  await writeJson(join(sourceDirectory, "oferty.json"), snapshot(...incomingOffers));
  await writeMedia(join(sourceDirectory, "photos"), incomingMedia);
  return { root, repoRoot, stateRoot, sourceDirectory, currentDirectory };
}

function isUnder(root, path) {
  const fromRoot = relative(resolve(root), resolve(path));
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}

async function cleanup(fixture) {
  await rm(fixture.root, { recursive: true, force: true });
}

async function expectFailure(action, pattern) {
  await assert.rejects(action, (error) => pattern.test(error.message));
}

async function makeZipFixture(entries, { currentOffers = [rawOffer(1)], currentMedia = { "offer-1.jpg": "current" } } = {}) {
  const fixture = await makeFixture({ currentOffers, currentMedia });
  const archivePath = join(fixture.root, "oferty_20260918160556.zip");
  await writeZip(archivePath, entries);
  return { ...fixture, archivePath };
}

// DEP-01R: all rename sources and targets must live in the one configured
// state filesystem. The repository and state root are intentionally separate.
{
  const fixture = await makeStateRootFixture({
    currentOffers: [rawOffer(1, { price: "500000" })],
    currentMedia: { "offer-1.jpg": "old-media" },
    incomingOffers: [rawOffer(1, { price: "700000" })],
    incomingMedia: { "offer-1.jpg": "new-media" },
  });
  try {
    const defaultPaths = resolveImportPaths(fixture.repoRoot, { environment: {} });
    assert.equal(defaultPaths.currentSnapshotPath, join(fixture.repoRoot, "_input", "imo-current", "oferty.json"), "unset state root retains repository-local paths");

    const stateEnvironment = { PROPERTYCORP_STATE_ROOT: fixture.stateRoot };
    const paths = resolveImportPaths(fixture.repoRoot, { environment: stateEnvironment });
    assert.equal(paths.currentSnapshotPath, join(fixture.stateRoot, "imo-current", "oferty.json"));
    assert.equal(paths.currentPhotosDirectory, join(fixture.stateRoot, "imo-current", "photos"));
    assert.equal(paths.publicMediaDirectory, join(fixture.stateRoot, "media", "offers"));
    assert.equal(paths.operationalDirectory, join(fixture.stateRoot, "var", "imo-import"));
    assert.deepEqual(
      [
        paths.currentSnapshotPath,
        paths.currentPhotosDirectory,
        paths.publicMediaDirectory,
        paths.operationalDirectory,
        paths.stagingDirectory,
        paths.backupsDirectory,
        paths.reportsDirectory,
        paths.lockPath,
      ].every((path) => isUnder(fixture.stateRoot, path)),
      true,
      "configured PC-12 targets, staging, backups, reports, and lock share one state filesystem",
    );

    const dryRun = await runImport({
      repoRoot: fixture.repoRoot, environment: stateEnvironment, sourceDirectory: fixture.sourceDirectory,
    });
    assert.equal(dryRun.applied, false);
    const applied = await runImport({
      repoRoot: fixture.repoRoot, environment: stateEnvironment, sourceDirectory: fixture.sourceDirectory, apply: true,
    });
    assert.equal(applied.applied, true);
    assert.ok(isUnder(fixture.stateRoot, applied.backupDirectory));
    assert.ok(isUnder(fixture.stateRoot, applied.reportPath));
    assert.match(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8"), /700000/);
    assert.equal(await readFile(join(fixture.stateRoot, "media", "offers", "offer-1.jpg"), "utf8"), "new-media");
    await assert.rejects(
      () => readFile(join(fixture.repoRoot, "_input", "imo-current", "oferty.json")),
      /ENOENT/,
      "apply must not create or replace repository-local accepted state when a state root is configured",
    );

    const rollback = await rollbackImport({
      repoRoot: fixture.repoRoot, environment: stateEnvironment, runId: applied.runId, apply: true,
    });
    assert.equal(rollback.applied, true);
    assert.ok(isUnder(fixture.stateRoot, rollback.backupBeforeRollback));
    assert.ok(isUnder(fixture.stateRoot, rollback.reportPath));
    assert.match(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8"), /500000/);
    assert.equal(await readFile(join(fixture.stateRoot, "media", "offers", "offer-1.jpg"), "utf8"), "old-media");
  } finally { await cleanup(fixture); }
}

// Comparison must reflect the normalized site contract, rather than source
// serialization. This is the real legacy JSON-array / XML <linia> and decimal
// comma regression, including the old non-rendered zdjecia compatibility key.
{
  const legacy = {
    ...rawOffer(36, { price: "510000,0000", description: "unused" }),
    powierzchnia: "40,5",
    cena1m: "12592,5900",
    opis: ["&lt;b&gt;Funkcjonalne M2&lt;/b&gt;", "Oferta wysłana z programu IMO dla biur nieruchomości"],
    zdjecia: ["offer-36.jpg"],
  };
  const xmlAdaptedEquivalent = {
    ...legacy,
    cena: "510000.0000",
    waluta: "PLN",
    opis: "<b>Funkcjonalne M2</b>\r\nOferta wysłana z programu IMO dla biur nieruchomości",
  };
  delete xmlAdaptedEquivalent.cena1m;
  delete xmlAdaptedEquivalent.zdjecia;
  const equivalent = compareOfferSnapshots(snapshot(legacy), snapshot(xmlAdaptedEquivalent));
  assert.deepEqual(equivalent.changedIds, [], "decimal representation, legacy description lines, entity decoding, and zdjecia metadata are not site changes");
  const diagnostic = describeOfferComparison(legacy, xmlAdaptedEquivalent);
  assert.equal(diagnostic.price.before.amount, 510000);
  assert.equal(diagnostic.price.candidate.amount, 510000);
  assert.equal(diagnostic.description.difference.equivalentForSite, true);
  assert.equal(diagnostic.description.difference.onlySerializationOrHtmlEntityHandling, true);

  const changedPrice = { ...xmlAdaptedEquivalent, cena: "510001" };
  const priceComparison = compareOfferSnapshots(snapshot(legacy), snapshot(changedPrice));
  assert.ok(priceComparison.changed[0].categories.includes("price changed"), "a genuine effective price change remains visible");

  const changedDescription = { ...xmlAdaptedEquivalent, opis: "<b>Inna treść oferty</b>" };
  const descriptionComparison = compareOfferSnapshots(snapshot(legacy), snapshot(changedDescription));
  assert.ok(descriptionComparison.changed[0].categories.includes("description changed"), "a genuine customer-facing description change remains visible");
}

// The full XML uses several established IMO aliases for the same visible
// property data. Keep them strict after normalization without treating a
// source-key migration as a business-data deletion.
{
  const legacyHouse = {
    ...rawOffer(20, { price: "1111111,0000" }),
    kategoria: "domy",
    powierzchnia: "330",
    cena1m: "3367",
    typ_garazu: "w bryle",
    liczba_lazienek: "3",
  };
  const xmlHouse = { ...legacyHouse, miejscaparkingowe: "w bryle", liczbalazienek: "3" };
  delete xmlHouse.typ_garazu;
  delete xmlHouse.liczba_lazienek;
  assert.deepEqual(compareOfferSnapshots(snapshot(legacyHouse), snapshot(xmlHouse)).changedIds, [], "house garage and bathroom aliases remain semantically equal");

  const legacyApartment = {
    ...rawOffer(37, { price: "1050000,0000" }),
    powierzchnia: "70,7",
    cena1m: "14851,49",
    typ_budynku: "blok",
    typ_parkingu: "parking podziemny",
    miejscaparkingowe: "1",
    typ_balkonuF: "taras",
  };
  const xmlApartment = {
    ...legacyApartment,
    typbudynkumieszk: "blok",
    miejscaparkingowe: "parking podziemny",
    liczba_miejsc_parkingowych: "1",
    taras: "true",
  };
  delete xmlApartment.typ_budynku;
  delete xmlApartment.typ_parkingu;
  delete xmlApartment.typ_balkonuF;
  assert.deepEqual(compareOfferSnapshots(snapshot(legacyApartment), snapshot(xmlApartment)).changedIds, [], "apartment building, parking, and terrace aliases remain semantically equal");
}

// Real transport contract: a flat complete ZIP contains XML plus physical
// JPGs. XML <zdjecia> operation records are diagnostics only, not image refs.
{
  const first = rawOffer(1, { title: "XML oferta", price: "600000" });
  const noPhoto = rawOffer(2, { title: "Bez zdjęć" });
  const photos = [10, 2, 1, 9, 8, 7, 6, 5, 4, 3].map((order) => ({
    name: `propertycorp_imo_ms_1_${order}.jpg`, content: `jpg-${order}`,
  }));
  const fixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({
      offers: [xmlOffer(first, { descriptionLines: ["Pierwsza linia", "Druga linia"] }), xmlOffer(noPhoto)],
      operations: ["u", "u"],
    }) },
    ...photos,
  ]);
  try {
    const dryRun = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath });
    assert.equal(dryRun.sourceType, "zip");
    assert.equal(dryRun.archive.header.zawartosc_pliku, "calosc");
    assert.equal(dryRun.archive.physicalMediaCount, 10);
    assert.equal(dryRun.archive.mappedMediaCount, 10);
    assert.deepEqual(dryRun.archive.photoOperationCounts, { u: 2 });
    assert.deepEqual(dryRun.archive.offersWithoutMedia, ["2"]);
    const applied = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath, apply: true });
    assert.equal(applied.applied, true);
    const accepted = Object.values(JSON.parse(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8")));
    const acceptedFirst = accepted.find((offer) => offer.id === "1");
    assert.equal(acceptedFirst.opis, "Pierwsza linia\nDruga linia");
    assert.equal(acceptedFirst.location_level_1, "Polska");
    assert.equal(acceptedFirst.zdjecie9, "propertycorp_imo_ms_1_9.jpg");
    assert.equal(acceptedFirst.zdjecie10, "propertycorp_imo_ms_1_10.jpg");
    assert.equal(await readFile(join(fixture.root, "public", "media", "offers", "propertycorp_imo_ms_1_10.jpg"), "utf8"), "jpg-10");
    const secondApply = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath, apply: true });
    assert.equal(secondApply.noOp, true, "identical complete ZIP must be an effective no-op");
    const rollback = await rollbackImport({ repoRoot: fixture.root, runId: applied.runId, apply: true });
    assert.equal(rollback.applied, true, "ZIP apply must remain recoverable through rollback");
    assert.equal(Object.values(JSON.parse(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8"))).length, 1);
  } finally { await cleanup(fixture); }
}

// Regression for the real export: offers live below repeated <dzial> groups,
// not directly below <lista_ofert>. Section metadata owns photo identity.
{
  const house = rawOffer(26, { title: "Dom z XML" });
  const validSections = [
    xmlSection("domy", "sprzedaz"),
    xmlSection("mieszkania", "wynajem"),
    xmlSection("domy", "sprzedaz", [xmlOffer(house)]),
    xmlSection("domy", "sprzedaz"),
  ];
  const fixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ offers: validSections }) },
    { name: "propertycorp_imo_ds_26_1.jpg", content: "house-jpg" },
  ]);
  try {
    const report = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath });
    assert.equal(report.validation.passed, true, "ds:26 must resolve through its <dzial> identity");
    assert.equal(report.archive.mappedMediaCount, 1);
    const applied = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath, apply: true });
    assert.equal(applied.applied, true);
    const accepted = Object.values(JSON.parse(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8")))[0];
    assert.equal(accepted.kategoria, "domy");
    assert.equal(accepted.typ, "sprzedaz");
  } finally { await cleanup(fixture); }
}

{
  const offer26 = rawOffer(26);
  const mismatchFixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ offers: [xmlSection("mieszkania", "sprzedaz", [xmlOffer(offer26)])] }) },
    { name: "propertycorp_imo_ds_26_1.jpg", content: "wrong-kind" },
  ]);
  try {
    await expectFailure(() => runImport({ repoRoot: mismatchFixture.root, sourceDirectory: mismatchFixture.archivePath }), /category\/transaction prefix does not match XML offer 26/);
  } finally { await cleanup(mismatchFixture); }

  const missingFixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ offers: [xmlSection("domy", "sprzedaz", [xmlOffer(offer26)])] }) },
    { name: "propertycorp_imo_ds_999_1.jpg", content: "missing-offer" },
  ]);
  try {
    await expectFailure(() => runImport({ repoRoot: missingFixture.root, sourceDirectory: missingFixture.archivePath }), /nonexistent XML offer 999/);
  } finally { await cleanup(missingFixture); }
}

{
  const first = rawOffer(1);
  const validXml = imoXml({ offers: [xmlOffer(first)] });
  const cases = [
    { name: "nonexistent offer image", entries: [{ name: "oferty.xml", content: validXml }, { name: "propertycorp_imo_ms_99_1.jpg", content: "jpg" }], pattern: /nonexistent XML offer/ },
    { name: "malformed image filename", entries: [{ name: "oferty.xml", content: validXml }, { name: "not-an-imo-photo.jpg", content: "jpg" }], pattern: /Malformed IMO physical image filename/ },
    { name: "duplicate numeric image order", entries: [{ name: "oferty.xml", content: validXml }, { name: "propertycorp_imo_ms_1_1.jpg", content: "a" }, { name: "propertycorp_imo_ms_1_01.jpg", content: "b" }], pattern: /Duplicate physical image order/ },
    { name: "archive traversal", entries: [{ name: "../oferty.xml", content: validXml }], pattern: /Unsafe or non-flat archive entry name/ },
    { name: "duplicate archive entry", entries: [{ name: "oferty.xml", content: validXml }, { name: "oferty.xml", content: validXml }], pattern: /Duplicate archive entry name/ },
    { name: "excessive declared archive entry", entries: [{ name: "oferty.xml", content: validXml, uncompressedSize: 70 * 1024 * 1024 }], pattern: /per-file limit/ },
    { name: "excessive aggregate archive size", entries: Array.from({ length: 17 }, (_, index) => ({ name: `large-${index}.txt`, uncompressedSize: 32 * 1024 * 1024 })), pattern: /uncompressed size exceeds/ },
    { name: "excessive archive file count", entries: Array.from({ length: 2_001 }, (_, index) => ({ name: `file-${index}.txt` })), pattern: /entries; limit is/ },
    { name: "malformed xml", entries: [{ name: "oferty.xml", content: "<plik><header></plik>" }], pattern: /Malformed XML/ },
    { name: "missing xml", entries: [{ name: "propertycorp_imo_ms_1_1.jpg", content: "jpg" }], pattern: /exactly one flat oferty.xml/ },
    { name: "duplicate xml ids", entries: [{ name: "oferty.xml", content: imoXml({ offers: [xmlOffer(first), xmlOffer(first)] }) }], pattern: /Duplicate IMO id/ },
  ];
  for (const scenario of cases) {
    const fixture = await makeZipFixture(scenario.entries);
    try {
      await expectFailure(() => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath }), scenario.pattern);
    } finally { await cleanup(fixture); }
  }
}

{
  const first = rawOffer(1);
  const fixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ offers: [xmlOffer(first)], mode: "roznicowy" }) },
    { name: "propertycorp_imo_ms_1_1.jpg", content: "jpg" },
  ]);
  try {
    const dryRun = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath });
    assert.equal(dryRun.packageMode.supported, false);
    await expectFailure(() => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath, apply: true }), /Only complete/);
  } finally { await cleanup(fixture); }
}

// Real differential transport contract: <oferta_usun> is an explicit
// operation, normal <oferta> records are complete per-offer replacements, and
// <zdjecia>/<akcja> records are audit evidence rather than current media.
{
  const previous17 = rawOffer(17, { title: "Poprzednia oferta 17", image: "old-17.jpg", price: "500000" });
  const previous20 = rawOffer(20, { image: "offer-20.jpg" });
  const unaffected18 = rawOffer(18, { image: "offer-18.jpg" });
  const changed17 = rawOffer(17, { title: "Zmieniona oferta 17", price: "510000" });
  const currentPhotos = Object.fromEntries([
    ["old-17.jpg", "old-17"], ["offer-20.jpg", "old-20"], ["offer-18.jpg", "unchanged-18"],
  ]);
  const newPhotos = Array.from({ length: 8 }, (_, index) => ({
    name: imoPhotoName(17, index + 1), content: `new-17-${index + 1}`,
  }));
  const removalOperations = Array.from({ length: 7 }, (_, index) => ({
    action: "u", filename: imoPhotoName(17, index + 9),
  }));
  const fixture = await makeZipFixture([
    {
      name: "oferty.xml",
      content: imoXml({
        mode: "roznica",
        deletionSections: [{ tab: "domy", typ: "sprzedaz", ids: ["20"] }],
        offers: [xmlSection("mieszkania", "sprzedaz", [xmlOffer(changed17)])],
        operations: removalOperations,
      }),
    },
    ...newPhotos,
  ], { currentOffers: [previous17, previous20, unaffected18], currentMedia: currentPhotos });
  try {
    const dryRun = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath });
    assert.equal(dryRun.packageMode.supported, true);
    assert.equal(dryRun.currentOfferCount, 3);
    assert.equal(dryRun.candidateOfferCount, 2);
    assert.deepEqual(dryRun.removedIds, ["20"]);
    assert.deepEqual(dryRun.changedIds, ["17"]);
    assert.equal(dryRun.media.missingRequiredFiles.length, 0);
    assert.deepEqual(dryRun.operations.offerDeletes, ["20"]);
    assert.deepEqual(dryRun.operations.offerUpserts, ["17"]);
    assert.deepEqual(dryRun.operations.changedOfferMedia, ["17"]);
    assert.deepEqual(dryRun.operations.photoOperationCounts, { u: 7 });
    assert.deepEqual(dryRun.archive.photoOperations[0], { action: "u", filename: imoPhotoName(17, 9) });
    assert.equal(dryRun.operations.photoOperationAudit[0].observedRemovalConsistent, true);
    assert.ok(dryRun.media.unreferencedRemovedFromCandidate.includes("old-17.jpg"));
    assert.ok(dryRun.media.unreferencedRemovedFromCandidate.includes("offer-20.jpg"));

    const applied = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath, apply: true });
    assert.equal(applied.applied, true);
    assert.equal(applied.acceptedPackage.accepted, true);
    const accepted = Object.values(JSON.parse(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8")));
    assert.deepEqual(accepted.map(({ id }) => id).sort(), ["17", "18"]);
    const accepted17 = accepted.find(({ id }) => id === "17");
    assert.equal(accepted17.zdjecie1, imoPhotoName(17, 1));
    assert.equal(accepted17.zdjecie8, imoPhotoName(17, 8));
    assert.equal(accepted17.zdjecie9, undefined);
    assert.equal(await readFile(join(fixture.root, "public", "media", "offers", imoPhotoName(17, 8)), "utf8"), "new-17-8");
    assert.equal(await readFile(join(fixture.root, "public", "media", "offers", "offer-18.jpg"), "utf8"), "unchanged-18");
    await assert.rejects(readFile(join(fixture.root, "public", "media", "offers", "old-17.jpg"), "utf8"));
    await assert.rejects(readFile(join(fixture.root, "public", "media", "offers", "offer-20.jpg"), "utf8"));

    const repeated = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath, apply: true });
    assert.equal(repeated.noOp, true, "the exact accepted differential must be replay-safe");
    assert.equal(repeated.replay.detected, true);
    assert.equal(repeated.candidateOfferCount, 2);

    // A later state can even reintroduce the deleted ID. The exact old archive
    // must not delete it again merely because an FTP file remains available.
    const laterSnapshot = JSON.parse(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8"));
    laterSnapshot["future-20"] = previous20;
    await writeJson(join(fixture.currentDirectory, "oferty.json"), laterSnapshot);
    await writeMedia(join(fixture.currentDirectory, "photos"), { "offer-20.jpg": "later-20" });
    await writeMedia(join(fixture.root, "public", "media", "offers"), { "offer-20.jpg": "later-20" });
    const replayAfterLaterState = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath });
    assert.equal(replayAfterLaterState.noOp, true);
    assert.equal(replayAfterLaterState.replay.detected, true);
    assert.equal(replayAfterLaterState.currentOfferCount, 3);
    assert.equal(replayAfterLaterState.candidateOfferCount, 3);
  } finally { await cleanup(fixture); }
}

// Differential failure modes must remain explicit. In particular, an unknown
// delete is not silently ignored unless the archive is already recorded as an
// accepted replay above.
{
  const upsert17 = rawOffer(17);
  const upsertXml = xmlSection("mieszkania", "sprzedaz", [xmlOffer(upsert17)]);
  const current = [rawOffer(17), rawOffer(18)];
  const currentMedia = { "offer-17.jpg": "17", "offer-18.jpg": "18" };
  const scenarios = [
    {
      name: "delete unknown current offer",
      xml: imoXml({ mode: "roznica", deletions: ["999"], offers: [] }),
      entries: [], pattern: /deletion of unknown current IMO id: 999/,
    },
    {
      name: "duplicate oferta_usun",
      xml: imoXml({ mode: "roznica", deletions: ["17", "17"], offers: [] }),
      entries: [], pattern: /Duplicate <oferta_usun> id: 17/,
    },
    {
      name: "invalid oferta_usun ID",
      xml: imoXml({ mode: "roznica", deletions: ["not-an-id"], offers: [] }),
      entries: [], pattern: /Invalid <oferta_usun> id: not-an-id/,
    },
    {
      name: "same ID delete and upsert",
      xml: imoXml({ mode: "roznica", deletions: ["17"], offers: [upsertXml] }),
      entries: [{ name: imoPhotoName(17, 1), content: "17" }], pattern: /both <oferta_usun> and <oferta>/,
    },
    {
      name: "physical JPG for unrelated non-upsert offer",
      xml: imoXml({ mode: "roznica", offers: [upsertXml] }),
      entries: [{ name: imoPhotoName(18, 1), content: "18" }], pattern: /non-upsert differential XML offer 18/,
    },
    {
      name: "malformed differential image prefix",
      xml: imoXml({ mode: "roznica", offers: [upsertXml] }),
      entries: [{ name: "wrong-prefix-17-1.jpg", content: "17" }], pattern: /Malformed IMO physical image filename/,
    },
    {
      name: "missing physical image required by changed offer",
      xml: imoXml({
        mode: "roznica",
        offers: [xmlSection("mieszkania", "sprzedaz", [xmlOffer({ ...upsert17, zdjecie2: imoPhotoName(17, 2) })])],
      }),
      entries: [{ name: imoPhotoName(17, 1), content: "17-1" }], pattern: /Differential offer 17 references image absent from the package: .*_17_2\.jpg/,
    },
    {
      name: "duplicate differential physical image order",
      xml: imoXml({ mode: "roznica", offers: [upsertXml] }),
      entries: [{ name: imoPhotoName(17, 1), content: "17-a" }, { name: "propertycorp_imo_ms_17_01.jpg", content: "17-b" }], pattern: /Duplicate physical image order/,
    },
  ];
  for (const scenario of scenarios) {
    const fixture = await makeZipFixture([{ name: "oferty.xml", content: scenario.xml }, ...scenario.entries], { currentOffers: current, currentMedia });
    try {
      await expectFailure(() => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath }), scenario.pattern);
    } finally { await cleanup(fixture); }
  }
}

// Per-offer media replacement keeps an affected offer complete while retaining
// all unrelated current media. It also supports additions and semantic no-ops.
{
  const old17 = rawOfferWithImages(17, [imoPhotoName(17, 1), imoPhotoName(17, 2), imoPhotoName(17, 3)]);
  const unchanged18 = rawOffer(18);
  const currentMedia = Object.fromEntries([
    [imoPhotoName(17, 1), "old-1"], [imoPhotoName(17, 2), "old-2"], [imoPhotoName(17, 3), "old-3"], ["offer-18.jpg", "18"],
  ]);
  const fewerFixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ mode: "roznica", offers: [xmlSection("mieszkania", "sprzedaz", [xmlOffer(rawOffer(17))])] }) },
    { name: imoPhotoName(17, 1), content: "new-1" }, { name: imoPhotoName(17, 2), content: "new-2" },
  ], { currentOffers: [old17, unchanged18], currentMedia });
  try {
    const report = await runImport({ repoRoot: fewerFixture.root, sourceDirectory: fewerFixture.archivePath });
    assert.ok(report.media.unreferencedRemovedFromCandidate.includes(imoPhotoName(17, 3)), "fewer photos remove the obsolete changed-offer image");
    assert.ok(report.media.reusedExistingFiles.includes("offer-18.jpg"), "unaffected offer media remains available");
  } finally { await cleanup(fewerFixture); }

  const additionalFixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ mode: "roznica", offers: [xmlSection("mieszkania", "sprzedaz", [xmlOffer(rawOffer(17))])] }) },
    { name: imoPhotoName(17, 1), content: "new-1" }, { name: imoPhotoName(17, 2), content: "new-2" },
  ], {
    currentOffers: [rawOfferWithImages(17, [imoPhotoName(17, 1)])],
    currentMedia: { [imoPhotoName(17, 1)]: "old-1" },
  });
  try {
    const report = await runImport({ repoRoot: additionalFixture.root, sourceDirectory: additionalFixture.archivePath });
    assert.ok(report.changed[0].categories.includes("media references changed"), "additional photos remain a visible media reference change");
  } finally { await cleanup(additionalFixture); }

  const zeroPhoto = rawOffer(17);
  delete zeroPhoto.zdjecie1;
  const zeroFixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ mode: "roznica", offers: [xmlSection("mieszkania", "sprzedaz", [xmlOffer(zeroPhoto)])] }) },
  ], { currentOffers: [rawOffer(17)], currentMedia: { "offer-17.jpg": "old" } });
  try {
    const report = await runImport({ repoRoot: zeroFixture.root, sourceDirectory: zeroFixture.archivePath });
    assert.deepEqual(report.validation.summary.offersWithoutImages, ["17"]);
    assert.deepEqual(report.media.unreferencedRemovedFromCandidate, ["offer-17.jpg"]);
  } finally { await cleanup(zeroFixture); }

  const added = rawOffer(19, { image: imoPhotoName(19, 1) });
  const addFixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ mode: "roznica", offers: [xmlSection("mieszkania", "sprzedaz", [xmlOffer(added)])] }) },
    { name: imoPhotoName(19, 1), content: "new-19" },
  ], { currentOffers: [rawOffer(17)], currentMedia: { "offer-17.jpg": "17" } });
  try {
    const report = await runImport({ repoRoot: addFixture.root, sourceDirectory: addFixture.archivePath });
    assert.deepEqual(report.addedIds, ["19"]);
    assert.deepEqual(report.removedIds, []);
  } finally { await cleanup(addFixture); }

  const noOpImage = imoPhotoName(17, 1);
  const noOpOffer = { ...rawOffer(17, { image: noOpImage }), waluta: "PLN" };
  const noOpFixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ mode: "roznica", offers: [xmlSection("mieszkania", "sprzedaz", [xmlOffer(noOpOffer)])] }) },
    { name: noOpImage, content: "same-17" },
  ], { currentOffers: [noOpOffer], currentMedia: { [noOpImage]: "same-17" } });
  try {
    const report = await runImport({ repoRoot: noOpFixture.root, sourceDirectory: noOpFixture.archivePath });
    assert.equal(report.noOp, true, "an unchanged complete differential offer is an effective no-op");
    assert.deepEqual(report.changedIds, []);
  } finally { await cleanup(noOpFixture); }
}

// Valid full snapshot and a differential snapshot both use the same public
// contract. The second test proves a referenced baseline photo is not treated
// as deleted merely because it is absent from the incoming photos directory.
{
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "old" },
    incomingOffers: [rawOffer(1)], incomingMedia: { "offer-1.jpg": "old" },
  });
  try {
    const report = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory });
    assert.equal(report.validation.passed, true);
    assert.equal(report.noOp, true);
    assert.equal(report.media.incomingFiles.length, 1);
  } finally { await cleanup(fixture); }
}

{
  const current = rawOffer(1, { image: "kept.jpg" });
  const incoming = { ...rawOffer(1, { image: "kept.jpg" }), zdjecie2: "changed.jpg" };
  const fixture = await makeFixture({
    currentOffers: [current], currentMedia: { "kept.jpg": "baseline" },
    incomingOffers: [incoming], incomingMedia: { "changed.jpg": "new" },
  });
  try {
    const report = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory });
    assert.deepEqual(report.media.reusedExistingFiles, ["kept.jpg"]);
    assert.deepEqual(report.media.newOrReplacedFiles, ["changed.jpg"]);
    assert.deepEqual(report.changedIds, ["1"]);
    assert.ok(report.changed[0].categories.includes("media references changed"));
  } finally { await cleanup(fixture); }
}

{
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "old-bytes" },
    incomingOffers: [rawOffer(1)], incomingMedia: { "offer-1.jpg": "replacement-bytes" },
  });
  try {
    const report = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory });
    assert.deepEqual(report.media.newOrReplacedFiles, ["offer-1.jpg"]);
    assert.equal(report.noOp, false);
  } finally { await cleanup(fixture); }
}

{
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "baseline" },
    incomingOffers: [rawOffer(1, { image: "missing.jpg" })], incomingMedia: {},
  });
  try {
    const before = await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8");
    await expectFailure(() => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory }), /Missing image files/);
    assert.equal(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8"), before, "failed candidate must not replace current snapshot");
  } finally { await cleanup(fixture); }
}

{
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "old-public" },
    incomingOffers: [rawOffer(1, { price: "700000" })], incomingMedia: { "offer-1.jpg": "new-public" },
  });
  try {
    const beforeSnapshot = await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8");
    await expectFailure(
      () => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true, failAt: "input-photos" }),
      /Promotion failed and prior state was restored/,
    );
    assert.equal(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8"), beforeSnapshot);
    assert.equal(await readFile(join(fixture.root, "public", "media", "offers", "offer-1.jpg"), "utf8"), "old-public");
  } finally { await cleanup(fixture); }
}

// A failed compensation must retain the previous files and expose their location.
{
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "old-public" },
    incomingOffers: [rawOffer(1, { price: "700000" })], incomingMedia: { "offer-1.jpg": "new-public" },
  });
  try {
    let failure;
    await assert.rejects(
      () => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true, failAt: { promotion: "snapshot", restore: "input-photos" } }),
      (error) => { failure = error; return error.stage === "promotion-recovery"; },
    );
    assert.equal(failure.report.applied, false);
    assert.equal(failure.report.recovery.failures[0].label, "input-photos");
    assert.equal(await readFile(join(failure.report.recovery.journalDirectory, "input-photos", "offer-1.jpg"), "utf8"), "old-public");
    assert.equal(await readFile(join(fixture.root, "public", "media", "offers", "offer-1.jpg"), "utf8"), "old-public");
  } finally { await cleanup(fixture); }
}

// Reporting failures after promotion must not say the accepted state was unchanged.
{
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "old-public" },
    incomingOffers: [rawOffer(1, { price: "700000" })], incomingMedia: { "offer-1.jpg": "new-public" },
  });
  try {
    let failure;
    await assert.rejects(
      () => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true, failAt: { afterPromotion: "report" } }),
      (error) => { failure = error; return error.stage === "report"; },
    );
    assert.equal(failure.report.applied, true);
    assert.equal(JSON.parse(await readFile(failure.report.reportPath, "utf8")).applied, true);
    const accepted = Object.values(JSON.parse(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8")));
    assert.equal(accepted[0].cena, "700000");
  } finally { await cleanup(fixture); }
}

// Cleanup errors retain the promotion result and do not hide an earlier failure.
for (const afterPromotion of [undefined, "report"]) {
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "old-public" },
    incomingOffers: [rawOffer(1, { price: "700000" })], incomingMedia: { "offer-1.jpg": "new-public" },
  });
  try {
    let failure;
    await assert.rejects(
      () => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true, failAt: { afterPromotion, cleanup: "staging" } }),
      (error) => { failure = error; return error.stage === (afterPromotion || "cleanup"); },
    );
    assert.equal(failure.report.applied, true);
    assert.equal(failure.report.cleanupFailures[0].stage, "staging");
    assert.equal(JSON.parse(await readFile(failure.report.reportPath, "utf8")).applied, true);
    await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true });
  } finally { await cleanup(fixture); }
}

// A failed differential receipt is distinguishable from a failed promotion.
{
  const previous = rawOffer(17, { image: "old-17.jpg" });
  const changed = rawOffer(17, { price: "510000" });
  const fixture = await makeZipFixture([
    { name: "oferty.xml", content: imoXml({ mode: "roznica", offers: [xmlSection("mieszkania", "sprzedaz", [xmlOffer(changed)])] }) },
    { name: imoPhotoName(17, 1), content: "new-17" },
  ], { currentOffers: [previous], currentMedia: { "old-17.jpg": "old-17" } });
  try {
    let failure;
    await assert.rejects(
      () => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath, apply: true, failAt: { afterPromotion: "receipt" } }),
      (error) => { failure = error; return error.stage === "receipt"; },
    );
    assert.equal(failure.report.applied, true);
    assert.equal(failure.report.error.stage, "receipt");
    const accepted = Object.values(JSON.parse(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8")));
    assert.equal(accepted[0].cena, "510000");
    const retry = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.archivePath, apply: true });
    assert.equal(retry.replay.detected, true, "a persisted post-promotion error report prevents replay");
    assert.equal(retry.noOp, true);
  } finally { await cleanup(fixture); }
}

{
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1), rawOffer(2), rawOffer(3)],
    currentMedia: { "offer-1.jpg": "1", "offer-2.jpg": "2", "offer-3.jpg": "3", "offer-4.jpg": "4" },
    incomingOffers: [rawOffer(1, { price: "600000", description: "Zmieniony opis." }), rawOffer(3), rawOffer(4)],
    incomingMedia: { "offer-4.jpg": "4" },
  });
  try {
    const report = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory });
    assert.deepEqual(report.addedIds, ["4"]);
    assert.deepEqual(report.removedIds, ["2"]);
    assert.deepEqual(report.changedIds, ["1"]);
    assert.equal(report.unchangedCount, 1);
    assert.ok(report.changed[0].categories.includes("price changed"));
    assert.ok(report.changed[0].categories.includes("description changed"));
  } finally { await cleanup(fixture); }
}

{
  const duplicateIdFirst = rawOffer(1);
  const duplicateIdSecond = rawOffer(1, { title: "Inna oferta" });
  const fixture = await makeFixture({ currentOffers: [rawOffer(2)], currentMedia: { "offer-2.jpg": "2", "offer-1.jpg": "1" }, incomingOffers: [duplicateIdFirst, duplicateIdSecond], incomingMedia: { "offer-1.jpg": "1" } });
  try {
    await expectFailure(() => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory }), /Duplicate IMO id/);
  } finally { await cleanup(fixture); }
}

{
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "1", "offer-2.jpg": "2" },
    // The public route includes the IMO ID. A duplicate route is therefore
    // necessarily a duplicate ID with the same generated slug.
    incomingOffers: [rawOffer(1, { title: "Ta sama trasa" }), rawOffer(1, { title: "Ta sama trasa" })], incomingMedia: { "offer-1.jpg": "1" },
  });
  try {
    await expectFailure(() => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory }), /Duplicate public URL/);
  } finally { await cleanup(fixture); }
}

{
  const fixture = await makeFixture({ currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "1" }, incomingOffers: [], incomingMedia: {} });
  try {
    const dryRun = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory });
    assert.equal(dryRun.guardrails.triggers[0].code, "ZERO_OFFER_SNAPSHOT");
    await expectFailure(() => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true }), /requires --force/);
  } finally { await cleanup(fixture); }
}

{
  const currentOffers = [1, 2, 3, 4, 5, 6].map((id) => rawOffer(id));
  const currentMedia = Object.fromEntries(currentOffers.map((offer) => [offer.zdjecie1, offer.id]));
  const fixture = await makeFixture({ currentOffers, currentMedia, incomingOffers: [rawOffer(1), rawOffer(2)], incomingMedia: {} });
  try {
    const dryRun = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory });
    assert.equal(dryRun.guardrails.triggers[0].code, "MASS_REMOVAL");
    await expectFailure(() => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true }), /requires --force/);
    const applied = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true, force: true });
    assert.equal(applied.applied, true);
    assert.equal(applied.backupDirectory.endsWith(applied.runId), true);
  } finally { await cleanup(fixture); }
}

{
  const fixture = await makeFixture({
    currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "old" },
    incomingOffers: [rawOffer(1, { price: "700000" })], incomingMedia: { "offer-1.jpg": "new" },
  });
  try {
    await writeFile(join(fixture.root, "public", "media", "offers", ".gitkeep"), "\r\n");
    const applied = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true });
    assert.equal(applied.applied, true);
    assert.match(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8"), /700000/);
    assert.equal(await readFile(join(fixture.root, "public", "media", "offers", ".gitkeep"), "utf8"), "\r\n");
    const rollback = await rollbackImport({ repoRoot: fixture.root, runId: applied.runId, apply: true });
    assert.equal(rollback.applied, true);
    assert.match(await readFile(join(fixture.currentDirectory, "oferty.json"), "utf8"), /500000/);
    assert.equal(await readFile(join(fixture.root, "public", "media", "offers", "offer-1.jpg"), "utf8"), "old");
  } finally { await cleanup(fixture); }
}

{
  const fixture = await makeFixture({ currentOffers: [rawOffer(1)], currentMedia: { "offer-1.jpg": "1" } });
  try {
    const release = await acquireApplyLock(fixture.root, "test-lock-owner");
    await expectFailure(() => runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true }), /Another apply or rollback/);
    await release();
    const result = await runImport({ repoRoot: fixture.root, sourceDirectory: fixture.sourceDirectory, apply: true });
    assert.equal(result.noOp, true);
  } finally { await cleanup(fixture); }
}

assert.equal(sha256({ b: [2, 1], a: { z: 1, y: 2 } }), sha256({ a: { y: 2, z: 1 }, b: [2, 1] }), "content hashing must ignore object key order");
console.log("IMO import pipeline: ZIP/XML adaptation, archive safety, legacy media, guardrails, apply/rollback, locking, and deterministic manifests passed.");
