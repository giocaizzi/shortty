import { type ParsedKey, Modifier, normalizeToCanonical } from './key-normalizer';

const TERMINAL_ESCAPE_SEQUENCES: Array<{ pattern: RegExp; toKey: ParsedKey }> = [
  { pattern: /^\\e\[1;5A$/, toKey: { modifiers: [Modifier.Control], key: '↑' } },
  { pattern: /^\\e\[1;5B$/, toKey: { modifiers: [Modifier.Control], key: '↓' } },
  { pattern: /^\\e\[1;5C$/, toKey: { modifiers: [Modifier.Control], key: '→' } },
  { pattern: /^\\e\[1;5D$/, toKey: { modifiers: [Modifier.Control], key: '←' } },
  { pattern: /^\\e\[1;3A$/, toKey: { modifiers: [Modifier.Option], key: '↑' } },
  { pattern: /^\\e\[1;3B$/, toKey: { modifiers: [Modifier.Option], key: '↓' } },
  { pattern: /^\\e\[1;3C$/, toKey: { modifiers: [Modifier.Option], key: '→' } },
  { pattern: /^\\e\[1;3D$/, toKey: { modifiers: [Modifier.Option], key: '←' } },
  { pattern: /^\\e\[A$/, toKey: { modifiers: [], key: '↑' } },
  { pattern: /^\\e\[B$/, toKey: { modifiers: [], key: '↓' } },
  { pattern: /^\\e\[C$/, toKey: { modifiers: [], key: '→' } },
  { pattern: /^\\e\[D$/, toKey: { modifiers: [], key: '←' } },
  { pattern: /^\\e\[3~$/, toKey: { modifiers: [], key: 'Delete' } },
  { pattern: /^\\e\[2~$/, toKey: { modifiers: [], key: 'Insert' } },
  { pattern: /^\\e\[5~$/, toKey: { modifiers: [], key: 'PageUp' } },
  { pattern: /^\\e\[6~$/, toKey: { modifiers: [], key: 'PageDown' } },
  { pattern: /^\\eOH$/, toKey: { modifiers: [], key: 'Home' } },
  { pattern: /^\\eOF$/, toKey: { modifiers: [], key: 'End' } },
  { pattern: /^\\e\[H$/, toKey: { modifiers: [], key: 'Home' } },
  { pattern: /^\\e\[F$/, toKey: { modifiers: [], key: 'End' } },
  { pattern: /^\\e\[1~$/, toKey: { modifiers: [], key: 'Home' } },
  { pattern: /^\\e\[4~$/, toKey: { modifiers: [], key: 'End' } },
];

export function normalizeTerminalKey(
  sequence: string,
  parsePrefixes: (sequence: string) => { modifiers: Modifier[]; remaining: string } | null,
): { displayKey: string; searchKey: string } {
  for (const { pattern, toKey } of TERMINAL_ESCAPE_SEQUENCES) {
    if (pattern.test(sequence)) {
      return normalizeToCanonical(toKey);
    }
  }

  const result = parsePrefixes(sequence);
  if (!result) return normalizeToCanonical({ modifiers: [], key: sequence });

  const { modifiers, remaining } = result;
  const key = remaining.length === 1 ? remaining.toUpperCase() : remaining;
  return normalizeToCanonical({ modifiers, key });
}
