import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateOfferSnapshot } from "./lib/offerValidation.mjs";

const inputDirectory = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(process.cwd(), "_input", "imo-current");
const photosDirectory = join(inputDirectory, "photos");

async function listPhotoNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listPhotoNames(path) : [entry.name];
  }));
  return nested.flat();
}

const [snapshotText, photoNames] = await Promise.all([
  readFile(join(inputDirectory, "oferty.json"), "utf8"),
  listPhotoNames(photosDirectory),
]);
const { summary } = validateOfferSnapshot(JSON.parse(snapshotText), { availableFilenames: photoNames });
console.log(JSON.stringify(summary, null, 2));
