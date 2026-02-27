import { Router } from 'express';
import { readData, writeData } from '../storage.js';
import type { AppData, Task } from '../storage.js';
import { autoUnblock, isTaskBlocked, isTaskHiddenNow, getPrioritizedTasks, PRIORITY_ORDER } from '../task-logic.js';

export const taskRoutes = Router();
const ALLOWED_HIDE_DURATIONS = new Set([15, 30, 60, 120, 240]);

function clearFocusForTask(data: AppData, taskId: number): boolean {
  if (data.settings.focusedTaskId === taskId) {
    data.settings.focusedTaskId = null;
    return true;
  }
  return false;
}

function isTaskActiveForFocus(task: Task, data: AppData, now = new Date()): boolean {
  return !task.isArchived
    && task.completedAt == null
    && !isTaskBlocked(task.id, data)
    && !isTaskHiddenNow(task, now);
}

function clearInvalidFocus(data: AppData, now = new Date()): boolean {
  if (data.settings.focusedTaskId == null) return false;
  const focusedTask = data.tasks.find(t => t.id === data.settings.focusedTaskId);
  if (!focusedTask || !isTaskActiveForFocus(focusedTask, data, now)) {
    data.settings.focusedTaskId = null;
    return true;
  }
  return false;
}

// GET /api/tasks?tab=tasks|backlog|ideas|blocked|hidden|completed|archive
taskRoutes.get('/tasks', (req, res) => {
  const data = readData();
  const tab = (req.query.tab as string) || 'tasks';
  const now = new Date();

  // Auto-unblock and focus normalization before filtering
  const changedByAutoUnblock = autoUnblock(data);
  const changedByFocusNormalization = clearInvalidFocus(data, now);
  if (changedByAutoUnblock || changedByFocusNormalization) {
    writeData(data);
  }

  let filtered: Task[];

  switch (tab) {
    case 'tasks':
      filtered = getPrioritizedTasks(data)
        .slice(0, data.settings.topN)
        .sort((a, b) => {
          const pa = PRIORITY_ORDER[a.priority!] ?? 99;
          const pb = PRIORITY_ORDER[b.priority!] ?? 99;
          if (pa !== pb) return pa - pb;
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        });
      break;

    case 'backlog':
      filtered = getPrioritizedTasks(data)
        .slice(data.settings.topN)
        .sort((a, b) => {
          const pa = PRIORITY_ORDER[a.priority!] ?? 99;
          const pb = PRIORITY_ORDER[b.priority!] ?? 99;
          if (pa !== pb) return pa - pb;
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        });
      break;

    case 'ideas':
      filtered = data.tasks
        .filter(t => t.priority == null && !t.isArchived && t.completedAt == null && !isTaskHiddenNow(t, now))
        .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      break;

    case 'blocked':
      filtered = data.tasks
        .filter(t => !t.isArchived && t.completedAt == null && isTaskBlocked(t.id, data))
        .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      break;

    case 'hidden':
      filtered = data.tasks
        .filter(t => !t.isArchived && t.completedAt == null && !isTaskBlocked(t.id, data) && isTaskHiddenNow(t, now))
        .sort((a, b) => {
          const aTime = a.hiddenUntilAt ? new Date(a.hiddenUntilAt).getTime() : Number.POSITIVE_INFINITY;
          const bTime = b.hiddenUntilAt ? new Date(b.hiddenUntilAt).getTime() : Number.POSITIVE_INFINITY;
          if (aTime !== bTime) return aTime - bTime;
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        });
      break;

    case 'completed':
      filtered = data.tasks
        .filter(t => t.completedAt != null && !t.isArchived)
        .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
      break;

    case 'archive':
      filtered = data.tasks
        .filter(t => t.isArchived)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      break;

    default:
      filtered = [];
  }

  res.json(filtered);
});

// POST /api/tasks
taskRoutes.post('/tasks', (req, res) => {
  const data = readData();
  const { title, status, priority } = req.body;

  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const now = new Date().toISOString();
  const task: Task = {
    id: data.nextTaskId++,
    title: title.trim(),
    status: typeof status === 'string' ? status.trim() : '',
    priority: priority || null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    isArchived: false,
    hiddenUntilAt: null,
  };

  data.tasks.push(task);
  writeData(data);
  res.status(201).json(task);
});

