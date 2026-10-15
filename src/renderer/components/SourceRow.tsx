import { ChevronRight } from 'lucide-react';
import { Row } from './Row';
import { SourceIcon } from './SourceIcon';
import { plural } from './result-rows';

interface SourceRowProps {
  sourceId: string;
  label: string;
  count: number;
  selected: boolean;
  dataIndex: number;
}

export function SourceRow({ sourceId, label, count, selected, dataIndex }: SourceRowProps) {
  return (
    <Row dataIndex={dataIndex} selected={selected} testId="source-row">
      <SourceIcon id={sourceId} label={label} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{label}</span>
      <span className="shrink-0 text-[12px] tabular-nums text-fg-3">{plural(count, 'shortcut')}</span>
      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-4" />
    </Row>
  );
}
