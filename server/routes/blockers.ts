import { Router } from 'express';
import { readData, writeData } from '../storage.js';

export const blockerRoutes = Router();

// GET /api/tasks/:id/blockers
blockerRoutes.get('/tasks/:id/blockers', (req, res) => {
  const data = readData();
  const taskId = parseInt(req.params.id);
  const taskBlockers = data.blockers.filter(b => b.taskId === taskId);
  res.json(taskBlockers);
});

// POST /api/tasks/:id/blockers
blockerRoutes.post('/tasks/:id/blockers', (req, res) => {
  const data = readData();
  const taskId = parseInt(req.params.id);
  const { blockedByTaskId, blockedUntilDate } = req.body;

  const task = data.tasks.find(t => t.id === taskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const blocker = {
    id: data.nextBlockerId++,
    taskId,
    blockedByTaskId: blockedByTaskId ?? null,
    blockedUntilDate: blockedUntilDate ?? null,
    resolved: false,
  };

  data.blockers.push(blocker);
  writeData(data);
  res.status(201).json(blocker);
});

// DELETE /api/blockers/:id
blockerRoutes.delete('/blockers/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const idx = data.blockers.findIndex(b => b.id === id);

  if (idx === -1) {
    res.status(404).json({ error: 'Blocker not found' });
    return;
  }

  data.blockers.splice(idx, 1);
  writeData(data);
  res.status(204).end();
});
