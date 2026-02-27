import { useMemo, useState } from 'react';
import type { Task } from '../types';

interface Props {
  taskId: number;
  allTasks: Task[];
  isDisabled?: boolean;
  onAdd: (data: { blockedByTaskId?: number; blockedUntilDate?: string }) => Promise<void>;
}

const PRIORITY_RANK: Record<NonNullable<Task['priority']>, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

function parseTaskIdInput(value: string): number | null {
  const match = value.trim().match(/^#?(\d+)$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function compareTasks(a: Task, b: Task): number {
  const aPriorityRank = a.priority ? PRIORITY_RANK[a.priority] : 3;
  const bPriorityRank = b.priority ? PRIORITY_RANK[b.priority] : 3;
  if (aPriorityRank !== bPriorityRank) return aPriorityRank - bPriorityRank;

  const aUpdated = new Date(a.updatedAt).getTime();
  const bUpdated = new Date(b.updatedAt).getTime();
  if (aUpdated !== bUpdated) {
    const normalizedA = Number.isNaN(aUpdated) ? 0 : aUpdated;
    const normalizedB = Number.isNaN(bUpdated) ? 0 : bUpdated;
    if (normalizedA !== normalizedB) return normalizedB - normalizedA;
  }

  return a.id - b.id;
}

export default function BlockerForm({ taskId, allTasks, isDisabled = false, onAdd }: Props) {
  const [blockerType, setBlockerType] = useState<'task' | 'date' | 'duration'>('task');
  const [taskQuery, setTaskQuery] = useState('');
  const [showTaskResults, setShowTaskResults] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');

  const allTasksById = useMemo(() => {
    return new Map(allTasks.map(t => [t.id, t]));
  }, [allTasks]);

  const candidateTasks = useMemo(() => {
    return allTasks.filter(t => t.id !== taskId && t.completedAt == null && !t.isArchived);
  }, [allTasks, taskId]);

  const parsedTaskId = useMemo(() => parseTaskIdInput(taskQuery), [taskQuery]);

  const typedTaskError = useMemo(() => {
    if (parsedTaskId == null) return null;

    const typedTask = allTasksById.get(parsedTaskId);
    if (!typedTask) return `No task found with ID #${parsedTaskId}.`;
    if (typedTask.id === taskId) return 'A task cannot be blocked by itself.';
    if (typedTask.isArchived) return `Task #${parsedTaskId} cannot be used because it is archived.`;
    if (typedTask.completedAt != null) return `Task #${parsedTaskId} cannot be used because it is completed.`;

    return null;
  }, [allTasksById, parsedTaskId, taskId]);

  const rankedMatches = useMemo(() => {
    const trimmedQuery = taskQuery.trim();
    if (!trimmedQuery) {
      return [...candidateTasks].sort(compareTasks);
    }

    const query = trimmedQuery.toLowerCase();
    const idQueryMatch = trimmedQuery.match(/^#?(\d+)$/);
    const idQuery = idQueryMatch ? idQueryMatch[1] : null;

    const scored = candidateTasks
      .map((task) => {
        const id = String(task.id);
        const title = task.title.toLowerCase();

        if (idQuery && id === idQuery) {
          return { task, bucket: 0 };
        }
        if (idQuery && id.startsWith(idQuery)) {
          return { task, bucket: 1 };
        }
        if (title.startsWith(query)) {
          return { task, bucket: 2 };
        }
        if (title.includes(query)) {
          return { task, bucket: 3 };
        }
        return null;
      })
      .filter((item): item is { task: Task; bucket: number } => item != null);

    scored.sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      return compareTasks(a.task, b.task);
    });

    return scored.map(item => item.task);
  }, [candidateTasks, taskQuery]);

  const visibleMatches = rankedMatches.slice(0, 8);
  const resultsListId = `blocker-task-results-${taskId}`;
  const activeDescendantId = visibleMatches.length > 0
    ? `${resultsListId}-option-${visibleMatches[Math.min(highlightedIndex, visibleMatches.length - 1)].id}`
    : undefined;

  const inlineTaskError = taskError ?? typedTaskError;
  const canSubmitTask = useMemo(() => {
    const trimmed = taskQuery.trim();
    if (!trimmed) return false;
    if (parsedTaskId != null) return typedTaskError == null;
    return visibleMatches.length > 0;
  }, [taskQuery, parsedTaskId, typedTaskError, visibleMatches]);

  const resetTaskPicker = () => {
    setTaskQuery('');
    setTaskError(null);
    setShowTaskResults(false);
    setHighlightedIndex(0);
  };

  const addTaskById = async (candidateTaskId: number): Promise<boolean> => {
    const candidateTask = allTasksById.get(candidateTaskId);
    if (!candidateTask) {
      setTaskError(`No task found with ID #${candidateTaskId}.`);
      return false;
    }
    if (candidateTask.id === taskId) {
      setTaskError('A task cannot be blocked by itself.');
      return false;
    }
    if (candidateTask.isArchived) {
      setTaskError(`Task #${candidateTaskId} cannot be used because it is archived.`);
      return false;
    }
    if (candidateTask.completedAt != null) {
      setTaskError(`Task #${candidateTaskId} cannot be used because it is completed.`);
      return false;
    }

    await onAdd({ blockedByTaskId: candidateTaskId });
    resetTaskPicker();
    return true;
  };

  const handleTaskAdd = async () => {
    const trimmed = taskQuery.trim();
    if (!trimmed) {
      setTaskError('Type a task title or #ID.');
      return;
    }

    const directTaskId = parseTaskIdInput(trimmed);
    if (directTaskId != null) {
      await addTaskById(directTaskId);
      return;
    }

    const taskToAdd = visibleMatches[highlightedIndex] ?? visibleMatches[0];
    if (!taskToAdd) {
      setTaskError('No matching task. Try a different title or #ID.');
      return;
    }

    await addTaskById(taskToAdd.id);
  };

  const handleAdd = async () => {
    if (blockerType === 'task') {
      await handleTaskAdd();
    } else if (blockerType === 'date' && selectedDate) {
      const localEndOfDay = new Date(`${selectedDate}T23:59:59.999`);
      await onAdd({ blockedUntilDate: localEndOfDay.toISOString() });
      setSelectedDate('');
    }
  };

  const handleDuration = async (hours: number) => {
    const until = new Date(Date.now() + hours * 3600000);
    await onAdd({ blockedUntilDate: until.toISOString() });
  };

  return (
    <div className="blocker-form">
      <select
        value={blockerType}
        onChange={e => {
          const nextType = e.target.value as 'task' | 'date' | 'duration';
          setBlockerType(nextType);
          setTaskError(null);
          if (nextType !== 'task') resetTaskPicker();
        }}
        aria-label="Blocker type"
        disabled={isDisabled}
      >
        <option value="task">Blocked by task</option>
        <option value="date">Blocked until date</option>
        <option value="duration">Blocked for duration</option>
      </select>

      {blockerType === 'task' ? (
        <div className="blocker-task-picker">
          <input
            value={taskQuery}
            onChange={e => {
              setTaskQuery(e.target.value);
              setTaskError(null);
              setShowTaskResults(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => {
              setShowTaskResults(true);
              if (visibleMatches.length > 0) setHighlightedIndex(0);
            }}
            onBlur={() => setShowTaskResults(false)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setShowTaskResults(true);
                setHighlightedIndex((prev) => {
                  if (visibleMatches.length === 0) return 0;
                  return (prev + 1) % visibleMatches.length;
                });
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setShowTaskResults(true);
                setHighlightedIndex((prev) => {
                  if (visibleMatches.length === 0) return 0;
                  return (prev - 1 + visibleMatches.length) % visibleMatches.length;
                });
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled) {
                  void handleTaskAdd();
                }
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setShowTaskResults(false);
              }
            }}
            className="blocker-task-input"
            placeholder="Type task title or #ID"
            role="combobox"
            aria-expanded={showTaskResults && visibleMatches.length > 0}
            aria-controls={resultsListId}
            aria-activedescendant={showTaskResults && visibleMatches.length > 0 ? activeDescendantId : undefined}
            aria-label="Blocking task"
            disabled={isDisabled}
          />
          {showTaskResults && visibleMatches.length > 0 && (
            <ul className="blocker-task-results" id={resultsListId} role="listbox">
              {visibleMatches.map((task, index) => (
                <li
                  key={task.id}
                  id={`${resultsListId}-option-${task.id}`}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className={`blocker-task-option ${index === highlightedIndex ? 'blocker-task-option-active' : ''}`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    if (isDisabled) return;
                    void addTaskById(task.id);
                  }}
                >
                  <span>{task.title}</span>
                  <span className="blocker-task-meta">#{task.id} · {task.priority ?? 'Idea'}</span>
                </li>
              ))}
            </ul>
          )}
          {inlineTaskError && <div className="blocker-task-error">{inlineTaskError}</div>}
        </div>
      ) : blockerType === 'date' ? (
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          aria-label="Blocked until date"
          disabled={isDisabled}
        />
      ) : (
        <div className="duration-presets">
          {[1, 2, 4, 8].map(h => (
            <button key={h} className="btn btn-sm btn-outline" onClick={() => handleDuration(h)} disabled={isDisabled}>
              {h}h
            </button>
          ))}
        </div>
      )}

      {blockerType !== 'duration' && (
        <button
          className="btn btn-sm btn-primary"
          onClick={handleAdd}
          disabled={isDisabled || (blockerType === 'task' && !canSubmitTask) || (blockerType === 'date' && !selectedDate)}
        >
          Add Blocker
        </button>
      )}
    </div>
  );
}
