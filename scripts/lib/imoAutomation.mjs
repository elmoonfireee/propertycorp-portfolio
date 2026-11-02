import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access, lstat, mkdir, readFile, readdir, rename, rm, stat, statfs, writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { resolvePropertyCorpStatePaths } from "../../server/statePaths.mjs";
import { ImportLockError, resolveImportPaths, runImport } from "./imoImportPipeline.mjs";

export const IMO_AUTOMATION_SCHEMA_VERSION = 1;
export const DEFAULT_POLL_SECONDS = 60;
export const DEFAULT_SETTLE_SECONDS = 120;
export const DEFAULT_MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024;
export const AUTOMATION_LOG_MAX_BYTES = 5 * 1024 * 1024;
// Active file plus five generations keeps the uncompressed footprint at about
// 30 MiB while still satisfying the maximum-six-generation requirement.
export const AUTOMATION_LOG_GENERATIONS = 5;
const IMO_ARCHIVE_NAME = /^oferty_(\d{14})\.zip$/u;
const FINAL_RESULTS = new Set(["preexisting", "applied", "noop", "replay"]);

function nowIso(now = new Date()) {
  return now.toISOString();
}

function asPositiveInteger(value, fallback, { allowZero = false } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) return fallback;
  return parsed;
}

function normalizedTimestamp(filename) {
  const match = basename(filename).match(IMO_ARCHIVE_NAME);
  if (!match) return null;
  const value = match[1];
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
    || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null;
  return value;
}

export function parseImoArchiveFilename(filename) {
  const vendorTimestamp = normalizedTimestamp(filename);
  return vendorTimestamp ? { filename: basename(filename), vendorTimestamp } : null;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
}

async function writeJsonAtomically(path, value) {
  await ensureDirectory(join(path, ".."));
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { throw new Error(`Cannot read automation state ${path}: ${error.message}`, { cause: error }); }
}

function freshState(now) {
  return {
    schemaVersion: IMO_AUTOMATION_SCHEMA_VERSION,
    initializedAt: nowIso(now),
    activationWatermark: { vendorTimestamp: null, establishedAt: nowIso(now) },
    packages: {},
    observations: {},
    lastSuccessfulPackageTimestamp: null,
    lastHandled: null,
    blockedQueueHead: null,
  };
}

function assertState(state) {
  if (!state || state.schemaVersion !== IMO_AUTOMATION_SCHEMA_VERSION || !state.activationWatermark
    || typeof state.packages !== "object" || typeof state.observations !== "object") {
    throw new Error("Automation state is malformed; refusing automatic processing.");
  }
  return state;
}

export function resolveImoAutomationPaths({ repoRoot = process.cwd(), stateRoot, environment = process.env, incomingDirectory = "/incoming-imo" } = {}) {
  const statePaths = resolvePropertyCorpStatePaths({ projectRoot: repoRoot, stateRoot, environment });
  const importPaths = resolveImportPaths(statePaths.projectRoot, { stateRoot, environment });
  const automationDirectory = statePaths.imoAutomationDirectory;
  return {
    repoRoot: statePaths.projectRoot,
    stateRoot: statePaths.stateRoot,
    incomingDirectory: resolve(incomingDirectory),
    automationDirectory,
    statePath: join(automationDirectory, "state.json"),
    pausedPath: join(automationDirectory, "PAUSED"),
    auditLogPath: join(automationDirectory, "propertycorp-imo-sync.jsonl"),
    ...importPaths,
  };
}

