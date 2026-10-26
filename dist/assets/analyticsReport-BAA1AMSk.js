import{r as x,f as S,a as h,k as p,s as _,l as N,e as $,p as C,d as M,b as F,o as G,c as I}from"./reportPrint-DeEijmyd.js";import"./index-BqmuNESO.js";function K(s,t){return s==null||t==null||!Number.isFinite(s)||!Number.isFinite(t)||t===0?null:(s-t)/Math.abs(t)*100}function v(s,t){const a=K(s,t);return a==null?'<span class="r-delta r-delta--na">—</span>':`<span class="r-delta r-delta--${a>=0?"up":"down"}">${a>=0?"▲":"▼"} ${Math.abs(a).toFixed(1)}%</span>`}function W(s){const t=s.weightGross!=null?Number(s.weightGross).toFixed(2):"—",a=s.weightNet!=null?Number(s.weightNet).toFixed(3):"—";return`${t} / ${a}`}const A=`
.r-op-cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.r-op-cell__email { font-weight: 600; color: var(--text); font-size: 0.82rem; word-break: break-all; }
.r-op-cell__share { font-size: 0.7rem; color: var(--text-dim); }
.r-op-bar { height: 4px; border-radius: 999px; background: var(--surface); border: 1px solid var(--stroke-soft); overflow: hidden; max-width: 180px; }
.r-op-bar__fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--accent) 0%, var(--accent-dim) 100%); }
`;async function D(s={}){var f;const t=s.data||{},a=((f=s.prevData)==null?void 0:f.totals)||null,e=t.totals||{},u=s.formatMoney||(l=>String(l)),n=x(),y=S(),w=s.authorName||"",m=new Set(s.sections||["summary"]),g=s.periodLabel||"",i=s.moneySeries||[],k=s.group==="week"?"по неделям":s.group==="month"?"по месяцам":"по дням",o=[];if(m.has("summary")){const l=e.deals?(e.sumRub||0)/e.deals:null,r=a!=null&&a.deals?(a.sumRub||0)/a.deals:null;o.push(h(`Сводка KPI · ${g}`,`<div class="r-kpis">
          ${p({icon:"money",hero:!0,label:"Оборот, ₽",valueHtml:u(e.sumRub??0),deltaHtml:v(e.sumRub,a==null?void 0:a.sumRub),prevHtml:`пред.: ${(a==null?void 0:a.sumRub)!=null?u(a.sumRub):"—"}`,sparkHtml:_(i,n,{valueKey:"sumRub",gradId:"kSpSum"})})}
          ${p({icon:"deals",tone:"emerald",label:"Сделок",valueHtml:String(e.deals??0),deltaHtml:v(e.deals,a==null?void 0:a.deals),prevHtml:`пред.: ${(a==null?void 0:a.deals)??"—"}`,sparkHtml:_(i,n,{valueKey:"count",gradId:"kSpDeals"})})}
          ${p({icon:"clients",label:"Клиентов",valueHtml:String(e.uniqueCustomers??0),deltaHtml:v(e.uniqueCustomers,a==null?void 0:a.uniqueCustomers),prevHtml:`пред.: ${(a==null?void 0:a.uniqueCustomers)??"—"}`})}
          ${p({icon:"avg",label:"Средний чек",valueHtml:l!=null?u(Math.round(l)):"—",deltaHtml:v(l,r),prevHtml:`пред.: ${r!=null?u(Math.round(r)):"—"}`})}
         </div>`))}if(m.has("series")&&o.push(h(null,`<div class="r-card r-card--keep">
          <div class="r-card__title">Денежный поток</div>
          <div class="r-card__sub">Оборот ${k}. Заливка показывает накопленный объём.</div>
          ${N(i,n,{valueKey:"sumRub",gradId:"anFlow"})}
        </div>`)),m.has("probe")){const l=t.byProbe||[],r=l.reduce((d,R)=>d+(Number(R.count)||0),0),c=l.map(d=>({name:`${d.probe} пр.`,count:d.count??0,share:r?(Number(d.count)||0)/r*100:0})),b=l.map(d=>`<tr>
          <td>${$(String(d.probe??"—"))} пр.</td>
          <td class="num">${d.count??0}</td>
          <td class="num">${W(d)}</td>
          <td class="num">${d.sumRub!=null?u(d.sumRub):"—"}</td>
        </tr>`).join("");o.push(h(null,`<div class="r-card r-card--allow-break">
          <div class="r-card__title">Сделок по пробе</div>
          <div class="r-card__sub">По первой строке таблицы в договоре (лом, до трёх позиций). Сделок, вес, сумма по пробе.</div>
          ${C(c)}
          <div class="r-table-wrap">
            <table class="r-table">
              <thead><tr><th>Проба</th><th class="num">Сделок</th><th class="num">Вес, г (лом / чист.)</th><th class="num">Сумма, ₽</th></tr></thead>
              <tbody>${b||'<tr><td colspan="4" class="r-empty">Нет данных</td></tr>'}</tbody>
            </table>
          </div>
        </div>`))}if(m.has("series")&&i.some(r=>r.weightGross!=null||r.weightNet!=null)&&o.push(h(null,`<div class="r-card r-card--keep">
            <div class="r-card__title">Вес золота — динамика</div>
            <div class="r-card__sub">
              <span class="r-leg" style="--leg-c: var(--emerald)">общий, г</span>
              <span class="r-leg" style="--leg-c: var(--accent)">чистый, г</span>
              — по первой строке договора.
            </div>
            ${M(i,n,[{key:"weightGross",color:n.emerald,gradId:"anWG"},{key:"weightNet",color:n.accent,gradId:"anWN"}])}
          </div>`)),m.has("operators")&&t.viewerScope!=="self"){const r=(t.byOperator||[]).map(c=>{const b=e.sumRub?Math.round((c.sumRub||0)/e.sumRub*100):0;return`<tr>
          <td>
            <div class="r-op-cell">
              <span class="r-op-cell__email">${$(c.email||c.displayName||"—")}</span>
              <div class="r-op-bar"><div class="r-op-bar__fill" style="width:${Math.max(2,b)}%"></div></div>
              <span class="r-op-cell__share">${b}% оборота</span>
            </div>
          </td>
          <td class="num">${c.deals??0}</td>
          <td class="num">${u(c.sumRub??0)}</td>
        </tr>`}).join("");o.push(h(null,`<div class="r-card r-card--allow-break">
          <div class="r-card__title">Сотрудники</div>
          <div class="r-card__sub">Сделки и оборот по учётным записям за период</div>
          <div class="r-table-wrap">
            <table class="r-table">
              <thead><tr><th>Учётная запись</th><th class="num">Сделок</th><th class="num">Оборот, ₽</th></tr></thead>
              <tbody>${r||'<tr><td colspan="3" class="r-empty">Нет данных</td></tr>'}</tbody>
            </table>
          </div>
        </div>`))}if(m.has("series")&&i.length>1&&o.push(h(null,`<div class="r-card r-card--keep">
          <div class="r-card__title">Сделок по дням</div>
          <div class="r-card__sub">Распределение количества сделок по календарным дням периода.</div>
          ${F(i,n,{labelKey:"x",valueKey:"count"})}
        </div>`)),!o.length)return!1;const H={sectionTitle:"Аналитика",authorName:w,generatedAt:y};return G({title:`Аналитика — ${g}`,fileName:`Аналитика — ${g||"отчёт"}`,bodyHtml:I({header:H,blocks:o}),theme:n,extraCss:A})}export{D as openAnalyticsReport};
