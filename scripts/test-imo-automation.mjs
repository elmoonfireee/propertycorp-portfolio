import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateOfferSnapshot } from "./lib/offerValidation.mjs";
import {
  AUTOMATION_LOG_GENERATIONS, ImoAutomationWorker, appendAutomationAuditEvent, pruneImoImportRetention, resolveImoAutomationPaths, sha256File,
} from "./lib/imoAutomation.mjs";

function rawOffer(id, { title = `Oferta ${id}`, price = "500000", image = `offer-${id}.jpg` } = {}) {
  return {
    id: String(id), typ: "sprzedaz", kategoria: "mieszkania", nazwaF: title, opis: "Opis",
    cena: price, cena1m: "10000", powierzchnia: "50", liczbapokoi: "2", pietro: "1", liczbapieter: "4",
    n_geo_x: "17.038", n_geo_y: "51.108", location_level_1: "Polska", location_level_5: "Wrocław",
    agent_nazwisko: "Jan Testowy", agent_tel_kom: "123456789", agent_email: "jan@example.test",
    datawprowadzenia: "2026-01-01 12:00:00", zdjecie1: image,
  };
}

function snapshot(...offers) {
  return Object.fromEntries(offers.map((offer, index) => [`offer-${index}`, offer]));
}

async function writeJson(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeIncoming(directory, timestamp, content = "synthetic") {
  await mkdir(directory, { recursive: true });
  const filename = `oferty_${timestamp}.zip`;
  const path = join(directory, filename);
  await writeFile(path, content);
  const age = new Date("2026-01-01T00:00:00.000Z");
  await utimes(path, age, age);
  return { filename, path };
}

function report({ mode = "calosc", apply = false, noOp = false, replay = false, changedIds = ["1"] } = {}) {
  return {
    runId: `run-${mode}-${apply ? "apply" : "dry"}`,
    packageMode: { value: mode, supported: ["calosc", "roznica"].includes(mode) },
    validation: { passed: true },
    media: { incomingFiles: ["image.jpg"], missingRequiredFiles: [] },
    guardrails: { passed: true, requiresForce: false },
    currentOfferCount: 1,
    candidateOfferCount: 1,
    addedIds: [],
    removedIds: [],
    changedIds,
    noOp,
    replay: { detected: replay },
    applied: apply && !noOp && !replay,
  };
}

function fakeImporter({ behavior = () => null, calls = [] } = {}) {
  return async (options) => {
    calls.push({ filename: options.sourceDirectory.split(/[\\/]/u).at(-1), apply: options.apply, force: options.force });
    const outcome = behavior(options, calls);
    if (outcome instanceof Error) throw outcome;
    return outcome || report({ apply: options.apply });
  };
}

async function readAudit(paths) {
  if (!await (async () => { try { await readFile(paths.auditLogPath, "utf8"); return true; } catch { return false; } })()) return [];
  return (await readFile(paths.auditLogPath, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
}

async function makeAutomationFixture() {
  const root = await mkdtemp(join(tmpdir(), "propertycorp-imo-automation-"));
  const stateRoot = join(root, "state");
  const incomingDirectory = join(root, "incoming");
  await writeJson(join(stateRoot, "imo-current", "oferty.json"), snapshot(rawOffer(1)));
  await mkdir(join(stateRoot, "imo-current", "photos"), { recursive: true });
  await writeFile(join(stateRoot, "imo-current", "photos", "offer-1.jpg"), "old");
  await mkdir(join(stateRoot, "media", "offers"), { recursive: true });
  await writeFile(join(stateRoot, "media", "offers", "offer-1.jpg"), "old");
  return { root, stateRoot, incomingDirectory };
}

async function cleanup(fixture) {
  await rm(fixture.root, { recursive: true, force: true });
}

function workerFor(fixture, overrides = {}) {
  return new ImoAutomationWorker({
    repoRoot: fixture.root,
    stateRoot: fixture.stateRoot,
    incomingDirectory: fixture.incomingDirectory,
    settleSeconds: 0,
    minFreeBytes: 0,
    now: () => new Date("2026-01-01T00:10:00.000Z"),
    getFreeBytes: async () => 10 * 1024 * 1024 * 1024,
    ...overrides,
  });
}

// Initialization creates a SHA-based preexisting watermark and never calls
// the importer. Watch mode has no authority until that state exists.
{
  const fixture = await makeAutomationFixture();
  try {
    const calls = [];
    const worker = workerFor(fixture, { runImportImpl: fakeImporter({ calls }) });
    assert.equal((await worker.runOnce()).status, "not_initialized");
    const old = await writeIncoming(fixture.incomingDirectory, "20260101000000", "old");
    const initialized = await worker.initialize();
    assert.equal(initialized.preexistingCount, 1);
    assert.equal(calls.length, 0);
    const state = await worker.loadState();
    assert.equal(state.activationWatermark.vendorTimestamp, "20260101000000");
    assert.equal(state.packages[old.filename].result, "preexisting");
    const eventsAfterInitialize = (await readAudit(worker.paths)).length;
    await worker.runOnce();
    await worker.runOnce();
    assert.equal(calls.length, 0, "pre-watermark files are not auto-applied");
    assert.equal((await readAudit(worker.paths)).length, eventsAfterInitialize, "idle scans do not add audit noise");
  } finally { await cleanup(fixture); }
}

// Stable new packages run oldest-first, pass force=false in every call, and
// persist their handled state across a fresh worker instance.
{
  const fixture = await makeAutomationFixture();
  try {
    const calls = [];
    const worker = workerFor(fixture, { runImportImpl: fakeImporter({ calls, behavior: ({ apply }) => report({ mode: "roznica", apply }) }) });
    await worker.initialize();
    const first = await writeIncoming(fixture.incomingDirectory, "20260101000100", "first");
    const second = await writeIncoming(fixture.incomingDirectory, "20260101000200", "second");
    await worker.runOnce();
    await worker.runOnce();
    assert.deepEqual(calls.map(({ filename, apply }) => `${filename}:${apply}`), [
      `${first.filename}:false`, `${first.filename}:true`, `${second.filename}:false`, `${second.filename}:true`,
    ]);
    assert.ok(calls.every(({ force }) => force === false), "automation must never pass --force");
    const restartedCalls = [];
    const restarted = workerFor(fixture, { runImportImpl: fakeImporter({ calls: restartedCalls }) });
    await restarted.runOnce();
    assert.equal(restartedCalls.length, 0, "handled SHA survives worker restart");
    const events = await readAudit(restarted.paths);
    assert.equal(events.filter(({ event }) => event === "package_detected").length, 2);
    assert.equal(events.filter(({ event }) => event === "package_applied").length, 2);
  } finally { await cleanup(fixture); }
}

// A genuinely malformed transport file reaches PC-12's ZIP parser through the
// worker and becomes the queue head; it is not skipped in favour of later work.
{
  const fixture = await makeAutomationFixture();
  try {
    const worker = workerFor(fixture);
    await worker.initialize();
    await writeIncoming(fixture.incomingDirectory, "20260101000100", "not a ZIP");
    await worker.runOnce();
    assert.equal((await worker.runOnce()).status, "blocked");
    assert.equal((await worker.status()).blockedPackage.reason, "DRY_RUN_FAILED");
  } finally { await cleanup(fixture); }
}

// The oldest failure blocks the queue; no later operation may leapfrog it and
// idle polling must not repeat the blocked event.
{
  const fixture = await makeAutomationFixture();
  try {
    const calls = [];
    await writeIncoming(fixture.incomingDirectory, "20260101000000", "preexisting");
    const worker = workerFor(fixture, {
      runImportImpl: fakeImporter({ calls, behavior: ({ sourceDirectory }) => sourceDirectory.endsWith("oferty_20260101000100.zip")
        ? Object.assign(new Error("corrupt zip"), { stage: "archive" }) : null }),
    });
    await worker.initialize();
    await writeIncoming(fixture.incomingDirectory, "20260101000100", "bad-new");
    const newer = await writeIncoming(fixture.incomingDirectory, "20260101000200", "later");
    const blocked = await worker.runOnce();
    void newer;
    assert.equal(blocked.status, "running-ready"); // First sighting only establishes stability.
    const actualBlocked = await worker.runOnce();
    assert.equal(actualBlocked.status, "blocked");
    assert.equal(calls.length, 1);
    const eventsBefore = (await readAudit(worker.paths)).filter(({ event }) => event === "package_blocked").length;
    await worker.runOnce();
    assert.equal((await readAudit(worker.paths)).filter(({ event }) => event === "package_blocked").length, eventsBefore, "blocked queue head is logged once");
  } finally { await cleanup(fixture); }
}

// Pause is an in-band sentinel: it produces transition events, leaves the
// queue untouched while present, then resumes normal processing.
{
  const fixture = await makeAutomationFixture();
  try {
    const calls = [];
    const worker = workerFor(fixture, { runImportImpl: fakeImporter({ calls }) });
    await worker.initialize();
    await writeIncoming(fixture.incomingDirectory, "20260101000100", "paused");
    await mkdir(worker.paths.automationDirectory, { recursive: true });
    await writeFile(worker.paths.pausedPath, "operator pause\n");
    assert.equal((await worker.runOnce()).status, "paused");
    await worker.runOnce();
    assert.equal(calls.length, 0);
    await rm(worker.paths.pausedPath);
    await worker.runOnce();
    await worker.runOnce();
    assert.equal(calls.length, 2);
    const events = await readAudit(worker.paths);
    assert.equal(events.filter(({ event }) => event === "paused").length, 1);
    assert.equal(events.filter(({ event }) => event === "resumed").length, 1);
  } finally { await cleanup(fixture); }
}

// Low disk blocks after a valid dry-run but before apply. A lock contention is
// deferred for a later poll rather than becoming a permanently blocked head.
{
  const fixture = await makeAutomationFixture();
  try {
    const lowCalls = [];
    const lowWorker = workerFor(fixture, { runImportImpl: fakeImporter({ calls: lowCalls }), getFreeBytes: async () => 1, minFreeBytes: 5 });
    await lowWorker.initialize();
    await writeIncoming(fixture.incomingDirectory, "20260101000100", "low-disk");
    await lowWorker.runOnce();
    const low = await lowWorker.runOnce();
    assert.equal(low.status, "blocked");
    assert.deepEqual(lowCalls.map(({ apply }) => apply), [false]);
    assert.equal((await lowWorker.status()).blockedPackage.reason, "LOW_DISK");
  } finally { await cleanup(fixture); }

  const fixtureLock = await makeAutomationFixture();
  try {
    let locked = true;
    const calls = [];
    const lockWorker = workerFor(fixtureLock, {
      runImportImpl: fakeImporter({ calls, behavior: ({ apply }) => apply && locked ? Object.assign(new Error("owned"), { stage: "lock" }) : null }),
    });
    await lockWorker.initialize();
    await writeIncoming(fixtureLock.incomingDirectory, "20260101000100", "lock");
    await lockWorker.runOnce();
    assert.equal((await lockWorker.runOnce()).status, "deferred");
    assert.equal((await lockWorker.status()).status, "running-ready");
    locked = false;
    assert.equal((await lockWorker.runOnce()).status, "running-ready");
    assert.ok(calls.filter(({ apply }) => apply).length >= 2);
  } finally { await cleanup(fixtureLock); }
}

// The archive identity is checked again after dry-run. A file altered in that
// narrow window is a persistent safety stop, never an apply of new bytes.
{
  const fixture = await makeAutomationFixture();
  try {
    const calls = [];
    const worker = workerFor(fixture, {
      runImportImpl: fakeImporter({
        calls,
        behavior: async ({ apply, sourceDirectory }) => {
          if (!apply) await writeFile(sourceDirectory, "changed-after-dry-run");
          return report({ apply });
        },
      }),
    });
    await worker.initialize();
    await writeIncoming(fixture.incomingDirectory, "20260101000100", "before-dry-run");
    await worker.runOnce();
    assert.equal((await worker.runOnce()).status, "blocked");
    assert.deepEqual(calls.map(({ apply }) => apply), [false]);
    assert.equal((await worker.status()).blockedPackage.reason, "FILE_CHANGED");
  } finally { await cleanup(fixture); }
}

// Retry is exact-identity only. A blocked file cannot be silently retried
// after bytes change; a matching operator retry returns through normal flow.
{
  const fixture = await makeAutomationFixture();
  try {
    let fail = true;
    const worker = workerFor(fixture, {
      runImportImpl: fakeImporter({ behavior: () => fail ? Object.assign(new Error("bad package"), { stage: "archive" }) : null }),
    });
    await worker.initialize();
    const packageFile = await writeIncoming(fixture.incomingDirectory, "20260101000100", "retry-original");
    await worker.runOnce();
    assert.equal((await worker.runOnce()).status, "blocked");
    await writeFile(packageFile.path, "retry-changed");
    await assert.rejects(() => worker.retry(packageFile.filename), /identity changed/);
  } finally { await cleanup(fixture); }

  const fixtureExact = await makeAutomationFixture();
  try {
    let fail = true;
    const worker = workerFor(fixtureExact, {
      runImportImpl: fakeImporter({ behavior: () => fail ? Object.assign(new Error("bad package"), { stage: "archive" }) : null }),
    });
    await worker.initialize();
    const packageFile = await writeIncoming(fixtureExact.incomingDirectory, "20260101000100", "retry-exact");
    await worker.runOnce();
    await worker.runOnce();
    fail = false;
    assert.equal((await worker.retry(packageFile.filename)).status, "applied");
    assert.equal((await worker.status()).status, "running-ready");
  } finally { await cleanup(fixtureExact); }
}

// Unsupported packages and malformed archives are queue blockers, while a
// synthetic no-op/replay records the expected concise audit events.
{
  const fixture = await makeAutomationFixture();
  try {
    const unknownWorker = workerFor(fixture, { runImportImpl: fakeImporter({ behavior: () => report({ mode: "unknown", apply: false }) }) });
    await unknownWorker.initialize();
    await writeIncoming(fixture.incomingDirectory, "20260101000100", "unknown");
    await unknownWorker.runOnce();
    assert.equal((await unknownWorker.runOnce()).status, "blocked");
  } finally { await cleanup(fixture); }

  const replayFixture = await makeAutomationFixture();
  try {
    const replayWorker = workerFor(replayFixture, { runImportImpl: fakeImporter({ behavior: ({ apply }) => report({ apply, noOp: true, replay: true, changedIds: [] }) }) });
    await replayWorker.initialize();
    await writeIncoming(replayFixture.incomingDirectory, "20260101000100", "replay");
    await replayWorker.runOnce();
    await replayWorker.runOnce();
    assert.equal((await replayWorker.status()).lastResult, "replay");
    assert.equal((await readAudit(replayWorker.paths)).some(({ event }) => event === "package_replay"), true);
  } finally { await cleanup(replayFixture); }
}

// An existing validated PC-12D receipt is a safe replay even after a worker
// state reset would otherwise make the older archive look out of order.
{
  const fixture = await makeAutomationFixture();
  try {
    const calls = [];
    const worker = workerFor(fixture, { runImportImpl: fakeImporter({ calls }) });
    await worker.initialize();
    const archive = await writeIncoming(fixture.incomingDirectory, "20260101000100", "accepted-differential");
    const archiveSha256 = await sha256File(archive.path);
    await mkdir(worker.paths.acceptedPackagesDirectory, { recursive: true });
    await writeJson(join(worker.paths.acceptedPackagesDirectory, `${archiveSha256}.json`), {
      type: "imo-differential-package", archiveSha256, sourceRunId: "accepted-run",
    });
    const state = await worker.loadState();
    state.lastSuccessfulPackageTimestamp = "20260101000200";
    await worker.saveState(state);
    await worker.runOnce();
    await worker.runOnce();
    assert.equal((await worker.status()).lastResult, "replay");
    assert.equal(calls.length, 0, "receipt replay must not rerun the importer");
  } finally { await cleanup(fixture); }
}

// Application logs rotate independently of Docker logging; importer artifact
// retention leaves at least three backups and protects the active report.
{
  const fixture = await makeAutomationFixture();
  try {
    const paths = resolveImoAutomationPaths({ repoRoot: fixture.root, stateRoot: fixture.stateRoot, incomingDirectory: fixture.incomingDirectory });
    for (let index = 0; index < 20; index += 1) {
      await appendAutomationAuditEvent(paths, "test_event", { note: "x".repeat(100) }, { maxLogBytes: 180, generations: AUTOMATION_LOG_GENERATIONS });
    }
    const logEntries = (await readdir(paths.automationDirectory)).filter((name) => name.startsWith("propertycorp-imo-sync.jsonl"));
    assert.ok(logEntries.length <= AUTOMATION_LOG_GENERATIONS + 1);

    await mkdir(paths.backupsDirectory, { recursive: true });
    await mkdir(paths.reportsDirectory, { recursive: true });
    const old = new Date("2025-01-01T00:00:00.000Z");
    for (let index = 0; index < 12; index += 1) {
      const backup = join(paths.backupsDirectory, `backup-${index}`);
      await mkdir(backup);
      await writeFile(join(backup, "manifest.json"), "{}");
      await utimes(backup, old, old);
    }
    for (let index = 0; index < 205; index += 1) {
      const reportPath = join(paths.reportsDirectory, `report-${index}.json`);
      await writeFile(reportPath, "{}");
      await utimes(reportPath, new Date("2026-01-20T00:00:00.000Z"), new Date("2026-01-20T00:00:00.000Z"));
    }
    await writeFile(join(paths.reportsDirectory, "active.json"), "{}");
    const retention = await pruneImoImportRetention(paths, { activeRunId: "active", now: () => new Date("2026-02-01T00:00:00.000Z") });
    assert.equal((await readdir(paths.backupsDirectory)).length, 3);
    assert.equal((await readdir(paths.reportsDirectory)).filter((name) => name.endsWith(".json")).length, 200);
    assert.ok(await readFile(join(paths.reportsDirectory, "active.json"), "utf8"));
    assert.ok(retention.backupsDeleted.length && retention.reportsDeleted.length);
  } finally { await cleanup(fixture); }
}

// Minimal real PC-12 integration: an automatically applied full export is
// followed by a differential upsert and then a receipt-backed replay. The
// resulting accepted state remains valid without any web-process restart.
{
  const fixture = await makeAutomationFixture();
  const crcTable = new Uint32Array(256).map((_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    return value >>> 0;
  });
  const crc32 = (buffer) => {
    let value = 0xffffffff;
    for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  };
  const zip = (entries) => {
    let offset = 0;
    const locals = [];
    const centrals = [];
    for (const { name, content } of entries) {
      const nameBuffer = Buffer.from(name);
      const data = Buffer.from(content);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuffer.length, 26);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt32LE(offset, 42);
      locals.push(local, nameBuffer, data); centrals.push(central, nameBuffer); offset += local.length + nameBuffer.length + data.length;
    }
    const central = Buffer.concat(centrals); const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, central, end]);
  };
  const xmlOffer = (offer) => `<oferta><id>${offer.id}</id><cena waluta="PLN">${offer.cena}</cena><location><area level="1">Polska</area><area level="5">Wrocław</area></location><param nazwa="nazwaF">${offer.nazwaF}</param><param nazwa="opis">Opis</param><param nazwa="powierzchnia">50</param><param nazwa="liczbapokoi">2</param><param nazwa="pietro">1</param><param nazwa="liczbapieter">4</param><param nazwa="n_geo_x">17.038</param><param nazwa="n_geo_y">51.108</param><param nazwa="agent_nazwisko">Jan Testowy</param><param nazwa="agent_tel_kom">123456789</param><param nazwa="agent_email">jan@example.test</param><param nazwa="datawprowadzenia">2026-01-01 12:00:00</param></oferta>`;
  const xml = (mode, offer) => `<?xml version="1.0"?><plik><header><zawartosc_pliku>${mode}</zawartosc_pliku></header><lista_ofert><dzial tab="mieszkania" typ="sprzedaz">${xmlOffer(offer)}</dzial></lista_ofert></plik>`;
  try {
    const worker = workerFor(fixture, { minFreeBytes: 0 });
    await worker.initialize();
    const fullOffer = rawOffer(1, { title: "Pełny", image: "propertycorp_imo_ms_1_1.jpg" });
    const full = await writeIncoming(fixture.incomingDirectory, "20260101000100", zip([
      { name: "oferty.xml", content: xml("calosc", fullOffer) }, { name: "propertycorp_imo_ms_1_1.jpg", content: "full" },
    ]));
    await worker.runOnce(); await worker.runOnce();
    const differentialOffer = rawOffer(1, { title: "Różnica", price: "600000", image: "propertycorp_imo_ms_1_1.jpg" });
    const differential = await writeIncoming(fixture.incomingDirectory, "20260101000200", zip([
      { name: "oferty.xml", content: xml("roznica", differentialOffer) }, { name: "propertycorp_imo_ms_1_1.jpg", content: "diff" },
    ]));
    await worker.runOnce(); await worker.runOnce();
    const acceptedRaw = JSON.parse(await readFile(join(fixture.stateRoot, "imo-current", "oferty.json"), "utf8"));
    const accepted = validateOfferSnapshot(acceptedRaw, { availableFilenames: ["propertycorp_imo_ms_1_1.jpg"] });
    assert.equal(accepted.offers[0].title, "Różnica");
    await copyFile(differential.path, join(fixture.incomingDirectory, "oferty_20260101000300.zip"));
    await utimes(join(fixture.incomingDirectory, "oferty_20260101000300.zip"), new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));
    await worker.runOnce(); await worker.runOnce();
    assert.equal((await worker.status()).lastResult, "replay");
    assert.ok(full.filename);
  } finally { await cleanup(fixture); }
}

console.log("IMO automation: initialization, ordered safety gates, pause/retry, audit rotation, retention, and PC-12 integration passed.");
