import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  onUpdate: (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived' | 'recurrence'>>) => Promise<void>;
  onComplete: (id: number) => Promise<void>;
  onHide: (id: number, durationMinutes: 15 | 30 | 60 | 120 | 240) => Promise<void>;
  onHideUntilDate: (id: number, date: string) => Promise<void>;
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
  P3: 'var(--row-p3)',
};
const HIDE_PRESETS: Array<{ minutes: 15 | 30 | 60 | 120 | 240; label: string }> = [
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 240, label: '4h' },
];
const STATUS_PREVIEW_LINES = 4;

function formatHiddenTimestamp(hiddenUntilAt: string | null): string {
  if (!hiddenUntilAt) return 'Hidden temporarily';
  const until = new Date(hiddenUntilAt);
  if (Number.isNaN(until.getTime())) return 'Hidden temporarily';

  const now = new Date();
  const remainingMs = until.getTime() - now.getTime();

  if (remainingMs <= 0) {
    const label = until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Hidden until ${label} (returning now)`;
  }

  const isToday = until.toDateString() === now.toDateString();

  if (isToday) {
    const hiddenUntilLabel = until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    if (remainingMinutes < 60) return `Hidden until ${hiddenUntilLabel} (in ${remainingMinutes}m)`;
    const remainingHours = Math.ceil(remainingMinutes / 60);
    return `Hidden until ${hiddenUntilLabel} (in ${remainingHours}h)`;
  }

  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  if (until.toDateString() === tomorrowDate.toDateString()) {
    return 'Hidden until tomorrow';
  }

  const dateLabel = until.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `Hidden until ${dateLabel}`;
}

export default function TaskRow({
  task, settings, showStaleness, isPending, isFocused, allTasks, blockers, activeTab, recentlyUpdated,
  onUpdate, onComplete, onHide, onHideUntilDate, onUnhide, onFocusToggle, onUncomplete,
  onLoadBlockers, onAddBlocker, onRemoveBlocker, onPermanentDelete,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [statusValue, setStatusValue] = useState(task.status);
  const [showBlockers, setShowBlockers] = useState(activeTab === 'blocked');
  const [showHideMenu, setShowHideMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hideDateValue, setHideDateValue] = useState('');
  const [isStatusExpanded, setIsStatusExpanded] = useState(false);
  const [isStatusOverflowing, setIsStatusOverflowing] = useState(false);
  const skipNextTitleBlurSaveRef = useRef(false);
  const skipNextStatusBlurSaveRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hideMenuRef = useRef<HTMLDivElement>(null);
  const statusPreviewRef = useRef<HTMLDivElement>(null);
  const statusTextRef = useRef<HTMLDivElement>(null);

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const minPickerDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  }, []);

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
        setShowDatePicker(false);
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

  const measureStatusOverflow = useCallback(() => {
    const statusTextEl = statusTextRef.current;
    if (editingStatus || !statusTextEl || !task.status) {
      setIsStatusOverflowing(false);
      if (!task.status) {
        setIsStatusExpanded(false);
      }
      return;
    }

    const computedStyle = window.getComputedStyle(statusTextEl);
    let lineHeight = parseFloat(computedStyle.lineHeight);
    if (Number.isNaN(lineHeight)) {
      const fontSize = parseFloat(computedStyle.fontSize);
      lineHeight = Number.isNaN(fontSize) ? 0 : fontSize * 1.5;
    }

    const maxPreviewHeight = lineHeight * STATUS_PREVIEW_LINES;
    const contentHeight = statusTextEl.scrollHeight;
    const overflowing = maxPreviewHeight > 0 && contentHeight > maxPreviewHeight + 1;

    setIsStatusOverflowing(prev => (prev === overflowing ? prev : overflowing));
    if (!overflowing) {
      setIsStatusExpanded(false);
    }
  }, [editingStatus, task.status]);

  useEffect(() => {
    measureStatusOverflow();

    if (editingStatus || typeof ResizeObserver === 'undefined') {
      return;
    }

    const previewEl = statusPreviewRef.current;
    const textEl = statusTextRef.current;
    if (!previewEl && !textEl) {
      return;
    }

    let frameId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        measureStatusOverflow();
      });
    });

    if (previewEl) {
      observer.observe(previewEl);
    }
    if (textEl && textEl !== previewEl) {
      observer.observe(textEl);
    }

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [editingStatus, measureStatusOverflow]);

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
    skipNextStatusBlurSaveRef.current = true;
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
    ? `Completed ${relativeTime(task.completedAt)} · ${new Date(task.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
    : activeTab === 'hidden'
      ? formatHiddenTimestamp(task.hiddenUntilAt)
      : `Updated ${relativeTime(task.updatedAt)}`;

  const rowClasses = [
    'task-row',
    isPending ? 'task-row-pending' : '',
    isFocused ? 'task-row-focused' : '',
    recentlyUpdated ? 'task-row-highlight' : '',
    showHideMenu ? 'task-row--menu-open' : '',
  ].filter(Boolean).join(' ');
  const statusPreviewClasses = [
    'status-preview',
    isStatusExpanded ? 'status-preview-expanded' : 'status-preview-collapsed',
  ].join(' ');

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
          <option value="P3">P3</option>
        </select>

        {(activeTab === 'tasks' || activeTab === 'backlog' || activeTab === 'ideas' || activeTab === 'hidden') && (
          <select
            value={task.recurrence || ''}
            onChange={e => onUpdate(task.id, { recurrence: (e.target.value || null) as Task['recurrence'] })}
            className="recurrence-select"
            aria-label={`Recurrence for ${task.title}`}
            disabled={isPending}
          >
            <option value="">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        )}

        <div
          className="task-title"
          role="button"
          tabIndex={isPending ? -1 : 0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) return;
            openTitleEditor();
          }}
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
              {task.recurrence && <span className="task-recurrence-badge">{task.recurrence}</span>}
              <span className="task-title-text">{linkifyText(task.title)}</span>
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
              <button className="btn btn-sm btn-primary" onClick={() => onFocusToggle(task.id, { unhideFirst: true })} disabled={isPending} aria-label={`Focus ${task.title} now`}>Now</button>
              <button className="btn btn-sm" onClick={() => onUnhide(task.id)} disabled={isPending} aria-label={`Unhide ${task.title}`}>Unhide</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>{task.recurrence ? 'Cycle' : 'Done'}</button>
            </>
          ) : activeTab === 'ideas' ? (
            <>
              <button className="btn btn-sm" onClick={() => onFocusToggle(task.id)} disabled={isPending} aria-label={`Toggle focus for ${task.title}`}>{isFocused ? 'Clear Now' : 'Now'}</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>{task.recurrence ? 'Cycle' : 'Done'}</button>
            </>
          ) : activeTab === 'tasks' ? (
            <>
              <button className="btn btn-sm" onClick={() => onFocusToggle(task.id)} disabled={isPending} aria-label={`Toggle focus for ${task.title}`}>{isFocused ? 'Clear Now' : 'Now'}</button>
              <div className="hide-menu" ref={hideMenuRef}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setShowHideMenu(prev => {
                      if (prev) setShowDatePicker(false);
                      return !prev;
                    });
                  }}
                  disabled={isPending}
                  aria-haspopup="menu"
                  aria-expanded={showHideMenu}
                  aria-label={`Hide ${task.title}`}
                >
                  Hide
                </button>
                {showHideMenu && (
                  <div className="hide-menu-popover" role="menu" aria-label={`Hide options for ${task.title}`}>
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
                    <hr className="hide-menu-divider" />
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        setShowHideMenu(false);
                        void onHideUntilDate(task.id, tomorrow);
                      }}
                      disabled={isPending}
                      role="menuitem"
                    >
                      Tomorrow
                    </button>
                    {!showDatePicker ? (
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => {
                          setShowDatePicker(true);
                          setHideDateValue('');
                        }}
                        disabled={isPending}
                        role="menuitem"
                      >
                        Pick a date…
                      </button>
                    ) : (
                      <div className="hide-date-picker" role="menuitem">
                        <input
                          type="date"
                          min={minPickerDate}
                          value={hideDateValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHideDateValue(val);
                            if (val) {
                              setShowHideMenu(false);
                              setShowDatePicker(false);
                              void onHideUntilDate(task.id, val);
                            }
                          }}
                          disabled={isPending}
                          autoFocus
                          aria-label="Pick a date to hide until"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button className="btn btn-sm" onClick={toggleBlockers} disabled={isPending} aria-label={`Manage blockers for ${task.title}`}>Block</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>{task.recurrence ? 'Cycle' : 'Done'}</button>
            </>
          ) : activeTab === 'blocked' ? (
            <>
              <button className="btn btn-sm" onClick={toggleBlockers} disabled={isPending} aria-label={`Manage blockers for ${task.title}`}>Block</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>{task.recurrence ? 'Cycle' : 'Done'}</button>
            </>
          ) : (
            <>
              <button className="btn btn-sm" onClick={() => onFocusToggle(task.id)} disabled={isPending} aria-label={`Toggle focus for ${task.title}`}>{isFocused ? 'Clear Now' : 'Now'}</button>
              <button className="btn btn-sm" onClick={toggleBlockers} disabled={isPending} aria-label={`Manage blockers for ${task.title}`}>Block</button>
              <button className="btn btn-sm" onClick={() => onUpdate(task.id, { isArchived: true })} disabled={isPending} aria-label={`Archive ${task.title}`}>Archive</button>
              <button className="btn btn-sm btn-success" onClick={() => onComplete(task.id)} disabled={isPending} aria-label={`Mark ${task.title} as done`}>{task.recurrence ? 'Cycle' : 'Done'}</button>
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
              onBlur={() => {
                if (skipNextStatusBlurSaveRef.current) {
                  skipNextStatusBlurSaveRef.current = false;
                  return;
                }
                void saveStatus();
              }}
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
              <>
                <div
                  ref={statusPreviewRef}
                  id={`task-status-preview-${task.id}`}
                  className={statusPreviewClasses}
                >
                  <div ref={statusTextRef} className="status-text">
                    {linkifyText(task.status)}
                  </div>
                </div>
                {isStatusOverflowing && (
                  <button
                    type="button"
                    className="status-toggle"
                    aria-controls={`task-status-preview-${task.id}`}
                    aria-expanded={isStatusExpanded}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsStatusExpanded(prev => !prev);
                    }}
                  >
                    {isStatusExpanded ? 'Less' : 'More'}
                  </button>
                )}
              </>
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
