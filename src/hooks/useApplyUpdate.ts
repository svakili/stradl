import { useCallback, useEffect, useState } from 'react';
import type { UpdateApplyStatus } from '../types';
import * as api from '../api';

const POLL_INTERVAL_MS = 2000;

function getMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Failed to process update request.';
}

interface RefreshOptions {
  suppressError?: boolean;
}

export function useApplyUpdate() {
  const [status, setStatus] = useState<UpdateApplyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async (options?: RefreshOptions) => {
    const suppressError = options?.suppressError ?? false;
    try {
      const next = await api.fetchUpdateApplyStatus();
      setStatus(next);
      setError(null);
      return next;
    } catch (err) {
      if (!suppressError) {
        setError(getMessage(err));
      }
      throw err;
    }
  }, []);

  useEffect(() => {
    if (status?.state !== 'running') return;

    const timer = window.setInterval(() => {
      void refreshStatus({ suppressError: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshStatus, status?.state]);

  const applyNow = useCallback(async () => {
    setError(null);
    try {
      const started = await api.applyUpdate();
      setStatus({
        state: 'running',
        step: 'queued',
        operationId: started.operationId,
        startedAt: started.startedAt,
        toVersion: started.targetVersion,
      });
      await refreshStatus({ suppressError: true });
    } catch (error) {
      const message = getMessage(error);
      setError(message);
      throw new Error(message);
    }
  }, [refreshStatus]);

  return {
    status,
    error,
    isApplying: status?.state === 'running',
    applyNow,
    refreshStatus,
  };
}
