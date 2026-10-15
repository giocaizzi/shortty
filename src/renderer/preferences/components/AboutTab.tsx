/// <reference types="vite/client" />
import { useEffect, useState } from 'react';
import type { AboutLink, AppInfo } from '../../../shared/types';
import iconUrl from '../../../assets/icon.svg';
import { PaneHeader, Row, Section } from './controls';
import { UpdatesSection, type GeneralTabProps } from './GeneralTab';

const LINKS: { link: AboutLink; label: string }[] = [
  { link: 'releaseNotes', label: 'Release Notes' },
  { link: 'repo', label: 'GitHub' },
  { link: 'issues', label: 'Report an Issue' },
  { link: 'license', label: 'License' },
];

/** One line per fact, pasted into bug reports. */
export function versionInfoText(info: AppInfo): string {
  return [
    `Shortty ${info.version} (${info.arch})`,
    info.os,
    `Electron ${info.electron}, Chromium ${info.chrome}, Node ${info.node}`,
  ].join('\n');
}

export function AboutTab({ settings, onUpdate }: GeneralTabProps) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.electronAPI.getAppInfo().then(setInfo).catch(() => undefined);
  }, []);

  const copy = async () => {
    if (!info) return;
    await navigator.clipboard.writeText(versionInfoText(info));
    setCopied(true);
  };

  return (
    <div className="pf-pane">
      <PaneHeader title="About" />
      <div className="pf-about-hero">
        <img src={iconUrl} alt="" width={64} height={64} />
        <div className="pf-about-name">Shortty</div>
        {info && (
          <div className="pf-about-version" data-testid="about-version">
            Version {info.version} ({info.arch})
          </div>
        )}
        <div className="pf-about-links">
          {LINKS.map(({ link, label }) => (
            <button key={link} type="button" className="pf-button" onClick={() => window.electronAPI.openAboutLink(link)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <UpdatesSection settings={settings} onUpdate={onUpdate} />

      {info && (
        <Section label="System">
          <Row
            label={info.os}
            description={`Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`}
            control={
              <button type="button" className="pf-button" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy Version Info'}
              </button>
            }
          />
        </Section>
      )}
    </div>
  );
}
