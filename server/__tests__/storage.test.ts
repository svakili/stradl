import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getBackupsDirectory,
  readDataFromPaths,
  resolveStoragePaths,
  writeDataToPaths,
  writeFileAtomically,
} from '../storage.js';

function makeAppData(title: string) {
  const now = '2026-02-24T00:00:00.000Z';
  return {
    schemaVersion: 1,
    tasks: [
      {
        id: 1,
        title,
        status: '',
        priority: 'P1',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        isArchived: false,
        hiddenUntilAt: null,
      },
    ],
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
  };
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

const tempRoots: string[] = [];

function createProjectPaths() {
  const projectRoot = fs.mkdtempSync(path.join(process.cwd(), 'tmp-storage-'));
  const homeDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-storage-home-'));
  tempRoots.push(projectRoot, homeDir);

  const paths = resolveStoragePaths({
    projectRoot,
    platform: 'darwin',
    homeDir,
    env: {},
  });

  return { projectRoot, paths };
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('storage migration pathing', () => {
  it('migrates from project data/tasks.json when destination does not exist', () => {
    const { projectRoot, paths } = createProjectPaths();
    writeJson(path.join(projectRoot, 'data', 'tasks.json'), makeAppData('from-project-data'));

    const data = readDataFromPaths(paths);

    expect(data.tasks[0].title).toBe('from-project-data');
    expect(fs.existsSync(paths.dataFile)).toBe(true);
  });

  it('migrates from project server/data/tasks.json when destination does not exist', () => {
    const { projectRoot, paths } = createProjectPaths();
    writeJson(path.join(projectRoot, 'server', 'data', 'tasks.json'), makeAppData('from-server-data'));

    const data = readDataFromPaths(paths);

    expect(data.tasks[0].title).toBe('from-server-data');
    expect(fs.existsSync(paths.dataFile)).toBe(true);
  });

  it('prefers the newest legacy file when both legacy locations exist', () => {
    const { projectRoot, paths } = createProjectPaths();
    const legacyProjectData = path.join(projectRoot, 'data', 'tasks.json');
    const legacyServerData = path.join(projectRoot, 'server', 'data', 'tasks.json');

    writeJson(legacyProjectData, makeAppData('older-source'));
    writeJson(legacyServerData, makeAppData('newer-source'));
    const now = new Date();
    const older = new Date(now.getTime() - 60_000);
    fs.utimesSync(legacyProjectData, older, older);
    fs.utimesSync(legacyServerData, now, now);

    const data = readDataFromPaths(paths);
    expect(data.tasks[0].title).toBe('newer-source');
  });

  it('does not overwrite existing app-support data file', () => {
    const { projectRoot, paths } = createProjectPaths();
    writeJson(paths.dataFile, makeAppData('existing-target'));
    writeJson(path.join(projectRoot, 'data', 'tasks.json'), makeAppData('legacy-source'));

    const data = readDataFromPaths(paths);
    expect(data.tasks[0].title).toBe('existing-target');
  });
});

describe('daily auto-snapshots', () => {
  function listDailySnapshots(paths: ReturnType<typeof resolveStoragePaths>): string[] {
    const dir = getBackupsDirectory(paths);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name) => name.endsWith('-daily.json'));
  }

  function readStateFile(paths: ReturnType<typeof resolveStoragePaths>): { lastDailyDate?: string } {
    const statePath = path.join(paths.dataDir, '.snapshot-state.json');
    if (!fs.existsSync(statePath)) return {};
    return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as { lastDailyDate?: string };
  }

  function todayLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  it('creates a daily snapshot on first write of the day and updates the marker', () => {
    const { paths } = createProjectPaths();
    writeJson(paths.dataFile, makeAppData('seed'));

    writeDataToPaths(readDataFromPaths(paths), paths);

    const snapshots = listDailySnapshots(paths);
    expect(snapshots).toHaveLength(1);
    expect(readStateFile(paths).lastDailyDate).toBe(todayLocal());
  });

  it('does not create a second daily snapshot on subsequent writes the same day', () => {
    const { paths } = createProjectPaths();
    writeJson(paths.dataFile, makeAppData('seed'));

    writeDataToPaths(readDataFromPaths(paths), paths);
    writeDataToPaths(readDataFromPaths(paths), paths);
    writeDataToPaths(readDataFromPaths(paths), paths);

    expect(listDailySnapshots(paths)).toHaveLength(1);
  });

  it('creates a fresh snapshot when the marker points to an earlier date', () => {
    const { paths } = createProjectPaths();
    writeJson(paths.dataFile, makeAppData('seed'));
    fs.mkdirSync(paths.dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(paths.dataDir, '.snapshot-state.json'),
      JSON.stringify({ lastDailyDate: '1999-01-01' })
    );

    writeDataToPaths(readDataFromPaths(paths), paths);

    expect(listDailySnapshots(paths)).toHaveLength(1);
    expect(readStateFile(paths).lastDailyDate).toBe(todayLocal());
  });

  it('treats a corrupt marker file as no-snapshot-yet and recovers', () => {
    const { paths } = createProjectPaths();
    writeJson(paths.dataFile, makeAppData('seed'));
    fs.mkdirSync(paths.dataDir, { recursive: true });
    fs.writeFileSync(path.join(paths.dataDir, '.snapshot-state.json'), '{not json');

    expect(() => writeDataToPaths(readDataFromPaths(paths), paths)).not.toThrow();
    expect(listDailySnapshots(paths)).toHaveLength(1);
    expect(readStateFile(paths).lastDailyDate).toBe(todayLocal());
  });

  it('does not block the underlying write when snapshot creation fails', () => {
    const { paths } = createProjectPaths();
    writeJson(paths.dataFile, makeAppData('before'));

    const backupsDir = getBackupsDirectory(paths);
    fs.mkdirSync(paths.dataDir, { recursive: true });
    fs.writeFileSync(backupsDir, 'not-a-directory');

    const updated = readDataFromPaths(paths);
    updated.tasks[0].title = 'after';

    expect(() => writeDataToPaths(updated, paths)).not.toThrow();
    expect(readDataFromPaths(paths).tasks[0].title).toBe('after');
  });

  it('skips the daily snapshot when the data file does not yet exist', () => {
    const { paths } = createProjectPaths();

    writeDataToPaths(
      {
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
      },
      paths
    );

    expect(listDailySnapshots(paths)).toHaveLength(0);
  });
});

describe('atomic writes', () => {
  it('replaces an existing file on win32-compatible paths', () => {
    const tempRoot = fs.mkdtempSync(path.join(process.cwd(), 'tmp-atomic-write-'));
    tempRoots.push(tempRoot);

    const filePath = path.join(tempRoot, 'tasks.json');
    fs.writeFileSync(filePath, JSON.stringify(makeAppData('before'), null, 2));

    writeFileAtomically(filePath, JSON.stringify(makeAppData('after'), null, 2), 'win32');

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ReturnType<typeof makeAppData>;
    expect(parsed.tasks[0].title).toBe('after');
  });
});
