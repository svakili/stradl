import type { Settings, Task } from '../types';

export interface VacationNudgeRecommendation {
  mostRecentActiveUpdatedAt: string;
  inactivityHours: number;
  inactivityDays: number;
  suggestedDays: number;
}

interface VacationNudgeInput {
  tasks: Task[];
  settings: Settings;
  nowMs?: number;
}

export function getVacationNudgeRecommendation({
  tasks,
  settings,
  nowMs = Date.now(),
}: VacationNudgeInput): VacationNudgeRecommendation | null {
  const activeTasks = tasks.filter(t => t.completedAt == null && !t.isArchived);
  if (activeTasks.length === 0) return null;

  let mostRecentUpdatedAt: string | null = null;
  let mostRecentUpdatedMs = -Infinity;
  for (const task of activeTasks) {
    const updatedMs = Date.parse(task.updatedAt);
    if (!Number.isNaN(updatedMs) && updatedMs > mostRecentUpdatedMs) {
      mostRecentUpdatedMs = updatedMs;
      mostRecentUpdatedAt = task.updatedAt;
    }
  }

  if (!Number.isFinite(mostRecentUpdatedMs) || !mostRecentUpdatedAt) return null;

  const inactivityHours = (nowMs - mostRecentUpdatedMs) / 3600000;
  if (inactivityHours <= 24) return null;

  if (settings.vacationPromptLastShownForUpdatedAt === mostRecentUpdatedAt) return null;

  const expiresAtMs = settings.oneTimeOffsetExpiresAt ? Date.parse(settings.oneTimeOffsetExpiresAt) : NaN;
  const hasActiveOneTimeOffset = !Number.isNaN(expiresAtMs) && expiresAtMs > nowMs;
  if (hasActiveOneTimeOffset) return null;

  const suggestedDays = Math.max(1, Math.floor(inactivityHours / 24));
  return {
    mostRecentActiveUpdatedAt: mostRecentUpdatedAt,
    inactivityHours,
    inactivityDays: suggestedDays,
    suggestedDays,
  };
}

export function getManualVacationRecommendation(
  tasks: Task[],
  nowMs: number = Date.now(),
): VacationNudgeRecommendation {
  const activeTasks = tasks.filter(t => t.completedAt == null && !t.isArchived);

  let mostRecentUpdatedAt: string | null = null;
  let mostRecentUpdatedMs = -Infinity;
  for (const task of activeTasks) {
    const updatedMs = Date.parse(task.updatedAt);
    if (!Number.isNaN(updatedMs) && updatedMs > mostRecentUpdatedMs) {
      mostRecentUpdatedMs = updatedMs;
      mostRecentUpdatedAt = task.updatedAt;
    }
  }

  if (!Number.isFinite(mostRecentUpdatedMs) || !mostRecentUpdatedAt) {
    return {
      mostRecentActiveUpdatedAt: new Date(nowMs).toISOString(),
      inactivityHours: 0,
      inactivityDays: 1,
      suggestedDays: 1,
    };
  }

  const inactivityHours = (nowMs - mostRecentUpdatedMs) / 3600000;
  const suggestedDays = Math.max(1, Math.floor(inactivityHours / 24));
  return {
    mostRecentActiveUpdatedAt: mostRecentUpdatedAt,
    inactivityHours,
    inactivityDays: Math.max(1, suggestedDays),
    suggestedDays,
  };
}
