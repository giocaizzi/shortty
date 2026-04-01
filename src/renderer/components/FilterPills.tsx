import type { ParserMeta } from '../../shared/types';

interface FilterPillsProps {
  sources: ParserMeta[];
  activeFilter: string | null;
  onFilterChange: (sourceId: string | null) => void;
}

export function FilterPills({
  sources,
  activeFilter,
  onFilterChange,
}: FilterPillsProps) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto border-b border-white/10 px-4 py-2"
      role="tablist"
      aria-label="Filter by source"
    >
      <PillButton
        active={activeFilter === null}
        onClick={() => onFilterChange(null)}
        label="All"
      />
      {sources.map((source) => (
        <PillButton
          key={source.id}
          active={activeFilter === source.id}
          onClick={() =>
            onFilterChange(activeFilter === source.id ? null : source.id)
          }
          label={source.label}
          icon={source.icon}
        />
      ))}
    </div>
  );
}

function PillButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`
        shrink-0 rounded-full px-3 py-1 text-xs font-medium
        transition-colors
        ${
          active
            ? 'bg-white/25 text-neutral-900 dark:bg-white/15 dark:text-neutral-100'
            : 'text-neutral-500 hover:bg-white/10 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
        }
      `}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {label}
    </button>
  );
}
