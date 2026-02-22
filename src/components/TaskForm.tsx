import { useState } from 'react';
import type { RefObject } from 'react';
import type { TabName } from '../types';

interface Props {
  activeTab: TabName;
  titleInputRef?: RefObject<HTMLInputElement>;
  onCreate: (data: { title: string; status?: string; priority?: string | null }) => Promise<void>;
}

export default function TaskForm({ activeTab, titleInputRef, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<string>('P1');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    const isIdea = activeTab === 'ideas';
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        priority: isIdea ? null : priority,
      });
      setTitle('');
    } catch {
      // Error feedback is handled at the app level.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <input
        ref={titleInputRef}
        type="text"
        placeholder={activeTab === 'ideas' ? 'New idea...' : 'New task... (press / to focus)'}
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="task-form-input"
        aria-label={activeTab === 'ideas' ? 'New idea title' : 'New task title'}
        disabled={submitting}
      />
      {activeTab !== 'ideas' && (
        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="task-form-priority"
          aria-label="New task priority"
          disabled={submitting}
        >
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>
      )}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Adding...' : 'Add'}
      </button>
    </form>
  );
}