export async function scanIncomingArchives(incomingDirectory) {
  if (!(await exists(incomingDirectory))) return [];
  const entries = await readdir(incomingDirectory, { withFileTypes: true });
  const archives = [];
  for (const entry of entries) {
    const parsed = parseImoArchiveFilename(entry.name);
    if (!parsed || !entry.isFile()) continue;
    const path = join(incomingDirectory, entry.name);
    const metadata = await lstat(path);
    if (!metadata.isFile()) continue;
    archives.push({ ...parsed, path, size: metadata.size, mtimeMs: metadata.mtimeMs });
  }
  return archives.sort((left, right) => left.vendorTimestamp.localeCompare(right.vendorTimestamp) || left.filename.localeCompare(right.filename));
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

async function stableArchiveIdentity(archive, hashFile = sha256File) {
  const before = await lstat(archive.path);
  if (!before.isFile() || before.size !== archive.size || before.mtimeMs !== archive.mtimeMs) return null;
  const archiveSha256 = await hashFile(archive.path);
  const after = await lstat(archive.path);
  if (!after.isFile() || after.size !== archive.size || after.mtimeMs !== archive.mtimeMs) return null;
  return { ...archive, archiveSha256 };
}

function reportFacts(report) {
  return {
    packageMode: report?.packageMode?.value || null,
    runId: report?.runId || null,
    offersBefore: report?.currentOfferCount ?? null,
    offersAfter: report?.candidateOfferCount ?? null,
    addedCount: report?.addedIds?.length || 0,
    removedCount: report?.removedIds?.length || 0,
    changedCount: report?.changedIds?.length || 0,
    mediaIncoming: report?.media?.incomingFiles?.length || 0,
    mediaMissing: report?.media?.missingRequiredFiles?.length || 0,
    noOp: Boolean(report?.noOp),
    applied: Boolean(report?.applied),
  };
}

export async function appendAutomationAuditEvent(paths, event, details = {}, {
  now = () => new Date(), maxLogBytes = AUTOMATION_LOG_MAX_BYTES, generations = AUTOMATION_LOG_GENERATIONS,
} = {}) {
  await ensureDirectory(paths.automationDirectory);
  const record = {
    timestamp: nowIso(now()),
    component: "propertycorp-imo-sync",
    event,
    ...details,
  };
  const line = `${JSON.stringify(record)}\n`;
  let currentSize = 0;
  try { currentSize = (await stat(paths.auditLogPath)).size; } catch { /* first log */ }
  if (currentSize && currentSize + Buffer.byteLength(line) > maxLogBytes) {
    const oldest = `${paths.auditLogPath}.${generations}`;
    await rm(oldest, { force: true });
    for (let index = generations - 1; index >= 1; index -= 1) {
      const source = `${paths.auditLogPath}.${index}`;
      if (await exists(source)) await rename(source, `${paths.auditLogPath}.${index + 1}`);
    }
    await rename(paths.auditLogPath, `${paths.auditLogPath}.1`);
  }
  await writeFile(paths.auditLogPath, line, { flag: "a" });
  return record;
}

async function defaultFreeBytes(path) {
  const filesystem = await statfs(path);
  return Number(filesystem.bavail) * Number(filesystem.bsize);
}

function configuredOptions({ environment, pollSeconds, settleSeconds, minFreeBytes } = {}) {
  return {
    pollSeconds: asPositiveInteger(pollSeconds ?? environment?.IMO_SYNC_POLL_SECONDS, DEFAULT_POLL_SECONDS),
    settleSeconds: asPositiveInteger(settleSeconds ?? environment?.IMO_SYNC_SETTLE_SECONDS, DEFAULT_SETTLE_SECONDS, { allowZero: true }),
    minFreeBytes: asPositiveInteger(minFreeBytes ?? environment?.IMO_SYNC_MIN_FREE_BYTES, DEFAULT_MIN_FREE_BYTES, { allowZero: true }),
  };
}

async function isKnownReplay(paths, state, archiveSha256) {
  if (Object.values(state.packages).some((entry) => entry.archiveSha256 === archiveSha256 && FINAL_RESULTS.has(entry.result))) {
    return true;
  }
  // PC-12D writes this receipt only after a successful accepted differential
  // apply. Validate its content as well as its name before using it to bypass
  // the normal timestamp ordering check.
  try {
    const receipt = await readJson(join(paths.acceptedPackagesDirectory, `${archiveSha256}.json`));
    return receipt?.type === "imo-differential-package" && receipt.archiveSha256 === archiveSha256;
  } catch {
    return false;
  }
}

function latestTimestamp(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return left >= right ? left : right;
}

function packageEntry(identity, result, report, now) {
  return {
    filename: identity.filename,
    archiveSha256: identity.archiveSha256,
    vendorTimestamp: identity.vendorTimestamp,
    size: identity.size,
    mtimeMs: identity.mtimeMs,
    result,
    handledAt: nowIso(now()),
    sourceImportRunId: report?.runId || null,
    packageMode: report?.packageMode?.value || null,
  };
}

function errorFingerprint(error) {
  return `${error?.stage || "unexpected"}:${String(error?.message || "error").slice(0, 400)}`;
}

async function protectedByImportLock(paths) {
  return exists(paths.lockPath);
}

async function datedEntries(directory, predicate) {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!predicate(entry)) continue;
    const path = join(directory, entry.name);
    result.push({ name: entry.name, path, modifiedAt: (await stat(path)).mtimeMs });
  }
  return result.sort((left, right) => left.modifiedAt - right.modifiedAt || left.name.localeCompare(right.name));
}

