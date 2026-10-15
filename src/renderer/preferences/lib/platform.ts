/**
 * Whether the app runs on macOS. `process` does not exist in the sandboxed
 * renderer, so the preload exposes the platform.
 */
export function isMacPlatform(): boolean {
  return window.electronAPI.platform === 'darwin';
}
