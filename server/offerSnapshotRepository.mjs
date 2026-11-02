import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOffer } from "../src/domain/offers/normalizeOffer.js";
import { resolvePropertyCorpStatePaths } from "./statePaths.mjs";

const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export class RuntimeOfferSnapshotError extends Error {
  constructor(code) {
    super(code);
    this.name = "RuntimeOfferSnapshotError";
    this.code = code;
  }
}

function hashSnapshot(text) {
  return createHash("sha256").update(text).digest("hex");
}

function snapshotSignature(snapshotStat) {
  return `${snapshotStat.size}:${snapshotStat.mtimeMs}:${snapshotStat.ino || ""}`;
}

function toPublicOffer(offer) {
  // `source` is adapter provenance and `imageIssues` is an operational
  // validation detail. Other normalized fields remain in the response; their
  // publication policy still needs an explicit decision.
  const { source, imageIssues, ...publicOffer } = offer;
  return publicOffer;
}

function normalizeSnapshot(rawSnapshot) {
  if (!rawSnapshot || typeof rawSnapshot !== "object" || Array.isArray(rawSnapshot)) {
    throw new RuntimeOfferSnapshotError("snapshot_invalid");
  }
  try {
    return Object.values(rawSnapshot)
      .map((rawOffer) => toPublicOffer(normalizeOffer(rawOffer)))
      .sort((left, right) => Number(left.externalId) - Number(right.externalId));
  } catch {
    throw new RuntimeOfferSnapshotError("snapshot_invalid");
  }
}

/**
 * Reloads the accepted snapshot whenever its filesystem identity changes.
 * PC-12 promotes a replacement file, so this cannot retain an immutable
 * process-start snapshot after an accepted import.
 */
export function createRuntimeOfferRepository({
  snapshotPath,
  stateRoot,
  projectRoot: repositoryProjectRoot = defaultProjectRoot,
  environment = process.env,
  readSnapshotFile = readFile,
  statSnapshotFile = stat,
} = {}) {
  const resolvedSnapshotPath = snapshotPath || resolvePropertyCorpStatePaths({
    projectRoot: repositoryProjectRoot,
    stateRoot,
    environment,
  }).currentSnapshotPath;
  let cached = null;

  async function load() {
    let snapshotStat;
    try {
      snapshotStat = await statSnapshotFile(resolvedSnapshotPath);
    } catch {
      throw new RuntimeOfferSnapshotError("snapshot_unavailable");
    }
    if (!snapshotStat.isFile()) throw new RuntimeOfferSnapshotError("snapshot_unavailable");

    const signature = snapshotSignature(snapshotStat);
    if (cached?.signature === signature) return cached;

    let text;
    try {
      text = await readSnapshotFile(resolvedSnapshotPath, "utf8");
    } catch {
      throw new RuntimeOfferSnapshotError("snapshot_unavailable");
    }

    let rawSnapshot;
    try {
      rawSnapshot = JSON.parse(text);
    } catch {
      throw new RuntimeOfferSnapshotError("snapshot_invalid");
    }

    const offers = normalizeSnapshot(rawSnapshot);
    cached = {
      signature,
      offers,
      etag: `"${hashSnapshot(text)}"`,
    };
    return cached;
  }

  return {
    load,
    async getOffers() {
      return (await load()).offers;
    },
    async getHealth() {
      const snapshot = await load();
      return { status: "ok", snapshotReadable: true, offerCount: snapshot.offers.length };
    },
  };
}

export { toPublicOffer };
