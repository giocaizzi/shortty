import type { Command } from '../../shared/types';

interface CommandRowProps {
  command: Command;
  selected: boolean;
  dataIndex: number;
  copyFlash?: boolean;
}

export function CommandRow({
  command,
  selected,
  dataIndex,
  copyFlash,
}: CommandRowProps) {
  return (
    <div
      data-index={dataIndex}
      role="option"
      aria-selected={selected}
      style={{ padding: '16px 28px' }}
      className={`
        flex items-center gap-5
        rounded-xl
        transition-colors
        ${copyFlash ? 'copy-flash' : ''}
        ${selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}
      `}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[15px] font-semibold text-white/90">{command.name}</span>
        {command.description && (
          <span className="truncate text-[12px] text-white/35">{command.description}</span>
        )}
      </div>
      <span className="shrink-0 text-[11px] text-white/15">{'>'}</span>
    </div>
  );
}
