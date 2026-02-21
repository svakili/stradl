import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '../types';
import * as api from '../api';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    staleThresholdHours: 24,
    topN: 20,
    globalTimeOffset: 0,
  });

  const reload = useCallback(async () => {
    const data = await api.fetchSettings();
    setSettings(data);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const update = async (data: Partial<Settings>) => {
    const updated = await api.updateSettings(data);
    setSettings(updated);
  };

  return { settings, reload, update };
}
