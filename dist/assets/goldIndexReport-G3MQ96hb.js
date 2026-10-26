import{r as w,f as P,g as j,k as l,b as F,e,a as s,o as z,c as G}from"./reportPrint-x7Z-8Xvp.js";import"./index-LZdH9KRB.js";const A=`
.r-gi-map-chart { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.r-gi-map-chart .r-card { margin-bottom: 0; }
.r-comp-block {
  margin-bottom: 10px; padding: 12px 14px;
  border-radius: 12px; border: 1px solid var(--stroke-soft); background: var(--surface);
  break-inside: avoid; page-break-inside: avoid;
}
.r-comp-block:last-child { margin-bottom: 0; }
.r-comp-city { font-weight: 600; color: var(--text); font-size: 0.86rem; margin-bottom: 2px; }
.r-comp-meta { font-size: 0.68rem; color: var(--text-dim); margin-bottom: 8px; }
@media print {
  .r-gi-map-chart { grid-template-columns: 1fr; }
}
`;function D(r){return r==null||!Number.isFinite(Number(r))?"—":new Intl.NumberFormat("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(r))}async function T(r={}){var g,b,h;const a=r.data||{},n=r.formatMoney||(t=>String(t)),u=w(),y=P(),k=r.authorName||"",x=a.goldRubPerGram!=null?n(a.goldRubPerGram):null;let i=null;try{i=await j(r.mapEl||null)}catch{i=null}const m=r.regionsChart||(a.regions||[]).map(t=>({name:t.regionName||t.region_name||"—",value:Number(t.ratioAvg)||0})),R=`
    <div class="r-kpis">
      ${l({icon:"gold",label:"Биржа (эталон)",valueHtml:`${a.goldRubPerGram!=null?n(a.goldRubPerGram):"—"} <span style="font-size:0.72rem;color:var(--text-muted)">₽/г</span>`})}
      ${l({icon:"money",label:"Выкуп лома",valueHtml:`${((g=a.settingsSnapshot)==null?void 0:g.buybackPercentOfScrap)??"—"}<span style="font-size:0.72rem;color:var(--text-muted)">%</span>`})}
      ${l({icon:"team",tone:"emerald",label:"Городов",valueHtml:String(((b=a.stats)==null?void 0:b.cityCount)??(a.cities||[]).length??0)})}
      ${l({icon:"clients",label:"Охват населения",valueHtml:((h=a.stats)==null?void 0:h.populationCovered)!=null?new Intl.NumberFormat("ru-RU").format(a.stats.populationCovered):"—"})}
    </div>`,d=i?`<img class="r-map r-map--gi" src="${i}" alt=""/>`:"",v=d||m.length?`<div class="r-gi-map-chart">
          ${d?`<div class="r-card r-card--keep">${d}</div>`:""}
          <div class="r-card r-card--keep">
            <div class="r-card__title">Индекс по регионам</div>
            <div class="r-card__sub">${m.length} регион(ов)</div>
            ${F(m,u,{labelKey:"name",valueKey:"value"})}
          </div>
        </div>`:"",_=(a.regions||[]).map(t=>`
      <tr>
        <td>${e(t.regionName||"")}</td>
        <td class="num">${t.cityCount??"—"}</td>
        <td class="num">${D(t.ratioAvg)}</td>
      </tr>`).join(""),c=a.cities||[],N=c.length?c.map(t=>{const H=(t.competitors||[]).map(o=>{const f=Object.entries(o.probes||{}).map(([S,p])=>`${S}: ${n(typeof p=="number"?p:parseFloat(p))}`).join("; ");return`<div style="margin:4px 0 6px;font-size:0.74rem">
                <b>${e(o.companyName||"—")}</b>
                ${f?` · ${e(f)}`:""}
                ${o.address?`<div style="color:var(--text-dim)">${e(o.address)}</div>`:""}
              </div>`}).join(""),$=[t.street,t.building].filter(Boolean).join(", ");return`<div class="r-comp-block">
            <div class="r-comp-city">${e(t.city_name||t.cityName||t.name||"Город")}</div>
            <div class="r-comp-meta">${e(t.region_name||t.regionName||"")}${$?` · ${e($)}`:""}</div>
            ${H||'<div class="r-empty" style="padding:6px 0">Нет конкурентов</div>'}
          </div>`}).join(""):'<div class="r-empty">Нет городов</div>',C=[s(null,R),...v?[s(null,v)]:[],s(null,`<div class="r-card r-card--allow-break">
        <div class="r-card__title">Сводка по регионам</div>
        <div class="r-card__sub">${(a.regions||[]).length} регион(ов)</div>
        <div class="r-table-wrap">
          <table class="r-table">
            <thead><tr><th>Регион</th><th class="num">Городов</th><th class="num">Индекс ср.</th></tr></thead>
            <tbody>${_||'<tr><td colspan="3" class="r-empty">Нет данных</td></tr>'}</tbody>
          </table>
        </div>
      </div>`),s(null,`<div class="r-card r-card--allow-break">
        <div class="r-card__title">Города и конкуренты</div>
        <div class="r-card__sub">${c.length} город(ов)</div>
        ${N}
      </div>`)];return z({title:"Индекс золота — Reaktivo.PRO",fileName:"Индекс золота — Reaktivo.PRO",bodyHtml:G({header:{sectionTitle:"Индекс золота",authorName:k,generatedAt:y,goldRate:x,goldSource:"биржа"},blocks:C}),theme:u,extraCss:A})}export{T as openGoldIndexReport};
