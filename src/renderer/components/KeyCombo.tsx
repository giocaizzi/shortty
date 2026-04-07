interface KeyComboProps {
  keys: string;
}

export function KeyCombo({ keys }: KeyComboProps) {
  if (!keys) {
    return <span className="text-[11px] italic text-white/20">unbound</span>;
  }

  const chords = keys.split(/\s+/);

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {chords.map((chord, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-white/15">&middot;</span>}
          <kbd>{chord}</kbd>
        </span>
      ))}
    </span>
  );
}
