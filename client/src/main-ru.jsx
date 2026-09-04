import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
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
import { pingApiHealth } from './api.js';
import { initYandexMetrika } from './yandexMetrika.js';
import { matchRuRoute, PRO_ORIGIN } from './ru/ruSite.js';

initThemeFromStorage();
void pingApiHealth({ timeout: 90_000 }).catch(() => {});

const el = document.getElementById('root');
const path = typeof window !== 'undefined' ? window.location.pathname || '' : '';
const isPrivacy = /^\/privacy\/?$/.test(path);
const ruRoute = matchRuRoute(path);

const sendToPro = /^\/(?:pro|kabinet|display)\/?$/.test(path) || /^\/podtverzhdenie\//.test(path);
if (typeof window !== 'undefined' && sendToPro) {
  window.location.replace(`${PRO_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`);
} else {
  let inner;
  if (isPrivacy) {
    inner = <PrivacyPolicy />;
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
  } else {
    inner = <RuHome />;
  }

  initYandexMetrika();
  createRoot(el).render(
    <StrictMode>
      <ToastProvider>{inner}</ToastProvider>
    </StrictMode>
  );
}
