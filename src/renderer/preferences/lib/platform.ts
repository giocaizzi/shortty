/**
 * Platform detection for the renderer. `process` does not exist here
 * (contextIsolation, no nodeIntegration), so read it from the navigator.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac/i.test(navigator.platform || navigator.userAgent);
}
