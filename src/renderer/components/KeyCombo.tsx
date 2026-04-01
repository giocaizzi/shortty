interface KeyComboProps {
  keys: string;
}

export function KeyCombo({ keys }: KeyComboProps) {
  if (!keys) {
    return <span className="text-xs italic text-neutral-400">unbound</span>;
  }

  // Split multi-chord keys (e.g., "⌘K ⌘S" or "prefix c")
  const chords = keys.split(/\s+/);

  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      {chords.map((chord, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-0.5 text-neutral-400">&nbsp;</span>}
          <kbd className="text-neutral-600 dark:text-neutral-300">{chord}</kbd>
        </span>
      ))}
    </span>
  );
}
