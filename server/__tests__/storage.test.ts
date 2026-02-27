import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDataFromPaths, resolveStoragePaths } from '../storage.js';

function makeAppData(title: string) {
  const now = '2026-02-24T00:00:00.000Z';
  return {
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
