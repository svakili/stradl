import { useState, useEffect, useCallback } from 'react';
import type { TabName, Task, Settings } from './types';
import { useTasks } from './hooks/useTasks';
import { useSettings } from './hooks/useSettings';
import { useBlockers } from './hooks/useBlockers';
import * as api from './api';
import TabBar from './components/TabBar';
import TaskTable from './components/TaskTable';
import TaskForm from './components/TaskForm';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabName>('tasks');
  const [counts, setCounts] = useState<Record<TabName, number>>({ tasks: 0, backlog: 0, ideas: 0, blocked: 0, completed: 0, archive: 0, trash: 0 });
  const [allTasks, setAllTasks] = useState<Task[]>([]);

  const { tasks, loading, reload, create, update, complete, uncomplete, remove, permanentRemove } = useTasks(activeTab);
  const { settings, update: updateSettings } = useSettings();
  const { blockers, loadForTask, create: createBlocker, remove: removeBlocker } = useBlockers();

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

  useEffect(() => { loadCounts(); }, [loadCounts, activeTab]);

  const handleReload = async () => {
    await reload();
    await loadCounts();
  };

  const handleCreate = async (data: { title: string; status?: string; priority?: string | null }) => {
    await create(data);
    await loadCounts();
  };

  const handleUpdate = async (id: number, data: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'isArchived' | 'isDeleted'>>) => {
    await update(id, data);
    await loadCounts();
  };

  const handleComplete = async (id: number) => {
    await complete(id);
    await loadCounts();
  };

  const handleUncomplete = async (id: number) => {
    await uncomplete(id);
    await loadCounts();
  };

  const handleDelete = async (id: number) => {
    await remove(id);
    await loadCounts();
  };

  const handlePermanentDelete = async (id: number) => {
    await permanentRemove(id);
    await loadCounts();
  };

  const handleAddBlocker = async (taskId: number, data: { blockedByTaskId?: number; blockedUntilDate?: string }) => {
    await createBlocker(taskId, data);
    await handleReload();
  };

  const handleRemoveBlocker = async (blockerId: number, taskId: number) => {
    await removeBlocker(blockerId, taskId);
    await handleReload();
  };

  const handleUpdateSettings = async (data: Partial<Settings>) => {
    await updateSettings(data);
    await reload();
    await loadCounts();
  };

  const showForm = activeTab === 'tasks' || activeTab === 'ideas';

  return (
    <div className="app">
      <header className="header">
        <h1>Stradl</h1>
        <SettingsPanel settings={settings} onUpdate={handleUpdateSettings} />
      </header>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

      {showForm && (
        <TaskForm activeTab={activeTab} onCreate={handleCreate} />
      )}

      <TaskTable
        tasks={tasks}
        settings={settings}
        allTasks={allTasks}
        blockers={blockers}
        activeTab={activeTab}
        loading={loading}
        onUpdate={handleUpdate}
        onComplete={handleComplete}
        onUncomplete={handleUncomplete}
        onDelete={handleDelete}
        onLoadBlockers={loadForTask}
        onAddBlocker={handleAddBlocker}
        onRemoveBlocker={handleRemoveBlocker}
        onPermanentDelete={handlePermanentDelete}
      />
    </div>
  );
}
