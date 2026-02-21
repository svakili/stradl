import { useState, useEffect, useCallback } from 'react';
import type { Task, TabName } from '../types';
import * as api from '../api';

export function useTasks(tab: TabName) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.fetchTasks(tab);
      setTasks(data);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { reload(); }, [reload]);

  const create = async (data: { title: string; status?: string; priority?: string | null }) => {
    await api.createTask(data);
    await reload();
  };

  const update = async (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived' | 'isDeleted'>>) => {
    await api.updateTask(id, data);
    await reload();
  };

  const complete = async (id: number) => {
    await api.completeTask(id);
    await reload();
  };

  const uncomplete = async (id: number) => {
    await api.uncompleteTask(id);
    await reload();
  };

  const remove = async (id: number) => {
    await api.deleteTask(id);
    await reload();
  };

  const permanentRemove = async (id: number) => {
    await api.permanentDeleteTask(id);
    await reload();
  };

  return { tasks, loading, reload, create, update, complete, uncomplete, remove, permanentRemove };
}
