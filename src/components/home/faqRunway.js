/**
 * Returns only the additional scroll distance introduced by expanded FAQ
 * content. Keeping this calculation separate makes the layout contract easy
 * to verify without depending on DOM measurement details.
 */
export function calculateFaqExtraRunway(baselineHeight, currentHeight) {
  if (!Number.isFinite(baselineHeight) || !Number.isFinite(currentHeight)) return 0;

  return Math.max(0, Math.round((currentHeight - baselineHeight) * 100) / 100);
}
