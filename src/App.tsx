import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { TabName, Task, Settings } from './types';
import { useTasks } from './hooks/useTasks';
import { useSettings } from './hooks/useSettings';
import { useBlockers } from './hooks/useBlockers';
import { useUpdateCheck, LAST_NOTIFIED_VERSION_KEY } from './hooks/useUpdateCheck';
import * as api from './api';
import TabBar from './components/TabBar';
import TaskTable from './components/TaskTable';
import TaskForm from './components/TaskForm';
import SettingsPanel from './components/SettingsPanel';

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
  onUndo?: () => void;
}

const TAB_ORDER: TabName[] = ['tasks', 'backlog', 'ideas', 'blocked', 'completed', 'archive', 'trash'];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>('tasks');
  const [counts, setCounts] = useState<Record<TabName, number>>({ tasks: 0, backlog: 0, ideas: 0, blocked: 0, completed: 0, archive: 0, trash: 0 });
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [pendingActionByTaskId, setPendingActionByTaskId] = useState<Record<number, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<number>>(new Set());
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('stradl-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingTaskIdsRef = useRef<Set<number>>(new Set());
  const highlightTimersRef = useRef<Map<number, number>>(new Map());

  const { tasks, loading, reload, create, update, complete, uncomplete, remove, permanentRemove } = useTasks(activeTab);
  const { settings, update: updateSettings } = useSettings();
  const { blockers, loadForTask, create: createBlocker, remove: removeBlocker } = useBlockers();
  const {
    isChecking: isCheckingUpdates,
    lastResult: updateCheckResult,
    lastCheckedAt: updateLastCheckedAt,
    error: updateCheckError,
    checkNow: runUpdateCheck,
    maybeAutoCheck,
  } = useUpdateCheck();

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('stradl-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  // Filter tasks by search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) || t.status.toLowerCase().includes(q)
    );
  }, [tasks, searchQuery]);
  const hasActiveSearch = searchQuery.trim().length > 0;

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', onUndo?: () => void) => {
    const id = Date.now();
    setToasts(prev => {
      const next = [...prev, { id, type, message, onUndo }];
      return next.length > 3 ? next.slice(-3) : next;
    });
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Auto-dismiss toasts after 4 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map(t =>
      window.setTimeout(() => dismissToast(t.id), 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  useEffect(() => {
    void maybeAutoCheck();
  }, [maybeAutoCheck]);

  useEffect(() => {
    if (!updateCheckResult?.hasUpdate) return;
    try {
      const lastNotified = localStorage.getItem(LAST_NOTIFIED_VERSION_KEY);
      if (lastNotified === updateCheckResult.latestVersion) return;
      localStorage.setItem(LAST_NOTIFIED_VERSION_KEY, updateCheckResult.latestVersion);
    } catch {
      // Ignore storage errors and still show one-time in-session toast.
    }
    showToast(
      `Update available: v${updateCheckResult.latestVersion}. Open Settings to view release notes.`,
      'info'
    );
  }, [updateCheckResult, showToast]);

  // Mark a task as recently updated (highlight animation)
  const markRecentlyUpdated = useCallback((taskId: number) => {
    // Clear existing timer for this task
    const existing = highlightTimersRef.current.get(taskId);
    if (existing) clearTimeout(existing);

    setRecentlyUpdatedIds(prev => new Set(prev).add(taskId));
    const timer = window.setTimeout(() => {
      setRecentlyUpdatedIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      highlightTimersRef.current.delete(taskId);
    }, 2000);
    highlightTimersRef.current.set(taskId, timer);
  }, []);

  const loadCounts = useCallback(async () => {
    const results = await Promise.all(TAB_ORDER.map(t => api.fetchTasks(t)));
    const newCounts: Record<TabName, number> = { tasks: 0, backlog: 0, ideas: 0, blocked: 0, completed: 0, archive: 0, trash: 0 };
    TAB_ORDER.forEach((t, i) => { newCounts[t] = results[i].length; });
    setCounts(newCounts);

    // Collect all tasks for blocker form dropdowns
    const all = new Map<number, Task>();
    results.forEach(r => r.forEach(task => all.set(task.id, task)));
    setAllTasks(Array.from(all.values()));
  }, []);

  useEffect(() => {
    void loadCounts().catch((error) => {
      showToast(`Failed to refresh counts: ${getErrorMessage(error)}`, 'error');
    });
  }, [loadCounts, activeTab, showToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const isInputLike = target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' || target.isContentEditable
      );

      // Escape closes shortcut help
      if (e.key === 'Escape' && showShortcutHelp) {
        setShowShortcutHelp(false);
        return;
      }

      if (isInputLike) return;

      // '/' focuses task input (from any tab — switches to tasks first)
      if (e.key === '/' && !e.shiftKey) {
        e.preventDefault();
        if (activeTab !== 'tasks' && activeTab !== 'ideas') {
          setActiveTab('tasks');
        }
        // Need a small delay when switching tabs for the form to render
        setTimeout(() => newTaskInputRef.current?.focus(), 50);
        return;
      }

      // '?' shows shortcut help
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        setShowShortcutHelp(prev => !prev);
        return;
      }

      // 1-7 to switch tabs
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 7 && !e.shiftKey) {
        e.preventDefault();
        setActiveTab(TAB_ORDER[num - 1]);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [activeTab, showShortcutHelp]);

  const runTaskAction = useCallback(async (
    taskId: number,
    action: () => Promise<void>,
    successMessage?: string,
    onUndo?: () => void,
  ) => {
    if (pendingTaskIdsRef.current.has(taskId)) return;

    pendingTaskIdsRef.current.add(taskId);
    setPendingActionByTaskId(prev => ({ ...prev, [taskId]: true }));

    try {
      await action();
      markRecentlyUpdated(taskId);
      if (successMessage) {
        showToast(successMessage, 'success', onUndo);
      }
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      pendingTaskIdsRef.current.delete(taskId);
      setPendingActionByTaskId(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }
  }, [showToast, markRecentlyUpdated]);

  const handleCreate = async (data: { title: string; status?: string; priority?: string | null }) => {
    try {
      await create(data);
      await loadCounts();
      showToast('Task added.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
      throw error;
    }
  };

  const handleUpdate = async (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived' | 'isDeleted'>>) => {
    const undoAction = data.isArchived !== undefined || data.isDeleted !== undefined
      ? () => {
          const reverseData: Partial<Pick<Task, 'isArchived' | 'isDeleted'>> = {};
          if (data.isArchived !== undefined) reverseData.isArchived = !data.isArchived;
          if (data.isDeleted !== undefined) reverseData.isDeleted = !data.isDeleted;
          void handleUpdate(id, reverseData);
        }
      : undefined;

    const message = data.isArchived === true ? 'Task archived.'
      : data.isArchived === false ? 'Task unarchived.'
      : data.isDeleted === false ? 'Task restored.'
      : undefined;

    await runTaskAction(id, async () => {
      await update(id, data);
      await loadCounts();
    }, message, undoAction);
  };

  const handleComplete = async (id: number) => {
    await runTaskAction(id, async () => {
      await complete(id);
      await loadCounts();
    }, 'Task completed.', () => {
      void handleUncomplete(id);
    });
  };

  const handleUncomplete = async (id: number) => {
    await runTaskAction(id, async () => {
      await uncomplete(id);
      await loadCounts();
    }, 'Task marked as active.');
  };

  const handleDelete = async (id: number) => {
    await runTaskAction(id, async () => {
      await remove(id);
      await loadCounts();
    }, 'Task moved to trash.', () => {
      void handleUpdate(id, { isDeleted: false });
    });
  };

  const handlePermanentDelete = async (id: number) => {
    await runTaskAction(id, async () => {
      await permanentRemove(id);
      await loadCounts();
    }, 'Task permanently deleted.');
  };

  const handleLoadBlockers = async (taskId: number) => {
    try {
      await loadForTask(taskId);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
  };

  const handleAddBlocker = async (taskId: number, data: { blockedByTaskId?: number; blockedUntilDate?: string }) => {
    await runTaskAction(taskId, async () => {
      await createBlocker(taskId, data);
      await reload();
      await loadCounts();
    }, 'Blocker added.');
  };

  const handleRemoveBlocker = async (blockerId: number, taskId: number) => {
    await runTaskAction(taskId, async () => {
      await removeBlocker(blockerId, taskId);
      await reload();
      await loadCounts();
    }, 'Blocker removed.');
  };

  const handleSaveSettings = async (nextSettings: Settings) => {
    try {
      await updateSettings(nextSettings);
      await reload();
      await loadCounts();
      showToast('Settings saved.', 'success');
    } catch (error) {
      const message = `Failed to save settings: ${getErrorMessage(error)}`;
      showToast(message, 'error');
      throw new Error(message);
    }
  };

  const handleCheckForUpdates = async () => {
    try {
      await runUpdateCheck({ manual: true });
    } catch (error) {
      showToast(`Update check failed: ${getErrorMessage(error)}`, 'error');
    }
  };

  const showForm = activeTab === 'tasks' || activeTab === 'ideas';

  return (
    <div className="app">
      <header className="header">
        <h1>Stradl</h1>
        <div className="header-actions">
          <div className="search-bar">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
              aria-label="Search tasks"
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
                &times;
              </button>
            )}
          </div>
          <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? '\u263E' : '\u2600'}
          </button>
          <SettingsPanel
            settings={settings}
            onSave={handleSaveSettings}
            updateCheckResult={updateCheckResult}
            updateCheckError={updateCheckError}
            updateLastCheckedAt={updateLastCheckedAt}
            isCheckingUpdates={isCheckingUpdates}
            onCheckForUpdates={handleCheckForUpdates}
          />
        </div>
      </header>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

      {showForm && (
        <TaskForm activeTab={activeTab} titleInputRef={newTaskInputRef} onCreate={handleCreate} />
      )}

      <TaskTable
        tasks={filteredTasks}
        searchQuery={searchQuery}
        hasActiveSearch={hasActiveSearch}
        settings={settings}
        allTasks={allTasks}
        blockers={blockers}
        pendingActionByTaskId={pendingActionByTaskId}
        activeTab={activeTab}
        loading={loading}
        recentlyUpdatedIds={recentlyUpdatedIds}
        onTabChange={setActiveTab}
        onUpdate={handleUpdate}
        onComplete={handleComplete}
        onUncomplete={handleUncomplete}
        onDelete={handleDelete}
        onLoadBlockers={handleLoadBlockers}
        onAddBlocker={handleAddBlocker}
        onRemoveBlocker={handleRemoveBlocker}
        onPermanentDelete={handlePermanentDelete}
        onClearSearch={() => setSearchQuery('')}
      />

      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`toast toast-${t.type}`}
              role={t.type === 'error' ? 'alert' : 'status'}
              aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            >
              <span>{t.message}</span>
              <div className="toast-actions">
                {t.onUndo && (
                  <button className="toast-undo" onClick={() => { t.onUndo!(); dismissToast(t.id); }} aria-label="Undo action">
                    Undo
                  </button>
                )}
                <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
                  Close
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showShortcutHelp && (
        <div className="shortcut-overlay" onClick={() => setShowShortcutHelp(false)}>
          <div className="shortcut-dialog" onClick={e => e.stopPropagation()}>
            <h2>Keyboard Shortcuts</h2>
            <div className="shortcut-list">
              <div className="shortcut-item"><kbd>1</kbd>–<kbd>7</kbd><span>Switch tabs</span></div>
              <div className="shortcut-item"><kbd>/</kbd><span>Focus new task input</span></div>
              <div className="shortcut-item"><kbd>?</kbd><span>Toggle this help</span></div>
              <div className="shortcut-item"><kbd>Esc</kbd><span>Close dialogs / cancel edit</span></div>
            </div>
            <button className="btn btn-sm" onClick={() => setShowShortcutHelp(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
