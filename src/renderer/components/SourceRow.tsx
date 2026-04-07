interface SourceRowProps {
  icon: string;
  label: string;
  count: number;
  selected: boolean;
  dataIndex: number;
}

export function SourceRow({
  icon,
  label,
  count,
  selected,
  dataIndex,
}: SourceRowProps) {
  return (
    <div
      data-index={dataIndex}
      role="option"
      aria-selected={selected}
      className={`
        mx-1.5 flex items-center gap-3
        rounded-md px-3.5 py-[5px] text-[13px]
        transition-colors
        ${selected ? 'bg-white/10' : 'hover:bg-white/6'}
      `}
    >
      <span className="text-base">{icon}</span>
      <span className="truncate text-white/80">{label}</span>
      <span className="ml-auto text-[11px] text-white/30">{count}</span>
      <span className="text-[10px] text-white/20">{'>'}</span>
    </div>
  );
}
