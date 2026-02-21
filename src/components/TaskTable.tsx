import type { Task, Settings, Blocker, TabName } from '../types';
import TaskRow from './TaskRow';

interface Props {
  tasks: Task[];
  settings: Settings;
  allTasks: Task[];
  blockers: Record<number, Blocker[]>;
  activeTab: TabName;
  loading: boolean;
  onUpdate: (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived'>>) => Promise<void>;
  onComplete: (id: number) => Promise<void>;
  onUncomplete: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onLoadBlockers: (taskId: number) => Promise<void>;
  onAddBlocker: (taskId: number, data: { blockedByTaskId?: number; blockedUntilDate?: string }) => Promise<void>;
  onRemoveBlocker: (blockerId: number, taskId: number) => Promise<void>;
  onReload: () => Promise<void>;
}

export default function TaskTable({
  tasks, settings, allTasks, blockers, activeTab, loading,
  onUpdate, onComplete, onUncomplete, onDelete,
  onLoadBlockers, onAddBlocker, onRemoveBlocker, onReload,
}: Props) {
  if (loading) return <div className="loading">Loading...</div>;
  if (tasks.length === 0) {
    return <div className="empty">No {activeTab} yet.</div>;
  }

  return (
    <div className="task-table">
      {tasks.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          settings={settings}
          allTasks={allTasks}
          blockers={blockers[task.id] || []}
          onUpdate={onUpdate}
          onComplete={onComplete}
          onUncomplete={onUncomplete}
          onDelete={onDelete}
          onLoadBlockers={onLoadBlockers}
          onAddBlocker={onAddBlocker}
          onRemoveBlocker={onRemoveBlocker}
          onReload={onReload}
        />
      ))}
    </div>
  );
}
