import { useState } from 'react';
import type { Task, Settings, Blocker } from '../types';
import { isStale } from '../utils/staleness';
import BlockerList from './BlockerList';
import BlockerForm from './BlockerForm';

interface Props {
  task: Task;
  settings: Settings;
  allTasks: Task[];
  blockers: Blocker[];
  onUpdate: (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived'>>) => Promise<void>;
  onComplete: (id: number) => Promise<void>;
  onUncomplete: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onLoadBlockers: (taskId: number) => Promise<void>;
  onAddBlocker: (taskId: number, data: { blockedByTaskId?: number; blockedUntilDate?: string }) => Promise<void>;
  onRemoveBlocker: (blockerId: number, taskId: number) => Promise<void>;
  onReload: () => Promise<void>;
}

const ROW_COLORS: Record<string, string> = {
  P0: '#fee2e2',
  P1: '#fef9c3',
  P2: '#dcfce7',
};

export default function TaskRow({
  task, settings, allTasks, blockers,
  onUpdate, onComplete, onUncomplete, onDelete,
  onLoadBlockers, onAddBlocker, onRemoveBlocker, onReload,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [statusValue, setStatusValue] = useState(task.status);
  const [showBlockers, setShowBlockers] = useState(false);

  const stale = isStale(task.updatedAt, settings);
  const bgColor = stale ? '#e9d5ff' : (task.priority ? ROW_COLORS[task.priority] : '#f3f4f6');

  const saveTitle = async () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== task.title) {
      await onUpdate(task.id, { title: titleValue.trim() });
    } else {
      setTitleValue(task.title);
    }
  };

  const saveStatus = async () => {
    setEditingStatus(false);
    if (statusValue !== task.status) {
      await onUpdate(task.id, { status: statusValue });
    }
  };

  const toggleBlockers = async () => {
    if (!showBlockers) {
      await onLoadBlockers(task.id);
    }
    setShowBlockers(!showBlockers);
  };

  const handleAddBlocker = async (data: { blockedByTaskId?: number; blockedUntilDate?: string }) => {
    await onAddBlocker(task.id, data);
    await onReload();
  };

  const handleRemoveBlocker = async (blockerId: number) => {
    await onRemoveBlocker(blockerId, task.id);
    await onReload();
  };

  return (
    <div className="task-row" style={{ backgroundColor: bgColor }}>
      <div className="task-row-main">
        <div className="task-title" onClick={() => setEditingTitle(true)}>
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => e.key === 'Enter' && saveTitle()}
              className="inline-edit"
            />
          ) : (
            <span>{task.title}</span>
          )}
        </div>

        <div className="task-status" onClick={() => setEditingStatus(true)}>
          {editingStatus ? (
            <input
              autoFocus
              value={statusValue}
              onChange={e => setStatusValue(e.target.value)}
              onBlur={saveStatus}
              onKeyDown={e => e.key === 'Enter' && saveStatus()}
              className="inline-edit"
              placeholder="status..."
            />
          ) : (
            <span className="status-text">{task.status || '—'}</span>
          )}
        </div>

        <select
          value={task.priority || ''}
          onChange={e => onUpdate(task.id, { priority: (e.target.value || null) as Task['priority'] })}
          className="priority-select"
        >
          <option value="">Idea</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>

        <div className="task-actions">
          {task.completedAt ? (
            <button className="btn btn-sm" onClick={() => onUncomplete(task.id)}>Undo</button>
          ) : (
            <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)}>Done</button>
          )}
          <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: !task.isArchived })}>
            {task.isArchived ? 'Unarchive' : 'Archive'}
          </button>
          <button className="btn btn-sm" onClick={toggleBlockers}>
            Blockers
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(task.id)}>Delete</button>
        </div>
      </div>

      {showBlockers && (
        <div className="task-blockers">
          <BlockerList
            blockers={blockers.filter(b => !b.resolved)}
            allTasks={allTasks}
            onRemove={handleRemoveBlocker}
          />
          <BlockerForm
            taskId={task.id}
            allTasks={allTasks}
            onAdd={handleAddBlocker}
          />
        </div>
      )}
    </div>
  );
}
