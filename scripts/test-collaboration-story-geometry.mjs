import assert from "node:assert/strict";
import {
  calculateChapterReadingLift,
  calculateStoryTimelineUnit,
} from "../src/components/home/collaborationStoryGeometry.js";

assert.equal(calculateStoryTimelineUnit(960 * 568, 568, 4.68), (960 * 568 - 568 * 2) / 4.68);
assert.equal(calculateStoryTimelineUnit(1000, 600, 4.68), 0);
assert.equal(calculateStoryTimelineUnit(NaN, 568, 4.68), 0);

// The final chapter naturally occupies 699px at 320x568. Its planned compact
// lift is already sufficient, so preserve the existing visual rhythm.
assert.equal(calculateChapterReadingLift({ panelHeight: 568, contentHeight: 699, baseLift: 568 * 0.26 }), 568 * 0.26);
// In 740x360 landscape, the desktop-width layout still needs room for 67px of
// real content overflow. The lift derives from that geometry instead of a
// device-specific height exception.
assert.equal(calculateChapterReadingLift({ panelHeight: 360, contentHeight: 427, baseLift: 0 }), 79);
assert.equal(calculateChapterReadingLift({ panelHeight: 844, contentHeight: 700, baseLift: 0 }), 0);

console.log("PC-04 collaboration story geometry checks passed.");
