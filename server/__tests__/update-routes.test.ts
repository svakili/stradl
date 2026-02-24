import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import { updateRoutes } from '../routes/update.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

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

function mockLocalReq(overrides: Record<string, unknown> = {}) {
  return mockReq({
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  });
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

describe('POST /update-apply', () => {
  const handler = findHandler('post', '/update-apply');
  const statusHandler = findHandler('get', '/update-apply-status');
  const originalEnv = { ...process.env };
  let tempRoot = '';
  let launchAgentPath = '';

  beforeEach(() => {
    vi.clearAllMocks();
    tempRoot = fs.mkdtempSync(path.join(process.cwd(), 'tmp-update-routes-'));
    launchAgentPath = path.join(tempRoot, 'Library', 'LaunchAgents', 'com.stradl.server.plist');
    fs.mkdirSync(path.dirname(launchAgentPath), { recursive: true });
    fs.writeFileSync(launchAgentPath, '');

    process.env = {
      ...originalEnv,
      HOME: tempRoot,
      STRADL_DATA_DIR: path.join(tempRoot, 'data'),
      STRADL_ENABLE_SELF_UPDATE: 'true',
    };

    vi.mocked(childProcess.execSync).mockImplementation(((command: string) => {
      if (command === 'git status --porcelain') return '';
      return '';
    }) as typeof childProcess.execSync);
    vi.mocked(childProcess.spawn).mockReturnValue({
      unref: vi.fn(),
    } as unknown as ReturnType<typeof childProcess.spawn>);
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns 403 when self-update is disabled', () => {
    delete process.env.STRADL_ENABLE_SELF_UPDATE;
    const res = mockRes();

    handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Self-update is disabled. Set STRADL_ENABLE_SELF_UPDATE=true to enable.');
  });

  it('returns 409 when working tree is dirty', () => {
    vi.mocked(childProcess.execSync).mockImplementation(((command: string) => {
      if (command === 'git status --porcelain') return ' M src/App.tsx';
      return '';
    }) as typeof childProcess.execSync);

    const res = mockRes();
    handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith(
      'Update blocked: working tree has local changes. Commit or stash changes before updating.'
    );
  });

  it('returns 400 when LaunchAgent is missing', () => {
    fs.unlinkSync(launchAgentPath);
    const res = mockRes();

    handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send.mock.calls[0][0]).toContain('LaunchAgent is not installed');
  });

  it('returns 409 when update is already running', () => {
    const statusFile = path.join(process.env.STRADL_DATA_DIR!, 'update-status.json');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, JSON.stringify({ state: 'running', step: 'building' }, null, 2));

    const res = mockRes();
    handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith('An update is already running.');
  });

  it('starts update and returns operation metadata', () => {
    const res = mockRes();
    handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(202);
    const payload = res.json.mock.calls[0][0];
    expect(typeof payload.operationId).toBe('string');
    expect(typeof payload.startedAt).toBe('string');
    expect(vi.mocked(childProcess.spawn)).toHaveBeenCalledTimes(1);

    const statusRes = mockRes();
    statusHandler(mockLocalReq(), statusRes);
    const statusPayload = statusRes.json.mock.calls[0][0];
    expect(statusPayload.state).toBe('running');
    expect(statusPayload.step).toBe('queued');
  });

  it('reads terminal status from status file', () => {
    const statusFile = path.join(process.env.STRADL_DATA_DIR!, 'update-status.json');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, JSON.stringify({
      state: 'succeeded',
      step: 'completed',
      message: 'ok',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
    }, null, 2));

    const res = mockRes();
    statusHandler(mockLocalReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.state).toBe('succeeded');
    expect(payload.step).toBe('completed');
    expect(payload.toVersion).toBe('1.1.0');
  });
});
