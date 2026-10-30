import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/presentation/App';
import '@/presentation/styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Needs HTTPS or localhost; on plain LAN HTTP the app simply runs without offline shell.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {});
}
