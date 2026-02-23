import type { Settings } from '../types';

export function isStale(updatedAt: string, settings: Settings): boolean {
  const now = Date.now();
  const elapsed = (now - new Date(updatedAt).getTime()) / 3600000;
  const expiresAt = settings.oneTimeOffsetExpiresAt ? Date.parse(settings.oneTimeOffsetExpiresAt) : NaN;
  const hasActiveOneTimeOffset = !Number.isNaN(expiresAt) && expiresAt >= now;
  const effectiveOneTimeOffsetHours = hasActiveOneTimeOffset ? settings.oneTimeOffsetHours : 0;
  return elapsed > settings.staleThresholdHours + effectiveOneTimeOffsetHours;
}
