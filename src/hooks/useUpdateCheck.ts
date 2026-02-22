import { useCallback, useState } from 'react';
import type { UpdateCheckResult } from '../types';
import * as api from '../api';

const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_CHECKED_KEY = 'stradl-update-last-checked-at';
const LAST_RESULT_KEY = 'stradl-update-last-result';
export const LAST_NOTIFIED_VERSION_KEY = 'stradl-update-last-notified-version';

function getStoredString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in private browsing / restricted contexts.
  }
}

function getStoredResult(): UpdateCheckResult | null {
  const raw = getStoredString(LAST_RESULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UpdateCheckResult;
  } catch {
    return null;
  }
}

export function useUpdateCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [lastResult, setLastResult] = useState<UpdateCheckResult | null>(() => getStoredResult());
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(() => getStoredString(LAST_CHECKED_KEY));
  const [error, setError] = useState<string | null>(null);

  const checkNow = useCallback(async ({ manual }: { manual: boolean }) => {
    if (isChecking) return lastResult;

    setIsChecking(true);
    setError(null);

    try {
      const result = await api.checkForUpdates();
      setLastResult(result);
      setLastCheckedAt(result.checkedAt);
      setStoredString(LAST_CHECKED_KEY, result.checkedAt);
      setStoredString(LAST_RESULT_KEY, JSON.stringify(result));
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check for updates.';
      if (manual) {
        setError(message);
        throw new Error(message);
      }
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, lastResult]);

  const maybeAutoCheck = useCallback(async () => {
    const storedCheckedAt = getStoredString(LAST_CHECKED_KEY);
    if (storedCheckedAt) {
      const parsed = Date.parse(storedCheckedAt);
      if (!Number.isNaN(parsed) && Date.now() - parsed < AUTO_CHECK_INTERVAL_MS) {
        return null;
      }
    }
    return checkNow({ manual: false });
  }, [checkNow]);

  return {
    isChecking,
    lastResult,
    lastCheckedAt,
    error,
    checkNow,
    maybeAutoCheck,
  };
}
