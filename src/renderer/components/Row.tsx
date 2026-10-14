import type { ReactNode } from 'react';

interface RowProps {
  dataIndex: number;
  selected: boolean;
  copyFlash?: boolean;
  testId: string;
  children: ReactNode;
}

/** DOM id of the option at `index`, for aria-activedescendant. */
export function optionId(index: number): string {
  return `option-${index}`;
}

/**
 * Shared anatomy of every selectable launcher row: 40px tall, 10px inner
 * padding, 9px radius; selection is a neutral fill, a copy flashes it green.
 */
export function Row({ dataIndex, selected, copyFlash, testId, children }: RowProps) {
  return (
    <div
      id={optionId(dataIndex)}
      data-index={dataIndex}
      data-testid={testId}
      role="option"
      aria-selected={selected}
      className={[
        'flex h-10 items-center gap-2.5 rounded-[9px] px-2.5',
        selected ? 'bg-fill-selected' : 'hover:bg-fill-hover',
        copyFlash ? 'copy-flash' : '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
