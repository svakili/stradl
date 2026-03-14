import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import { updateRoutes } from '../routes/update.js';

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

function findHandler(method: string, routePath: string) {
  const layer = (updateRoutes as any).stack.find((entry: any) =>
    entry.route?.path === routePath && entry.route?.methods[method]
  );
  if (!layer) throw new Error(`No handler for ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack.find((entry: any) => entry.method === method).handle;
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

function buildRelease(version: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tag_name: `v${version}`,
    html_url: `https://github.com/svakili/stradl/releases/tag/v${version}`,
    published_at: '2026-02-01T00:00:00.000Z',
    name: `v${version}`,
    assets: [
      {
        name: `Stradl-runtime-v${version}.tar.gz`,
        browser_download_url: `https://example.com/Stradl-runtime-v${version}.tar.gz`,
      },
      {
        name: 'SHA256SUMS.txt',
        browser_download_url: 'https://example.com/SHA256SUMS.txt',
      },
    ],
    ...overrides,
  };
}

const currentVersion = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')
) as { version: string };

describe('GET /runtime-info', () => {
  const handler = findHandler('get', '/runtime-info');
  const originalEnv = { ...process.env };
  let tempRoot = '';

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(process.cwd(), 'tmp-runtime-info-'));
    process.env = {
      ...originalEnv,
      HOME: tempRoot,
      STRADL_DATA_DIR: path.join(tempRoot, 'data'),
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns canSelfUpdate=false outside the managed runtime', () => {
    const res = mockRes();
    handler(mockReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.mode).toBe('web');
    expect(payload.appVersion).toBe(currentVersion.version);
    expect(payload.canSelfUpdate).toBe(false);
  });

  it('returns canSelfUpdate=true for the installed local runtime', () => {
    const runtimeRoot = path.join(tempRoot, 'data', 'runtime');
    const entryPath = path.join(runtimeRoot, 'current', 'server', 'dist', 'index.js');
    fs.mkdirSync(path.dirname(entryPath), { recursive: true });
    fs.writeFileSync(entryPath, '');
    process.env.STRADL_ENABLE_SELF_UPDATE = 'true';
    process.env.STRADL_RUNTIME_ROOT = runtimeRoot;

    const res = mockRes();
    handler(mockReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.canSelfUpdate).toBe(true);
  });
});

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
      json: vi.fn().mockResolvedValue(buildRelease('999.0.0')),
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
      json: vi.fn().mockResolvedValue(buildRelease(currentVersion.version)),
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
      json: vi.fn().mockResolvedValue(buildRelease('1.2.3')),
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
      json: vi.fn().mockResolvedValue(buildRelease('9.9.9', {
        published_at: '2026-02-10T12:00:00.000Z',
      })),
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
  let runtimeRoot = '';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());

    tempRoot = fs.mkdtempSync(path.join(process.cwd(), 'tmp-update-routes-'));
    launchAgentPath = path.join(tempRoot, 'Library', 'LaunchAgents', 'com.stradl.server.plist');
    runtimeRoot = path.join(tempRoot, 'data', 'runtime');

    fs.mkdirSync(path.dirname(launchAgentPath), { recursive: true });
    fs.writeFileSync(launchAgentPath, '');

    const runtimeEntry = path.join(runtimeRoot, 'current', 'server', 'dist', 'index.js');
    fs.mkdirSync(path.dirname(runtimeEntry), { recursive: true });
    fs.writeFileSync(runtimeEntry, '');

    process.env = {
      ...originalEnv,
      HOME: tempRoot,
      STRADL_DATA_DIR: path.join(tempRoot, 'data'),
      STRADL_ENABLE_SELF_UPDATE: 'true',
      STRADL_RUNTIME_ROOT: runtimeRoot,
    };

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(buildRelease('999.0.0')),
    } as any);
    vi.mocked(childProcess.spawn).mockReturnValue({
      unref: vi.fn(),
    } as unknown as ReturnType<typeof childProcess.spawn>);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns 403 when self-update is disabled', async () => {
    delete process.env.STRADL_ENABLE_SELF_UPDATE;
    const res = mockRes();

    await handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Self-update is disabled. Set STRADL_ENABLE_SELF_UPDATE=true to enable.');
  });

  it('returns 400 when managed runtime is missing', async () => {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    const res = mockRes();

    await handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      'Managed runtime is not installed. Install Stradl from the runtime release before using self-update.'
    );
  });

  it('returns 400 when LaunchAgent is missing', async () => {
    fs.unlinkSync(launchAgentPath);
    const res = mockRes();

    await handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send.mock.calls[0][0]).toContain('LaunchAgent is not installed');
  });

  it('returns 409 when update is already running', async () => {
    const statusFile = path.join(process.env.STRADL_DATA_DIR!, 'update-status.json');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, JSON.stringify({ state: 'running', step: 'downloading' }, null, 2));

    const res = mockRes();
    await handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith('An update is already running.');
  });

  it('returns 409 when already up to date', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(buildRelease(currentVersion.version)),
    } as any);

    const res = mockRes();
    await handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith(`Already up to date (v${currentVersion.version}).`);
  });

  it('returns 502 when the runtime asset is missing', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(buildRelease('999.0.0', {
        assets: [{ name: 'SHA256SUMS.txt', browser_download_url: 'https://example.com/SHA256SUMS.txt' }],
      })),
    } as any);

    const res = mockRes();
    await handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.send).toHaveBeenCalledWith('GitHub release is missing Stradl-runtime-v999.0.0.tar.gz.');
  });

  it('starts update, creates a snapshot, and returns operation metadata', async () => {
    const res = mockRes();
    await handler(mockLocalReq(), res);

    expect(res.status).toHaveBeenCalledWith(202);
    const payload = res.json.mock.calls[0][0];
    expect(payload.targetVersion).toBe('999.0.0');
    expect(typeof payload.operationId).toBe('string');
    expect(typeof payload.startedAt).toBe('string');
    expect(vi.mocked(childProcess.spawn)).toHaveBeenCalledTimes(1);

    const spawnedArgs = vi.mocked(childProcess.spawn).mock.calls[0][1] as string[];
    expect(spawnedArgs).toContain('--target-version');
    expect(spawnedArgs).toContain('999.0.0');
    expect(spawnedArgs).toContain('--runtime-root');
    expect(spawnedArgs).toContain(runtimeRoot);

    const statusRes = mockRes();
    statusHandler(mockLocalReq(), statusRes);
    const statusPayload = statusRes.json.mock.calls[0][0];
    expect(statusPayload.state).toBe('running');
    expect(statusPayload.step).toBe('queued');
    expect(statusPayload.toVersion).toBe('999.0.0');
    expect(statusPayload.message).toContain('Snapshot saved to');

    const backupsDir = path.join(process.env.STRADL_DATA_DIR!, 'backups');
    const backupFiles = fs.readdirSync(backupsDir);
    expect(backupFiles.length).toBe(1);
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
