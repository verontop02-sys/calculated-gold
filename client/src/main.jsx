import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { initThemeFromStorage } from './theme.js';
import { recoverAuthIfNeeded } from './supabase.js';

initThemeFromStorage();

if (import.meta.env.DEV) {
  const nativeInfo = console.info.bind(console);
  console.info = (...args) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('Download the React DevTools for a better development experience')) {
      return;
    }
    nativeInfo(...args);
  };
}

void recoverAuthIfNeeded()
  .catch(() => {})
  .finally(() => {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StrictMode>,
    );
  });
