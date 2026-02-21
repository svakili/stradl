import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAppData, resetIdCounter } from './helpers.js';

vi.mock('../storage.js', () => ({
  readData: vi.fn(),
  writeData: vi.fn(),
}));

import { readData, writeData } from '../storage.js';
import { settingsRoutes } from '../routes/settings.js';

const mockedReadData = vi.mocked(readData);
const mockedWriteData = vi.mocked(writeData);

function findHandler(method: string, path: string) {
  const layer = (settingsRoutes as any).stack.find((s: any) =>
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

describe('GET /settings', () => {
  const handler = findHandler('get', '/settings');

  it('returns current settings', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq(), res);

    const settings = res.json.mock.calls[0][0];
    expect(settings.staleThresholdHours).toBe(48);
    expect(settings.topN).toBe(20);
    expect(settings.globalTimeOffset).toBe(0);
  });
});

describe('PUT /settings', () => {
  const handler = findHandler('put', '/settings');

  it('updates only provided fields', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { topN: 10 } }), res);

    const settings = res.json.mock.calls[0][0];
    expect(settings.topN).toBe(10);
    expect(settings.staleThresholdHours).toBe(48); // unchanged
    expect(settings.globalTimeOffset).toBe(0); // unchanged
  });

  it('updates multiple fields at once', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { topN: 5, staleThresholdHours: 24 } }), res);

    const settings = res.json.mock.calls[0][0];
    expect(settings.topN).toBe(5);
    expect(settings.staleThresholdHours).toBe(24);
  });

  it('updates globalTimeOffset', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { globalTimeOffset: 72 } }), res);

    expect(res.json.mock.calls[0][0].globalTimeOffset).toBe(72);
  });

  it('calls writeData with updated data', () => {
    const data = makeAppData();
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { topN: 15 } }), res);

    expect(mockedWriteData).toHaveBeenCalledWith(data);
    expect(data.settings.topN).toBe(15);
  });

  it('does not modify fields not in the request', () => {
    const data = makeAppData();
    const originalThreshold = data.settings.staleThresholdHours;
    const originalOffset = data.settings.globalTimeOffset;
    mockedReadData.mockReturnValue(data);
    const res = mockRes();

    handler(mockReq({ body: { topN: 30 } }), res);

    expect(data.settings.staleThresholdHours).toBe(originalThreshold);
    expect(data.settings.globalTimeOffset).toBe(originalOffset);
  });
});
