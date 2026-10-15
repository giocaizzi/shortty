// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { AboutTab, versionInfoText } from '../../../src/renderer/preferences/components/AboutTab';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings';
import { installMockApi } from './mockApi';

describe('AboutTab', () => {
  it('shows the running version and opens the fixed links', async () => {
    const { api } = installMockApi();
    render(<AboutTab settings={DEFAULT_SETTINGS} onUpdate={vi.fn(async () => ({ success: true }))} />);
    expect(await screen.findByTestId('about-version')).toHaveTextContent('Version 0.2.1 (arm64)');
    fireEvent.click(screen.getByRole('button', { name: 'Release Notes' }));
    expect(api.openAboutLink).toHaveBeenCalledWith('releaseNotes');
  });

  it('copies version info for bug reports', async () => {
    installMockApi();
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AboutTab settings={DEFAULT_SETTINGS} onUpdate={vi.fn(async () => ({ success: true }))} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy Version Info' }));
    expect(writeText).toHaveBeenCalledWith(
      'Shortty 0.2.1 (arm64)\nmacOS 26.0\nElectron 44.7.0, Chromium 150.0.0.0, Node 24.0.0',
    );
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('formats one fact per line', () => {
    expect(
      versionInfoText({ version: '1.0.0', arch: 'x64', platform: 'win32', os: 'Windows 10.0.26100', electron: '1', chrome: '2', node: '3' }),
    ).toBe('Shortty 1.0.0 (x64)\nWindows 10.0.26100\nElectron 1, Chromium 2, Node 3');
  });
});
