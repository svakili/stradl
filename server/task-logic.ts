import type { AppData, Task } from './storage.js';

export const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

export function autoUnblock(data: AppData): boolean {
  const now = new Date();
  let changed = false;

  for (const blocker of data.blockers) {
    if (blocker.resolved) continue;

    // Date-based auto-unblock
    if (blocker.blockedUntilDate && new Date(blocker.blockedUntilDate) <= now) {
      blocker.resolved = true;
      changed = true;
    }

    // Task-based auto-unblock
    if (blocker.blockedByTaskId != null) {
      const blockingTask = data.tasks.find(t => t.id === blocker.blockedByTaskId);
      if (blockingTask && blockingTask.completedAt != null) {
        blocker.resolved = true;
        changed = true;
      }
    }
  }

  return changed;
}

export function hasUnresolvedBlockers(taskId: number, data: AppData): boolean {
  return data.blockers.some(b => b.taskId === taskId && !b.resolved);
}

export function isTaskBlocked(taskId: number, data: AppData): boolean {
  return hasUnresolvedBlockers(taskId, data);
}

export function isTaskHiddenNow(task: Task, now = new Date()): boolean {
  if (!task.hiddenUntilAt) return false;
  const hiddenUntil = new Date(task.hiddenUntilAt);
  if (Number.isNaN(hiddenUntil.getTime())) return false;
  return hiddenUntil > now;
}

export function getPrioritizedTasks(data: AppData): Task[] {
  const now = new Date();
  return data.tasks
    .filter(t => (
      t.priority != null
      && !t.isArchived
      && t.completedAt == null
      && !isTaskBlocked(t.id, data)
      && !isTaskHiddenNow(t, now)
    ))
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority!] ?? 99;
      const pb = PRIORITY_ORDER[b.priority!] ?? 99;
      if (pa !== pb) return pa - pb;
      // Stable tiebreaker: createdAt doesn't change on edits,
      // so updating a task's status won't shuffle it between Tasks/Backlog
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}
