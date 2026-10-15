import { ChevronRight } from 'lucide-react';
import type { Command } from '../../shared/types';
import { Row } from './Row';
import { SourceIcon } from './SourceIcon';

interface CommandRowProps {
  command: Command;
  selected: boolean;
  dataIndex: number;
  copyFlash?: boolean;
}

export function CommandRow({ command, selected, dataIndex, copyFlash }: CommandRowProps) {
  return (
    <Row dataIndex={dataIndex} selected={selected} copyFlash={copyFlash} testId="command-row">
      <SourceIcon id="commands" label="Shell" />
      <span className="shrink-0 font-mono text-[13px] font-medium text-fg">{command.name}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{command.description}</span>
      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-4" />
    </Row>
  );
}
