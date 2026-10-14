import { useState, type KeyboardEvent } from 'react';
import {
  acceleratorToGlyphs,
  sameAccelerator,
  heldModifierGlyphs,
  recordChord,
} from '../lib/accelerator';
import { Keycaps, Message } from './controls';

type SaveShortcut = (accelerator: string) => Promise<string | null>;

interface ShortcutRecorderProps {
  value: string;
  defaultValue: string;
  mac: boolean;
  /** Persist the accelerator; resolves to an error message, or null on success. */
  onSave: SaveShortcut;
  labelledBy?: string;
}

type Feedback = { tone: 'error' | 'ok'; text: string } | null;

/**
 * Click, then press the new shortcut. Keys are read by physical position
 * (KeyboardEvent.code) so any keyboard layout records the same accelerator.
 */
export function ShortcutRecorder({
  value,
  defaultValue,
  mac,
  onSave,
  labelledBy,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [held, setHeld] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const stop = () => {
    setRecording(false);
    setHeld([]);
  };

  const save = async (accelerator: string) => {
    setSaving(true);
    const error = await onSave(accelerator);
    setSaving(false);
    setFeedback(error ? { tone: 'error', text: error } : null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    const result = recordChord(e, mac);
    switch (result.kind) {
      case 'modifiers':
        setHeld(heldModifierGlyphs(e, mac));
        return;
      case 'cancel':
        stop();
        return;
      case 'invalid':
        setHeld([]);
        setFeedback({ tone: 'error', text: result.reason });
        return;
      case 'ok':
        stop();
        if (sameAccelerator(result.accelerator, value, mac)) {
          setFeedback(null);
          return;
        }
        void save(result.accelerator);
    }
  };

  const handleKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (recording) setHeld(heldModifierGlyphs(e, mac));
  };

  const isDefault =
    sameAccelerator(value, defaultValue, mac);

  return (
    <div className="pf-recorder">
      <div className="pf-recorder-line">
        <button
          type="button"
          className={`pf-recorder-field${recording ? ' is-recording' : ''}`}
          aria-labelledby={labelledBy}
          aria-describedby={recording ? 'pf-recorder-hint' : undefined}
          aria-pressed={recording}
          data-testid="shortcut-recorder"
          disabled={saving}
          onClick={() => {
            setFeedback(null);
            setRecording((r) => !r);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={stop}
        >
          {recording ? (
            held.length > 0 ? (
              <Keycaps keys={held} />
            ) : (
              <span className="pf-recorder-placeholder">Type shortcut</span>
            )
          ) : (
            <Keycaps keys={acceleratorToGlyphs(value, mac)} />
          )}
        </button>
        {!isDefault && !recording && (
          <button
            type="button"
            className="pf-button"
            disabled={saving}
            onClick={() => void save(defaultValue)}
          >
            Restore Default
          </button>
        )}
      </div>
      {recording && (
        <div id="pf-recorder-hint" className="pf-recorder-hint">
          Press the new shortcut, or Esc to cancel.
        </div>
      )}
      {feedback && <Message tone={feedback.tone}>{feedback.text}</Message>}
    </div>
  );
}
