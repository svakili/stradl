import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { updateRoutes } from '../routes/update.js';

function findHandler(method: string, routePath: string) {
  const layer = (updateRoutes as any).stack.find((s: any) =>
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

const currentVersion = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')
) as { version: string };

describe('GET /update-check', () => {
  const handler = findHandler('get', '/update-check');
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('returns hasUpdate=true when latest release is newer', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tag_name: 'v999.0.0',
        html_url: 'https://github.com/svakili/stradl/releases/tag/v999.0.0',
        published_at: '2026-02-01T00:00:00.000Z',
        name: 'v999.0.0',
      }),
    } as any);

    const res = mockRes();
    await handler(mockReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.hasUpdate).toBe(true);
    expect(payload.latestVersion).toBe('999.0.0');
  });

  it('returns hasUpdate=false when latest equals current version', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tag_name: `v${currentVersion.version}`,
        html_url: `https://github.com/svakili/stradl/releases/tag/v${currentVersion.version}`,
        published_at: '2026-02-01T00:00:00.000Z',
        name: `v${currentVersion.version}`,
      }),
    } as any);

    const res = mockRes();
    await handler(mockReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.hasUpdate).toBe(false);
    expect(payload.currentVersion).toBe(currentVersion.version);
    expect(payload.latestVersion).toBe(currentVersion.version);
  });

  it('handles v-prefixed versions correctly', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tag_name: 'v1.2.3',
        html_url: 'https://github.com/svakili/stradl/releases/tag/v1.2.3',
        published_at: '2026-02-01T00:00:00.000Z',
        name: 'v1.2.3',
      }),
    } as any);

    const res = mockRes();
    await handler(mockReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.latestVersion).toBe('1.2.3');
  });

  it('returns non-2xx when upstream GitHub API fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('service unavailable'),
    } as any);

    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.send).toHaveBeenCalledWith('Failed to check updates (GitHub 503).');
  });

  it('includes releaseUrl, publishedAt, and checkedAt in successful response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tag_name: 'v9.9.9',
        html_url: 'https://github.com/svakili/stradl/releases/tag/v9.9.9',
        published_at: '2026-02-10T12:00:00.000Z',
        name: 'v9.9.9',
      }),
    } as any);

    const res = mockRes();
    await handler(mockReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.releaseUrl).toBe('https://github.com/svakili/stradl/releases/tag/v9.9.9');
    expect(payload.publishedAt).toBe('2026-02-10T12:00:00.000Z');
    expect(typeof payload.checkedAt).toBe('string');
    expect(Number.isNaN(Date.parse(payload.checkedAt))).toBe(false);
  });
});
