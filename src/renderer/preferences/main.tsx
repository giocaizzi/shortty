import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PreferencesApp } from './PreferencesApp';
import '../lib/ipc';
import './styles/preferences.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PreferencesApp />
    </StrictMode>,
  );
}
