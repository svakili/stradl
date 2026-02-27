import { useMemo } from 'react';
import type { Task, Settings, Blocker, TabName } from '../types';
import TaskRow from './TaskRow';

interface Props {
  tasks: Task[];
  searchQuery: string;
  hasActiveSearch: boolean;
  settings: Settings;
  allTasks: Task[];
  blockers: Record<number, Blocker[]>;
  pendingActionByTaskId: Record<number, boolean>;
  activeTab: TabName;
  loading: boolean;
  recentlyUpdatedIds?: Set<number>;
  focusedTaskId: number | null;
  onTabChange: (tab: TabName) => void;
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
  onClearSearch: () => void;
}

export default function TaskTable({
  tasks, searchQuery, hasActiveSearch, settings, allTasks, blockers, pendingActionByTaskId, activeTab, loading, recentlyUpdatedIds,
  focusedTaskId, onTabChange, onUpdate, onComplete, onHide, onUnhide, onFocusToggle, onUncomplete,
  onLoadBlockers, onAddBlocker, onRemoveBlocker, onPermanentDelete, onClearSearch,
}: Props) {
  const showStaleness = activeTab === 'tasks';
  const orderedTasks = useMemo(() => {
    if (focusedTaskId == null) return tasks;
    const focusedIndex = tasks.findIndex(task => task.id === focusedTaskId);
    if (focusedIndex <= 0) return tasks;

    const reordered = [...tasks];
    const [focusedTask] = reordered.splice(focusedIndex, 1);
    reordered.unshift(focusedTask);
    return reordered;
  }, [tasks, focusedTaskId]);

  const EMPTY_STATES: Record<TabName, { title: string; description: string; ctaLabel?: string; ctaTab?: TabName }> = {
    tasks: {
      title: 'No active tasks',
      description: 'All clear for now. Review backlog to pull in the next item.',
      ctaLabel: 'Go to Backlog',
      ctaTab: 'backlog',
    },
    backlog: {
      title: 'No backlog tasks',
      description: 'You have no overflow tasks at the moment.',
    },
    ideas: {
      title: 'No ideas yet',
      description: 'Capture new ideas above so they are ready when needed.',
    },
    blocked: {
      title: 'No blocked tasks',
      description: 'Everything is currently unblocked.',
      ctaLabel: 'Review blockers',
      ctaTab: 'tasks',
    },
    hidden: {
      title: 'No hidden tasks',
      description: 'Use Hide on the Tasks tab to temporarily defer short context switches.',
      ctaLabel: 'Go to Tasks',
      ctaTab: 'tasks',
    },
    completed: {
      title: 'No completed tasks',
      description: 'Completed tasks will appear here.',
    },
    archive: {
      title: 'No archived tasks',
      description: 'Archive items you want to keep but hide from active views.',
    },
  };

  if (loading) return <div className="loading" id={`tab-panel-${activeTab}`} role="tabpanel">Loading...</div>;
  if (tasks.length === 0) {
    if (hasActiveSearch) {
      const query = searchQuery.trim();
      return (
        <div className="empty-state search-empty-state" id={`tab-panel-${activeTab}`} role="tabpanel">
          <h2 className="empty-state-title">No matches found</h2>
          <p className="empty-state-description">
            No tasks match <span className="search-empty-state-query">"{query}"</span> in this tab.
          </p>
          <button className="btn empty-state-action" onClick={onClearSearch}>
            Clear search
          </button>
        </div>
      );
    }

    const state = EMPTY_STATES[activeTab];
    const ctaTab = state.ctaTab;
    return (
      <div className="empty-state" id={`tab-panel-${activeTab}`} role="tabpanel">
        <h2 className="empty-state-title">{state.title}</h2>
        <p className="empty-state-description">{state.description}</p>
        {state.ctaLabel && ctaTab && (
          <button className="btn empty-state-action" onClick={() => onTabChange(ctaTab)}>
            {state.ctaLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="task-table" id={`tab-panel-${activeTab}`} role="tabpanel">
      {orderedTasks.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          settings={settings}
          showStaleness={showStaleness}
          isPending={Boolean(pendingActionByTaskId[task.id])}
          allTasks={allTasks}
          blockers={blockers[task.id] || []}
          activeTab={activeTab}
          recentlyUpdated={recentlyUpdatedIds?.has(task.id)}
          isFocused={focusedTaskId === task.id}
          onUpdate={onUpdate}
          onComplete={onComplete}
          onHide={onHide}
          onUnhide={onUnhide}
          onFocusToggle={onFocusToggle}
          onUncomplete={onUncomplete}
          onLoadBlockers={onLoadBlockers}
          onAddBlocker={onAddBlocker}
          onRemoveBlocker={onRemoveBlocker}
          onPermanentDelete={onPermanentDelete}
        />
      ))}
    </div>
  );
}
