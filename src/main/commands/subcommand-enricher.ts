import type { SubcommandDetail } from '../../shared/types';
import { parseSubcommandManPage } from './parsers/man-parser';
import { parseSubcommandHelp } from './parsers/help-parser';
import type { CommandCache } from './cache';

export async function enrichSubcommand(
  baseBinPath: string,
  qualifiedName: string,
  cache: CommandCache,
): Promise<SubcommandDetail> {
  const cached = cache.readSubcommandDetail(qualifiedName);
  if (cached && cached.enrichment !== 'none') return cached;

  const parts = qualifiedName.split(' ');
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

  const failed: SubcommandDetail = {
    name: qualifiedName,
    description: '',
    enrichment: 'failed',
    enrichedAt: new Date().toISOString(),
    subcommands: [],
    flags: [],
  };
  cache.writeSubcommandDetail(qualifiedName, failed);
  return failed;
}
