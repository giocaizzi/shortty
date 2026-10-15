import { watch, type FSWatcher } from 'chokidar';
import type { BrowserWindow } from 'electron';
import log from './logger';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ParserRegistry } from './parsers/registry';
import { pathKey } from './utils/path-key';

let watcher: FSWatcher | null = null;

/**
 * Watch every parser's config files and push re-parsed shortcuts to the
 * launcher. The window is looked up at send time, so a launcher recreated
 * after startup still receives updates.
 */
export function startWatching(
  registry: ParserRegistry,
  getWindow: () => BrowserWindow | null,
): void {
  const watchPathsMap = registry.getWatchPaths();
  const pathToSource = new Map<string, string>();

  for (const [sourceId, paths] of watchPathsMap) {
    for (const p of paths) {
      pathToSource.set(pathKey(p), sourceId);
    }
  }

  const allPaths = Array.from(new Set(Array.from(watchPathsMap.values()).flat()));
  if (allPaths.length === 0) {
    log.debug('File watcher: no paths to watch');
    return;
  }

  log.info(`File watcher started: watching ${allPaths.length} paths`);

  watcher = watch(allPaths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  // 'add'/'unlink' cover config files created or removed after startup.
  const onEvent = async (changedPath: string) => {
    // chokidar may report another spelling of a watched path (separators, case on Windows).
    const sourceId = pathToSource.get(pathKey(changedPath));
    if (!sourceId) return;

    log.info(`Config changed: ${sourceId} (${changedPath})`);

    try {
      const keybindings = await registry.parseSingleSource(sourceId);

      const window = getWindow();
      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.ON_UPDATE, {
          sourceId,
          keybindings,
        });
      }
    } catch (err) {
      log.error(`Failed to re-parse ${sourceId} after file change`, err);
    }
  };
  watcher.on('change', onEvent);
  watcher.on('add', onEvent);
  watcher.on('unlink', onEvent);
}

export function stopWatching(): void {
  watcher?.close();
  watcher = null;
}

export function restartWatching(
  registry: ParserRegistry,
  getWindow: () => BrowserWindow | null,
): void {
  stopWatching();
  startWatching(registry, getWindow);
}