/** Conservatively bounds import artifacts only after a safe completed cycle. */
export async function pruneImoImportRetention(paths, { activeRunId, now = () => new Date() } = {}) {
  if (await protectedByImportLock(paths)) return { skipped: "active-import-lock", backupsDeleted: [], reportsDeleted: [] };
  const backups = await datedEntries(paths.backupsDirectory, (entry) => entry.isDirectory());
  const reports = await datedEntries(paths.reportsDirectory, (entry) => entry.isFile() && entry.name.endsWith(".json"));
  const backupsDeleted = [];
  const reportsDeleted = [];
  const protectedBackup = activeRunId ? new Set([activeRunId]) : new Set();
  const backupCutoff = now().getTime() - (14 * 24 * 60 * 60 * 1000);
  const remainingBackups = [...backups];
  for (const backup of backups) {
    if (remainingBackups.length <= 3 || protectedBackup.has(backup.name) || backup.modifiedAt >= backupCutoff) continue;
    await rm(backup.path, { recursive: true, force: true });
    remainingBackups.splice(remainingBackups.findIndex(({ name }) => name === backup.name), 1);
    backupsDeleted.push(backup.name);
  }
  while (remainingBackups.length > 10) {
    const candidate = remainingBackups.find((backup) => !protectedBackup.has(backup.name));
    if (!candidate || remainingBackups.length <= 3) break;
    await rm(candidate.path, { recursive: true, force: true });
    remainingBackups.splice(remainingBackups.indexOf(candidate), 1);
    backupsDeleted.push(candidate.name);
  }

  const protectedReport = activeRunId ? `${activeRunId}.json` : null;
  const reportCutoff = now().getTime() - (30 * 24 * 60 * 60 * 1000);
  const remainingReports = [...reports];
  for (const report of reports) {
    if (report.name === protectedReport || report.modifiedAt >= reportCutoff) continue;
    await rm(report.path, { force: true });
    remainingReports.splice(remainingReports.findIndex(({ name }) => name === report.name), 1);
    reportsDeleted.push(report.name);
  }
  while (remainingReports.length > 200) {
    const candidate = remainingReports.find((report) => report.name !== protectedReport);
    if (!candidate) break;
    await rm(candidate.path, { force: true });
    remainingReports.splice(remainingReports.indexOf(candidate), 1);
    reportsDeleted.push(candidate.name);
  }
  return { skipped: null, backupsDeleted, reportsDeleted };
}

export class ImoAutomationWorker {
  constructor({
    repoRoot = process.cwd(), stateRoot, environment = process.env, incomingDirectory,
    pollSeconds, settleSeconds, minFreeBytes, now = () => new Date(), runImportImpl = runImport,
    hashFile = sha256File, getFreeBytes = defaultFreeBytes, auditAppender = appendAutomationAuditEvent,
    retentionPruner = pruneImoImportRetention,
  } = {}) {
    this.environment = environment;
    this.paths = resolveImoAutomationPaths({ repoRoot, stateRoot, environment, incomingDirectory });
    this.options = configuredOptions({ environment, pollSeconds, settleSeconds, minFreeBytes });
    this.now = now;
    this.runImportImpl = runImportImpl;
    this.hashFile = hashFile;
    this.getFreeBytes = getFreeBytes;
    this.auditAppender = auditAppender;
    this.retentionPruner = retentionPruner;
    this.pauseObserved = false;
  }

  async loadState() {
    if (!(await exists(this.paths.statePath))) return null;
    return assertState(await readJson(this.paths.statePath));
  }

  async saveState(state) {
    await writeJsonAtomically(this.paths.statePath, state);
  }

