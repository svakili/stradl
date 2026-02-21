import { useState, useCallback } from 'react';
import type { Blocker } from '../types';
import * as api from '../api';

export function useBlockers() {
  const [blockers, setBlockers] = useState<Record<number, Blocker[]>>({});

  const loadForTask = useCallback(async (taskId: number) => {
    const data = await api.fetchBlockers(taskId);
    setBlockers(prev => ({ ...prev, [taskId]: data }));
  }, []);

  const create = async (taskId: number, data: { blockedByTaskId?: number; blockedUntilDate?: string }) => {
    await api.createBlocker(taskId, data);
    await loadForTask(taskId);
  };

  const remove = async (blockerId: number, taskId: number) => {
    await api.deleteBlocker(blockerId);
    await loadForTask(taskId);
  };

  return { blockers, loadForTask, create, remove };
}
