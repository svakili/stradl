import { useState } from 'react';
import type { TabName } from '../types';

interface Props {
  activeTab: TabName;
  onCreate: (data: { title: string; status?: string; priority?: string | null }) => Promise<void>;
}

export default function TaskForm({ activeTab, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<string>('P1');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const isIdea = activeTab === 'ideas';
    await onCreate({
      title: title.trim(),
      priority: isIdea ? null : priority,
    });
    setTitle('');
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder={activeTab === 'ideas' ? 'New idea...' : 'New task...'}
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="task-form-input"
      />
      {activeTab !== 'ideas' && (
        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="task-form-priority"
        >
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>
      )}
      <button type="submit" className="btn btn-primary">Add</button>
    </form>
  );
}
