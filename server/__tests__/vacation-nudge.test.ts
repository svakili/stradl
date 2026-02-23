import { describe, it, expect } from 'vitest';
import { getVacationNudgeRecommendation } from '../../src/utils/vacationNudge.js';
import type { Settings, Task } from '../../src/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Task',
    status: 'Open',
    priority: null,
    createdAt: '2026-02-20T00:00:00.000Z',
    updatedAt: '2026-02-20T09:00:00.000Z',
    completedAt: null,
    isArchived: false,
    isDeleted: false,
    ...overrides,
  };
}

const baseSettings: Settings = {
  staleThresholdHours: 24,
  topN: 20,
  oneTimeOffsetHours: 0,
  oneTimeOffsetExpiresAt: null,
  vacationPromptLastShownForUpdatedAt: null,
};

describe('getVacationNudgeRecommendation', () => {
  it('returns recommendation when most recent active update is older than 24 hours', () => {
    const recommendation = getVacationNudgeRecommendation({
      tasks: [makeTask({ updatedAt: '2026-02-20T09:00:00.000Z' })],
      settings: baseSettings,
      nowMs: Date.parse('2026-02-23T10:00:00.000Z'),
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.suggestedDays).toBe(3);
    expect(recommendation?.mostRecentActiveUpdatedAt).toBe('2026-02-20T09:00:00.000Z');
  });

  it('suppresses popup for the same inactivity streak once already shown', () => {
    const mostRecentUpdatedAt = '2026-02-20T09:00:00.000Z';

    const recommendation = getVacationNudgeRecommendation({
      tasks: [makeTask({ updatedAt: mostRecentUpdatedAt })],
      settings: {
        ...baseSettings,
        vacationPromptLastShownForUpdatedAt: mostRecentUpdatedAt,
      },
      nowMs: Date.parse('2026-02-23T10:00:00.000Z'),
    });

    expect(recommendation).toBeNull();
  });
});
