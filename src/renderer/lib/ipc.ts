import type { ElectronAPI } from '../../preload/index';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export function getElectronAPI(): ElectronAPI {
  return window.electronAPI;
}
