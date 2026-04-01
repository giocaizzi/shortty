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
          // tableOrKey is the table name for -T bindings
          if (tableOrKey && TmuxParser.IGNORED_TABLES.has(tableOrKey)) continue;
          key = keyOrCmd;
          command = rest;
        } else if (isRoot) {
          key = tableOrKey ?? keyOrCmd;
          command = rest;
        } else {
          key = tableOrKey ?? keyOrCmd;
          command = `${keyOrCmd} ${rest}`.trim();
        }

        // Skip mouse-event bindings
        if (TmuxParser.MOUSE_KEY_RE.test(key)) continue;

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

  /** Tables that produce noise (copy-mode vi/emacs bindings, mouse events). */
  private static readonly IGNORED_TABLES = new Set([
    'copy-mode',
    'copy-mode-vi',
  ]);

  /** Keys that are mouse events rather than keyboard shortcuts. */
  private static readonly MOUSE_KEY_RE =
    /^(?:Mouse|WheelUp|WheelDown|DoubleClick|TripleClick|DragEnd|SecondClick)/;

  parseTmuxListKeys(output: string): Keybinding[] {
    const keybindings: Keybinding[] = [];

    for (const line of output.split('\n')) {
      const match = line.match(
        /^bind-key\s+-T\s+(\S+)\s+(\S+)\s+(.+)$/,
      );
      if (!match) continue;

      const [, table, key, command] = match;

      // Skip copy-mode tables (noise — hundreds of vi/emacs bindings)
      if (TmuxParser.IGNORED_TABLES.has(table)) continue;

      // Skip mouse-event bindings
      if (TmuxParser.MOUSE_KEY_RE.test(key)) continue;

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
      'kill-session': 'Kill Session',
      'copy-mode': 'Copy Mode',
      'paste-buffer': 'Paste Buffer',
      'choose-tree': 'Choose Tree',
      'choose-buffer': 'Choose Buffer',
      'choose-client': 'Choose Client',
      'detach-client': 'Detach Client',
      'suspend-client': 'Suspend Client',
      'switch-client': 'Switch Client',
      'list-keys': 'List Keys',
      'list-sessions': 'List Sessions',
      'command-prompt': 'Command Prompt',
      'display-message': 'Display Message',
      'display-menu': 'Display Menu',
      'display-panes': 'Display Panes',
      'send-keys': 'Send Keys',
      'send-prefix': 'Send Prefix',
      'rename-window': 'Rename Window',
      'rename-session': 'Rename Session',
      'last-window': 'Last Window',
      'last-pane': 'Last Pane',
      'next-layout': 'Next Layout',
      'select-layout': 'Select Layout',
      'rotate-window': 'Rotate Window',
      'swap-pane': 'Swap Pane',
      'swap-window': 'Swap Window',
      'move-window': 'Move Window',
      'break-pane': 'Break Pane',
      'join-pane': 'Join Pane',
      'refresh-client': 'Refresh Client',
      'set-option': 'Set Option',
      'show-options': 'Show Options',
      'clock-mode': 'Clock Mode',
      'customize-mode': 'Customize Mode',
      'source-file': 'Source File',
      'respawn-pane': 'Respawn Pane',
      'respawn-window': 'Respawn Window',
      'find-window': 'Find Window',
      'select-window': 'Select Window',
      'if-shell': 'Conditional',
      'run-shell': 'Run Shell',
    };
    if (humanized[cmd]) return humanized[cmd];

    // For unknown commands, humanize only the first tmux subcommand
    // (avoid dumping the entire raw argument string)
    return cmd.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }
}
