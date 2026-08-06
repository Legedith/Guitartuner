const MINIMUM_SPEED = 0.1;
const MAXIMUM_SPEED = 1;
const MINIMUM_RATE = 5;
const MAXIMUM_RATE = 45;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizePracticeScrollSpeed(value) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : 0.5;
  return Math.round(clamp(safe, MINIMUM_SPEED, MAXIMUM_SPEED) * 10) / 10;
}

export function practiceScrollPixelsPerSecond(speed) {
  const normalized = normalizePracticeScrollSpeed(speed);
  const progress = (normalized - MINIMUM_SPEED) / (MAXIMUM_SPEED - MINIMUM_SPEED);
  return MINIMUM_RATE + ((MAXIMUM_RATE - MINIMUM_RATE) * progress);
}

export function advancePracticeScrollPosition(position, elapsedSeconds, speed, maximumPosition) {
  const maximum = Math.max(0, Number(maximumPosition) || 0);
  if (!maximum) return 0;
  const current = clamp(Number(position) || 0, 0, maximum);
  const elapsed = clamp(Number(elapsedSeconds) || 0, 0, 0.25);
  return Math.min(maximum, current + (practiceScrollPixelsPerSecond(speed) * elapsed));
}
