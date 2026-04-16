// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { ShortcutRow } from '../../src/renderer/components/ShortcutRow';
import { makeShortcut } from '../helpers';

const mockShortcut = makeShortcut({ context: 'editorTextFocus' });

describe('ShortcutRow', () => {
  it('renders command name and source', () => {
    render(
      <ShortcutRow shortcut={mockShortcut} selected={false} dataIndex={0} />,
    );
    expect(screen.getByText('Save File')).toBeInTheDocument();
    expect(screen.getByText('VS Code')).toBeInTheDocument();
  });

  it('renders context badge when context exists', () => {
    render(
      <ShortcutRow shortcut={mockShortcut} selected={false} dataIndex={0} />,
    );
    expect(screen.getByText('editorTextFocus')).toBeInTheDocument();
  });

  it('hides source when showSource is false', () => {
    render(
      <ShortcutRow
        shortcut={mockShortcut}
        selected={false}
        dataIndex={0}
        showSource={false}
      />,
    );
    expect(screen.queryByText('VS Code')).not.toBeInTheDocument();
  });
});
