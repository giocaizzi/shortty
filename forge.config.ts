import { execFileSync } from 'node:child_process';
import type { ForgeConfig, ForgeMakeResult } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Signing and notarization are opt-in via env vars only; unset means an
// unsigned build (see docs/runbooks/release-macos.md).
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY;
const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
const canNotarize = Boolean(
  signingIdentity && APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID,
);

// The DMG maker neither signs nor notarizes the disk image (only the .app
// inside is), so Gatekeeper would check it online on first open. Sign it,
// notarize it and staple the ticket, with the same env gates as the app.
function signDmg(dmg: string): void {
  if (!signingIdentity) return;
  execFileSync('codesign', ['--sign', signingIdentity, '--timestamp', dmg], { stdio: 'inherit' });
  if (!canNotarize) return;
  // Parse the status: an Invalid submission must fail the build.
  const output = execFileSync(
    'xcrun',
    [
      'notarytool', 'submit', dmg, '--wait', '--output-format', 'json',
      '--apple-id', APPLE_ID as string,
      '--password', APPLE_APP_SPECIFIC_PASSWORD as string,
      '--team-id', APPLE_TEAM_ID as string,
    ],
    { encoding: 'utf8' },
  );
  const { id, status } = JSON.parse(output) as { id?: string; status?: string };
  if (status !== 'Accepted') {
    throw new Error(`Notarization of ${dmg} ended as ${status ?? 'unknown'} (xcrun notarytool log ${id ?? '<id>'})`);
  }
  execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Shortty',
    executableName: 'shortty',
    appBundleId: 'com.shortty.app',
    icon: 'src/assets/icon',
    extraResource: [
      'src/assets/tray-iconTemplate.png',
      'src/assets/tray-iconTemplate@2x.png',
      // Windows and Linux tray icons (src/main/tray.ts).
      'src/assets/icon.ico',
      'src/assets/icon.png',
    ],
    extendInfo: {
      LSUIElement: true,
    },
    ...(signingIdentity ? { osxSign: { identity: signingIdentity } } : {}),
    ...(canNotarize
      ? {
          osxNotarize: {
            appleId: APPLE_ID as string,
            appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD as string,
            teamId: APPLE_TEAM_ID as string,
          },
        }
      : {}),
  },
  rebuildConfig: {},
  hooks: {
    postMake: async (_config, results: ForgeMakeResult[]) => {
      for (const result of results) {
        if (result.platform !== 'darwin') continue;
        for (const artifact of result.artifacts) if (artifact.endsWith('.dmg')) signDmg(artifact);
      }
      return results;
    },
  },
  makers: [
    // Installs per user into %LOCALAPPDATA%\shortty (src/main/login-item.ts, docs/runbooks/reset-settings.md).
    new MakerSquirrel({
      name: 'shortty',
      setupIcon: 'src/assets/icon.ico',
      // Shown in Apps & features; Squirrel needs a URL, not a path.
      iconUrl: 'https://raw.githubusercontent.com/giocaizzi/shortty/main/src/assets/icon.ico',
    }),
    new MakerDMG({ icon: 'src/assets/icon.icns', format: 'ULFO' }, ['darwin']),
    new MakerZIP({}, ['darwin', 'win32']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
        {
          name: 'preferences_window',
          config: 'vite.preferences.config.mts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
