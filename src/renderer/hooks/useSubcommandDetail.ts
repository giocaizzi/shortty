import { useState, useEffect } from 'react';
import type { SubcommandDetail } from '../../shared/types';
import { getElectronAPI } from '../lib/ipc';

interface UseSubcommandDetailReturn {
  detail: SubcommandDetail | null;
  loading: boolean;
  error: string | null;
}

/** The outcome of one request, keyed by the name it was made for. */
interface Response {
  name: string;
  detail: SubcommandDetail | null;
  error: string | null;
}

export function useSubcommandDetail(
  qualifiedName: string | null,
): UseSubcommandDetailReturn {
  const [response, setResponse] = useState<Response | null>(null);

  useEffect(() => {
    if (!qualifiedName) return;

    // A slow --help (e.g. `docker compose`) can resolve after the user has
    // moved on to another subcommand: drop it instead of overwriting the view.
    let stale = false;
    const api = getElectronAPI();
    api.getSubcommandDetail(qualifiedName).then((detail) => {
      if (!stale) setResponse({ name: qualifiedName, detail, error: null });
    }).catch((err) => {
      if (stale) return;
      console.error(`Failed to load subcommand detail for ${qualifiedName}:`, err);
      setResponse({
        name: qualifiedName,
        detail: null,
        error: err instanceof Error ? err.message : 'Failed to load details',
      });
    });
    return () => { stale = true; };
  }, [qualifiedName]);

  // Only a response for the current name counts; anything else is in flight.
  const current = qualifiedName && response?.name === qualifiedName ? response : null;
  return {
    detail: current?.detail ?? null,
    loading: Boolean(qualifiedName) && current === null,
    error: current?.error ?? null,
  };
}
