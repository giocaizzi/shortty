import { watch, type FSWatcher } from 'chokidar';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ParserRegistry } from './parsers/registry';

let watcher: FSWatcher | null = null;

export function startWatching(
  registry: ParserRegistry,
  window: BrowserWindow,
): void {
  const watchPathsMap = registry.getWatchPaths();
  const pathToSource = new Map<string, string>();

  for (const [sourceId, paths] of watchPathsMap) {
    for (const p of paths) {
      pathToSource.set(p, sourceId);
    }
  }

  const allPaths = Array.from(pathToSource.keys());
  if (allPaths.length === 0) return;

  watcher = watch(allPaths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  watcher.on('change', async (changedPath) => {
    const sourceId = pathToSource.get(changedPath);
    if (!sourceId) return;

    const keybindings = await registry.parseSource(sourceId);

    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.ON_UPDATE, {
        sourceId,
        keybindings,
      });
    }
  });
}

export function stopWatching(): void {
  watcher?.close();
  watcher = null;
}

export function restartWatching(
  registry: ParserRegistry,
  window: BrowserWindow,
): void {
  stopWatching();
  startWatching(registry, window);
}
