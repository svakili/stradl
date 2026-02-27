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
  const {
    staleThresholdHours,
    topN,
    oneTimeOffsetHours,
    oneTimeOffsetExpiresAt,
    vacationPromptLastShownForUpdatedAt,
    focusedTaskId,
  } = req.body;

  if (staleThresholdHours !== undefined) data.settings.staleThresholdHours = staleThresholdHours;
  if (topN !== undefined) data.settings.topN = topN;
  if (oneTimeOffsetHours !== undefined) data.settings.oneTimeOffsetHours = oneTimeOffsetHours;
  if (oneTimeOffsetExpiresAt !== undefined) data.settings.oneTimeOffsetExpiresAt = oneTimeOffsetExpiresAt;
  if (vacationPromptLastShownForUpdatedAt !== undefined) data.settings.vacationPromptLastShownForUpdatedAt = vacationPromptLastShownForUpdatedAt;
  if (focusedTaskId !== undefined) data.settings.focusedTaskId = focusedTaskId;

  writeData(data);
  res.json(data.settings);
});
