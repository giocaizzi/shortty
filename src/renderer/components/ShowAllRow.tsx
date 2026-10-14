import { ChevronDown } from 'lucide-react';
import { Row } from './Row';
import { plural, type ResultSection } from './result-rows';

const NOUNS: Record<ResultSection, string> = {
  sources: 'source',
  shortcuts: 'shortcut',
  commands: 'command',
};

interface ShowAllRowProps {
  section: ResultSection;
  total: number;
  selected: boolean;
  dataIndex: number;
}

/** Selectable "Show all N" row closing a truncated section (SCREENS §8.5). */
export function ShowAllRow({ section, total, selected, dataIndex }: ShowAllRowProps) {
  return (
    <Row dataIndex={dataIndex} selected={selected} testId="show-all-row">
      <span className="w-5 shrink-0" aria-hidden="true" />
      <span className="text-[13px] text-fg-3">Show all {plural(total, NOUNS[section])}</span>
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-4" />
    </Row>
  );
}
