import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  suggestedDays: number;
  inactivityDays: number;
  isSaving: boolean;
  onApply: (days: number) => Promise<void>;
  onSkip: () => Promise<void>;
}

export default function VacationNudgeModal({
  open,
  suggestedDays,
  inactivityDays,
  isSaving,
  onApply,
  onSkip,
}: Props) {
  const [days, setDays] = useState(String(suggestedDays));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDays(String(suggestedDays));
  }, [open, suggestedDays]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const parsedDays = Number(days);
  const validDays = Number.isInteger(parsedDays) && parsedDays >= 1;

  const handleApply = async () => {
    if (!validDays || isSaving) return;
    await onApply(parsedDays);
  };

  const handleSkip = async () => {
    if (isSaving) return;
    await onSkip();
  };

  return (
    <div className="vacation-nudge-overlay" onClick={() => { void handleSkip(); }}>
      <div
        className="vacation-nudge-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Apply vacation offset"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            void handleSkip();
          }
        }}
      >
        <h2>Vacation Offset</h2>
        <p className="vacation-nudge-copy">
          No active task has been updated in about {inactivityDays} day{inactivityDays === 1 ? '' : 's'}.
        </p>
        <p className="vacation-nudge-copy">
          Apply a one-time offset for today?
        </p>
        <label className="vacation-nudge-field">
          <span>Offset (days)</span>
          <input
            ref={inputRef}
            type="number"
            min={1}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={isSaving}
          />
        </label>
        <div className="vacation-nudge-actions">
          <button className="btn btn-primary" onClick={() => { void handleApply(); }} disabled={!validDays || isSaving}>
            {isSaving ? 'Applying...' : 'Apply for today'}
          </button>
          <button className="btn" onClick={() => { void handleSkip(); }} disabled={isSaving}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
