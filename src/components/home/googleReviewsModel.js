export function normalizeGoogleReviews(payload) {
  const averageRating = Number(payload?.averageRating);
  const totalReviewCount = Number(payload?.totalReviewCount);
  const reviews = Array.isArray(payload?.reviews)
    ? payload.reviews
      .map((review) => ({
        id: String(review?.id || "").trim(),
        author: String(review?.author || "Użytkownik Google").trim() || "Użytkownik Google",
        rating: Number(review?.rating),
        text: String(review?.text || "").trim(),
        createdAt: review?.createdAt || null,
        updatedAt: review?.updatedAt || null,
      }))
      .filter((review) => review.id && review.text && review.rating >= 1 && review.rating <= 5)
    : [];

  if (!reviews.length || !Number.isFinite(averageRating) || !Number.isFinite(totalReviewCount) || totalReviewCount < 1) return null;

  return {
    averageRating,
    totalReviewCount,
    reviews,
    reviewsUrl: typeof payload?.reviewsUrl === "string" && payload.reviewsUrl.trim() ? payload.reviewsUrl.trim() : null,
  };
}

export function createGoogleReviewModalContent(review) {
  if (!review || typeof review.text !== "string" || !review.text) return null;

  return {
    author: review.author,
    rating: review.rating,
    text: review.text,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

export function getGoogleReviewTickerTarget({ isModalOpen, isPointerInside, isFocusInsideRail, interactionModality }) {
  return isModalOpen || isPointerInside || (isFocusInsideRail && interactionModality === "keyboard") ? 0 : 1;
}

export function resetGoogleReviewTickerAfterModalClose(state) {
  return {
    ...state,
    isModalOpen: false,
    isPointerInside: false,
    lastPointerPosition: null,
  };
}
