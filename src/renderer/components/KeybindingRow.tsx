import type { Keybinding } from '../../shared/types';
import { KeyCombo } from './KeyCombo';

interface KeybindingRowProps {
  keybinding: Keybinding;
  selected: boolean;
  dataIndex: number;
}

export function KeybindingRow({
  keybinding,
  selected,
  dataIndex,
}: KeybindingRowProps) {
  return (
    <div
      data-index={dataIndex}
      role="option"
      aria-selected={selected}
      className={`
        flex items-center justify-between gap-4 px-4 py-2 text-sm
        transition-colors
        ${
          selected
            ? 'bg-white/20 dark:bg-white/10'
            : 'hover:bg-white/10 dark:hover:bg-white/5'
        }
      `}
    >
      <div className="flex items-center gap-3">
        <KeyCombo keys={keybinding.key} />
        <span className="text-neutral-700 dark:text-neutral-200">
          {keybinding.command}
        </span>
      </div>
      {keybinding.context && (
        <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] text-neutral-400 dark:bg-white/8">
          {keybinding.context}
        </span>
      )}
    </div>
  );
}