  async audit(event, details = {}) {
    try { return await this.auditAppender(this.paths, event, details, { now: this.now }); }
    catch { return null; } // Audit rotation must not bring down the worker.
  }

  async initialize() {
    const existing = await this.loadState();
    if (existing) throw new Error(`Automation state already exists: ${this.paths.statePath}. Refusing to reset its watermark.`);
    const state = freshState(this.now());
    const archives = await scanIncomingArchives(this.paths.incomingDirectory);
    for (const archive of archives) {
      const identity = await stableArchiveIdentity(archive, this.hashFile);
      if (!identity) throw new Error(`Incoming archive changed during initialization: ${archive.filename}. Wait for FTP completion and initialize again.`);
      state.packages[identity.filename] = packageEntry(identity, "preexisting", null, this.now);
      state.activationWatermark.vendorTimestamp = latestTimestamp(state.activationWatermark.vendorTimestamp, identity.vendorTimestamp);
    }
    await this.saveState(state);
    await this.audit("initialized", {
      packageMode: null,
      preexistingCount: Object.values(state.packages).filter(({ result }) => result === "preexisting").length,
      activationWatermark: state.activationWatermark.vendorTimestamp,
    });
    return { state, preexistingCount: Object.keys(state.packages).length };
  }

  async incomingSummary() {
    const archives = await scanIncomingArchives(this.paths.incomingDirectory);
    return { count: archives.length, bytes: archives.reduce((total, archive) => total + archive.size, 0), archives };
  }

  async status() {
    const [state, paused, incoming] = await Promise.all([this.loadState(), exists(this.paths.pausedPath), this.incomingSummary()]);
    let freeBytes = null;
    try { freeBytes = await this.getFreeBytes(this.paths.varDirectory); } catch { /* status remains useful */ }
    const status = !state ? "not-initialized" : paused ? "paused" : state.blockedQueueHead ? "blocked" : "running-ready";
    const last = state?.lastHandled || null;
    return {
      status,
      initialized: Boolean(state),
      activationWatermark: state?.activationWatermark || null,
      lastHandledPackage: last?.filename || null,
      lastResult: last?.result || null,
      lastRunId: last?.sourceImportRunId || null,
      lastEffectiveChange: last?.effectiveChange || null,
      lastSuccessfulPackageTimestamp: state?.lastSuccessfulPackageTimestamp || null,
      blockedPackage: state?.blockedQueueHead || null,
      queue: incoming.archives.filter((archive) => state?.activationWatermark?.vendorTimestamp
        && archive.vendorTimestamp > state.activationWatermark.vendorTimestamp
        && !FINAL_RESULTS.has(state.packages[archive.filename]?.result)).length,
      incomingPackageCount: incoming.count,
      incomingBytes: incoming.bytes,
      freeBytes,
      auditLogPath: this.paths.auditLogPath,
    };
  }

  async markBlocked(state, identity, reason, error, report = null) {
    const blocked = {
      filename: identity.filename,
      archiveSha256: identity.archiveSha256,
      vendorTimestamp: identity.vendorTimestamp,
      reason,
      error: error ? errorFingerprint(error) : null,
      blockedAt: nowIso(this.now()),
    };
    state.packages[identity.filename] = { ...packageEntry(identity, "blocked", report, this.now), blockedReason: reason };
    state.blockedQueueHead = blocked;
    await this.saveState(state);
    await this.audit(reason === "LOW_DISK" ? "low_disk" : "package_blocked", {
      filename: identity.filename,
      archiveSha256: identity.archiveSha256,
      packageMode: report?.packageMode?.value || null,
      runId: report?.runId || null,
      reason,
      errorStage: error?.stage || null,
      ...reportFacts(report),
    });
    return { status: "blocked", blocked };
  }

