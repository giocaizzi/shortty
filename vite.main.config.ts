import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron-store', 'electron-log', 'electron-log/main', 'chokidar'],
    },
  },
});
