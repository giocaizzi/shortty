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
    <div role="presentation" className="sticky top-0 flex items-center justify-between bg-black/20 px-5 py-1.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
          {title}
        </span>
        <span className="text-[10px] text-white/25">{count}</span>
      </div>
      {hasMore && onToggleShowAll && (
        <button
          onClick={onToggleShowAll}
          className="text-[10px] text-white/30 hover:text-white/50"
        >
          Show all {totalCount}
        </button>
      )}
    </div>
  );
}
