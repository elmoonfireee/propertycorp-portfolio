import { cp, lstat, mkdir, readdir, realpath, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function isNonEmpty(directory) {
  try { return (await readdir(directory)).length > 0; } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function assertSafeDestination(destination) {
  const parsed = resolve(destination);
  if (parsed === resolve(parsed, "..")) throw new Error("Bootstrap destination must not be a filesystem root.");
  return parsed;
}

async function resolveExistingPath(path) {
  let current = resolve(path);
  const missing = [];
  while (true) {
    try {
      await lstat(current);
      return resolve(await realpath(current), ...missing.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      // A dangling link is not a missing directory that can safely be created.
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new Error(`Cannot resolve symbolic link: ${current}`);
      } catch (statError) {
        if (statError.code !== "ENOENT") throw statError;
      }
      const parent = dirname(current);
      if (parent === current) throw error;
      missing.push(current.slice(parent.length).replace(/^[/\\]+/, ""));
      current = parent;
    }
  }
}

function pathsOverlap(first, second) {
  const a = process.platform === "win32" ? first.toLowerCase() : first;
  const b = process.platform === "win32" ? second.toLowerCase() : second;
  const within = (parent, child) => {
    const path = relative(parent, child);
    return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  return within(a, b) || within(b, a);
}

/**
 * One-time host-state initializer. It never runs during container startup and
 * refuses an occupied accepted-state destination unless --force is explicit.
 */
export async function bootstrapPersistentState({
  destination,
  sourceRoot = projectRoot,
  force = false,
} = {}) {
  if (!destination) throw new Error("A bootstrap destination is required.");
  const targetRoot = assertSafeDestination(destination);
  const sourceInput = join(resolve(sourceRoot), "_input", "imo-current");
  const sourceMedia = join(resolve(sourceRoot), "public", "media", "offers");
  const targetInput = join(targetRoot, "imo-current");
  const targetMedia = join(targetRoot, "media", "offers");

  for (const source of [sourceInput, sourceMedia]) {
    if (!(await stat(source)).isDirectory()) throw new Error(`Bootstrap source is not a directory: ${source}`);
  }
  assertSafeDestination(await resolveExistingPath(targetRoot));
  const sources = await Promise.all([sourceInput, sourceMedia].map(resolveExistingPath));
  const targets = await Promise.all([targetInput, targetMedia, join(targetRoot, "var")].map(resolveExistingPath));
  if (sources.some((source) => targets.some((target) => pathsOverlap(source, target)))) {
    throw new Error("Bootstrap source and destination paths must not overlap.");
  }
  if (targets.some((target, index) => targets.slice(index + 1).some((other) => pathsOverlap(target, other)))) {
    throw new Error("Bootstrap destination paths must not overlap.");
  }

  if (!force && (await isNonEmpty(targetInput) || await isNonEmpty(targetMedia))) {
    throw new Error("Refusing to overwrite non-empty accepted state. Re-run with --force only after reviewing the destination.");
  }
  if (force) {
    await rm(targetInput, { recursive: true, force: true });
    await rm(targetMedia, { recursive: true, force: true });
  }
  await mkdir(targetRoot, { recursive: true });
  await cp(sourceInput, targetInput, { recursive: true, force: true, errorOnExist: false });
  await cp(sourceMedia, targetMedia, { recursive: true, force: true, errorOnExist: false });
  await mkdir(join(targetRoot, "var"), { recursive: true });
  return { destination: targetRoot, inputDirectory: targetInput, mediaDirectory: targetMedia, varDirectory: join(targetRoot, "var") };
}
