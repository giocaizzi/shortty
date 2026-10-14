import type { ForgeConfig } from '@electron-forge/shared-types';
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
  makers: [
    new MakerSquirrel({}),
    new MakerDMG({ icon: 'src/assets/icon.icns', format: 'ULFO' }, ['darwin']),
    new MakerZIP({}, ['darwin']),
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
