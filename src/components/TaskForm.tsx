import { useState } from 'react';
import type { RefObject } from 'react';
import type { TabName } from '../types';

interface Props {
  activeTab: TabName;
  titleInputRef?: RefObject<HTMLInputElement>;
  onCreate: (data: { title: string; status?: string; priority?: string | null; recurrence?: string | null }) => Promise<void>;
}

export default function TaskForm({ activeTab, titleInputRef, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('');
  const [showStatus, setShowStatus] = useState(false);
  const [priority, setPriority] = useState<string>('P1');
  const [recurrence, setRecurrence] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    const isIdea = activeTab === 'ideas';
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        ...(status.trim() ? { status: status.trim() } : {}),
        priority: isIdea ? null : priority,
        ...(recurrence ? { recurrence } : {}),
      });
      setTitle('');
      setStatus('');
      setRecurrence('');
      setShowStatus(false);
    } catch {
      // Error feedback is handled at the app level.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <div className="task-form-row">
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
        <select
          value={recurrence}
          onChange={e => setRecurrence(e.target.value)}
          className="task-form-recurrence"
          aria-label="New task recurrence"
          disabled={submitting}
        >
          <option value="">Once</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button
          type="button"
          className={`btn task-form-status-toggle${showStatus ? ' active' : ''}`}
          onClick={() => setShowStatus(!showStatus)}
          title={showStatus ? 'Hide status' : 'Add status'}
          aria-label={showStatus ? 'Hide status field' : 'Show status field'}
        >
          +Status
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add'}
        </button>
      </div>
      {showStatus && (
        <textarea
          placeholder="Status / description..."
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="task-form-status"
          aria-label="New task status"
          disabled={submitting}
          rows={2}
        />
      )}
    </form>
  );
}
