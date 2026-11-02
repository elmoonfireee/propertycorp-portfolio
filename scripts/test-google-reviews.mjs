import assert from "node:assert/strict";
import { cleanGoogleReviewText, normalizeGoogleReview } from "../api/google-reviews.js";
import { createGoogleReviewModalContent, getGoogleReviewTickerTarget, normalizeGoogleReviews, resetGoogleReviewTickerAfterModalClose } from "../src/components/home/googleReviewsModel.js";

assert.equal(cleanGoogleReviewText("Profesjonalna i uważna obsługa."), "Profesjonalna i uważna obsługa.");
assert.equal(cleanGoogleReviewText("  Profesjonalna i uważna obsługa.  \n"), "  Profesjonalna i uważna obsługa.  \n");
assert.equal(
  cleanGoogleReviewText("Dawno się nie spotkałem z taką jakością.\n\n(Translated by Google)\nI have not encountered this quality before."),
  "Dawno się nie spotkałem z taką jakością.",
);
assert.equal(
  cleanGoogleReviewText("Pierwsza linia.\n\n\n(TRANSLATED BY GOOGLE)\nTranslated copy."),
  "Pierwsza linia.",
);
assert.equal(cleanGoogleReviewText(null), "");
assert.equal(normalizeGoogleReview({ comment: "", starRating: "FIVE" }), null);
assert.equal(normalizeGoogleReview({ comment: "W porządku", starRating: "UNKNOWN" }), null);

const completeReviewText = Array.from({ length: 30 }, () => "Pełna opinia klienta.").join(" ");
const validReviewPayload = {
  averageRating: 5,
  totalReviewCount: 17,
  reviews: [{ id: "review-1", author: "Jan", rating: 5, text: completeReviewText }],
};
const normalizedReviews = normalizeGoogleReviews(validReviewPayload);
assert.equal(normalizedReviews.reviewsUrl, null);
assert.equal(normalizedReviews.reviews[0].text, completeReviewText, "The ticker preview must retain source text for the full-review modal.");
assert.equal(createGoogleReviewModalContent(normalizedReviews.reviews[0]).text, completeReviewText, "The modal receives the complete, untruncated review.");
assert.equal(createGoogleReviewModalContent(null), null);
assert.equal(getGoogleReviewTickerTarget({ isModalOpen: false, isPointerInside: false, isFocusInsideRail: true, interactionModality: "pointer" }), 1, "Pointer-restored focus alone must not pause the ticker.");
assert.equal(getGoogleReviewTickerTarget({ isModalOpen: false, isPointerInside: false, isFocusInsideRail: true, interactionModality: "keyboard" }), 0, "Keyboard focus inside the rail pauses the ticker.");
assert.equal(getGoogleReviewTickerTarget({ isModalOpen: false, isPointerInside: true, isFocusInsideRail: true, interactionModality: "pointer" }), 0, "A pointer physically over the rail pauses the ticker.");
assert.equal(getGoogleReviewTickerTarget({ isModalOpen: true, isPointerInside: false, isFocusInsideRail: true, interactionModality: "pointer" }), 0, "An open modal pauses regardless of modality.");
assert.equal(
  getGoogleReviewTickerTarget(resetGoogleReviewTickerAfterModalClose({
    isModalOpen: true,
    isPointerInside: true,
    isFocusInsideRail: true,
    interactionModality: "pointer",
    lastPointerPosition: { x: 120, y: 80 },
  })),
  1,
  "Closing a pointer-opened modal clears the stale card pointer state and resumes the ticker.",
);
assert.equal(
  normalizeGoogleReviews({ ...validReviewPayload, reviewsUrl: " https://google.example/reviews " }).reviewsUrl,
  "https://google.example/reviews",
);

console.log("Google review normalization and presentation helpers passed.");
