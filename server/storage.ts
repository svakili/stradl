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
  hiddenUntilAt: string | null;
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
  focusedTaskId: number | null;
}

export interface AppData {
  schemaVersion: number;
  tasks: Task[];
  blockers: Blocker[];
  settings: Settings;
  nextTaskId: number;
  nextBlockerId: number;
}

export interface DataSnapshot {
  snapshotPath: string;
  createdAt: string;
  reason: string;
}

export interface ImportDataResult {
  data: AppData;
  snapshot: DataSnapshot;
}

export const CURRENT_SCHEMA_VERSION = 1;
const SNAPSHOT_RETENTION_COUNT = 20;

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

export function getBackupsDirectory(paths: StoragePaths = resolveStoragePaths()): string {
  return path.join(paths.dataDir, 'backups');
}

function defaultSettings(): Settings {
  return {
    staleThresholdHours: 48,
    topN: 20,
    oneTimeOffsetHours: 0,
    oneTimeOffsetExpiresAt: null,
    vacationPromptLastShownForUpdatedAt: null,
    focusedTaskId: null,
  };
}

function defaultData(): AppData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tasks: [],
    blockers: [],
    settings: defaultSettings(),
    nextTaskId: 1,
    nextBlockerId: 1,
  };
}

function replaceFile(
  tempPath: string,
  filePath: string,
  platform: NodeJS.Platform = process.platform
): void {
  if (platform !== 'win32' || !fs.existsSync(filePath)) {
    fs.renameSync(tempPath, filePath);
    return;
  }

  const backupPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.bak`
  );

  fs.renameSync(filePath, backupPath);
  try {
    fs.renameSync(tempPath, filePath);
    fs.rmSync(backupPath, { force: true });
  } catch (error) {
    if (!fs.existsSync(filePath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, filePath);
    }
    throw error;
  }
}

export function writeFileAtomically(
  filePath: string,
  contents: string,
  platform: NodeJS.Platform = process.platform
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );

  fs.writeFileSync(tempPath, contents);

  const fileDescriptor = fs.openSync(tempPath, 'r');
  try {
    fs.fsyncSync(fileDescriptor);
  } finally {
    fs.closeSync(fileDescriptor);
  }

  replaceFile(tempPath, filePath, platform);

  try {
    const dirDescriptor = fs.openSync(path.dirname(filePath), 'r');
    try {
      fs.fsyncSync(dirDescriptor);
    } finally {
      fs.closeSync(dirDescriptor);
    }
  } catch {
    // Directory fsync is not supported on every platform/filesystem.
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  writeFileAtomically(filePath, JSON.stringify(value, null, 2));
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
  writeJsonFile(paths.dataFile, data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPriority(value: unknown): value is Task['priority'] {
  return value === 'P0' || value === 'P1' || value === 'P2' || value === null;
}

function coerceTask(value: unknown, index: number): Task {
  if (!isRecord(value)) {
    throw new Error(`Task at index ${index} is invalid.`);
  }

  const fallbackNow = new Date().toISOString();
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : fallbackNow;
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : createdAt;
  const completedAt = typeof value.completedAt === 'string' ? value.completedAt : null;
  const hiddenUntilAt = typeof value.hiddenUntilAt === 'string' ? value.hiddenUntilAt : null;
  const isDeleted = typeof value.isDeleted === 'boolean' ? value.isDeleted : false;

  if (
    typeof value.id !== 'number' ||
    !Number.isInteger(value.id) ||
    typeof value.title !== 'string' ||
    typeof value.status !== 'string'
  ) {
    throw new Error(`Task at index ${index} is missing required fields.`);
  }

  return {
    id: value.id,
    title: value.title,
    status: value.status,
    priority: isPriority(value.priority) ? value.priority : null,
    createdAt,
    updatedAt,
    completedAt,
    isArchived: typeof value.isArchived === 'boolean' ? value.isArchived : isDeleted,
    hiddenUntilAt,
  };
}

function coerceBlocker(value: unknown, index: number): Blocker {
  if (!isRecord(value)) {
    throw new Error(`Blocker at index ${index} is invalid.`);
  }

  if (
    typeof value.id !== 'number' ||
    !Number.isInteger(value.id) ||
    typeof value.taskId !== 'number' ||
    !Number.isInteger(value.taskId)
  ) {
    throw new Error(`Blocker at index ${index} is missing required fields.`);
  }

  return {
    id: value.id,
    taskId: value.taskId,
    blockedByTaskId: typeof value.blockedByTaskId === 'number' && Number.isInteger(value.blockedByTaskId)
      ? value.blockedByTaskId
      : null,
    blockedUntilDate: typeof value.blockedUntilDate === 'string' ? value.blockedUntilDate : null,
    resolved: value.resolved === true,
  };
}

function coerceSettings(value: unknown): Settings {
  const defaults = defaultSettings();
  const incoming = isRecord(value) ? value : {};

  return {
    staleThresholdHours: typeof incoming.staleThresholdHours === 'number'
      ? incoming.staleThresholdHours
      : defaults.staleThresholdHours,
    topN: typeof incoming.topN === 'number'
      ? incoming.topN
      : defaults.topN,
    oneTimeOffsetHours: typeof incoming.oneTimeOffsetHours === 'number'
      ? incoming.oneTimeOffsetHours
      : defaults.oneTimeOffsetHours,
    oneTimeOffsetExpiresAt: typeof incoming.oneTimeOffsetExpiresAt === 'string'
      ? incoming.oneTimeOffsetExpiresAt
      : defaults.oneTimeOffsetExpiresAt,
    vacationPromptLastShownForUpdatedAt: typeof incoming.vacationPromptLastShownForUpdatedAt === 'string'
      ? incoming.vacationPromptLastShownForUpdatedAt
      : defaults.vacationPromptLastShownForUpdatedAt,
    focusedTaskId: typeof incoming.focusedTaskId === 'number' && Number.isInteger(incoming.focusedTaskId)
      ? incoming.focusedTaskId
      : defaults.focusedTaskId,
  };
}

function normalizeDataValue(parsed: unknown): { data: AppData; changed: boolean } {
  if (!isRecord(parsed)) {
    throw new Error('Data file root must be an object.');
  }

  let migrated = false;
  const tasksRaw = parsed.tasks;
  const blockersRaw = parsed.blockers;

  if (!Array.isArray(tasksRaw) || !Array.isArray(blockersRaw)) {
    throw new Error('Data file is missing tasks or blockers arrays.');
  }

  const tasks = tasksRaw.map((task, index) => {
    if (isRecord(task) && ('isDeleted' in task || !('hiddenUntilAt' in task))) {
      migrated = true;
    }
    return coerceTask(task, index);
  });
  const blockers = blockersRaw.map((blocker, index) => coerceBlocker(blocker, index));
  const settings = coerceSettings(parsed.settings);

  const maxTaskId = tasks.reduce((highest, task) => Math.max(highest, task.id), 0);
  const maxBlockerId = blockers.reduce((highest, blocker) => Math.max(highest, blocker.id), 0);

  const incomingSchemaVersion = parsed.schemaVersion;
  if (incomingSchemaVersion !== CURRENT_SCHEMA_VERSION) {
    migrated = true;
  }

  if (parsed.settings === undefined || !isRecord(parsed.settings)) {
    migrated = true;
  }

  if (
    typeof parsed.nextTaskId !== 'number' ||
    !Number.isInteger(parsed.nextTaskId) ||
    parsed.nextTaskId <= maxTaskId
  ) {
    migrated = true;
  }

  if (
    typeof parsed.nextBlockerId !== 'number' ||
    !Number.isInteger(parsed.nextBlockerId) ||
    parsed.nextBlockerId <= maxBlockerId
  ) {
    migrated = true;
  }

  return {
    data: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      tasks,
      blockers,
      settings,
      nextTaskId: typeof parsed.nextTaskId === 'number' && Number.isInteger(parsed.nextTaskId)
        ? Math.max(parsed.nextTaskId, maxTaskId + 1)
        : maxTaskId + 1,
      nextBlockerId: typeof parsed.nextBlockerId === 'number' && Number.isInteger(parsed.nextBlockerId)
        ? Math.max(parsed.nextBlockerId, maxBlockerId + 1)
        : maxBlockerId + 1,
    },
    changed: migrated,
  };
}

function normalizeData(parsed: unknown, dataFile: string): AppData {
  const normalized = normalizeDataValue(parsed);
  if (normalized.changed) {
    writeJsonFile(dataFile, normalized.data);
  }
  return normalized.data;
}

export function parseAppData(value: unknown): AppData {
  return normalizeDataValue(value).data;
}

function sanitizeSnapshotReason(reason: string): string {
  const sanitized = reason.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'snapshot';
}

function pruneSnapshots(paths: StoragePaths, keep = SNAPSHOT_RETENTION_COUNT): void {
  const backupsDir = getBackupsDirectory(paths);
  if (!fs.existsSync(backupsDir)) return;

  const entries = fs.readdirSync(backupsDir)
    .map((name) => {
      const entryPath = path.join(backupsDir, name);
      const stats = fs.statSync(entryPath);
      return { name, entryPath, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const entry of entries.slice(keep)) {
    fs.rmSync(entry.entryPath, { recursive: true, force: true });
  }
}

export function createDataSnapshot(
  reason: string,
  paths: StoragePaths = resolveStoragePaths()
): DataSnapshot {
  ensureDataFile(paths);
  const data = readDataFromPaths(paths);
  const createdAt = new Date().toISOString();
  const backupsDir = getBackupsDirectory(paths);
  fs.mkdirSync(backupsDir, { recursive: true });

  const fileName = `${createdAt.replace(/[:.]/g, '-')}-${sanitizeSnapshotReason(reason)}.json`;
  const snapshotPath = path.join(backupsDir, fileName);
  writeJsonFile(snapshotPath, data);
  pruneSnapshots(paths);

  return {
    snapshotPath,
    createdAt,
    reason,
  };
}

export function readDataFromPaths(paths: StoragePaths): AppData {
  ensureDataFile(paths);

  const raw = fs.readFileSync(paths.dataFile, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return normalizeData(parsed, paths.dataFile);
}

export function readData(): AppData {
  return readDataFromPaths(resolveStoragePaths());
}

export function writeDataToPaths(data: AppData, paths: StoragePaths): void {
  const normalized = parseAppData(data);
  writeJsonFile(paths.dataFile, normalized);
}

export function writeData(data: AppData): void {
  writeDataToPaths(data, resolveStoragePaths());
}

export function exportData(paths: StoragePaths = resolveStoragePaths()): AppData {
  return readDataFromPaths(paths);
}

export function importData(
  value: unknown,
  paths: StoragePaths = resolveStoragePaths()
): ImportDataResult {
  const snapshot = createDataSnapshot('pre-import', paths);
  const normalized = parseAppData(value);
  writeDataToPaths(normalized, paths);
  return {
    data: normalized,
    snapshot,
  };
}
