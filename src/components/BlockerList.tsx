import type { Blocker, Task } from '../types';

interface Props {
  blockers: Blocker[];
  allTasks: Task[];
  onRemove: (blockerId: number) => Promise<void>;
  isDisabled?: boolean;
}

export default function BlockerList({ blockers, allTasks, onRemove, isDisabled = false }: Props) {
  if (blockers.length === 0) {
    return <div className="blocker-empty">No active blockers</div>;
  }

  return (
    <div className="blocker-list">
      {blockers.map(b => {
        const blockingTask = b.blockedByTaskId
          ? allTasks.find(t => t.id === b.blockedByTaskId)
          : null;

        const formatBlockedUntil = (iso: string) => {
          const d = new Date(iso);
          const now = new Date();
          const isToday = d.getFullYear() === now.getFullYear()
            && d.getMonth() === now.getMonth()
            && d.getDate() === now.getDate();
          if (isToday) {
            return `Blocked until ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          }
          return `Blocked until ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        };

        return (
          <div key={b.id} className="blocker-item">
            <span>
              {blockingTask
                ? `Blocked by: #${blockingTask.id} · ${blockingTask.title}`
                : b.blockedByTaskId
                  ? `Blocked by: #${b.blockedByTaskId} (task not found)`
                : b.blockedUntilDate
                  ? formatBlockedUntil(b.blockedUntilDate)
                  : 'Unknown blocker'}
            </span>
            <button className="btn btn-sm btn-danger" onClick={() => onRemove(b.id)} disabled={isDisabled}>
              Remove
            </button>
          </div>
        );
      })}
    </div>
  );
}
