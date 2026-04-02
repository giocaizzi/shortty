interface KeyComboProps {
  keys: string;
}

export function KeyCombo({ keys }: KeyComboProps) {
  if (!keys) {
    return <span className="min-w-[100px] text-xs italic text-white/25">unbound</span>;
  }

  const chords = keys.split(/\s+/);

  return (
    <span className="inline-flex min-w-[100px] items-center gap-1">
      {chords.map((chord, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-white/20">&middot;</span>}
          <kbd>{chord}</kbd>
        </span>
      ))}
    </span>
  );
}
