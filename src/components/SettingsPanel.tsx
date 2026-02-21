import { useState } from 'react';
import type { Settings } from '../types';

interface Props {
  settings: Settings;
  onUpdate: (data: Partial<Settings>) => Promise<void>;
}

export default function SettingsPanel({ settings, onUpdate }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="settings-panel">
      <button className="btn settings-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Hide Settings' : 'Settings'}
      </button>

      {open && (
        <div className="settings-body">
          <label className="settings-field">
            <span>Stale threshold (hours)</span>
            <input
              type="number"
              value={settings.staleThresholdHours}
              onChange={e => onUpdate({ staleThresholdHours: Number(e.target.value) })}
              min={1}
            />
          </label>
          <label className="settings-field">
            <span>Top N tasks shown</span>
            <input
              type="number"
              value={settings.topN}
              onChange={e => onUpdate({ topN: Number(e.target.value) })}
              min={1}
            />
          </label>
          <label className="settings-field">
            <span>Vacation offset (hours)</span>
            <input
              type="number"
              value={settings.globalTimeOffset}
              onChange={e => onUpdate({ globalTimeOffset: Number(e.target.value) })}
              min={0}
            />
          </label>
        </div>
      )}
    </div>
  );
}
