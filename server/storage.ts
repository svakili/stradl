import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');

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

export function readData(): AppData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const data = defaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return data;
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as AppData;

  // Migration: merge isDeleted into isArchived
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
    fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
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

export function writeData(data: AppData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
