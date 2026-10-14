interface SectionHeaderProps {
  title: string;
  count: number;
  totalCount?: number;
  showAll?: boolean;
  onToggleShowAll?: () => void;
}

export function SectionHeader({
  title,
  count,
  totalCount,
  showAll,
  onToggleShowAll,
}: SectionHeaderProps) {
  const hasMore = totalCount !== undefined && totalCount > count && !showAll;

  return (
    <div role="presentation" style={{ padding: '2px 28px 8px' }} className="flex items-center justify-between">
      <span className="text-[12px] font-medium tracking-wider text-white/25">
        {title}
      </span>
      <div className="flex items-center gap-3">
        {hasMore && onToggleShowAll && (
          <button
            onClick={onToggleShowAll}
            className="text-[12px] text-white/20 transition-colors hover:text-white/40"
          >
            Show all {totalCount}
          </button>
        )}
        <span className="text-[12px] text-white/15">{count} {title.toLowerCase()}</span>
      </div>
    </div>
  );
}