// PUT /api/tasks/:id
taskRoutes.put('/tasks/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const task = data.tasks.find(t => t.id === id);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const { title, status, priority, isArchived } = req.body;
  if (title !== undefined) task.title = title.trim();
  if (status !== undefined) task.status = typeof status === 'string' ? status.trim() : status;
  if (priority !== undefined) task.priority = priority || null;
  if (isArchived !== undefined) {
    task.isArchived = isArchived;
    // Resolve blockers that depend on this task when archiving
    if (isArchived) {
      task.hiddenUntilAt = null;
      clearFocusForTask(data, id);
      for (const blocker of data.blockers) {
        if (blocker.blockedByTaskId === id && !blocker.resolved) {
          blocker.resolved = true;
        }
      }
    }
  }
  task.updatedAt = new Date().toISOString();

  writeData(data);
  res.json(task);
});

// POST /api/tasks/:id/complete
taskRoutes.post('/tasks/:id/complete', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const task = data.tasks.find(t => t.id === id);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const now = new Date().toISOString();
  task.completedAt = now;
  task.updatedAt = now;

  // Resolve blockers that depend on this task
  for (const blocker of data.blockers) {
    if (blocker.blockedByTaskId === id && !blocker.resolved) {
      blocker.resolved = true;
    }
  }
  clearFocusForTask(data, id);

  writeData(data);
  res.json(task);
});

// POST /api/tasks/:id/uncomplete
taskRoutes.post('/tasks/:id/uncomplete', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const task = data.tasks.find(t => t.id === id);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  task.completedAt = null;
  task.updatedAt = new Date().toISOString();

  writeData(data);
  res.json(task);
});

// POST /api/tasks/:id/hide
taskRoutes.post('/tasks/:id/hide', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id, 10);
  const task = data.tasks.find(t => t.id === id);
  const now = new Date();

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const durationMinutes = Number(req.body?.durationMinutes);
  if (!Number.isInteger(durationMinutes) || !ALLOWED_HIDE_DURATIONS.has(durationMinutes)) {
    res.status(400).json({ error: 'durationMinutes must be one of 15, 30, 60, 120, 240' });
    return;
  }

  const isActivePrioritizedTask = !task.isArchived
    && task.completedAt == null
    && task.priority != null
    && !isTaskBlocked(task.id, data)
    && !isTaskHiddenNow(task, now);

  if (!isActivePrioritizedTask) {
    res.status(400).json({ error: 'Task must be an active prioritized task to hide.' });
    return;
  }

  task.hiddenUntilAt = new Date(now.getTime() + durationMinutes * 60000).toISOString();
  clearFocusForTask(data, id);
  writeData(data);
  res.json(task);
});

// POST /api/tasks/:id/unhide
taskRoutes.post('/tasks/:id/unhide', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id, 10);
  const task = data.tasks.find(t => t.id === id);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  task.hiddenUntilAt = null;
  writeData(data);
  res.json(task);
});

// POST /api/tasks/:id/focus
taskRoutes.post('/tasks/:id/focus', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id, 10);
  const task = data.tasks.find(t => t.id === id);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (!isTaskActiveForFocus(task, data)) {
    res.status(400).json({ error: 'Task is not active and cannot be focused.' });
    return;
  }

  data.settings.focusedTaskId = id;
  writeData(data);
  res.json({ focusedTaskId: data.settings.focusedTaskId });
});

// POST /api/tasks/focus/clear
taskRoutes.post('/tasks/focus/clear', (_req, res) => {
  const data = readData();
  data.settings.focusedTaskId = null;
  writeData(data);
  res.json({ focusedTaskId: null });
});

// DELETE /api/tasks/:id (permanent delete)
taskRoutes.delete('/tasks/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id, 10);

  const idx = data.tasks.findIndex(t => t.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  clearFocusForTask(data, id);
  data.tasks.splice(idx, 1);
  data.blockers = data.blockers.filter(b => b.taskId !== id && b.blockedByTaskId !== id);
  writeData(data);
  res.status(204).end();
});
