import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '../types';
import * as api from '../api';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    staleThresholdHours: 24,
    topN: 20,
    oneTimeOffsetHours: 0,
    oneTimeOffsetExpiresAt: null,
    vacationPromptLastShownForUpdatedAt: null,
  });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await api.fetchSettings();
      setSettings(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const update = async (data: Partial<Settings>) => {
    const updated = await api.updateSettings(data);
    setSettings(updated);
  };

  return { settings, loading, reload, update };
}
