import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeOffer } from "../src/domain/offers/normalizeOffer.js";

const snapshot = JSON.parse(await readFile(new URL("../_input/imo-current/oferty.json", import.meta.url), "utf8"));
const offers = Object.values(snapshot).map((entry) => normalizeOffer(entry));
assert.equal(offers.length, 10, "the demo must contain ten offers");
assert.ok(offers.filter((offer) => offer.images.length >= 3 && offer.images.length <= 6).length >= 5, "five offers must have a multi-image gallery");
const allFiles = new Set();
for (const offer of offers) {
  assert.ok(offer.images.length > 0, `offer ${offer.id} must have a cover`);
  for (const [index, image] of offer.images.entries()) {
    assert.equal(image.order, index + 1, "images must retain their numerical order");
    assert.match(image.filename, /^offer-demo-\d{2}-\d{2}\.webp$/);
    assert.equal(image.url, `/media/offers/${image.filename}`);
    assert.ok(!allFiles.has(image.filename), "a gallery image must belong to one offer");
    allFiles.add(image.filename);
    const publicFile = await readFile(new URL(`../public/media/offers/${image.filename}`, import.meta.url));
    const sourceFile = await readFile(new URL(`../_input/imo-current/photos/${image.filename}`, import.meta.url));
    assert.deepEqual(publicFile, sourceFile, "source fixture and public image must match");
    assert.equal(publicFile.includes(Buffer.from("EXIF")), false, "images must not contain EXIF metadata");
  }
}
console.log(`Demo media: ${offers.length} offers and ${allFiles.size} ordered, unique images passed.`);
