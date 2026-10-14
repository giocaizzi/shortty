import type { Shortcut } from '../../shared/types';
import { KeyCombo } from './KeyCombo';
import { Row } from './Row';
import { SourceIcon } from './SourceIcon';

interface ShortcutRowProps {
  shortcut: Shortcut;
  selected: boolean;
  dataIndex: number;
  /** Source icon and label; hidden when drilled into the source (docs/screens.md §8.2). */
  showSource?: boolean;
  copyFlash?: boolean;
}

export function ShortcutRow({
  shortcut,
  selected,
  dataIndex,
  showSource = true,
  copyFlash,
}: ShortcutRowProps) {
  return (
    <Row dataIndex={dataIndex} selected={selected} copyFlash={copyFlash} testId="shortcut-row">
      {showSource && <SourceIcon id={shortcut.source} label={shortcut.sourceLabel} />}
      <span className="max-w-[60%] shrink-0 truncate text-[14px] font-medium text-fg">
        {shortcut.command}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-4">
        {shortcut.rawCommand !== shortcut.command ? shortcut.rawCommand : ''}
      </span>
      {shortcut.context && (
        <span className="max-w-[140px] shrink-0 truncate rounded-[5px] bg-fill-quiet px-1.5 py-px text-[11px] text-fg-3">
          {shortcut.context}
        </span>
      )}
      {showSource && <span className="shrink-0 text-[12px] text-fg-3">{shortcut.sourceLabel}</span>}
      <span className="keys shrink-0">
        <KeyCombo
          keys={shortcut.isUnbound ? '' : shortcut.key}
          strokes={shortcut.isUnbound ? undefined : shortcut.strokes}
        />
      </span>
    </Row>
  );
}
