const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/jspdf.es.min-BFsN6vIX.js","assets/index-LZdH9KRB.js","assets/index-AOlsja4O.css"])))=>i.map(i=>d[i]);
import{i as V,_ as D}from"./index-LZdH9KRB.js";function S(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function et(){const t=getComputedStyle(document.documentElement),e=s=>t.getPropertyValue(s).trim();return{theme:document.documentElement.getAttribute("data-theme")||"dark",accent:e("--accent")||"#fe0000",accentDim:e("--accent-dim")||"#c40000",accentSoft:e("--accent-soft")||"rgba(254,0,0,0.12)",accentStrong:e("--accent-strong")||"#ff2a2a",accentGrad:e("--accent-grad")||"linear-gradient(135deg, #ff2a2a 0%, #fe0000 48%, #c40000 100%)",emerald:e("--emerald")||"#4ade80",emeraldSoft:e("--emerald-soft")||"rgba(74,222,128,0.14)",crimson:e("--crimson")||"#ff5a63",crimsonSoft:e("--crimson-soft")||"rgba(254,0,0,0.12)",textStrong:e("--text-strong")||"#fff",text:e("--text")||"#eef0f2",textMuted:e("--text-muted")||"rgba(238,240,242,0.66)",textDim:e("--text-dim")||"rgba(238,240,242,0.46)",stroke:e("--stroke")||"rgba(255,255,255,0.1)",strokeSoft:e("--stroke-soft")||"rgba(255,255,255,0.06)",strokeStrong:e("--stroke-strong")||"rgba(255,255,255,0.20)",panel:e("--bg-panel-solid")||"#222427",surface:e("--surface")||"rgba(36,38,42,0.75)",elevated:e("--surface-elevated")||"#2a2c30",bgDeep:e("--bg-deep")||"#141516",bgGradient:e("--bg-gradient")||"",shadowCard:e("--shadow-card")||"0 8px 32px rgba(0,0,0,0.5)"}}const q={money:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',deals:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M9 11h2"/></svg>',clients:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',avg:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8"/><path d="M8 12h8"/><path d="M8 17h5"/></svg>',team:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>',gold:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9h4.5a2.25 2.25 0 0 1 0 4.5H9z"/><path d="M9 9v8"/><path d="M7.5 15.5H12"/></svg>'};function dt({icon:t="money",tone:e="",hero:s=!1,label:i,valueHtml:o,deltaHtml:n="",prevHtml:a="",sparkHtml:r=""}){const d=n||a?`<div class="r-kpi__foot">${n}${a?`<span class="r-kpi__prev">${a}</span>`:""}</div>`:"";return`
  <div class="r-kpi${s?" r-kpi--hero":""}">
    <div class="r-kpi__top">
      <span class="r-kpi__icon${e?` r-kpi__icon--${e}`:""}">${q[t]||q.money}</span>
      <span class="r-kpi__label">${S(i||"")}</span>
    </div>
    <div class="r-kpi__value mono-nums">${o}</div>
    ${d}
    ${r?`<div class="r-kpi__spark">${r}</div>`:""}
  </div>`}function rt(t=new Date){return t.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}function U(t,e={r:254,g:0,b:0,a:1}){const s=String(t||"").trim();if(!s)return{...e};const i=s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);if(i){let n=i[1];return n.length===3&&(n=n.split("").map(a=>a+a).join("")),{r:parseInt(n.slice(0,2),16),g:parseInt(n.slice(2,4),16),b:parseInt(n.slice(4,6),16),a:1}}const o=s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);return o?{r:Math.round(Number(o[1])),g:Math.round(Number(o[2])),b:Math.round(Number(o[3])),a:o[4]!=null?Number(o[4]):1}:{...e}}function W({r:t,g:e,b:s,a:i}){const o=Math.max(0,Math.min(1,i));return o>=.999?`rgb(${t}, ${e}, ${s})`:`rgba(${t}, ${e}, ${s}, ${Math.round(o*1e3)/1e3})`}function G(t,e){const s=U(t);return W({...s,a:e/100*(s.a??1)})}function I(t,e,s){const i=U(t),o=U(e),n=Math.max(0,Math.min(100,s))/100;return W({r:Math.round(i.r*n+o.r*(1-n)),g:Math.round(i.g*n+o.g*(1-n)),b:Math.round(i.b*n+o.b*(1-n)),a:i.a*n+o.a*(1-n)})}const O="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAANXSURBVHic7dy/ahRhFIfhM2KZKiDkAlIshICtYNhACu/B2lxH8LJSaUxhJ6TPn4VEsNfCKmMRFEQdjTuzv53M85RbnDksL/MxMLvNbVVbEPIovQDTJkCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIl6nF5gac+eVb14kd4i4/i46v379BZLGX+A83k1R0fpLSLar19HH6AjmCgBEiVAogRIlACJEiBRAiRKgEQJkCgBEiVAogRIlACJEiBRAiRKgEQJkCgBEiVAogRIlACJGv+v4gbUfv5c9eFDeo0/u7pKb7A0AXY5O6va309v8aA5gokSIFECJEqARHkI6fL0adXbt/3P/fKl6tWrqk+f+p89MgLs0GxsVM3ng8xuT0+r9vYmH6EjOKTZ3q46Pa3a2kqvEiXAoB8RPnmSXiVGgGHN9nbVu3eTjVCAa6CZzSYboQDXxFQjFOAamWKEAlwzU4tQgGtoShEKcE1NJUIBdmivr6u9vIxdv5nNqt68edARjj/Ath1u9mJRdXBQ7c3NcNf4i2Zn5+5OuLkZ22FI4w9waItF1d5eNsLZ7O6liAcY4fgDbJrhZ69DhLu7DzLC8Qe4KiIchADvQ4S9E+B9ibBXAuxye/v7zxeLqvm82o8fV73RD83ubtXhYez6fRFgl0cdX8/lZdXz59E74aAPYCsiwGV8P44n/lr9MgS4LBEuRYB9OD8X4X8SYF9E+F8E2CcR3psA+ybCexHgEET4zwQ4FBH+EwEOSYR/JcChibCTAFdBhH8kwFUR4W8JcJVE+AsBrpoIfzL+P6g8Oan29ethZl9cDDP3/PzufcKXL5ebc3LS10YxzW3VgL9rhG6OYKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESNQ3LXTGvSZMSKoAAAAASUVORK5CYII=";async function ct(t){if(!t)return"";if(String(t).startsWith("data:"))return String(t);try{const e=new URL(t,window.location.origin).href,s=await fetch(e,{cache:"force-cache"});if(!s.ok)return"";const i=await s.blob();return await new Promise((o,n)=>{const a=new FileReader;a.onload=()=>o(String(a.result||"")),a.onerror=()=>n(a.error||new Error("FileReader failed")),a.readAsDataURL(i)})}catch{return""}}function ot({sectionTitle:t,authorName:e,generatedAt:s,goldRate:i,goldSource:o,logoSrc:n}={}){const a=i!=null&&i!==""?`<div class="r-head__rate">
          <div class="r-head__rate-label">Курс · ${S(o||"биржа")}</div>
          <div class="r-head__rate-value">${S(String(i))}<span> / г</span></div>
        </div>`:"";return`
  <header class="r-head">
    <div class="r-head__brand">
      <img class="r-head__logo" src="${n&&!String(n).includes(".svg")?n:O}" alt="Reaktivo" width="42" height="42" decoding="sync"/>
      <div class="r-head__brand-text">
        <div class="r-head__brand-name">Reaktivo<span>.</span>PRO</div>
        <div class="r-head__brand-sub">отчёт</div>
      </div>
    </div>
    <div class="r-head__meta">
      <div class="r-head__section">${S(t||"Раздел")}</div>
      <div class="r-head__who">
        ${e?`Сформировал: <b>${S(e)}</b>`:"Сформировал: —"}
        · ${S(s||rt())}
      </div>
    </div>
    ${a}
  </header>`}function lt(t,e){return`
  <section class="r-block">
    ${t?`<p class="r-section-title">${S(t)}</p>`:""}
    ${e}
  </section>`}function pt({header:t,blocks:e=[]}){return`
  ${ot(t)}
  <div class="r-flow">
    ${e.join("")}
  </div>`}function Z(t){return t.panel||(t.theme==="light"?"#ffffff":"#222427")}function X(t="landscape"){return t==="landscape"?1130:794}function at(t,{orientation:e="landscape"}={}){const s=t.theme!=="light",i=Z(t),o=X(e),n=s?I("#ffffff",i,4):t.panel||"#ffffff",a=s?I("#ffffff",i,7):t.elevated||t.panel||"#ffffff",r=I(t.accent,i,14),d=I(t.emerald,i,16),c=I(t.crimson,i,14),l=s?"0 2px 14px rgba(0,0,0,0.28)":t.shadowCard||"0 4px 18px rgba(0,0,0,0.08)",p=i,h=I(t.accent,i,16),g=I(t.accent,i,10);return`
:root {
  --accent: ${t.accent}; --accent-dim: ${t.accentDim}; --accent-soft: ${r};
  --accent-strong: ${t.accentStrong||t.accent};
  --accent-grad: ${t.accentGrad||`linear-gradient(135deg, ${t.accentStrong||t.accent} 0%, ${t.accent} 48%, ${t.accentDim} 100%)`};
  --emerald: ${t.emerald}; --emerald-soft: ${d};
  --crimson: ${t.crimson}; --crimson-soft: ${c};
  --text-strong: ${t.textStrong}; --text: ${t.text}; --text-muted: ${t.textMuted}; --text-dim: ${t.textDim};
  --stroke: ${t.stroke}; --stroke-soft: ${t.strokeSoft}; --stroke-strong: ${t.strokeStrong||t.stroke};
  --panel: ${i}; --surface: ${n}; --elevated: ${a}; --bg-deep: ${i};
  --shadow-card: ${l};
  --today-tint: ${h};
  --font-display: 'Geometria', system-ui, -apple-system, sans-serif;
  --font-ui: 'Geometria', system-ui, -apple-system, sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { font-size: 13px; }
html, body {
  background: ${i};
  color: var(--text);
  font-family: var(--font-ui); font-weight: 400; line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.r-doc { max-width: ${o}px; margin: 0 auto; padding: 14px 16px 24px; }
.mono-nums { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }

/* SVG: без непрозрачного фона (html2canvas иначе рисует чёрный прямоугольник) */
svg, .r-chart, .r-spark-svg {
  background: transparent !important;
  background-color: transparent !important;
}

/* ── Шапка отчёта: карточка в стиле .dx-card ── */
.r-head {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 20px;
  border-radius: 18px;
  border: 1px solid var(--stroke-soft);
  background: ${p};
  box-shadow: var(--shadow-card);
  margin-bottom: 16px;
  break-inside: avoid; break-after: avoid;
}
.r-head__brand { display: flex; align-items: center; gap: 11px; flex-shrink: 0; }
.r-head__logo {
  width: 42px; height: 42px; border-radius: 11px;
  object-fit: fill; display: block; flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(0,0,0,0.35);
  background: #fe0000;
}
.r-head__brand-name {
  font-family: var(--font-display);
  font-size: 1.05rem; font-weight: 700; color: var(--text-strong); letter-spacing: -0.02em; line-height: 1.1;
}
.r-head__brand-name span { color: var(--accent); }
.r-head__brand-sub {
  font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.12em;
  font-weight: 700; color: var(--text-dim); margin-top: 2px;
}
.r-head__meta { flex: 1; min-width: 0; }
.r-head__section {
  font-family: var(--font-display);
  font-size: 1.1rem; font-weight: 700; color: var(--text-strong); letter-spacing: -0.01em;
}
.r-head__who { font-size: 0.74rem; color: var(--text-muted); margin-top: 3px; }
.r-head__who b { color: var(--text); font-weight: 600; }
.r-head__rate {
  text-align: right; padding: 9px 13px; border-radius: 12px; flex-shrink: 0;
  background: var(--accent-soft); border: 1px solid rgba(254, 0, 0, 0.28);
}
.r-head__rate-label { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; color: var(--text-muted); }
.r-head__rate-value {
  font-family: var(--font-display);
  font-size: 1.15rem; font-weight: 700; color: var(--accent); letter-spacing: -0.02em;
}
.r-head__rate-value span { font-size: 0.7rem; color: var(--text-muted); font-weight: 600; }

/* ── Поток блоков ── */
.r-flow { display: flex; flex-direction: column; gap: 2px; }
.r-block { margin: 0 0 14px; break-inside: auto; page-break-inside: auto; }
.r-section-title {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em;
  font-weight: 700; color: var(--text-muted); margin: 4px 2px 10px;
  display: flex; align-items: center; gap: 7px;
  break-after: avoid; page-break-after: avoid;
}

/* ── Карточка 1 в 1 как .dx-card на сайте ── */
.r-card {
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid var(--stroke-soft);
  background: ${p};
  box-shadow: var(--shadow-card);
  min-width: 0; margin-bottom: 14px;
  box-decoration-break: clone; -webkit-box-decoration-break: clone;
}
/* Небольшая карточка — целиком переносится, не режется */
.r-card--keep { break-inside: avoid; page-break-inside: avoid; }
.r-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.r-card__title {
  font-family: var(--font-display);
  font-size: 1.02rem; font-weight: 700; letter-spacing: -0.01em; color: var(--text-strong);
}
.r-card__sub { font-size: 0.78rem; color: var(--text-muted); margin-top: 3px; margin-bottom: 12px; }
.r-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.r-cols .r-card { margin-bottom: 0; }
.r-empty { padding: 22px 10px; text-align: center; font-size: 0.82rem; color: var(--text-dim); }

/* ── KPI 1 в 1 как .dx-kpi / .an-kpi-card ── */
.r-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.r-kpi {
  position: relative; overflow: hidden;
  display: flex; flex-direction: column;
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid var(--stroke-soft);
  background: ${p};
  box-shadow: var(--shadow-card);
  break-inside: avoid;
}
.r-kpi--hero {
  background: linear-gradient(160deg, ${g} 0%, ${p} 55%);
  border-color: ${I(t.accent,t.strokeSoft||"rgba(255,255,255,0.06)",24)};
}
.r-kpi__spark {
  position: absolute; left: 0; right: 0; bottom: 0; height: 38px;
  opacity: 0.9; pointer-events: none;
}
.r-spark-svg { display: block; width: 100%; height: 100%; }
.r-kpi__top { display: flex; align-items: center; gap: 9px; position: relative; }
.r-kpi__icon {
  width: 27px; height: 27px; border-radius: 9px;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: inset 0 0 0 1px ${G(t.accent,18)};
}
.r-kpi__icon--emerald {
  background: var(--emerald-soft); color: var(--emerald);
  box-shadow: inset 0 0 0 1px ${G(t.emerald,18)};
}
.r-kpi__label {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em;
  font-weight: 700; color: var(--text-muted);
}
.r-kpi__value {
  font-family: var(--font-display);
  font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-strong);
  line-height: 1.1; margin: 8px 0 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  position: relative;
}
.r-kpi__foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; position: relative; padding-bottom: 26px; }
.r-kpi__foot:last-child { padding-bottom: 0; }
.r-kpi:not(:has(.r-kpi__spark)) .r-kpi__foot { padding-bottom: 0; }
.r-kpi__prev { font-size: 0.7rem; color: var(--text-dim); }

/* ── Прогресс-бары долей 1 в 1 как .an-probe-bar ── */
.r-probe-bars { display: flex; flex-direction: column; gap: 8px; margin: 6px 0 14px; }
.r-probe-bar { display: flex; flex-direction: column; gap: 4px; break-inside: avoid; }
.r-probe-bar__head { display: flex; justify-content: space-between; font-size: 0.82rem; }
.r-probe-bar__name { font-weight: 600; color: var(--text); }
.r-probe-bar__count { color: var(--text-muted); font-size: 0.78rem; }
.r-probe-bar__track {
  height: 8px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--stroke-soft); overflow: hidden;
}
.r-probe-bar__fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent-dim) 100%);
}
/* Легенда-пилюли как .an-leg-pill */
.r-leg { display: inline-flex; align-items: center; gap: 5px; font-size: 0.74rem; color: var(--text-muted); margin-right: 10px; }
.r-leg::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--leg-c, var(--accent)); box-shadow: 0 0 6px var(--leg-c, var(--accent)); }

/* ── Дельта 1 в 1 как .dx-delta ── */
.r-delta {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 0.74rem; font-weight: 700; padding: 3px 8px; border-radius: 7px;
  white-space: nowrap; font-variant-numeric: tabular-nums;
}
.r-delta--up { color: var(--emerald); background: var(--emerald-soft); }
.r-delta--down { color: var(--crimson); background: var(--crimson-soft); }
.r-delta--na { color: var(--text-dim); background: var(--stroke-soft); }

/* ── Прогресс-бары как .dx-staff-bar ── */
.r-bar { height: 4px; background: var(--stroke-soft); border-radius: 2px; overflow: hidden; }
.r-bar__fill { height: 100%; border-radius: 2px; background: var(--accent-grad); }

/* ── Таблица 1 в 1 как .cg-table на сайте ── */
.r-table-wrap {
  border-radius: 14px; border: 1px solid var(--stroke-soft);
  background: var(--surface); overflow: hidden; margin-top: 4px;
}
.r-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; line-height: 1.4; color: var(--text); }
.r-table thead th {
  background: linear-gradient(180deg, var(--panel) 0%, var(--surface) 100%);
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
  color: var(--text-muted);
  padding: 11px 14px; text-align: left;
  border-bottom: 1px solid var(--stroke-strong); white-space: nowrap;
}
.r-table thead th.num { text-align: right; }
.r-table tbody td {
  padding: 10px 14px; border-bottom: 1px solid var(--stroke-soft);
  vertical-align: middle; color: var(--text);
}
.r-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
.r-table tbody tr:last-child td { border-bottom: none; }
.r-table tbody tr:nth-child(even) td { background: ${n}; }
.r-table .num { text-align: right; font-variant-numeric: tabular-nums; }

.r-map {
  width: 100%; border-radius: 14px; overflow: hidden; border: 1px solid var(--stroke-soft);
  background: var(--elevated); display: block; object-fit: cover;
}
.r-map--gi { min-height: 240px; max-height: 320px; }
.r-chart svg { display: block; width: 100%; height: auto; min-height: 180px; }

/* Последний блок без нижнего отступа — чтобы не выталкивал пустую страницу */
.r-flow > .r-block:last-child { margin-bottom: 0; }
.r-flow > .r-block:last-child .r-card:last-child { margin-bottom: 0; }

@page { size: A4 ${e}; margin: 9mm; }
@media print {
  html, body { background: ${i} !important; }
  .r-doc { padding: 0; max-width: 100%; }
  /* KPI-сетка может рваться между карточками — иначе пустая страница после шапки */
  .r-kpis { grid-template-columns: repeat(2, 1fr); gap: 10px; break-inside: auto; page-break-inside: auto; }
  .r-kpi { break-inside: avoid; page-break-inside: avoid; }
  /* Колонки — в столбик на A4, каждая карточка отдельно */
  .r-cols { grid-template-columns: 1fr !important; gap: 12px; break-inside: auto; page-break-inside: auto; }
  .r-cols .r-card { margin-bottom: 0; }
  .r-card--keep { break-inside: avoid; page-break-inside: avoid; }
  /* Длинные списки/таблицы — тянутся, строки не рвутся */
  .r-card { break-inside: auto; page-break-inside: auto; }
  .r-card--allow-break { break-inside: auto; page-break-inside: auto; }
  .r-card--allow-break .r-table tr,
  .r-deal, .r-staff-row, .r-market-row, .r-comp-block { break-inside: avoid; page-break-inside: avoid; }
  .r-block { break-inside: auto; page-break-inside: auto; }
  .r-head { break-inside: avoid; break-after: avoid; }
}
`}function nt(t,e){const i=t.getBoundingClientRect().top,o=Math.max(4,Math.round(10*e)),n=[],a=(r,d=!0)=>{if(!r||!r.getBoundingClientRect)return;const c=r.getBoundingClientRect();if(c.height<2||c.width<2)return;const l=Math.round((c.top-i)*e)-(d?Math.round(2*e):0),p=Math.round((c.bottom-i)*e)+(d?o:0);p<=l||n.push({top:Math.max(0,l),bottom:p,hard:!!d})};return t.querySelectorAll(".r-head, .r-section-title, .r-kpis").forEach(r=>a(r,!0)),t.querySelectorAll(".r-kpi").forEach(r=>a(r,!0)),t.querySelectorAll(".r-card--keep, .r-chart").forEach(r=>a(r,!0)),t.querySelectorAll(".r-card--allow-break").forEach(r=>{a(r,!1),r.querySelectorAll("thead, tbody tr, .r-deal, .r-staff-row, .r-market-row, .r-comp-block, .r-probe-bar, .r-rank-card, .r-op-cell").forEach(d=>a(d,!0))}),t.querySelectorAll(".r-card:not(.r-card--keep):not(.r-card--allow-break)").forEach(r=>a(r,!0)),n.sort((r,d)=>r.top-d.top||r.bottom-d.bottom),n}function it(t,e,s,i){const o=Math.min(t+e,s);if(o>=s-1)return s;const n=Math.max(48,Math.floor(e*.22)),a=i.filter(d=>d.top<o&&d.bottom>o);if(a.length){const d=a.filter(p=>p.hard);if(d.length){const p=d.filter(g=>g.top<=t+4);if(p.length){const g=Math.max(...p.map(v=>v.bottom));return g-t<=e?Math.min(s,g):o}const h=Math.min(...d.map(g=>g.top));return h>t+n?h:o}const c=a.reduce((p,h)=>p.top<=h.top?p:h);let l=null;for(const p of i)p.hard&&p.top>=c.top-2&&p.bottom<=o&&p.bottom>t&&(l=p.bottom);return l!=null&&l>t+n?l:c.top>t+n?c.top:o}let r=null;for(const d of i)d.bottom<=o&&d.bottom>t&&(r=d.bottom);if(r!=null&&r>=t+e*.38){const d=i.find(c=>c.top>=r-1);return d&&d.bottom<=o?o:d&&d.top<o&&d.bottom>o?d.top:r}return o}async function ht({title:t,bodyHtml:e,theme:s,extraCss:i="",fileName:o,orientation:n="landscape"}={}){var w;const a=s||et(),r=String(o||t||"Отчёт — Reaktivo.PRO").replace(/[\\/:*?"<>|]+/g,"—").replace(/\s+/g," ").trim().slice(0,120),d=/\.pdf$/i.test(r)?r:`${r}.pdf`,c=Z(a),l=X(n),p=`${at(a,{orientation:n})}${i}
html, body { margin: 0 !important; padding: 0 !important; background: ${c} !important; background-image: none !important; }
.r-doc { max-width: ${l}px !important; width: ${l}px !important; margin: 0 auto !important; padding: 16px 18px 20px !important; background: ${c} !important; }
`,h=`<!DOCTYPE html>
<html lang="ru" data-theme="${S(a.theme)}">
<head>
<meta charset="UTF-8"/>
<title>${S(t||"Отчёт")}</title>
<link rel="stylesheet" href="/fonts/brand.css"/>
<style>${p}</style>
</head>
<body>
<div class="r-doc">${e}</div>
</body>
</html>`,g=l+70,v=document.createElement("iframe");v.setAttribute("aria-hidden","true"),v.style.cssText=`position:fixed;left:-14000px;top:0;width:${g}px;height:2400px;border:0;opacity:0;pointer-events:none;`,document.body.appendChild(v);try{const u=v.contentDocument;if(!u)throw new Error("iframe document unavailable");if(u.open(),u.write(h),u.close(),u.querySelectorAll("img.r-head__logo").forEach(k=>{k.setAttribute("src",O),k.removeAttribute("crossorigin")}),await new Promise(k=>{const $=()=>k();u.readyState==="complete"?setTimeout($,50):v.addEventListener("load",()=>setTimeout($,50),{once:!0})}),(w=u.fonts)!=null&&w.ready)try{await u.fonts.ready}catch{}const C=Array.from(u.images||[]);await Promise.all(C.map(k=>k.complete&&k.naturalWidth?Promise.resolve():new Promise($=>{k.addEventListener("load",$,{once:!0}),k.addEventListener("error",$,{once:!0})}))),await new Promise(k=>setTimeout(k,120));const y=u.querySelector(".r-doc");if(!y)throw new Error("report root missing");const f=Math.max(y.scrollHeight,y.offsetHeight)+40;v.style.height=`${Math.min(Math.max(f,400),2e4)}px`;const[{default:b},{jsPDF:_}]=await Promise.all([V(()=>D(()=>import("./html2canvas.esm-QH1iLAAe.js"),[])),V(()=>D(()=>import("./jspdf.es.min-BFsN6vIX.js").then(k=>k.j),__vite__mapDeps([0,1,2])))]),m=await b(y,{scale:2,useCORS:!0,allowTaint:!0,backgroundColor:c,logging:!1,windowWidth:g,scrollX:0,scrollY:0,onclone(k){k.querySelectorAll("style").forEach($=>{$.textContent=String($.textContent||"").replace(/color-mix\([^)]+\)/gi,"transparent").replace(/\bcolor\([^)]+\)/gi,"transparent")}),k.querySelectorAll("svg").forEach($=>{$.style.setProperty("background","transparent","important"),$.style.setProperty("background-color","transparent","important")})}}),x=m.width/Math.max(1,y.offsetWidth),M=nt(y,x),A=new _({orientation:n,unit:"mm",format:"a4",compress:!0}),E=A.internal.pageSize.getWidth(),P=A.internal.pageSize.getHeight(),R=8,z=E-R*2,L=P-R*2,H=U(c,{r:255,g:255,b:255,a:1}),tt=()=>{A.setFillColor(H.r,H.g,H.b),A.rect(0,0,E,P,"F")},j=Math.max(1,Math.floor(L/(m.height*z/m.width)*m.height));let F=0,Q=0;for(;F<m.height-2;){let k=it(F,j,m.height,M);k<=F&&(k=Math.min(m.height,F+j));const $=Math.max(1,Math.min(k,m.height)-F);if($<=1)break;const B=document.createElement("canvas");B.width=m.width,B.height=$;const J=B.getContext("2d");J.fillStyle=c,J.fillRect(0,0,B.width,B.height),J.drawImage(m,0,F,m.width,$,0,0,m.width,$);const T=$*z/m.width;if(Q>0&&T<6||(Q>0&&A.addPage(),tt(),A.addImage(B.toDataURL("image/jpeg",.92),"JPEG",R,R,z,T,void 0,"FAST"),F+=$,Q+=1,Q>40))break}return A.save(d),!0}catch(u){return console.error("[reportPrint] PDF download failed",u),!1}finally{v.remove()}}async function ft(t){if(!t)return null;const e=t.getBoundingClientRect(),s=Math.round(e.width),i=Math.round(e.height);if(s<40||i<40)return null;const o=t.querySelectorAll(".leaflet-tile-pane img");await Promise.all(Array.from(o).map(c=>c.complete&&c.naturalWidth?Promise.resolve():new Promise(l=>{c.addEventListener("load",l,{once:!0}),c.addEventListener("error",l,{once:!0})})));const n=document.createElement("canvas");n.width=s,n.height=i;const a=n.getContext("2d");if(!a)return null;const r=getComputedStyle(document.documentElement).getPropertyValue("--bg-panel-solid").trim()||"#222427";a.fillStyle=r,a.fillRect(0,0,s,i);const d=c=>{if(!(c instanceof HTMLImageElement)&&!(c instanceof HTMLCanvasElement)||c instanceof HTMLImageElement&&(!c.complete||!c.naturalWidth))return;const l=c.getBoundingClientRect(),p=l.left-e.left,h=l.top-e.top;try{a.drawImage(c,p,h,l.width,l.height)}catch{}};t.querySelectorAll(".leaflet-tile-pane img, .leaflet-overlay-pane canvas, .leaflet-marker-pane img").forEach(d);try{return n.toDataURL("image/png")}catch{return null}}function K(t){return t>=1e6?`${(t/1e6).toFixed(1)}M`:t>=1e3?`${Math.round(t/1e3)}k`:String(Math.round(t))}function N(t){const e=t.length;if(e===0)return"";if(e===1)return`M${t[0].x.toFixed(2)} ${t[0].y.toFixed(2)}`;const s=[],i=[],o=[];for(let r=0;r<e-1;r++)s.push(t[r+1].x-t[r].x),i.push(t[r+1].y-t[r].y),o.push(s[r]===0?0:i[r]/s[r]);const n=[o[0]];for(let r=1;r<e-1;r++)if(o[r-1]*o[r]<=0)n.push(0);else{const d=2*s[r]+s[r-1],c=s[r]+2*s[r-1];n.push((d+c)/(d/o[r-1]+c/o[r]))}n.push(o[e-2]);let a=`M${t[0].x.toFixed(2)} ${t[0].y.toFixed(2)}`;for(let r=0;r<e-1;r++){const d=t[r].x,c=t[r].y,l=t[r+1].x,p=t[r+1].y,h=(l-d)/3;a+=` C${(d+h).toFixed(2)} ${(c+n[r]*h).toFixed(2)} ${(l-h).toFixed(2)} ${(p-n[r+1]*h).toFixed(2)} ${l.toFixed(2)} ${p.toFixed(2)}`}return a}function Y(t){const e=String(t.x??t.day??"");return e.length>=10?`${e.slice(8,10)}.${e.slice(5,7)}`:e}function gt(t,e,{valueKey:s="sumRub",gradId:i="spark"}={}){const o=Array.isArray(t)?t:[];if(o.length<2)return"";const n=220,a=38,r=o.map(h=>Number(h[s]??0)||0),d=Math.max(...r,1),c=o.map((h,g)=>({x:g/(o.length-1)*n,y:4+(a-6)-r[g]/d*(a-6)})),l=N(c),p=`${l} L${n} ${a} L0 ${a} Z`;return`
    <svg class="r-spark-svg" viewBox="0 0 ${n} ${a}" preserveAspectRatio="none" aria-hidden="true" style="background:transparent">
      <rect width="${n}" height="${a}" fill="none"/>
      <defs>
        <linearGradient id="${i}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${e.accent}" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="${e.accent}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${p}" fill="url(#${i})"/>
      <path d="${l}" fill="none" stroke="${e.accent}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`}function mt(t,e,{valueKey:s="sum",gradId:i="rGrad",height:o=210,color:n}={}){const a=Array.isArray(t)?t:[];if(a.length<2)return'<div class="r-empty">Нет данных за период</div>';const r=n||e.accent,d=760,c=o,l={top:14,right:14,bottom:26,left:50},p=d-l.left-l.right,h=c-l.top-l.bottom,g=a.map(x=>Number(x[s]??x.sum??x.sumRub)||0),v=Math.max(...g,1),w=x=>l.left+x/(a.length-1)*p,u=x=>l.top+h-x/v*h,C=a.map((x,M)=>({x:w(M),y:u(g[M])})),y=N(C),f=`${y} L${w(a.length-1).toFixed(2)} ${u(0).toFixed(2)} L${w(0).toFixed(2)} ${u(0).toFixed(2)} Z`;let b="";for(let x=0;x<=4;x++){const M=v/4*x,A=u(M).toFixed(1);b+=`<line x1="${l.left}" y1="${A}" x2="${d-l.right}" y2="${A}" stroke="${e.strokeSoft}" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>`,b+=`<text x="${l.left-8}" y="${Number(A)+3}" text-anchor="end" font-size="10" fill="${e.textMuted}">${K(M)}</text>`}const _=Math.max(1,Math.ceil(a.length/7));let m="";for(let x=0;x<a.length;x+=_)m+=`<text x="${w(x).toFixed(1)}" y="${c-8}" text-anchor="middle" font-size="10" fill="${e.textMuted}">${S(Y(a[x]))}</text>`;return`
    <svg class="r-chart" viewBox="0 0 ${d} ${c}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" style="background:transparent">
      <rect width="${d}" height="${c}" fill="none"/>
      <defs>
        <linearGradient id="${i}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${r}" stop-opacity="0.55"/>
          <stop offset="60%" stop-color="${r}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${r}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${b}
      <path d="${f}" fill="url(#${i})"/>
      <path d="${y}" fill="none" stroke="${r}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${m}
    </svg>`}function ut(t,e,s,{height:i=230}={}){const o=Array.isArray(t)?t:[];if(o.length<2||!(s!=null&&s.length))return'<div class="r-empty">Нет данных за период</div>';const n=760,a=i,r={top:14,right:14,bottom:26,left:46},d=n-r.left-r.right,c=a-r.top-r.bottom,l=s.flatMap(f=>o.map(b=>Number(b[f.key])||0)),p=Math.max(...l,1),h=f=>r.left+f/(o.length-1)*d,g=f=>r.top+c-f/p*c;let v="";for(let f=0;f<=4;f++){const b=p/4*f,_=g(b).toFixed(1);v+=`<line x1="${r.left}" y1="${_}" x2="${n-r.right}" y2="${_}" stroke="${e.strokeSoft}" stroke-width="1" stroke-dasharray="3 7"/>`,v+=`<text x="${r.left-8}" y="${Number(_)+3}" text-anchor="end" font-size="10" fill="${e.textMuted}">${K(b)}</text>`}const w=Math.max(1,Math.ceil(o.length/7));let u="";for(let f=0;f<o.length;f+=w)u+=`<text x="${h(f).toFixed(1)}" y="${a-8}" text-anchor="middle" font-size="10" fill="${e.textMuted}">${S(Y(o[f]))}</text>`;let C="",y="";return s.forEach(f=>{const b=o.map(M=>Number(M[f.key])||0),_=o.map((M,A)=>({x:h(A),y:g(b[A])})),m=N(_),x=`${m} L${h(o.length-1).toFixed(2)} ${g(0).toFixed(2)} L${h(0).toFixed(2)} ${g(0).toFixed(2)} Z`;C+=`
      <linearGradient id="${f.gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${f.color}" stop-opacity="0.42"/>
        <stop offset="65%" stop-color="${f.color}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${f.color}" stop-opacity="0"/>
      </linearGradient>`,y+=`
      <path d="${x}" fill="url(#${f.gradId})"/>
      <path d="${m}" fill="none" stroke="${f.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`}),`
    <svg class="r-chart" viewBox="0 0 ${n} ${a}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" style="background:transparent">
      <rect width="${n}" height="${a}" fill="none"/>
      <defs>${C}</defs>
      ${v}
      ${y}
      ${u}
    </svg>`}function xt(t,e,{labelKey:s="name",valueKey:i="value",height:o=210,color:n}={}){const a=(Array.isArray(t)?t:[]).slice(0,31);if(!a.length)return'<div class="r-empty">Нет данных</div>';const r=n||e.accent,d=760,c=o,l={top:14,right:12,bottom:26,left:40},p=d-l.left-l.right,h=c-l.top-l.bottom,g=Math.max(...a.map(b=>Number(b[i])||0),1),v=p/a.length,w=Math.min(28,Math.max(8,v*.6));let u="";for(let b=0;b<=4;b++){const _=g/4*b,m=(l.top+h-_/g*h).toFixed(1);u+=`<line x1="${l.left}" y1="${m}" x2="${d-l.right}" y2="${m}" stroke="${e.strokeSoft}" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>`,u+=`<text x="${l.left-8}" y="${Number(m)+3}" text-anchor="end" font-size="10" fill="${e.textMuted}">${K(_)}</text>`}let C="",y="";const f=Math.max(1,Math.ceil(a.length/8));return a.forEach((b,_)=>{const m=Number(b[i])||0,x=Math.max(1.5,m/g*h),M=l.left+_*v+(v-w)/2,A=l.top+h-x,E=Math.min(4,w/2),P=m>0?r:e.strokeSoft;if(C+=`<path d="M${M.toFixed(1)} ${(A+E).toFixed(1)} q0 -${E} ${E} -${E} h${(w-2*E).toFixed(1)} q${E} 0 ${E} ${E} v${(x-E).toFixed(1)} h-${w.toFixed(1)} Z" fill="${P}"/>`,_%f===0){const R=String(b[s]??"");if(/^\d{4}-\d{2}-\d{2}/.test(R))y+=`<text x="${(M+w/2).toFixed(1)}" y="${c-8}" text-anchor="middle" font-size="10" fill="${e.textMuted}">${S(`${R.slice(8,10)}.${R.slice(5,7)}`)}</text>`;else{const L=(M+w/2).toFixed(1);y+=`<text x="${L}" y="${c-8}" text-anchor="end" font-size="9.5" fill="${e.textMuted}" transform="rotate(-30 ${L} ${c-8})">${S(R.slice(0,14))}</text>`}}}),`
    <svg class="r-chart" viewBox="0 0 ${d} ${c}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" style="background:transparent">
      <rect width="${d}" height="${c}" fill="none"/>
      ${u}
      ${C}
      ${y}
    </svg>`}function bt(t,{labelKey:e="name",countKey:s="count",shareKey:i="share"}={}){const o=Array.isArray(t)?t:[];return o.length?`<div class="r-probe-bars">${o.map(n=>{const a=Number(n[i])||0;return`
      <div class="r-probe-bar">
        <div class="r-probe-bar__head">
          <span class="r-probe-bar__name">${S(String(n[e]??""))}</span>
          <span class="r-probe-bar__count mono-nums">${S(String(n[s]??""))} · ${a.toFixed(0)}%</span>
        </div>
        <div class="r-probe-bar__track"><div class="r-probe-bar__fill" style="width:${Math.max(2,a)}%"></div></div>
      </div>`}).join("")}</div>`:""}export{lt as a,xt as b,pt as c,ut as d,S as e,rt as f,ft as g,ct as h,dt as k,mt as l,ht as o,bt as p,et as r,gt as s};
