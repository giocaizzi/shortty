// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import type { ElectronAPI } from '../../src/preload/preload';
import { LauncherPanel } from '../../src/renderer/components/LauncherPanel';

let shown: (() => void) | undefined;

beforeEach(() => {
  window.electronAPI = {
    onWindowShown: vi.fn((cb: () => void) => {
      shown = cb;
      return vi.fn();
    }),
  } as unknown as ElectronAPI;
});

afterEach(() => {
  window.electronAPI = undefined as unknown as ElectronAPI;
});

describe('LauncherPanel', () => {
  it('re-applies the show animation on every window:shown', () => {
    render(<LauncherPanel onKeyDown={vi.fn()}>content</LauncherPanel>);
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('panel-enter');

    panel.classList.remove('panel-enter');
    act(() => shown?.());
    expect(panel).toHaveClass('panel-enter');
  });

  it('plays the hide animation while exiting', () => {
    render(
      <LauncherPanel onKeyDown={vi.fn()} exiting>
        content
      </LauncherPanel>,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('panel-exit');
    expect(panel).not.toHaveClass('panel-enter');
  });
});
