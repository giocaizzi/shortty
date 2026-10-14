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
  COMMANDS_GET_SUBCOMMAND_DETAIL: 'commands:getSubcommandDetail',

  SET_WINDOW_HEIGHT: 'app:setWindowHeight',

  // --- Launcher window lifecycle (main-process package) ---
  /** renderer -> main (send): dismiss the launcher with the exit animation. */
  WINDOW_HIDE: 'window:hide',
  /** renderer -> main (send, with the request id): exit animation finished. */
  WINDOW_HIDE_READY: 'window:hideReady',
  /** main -> renderer: the launcher was just shown (reset state, play enter). */
  WINDOW_SHOWN: 'window:shown',
  /** main -> renderer (with a request id): play the exit animation, then ack. */
  WINDOW_WILL_HIDE: 'window:will-hide',
  /** main -> renderer: the launcher is now hidden. */
  WINDOW_HIDDEN: 'window:hidden',
} as const;
