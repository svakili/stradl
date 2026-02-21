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
  isDeleted: boolean;
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
  globalTimeOffset: number;
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
      globalTimeOffset: 0,
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
  return JSON.parse(raw) as AppData;
}

export function writeData(data: AppData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
