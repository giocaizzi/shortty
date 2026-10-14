interface SectionHeaderProps {
  title: string;
  /** Number of matches in the section, shown on the right. */
  count?: number;
}

export function SectionHeader({ title, count }: SectionHeaderProps) {
  return (
    <div
      role="presentation"
      className="flex items-baseline justify-between px-2.5 pb-1.5 pt-3 text-[11px] font-semibold text-fg-3"
    >
      <span>{title}</span>
      {count !== undefined && (
        <span className="font-medium tabular-nums text-fg-4">{count}</span>
      )}
    </div>
  );
}
