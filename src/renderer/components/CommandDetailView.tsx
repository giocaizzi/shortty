import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Command, FlagDetail } from '../../shared/types';
import { Row } from './Row';
import { SectionHeader } from './SectionHeader';
import { SourceIcon } from './SourceIcon';
import { useCommandEnrichment } from '../hooks/useCommandEnrichment';
import { buildDetailGroups, type DetailData, type DetailGroup, type DetailRow } from './detail-rows';

export { getDetailItemCount, getDetailCopyText, isSubcommandAtIndex } from './detail-rows';

interface CommandDetailViewProps {
  data: DetailData;
  filterQuery: string;
  selectedIndex: number;
  copyFlashIndex: number | null;
  loading?: boolean;
}

const ENRICHMENT_SOURCES: Record<NonNullable<Command['enrichedFrom']>, string> = {
  man: 'man page',
  help: '--help',
  'zsh-completion': 'zsh completion',
  'bash-completion': 'bash completion',
};

/** A group longer than this shows its first COLLAPSED_ROWS rows and "Show all" (docs/screens.md §2.3). */
const COLLAPSE_OVER = 40;
const COLLAPSED_ROWS = 25;
const SEE_ALSO_COLLAPSED = 6;

function Placeholder({ children }: { children: string }) {
  return (
    <div className="flex flex-1 items-center justify-center pb-10 text-[13px] text-fg-3">
      {children}
    </div>
  );
}

/** Small pill after a row's text: default value, allowed values, required, deprecated. */
function Badge({ children, tone = 'quiet', title }: { children: string; tone?: 'quiet' | 'warning'; title?: string }) {
  return (
    <span
      title={title}
      className={`max-w-[180px] shrink-0 truncate rounded-[5px] px-1.5 py-px text-[11px] font-medium ${
        tone === 'warning' ? 'bg-warning-fill text-warning' : 'bg-fill-quiet text-fg-3'
      }`}
    >
      {children}
    </span>
  );
}

function FlagBadges({ flag }: { flag: FlagDetail }) {
  return (
    <>
      {flag.required && <Badge tone="warning">required</Badge>}
      {flag.deprecated && <Badge>deprecated</Badge>}
      {flag.choices && (
        <Badge title={flag.choices.join(' | ')}>
          {flag.choices.length > 4 ? `${flag.choices.slice(0, 4).join(' | ')} …` : flag.choices.join(' | ')}
        </Badge>
      )}
      {flag.default !== undefined && <Badge title={`default: ${flag.default}`}>{`= ${flag.default}`}</Badge>}
    </>
  );
}

function RowContent({ row }: { row: DetailRow }) {
  switch (row.kind) {
    case 'argument': {
      const arg = row.argument;
      return (
        <>
          <span className="shrink-0 font-mono text-[13px] font-medium text-fg">
            {'<'}{arg.name}{'>'}
          </span>
          {arg.variadic && <span className="shrink-0 font-mono text-[12px] text-fg-3">...</span>}
          <span
            className={`shrink-0 rounded-[5px] px-1.5 py-px text-[11px] font-medium ${
              arg.required ? 'bg-warning-fill text-warning' : 'bg-fill-quiet text-fg-3'
            }`}
          >
            {arg.required ? 'required' : 'optional'}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{arg.description}</span>
        </>
      );
    }
    case 'subcommand': {
      const sc = row.subcommand;
      return (
        <>
          <span className={`shrink-0 font-mono text-[13px] font-medium ${sc.deprecated ? 'text-fg-3' : 'text-fg'}`}>{sc.name}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{sc.description}</span>
          {sc.deprecated && <Badge>deprecated</Badge>}
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-4" />
        </>
      );
    }
    case 'example': {
      const ex = row.example;
      return (
        <span className="flex min-w-0 flex-1 flex-col justify-center leading-tight" title={ex.command}>
          <span className="truncate font-mono text-[12.5px] text-fg">{ex.command}</span>
          {ex.description && <span className="truncate text-[11.5px] text-fg-3">{ex.description}</span>}
        </span>
      );
    }
    case 'flag': {
      const flag = row.flag;
      return (
        <>
          <span className={`flex shrink-0 items-baseline gap-1 font-mono text-[13px] font-medium ${flag.deprecated ? 'text-fg-3' : 'text-fg'}`}>
            {flag.short && <span>{flag.short}</span>}
            {flag.short && flag.long && <span className="-ml-1 text-fg-4">,</span>}
            {flag.long && <span>{flag.long}</span>}
            {flag.arg && <span className="font-normal italic text-fg-3">{flag.arg}</span>}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{flag.description}</span>
          <FlagBadges flag={flag} />
        </>
      );
    }
    case 'environment':
      return (
        <>
          <span className="shrink-0 font-mono text-[13px] font-medium text-fg">{row.variable.name}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{row.variable.description}</span>
        </>
      );
  }
}

const ROW_TEST_IDS: Record<DetailRow['kind'], string> = {
  argument: 'argument-row',
  subcommand: 'subcommand-row',
  example: 'example-row',
  flag: 'flag-row',
  environment: 'env-row',
};

function rowKey(row: DetailRow, index: number): string {
  switch (row.kind) {
    case 'argument':
      return `a:${row.argument.name}`;
    case 'subcommand':
      return `s:${row.subcommand.name}`;
    case 'environment':
      return `e:${row.variable.name}`;
    default:
      return `${row.kind}:${index}`;
  }
}

