import { useState, useRef, useEffect } from 'react';
import type { Settings, UpdateCheckResult, UpdateApplyStatus } from '../types';

interface Props {
  settings: Settings;
  onSave: (data: Partial<Settings>) => Promise<void>;
  updateCheckResult: UpdateCheckResult | null;
  updateCheckError: string | null;
  updateLastCheckedAt: string | null;
  isCheckingUpdates: boolean;
  onCheckForUpdates: () => Promise<void>;
  updateApplyStatus: UpdateApplyStatus | null;
  updateApplyError: string | null;
  isApplyingUpdate: boolean;
  onApplyUpdate: () => Promise<void>;
}

interface SettingsDraft {
  staleThresholdHours: string;
  topN: string;
}

interface SettingsErrors {
  staleThresholdHours?: string;
  topN?: string;
}

function toDraft(settings: Settings): SettingsDraft {
  return {
    staleThresholdHours: String(settings.staleThresholdHours),
    topN: String(settings.topN),
  };
}

export default function SettingsPanel({
  settings,
  onSave,
  updateCheckResult,
  updateCheckError,
  updateLastCheckedAt,
  isCheckingUpdates,
  onCheckForUpdates,
  updateApplyStatus,
  updateApplyError,
  isApplyingUpdate,
  onApplyUpdate,
}: Props) {
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

  const validate = (): { nextSettings: Partial<Settings> | null; nextErrors: SettingsErrors } => {
    const nextErrors: SettingsErrors = {};

    const staleThresholdHours = Number(draft.staleThresholdHours);
    const topN = Number(draft.topN);

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

    if (Object.keys(nextErrors).length > 0) {
      return { nextSettings: null, nextErrors };
    }

    return {
      nextSettings: {
        staleThresholdHours: Math.max(1, staleThresholdHours),
        topN: Math.max(1, topN),
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

  const updateStatus = updateCheckResult == null
    ? 'Check for updates to see the latest available release.'
    : updateCheckResult.hasUpdate
      ? `Update available: v${updateCheckResult.latestVersion}.`
      : `You're up to date (v${updateCheckResult.currentVersion}).`;

  const applyStatus = updateApplyStatus == null
    ? null
    : updateApplyStatus.state === 'running'
      ? `Applying update: ${updateApplyStatus.step}.`
      : updateApplyStatus.state === 'succeeded'
        ? `Update applied${updateApplyStatus.toVersion ? ` (v${updateApplyStatus.toVersion})` : ''}.`
        : updateApplyStatus.state === 'failed'
          ? 'Update failed.'
          : null;

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
          <p className="settings-help">Vacation adjustments are handled with an inactivity popup when no active task has been updated recently.</p>

          <div className="settings-updates-section">
            <h3 className="settings-updates-title">App Updates</h3>
            <p className="settings-help">
              Current version: <strong>{updateCheckResult?.currentVersion || 'Unknown'}</strong>
            </p>
            <p className="settings-help">
              Latest version: <strong>{updateCheckResult?.latestVersion || 'Unknown'}</strong>
            </p>
            <p className="settings-help">{updateStatus}</p>
            {updateLastCheckedAt && (
              <p className="settings-help">
                Last checked: {new Date(updateLastCheckedAt).toLocaleString()}
              </p>
            )}
            {updateCheckError && <p className="settings-error">{updateCheckError}</p>}
            {applyStatus && <p className="settings-help settings-update-progress">{applyStatus}</p>}
            {updateApplyStatus?.message && (
              <p className="settings-help settings-update-message">{updateApplyStatus.message}</p>
            )}
            {updateApplyError && <p className="settings-error">{updateApplyError}</p>}
            <div className="settings-update-actions">
              <button
                className="btn btn-sm"
                onClick={() => { void onCheckForUpdates(); }}
                disabled={saving || isCheckingUpdates || isApplyingUpdate}
              >
                {isCheckingUpdates ? 'Checking...' : 'Check for updates'}
              </button>
              {updateCheckResult?.hasUpdate && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => { void onApplyUpdate(); }}
                  disabled={saving || isApplyingUpdate}
                >
                  {isApplyingUpdate ? 'Applying...' : 'Update now'}
                </button>
              )}
              {updateCheckResult?.hasUpdate && (
                <a
                  className="btn btn-sm"
                  href={updateCheckResult.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View release notes
                </a>
              )}
            </div>
          </div>

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
