import type {
  Task,
  Blocker,
  Settings,
  TabName,
  RuntimeInfo,
  StoredAppData,
  UpdateCheckResult,
  UpdateApplyStartResult,
  UpdateApplyStatus,
  DataSnapshotResult,
  DataImportResult,
} from './types';

const BASE = '/api';

function getDesktopApi() {
  if (typeof window === 'undefined') return null;
  return window.stradlDesktop ?? null;
}

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

export const updateTask = (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived'>>) =>
  request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const completeTask = (id: number) =>
  request<Task>(`/tasks/${id}/complete`, { method: 'POST' });

export const uncompleteTask = (id: number) =>
  request<Task>(`/tasks/${id}/uncomplete`, { method: 'POST' });

export const hideTask = (id: number, durationMinutes: 15 | 30 | 60 | 120 | 240) =>
  request<Task>(`/tasks/${id}/hide`, { method: 'POST', body: JSON.stringify({ durationMinutes }) });

export const hideTaskUntilDate = (id: number, hideUntilDate: string) =>
  request<Task>(`/tasks/${id}/hide`, { method: 'POST', body: JSON.stringify({ hideUntilDate }) });

export const unhideTask = (id: number) =>
  request<Task>(`/tasks/${id}/unhide`, { method: 'POST' });

export const focusTask = (id: number) =>
  request<{ focusedTaskId: number | null }>(`/tasks/${id}/focus`, { method: 'POST' });

export const clearFocusedTask = () =>
  request<{ focusedTaskId: null }>('/tasks/focus/clear', { method: 'POST' });

export const deleteTask = (id: number) =>
  request<void>(`/tasks/${id}`, { method: 'DELETE' });

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

// Runtime
export const fetchRuntimeInfo = async (): Promise<RuntimeInfo> => {
  const desktopApi = getDesktopApi();
  if (desktopApi) {
    return desktopApi.getRuntimeInfo();
  }

  return {
    mode: 'web',
    appVersion: 'web',
    canSelfUpdate: false,
  };
};

// Updates
export const checkForUpdates = () => {
  const desktopApi = getDesktopApi();
  return desktopApi
    ? desktopApi.checkForUpdates()
    : request<UpdateCheckResult>('/update-check');
};

export const applyUpdate = () => {
  const desktopApi = getDesktopApi();
  return desktopApi
    ? desktopApi.applyUpdate()
    : request<UpdateApplyStartResult>('/update-apply', { method: 'POST' });
};

export const fetchUpdateApplyStatus = () => {
  const desktopApi = getDesktopApi();
  return desktopApi
    ? desktopApi.getUpdateStatus()
    : request<UpdateApplyStatus>('/update-apply-status');
};

// Data portability
export const exportData = () =>
  request<StoredAppData>('/data/export');

export const createDataSnapshot = (reason: string) =>
  request<DataSnapshotResult>('/data/snapshot', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const importData = (data: StoredAppData) =>
  request<DataImportResult>('/data/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
