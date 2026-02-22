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

        return (
          <div key={b.id} className="blocker-item">
            <span>
              {blockingTask
                ? `Blocked by: ${blockingTask.title}`
                : b.blockedUntilDate
                  ? `Blocked until: ${new Date(b.blockedUntilDate).toLocaleDateString()}`
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
