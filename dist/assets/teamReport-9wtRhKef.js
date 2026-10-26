import{r as x,f as w,e as u,a as o,k as t,s as $,l as y,o as R,c as S}from"./reportPrint-x7Z-8Xvp.js";import"./index-LZdH9KRB.js";const H=`
.r-rank { display: flex; flex-direction: column; gap: 8px; }
.r-rank__row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 14px;
  border: 1px solid var(--stroke-soft); background: var(--elevated);
  break-inside: avoid; page-break-inside: avoid;
}
.r-rank__row--high { border-color: rgba(254, 0, 0, 0.35); }
.r-rank__badge {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.9rem; font-weight: 700; font-family: var(--font-display);
  background: var(--surface); color: var(--text-muted);
}
.r-rank__badge--1 { background: linear-gradient(135deg, #ffd86b, #f5a623); color: #5a3d00; font-size: 1.05rem; }
.r-rank__badge--2 { background: linear-gradient(135deg, #e2e8f0, #b9c2cf); color: #3a3f47; font-size: 1.05rem; }
.r-rank__badge--3 { background: linear-gradient(135deg, #f0b27a, #d98841); color: #4a2c0a; font-size: 1.05rem; }
.r-rank__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.r-rank__email { font-size: 0.88rem; font-weight: 600; color: var(--text); word-break: break-word; }
.r-rank__meta { display: flex; gap: 10px; font-size: 0.74rem; color: var(--text-muted); flex-wrap: wrap; }
.r-rank__right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; min-width: 130px; }
.r-rank__sum { font-size: 0.95rem; font-weight: 700; color: var(--text-strong); font-family: var(--font-display); }
.r-rank__share { display: flex; align-items: center; gap: 7px; width: 100%; }
.r-rank__share-bar { flex: 1; height: 5px; border-radius: 999px; background: var(--surface); overflow: hidden; }
.r-rank__share-fill { height: 100%; border-radius: 999px; background: var(--accent-grad); }
.r-rank__share-pct { font-size: 0.72rem; color: var(--text-muted); min-width: 32px; text-align: right; }
`,z={1:"🥇",2:"🥈",3:"🥉"};async function P(s={}){const i=s.data||{},l=s.formatMoney||(a=>String(a)),d=x(),_=w(),g=s.authorName||"",n=s.periodLabel||"",r=i.totals||{},c=i.operators||i.ranking||[],m=s.chartSeries||[],k=c.map((a,h)=>{const e=a.rank??h+1,p=a.shareRubPct!=null?Number(a.shareRubPct):r.sumRub?Math.round((a.sumRub||0)/r.sumRub*100):0,f=a.email||a.displayName||a.name||"—",b=a.weightGrossSum!=null||a.weightNetSum!=null?`<span>${(a.weightGrossSum??0).toFixed(2)} / ${(a.weightNetSum??0).toFixed(3)} г</span>`:"";return`
      <div class="r-rank__row${a.tier==="high"||e===1?" r-rank__row--high":""}">
        <span class="r-rank__badge${e<=3?` r-rank__badge--${e}`:""}">${e<=3?z[e]:e}</span>
        <div class="r-rank__main">
          <span class="r-rank__email">${u(f)}</span>
          <div class="r-rank__meta">
            <span>${a.deals??0} сд.</span>
            ${b}
          </div>
        </div>
        <div class="r-rank__right">
          <span class="r-rank__sum mono-nums">${l(a.sumRub??0)}</span>
          <div class="r-rank__share">
            <div class="r-rank__share-bar"><div class="r-rank__share-fill" style="width:${Math.min(100,Math.max(2,p))}%"></div></div>
            <span class="r-rank__share-pct">${p}%</span>
          </div>
        </div>
      </div>`}).join(""),v=[o(`Сводка · ${n}`,`<div class="r-kpis">
        ${t({icon:"money",hero:!0,label:"Оборот, ₽",valueHtml:l(r.sumRub??0),sparkHtml:$(m,d,{valueKey:"sumRub",gradId:"tmSpSum"})})}
        ${t({icon:"deals",tone:"emerald",label:"Сделок",valueHtml:String(r.deals??0)})}
        ${t({icon:"clients",label:"Сотрудников",valueHtml:String(c.length)})}
        ${t({icon:"avg",label:"Средний чек",valueHtml:r.deals?l(Math.round((r.sumRub||0)/r.deals)):"—"})}
     </div>`),o(null,`<div class="r-card r-card--keep">
        <div class="r-card__title">Динамика оборота</div>
        <div class="r-card__sub">${u(n)}</div>
        ${y(m,d,{valueKey:"sumRub",gradId:"tmFlow"})}
      </div>`),o(null,`<div class="r-card r-card--allow-break">
        <div class="r-card__title">Рейтинг по обороту</div>
        <div class="r-card__sub">Сортировка по сумме · доля от оборота в этом отчёте</div>
        <div class="r-rank">${k||'<div class="r-empty">Нет данных</div>'}</div>
      </div>`)];return R({title:`Команда и KPI — ${n}`,fileName:`Команда и KPI — ${n||"отчёт"}`,bodyHtml:S({header:{sectionTitle:"Команда и KPI",authorName:g,generatedAt:_},blocks:v}),theme:d,extraCss:H})}export{P as openTeamReport};
