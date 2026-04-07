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
      style={{ padding: '16px 28px' }}
      className={`
        flex items-center gap-4
        rounded-xl
        transition-colors
        ${selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}
      `}
    >
      <span className="text-lg">{icon}</span>
      <span className="truncate text-[15px] font-semibold text-white/90">{label}</span>
      <span className="ml-auto text-[12px] text-white/20">{count} shortcuts</span>
      <span className="text-[12px] text-white/15">{'>'}</span>
    </div>
  );
}
