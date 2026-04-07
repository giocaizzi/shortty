import type { Shortcut } from '../../shared/types';
import { KeyCombo } from './KeyCombo';

interface ShortcutRowProps {
  shortcut: Shortcut;
  selected: boolean;
  dataIndex: number;
  showSource?: boolean;
  copyFlash?: boolean;
}

export function ShortcutRow({
  shortcut,
  selected,
  dataIndex,
  showSource = true,
  copyFlash,
}: ShortcutRowProps) {
  return (
    <div
      data-index={dataIndex}
      role="option"
      aria-selected={selected}
      title={shortcut.context ?? undefined}
      className={`
        mx-1.5 flex items-center gap-3
        rounded-md px-3.5 py-[5px] text-[13px]
        transition-colors
        ${copyFlash ? 'copy-flash' : ''}
        ${selected ? 'bg-white/10' : 'hover:bg-white/6'}
      `}
    >
      <KeyCombo keys={shortcut.key} />
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
        <span className="truncate text-white/80">{shortcut.command}</span>
        {shortcut.context && (
          <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/40">
            {shortcut.context}
          </span>
        )}
      </span>
      {showSource && (
        <span className="shrink-0 text-[11px] text-white/30">
          {shortcut.sourceLabel}
        </span>
      )}
    </div>
  );
}
