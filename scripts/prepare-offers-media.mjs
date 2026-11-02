import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const inputDirectory = join(process.cwd(), "_input", "imo-current");
const photosDirectory = join(inputDirectory, "photos");
const outputDirectory = join(process.cwd(), "public", "media", "offers");

async function listPhotoPaths(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listPhotoPaths(path) : [[entry.name, path]];
  }));
  return nested.flat();
}

const rawSnapshot = JSON.parse(await readFile(join(inputDirectory, "oferty.json"), "utf8"));
const referencedFilenames = new Set(
  Object.values(rawSnapshot).flatMap((offer) => Object.entries(offer)
    .filter(([key, value]) => /^zdjecie\d+$/i.test(key) && value)
    .map(([, value]) => String(value))),
);
const sourceByFilename = new Map(await listPhotoPaths(photosDirectory));
const missing = [...referencedFilenames].filter((filename) => !sourceByFilename.has(filename));

if (missing.length) {
  throw new Error(`Cannot prepare offer media; missing source files: ${missing.join(", ")}`);
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all([...referencedFilenames].map((filename) => copyFile(
  sourceByFilename.get(filename),
  join(outputDirectory, filename),
)));

console.log(JSON.stringify({ copied: referencedFilenames.size, outputDirectory }, null, 2));
