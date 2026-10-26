import{r as E,f as O,s as P,e as i,a as c,l as W,o as B,c as G,k as X,h as q}from"./reportPrint-DeEijmyd.js";import{W as J,t as Q,a as V,b as Y}from"./index-BqmuNESO.js";function Z(a,t){return a==null||t==null||!Number.isFinite(a)||!Number.isFinite(t)||t===0?null:(a-t)/Math.abs(t)*100}function aa(a,t,s=!1){const l=Z(a,t);if(l==null)return'<span class="r-delta r-delta--na">—</span>';const o=s?l<0:l>=0,n=l>=0?"▲":"▼";return`<span class="r-delta r-delta--${o?"up":"down"}">${n} ${Math.abs(l).toFixed(1)}%</span>`}function m(a,t,s,l,o,n="money",d="",r="",p=!1){return X({icon:n,tone:d,hero:p,label:a,valueHtml:t,deltaHtml:aa(s,l),prevHtml:`пред.: ${o}`,sparkHtml:r})}async function ea(a){const t=new Date,s=a==="light";return`<div class="r-clocks">${(await Promise.all(J.map(async o=>{const n=s?o.imgLight:o.imgDark,d=await q(n),{hm:r}=Q(t,o.tz),p=V(t,o.tz),v=Y(t,o.tz),f=d?`<img class="r-clock__bg" src="${d}" alt="" decoding="sync" />`:"";return`
        <div class="r-clock r-clock--${i(o.key)}">
          ${f}
          <div class="r-clock__shade" aria-hidden="true"></div>
          <div class="r-clock__top">
            <span class="r-clock__city">${i(o.label)}</span>
            <span class="r-clock__code">${i(o.code)}${v?` · ${i(v)}`:""}</span>
          </div>
          <div class="r-clock__bottom">
            <span class="r-clock__time mono-nums">${i(r)}</span>
            <span class="r-clock__date">${i(p)}</span>
          </div>
        </div>`}))).join("")}</div>`}const ra=`
.r-card--today {
  position: relative; overflow: hidden;
  background: linear-gradient(168deg, var(--today-tint) 0%, var(--panel) 64%);
  border-color: rgba(254, 0, 0, 0.28);
}
.r-card--today .r-card__title { color: rgba(254, 80, 80, 0.85); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
.r-today { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.r-today__stat { display: flex; flex-direction: column; }
.r-today__v { font-family: var(--font-display); font-size: 1.7rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-strong); line-height: 1.1; }
.r-today__k { font-size: 0.75rem; color: var(--text-muted); margin-top: 1px; }

.r-clocks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 2px;
}
.r-clock {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  min-height: 108px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #1a1c1f;
  isolation: isolate;
  break-inside: avoid;
  page-break-inside: avoid;
}
.r-clock__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 38%;
  z-index: 0;
  pointer-events: none;
}
.r-clock__shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(8, 9, 12, 0.62) 0%, rgba(8, 9, 12, 0.18) 42%, rgba(8, 9, 12, 0.66) 100%);
  pointer-events: none;
}
.r-clock--moscow .r-clock__shade {
  background:
    linear-gradient(180deg, rgba(8, 9, 12, 0.62) 0%, rgba(8, 9, 12, 0.18) 42%, rgba(8, 9, 12, 0.66) 100%),
    linear-gradient(120deg, rgba(254, 0, 0, 0.22), transparent 55%);
}
.r-clock__top,
.r-clock__bottom {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.r-clock__city {
  font-size: 0.78rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.01em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
}
.r-clock__code {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.86);
  background: rgba(10, 11, 15, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}
.r-clock__time {
  font-family: var(--font-display);
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #fff;
  line-height: 1;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.6);
  font-variant-numeric: tabular-nums;
}
.r-clock__date {
  font-size: 0.68rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
  white-space: nowrap;
}

.r-probes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media print { .r-probes { grid-template-columns: repeat(2, 1fr); } }
.r-probe {
  display: flex; flex-direction: column; gap: 5px; padding: 11px 13px;
  border-radius: 12px; border: 1px solid var(--stroke-soft); background: var(--surface); min-width: 0;
}
.r-probe--hot { border-color: var(--accent); }
.r-probe--hot .r-probe__name { color: var(--accent); }
.r-probe__name { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; color: var(--text-dim); }
.r-probe__price { font-size: 0.92rem; font-weight: 700; color: var(--text-strong); white-space: nowrap; }
.r-probe__bar { height: 3px; background: var(--stroke-soft); border-radius: 2px; overflow: hidden; }
.r-probe__bar-fill { height: 100%; border-radius: 2px; background: var(--accent-grad); }

.r-staff { display: flex; flex-direction: column; gap: 12px; }
.r-staff-row { display: flex; align-items: center; gap: 10px; min-width: 0; break-inside: avoid; page-break-inside: avoid; }
.r-staff-rank {
  width: 24px; height: 24px; border-radius: 7px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 0.74rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.r-staff-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.r-staff-name { font-size: 0.82rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-staff-right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
.r-staff-sum { font-size: 0.8rem; font-weight: 700; color: var(--text-strong); }
.r-staff-deals { font-size: 0.68rem; color: var(--text-dim); }

.r-market { display: flex; flex-direction: column; gap: 10px; }
.r-market-row {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  border-radius: 12px; border: 1px solid var(--stroke-soft); background: var(--surface); min-width: 0;
  break-inside: avoid; page-break-inside: avoid;
}
.r-market-city { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.r-market-name { font-size: 0.86rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-market-region { font-size: 0.68rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-market-avg { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.r-adv { font-size: 0.78rem; font-weight: 700; padding: 3px 9px; border-radius: 7px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.r-adv--good { color: var(--emerald); background: var(--emerald-soft); }
.r-adv--bad { color: var(--crimson); background: var(--crimson-soft); }
.r-adv--na { color: var(--text-dim); background: var(--stroke-soft); }

.r-deals { display: flex; flex-direction: column; }
.r-deal {
  display: flex; align-items: center; gap: 11px; padding: 9px 6px; min-width: 0;
  border-bottom: 1px solid var(--stroke-soft);
  break-inside: avoid; page-break-inside: avoid;
}
.r-deal:last-child { border-bottom: none; }
.r-deal__avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--accent-soft); color: var(--accent);
  font-size: 0.82rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.r-deal__mid { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.r-deal__name { font-size: 0.84rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-deal__meta { font-size: 0.7rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-deal__right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
.r-deal__sum { font-size: 0.84rem; font-weight: 700; color: var(--text-strong); }
.r-deal__time { font-size: 0.68rem; color: var(--text-dim); }
.r-flow-chart { margin: 0 -4px; }
.r-cols--today { grid-template-columns: 0.9fr 1.1fr; }
`;async function ia(a){var g,u,b,x,_,h,k,w,y,$,z,S,H,j,L,M,R,C,D,N;const t=E(),s=a.formatMoney||(e=>String(e)),l=a.generatedAt||O(),o=a.userName||"",n=((g=a.gold)==null?void 0:g.value)!=null?s(a.gold.value):null,d=((u=a.gold)==null?void 0:u.source)||"",r=a.kpis||{},p=P(a.flow||[],t,{valueKey:"sum",gradId:"dxSpSum"}),v=[m("Оборот",s(((b=r.sum)==null?void 0:b.cur)??0),(x=r.sum)==null?void 0:x.cur,(_=r.sum)==null?void 0:_.prev,((h=r.sum)==null?void 0:h.prev)!=null?s(r.sum.prev):"—","money","",p,!0),m("Сделок",String(((k=r.deals)==null?void 0:k.cur)??0),(w=r.deals)==null?void 0:w.cur,(y=r.deals)==null?void 0:y.prev,(($=r.deals)==null?void 0:$.prev)!=null?String(r.deals.prev):"—","deals","emerald",P(a.flow||[],t,{valueKey:"n",gradId:"dxSpDeals"})),m("Клиентов",String(((z=r.clients)==null?void 0:z.cur)??0),(S=r.clients)==null?void 0:S.cur,(H=r.clients)==null?void 0:H.prev,((j=r.clients)==null?void 0:j.prev)!=null?String(r.clients.prev):"—","clients"),m("Средний чек",((L=r.avg)==null?void 0:L.cur)!=null?s(Math.round(r.avg.cur)):"—",(M=r.avg)==null?void 0:M.cur,(R=r.avg)==null?void 0:R.prev,((C=r.avg)==null?void 0:C.prev)!=null?s(Math.round(r.avg.prev)):"—","avg")].join(""),f=await ea(t.theme),I=(a.probes||[]).length?(a.probes||[]).map(e=>`
        <div class="r-probe${e.probe===585?" r-probe--hot":""}">
          <span class="r-probe__name">${e.probe}</span>
          <span class="r-probe__price mono-nums">${s(Math.round(e.v))}</span>
          <div class="r-probe__bar"><div class="r-probe__bar-fill" style="width:${Math.round(e.probe/999*100)}%"></div></div>
        </div>`).join(""):'<div class="r-empty">Нет данных о курсе</div>',F=(a.staff||[]).length?(a.staff||[]).map((e,U)=>`
        <div class="r-staff-row">
          <span class="r-staff-rank">${U+1}</span>
          <div class="r-staff-mid">
            <span class="r-staff-name">${i(e.name)}</span>
            <div class="r-bar"><div class="r-bar__fill" style="width:${Math.max(3,e.share||0)}%"></div></div>
          </div>
          <div class="r-staff-right">
            <span class="r-staff-sum mono-nums">${s(e.sumRub||0)}</span>
            <span class="r-staff-deals">${e.deals||0} сд. · ${e.share||0}%</span>
          </div>
        </div>`).join(""):`<div class="r-empty">${a.viewerScope==="self"?"Доступна только своя статистика":"Нет данных"}</div>`,A=(a.market||[]).length?(a.market||[]).map(e=>`
        <div class="r-market-row">
          <div class="r-market-city">
            <span class="r-market-name">${i(e.name)}</span>
            <span class="r-market-region">${i(e.region||"")}${e.comps!=null?` · ${e.comps} конк.`:""}</span>
          </div>
          <span class="r-market-avg">${e.avg!=null?s(Math.round(e.avg)):"—"}</span>
          ${e.adv!=null?`<span class="r-adv r-adv--${e.adv>=0?"good":"bad"}">${e.adv>=0?"+":""}${e.adv.toFixed(1)}%</span>`:'<span class="r-adv r-adv--na">—</span>'}
        </div>`).join(""):'<div class="r-empty">Нет данных по рынку</div>',K=(a.recent||[]).length?(a.recent||[]).map(e=>`
        <div class="r-deal">
          <span class="r-deal__avatar">${i((e.name||"?").trim().slice(0,1).toUpperCase())}</span>
          <div class="r-deal__mid">
            <span class="r-deal__name">${i(e.name||"Без имени")}</span>
            <span class="r-deal__meta">${e.contractNo?`№ ${i(e.contractNo)}`:"Договор"}${e.probe?` · ${i(e.probe)} пр.`:""}${e.weight?` · ${i(e.weight)} г`:""}</span>
          </div>
          <div class="r-deal__right">
            <span class="r-deal__sum">${s(e.sum||0)}</span>
            <span class="r-deal__time">${i(e.time||"")}</span>
          </div>
        </div>`).join(""):'<div class="r-empty">Сделок пока нет</div>',T=[c(null,f),c(`KPI · ${a.rangeLabel||""}`,`<div class="r-kpis">${v}</div>`),c(null,`<div class="r-cols r-cols--today">
        <div class="r-card r-card--keep r-card--today">
          <div class="r-card__title">Сегодня</div>
          <div class="r-today">
            <div class="r-today__stat"><span class="r-today__v mono-nums">${((D=a.today)==null?void 0:D.count)??0}</span><span class="r-today__k">сделок</span></div>
            <div class="r-today__stat"><span class="r-today__v mono-nums">${s(Number((N=a.today)==null?void 0:N.sumRub)||0)}</span><span class="r-today__k">оборот за день</span></div>
          </div>
        </div>
        <div class="r-card r-card--keep">
          <div class="r-card__title">Выкуп по пробам</div>
          <div class="r-card__sub">За грамм при текущем курсе${a.buybackPercent!=null?` · политика ${a.buybackPercent}%`:""}</div>
          <div class="r-probes">${I}</div>
        </div>
      </div>`),c(null,`<div class="r-card r-card--keep">
        <div class="r-card-head">
          <div>
            <div class="r-card__title">Денежный поток</div>
            <div class="r-card__sub">${i(a.rangeLabel||"")}</div>
          </div>
        </div>
        <div class="r-flow-chart">${W(a.flow,t,{valueKey:"sum",gradId:"rFlowGrad"})}</div>
      </div>`),c(null,`<div class="r-cols">
        <div class="r-card r-card--allow-break">
          <div class="r-card__title">Команда</div>
          <div class="r-card__sub">Топ по обороту</div>
          <div class="r-staff">${F}</div>
        </div>
        <div class="r-card r-card--allow-break">
          <div class="r-card__title">Рынок · 585 проба</div>
          <div class="r-card__sub">Наша цена против средней конкурентов</div>
          <div class="r-market">${A}</div>
        </div>
      </div>`),c(null,`<div class="r-card r-card--allow-break">
        <div class="r-card__title">Последние договоры</div>
        <div class="r-card__sub">${(a.recent||[]).length} операций за период</div>
        <div class="r-deals">${K}</div>
      </div>`)];return B({title:`Сводка дашборда — ${a.rangeLabel||""}`,fileName:`Сводка дашборда — ${a.rangeLabel||"отчёт"}`,bodyHtml:G({header:{sectionTitle:"Сводка дашборда",authorName:o,generatedAt:l,goldRate:n,goldSource:d},blocks:T}),theme:t,extraCss:ra})}export{ia as openDashboardReport};
