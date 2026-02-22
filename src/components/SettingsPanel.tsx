import { useState, useRef, useEffect } from 'react';
import type { Settings } from '../types';

interface Props {
  settings: Settings;
  onSave: (data: Settings) => Promise<void>;
}

interface SettingsDraft {
  staleThresholdHours: string;
  topN: string;
  globalTimeOffset: string;
}

interface SettingsErrors {
  staleThresholdHours?: string;
  topN?: string;
  globalTimeOffset?: string;
}

function toDraft(settings: Settings): SettingsDraft {
  return {
    staleThresholdHours: String(settings.staleThresholdHours),
    topN: String(settings.topN),
    globalTimeOffset: String(settings.globalTimeOffset),
  };
}

export default function SettingsPanel({ settings, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<SettingsDraft>(toDraft(settings));
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(settings));
    setErrors({});
    setSubmitError(null);
  }, [settings, open]);

  const validate = (): { nextSettings: Settings | null; nextErrors: SettingsErrors } => {
    const nextErrors: SettingsErrors = {};

    const staleThresholdHours = Number(draft.staleThresholdHours);
    const topN = Number(draft.topN);
    const globalTimeOffset = Number(draft.globalTimeOffset);

    if (!Number.isInteger(staleThresholdHours)) {
      nextErrors.staleThresholdHours = 'Enter a whole number.';
    } else if (staleThresholdHours < 1) {
      nextErrors.staleThresholdHours = 'Must be at least 1.';
    }

    if (!Number.isInteger(topN)) {
      nextErrors.topN = 'Enter a whole number.';
    } else if (topN < 1) {
      nextErrors.topN = 'Must be at least 1.';
    }

    if (!Number.isInteger(globalTimeOffset)) {
      nextErrors.globalTimeOffset = 'Enter a whole number.';
    } else if (globalTimeOffset < 0) {
      nextErrors.globalTimeOffset = 'Must be 0 or greater.';
    }

    if (Object.keys(nextErrors).length > 0) {
      return { nextSettings: null, nextErrors };
    }

    return {
      nextSettings: {
        staleThresholdHours: Math.max(1, staleThresholdHours),
        topN: Math.max(1, topN),
        globalTimeOffset: Math.max(0, globalTimeOffset),
      },
      nextErrors,
    };
  };

  const handleSave = async () => {
    if (saving) return;

    setSubmitError(null);
    const { nextSettings, nextErrors } = validate();
    setErrors(nextErrors);

    if (!nextSettings) return;

    setSaving(true);
    try {
      await onSave(nextSettings);
      setOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(toDraft(settings));
    setErrors({});
    setSubmitError(null);
    setOpen(false);
  };

  return (
    <div className="settings-panel" ref={panelRef}>
      <button className="btn settings-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Hide Settings' : 'Settings'}
      </button>

      {open && (
        <div className="settings-body">
          <label className="settings-field">
            <span>Stale threshold (hours)</span>
            <input
              type="number"
              value={draft.staleThresholdHours}
              onChange={e => setDraft(prev => ({ ...prev, staleThresholdHours: e.target.value }))}
              min={1}
              disabled={saving}
            />
          </label>
          <p className="settings-help">Tasks not updated within this time turn purple on the Tasks tab.</p>
          {errors.staleThresholdHours && <p className="settings-error">{errors.staleThresholdHours}</p>}
          <label className="settings-field">
            <span>Top N tasks shown</span>
            <input
              type="number"
              value={draft.topN}
              onChange={e => setDraft(prev => ({ ...prev, topN: e.target.value }))}
              min={1}
              disabled={saving}
            />
          </label>
          <p className="settings-help">How many prioritized tasks show on Tasks. The rest go to Backlog.</p>
          {errors.topN && <p className="settings-error">{errors.topN}</p>}
          <label className="settings-field">
            <span>Vacation offset (hours)</span>
            <input
              type="number"
              value={draft.globalTimeOffset}
              onChange={e => setDraft(prev => ({ ...prev, globalTimeOffset: e.target.value }))}
              min={0}
              disabled={saving}
            />
          </label>
          <p className="settings-help">Extra hours added to the stale threshold while you're away.</p>
          {errors.globalTimeOffset && <p className="settings-error">{errors.globalTimeOffset}</p>}
          {submitError && <p className="settings-submit-error">{submitError}</p>}
          <div className="settings-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn" onClick={handleCancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
