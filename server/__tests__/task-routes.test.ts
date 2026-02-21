import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTask, makeBlocker, makeAppData, resetIdCounter } from './helpers.js';
import type { AppData } from '../storage.js';

vi.mock('../storage.js', () => ({
  readData: vi.fn(),
  writeData: vi.fn(),
}));

import { readData, writeData } from '../storage.js';
import { taskRoutes } from '../routes/tasks.js';

const mockedReadData = vi.mocked(readData);
const mockedWriteData = vi.mocked(writeData);

// Helper to invoke an Express route handler directly
function findHandler(method: string, path: string) {
  const layer = (taskRoutes as any).stack.find((s: any) =>
    s.route?.path === path && s.route?.methods[method]
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${path}`);
  return layer.route.stack.find((s: any) => s.method === method).handle;
}

function mockReq(overrides: Record<string, any> = {}) {
  return { params: {}, query: {}, body: {}, ...overrides };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetIdCounter();
});

describe('GET /tasks', () => {
  const handler = findHandler('get', '/tasks');

  it('returns tasks tab with priority then updatedAt sort', () => {
    const data = makeAppData({
      tasks: [
        makeTask({ id: 1, priority: 'P1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z' }),
        makeTask({ id: 2, priority: 'P0', createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-03-01T00:00:00Z' }),
        makeTask({ id: 3, priority: 'P1', createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }),
      ],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'tasks' } }), res);

    const tasks = res.json.mock.calls[0][0];
    // P0 first, then P1s sorted by updatedAt ascending
    expect(tasks.map((t: any) => t.id)).toEqual([2, 3, 1]);
  });

  it('slices tasks to topN', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ id: i + 1, priority: 'P1', createdAt: new Date(2024, 0, i + 1).toISOString() })
    );
    const data = makeAppData({
      tasks,
      settings: { staleThresholdHours: 48, topN: 3, globalTimeOffset: 0 },
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'tasks' } }), res);

    expect(res.json.mock.calls[0][0]).toHaveLength(3);
  });

  it('returns backlog as overflow beyond topN', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ id: i + 1, priority: 'P1', createdAt: new Date(2024, 0, i + 1).toISOString() })
    );
    const data = makeAppData({
      tasks,
      settings: { staleThresholdHours: 48, topN: 3, globalTimeOffset: 0 },
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'backlog' } }), res);

    expect(res.json.mock.calls[0][0]).toHaveLength(2);
  });

  it('returns ideas (null priority tasks)', () => {
    const data = makeAppData({
      tasks: [
        makeTask({ id: 1, priority: null }),
        makeTask({ id: 2, priority: 'P1' }),
        makeTask({ id: 3, priority: null }),
      ],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'ideas' } }), res);

    const ideas = res.json.mock.calls[0][0];
    expect(ideas).toHaveLength(2);
    expect(ideas.every((t: any) => t.priority === null)).toBe(true);
  });

  it('returns blocked tasks', () => {
    const data = makeAppData({
      tasks: [
        makeTask({ id: 1, priority: 'P1' }),
        makeTask({ id: 2, priority: 'P1' }),
      ],
      blockers: [makeBlocker({ taskId: 1, resolved: false })],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'blocked' } }), res);

    const blocked = res.json.mock.calls[0][0];
    expect(blocked).toHaveLength(1);
    expect(blocked[0].id).toBe(1);
  });

  it('returns completed tasks sorted newest first', () => {
    const data = makeAppData({
      tasks: [
        makeTask({ id: 1, completedAt: '2024-01-01T00:00:00Z' }),
        makeTask({ id: 2, completedAt: '2024-06-01T00:00:00Z' }),
        makeTask({ id: 3, completedAt: null }),
      ],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'completed' } }), res);

    const completed = res.json.mock.calls[0][0];
    expect(completed).toHaveLength(2);
    expect(completed[0].id).toBe(2); // newest first
  });

  it('returns archived tasks', () => {
    const data = makeAppData({
      tasks: [
        makeTask({ id: 1, isArchived: true }),
        makeTask({ id: 2, isArchived: false }),
      ],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'archive' } }), res);

    const archived = res.json.mock.calls[0][0];
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe(1);
  });

  it('returns trash (deleted tasks)', () => {
    const data = makeAppData({
      tasks: [
        makeTask({ id: 1, isDeleted: true }),
        makeTask({ id: 2, isDeleted: false }),
      ],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'trash' } }), res);

    const trash = res.json.mock.calls[0][0];
    expect(trash).toHaveLength(1);
    expect(trash[0].id).toBe(1);
  });

  it('calls writeData when autoUnblock resolves blockers', () => {
    const data = makeAppData({
      tasks: [makeTask({ id: 1 })],
      blockers: [makeBlocker({ taskId: 1, blockedUntilDate: '2020-01-01T00:00:00Z', resolved: false })],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'tasks' } }), res);

    expect(mockedWriteData).toHaveBeenCalled();
  });

  it('does not call writeData when no blockers are resolved', () => {
    const data = makeAppData({
      tasks: [makeTask({ id: 1 })],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'tasks' } }), res);

    expect(mockedWriteData).not.toHaveBeenCalled();
  });

  it('returns empty array for unknown tab', () => {
    const data = makeAppData({ tasks: [makeTask({ id: 1 })] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'unknown' } }), res);

    expect(res.json.mock.calls[0][0]).toEqual([]);
  });

  it('excludes deleted tasks from ideas tab', () => {
    const data = makeAppData({
      tasks: [
        makeTask({ id: 1, priority: null, isDeleted: true }),
        makeTask({ id: 2, priority: null, isDeleted: false }),
      ],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'ideas' } }), res);

    expect(res.json.mock.calls[0][0]).toHaveLength(1);
    expect(res.json.mock.calls[0][0][0].id).toBe(2);
  });

  it('excludes deleted tasks from archive tab', () => {
    const data = makeAppData({
      tasks: [
        makeTask({ id: 1, isArchived: true, isDeleted: true }),
        makeTask({ id: 2, isArchived: true, isDeleted: false }),
      ],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ query: { tab: 'archive' } }), res);

    expect(res.json.mock.calls[0][0]).toHaveLength(1);
    expect(res.json.mock.calls[0][0][0].id).toBe(2);
  });
});

describe('POST /tasks', () => {
  const handler = findHandler('post', '/tasks');

  it('creates a task with correct defaults', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { title: 'New task' } }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const task = res.json.mock.calls[0][0];
    expect(task.title).toBe('New task');
    expect(task.status).toBe('');
    expect(task.priority).toBe(null);
    expect(task.completedAt).toBe(null);
    expect(task.isArchived).toBe(false);
    expect(task.isDeleted).toBe(false);
  });

  it('trims the title', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { title: '  spaces  ' } }), res);

    expect(res.json.mock.calls[0][0].title).toBe('spaces');
  });

  it('returns 400 when title is missing', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when title is not a string', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { title: 123 } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('increments nextTaskId', () => {
    const data = makeAppData({ nextTaskId: 50 });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { title: 'Test' } }), res);

    expect(res.json.mock.calls[0][0].id).toBe(50);
    expect(data.nextTaskId).toBe(51);
  });

  it('calls writeData', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { title: 'Test' } }), res);

    expect(mockedWriteData).toHaveBeenCalledWith(data);
  });

  it('accepts priority and status', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { title: 'Test', priority: 'P0', status: 'In progress' } }), res);

    const task = res.json.mock.calls[0][0];
    expect(task.priority).toBe('P0');
    expect(task.status).toBe('In progress');
  });
});

describe('PUT /tasks/:id', () => {
  const handler = findHandler('put', '/tasks/:id');

  it('updates title and trims it', () => {
    const task = makeTask({ id: 1, title: 'Old' });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: { title: '  New  ' } }), res);

    expect(res.json.mock.calls[0][0].title).toBe('New');
  });

  it('updates only provided fields', () => {
    const task = makeTask({ id: 1, title: 'Original', status: 'Active', priority: 'P1' });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: { title: 'Changed' } }), res);

    const updated = res.json.mock.calls[0][0];
    expect(updated.title).toBe('Changed');
    expect(updated.status).toBe('Active');
    expect(updated.priority).toBe('P1');
  });

  it('sets priority to null when falsy value provided', () => {
    const task = makeTask({ id: 1, priority: 'P0' });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: { priority: '' } }), res);

    expect(res.json.mock.calls[0][0].priority).toBe(null);
  });

  it('returns 404 for nonexistent task', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '999' }, body: { title: 'Test' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('updates isArchived', () => {
    const task = makeTask({ id: 1, isArchived: false });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: { isArchived: true } }), res);

    expect(res.json.mock.calls[0][0].isArchived).toBe(true);
  });

  it('updates isDeleted', () => {
    const task = makeTask({ id: 1, isDeleted: false });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: { isDeleted: true } }), res);

    expect(res.json.mock.calls[0][0].isDeleted).toBe(true);
  });
});

describe('POST /tasks/:id/complete', () => {
  const handler = findHandler('post', '/tasks/:id/complete');

  it('sets completedAt and updatedAt', () => {
    const task = makeTask({ id: 1, completedAt: null });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' } }), res);

    const completed = res.json.mock.calls[0][0];
    expect(completed.completedAt).not.toBe(null);
    expect(completed.updatedAt).toBe(completed.completedAt);
  });

  it('resolves dependent blockers', () => {
    const task = makeTask({ id: 1 });
    const blocker = makeBlocker({ taskId: 2, blockedByTaskId: 1, resolved: false });
    const unrelatedBlocker = makeBlocker({ taskId: 3, blockedByTaskId: 5, resolved: false });
    const data = makeAppData({ tasks: [task], blockers: [blocker, unrelatedBlocker] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' } }), res);

    expect(blocker.resolved).toBe(true);
    expect(unrelatedBlocker.resolved).toBe(false);
  });

  it('returns 404 for nonexistent task', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '999' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /tasks/:id/uncomplete', () => {
  const handler = findHandler('post', '/tasks/:id/uncomplete');

  it('clears completedAt', () => {
    const task = makeTask({ id: 1, completedAt: '2024-01-01T00:00:00Z' });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' } }), res);

    expect(res.json.mock.calls[0][0].completedAt).toBe(null);
  });

  it('updates updatedAt', () => {
    const task = makeTask({ id: 1, completedAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' } }), res);

    expect(res.json.mock.calls[0][0].updatedAt).not.toBe('2024-01-01T00:00:00Z');
  });

  it('returns 404 for nonexistent task', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '999' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('DELETE /tasks/:id', () => {
  const handler = findHandler('delete', '/tasks/:id');

  it('soft-deletes by default', () => {
    const task = makeTask({ id: 1, isDeleted: false });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, query: {} }), res);

    expect(res.json.mock.calls[0][0].isDeleted).toBe(true);
    expect(data.tasks).toHaveLength(1); // still in the array
  });

  it('resolves dependent blockers on soft-delete', () => {
    const task = makeTask({ id: 1 });
    const blocker = makeBlocker({ taskId: 2, blockedByTaskId: 1, resolved: false });
    const data = makeAppData({ tasks: [task], blockers: [blocker] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, query: {} }), res);

    expect(blocker.resolved).toBe(true);
  });

  it('hard-deletes with permanent=true', () => {
    const task = makeTask({ id: 1 });
    const data = makeAppData({ tasks: [task] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, query: { permanent: 'true' } }), res);

    expect(data.tasks).toHaveLength(0);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('removes associated blockers on hard delete', () => {
    const task = makeTask({ id: 1 });
    const blockerFor = makeBlocker({ id: 10, taskId: 1 });
    const blockerBy = makeBlocker({ id: 11, taskId: 2, blockedByTaskId: 1 });
    const unrelated = makeBlocker({ id: 12, taskId: 3, blockedByTaskId: 4 });
    const data = makeAppData({ tasks: [task], blockers: [blockerFor, blockerBy, unrelated] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, query: { permanent: 'true' } }), res);

    expect(data.blockers).toHaveLength(1);
    expect(data.blockers[0].id).toBe(12);
  });

  it('returns 404 for nonexistent task on soft delete', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '999' }, query: {} }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 for nonexistent task on hard delete', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '999' }, query: { permanent: 'true' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