function ShowAllButton({ total, onClick }: { total: number; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="detail-show-all"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-1.5 rounded-[9px] px-2.5 text-left text-[12px] text-fg-3 hover:bg-fill-hover"
    >
      Show all {total}
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-fg-4" />
    </button>
  );
}

export function CommandDetailView({
  data,
  filterQuery,
  selectedIndex,
  copyFlashIndex,
  loading,
}: CommandDetailViewProps) {
  const groups = useMemo(
    () => buildDetailGroups(data, filterQuery),
    [data, filterQuery],
  );
  // Groups the user expanded, reset when the view shows another command
  const [expanded, setExpanded] = useState<{ data: DetailData; keys: Set<string> }>({ data, keys: new Set() });
  const expandedKeys = expanded.data === data ? expanded.keys : new Set<string>();
  const expand = (key: string) => setExpanded({ data, keys: new Set([...expandedKeys, key]) });
  const seeAllLinks = expandedKeys.has('seeAlso');

  const isEnriching = data.enrichment === 'basic' || data.enrichment === 'none';
  // Drilled into a command the background worker has not reached: enrich it now
  useCommandEnrichment(data.enrichment === 'basic' && data.name ? data.name : null);

  const itemCount = groups.reduce((n, g) => n + g.rows.length, 0);

  if (loading) return <Placeholder>Loading...</Placeholder>;

  /** Rows of a group to render: all when short, filtered, expanded, or when the selection is past the cut. */
  const visibleRows = (group: DetailGroup): number => {
    if (filterQuery || group.rows.length <= COLLAPSE_OVER || expandedKeys.has(group.key)) return group.rows.length;
    if (selectedIndex >= group.offset + COLLAPSED_ROWS && selectedIndex < group.offset + group.rows.length) return group.rows.length;
    return COLLAPSED_ROWS;
  };

  const seeAlso = data.seeAlso ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: what this command is */}
      <div className="shrink-0 space-y-2 px-[18px] pb-2 pt-1">
        <div className="flex items-center gap-2.5">
          {data.name && <SourceIcon id="commands" label="Shell" command={data.name.split(' ')[0]} />}
          {(data.description || isEnriching) && (
            <p className="min-w-0 text-[13px] leading-snug text-fg-2">
              {data.description}
              {isEnriching && itemCount > 0 && <span className="ml-2 text-[12px] text-fg-4">— Enriching...</span>}
            </p>
          )}
        </div>
        {data.aliases && data.aliases.length > 0 && (
          <p data-testid="detail-aliases" className="flex flex-wrap items-baseline gap-1.5 text-[12px] text-fg-3">
            <span>{data.aliases.length > 1 ? 'Aliases' : 'Alias'}</span>
            {data.aliases.map(alias => (
              <span key={alias} className="rounded-[5px] bg-fill-quiet px-1.5 py-px font-mono text-[11.5px] text-fg-2">{alias}</span>
            ))}
          </p>
        )}
        {data.synopsis && (
          <pre className="max-h-[4.6em] overflow-y-auto whitespace-pre-wrap break-words rounded-[8px] bg-fill-quiet px-3 py-2 font-mono text-[12px] leading-relaxed text-fg-2">
            {data.synopsis}
          </pre>
        )}
        {data.longDescription && data.longDescription !== data.description && (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-fg-3">{data.longDescription}</p>
        )}
      </div>

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => {
          const shown = visibleRows(group);
          return (
            <div key={group.key} role="group" aria-label={group.title}>
              <SectionHeader title={group.title} count={group.rows.length} />
              {group.rows.slice(0, shown).map((row, i) => {
                const idx = group.offset + i;
                return (
                  <Row
                    key={rowKey(row, idx)}
                    dataIndex={idx}
                    selected={idx === selectedIndex}
                    copyFlash={copyFlashIndex === idx}
                    testId={ROW_TEST_IDS[row.kind]}
                  >
                    <RowContent row={row} />
                  </Row>
                );
              })}
              {shown < group.rows.length && <ShowAllButton total={group.rows.length} onClick={() => expand(group.key)} />}
            </div>
          );
        })}

        {itemCount === 0 && filterQuery && (
          <div className="flex items-center justify-center py-8 text-[13px] text-fg-3">
            No matches for &ldquo;{filterQuery}&rdquo;
          </div>
        )}

        {itemCount === 0 && !filterQuery && (
          <div
            data-testid={isEnriching ? 'detail-enriching' : undefined}
            role={isEnriching ? 'status' : undefined}
            className="flex items-center justify-center py-8 text-[13px] text-fg-3"
          >
            {isEnriching ? 'Enriching...' : 'No subcommands or flags documented'}
          </div>
        )}

        {seeAlso.length > 0 && !filterQuery && (
          <div data-testid="detail-see-also">
            <SectionHeader title="See also" />
            <ul className="space-y-0.5 px-2.5 text-[12px] text-fg-3">
              {(seeAllLinks ? seeAlso : seeAlso.slice(0, SEE_ALSO_COLLAPSED)).map(item => (
                <li key={item} className="select-text break-words">{item}</li>
              ))}
            </ul>
            {!seeAllLinks && seeAlso.length > SEE_ALSO_COLLAPSED && (
              <ShowAllButton total={seeAlso.length} onClick={() => expand('seeAlso')} />
            )}
          </div>
        )}

        {data.enrichedFrom && (
          <p data-testid="detail-source" className="px-2.5 pt-3 text-[11px] text-fg-4">
            Source: {ENRICHMENT_SOURCES[data.enrichedFrom]}
          </p>
        )}
      </div>
    </div>
  );
}
