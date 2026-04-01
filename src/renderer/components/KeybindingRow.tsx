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
      title={keybinding.context ?? undefined}
      className={`
        mx-2 flex items-center gap-4
        rounded-lg px-3 py-2.5 text-[13px]
        transition-colors
        ${
          selected
            ? 'bg-white/10'
            : 'hover:bg-white/6'
        }
      `}
    >
      <KeyCombo keys={keybinding.key} />
      <span className="truncate text-white/80">
        {keybinding.command}
      </span>
    </div>
  );
}
