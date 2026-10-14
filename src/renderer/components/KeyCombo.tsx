import type { KeyStroke } from '../../shared/keys';
import { resolveStrokes, useKeyboardLayout } from '../lib/keyboard-layout';

interface KeyComboProps {
  /** Display string from the main process (fallback when strokes are absent). */
  keys: string;
  /** Structured strokes, resolved against the user's keyboard layout. */
  strokes?: KeyStroke[];
}

interface Pill {
  text: string;
  hint?: string;
}

export function KeyCombo({ keys, strokes }: KeyComboProps) {
  const layout = useKeyboardLayout();

  const pills: Pill[] = strokes && strokes.length > 0
    ? resolveStrokes(strokes, layout)
    : (keys ?? '').split(/\s+/).filter(Boolean).map((text) => ({ text }));

  if (pills.length === 0) {
    return <span className="text-[11px] italic text-white/20">unbound</span>;
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {pills.map((pill, i) => (
        <span key={`${i}-${pill.text}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-white/15">&middot;</span>}
          <kbd
            title={pill.hint}
            data-layout-hint={pill.hint ? '' : undefined}
            className={pill.hint ? 'underline decoration-white/30 decoration-dotted underline-offset-2' : undefined}
          >
            {pill.text}
          </kbd>
        </span>
      ))}
    </span>
  );
}
