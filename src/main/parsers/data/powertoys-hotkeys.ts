/**
 * PowerToys activation hotkeys the bundled cheatsheet lists, keyed by
 * `<module folder>.<settings property>` (the property of the hotkey in
 * `%LOCALAPPDATA%/Microsoft/PowerToys/<module folder>/settings.json`).
 * Defaults from the PowerToys docs (learn.microsoft.com/windows/powertoys).
 * The parser skips a hotkey still on its default and labels known ones.
 */
export const POWERTOYS_HOTKEYS: Record<string, { command: string; category: string; key: string }> = {
  'AdvancedPaste.advanced-paste-ui-hotkey': { command: 'Open Advanced Paste', category: 'Advanced Paste', key: 'Win+Shift+V' },
  'AdvancedPaste.paste-as-plain-hotkey': { command: 'Paste as Plain Text', category: 'Advanced Paste', key: 'Win+Ctrl+Alt+V' },
  'AlwaysOnTop.hotkey': { command: 'Pin Window Always on Top', category: 'Always On Top', key: 'Win+Ctrl+T' },
  'CmdPal.Hotkey': { command: 'Open Command Palette', category: 'Command Palette', key: 'Win+Alt+Space' },
  'ColorPicker.ActivationShortcut': { command: 'Open Color Picker', category: 'Color Picker', key: 'Win+Shift+C' },
  'CropAndLock.reparent-hotkey': { command: 'Crop and Lock (Reparent)', category: 'Crop And Lock', key: 'Win+Ctrl+Shift+R' },
  'CropAndLock.thumbnail-hotkey': { command: 'Crop and Lock (Thumbnail)', category: 'Crop And Lock', key: 'Win+Ctrl+Shift+T' },
  'FancyZones.fancyzones_editor_hotkey': { command: 'Open FancyZones Editor', category: 'FancyZones', key: 'Win+Shift+`' },
  'FancyZones.fancyzones_nextTab_hotkey': { command: 'Next Window in Zone', category: 'FancyZones', key: 'Win+PageDown' },
  'FancyZones.fancyzones_prevTab_hotkey': { command: 'Previous Window in Zone', category: 'FancyZones', key: 'Win+PageUp' },
  'Measure Tool.ActivationShortcut': { command: 'Open Screen Ruler', category: 'Screen Ruler', key: 'Win+Ctrl+Shift+M' },
  'MouseHighlighter.activation_shortcut': { command: 'Toggle Mouse Highlighter', category: 'Mouse Utilities', key: 'Win+Shift+H' },
  'MouseJump.activation_shortcut': { command: 'Mouse Jump', category: 'Mouse Utilities', key: 'Win+Shift+D' },
  'MousePointerCrosshairs.activation_shortcut': { command: 'Toggle Mouse Pointer Crosshairs', category: 'Mouse Utilities', key: 'Win+Alt+P' },
  'Peek.ActivationShortcut': { command: 'Peek at Selected File', category: 'Peek', key: 'Ctrl+Space' },
  'PowerToys Run.open_powerlauncher': { command: 'Open PowerToys Run', category: 'PowerToys Run', key: 'Alt+Space' },
  'Shortcut Guide.open_shortcutguide': { command: 'Open Shortcut Guide', category: 'Shortcut Guide', key: 'Win+Shift+/' },
  'TextExtractor.ActivationShortcut': { command: 'Extract Text from Screen', category: 'Text Extractor', key: 'Win+Shift+T' },
  'Workspaces.hotkey': { command: 'Open Workspaces Editor', category: 'Workspaces', key: 'Win+Ctrl+`' },
  'ZoomIt.ToggleKey': { command: 'Zoom', category: 'ZoomIt', key: 'Ctrl+1' },
  'ZoomIt.DrawToggleKey': { command: 'Draw', category: 'ZoomIt', key: 'Ctrl+2' },
  'ZoomIt.BreakTimerKey': { command: 'Break Timer', category: 'ZoomIt', key: 'Ctrl+3' },
  'ZoomIt.LiveZoomToggleKey': { command: 'Live Zoom', category: 'ZoomIt', key: 'Ctrl+4' },
  'ZoomIt.RecordToggleKey': { command: 'Record Screen', category: 'ZoomIt', key: 'Ctrl+5' },
  'ZoomIt.SnipToggleKey': { command: 'Snip', category: 'ZoomIt', key: 'Ctrl+6' },
  'ZoomIt.DemoTypeToggleKey': { command: 'DemoType', category: 'ZoomIt', key: 'Ctrl+7' },
};
