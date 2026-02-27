import { useState, useRef, useEffect, useCallback } from 'react';
import type { Task, Settings, Blocker, TabName } from '../types';
import { isStale } from '../utils/staleness';
import { linkifyText } from '../utils/linkify';
import { relativeTime } from '../utils/relativeTime';
import BlockerList from './BlockerList';
import BlockerForm from './BlockerForm';

interface Props {
  task: Task;
  settings: Settings;
  showStaleness: boolean;
  isPending: boolean;
  isFocused: boolean;
  allTasks: Task[];
  blockers: Blocker[];
  activeTab: TabName;
  recentlyUpdated?: boolean;
  onUpdate: (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived'>>) => Promise<void>;
  onComplete: (id: number) => Promise<void>;
  onHide: (id: number, durationMinutes: 15 | 30 | 60 | 120 | 240) => Promise<void>;
  onUnhide: (id: number) => Promise<void>;
  onFocusToggle: (id: number, options?: { unhideFirst?: boolean }) => Promise<void>;
  onUncomplete: (id: number) => Promise<void>;
  onLoadBlockers: (taskId: number) => Promise<void>;
  onAddBlocker: (taskId: number, data: { blockedByTaskId?: number; blockedUntilDate?: string }) => Promise<void>;
  onRemoveBlocker: (blockerId: number, taskId: number) => Promise<void>;
  onPermanentDelete: (id: number) => Promise<void>;
}

const ROW_COLORS: Record<string, string> = {
  P0: 'var(--row-p0)',
  P1: 'var(--row-p1)',
  P2: 'var(--row-p2)',
};
const HIDE_PRESETS: Array<{ minutes: 15 | 30 | 60 | 120 | 240; label: string }> = [
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 240, label: '4h' },
];

function formatHiddenTimestamp(hiddenUntilAt: string | null): string {
  if (!hiddenUntilAt) return 'Hidden temporarily';
  const until = new Date(hiddenUntilAt);
  if (Number.isNaN(until.getTime())) return 'Hidden temporarily';

  const now = Date.now();
  const remainingMs = until.getTime() - now;
  const hiddenUntilLabel = until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (remainingMs <= 0) return `Hidden until ${hiddenUntilLabel} (returning now)`;
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (remainingMinutes < 60) return `Hidden until ${hiddenUntilLabel} (in ${remainingMinutes}m)`;

  const remainingHours = Math.ceil(remainingMinutes / 60);
  return `Hidden until ${hiddenUntilLabel} (in ${remainingHours}h)`;
}

