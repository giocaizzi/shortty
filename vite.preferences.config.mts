import { defineConfig, mergeConfig } from 'vite';
import rendererConfig from './vite.renderer.config.mts';

// Preferences window: same plugins as the launcher, but built from
// preferences.html (Vite's default entry, index.html, is the launcher).
export default mergeConfig(
  rendererConfig,
  defineConfig({
    build: {
      rollupOptions: {
        input: 'preferences.html',
      },
    },
  }),
);
