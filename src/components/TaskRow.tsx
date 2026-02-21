import { useState, useRef, useEffect, useCallback } from 'react';
import type { Task, Settings, Blocker } from '../types';
import { isStale } from '../utils/staleness';
import { linkifyText } from '../utils/linkify';
import BlockerList from './BlockerList';
import BlockerForm from './BlockerForm';

interface Props {
  task: Task;
  settings: Settings;
  allTasks: Task[];
  blockers: Blocker[];
  onUpdate: (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived' | 'isDeleted'>>) => Promise<void>;
  onComplete: (id: number) => Promise<void>;
  onUncomplete: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onLoadBlockers: (taskId: number) => Promise<void>;
  onAddBlocker: (taskId: number, data: { blockedByTaskId?: number; blockedUntilDate?: string }) => Promise<void>;
  onRemoveBlocker: (blockerId: number, taskId: number) => Promise<void>;
  onPermanentDelete: (id: number) => Promise<void>;
}

const ROW_COLORS: Record<string, string> = {
  P0: '#fee2e2',
  P1: '#fef9c3',
  P2: '#dcfce7',
};

export default function TaskRow({
  task, settings, allTasks, blockers,
  onUpdate, onComplete, onUncomplete, onDelete,
  onLoadBlockers, onAddBlocker, onRemoveBlocker, onPermanentDelete,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [statusValue, setStatusValue] = useState(task.status);
  const [showBlockers, setShowBlockers] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const stale = isStale(task.updatedAt, settings);
  const bgColor = stale ? '#e9d5ff' : (task.priority ? ROW_COLORS[task.priority] : '#f3f4f6');

  // Sync status value from prop when not editing
  useEffect(() => {
    if (!editingStatus) {
      setStatusValue(task.status);
    }
  }, [task.status, editingStatus]);

  const autoResizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  // Auto-resize when editing starts
  useEffect(() => {
    if (editingStatus && textareaRef.current) {
      autoResizeTextarea(textareaRef.current);
    }
  }, [editingStatus, autoResizeTextarea]);

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
    const trimmed = statusValue.trim();
    if (trimmed !== task.status) {
      await onUpdate(task.id, { status: trimmed });
    } else {
      setStatusValue(task.status);
    }
  };

  const cancelStatusEdit = () => {
    setEditingStatus(false);
    setStatusValue(task.status);
  };

  const toggleBlockers = async () => {
    if (!showBlockers) {
      await onLoadBlockers(task.id);
    }
    setShowBlockers(!showBlockers);
  };

  const handleAddBlocker = async (data: { blockedByTaskId?: number; blockedUntilDate?: string }) => {
    await onAddBlocker(task.id, data);
  };

  const handleRemoveBlocker = async (blockerId: number) => {
    await onRemoveBlocker(blockerId, task.id);
  };

  return (
    <div className="task-row" style={{ backgroundColor: bgColor }}>
      <div className="task-row-main">
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

        <div className="task-actions">
          {task.isDeleted ? (
            <>
              <button className="btn btn-sm btn-primary" onClick={() => onUpdate(task.id, { isDeleted: false })}>Restore</button>
              <button className="btn btn-sm btn-danger" onClick={() => {
                if (window.confirm('Permanently delete this task? This cannot be undone.')) {
                  onPermanentDelete(task.id);
                }
              }}>Permanently Delete</button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      <div
        className="task-status-section"
        onClick={(e) => {
          if ((e.target as HTMLElement).tagName === 'A') return;
          setEditingStatus(true);
        }}
      >
        {editingStatus ? (
          <div className="status-edit-container">
            <textarea
              ref={textareaRef}
              autoFocus
              value={statusValue}
              onChange={(e) => {
                setStatusValue(e.target.value);
                autoResizeTextarea(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  saveStatus();
                }
                if (e.key === 'Escape') {
                  cancelStatusEdit();
                }
              }}
              className="inline-edit status-textarea"
              placeholder="Add status or notes..."
            />
            <div className="status-edit-actions">
              <button className="btn btn-sm btn-primary" onClick={saveStatus}>Save</button>
              <button className="btn btn-sm" onClick={cancelStatusEdit}>Cancel</button>
              <span className="status-edit-hint">Ctrl+Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : (
          <div className="status-display">
            {task.status ? (
              <span className="status-text">{linkifyText(task.status)}</span>
            ) : (
              <span className="status-placeholder">Click to add status...</span>
            )}
          </div>
        )}
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
