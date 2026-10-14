import type { SubcommandDetail } from '../../shared/types';
import { parseSubcommandManPage } from './parsers/man-parser';
import { parseSubcommandHelp } from './parsers/help-parser';
import type { CommandCache } from './cache';

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

export async function enrichSubcommand(
  baseBinPath: string,
  qualifiedName: string,
  cache: CommandCache,
): Promise<SubcommandDetail> {
  const parts = qualifiedName.split(' ');
  // The name comes from the renderer: it reaches man, a spawned binary and a
  // cache file name, so reject anything that is not a list of plain words
  if (parts.length < 2 || !parts.every(p => TOKEN_RE.test(p))) return failedDetail(qualifiedName);

  const cached = cache.readSubcommandDetail(qualifiedName);
  if (cached && cached.enrichment !== 'none') return cached;

  const subParts = parts.slice(1);

  // Try man page first (e.g. man git-commit)
  const manResult = await parseSubcommandManPage(qualifiedName);
  if (manResult) {
    const detail: SubcommandDetail = {
      ...manResult,
      enrichment: 'full',
      enrichedAt: new Date().toISOString(),
    };
    cache.writeSubcommandDetail(qualifiedName, detail);
    return detail;
  }

  // Fallback to --help
  const helpResult = await parseSubcommandHelp(baseBinPath, subParts, qualifiedName);
  if (helpResult) {
    const detail: SubcommandDetail = {
      ...helpResult,
      enrichment: 'full',
      enrichedAt: new Date().toISOString(),
    };
    cache.writeSubcommandDetail(qualifiedName, detail);
    return detail;
  }

  const failed = failedDetail(qualifiedName);
  cache.writeSubcommandDetail(qualifiedName, failed);
  return failed;
}
