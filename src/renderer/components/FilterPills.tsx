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
      className="relative z-10 flex shrink-0 gap-2 overflow-x-auto border-b border-white/6 bg-white/5 px-5 py-3"
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
        shrink-0 rounded-full px-3.5 py-1.5
        text-[11px] font-medium tracking-wide
        transition-colors
        ${
          active
            ? 'bg-white/15 text-white'
            : 'text-white/40 hover:bg-white/8 hover:text-white/60'
        }
      `}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {label}
    </button>
  );
}
