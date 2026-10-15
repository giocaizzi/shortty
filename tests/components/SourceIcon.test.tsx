// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { SourceIcon } from '../../src/renderer/components/SourceIcon';

const PNG = 'data:image/png;base64,AAAA';
const getIcon = vi.fn(async (kind: string, name: string) =>
  (kind === 'source' && name === 'chrome') || (kind === 'command' && name === 'code') ? PNG : null,
);

beforeEach(() => {
  (window as unknown as { electronAPI: unknown }).electronAPI = { getIcon };
});

describe('SourceIcon precedence: app icon > brand glyph > monogram', () => {
  it('shows the app icon main found for a source', async () => {
    const { container } = render(<SourceIcon id="chrome" label="Chrome" />);
    // Brand glyph until the icon arrives, so the row never renders empty.
    expect(container.querySelector('[data-icon="brand"]')).toHaveAttribute('data-brand', 'Google Chrome');
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', PNG));
    expect(getIcon).toHaveBeenCalledWith('source', 'chrome');
  });

  it('falls back to the brand glyph when the app is not installed', async () => {
    const { container } = render(<SourceIcon id="tmux" label="tmux" />);
    await waitFor(() => expect(getIcon).toHaveBeenCalledWith('source', 'tmux'));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-icon="brand"] svg path')).toBeInTheDocument();
  });

  it('falls back to the monogram without a glyph or an app', () => {
    const { container } = render(<SourceIcon id="vscode" label="VS Code" />);
    expect(container.querySelector('[data-source-icon="vscode"]')).toHaveAttribute('data-glyph', 'VS');
  });

  it('prefers a command glyph over the bundle it ships in, without asking main', () => {
    const { container } = render(<SourceIcon id="commands" label="Shell" command="kubectl" />);
    expect(container.querySelector('[data-brand]')).toHaveAttribute('data-brand', 'Kubernetes');
    expect(getIcon).not.toHaveBeenCalledWith('command', 'kubectl');
  });

  it('asks main for commands without a glyph (code → VS Code.app)', async () => {
    const { container } = render(<SourceIcon id="commands" label="Shell" command="code" />);
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', PNG));
  });

  it('keeps the shell tile for unknown commands', () => {
    const { container } = render(<SourceIcon id="commands" label="Shell" command="frobnicate" />);
    expect(container.querySelector('[data-source-icon="commands"]')).toHaveAttribute('data-glyph', '>_');
  });
});
