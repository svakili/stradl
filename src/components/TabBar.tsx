import type { TabName } from '../types';

interface Props {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  counts: Record<TabName, number>;
}

const TABS: { key: TabName; label: string }[] = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'completed', label: 'Completed' },
  { key: 'archive', label: 'Archive' },
  { key: 'trash', label: 'Trash' },
];

export default function TabBar({ activeTab, onTabChange, counts }: Props) {
  return (
    <div className="tab-bar" role="tablist" aria-label="Task tabs">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          className={`tab ${activeTab === key ? 'tab-active' : ''}`}
          onClick={() => onTabChange(key)}
          role="tab"
          aria-selected={activeTab === key}
          aria-controls={`tab-panel-${key}`}
        >
          {label}
          <span className="tab-count">{counts[key]}</span>
        </button>
      ))}
    </div>
  );
}
