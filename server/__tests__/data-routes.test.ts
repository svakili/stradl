import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage.js', () => ({
  createDataSnapshot: vi.fn(),
  exportData: vi.fn(),
  importData: vi.fn(),
}));

import { createDataSnapshot, exportData, importData } from '../storage.js';
import { dataRoutes } from '../routes/data.js';

const mockedCreateDataSnapshot = vi.mocked(createDataSnapshot);
const mockedExportData = vi.mocked(exportData);
const mockedImportData = vi.mocked(importData);

function findHandler(method: string, routePath: string) {
  const layer = (dataRoutes as any).stack.find((s: any) =>
    s.route?.path === routePath && s.route?.methods[method]
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack.find((s: any) => s.method === method).handle;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return { params: {}, query: {}, body: {}, ...overrides };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /data/export', () => {
  const handler = findHandler('get', '/data/export');

  it('returns the current application data', () => {
    mockedExportData.mockReturnValue({
      schemaVersion: 1,
      tasks: [],
      blockers: [],
      settings: {
        staleThresholdHours: 48,
        topN: 20,
        oneTimeOffsetHours: 0,
        oneTimeOffsetExpiresAt: null,
        vacationPromptLastShownForUpdatedAt: null,
        focusedTaskId: null,
      },
      nextTaskId: 1,
      nextBlockerId: 1,
    });

    const res = mockRes();
    handler(mockReq(), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 1 }));
  });
});

describe('POST /data/snapshot', () => {
  const handler = findHandler('post', '/data/snapshot');

  it('creates a snapshot for the requested reason', () => {
    mockedCreateDataSnapshot.mockReturnValue({
      snapshotPath: '/tmp/backup.json',
      createdAt: '2026-03-13T00:00:00.000Z',
      reason: 'pre-update',
    });

    const res = mockRes();
    handler(mockReq({ body: { reason: 'pre-update' } }), res);

    expect(mockedCreateDataSnapshot).toHaveBeenCalledWith('pre-update');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('POST /data/import', () => {
  const handler = findHandler('post', '/data/import');

  it('returns import metadata after replacing the current data', () => {
    mockedImportData.mockReturnValue({
      data: {
        schemaVersion: 1,
        tasks: [{ id: 1, title: 'Imported', status: '', priority: 'P1', createdAt: '2026-03-13T00:00:00.000Z', updatedAt: '2026-03-13T00:00:00.000Z', completedAt: null, isArchived: false, hiddenUntilAt: null }],
        blockers: [],
        settings: {
          staleThresholdHours: 48,
          topN: 20,
          oneTimeOffsetHours: 0,
          oneTimeOffsetExpiresAt: null,
          vacationPromptLastShownForUpdatedAt: null,
          focusedTaskId: null,
        },
        nextTaskId: 2,
        nextBlockerId: 1,
      },
      snapshot: {
        snapshotPath: '/tmp/pre-import.json',
        createdAt: '2026-03-13T00:00:00.000Z',
        reason: 'pre-import',
      },
    });

    const res = mockRes();
    handler(mockReq({ body: { schemaVersion: 1, tasks: [], blockers: [], settings: {}, nextTaskId: 1, nextBlockerId: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      importedTaskCount: 1,
      backupPath: '/tmp/pre-import.json',
    }));
  });
});
