export function formatOfferArea(area) {
  if (area == null) return "—";
  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(area)} m²`;
}

export function formatOfferRoomCount(rooms) {
  if (rooms == null) return null;
  if (rooms === 1) return "1 pokój";
  if (rooms >= 2 && rooms <= 4) return `${rooms} pokoje`;
  return `${rooms} pokoi`;
}

export function formatOfferFloor(floor) {
  if (floor == null) return null;
  return floor === 0 ? "parter" : `${floor}. piętro`;
}

export function getOfferDescriptionPreview(description) {
  const fallback = "Poznaj układ, lokalizację i szczegóły tej wyjątkowej nieruchomości.";
  const plainText = String(description?.text || "").replace(/\s+/g, " ").trim();
  if (!plainText) return fallback;

  const legalNotice = /treść niniejszego|niniejsze ogłoszenie|nie stanowi oferty|kodeksu cywilnego|charakter informacyjny|oferta wysłana z programu imo/i;
  const sentences = plainText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  const firstEditorialSentence = sentences.find((sentence) => !legalNotice.test(sentence));

  // The preview is taken from a whole sentence; CSS only clamps it visually.
  return firstEditorialSentence || fallback;
}
