import { Router } from 'express';
import { createDataSnapshot, exportData, importData } from '../storage.js';

export const dataRoutes = Router();

dataRoutes.get('/data/export', (_req, res) => {
  res.json(exportData());
});

dataRoutes.post('/data/snapshot', (req, res) => {
  try {
    const requestedReason = req.body && typeof req.body.reason === 'string'
      ? req.body.reason
      : 'manual';
    const snapshot = createDataSnapshot(requestedReason);
    res.status(201).json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create data snapshot.';
    res.status(500).send(message);
  }
});

dataRoutes.post('/data/import', (req, res) => {
  try {
    const result = importData(req.body);
    res.status(201).json({
      importedTaskCount: result.data.tasks.length,
      importedBlockerCount: result.data.blockers.length,
      backupPath: result.snapshot.snapshotPath,
      backupCreatedAt: result.snapshot.createdAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import data.';
    res.status(400).send(message);
  }
});
