import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { Keybinding, ParserMeta } from '../../shared/types';
import { getConfigPaths } from '../platform/paths';
import { BaseParser } from './base-parser';

export class TmuxParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'tmux',
      label: 'tmux',
      icon: '🖥️',
      platforms: ['darwin', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      execSync('which tmux', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  getWatchPaths(): string[] {
    return getConfigPaths('tmux').filter((p) => existsSync(p));
  }

  async parse(): Promise<Keybinding[]> {
    // Try config file first
    const configKeybindings = await this.parseConfigFiles();
    if (configKeybindings.length > 0) return configKeybindings;

    // Fallback to live query
    return this.parseLiveKeys();
  }

  private async parseConfigFiles(): Promise<Keybinding[]> {
    const keybindings: Keybinding[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = trimmed.match(
          /^(?:bind-key|bind)\s+(?:-([nrT])\s+)?(?:(\S+)\s+)?(\S+)\s+(.+)$/,
        );
        if (!match) continue;

        const [, flag, tableOrKey, keyOrCmd, rest] = match;
        const isRoot = flag === 'n';
        let key: string;
        let command: string;

        if (flag === 'T') {
          // bind-key -T <table> <key> <cmd>
          key = keyOrCmd;
          command = rest;
        } else if (isRoot) {
          key = tableOrKey ?? keyOrCmd;
          command = rest;
        } else {
          key = tableOrKey ?? keyOrCmd;
          command = `${keyOrCmd} ${rest}`.trim();
        }

        const prefix = isRoot ? '' : 'prefix ';
        keybindings.push(
          this.makeKeybinding({
            key: `${prefix}${key}`,
            command: this.humanizeCommand(command),
            rawCommand: trimmed,
            isDefault: false,
            isUnbound: false,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  private parseLiveKeys(): Keybinding[] {
    try {
      const output = execSync('tmux list-keys 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return this.parseTmuxListKeys(output);
    } catch {
      return [];
    }
  }

  parseTmuxListKeys(output: string): Keybinding[] {
    const keybindings: Keybinding[] = [];

    for (const line of output.split('\n')) {
      const match = line.match(
        /^bind-key\s+-T\s+(\S+)\s+(\S+)\s+(.+)$/,
      );
      if (!match) continue;

      const [, table, key, command] = match;
      const prefix = table === 'root' ? '' : 'prefix ';

      keybindings.push(
        this.makeKeybinding({
          key: `${prefix}${key}`,
          command: this.humanizeCommand(command),
          rawCommand: line.trim(),
          context: table !== 'prefix' && table !== 'root' ? table : undefined,
          isDefault: true,
          isUnbound: false,
          filePath: 'tmux list-keys',
        }),
      );
    }

    return keybindings;
  }

  private humanizeCommand(command: string): string {
    const cmd = command.trim().split(/\s+/)[0];
    const humanized: Record<string, string> = {
      'new-window': 'New Window',
      'split-window': 'Split Window',
      'select-pane': 'Select Pane',
      'resize-pane': 'Resize Pane',
      'next-window': 'Next Window',
      'previous-window': 'Previous Window',
      'kill-pane': 'Kill Pane',
      'kill-window': 'Kill Window',
      'copy-mode': 'Copy Mode',
      'paste-buffer': 'Paste Buffer',
      'choose-tree': 'Choose Tree',
      'detach-client': 'Detach Client',
      'list-keys': 'List Keys',
      'command-prompt': 'Command Prompt',
      'display-message': 'Display Message',
      'send-keys': 'Send Keys',
      'rename-window': 'Rename Window',
      'last-window': 'Last Window',
    };
    return humanized[cmd] ?? command.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }
}
