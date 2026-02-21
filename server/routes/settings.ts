import { Router } from 'express';
import { readData, writeData } from '../storage.js';

export const settingsRoutes = Router();

// GET /api/settings
settingsRoutes.get('/settings', (_req, res) => {
  const data = readData();
  res.json(data.settings);
});

// PUT /api/settings
settingsRoutes.put('/settings', (req, res) => {
  const data = readData();
  const { staleThresholdHours, topN, globalTimeOffset } = req.body;

  if (staleThresholdHours !== undefined) data.settings.staleThresholdHours = staleThresholdHours;
  if (topN !== undefined) data.settings.topN = topN;
  if (globalTimeOffset !== undefined) data.settings.globalTimeOffset = globalTimeOffset;

  writeData(data);
  res.json(data.settings);
});
