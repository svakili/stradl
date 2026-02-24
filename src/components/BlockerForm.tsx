import { useState } from 'react';
import type { Task } from '../types';

interface Props {
  taskId: number;
  allTasks: Task[];
  isDisabled?: boolean;
  onAdd: (data: { blockedByTaskId?: number; blockedUntilDate?: string }) => Promise<void>;
}

export default function BlockerForm({ taskId, allTasks, isDisabled = false, onAdd }: Props) {
  const [blockerType, setBlockerType] = useState<'task' | 'date' | 'duration'>('task');
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState('');

  const otherTasks = allTasks.filter(
    t => t.id !== taskId && t.completedAt == null && !t.isArchived
  );

  const handleAdd = async () => {
    if (blockerType === 'task' && selectedTask) {
      await onAdd({ blockedByTaskId: parseInt(selectedTask) });
      setSelectedTask('');
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
      <select value={blockerType} onChange={e => setBlockerType(e.target.value as 'task' | 'date' | 'duration')} aria-label="Blocker type" disabled={isDisabled}>
        <option value="task">Blocked by task</option>
        <option value="date">Blocked until date</option>
        <option value="duration">Blocked for duration</option>
      </select>

      {blockerType === 'task' ? (
        <select value={selectedTask} onChange={e => setSelectedTask(e.target.value)} aria-label="Blocking task" disabled={isDisabled}>
          <option value="">Select task...</option>
          {otherTasks.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
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
        <button className="btn btn-sm btn-primary" onClick={handleAdd} disabled={isDisabled || (blockerType === 'task' && !selectedTask) || (blockerType === 'date' && !selectedDate)}>
          Add Blocker
        </button>
      )}
    </div>
  );
}
