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
      style={{ padding: '12px 28px' }}
      className={`
        flex items-center gap-5
        rounded-xl
        transition-colors
        ${copyFlash ? 'copy-flash' : ''}
        ${selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}
      `}
    >
      {/* Left: stacked content */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="truncate text-[15px] font-semibold text-white/90">{shortcut.command}</span>
          {shortcut.context && (
            <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/30">
              {shortcut.context}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white/35">
            {shortcut.rawCommand}
          </span>
          {showSource && (
            <span className="text-[11px] text-white/20">
              {shortcut.sourceLabel}
            </span>
          )}
        </div>
      </div>

      {/* Right: key combo */}
      <KeyCombo keys={shortcut.key} />
    </div>
  );
}
