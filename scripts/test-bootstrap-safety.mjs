import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { bootstrapPersistentState } from "./lib/persistentStateBootstrap.mjs";

const root = await mkdtemp(join(tmpdir(), "propertycorp-bootstrap-safety-"));
try {
  const source = join(root, "source");
  const input = join(source, "_input", "imo-current");
  const media = join(source, "public", "media", "offers");
  await mkdir(input, { recursive: true });
  await mkdir(media, { recursive: true });
  await writeFile(join(input, "snapshot.json"), "source snapshot");
  await writeFile(join(media, "image.jpg"), "source image");

  const unsafeDestinations = [
    join(source, "_input"), // target input is the source input
    join(input, "nested"), // target is inside the source
    join(source, "public"), // target media is the source media
    relative(process.cwd(), join(source, "_input")),
  ];
  if (process.platform === "win32") unsafeDestinations.push(join(source, "_input").toUpperCase());
  for (const destination of unsafeDestinations) {
    await assert.rejects(
      () => bootstrapPersistentState({ sourceRoot: source, destination, force: true }),
      /must not overlap/,
    );
    assert.equal(await readFile(join(input, "snapshot.json"), "utf8"), "source snapshot");
    assert.equal(await readFile(join(media, "image.jpg"), "utf8"), "source image");
  }

  const ancestorDestination = join(root, "ancestor-state");
  const nestedSource = join(ancestorDestination, "imo-current", "nested-source");
  await mkdir(join(nestedSource, "_input", "imo-current"), { recursive: true });
  await mkdir(join(nestedSource, "public", "media", "offers"), { recursive: true });
  await writeFile(join(nestedSource, "_input", "imo-current", "snapshot.json"), "nested source");
  await assert.rejects(
    () => bootstrapPersistentState({ sourceRoot: nestedSource, destination: ancestorDestination, force: true }),
    /must not overlap/,
  );
  assert.equal(await readFile(join(nestedSource, "_input", "imo-current", "snapshot.json"), "utf8"), "nested source");

  const alias = join(root, "input-alias");
  try {
    await symlink(join(source, "_input"), alias, "junction");
    await assert.rejects(
      () => bootstrapPersistentState({ sourceRoot: source, destination: alias, force: true }),
      /must not overlap/,
    );
    assert.equal(await readFile(join(input, "snapshot.json"), "utf8"), "source snapshot");
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
    console.log("Bootstrap safety: symbolic link test skipped (unavailable on this system).");
  }

  const destination = join(root, "separate-state");
  await bootstrapPersistentState({ sourceRoot: source, destination });
  assert.equal(await readFile(join(destination, "imo-current", "snapshot.json"), "utf8"), "source snapshot");
  await writeFile(join(destination, "imo-current", "old.txt"), "old data");
  await assert.rejects(() => bootstrapPersistentState({ sourceRoot: source, destination }), /Refusing to overwrite/);
  await bootstrapPersistentState({ sourceRoot: source, destination, force: true });
  await assert.rejects(() => readFile(join(destination, "imo-current", "old.txt")), { code: "ENOENT" });
  assert.equal(await readFile(join(media, "image.jpg"), "utf8"), "source image");

  await writeFile(join(destination, "imo-current", "keep.txt"), "keep");
  await assert.rejects(() => bootstrapPersistentState({ sourceRoot: join(root, "missing"), destination, force: true }), { code: "ENOENT" });
  assert.equal(await readFile(join(destination, "imo-current", "keep.txt"), "utf8"), "keep");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Bootstrap safety: overlap and isolated force scenarios passed.");
