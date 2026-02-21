import { Router } from 'express';
import { readData, writeData } from '../storage.js';
import type { Task } from '../storage.js';

export const taskRoutes = Router();

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

function autoUnblock(data: ReturnType<typeof readData>): boolean {
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

function hasUnresolvedBlockers(taskId: number, data: ReturnType<typeof readData>): boolean {
  return data.blockers.some(b => b.taskId === taskId && !b.resolved);
}

function getPrioritizedTasks(data: ReturnType<typeof readData>): Task[] {
  return data.tasks
    .filter(t => t.priority != null && !t.isArchived && t.completedAt == null && !hasUnresolvedBlockers(t.id, data))
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority!] ?? 99;
      const pb = PRIORITY_ORDER[b.priority!] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    });
}

// GET /api/tasks?tab=tasks|backlog|ideas|blocked|completed|archive
taskRoutes.get('/tasks', (req, res) => {
  const data = readData();
  const tab = (req.query.tab as string) || 'tasks';

  // Auto-unblock before filtering
  if (autoUnblock(data)) {
    writeData(data);
  }

  let filtered: Task[];

  switch (tab) {
    case 'tasks':
      filtered = getPrioritizedTasks(data).slice(0, data.settings.topN);
      break;

    case 'backlog':
      filtered = getPrioritizedTasks(data).slice(data.settings.topN);
      break;

    case 'ideas':
      filtered = data.tasks
        .filter(t => t.priority == null && !t.isArchived && t.completedAt == null)
        .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      break;

    case 'blocked':
      filtered = data.tasks
        .filter(t => !t.isArchived && t.completedAt == null && hasUnresolvedBlockers(t.id, data))
        .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
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
    status: status || '',
    priority: priority || null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    isArchived: false,
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
  if (status !== undefined) task.status = status;
  if (priority !== undefined) task.priority = priority || null;
  if (isArchived !== undefined) task.isArchived = isArchived;
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

// DELETE /api/tasks/:id
taskRoutes.delete('/tasks/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const idx = data.tasks.findIndex(t => t.id === id);

  if (idx === -1) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  data.tasks.splice(idx, 1);
  // Also remove associated blockers
  data.blockers = data.blockers.filter(b => b.taskId !== id && b.blockedByTaskId !== id);

  writeData(data);
  res.status(204).end();
});
