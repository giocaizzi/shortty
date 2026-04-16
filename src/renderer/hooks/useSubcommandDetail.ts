import { useState, useEffect } from 'react';
import type { SubcommandDetail } from '../../shared/types';
import { getElectronAPI } from '../lib/ipc';

interface UseSubcommandDetailReturn {
  detail: SubcommandDetail | null;
  loading: boolean;
}

export function useSubcommandDetail(
  qualifiedName: string | null,
): UseSubcommandDetailReturn {
  const [detail, setDetail] = useState<SubcommandDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!qualifiedName) {
      setDetail(null);
      return;
    }

    setLoading(true);
    setDetail(null);

    const api = getElectronAPI();
    api.getSubcommandDetail(qualifiedName).then((result) => {
      setDetail(result);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [qualifiedName]);

  return { detail, loading };
}
