import type { Settings } from '../types';

export function isStale(updatedAt: string, settings: Settings): boolean {
  const elapsed = (Date.now() - new Date(updatedAt).getTime()) / 3600000;
  return elapsed > settings.staleThresholdHours + settings.globalTimeOffset;
}
