import type { Task, Blocker, Settings, TabName, UpdateCheckResult } from './types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

// Tasks
export const fetchTasks = (tab: TabName) =>
  request<Task[]>(`/tasks?tab=${tab}`);

export const createTask = (data: { title: string; status?: string; priority?: string | null }) =>
  request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) });

export const updateTask = (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived' | 'isDeleted'>>) =>
  request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const completeTask = (id: number) =>
  request<Task>(`/tasks/${id}/complete`, { method: 'POST' });

export const uncompleteTask = (id: number) =>
  request<Task>(`/tasks/${id}/uncomplete`, { method: 'POST' });

export const deleteTask = (id: number) =>
  request<Task>(`/tasks/${id}`, { method: 'DELETE' });

export const permanentDeleteTask = (id: number) =>
  request<void>(`/tasks/${id}?permanent=true`, { method: 'DELETE' });

// Blockers
export const fetchBlockers = (taskId: number) =>
  request<Blocker[]>(`/tasks/${taskId}/blockers`);

export const createBlocker = (taskId: number, data: { blockedByTaskId?: number; blockedUntilDate?: string }) =>
  request<Blocker>(`/tasks/${taskId}/blockers`, { method: 'POST', body: JSON.stringify(data) });

export const deleteBlocker = (id: number) =>
  request<void>(`/blockers/${id}`, { method: 'DELETE' });

// Settings
export const fetchSettings = () =>
  request<Settings>('/settings');

export const updateSettings = (data: Partial<Settings>) =>
  request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(data) });

// Updates
export const checkForUpdates = () =>
  request<UpdateCheckResult>('/update-check');
