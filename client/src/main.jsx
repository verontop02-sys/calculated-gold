import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { FieldDealConfirm } from './FieldDealConfirm.jsx';
import { ClientPortal } from './ClientPortal.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { initThemeFromStorage } from './theme.js';
import { recoverAuthIfNeeded } from './supabase.js';
import { pingApiHealth } from './api.js';

initThemeFromStorage();
// Прогрев Render с первой миллисекунды — пока грузится JS и восстанавливается сессия.
void pingApiHealth({ timeout: 90_000 }).catch(() => {});

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

const el = document.getElementById('root');
const path = typeof window !== 'undefined' ? window.location.pathname || '' : '';
const m = path.match(/^\/podtverzhdenie\/([^/]+)\/?$/);
const token = m?.[1] ? decodeURIComponent(m[1]) : '';
const isClientPortal = /^\/kabinet\/?$/.test(path);

let inner;
if (token) {
  inner = <FieldDealConfirm token={token} />;
} else if (isClientPortal) {
  inner = <ClientPortal />;
} else {
  inner = <App />;
}

const tree = (
  <StrictMode>
    <ToastProvider>{inner}</ToastProvider>
  </StrictMode>
);
createRoot(el).render(tree);
// Восстановление сессии сотрудника не нужно в клиентском кабинете.
if (!isClientPortal) void recoverAuthIfNeeded().catch(() => {});
