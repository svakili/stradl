import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTask, makeBlocker, makeAppData, resetIdCounter } from './helpers.js';

vi.mock('../storage.js', () => ({
  readData: vi.fn(),
  writeData: vi.fn(),
}));

import { readData, writeData } from '../storage.js';
import { blockerRoutes } from '../routes/blockers.js';

const mockedReadData = vi.mocked(readData);
const mockedWriteData = vi.mocked(writeData);

function findHandler(method: string, path: string) {
  const layer = (blockerRoutes as any).stack.find((s: any) =>
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

describe('GET /tasks/:id/blockers', () => {
  const handler = findHandler('get', '/tasks/:id/blockers');

  it('returns blockers for the specified taskId', () => {
    const data = makeAppData({
      blockers: [
        makeBlocker({ id: 1, taskId: 5 }),
        makeBlocker({ id: 2, taskId: 5 }),
        makeBlocker({ id: 3, taskId: 10 }),
      ],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '5' } }), res);

    const result = res.json.mock.calls[0][0];
    expect(result).toHaveLength(2);
    expect(result.every((b: any) => b.taskId === 5)).toBe(true);
  });

  it('returns empty array when task has no blockers', () => {
    const data = makeAppData({
      blockers: [makeBlocker({ taskId: 10 })],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '5' } }), res);

    expect(res.json.mock.calls[0][0]).toEqual([]);
  });
});

describe('POST /tasks/:id/blockers', () => {
  const handler = findHandler('post', '/tasks/:id/blockers');

  it('creates a blocker with correct defaults', () => {
    const data = makeAppData({
      tasks: [makeTask({ id: 1 })],
      nextBlockerId: 50,
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const blocker = res.json.mock.calls[0][0];
    expect(blocker.id).toBe(50);
    expect(blocker.taskId).toBe(1);
    expect(blocker.blockedByTaskId).toBe(null);
    expect(blocker.blockedUntilDate).toBe(null);
    expect(blocker.resolved).toBe(false);
  });

  it('returns 404 when task does not exist', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '999' }, body: {} }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('accepts blockedByTaskId', () => {
    const data = makeAppData({ tasks: [makeTask({ id: 1 })] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: { blockedByTaskId: 5 } }), res);

    expect(res.json.mock.calls[0][0].blockedByTaskId).toBe(5);
  });

  it('accepts blockedUntilDate', () => {
    const data = makeAppData({ tasks: [makeTask({ id: 1 })] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: { blockedUntilDate: '2025-06-01T00:00:00Z' } }), res);

    expect(res.json.mock.calls[0][0].blockedUntilDate).toBe('2025-06-01T00:00:00Z');
  });

  it('increments nextBlockerId', () => {
    const data = makeAppData({ tasks: [makeTask({ id: 1 })], nextBlockerId: 10 });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: {} }), res);

    expect(data.nextBlockerId).toBe(11);
  });

  it('calls writeData', () => {
    const data = makeAppData({ tasks: [makeTask({ id: 1 })] });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' }, body: {} }), res);

    expect(mockedWriteData).toHaveBeenCalledWith(data);
  });
});

describe('DELETE /blockers/:id', () => {
  const handler = findHandler('delete', '/blockers/:id');

  it('removes blocker and returns 204', () => {
    const data = makeAppData({
      blockers: [
        makeBlocker({ id: 1 }),
        makeBlocker({ id: 2 }),
      ],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' } }), res);

    expect(data.blockers).toHaveLength(1);
    expect(data.blockers[0].id).toBe(2);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when blocker does not exist', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '999' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('calls writeData on success', () => {
    const data = makeAppData({
      blockers: [makeBlocker({ id: 1 })],
    });
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ params: { id: '1' } }), res);

    expect(mockedWriteData).toHaveBeenCalledWith(data);
  });
});
