import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PreferencesApp } from './PreferencesApp';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../lib/ipc';
import { preventFileDrop } from '../lib/prevent-drop';
import './styles/preferences.css';

preventFileDrop();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <PreferencesApp />
      </ErrorBoundary>
    </StrictMode>,
  );
}
