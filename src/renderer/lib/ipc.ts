import type { ElectronAPI } from '../../preload/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export function getElectronAPI(): ElectronAPI {
  return window.electronAPI;
}
