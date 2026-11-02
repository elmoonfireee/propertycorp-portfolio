const transliteration = {
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
};

/**
 * Creates the human-readable part of an offer URL. The IMO identifier is
 * deliberately kept out of this value and is appended by buildOfferPath().
 */
export function buildOfferSlug(value) {
  const source = String(value || "")
    .trim()
    .replace(/[łŁđĐ]/g, (character) => transliteration[character]);

  const slug = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "oferta";
}
