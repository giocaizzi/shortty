import { Search, AlertCircle } from 'lucide-react';

interface EmptyStateProps {
  type: 'no-results' | 'no-configs';
  query?: string;
}

export function EmptyState({ type, query }: EmptyStateProps) {
  if (type === 'no-configs') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-neutral-400">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">No shortcuts detected</p>
        <p className="text-xs">Check your config files</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-neutral-400">
      <Search className="h-8 w-8" />
      <p className="text-sm">
        No shortcuts matching{' '}
        <span className="font-medium text-neutral-500">"{query}"</span>
      </p>
    </div>
  );
}
