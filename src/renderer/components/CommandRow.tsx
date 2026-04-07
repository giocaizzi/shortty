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
      className={`
        mx-1.5 flex items-center gap-3
        rounded-md px-3.5 py-[5px] text-[13px]
        transition-colors
        ${copyFlash ? 'copy-flash' : ''}
        ${selected ? 'bg-white/10' : 'hover:bg-white/6'}
      `}
    >
      <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white/80">
        {command.name}
      </span>
      <span className="truncate text-white/50">{command.description}</span>
      <span className="ml-auto text-[10px] text-white/20">{'>'}</span>
    </div>
  );
}
