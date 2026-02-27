import { describe, it, expect, vi, afterEach } from 'vitest';
import { isStale } from '../../src/utils/staleness.js';
import type { Settings } from '../../src/types.js';

function withNow(isoTime: string, fn: () => void) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoTime));
  try {
    fn();
  } finally {
    vi.useRealTimers();
  }
}

const baseSettings: Settings = {
  staleThresholdHours: 24,
  topN: 20,
  oneTimeOffsetHours: 0,
  oneTimeOffsetExpiresAt: null,
  vacationPromptLastShownForUpdatedAt: null,
  focusedTaskId: null,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('isStale', () => {
  it('delays stale status when one-time offset is active', () => {
    withNow('2026-02-23T12:00:00.000Z', () => {
      const settings: Settings = {
        ...baseSettings,
        oneTimeOffsetHours: 24,
        oneTimeOffsetExpiresAt: '2026-02-23T23:59:59.999Z',
      };
      // 30h elapsed should not be stale if threshold is 24h + 24h offset.
      const stale = isStale('2026-02-22T06:00:00.000Z', settings);
      expect(stale).toBe(false);
    });
  });

  it('does not apply one-time offset after expiry', () => {
    withNow('2026-02-24T12:00:00.000Z', () => {
      const settings: Settings = {
        ...baseSettings,
        oneTimeOffsetHours: 24,
        oneTimeOffsetExpiresAt: '2026-02-23T23:59:59.999Z',
      };
      // 30h elapsed should be stale once offset has expired.
      const stale = isStale('2026-02-23T06:00:00.000Z', settings);
      expect(stale).toBe(true);
    });
  });

  it('uses stale threshold only when no one-time offset exists', () => {
    withNow('2026-02-23T12:00:00.000Z', () => {
      const stale = isStale('2026-02-22T11:00:00.000Z', baseSettings);
      expect(stale).toBe(true);
    });
  });
});
