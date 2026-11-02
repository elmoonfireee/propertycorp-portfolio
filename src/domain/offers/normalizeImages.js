const photoKey = /^zdjecie(\d+)$/i;

export function buildOfferImageUrl(filename, mediaBasePath = "/media/offers") {
  const safeFilename = String(filename || "").split(/[\\/]/).pop();
  if (!safeFilename) return null;
  return `${mediaBasePath.replace(/\/$/, "")}/${safeFilename}`;
}

/**
 * Reads numbered IMO photo fields instead of the legacy `zdjecia` array,
 * which can be alphabetically ordered (1, 10, 11, 2...).
 */
export function normalizeImages(rawOffer, { availableFilenames, mediaBasePath } = {}) {
  const available = availableFilenames ? new Set(availableFilenames) : null;
  const references = Object.entries(rawOffer || {})
    .map(([key, filename]) => {
      const match = key.match(photoKey);
      if (!match || !filename) return null;
      return { filename: String(filename), order: Number(match[1]) };
    })
    .filter(Boolean)
    .sort((left, right) => left.order - right.order);

  const missingFilenames = [];
  const images = references.flatMap((image) => {
    if (available && !available.has(image.filename)) {
      missingFilenames.push(image.filename);
      return [];
    }

    return [{
      ...image,
      url: buildOfferImageUrl(image.filename, mediaBasePath),
    }];
  });

  return { images, missingFilenames };
}
