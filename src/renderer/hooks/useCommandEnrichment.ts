import { useEffect } from 'react';
import { getElectronAPI } from '../lib/ipc';

/**
 * Ask main to enrich a command the user drilled into before the background
 * worker reached it. The enriched command comes back through
 * `onCommandsUpdate` (useCommands), so the detail view fills in on its own.
 * Pass null when the command is already enriched.
 */
export function useCommandEnrichment(name: string | null): void {
  useEffect(() => {
    if (!name) return;
    getElectronAPI()
      .getCommandDetail(name)
      .catch((err) => console.error(`Failed to enrich ${name}:`, err));
  }, [name]);
}