export default function TaskRow({
  task, settings, showStaleness, isPending, isFocused, allTasks, blockers, activeTab, recentlyUpdated,
  onUpdate, onComplete, onHide, onUnhide, onFocusToggle, onUncomplete,
  onLoadBlockers, onAddBlocker, onRemoveBlocker, onPermanentDelete,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [statusValue, setStatusValue] = useState(task.status);
  const [showBlockers, setShowBlockers] = useState(activeTab === 'blocked');
  const [showHideMenu, setShowHideMenu] = useState(false);
  const skipNextTitleBlurSaveRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hideMenuRef = useRef<HTMLDivElement>(null);

  const stale = showStaleness && isStale(task.updatedAt, settings);
  const bgColor = stale ? 'var(--row-stale)' : (task.priority ? ROW_COLORS[task.priority] : 'var(--row-idea)');

  // Sync status value from prop when not editing
  useEffect(() => {
    if (!editingStatus) {
      setStatusValue(task.status);
    }
  }, [task.status, editingStatus]);

  useEffect(() => {
    if (!showHideMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!hideMenuRef.current) return;
      if (!hideMenuRef.current.contains(event.target as Node)) {
        setShowHideMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHideMenu]);

  const autoResizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Auto-resize when editing starts
  useEffect(() => {
    if (editingStatus && textareaRef.current) {
      autoResizeTextarea(textareaRef.current);
    }
  }, [editingStatus, autoResizeTextarea]);

  // Auto-load blockers when mounting on the blocked tab
  useEffect(() => {
    if (activeTab === 'blocked') {
      void onLoadBlockers(task.id);
    }
  }, [activeTab, task.id, onLoadBlockers]);

  const saveTitle = async () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== task.title) {
      try {
        await onUpdate(task.id, { title: titleValue.trim() });
      } catch {
        setTitleValue(task.title);
      }
    } else {
      setTitleValue(task.title);
    }
  };

  const cancelTitleEdit = () => {
    skipNextTitleBlurSaveRef.current = true;
    setEditingTitle(false);
    setTitleValue(task.title);
  };

  const saveStatus = async () => {
    setEditingStatus(false);
    const trimmed = statusValue.trim();
    if (trimmed !== task.status) {
      try {
        await onUpdate(task.id, { status: trimmed });
      } catch {
        setStatusValue(task.status);
      }
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

  const openTitleEditor = () => {
    if (!isPending) setEditingTitle(true);
  };

  const openStatusEditor = () => {
    if (!isPending) setEditingStatus(true);
  };

  const timestamp = activeTab === 'completed' && task.completedAt
    ? `Completed ${relativeTime(task.completedAt)}`
    : activeTab === 'hidden'
      ? formatHiddenTimestamp(task.hiddenUntilAt)
      : `Updated ${relativeTime(task.updatedAt)}`;

  const rowClasses = [
    'task-row',
    isPending ? 'task-row-pending' : '',
    isFocused ? 'task-row-focused' : '',
    recentlyUpdated ? 'task-row-highlight' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rowClasses} style={{ backgroundColor: bgColor }} aria-busy={isPending}>
      <div className="task-row-main">
        <select
          value={task.priority || ''}
          onChange={e => onUpdate(task.id, { priority: (e.target.value || null) as Task['priority'] })}
          className="priority-select"
          aria-label={`Priority for ${task.title}`}
          disabled={isPending}
        >
          <option value="">Idea</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>

        <div
          className="task-title"
          role="button"
          tabIndex={isPending ? -1 : 0}
          onClick={openTitleEditor}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openTitleEditor();
            }
          }}
          aria-label={`Edit title for ${task.title}`}
        >
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={() => {
                if (skipNextTitleBlurSaveRef.current) {
                  skipNextTitleBlurSaveRef.current = false;
                  return;
                }
                void saveTitle();
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveTitle();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelTitleEdit();
                }
              }}
              className="inline-edit"
              disabled={isPending}
            />
          ) : (
            <span className="task-title-display">
              <span className="task-id-badge">#{task.id}</span>
              {isFocused && <span className="task-now-pill">Now</span>}
              <span className="task-title-text">{task.title}</span>
            </span>
          )}
        </div>

        <div className="task-actions">
          {activeTab === 'completed' ? (
            <>
              <button className="btn btn-sm" onClick={() => onUncomplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as not completed`}>Undo</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
            </>
          ) : activeTab === 'archive' ? (
            <>
              <button className="btn btn-sm btn-primary" onClick={() => onUpdate(task.id, { isArchived: false })} disabled={isPending} aria-label={`Unarchive ${task.title}`}>Unarchive</button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  if (window.confirm('Permanently delete this task? This cannot be undone.')) {
                    void onPermanentDelete(task.id);
                  }
                }}
                disabled={isPending}
                aria-label={`Permanently delete ${task.title}`}
              >
                Permanently Delete
              </button>
            </>
          ) : activeTab === 'hidden' ? (
            <>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>Done</button>
              <button className="btn btn-sm" onClick={() => onUnhide(task.id)} disabled={isPending} aria-label={`Unhide ${task.title}`}>Unhide</button>
              <button className="btn btn-sm btn-primary" onClick={() => onFocusToggle(task.id, { unhideFirst: true })} disabled={isPending} aria-label={`Focus ${task.title} now`}>Now</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
            </>
          ) : activeTab === 'ideas' ? (
            <>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>Done</button>
              <button className="btn btn-sm" onClick={() => onFocusToggle(task.id)} disabled={isPending} aria-label={`Toggle focus for ${task.title}`}>{isFocused ? 'Clear Now' : 'Now'}</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
            </>
          ) : activeTab === 'tasks' ? (
            <>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>Done</button>
              <div className="hide-menu" ref={hideMenuRef}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => setShowHideMenu(prev => !prev)}
                  disabled={isPending}
                  aria-haspopup="menu"
                  aria-expanded={showHideMenu}
                  aria-label={`Hide ${task.title} for a short duration`}
                >
                  Hide
                </button>
                {showHideMenu && (
                  <div className="hide-menu-popover" role="menu" aria-label={`Hide durations for ${task.title}`}>
                    {HIDE_PRESETS.map(preset => (
                      <button
                        key={preset.minutes}
                        className="btn btn-sm btn-outline"
                        onClick={() => {
                          setShowHideMenu(false);
                          void onHide(task.id, preset.minutes);
                        }}
                        disabled={isPending}
                        role="menuitem"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn btn-sm" onClick={toggleBlockers} disabled={isPending} aria-label={`Manage blockers for ${task.title}`}>Block</button>
              <button className="btn btn-sm" onClick={() => onFocusToggle(task.id)} disabled={isPending} aria-label={`Toggle focus for ${task.title}`}>{isFocused ? 'Clear Now' : 'Now'}</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
            </>
          ) : activeTab === 'blocked' ? (
            <>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>Done</button>
              <button className="btn btn-sm" onClick={toggleBlockers} disabled={isPending} aria-label={`Manage blockers for ${task.title}`}>Block</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
            </>
          ) : (
            <>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>Done</button>
              <button className="btn btn-sm" onClick={toggleBlockers} disabled={isPending} aria-label={`Manage blockers for ${task.title}`}>Block</button>
              <button className="btn btn-sm" onClick={() => onFocusToggle(task.id)} disabled={isPending} aria-label={`Toggle focus for ${task.title}`}>{isFocused ? 'Clear Now' : 'Now'}</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
            </>
          )}
        </div>
      </div>

      <div
        className="task-status-section"
        role="button"
        tabIndex={isPending ? -1 : 0}
        aria-label={`Edit status for ${task.title}`}
        onClick={(e) => {
          if (editingStatus) return;
          if ((e.target as HTMLElement).tagName === 'A') return;
          openStatusEditor();
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openStatusEditor();
          }
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
                  void saveStatus();
                }
                if (e.key === 'Escape') {
                  cancelStatusEdit();
                }
              }}
              className="inline-edit status-textarea"
              placeholder="Add status or notes..."
              disabled={isPending}
            />
            <div className="status-edit-actions">
              <button className="btn btn-sm btn-primary" onClick={() => { void saveStatus(); }} disabled={isPending}>Save</button>
              <button className="btn btn-sm" onClick={cancelStatusEdit} disabled={isPending}>Cancel</button>
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

      <div className="task-timestamp">{timestamp}</div>

      {showBlockers && (
        <div className="task-blockers">
          <BlockerList
            blockers={blockers.filter(b => !b.resolved)}
            allTasks={allTasks}
            onRemove={handleRemoveBlocker}
            isDisabled={isPending}
          />
          <BlockerForm
            taskId={task.id}
            allTasks={allTasks}
            isDisabled={isPending}
            onAdd={handleAddBlocker}
          />
        </div>
      )}
    </div>
  );
}