  async completePackage(state, identity, result, report) {
    const facts = reportFacts(report);
    state.packages[identity.filename] = packageEntry(identity, result, report, this.now);
    state.lastSuccessfulPackageTimestamp = latestTimestamp(state.lastSuccessfulPackageTimestamp, identity.vendorTimestamp);
    state.lastHandled = {
      filename: identity.filename,
      archiveSha256: identity.archiveSha256,
      vendorTimestamp: identity.vendorTimestamp,
      result,
      sourceImportRunId: report?.runId || null,
      effectiveChange: { added: facts.addedCount, removed: facts.removedCount, changed: facts.changedCount },
      handledAt: nowIso(this.now()),
    };
    await this.saveState(state);
    await this.audit(result === "applied" ? "package_applied" : result === "replay" ? "package_replay" : "package_noop", {
      filename: identity.filename,
      archiveSha256: identity.archiveSha256,
      ...facts,
    });
    try {
      const retention = await this.retentionPruner(this.paths, { activeRunId: report?.runId, now: this.now });
      if (retention.backupsDeleted.length || retention.reportsDeleted.length) {
        await this.audit("retention_pruned", {
          packageMode: facts.packageMode,
          runId: facts.runId,
          backupsDeleted: retention.backupsDeleted.length,
          reportsDeleted: retention.reportsDeleted.length,
        });
      }
    } catch {
      await this.audit("retention_error", { packageMode: facts.packageMode, runId: facts.runId });
    }
    return { status: result, report };
  }

  async processArchive(state, archive, { identity: providedIdentity } = {}) {
    const identity = providedIdentity || await stableArchiveIdentity(archive, this.hashFile);
    if (!identity) return { status: "deferred", reason: "file_changed_during_hash" };
    const previous = state.packages[identity.filename];
    if (previous?.archiveSha256 === identity.archiveSha256 && FINAL_RESULTS.has(previous.result)) return { status: "already_handled" };
    if (state.lastSuccessfulPackageTimestamp && identity.vendorTimestamp <= state.lastSuccessfulPackageTimestamp) {
      if (await isKnownReplay(this.paths, state, identity.archiveSha256)) {
        const report = { packageMode: { value: null }, runId: null, noOp: true, replay: { detected: true }, media: { incomingFiles: [], missingRequiredFiles: [] } };
        return this.completePackage(state, identity, "replay", report);
      }
      return this.markBlocked(state, identity, "OUT_OF_ORDER", new Error("Package timestamp is not newer than the last successfully handled package."));
    }

    let dryRun;
    try {
      dryRun = await this.runImportImpl({
        repoRoot: this.paths.repoRoot,
        stateRoot: this.paths.stateRoot,
        environment: this.environment,
        sourceDirectory: identity.path,
        apply: false,
        force: false,
      });
    } catch (error) {
      return this.markBlocked(state, identity, "DRY_RUN_FAILED", error, error.report);
    }
    const valid = dryRun.packageMode?.supported
      && dryRun.validation?.passed
      && dryRun.media?.missingRequiredFiles?.length === 0
      && dryRun.guardrails?.passed
      && !dryRun.guardrails?.requiresForce;
    if (!valid) return this.markBlocked(state, identity, "DRY_RUN_BLOCKED", new Error("Package did not satisfy automatic-apply safety checks."), dryRun);
    if (dryRun.noOp || dryRun.replay?.detected) return this.completePackage(state, identity, dryRun.replay?.detected ? "replay" : "noop", dryRun);

    // A ZIP that changed after dry-run has not passed the checks that authorize
    // an apply. Fail closed rather than applying a different FTP upload.
    const beforeApply = await stableArchiveIdentity(archive, this.hashFile);
    if (!beforeApply || beforeApply.archiveSha256 !== identity.archiveSha256) {
      return this.markBlocked(state, identity, "FILE_CHANGED", new Error("Incoming archive changed after dry-run; refusing automatic apply."), dryRun);
    }

    let freeBytes;
    try { freeBytes = await this.getFreeBytes(this.paths.varDirectory); }
    catch (error) { return this.markBlocked(state, identity, "LOW_DISK", error, dryRun); }
    if (freeBytes < this.options.minFreeBytes) {
      return this.markBlocked(state, identity, "LOW_DISK", new Error(`Free state filesystem space ${freeBytes} is below ${this.options.minFreeBytes}.`), dryRun);
    }
    let applied;
    try {
      // Deliberately pass false: automation can never bypass PC-12 guardrails.
      applied = await this.runImportImpl({
        repoRoot: this.paths.repoRoot,
        stateRoot: this.paths.stateRoot,
        environment: this.environment,
        sourceDirectory: identity.path,
        apply: true,
        force: false,
      });
    } catch (error) {
      if (error instanceof ImportLockError || error?.stage === "lock") {
        if (state.packages[identity.filename]?.lastDeferredReason !== "lock") {
          state.packages[identity.filename] = { ...state.packages[identity.filename], lastDeferredReason: "lock" };
          await this.saveState(state);
          await this.audit("package_deferred_lock", { filename: identity.filename, archiveSha256: identity.archiveSha256, packageMode: dryRun.packageMode?.value || null });
        }
        return { status: "deferred", reason: "lock" };
      }
      return this.markBlocked(state, identity, "APPLY_FAILED", error, error.report || dryRun);
    }
    if (applied.applied) return this.completePackage(state, identity, "applied", applied);
    if (applied.noOp || applied.replay?.detected) return this.completePackage(state, identity, applied.replay?.detected ? "replay" : "noop", applied);
    return this.markBlocked(state, identity, "APPLY_INCOMPLETE", new Error("Importer returned neither applied nor no-op."), applied);
  }

