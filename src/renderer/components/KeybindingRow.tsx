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
        mx-2 flex items-center justify-between gap-4
        rounded-lg px-3 py-2.5 text-[13px]
        transition-colors
        ${
          selected
            ? 'bg-white/10'
            : 'hover:bg-white/6'
        }
      `}
    >
      <div className="flex items-center gap-4">
        <KeyCombo keys={keybinding.key} />
        <span className="text-white/80">
          {keybinding.command}
        </span>
      </div>
      {keybinding.context && (
        <span className="shrink-0 rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-white/25">
          {keybinding.context}
        </span>
      )}
    </div>
  );
}
