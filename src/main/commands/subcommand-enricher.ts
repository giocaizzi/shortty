import type { SubcommandDetail } from '../../shared/types';
import { parseSubcommandManPage } from './parsers/man-parser';
import { parseSubcommandHelp } from './parsers/help-parser';
import { needsHelp, pickRicher } from './parsers/parse-utils';
import type { BinaryIdentity, CommandCache } from './cache';

/** Every word of a qualified name ("docker compose up") must be a plain token. */
const TOKEN_RE = /^[A-Za-z0-9][\w.+-]*$/;

function failedDetail(qualifiedName: string): SubcommandDetail {
  return {
    name: qualifiedName,
    description: '',
    enrichment: 'failed',
    enrichedAt: new Date().toISOString(),
    subcommands: [],
    flags: [],
    arguments: [],
  };
}

/**
 * Details of a subcommand of the base binary `base`. Successful results are
 * cached against the binary's path and mtime; failures are not cached, so a
 * transient failure (a timeout under load, a man page installed later) is
 * retried on the next request.
 */
export async function enrichSubcommand(
  base: BinaryIdentity,
  qualifiedName: string,
  cache: CommandCache,
): Promise<SubcommandDetail> {
  const parts = qualifiedName.split(' ');
  // The name comes from the renderer: it reaches man, a spawned binary and a
  // cache file name, so reject anything that is not a list of plain words
  if (parts.length < 2 || !parts.every(p => TOKEN_RE.test(p))) return failedDetail(qualifiedName);

  const cached = cache.readSubcommandDetail(qualifiedName, base);
  if (cached && cached.enrichment === 'full') return cached;

  // Man page first (man git-commit); unless it lists subcommands, --help may be richer
  const manResult = await parseSubcommandManPage(qualifiedName);
  const helpResult = needsHelp(manResult) ? await parseSubcommandHelp(base.bin, parts.slice(1), qualifiedName) : null;
  const picked = pickRicher(manResult, helpResult);
  if (picked) {
    const detail: SubcommandDetail = {
      ...picked.doc,
      enrichment: 'full',
      enrichedAt: new Date().toISOString(),
    };
    cache.writeSubcommandDetail(qualifiedName, base, detail);
    return detail;
  }

  return failedDetail(qualifiedName);
}