  async runOnce() {
    const state = await this.loadState();
    if (!state) return { status: "not_initialized" };
    const paused = await exists(this.paths.pausedPath);
    if (paused) {
      if (!this.pauseObserved) await this.audit("paused", { packageMode: null });
      this.pauseObserved = true;
      return { status: "paused" };
    }
    if (this.pauseObserved) await this.audit("resumed", { packageMode: null });
    this.pauseObserved = false;
    if (state.blockedQueueHead) return { status: "blocked", blocked: state.blockedQueueHead };

    const archives = await scanIncomingArchives(this.paths.incomingDirectory);
    const candidates = [];
    const nowMs = this.now().getTime();
    for (const archive of archives) {
      if (state.activationWatermark.vendorTimestamp && archive.vendorTimestamp <= state.activationWatermark.vendorTimestamp) continue;
      const observation = state.observations[archive.filename];
      const stable = observation && observation.size === archive.size && observation.mtimeMs === archive.mtimeMs;
      state.observations[archive.filename] = { size: archive.size, mtimeMs: archive.mtimeMs, observedAt: nowIso(this.now()) };
      if (!state.packages[archive.filename]) {
        state.packages[archive.filename] = { filename: archive.filename, vendorTimestamp: archive.vendorTimestamp, result: "detected", detectedAt: nowIso(this.now()) };
        await this.audit("package_detected", { filename: archive.filename, packageMode: null });
      }
      if (stable && nowMs - archive.mtimeMs >= this.options.settleSeconds * 1000) candidates.push(archive);
    }
    await this.saveState(state);
    for (const candidate of candidates) {
      const outcome = await this.processArchive(state, candidate);
      if (["blocked", "deferred"].includes(outcome.status)) return outcome;
    }
    return { status: "running-ready", processed: candidates.length };
  }

  async retry(filename) {
    const state = await this.loadState();
    if (!state?.blockedQueueHead) throw new Error("No blocked automation package is available to retry.");
    if (state.blockedQueueHead.filename !== filename) throw new Error(`Only blocked queue head ${state.blockedQueueHead.filename} may be retried.`);
    const archive = (await scanIncomingArchives(this.paths.incomingDirectory)).find((entry) => entry.filename === filename);
    if (!archive) throw new Error(`Blocked package is no longer a regular incoming IMO ZIP: ${filename}`);
    const identity = await stableArchiveIdentity(archive, this.hashFile);
    if (!identity || identity.archiveSha256 !== state.blockedQueueHead.archiveSha256) {
      throw new Error(`Blocked package identity changed; refusing retry: ${filename}`);
    }
    state.blockedQueueHead = null;
    state.packages[filename] = { ...state.packages[filename], result: "retry_requested", retriedAt: nowIso(this.now()) };
    await this.saveState(state);
    await this.audit("package_retry", { filename, archiveSha256: identity.archiveSha256, packageMode: null });
    return this.processArchive(state, archive, { identity });
  }

  async watch({ signal } = {}) {
    let outcome = await this.runOnce();
    while (!signal?.aborted) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, this.options.pollSeconds * 1000));
      if (signal?.aborted) break;
      outcome = await this.runOnce();
    }
    return outcome;
  }
}
