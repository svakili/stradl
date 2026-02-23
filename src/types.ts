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
  oneTimeOffsetHours: number;
  oneTimeOffsetExpiresAt: string | null;
  vacationPromptLastShownForUpdatedAt: string | null;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseName: string;
  publishedAt: string;
  checkedAt: string;
}

export type TabName = 'tasks' | 'backlog' | 'ideas' | 'blocked' | 'completed' | 'archive' | 'trash';
