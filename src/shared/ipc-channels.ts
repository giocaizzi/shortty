export const IPC_CHANNELS = {
  GET_SOURCES: 'keybindings:getSources',
  GET_AVAILABLE_SOURCES: 'keybindings:getAvailableSources',
  GET_ALL_SOURCES: 'keybindings:getAllSources',
  GET_ALL: 'keybindings:getAll',
  GET_BY_SOURCE: 'keybindings:getBySource',
  REFRESH: 'keybindings:refresh',
  ON_UPDATE: 'keybindings:onUpdate',

  SETTINGS_GET_ALL: 'settings:getAll',
  SETTINGS_SET: 'settings:set',
  SETTINGS_ON_CHANGE: 'settings:onChange',

  OPEN_PREFERENCES: 'app:openPreferences',

  COMMANDS_GET_ALL: 'commands:getAll',
  COMMANDS_GET_DETAIL: 'commands:getDetail',
  COMMANDS_REFRESH: 'commands:refresh',
  COMMANDS_ON_UPDATE: 'commands:onUpdate',
  COMMANDS_GET_STATS: 'commands:getStats',
} as const;
