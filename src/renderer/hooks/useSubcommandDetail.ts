import { useState, useEffect } from 'react';
import type { SubcommandDetail } from '../../shared/types';
import { getElectronAPI } from '../lib/ipc';

interface UseSubcommandDetailReturn {
  detail: SubcommandDetail | null;
  loading: boolean;
  error: string | null;
}

export function useSubcommandDetail(
  qualifiedName: string | null,
): UseSubcommandDetailReturn {
  const [detail, setDetail] = useState<SubcommandDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!qualifiedName) {
      setDetail(null);
      setError(null);
      return;
    }

    setLoading(true);
    setDetail(null);
    setError(null);

    const api = getElectronAPI();
    api.getSubcommandDetail(qualifiedName).then((result) => {
      setDetail(result);
      setLoading(false);
    }).catch((err) => {
      console.error(`Failed to load subcommand detail for ${qualifiedName}:`, err);
      setError(err instanceof Error ? err.message : 'Failed to load details');
      setLoading(false);
    });
  }, [qualifiedName]);

  return { detail, loading, error };
}
