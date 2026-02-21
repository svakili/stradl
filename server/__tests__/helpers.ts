import type { Task, Blocker, Settings, AppData } from '../storage.js';

let idCounter = 1;

export function makeTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? idCounter++;
  const now = new Date().toISOString();
  return {
    id,
    title: `Task ${id}`,
    status: '',
    priority: 'P1',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    isArchived: false,
    isDeleted: false,
    ...overrides,
  };
}

export function makeBlocker(overrides: Partial<Blocker> = {}): Blocker {
  const id = overrides.id ?? idCounter++;
  return {
    id,
    taskId: 1,
    blockedByTaskId: null,
    blockedUntilDate: null,
    resolved: false,
    ...overrides,
  };
}

export function makeAppData(overrides: Partial<AppData> = {}): AppData {
  return {
    tasks: [],
    blockers: [],
    settings: {
      staleThresholdHours: 48,
      topN: 20,
      globalTimeOffset: 0,
    },
    nextTaskId: 100,
    nextBlockerId: 100,
    ...overrides,
  };
}

export function resetIdCounter(): void {
  idCounter = 1;
}
