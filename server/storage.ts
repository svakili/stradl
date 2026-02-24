import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface StoragePaths {
  projectRoot: string;
  dataDir: string;
  dataFile: string;
  legacyDataFiles: string[];
}

interface ResolveStoragePathsOptions {
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
}

export interface Task {
  id: number;
  title: string;
  status: string;
  priority: 'P0' | 'P1' | 'P2' | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  isArchived: boolean;
}

export interface Blocker {
  id: number;
  taskId: number;
  blockedByTaskId: number | null;
  blockedUntilDate: string | null;
  resolved: boolean;
}

export interface Settings {
  staleThresholdHours: number;
  topN: number;
  oneTimeOffsetHours: number;
  oneTimeOffsetExpiresAt: string | null;
  vacationPromptLastShownForUpdatedAt: string | null;
}

export interface AppData {
  tasks: Task[];
  blockers: Blocker[];
  settings: Settings;
  nextTaskId: number;
  nextBlockerId: number;
}

export function findProjectRoot(cwd = process.cwd()): string {
  const candidates = [
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
    path.resolve(cwd),
  ];

  const resolved = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'package.json'))
  );

  if (!resolved) {
    throw new Error('Project root not found.');
  }

  return resolved;
}

function resolveDefaultDataDir(homeDir: string, platform: NodeJS.Platform, projectRoot: string): string {
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Stradl');
  }
  return path.join(projectRoot, 'data');
}

export function resolveStoragePaths(options: ResolveStoragePathsOptions = {}): StoragePaths {
  const env = options.env ?? process.env;
  const projectRoot = options.projectRoot ?? findProjectRoot();
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? env.HOME ?? os.homedir();
  const configuredDataDir = env.STRADL_DATA_DIR?.trim();
  const dataDir = configuredDataDir
    ? path.resolve(configuredDataDir)
    : resolveDefaultDataDir(homeDir, platform, projectRoot);

  return {
    projectRoot,
    dataDir,
    dataFile: path.join(dataDir, 'tasks.json'),
    legacyDataFiles: [
      path.join(projectRoot, 'data', 'tasks.json'),
      path.join(projectRoot, 'server', 'data', 'tasks.json'),
    ],
  };
}

export function getDataDirectory(): string {
  return resolveStoragePaths().dataDir;
}

export function getDataFilePath(): string {
  return resolveStoragePaths().dataFile;
}

function defaultData(): AppData {
  return {
    tasks: [],
    blockers: [],
    settings: {
      staleThresholdHours: 48,
      topN: 20,
      oneTimeOffsetHours: 0,
      oneTimeOffsetExpiresAt: null,
      vacationPromptLastShownForUpdatedAt: null,
    },
    nextTaskId: 1,
    nextBlockerId: 1,
  };
}

function pickLatestLegacyDataFile(legacyDataFiles: string[]): string | null {
  const candidates = legacyDataFiles
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return candidates[0]?.file ?? null;
}

function ensureDataFile(paths: StoragePaths): void {
  if (!fs.existsSync(paths.dataDir)) {
    fs.mkdirSync(paths.dataDir, { recursive: true });
  }

  if (fs.existsSync(paths.dataFile)) {
    return;
  }

  const sourceFile = pickLatestLegacyDataFile(paths.legacyDataFiles);
  if (sourceFile && path.resolve(sourceFile) !== path.resolve(paths.dataFile)) {
    fs.copyFileSync(sourceFile, paths.dataFile);
    return;
  }

  const data = defaultData();
  fs.writeFileSync(paths.dataFile, JSON.stringify(data, null, 2));
}

function normalizeData(parsed: AppData, dataFile: string): AppData {
  let migrated = false;

  for (const task of parsed.tasks) {
    if ('isDeleted' in task) {
      if ((task as Record<string, unknown>).isDeleted) {
        task.isArchived = true;
      }
      delete (task as Record<string, unknown>).isDeleted;
      migrated = true;
    }
  }

  if (migrated) {
    fs.writeFileSync(dataFile, JSON.stringify(parsed, null, 2));
  }

  const defaults = defaultData().settings;
  const incoming = parsed.settings as Partial<Settings> | undefined;

  parsed.settings = {
    staleThresholdHours: typeof incoming?.staleThresholdHours === 'number'
      ? incoming.staleThresholdHours
      : defaults.staleThresholdHours,
    topN: typeof incoming?.topN === 'number'
      ? incoming.topN
      : defaults.topN,
    oneTimeOffsetHours: typeof incoming?.oneTimeOffsetHours === 'number'
      ? incoming.oneTimeOffsetHours
      : defaults.oneTimeOffsetHours,
    oneTimeOffsetExpiresAt: typeof incoming?.oneTimeOffsetExpiresAt === 'string'
      ? incoming.oneTimeOffsetExpiresAt
      : defaults.oneTimeOffsetExpiresAt,
    vacationPromptLastShownForUpdatedAt: typeof incoming?.vacationPromptLastShownForUpdatedAt === 'string'
      ? incoming.vacationPromptLastShownForUpdatedAt
      : defaults.vacationPromptLastShownForUpdatedAt,
  };

  return parsed;
}

export function readDataFromPaths(paths: StoragePaths): AppData {
  ensureDataFile(paths);

  const raw = fs.readFileSync(paths.dataFile, 'utf-8');
  const parsed = JSON.parse(raw) as AppData;
  return normalizeData(parsed, paths.dataFile);
}

export function readData(): AppData {
  return readDataFromPaths(resolveStoragePaths());
}

export function writeDataToPaths(data: AppData, paths: StoragePaths): void {
  if (!fs.existsSync(paths.dataDir)) {
    fs.mkdirSync(paths.dataDir, { recursive: true });
  }
  fs.writeFileSync(paths.dataFile, JSON.stringify(data, null, 2));
}

export function writeData(data: AppData): void {
  writeDataToPaths(data, resolveStoragePaths());
}
