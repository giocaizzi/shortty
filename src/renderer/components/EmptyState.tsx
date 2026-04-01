import { Search, AlertCircle } from 'lucide-react';

interface EmptyStateProps {
  type: 'no-results' | 'no-configs';
  query?: string;
}

export function EmptyState({ type, query }: EmptyStateProps) {
  if (type === 'no-configs') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-white/20">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm text-white/30">No shortcuts detected</p>
        <p className="text-xs">Check your config files</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-white/20">
      <Search className="h-8 w-8" />
      <p className="text-sm text-white/30">
        No shortcuts matching{' '}
        <span className="font-medium text-white/40">"{query}"</span>
      </p>
    </div>
  );
}
