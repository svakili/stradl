import { useState, useEffect, useCallback, useRef } from 'react';
import type { TabName, Task, Settings } from './types';
import { useTasks } from './hooks/useTasks';
import { useSettings } from './hooks/useSettings';
import { useBlockers } from './hooks/useBlockers';
import * as api from './api';
import TabBar from './components/TabBar';
import TaskTable from './components/TaskTable';
import TaskForm from './components/TaskForm';
import SettingsPanel from './components/SettingsPanel';

interface ToastState {
  id: number;
  type: 'success' | 'error';
  message: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>('tasks');
  const [counts, setCounts] = useState<Record<TabName, number>>({ tasks: 0, backlog: 0, ideas: 0, blocked: 0, completed: 0, archive: 0, trash: 0 });
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pendingActionByTaskId, setPendingActionByTaskId] = useState<Record<number, boolean>>({});
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  const pendingTaskIdsRef = useRef<Set<number>>(new Set());

  const { tasks, loading, reload, create, update, complete, uncomplete, remove, permanentRemove } = useTasks(activeTab);
  const { settings, update: updateSettings } = useSettings();
  const { blockers, loadForTask, create: createBlocker, remove: removeBlocker } = useBlockers();

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ id: Date.now(), type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const loadCounts = useCallback(async () => {
    const tabs: TabName[] = ['tasks', 'backlog', 'ideas', 'blocked', 'completed', 'archive', 'trash'];
    const results = await Promise.all(tabs.map(t => api.fetchTasks(t)));
    const newCounts: Record<TabName, number> = { tasks: 0, backlog: 0, ideas: 0, blocked: 0, completed: 0, archive: 0, trash: 0 };
    tabs.forEach((t, i) => { newCounts[t] = results[i].length; });
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

  useEffect(() => {
    const handleSlashShortcut = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (activeTab !== 'tasks') return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        const isInputLike = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
        if (isInputLike) return;
      }

      e.preventDefault();
      newTaskInputRef.current?.focus();
    };

    document.addEventListener('keydown', handleSlashShortcut);
    return () => document.removeEventListener('keydown', handleSlashShortcut);
  }, [activeTab]);

  const runTaskAction = useCallback(async (taskId: number, action: () => Promise<void>, successMessage?: string) => {
    if (pendingTaskIdsRef.current.has(taskId)) return;

    pendingTaskIdsRef.current.add(taskId);
    setPendingActionByTaskId(prev => ({ ...prev, [taskId]: true }));

    try {
      await action();
      if (successMessage) {
        showToast(successMessage, 'success');
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
  }, [showToast]);

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
    await runTaskAction(id, async () => {
      await update(id, data);
      await loadCounts();
    });
  };

  const handleComplete = async (id: number) => {
    await runTaskAction(id, async () => {
      await complete(id);
      await loadCounts();
    }, 'Task completed.');
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
    }, 'Task moved to trash.');
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

  const showForm = activeTab === 'tasks' || activeTab === 'ideas';

  return (
    <div className="app">
      <header className="header">
        <h1>Stradl</h1>
        <SettingsPanel settings={settings} onSave={handleSaveSettings} />
      </header>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

      {showForm && (
        <TaskForm activeTab={activeTab} titleInputRef={newTaskInputRef} onCreate={handleCreate} />
      )}

      <TaskTable
        tasks={tasks}
        settings={settings}
        allTasks={allTasks}
        blockers={blockers}
        pendingActionByTaskId={pendingActionByTaskId}
        activeTab={activeTab}
        loading={loading}
        onTabChange={setActiveTab}
        onUpdate={handleUpdate}
        onComplete={handleComplete}
        onUncomplete={handleUncomplete}
        onDelete={handleDelete}
        onLoadBlockers={handleLoadBlockers}
        onAddBlocker={handleAddBlocker}
        onRemoveBlocker={handleRemoveBlocker}
        onPermanentDelete={handlePermanentDelete}
      />

      {toast && (
        <div
          className={`toast toast-${toast.type}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
          aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
        >
          <span>{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss notification">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
