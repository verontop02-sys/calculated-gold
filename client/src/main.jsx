import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { FieldDealConfirm } from './FieldDealConfirm.jsx';
import { ClientPortal } from './ClientPortal.jsx';
import { ClientDisplay } from './ClientDisplay.jsx';
import { InvestLanding } from './InvestLanding.jsx';
import { RuHome } from './ru/RuHome.jsx';
import { RuProdat } from './ru/RuProdat.jsx';
import { RuAgenty } from './ru/RuAgenty.jsx';
import { RuSlitki } from './ru/RuSlitki.jsx';
import { RuResale } from './ru/RuResale.jsx';
import { RuFranshiza } from './ru/RuFranshiza.jsx';
import { RuPartneram } from './ru/RuPartneram.jsx';
import { RuOKompanii } from './ru/RuOKompanii.jsx';
import { PrivacyPolicy } from './PrivacyPolicy.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { initThemeFromStorage } from './theme.js';
import { recoverAuthIfNeeded } from './supabase.js';
import { pingApiHealth } from './api.js';
import { initYandexMetrika } from './yandexMetrika.js';
import { isReaktivoRuHost, matchRuRoute } from './ru/ruSite.js';

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
const isClientDisplay = /^\/display\/?$/.test(path);
const isPrivacy = /^\/privacy\/?$/.test(path);
const ruRoute = matchRuRoute(path);
// Публичный лендинг Invest: корень домена + /invest (оба ведут на одну страницу).
// На reaktivo.ru корень — сайт выкупа, не Invest.
const isInvestLanding = !isReaktivoRuHost() && /^\/(?:invest\/?)?$/.test(path);
// Панель сотрудников (оценка/выкуп) — отдельный путь, чтобы корень был маркетинговым.
const isStaffApp = /^\/pro\/?$/.test(path);

let inner;
if (token) {
  inner = <FieldDealConfirm token={token} />;
} else if (isPrivacy) {
  inner = <PrivacyPolicy />;
} else if (isClientPortal) {
  inner = <ClientPortal />;
} else if (isClientDisplay) {
  inner = <ClientDisplay />;
} else if (isStaffApp) {
  inner = <App />;
} else if (ruRoute === 'prodat') {
  inner = <RuProdat />;
} else if (ruRoute === 'agenty') {
  inner = <RuAgenty />;
} else if (ruRoute === 'slitki') {
  inner = <RuSlitki />;
} else if (ruRoute === 'resale') {
  inner = <RuResale />;
} else if (ruRoute === 'franshiza') {
  inner = <RuFranshiza />;
} else if (ruRoute === 'partneram') {
  inner = <RuPartneram />;
} else if (ruRoute === 'o-kompanii') {
  inner = <RuOKompanii />;
} else if (ruRoute === 'home' || isReaktivoRuHost()) {
  inner = <RuHome />;
} else if (isInvestLanding) {
  inner = <InvestLanding />;
} else {
  // Неизвестный путь → лендинг (удобнее для клиента, чем пустая 404 SPA).
  inner = <InvestLanding />;
}

const tree = (
  <StrictMode>
    <ToastProvider>{inner}</ToastProvider>
  </StrictMode>
);
initYandexMetrika();
createRoot(el).render(tree);
// Восстановление сессии сотрудника только на /pro (не на лендинге / кабинете / display).
if (isStaffApp) void recoverAuthIfNeeded().catch(() => {});
