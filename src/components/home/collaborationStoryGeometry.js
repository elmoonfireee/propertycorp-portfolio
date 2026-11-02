export function calculateStoryTimelineUnit(trackHeight, panelHeight, storyEnd) {
  const track = Number(trackHeight);
  const panel = Number(panelHeight);
  const end = Number(storyEnd);

  if (!Number.isFinite(track) || !Number.isFinite(panel) || !Number.isFinite(end) || panel <= 0 || end <= 0) return 0;

  // The last panel-height belongs to the incoming light section. Keeping it
  // out of the animated portion makes the sticky release and CSS overlap meet
  // at the same stable geometry.
  return Math.max(track - panel * 2, 0) / end;
}

export function calculateChapterReadingLift({ panelHeight, contentHeight, baseLift = 0, safetyPadding = 12 }) {
  const panel = Number(panelHeight);
  const content = Number(contentHeight);
  const base = Number(baseLift);
  const padding = Number(safetyPadding);

  if (!Number.isFinite(panel) || panel <= 0) return Math.max(Number.isFinite(base) ? base : 0, 0);

  const overflow = Number.isFinite(content) ? Math.max(content - panel, 0) : 0;
  const overflowLift = overflow > 0 ? overflow + Math.max(Number.isFinite(padding) ? padding : 0, 0) : 0;
  return Math.max(Number.isFinite(base) ? base : 0, overflowLift);
}
