import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfmakeRoot = dirname(require.resolve('pdfmake/package.json'));

let _fonts;
function ensureFonts() {
  if (_fonts) return;
  const reg = (p, alias) => {
    const r = GlobalFonts.registerFromPath(p, alias);
    if (r == null) throw new Error(`Font register failed: ${p}`);
  };
  reg(join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Regular.ttf'), 'AnCanvas');
  reg(join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Medium.ttf'), 'AnCanvasB');
  _fonts = true;
}

function yTicks(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return [0, 1, 0.2];
  const d = (max - min) / 5;
  if (d < 1e-12) return [min, max, (max - min) / 5 || 0.1];
  const s = 10 ** Math.floor(Math.log10(d));
  const m = s * Math.ceil(d / s);
  const t0 = Math.floor(min / m) * m;
  const t1 = Math.ceil(max / m) * m;
  const step = (t1 - t0) / 5;
  if (t1 - t0 < 1e-9) return [0, 1, 0.2];
  return [t0, t1, step > 0 ? step : 1];
}

/**
 * @param {number} n
 * @param {boolean} isRub
 */
function yAxisText(n, isRub) {
  if (!isRub) {
    if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return n.toFixed(n % 1 ? 1 : 0);
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

/**
 * @param {object} opts
 * @param {string[]} opts.labels
 * @param {number[]} opts.values
 * @param {string} [opts.yUnit] "₽" or "г"
 * @param {string} [opts.color] stroke
 * @param {boolean} [opts.fillUnder]
 * @param {string} [opts.caption] вверху слева
 */
export async function renderLineChartPng({
  width = 920,
  height = 300,
  labels = [],
  values = [],
  yUnit = '₽',
  color = '#b8860b',
  fillUnder = true,
  caption = 'Денежный поток',
  isCurrency = true,
} = {}) {
  ensureFonts();
  const w = width;
  const h = height;
  const pl = 52;
  const pr = 20;
  const pt = 38;
  const pb = 52;
  const G = 8;
  const n = values.length;
  if (n < 1 || !labels.length) {
    return Buffer.alloc(0);
  }
  const finite = values.filter((v) => Number.isFinite(v));
  let lo = finite.length ? Math.min(...finite) : 0;
  let hi = finite.length ? Math.max(...finite) : 0;
  if (lo === hi) {
    lo -= Math.abs(hi) * 0.05 + 0.1;
    hi += Math.abs(hi) * 0.05 + 0.1;
  } else {
    const pad = (hi - lo) * 0.1;
    lo -= pad;
    hi += pad;
  }
  const [t0, t1] = yTicks(lo, hi);
  const tickN = 5;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#faf8f4';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0f172a08';
  for (let y = 0; y < h; y += G) {
    for (let x = 0; x < w; x += G) {
      if ((x / G + y / G) % 2 === 0) ctx.fillRect(x, y, G, 1);
    }
  }
  const chartW = w - pl - pr;
  const chartH = h - pt - pb;
  ctx.strokeStyle = '#e2ddd4';
  ctx.lineWidth = 1;
  for (let i = 0; i <= tickN; i++) {
    const ty = t0 + (i * (t1 - t0)) / tickN;
    const y = pt + chartH - ((ty - t0) / (t1 - t0)) * chartH;
    ctx.beginPath();
    ctx.moveTo(pl, y);
    ctx.lineTo(pl + chartW, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#5c5348';
  ctx.font = '12px "AnCanvas"';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= tickN; i++) {
    const ty = t0 + (i * (t1 - t0)) / tickN;
    const y = pt + chartH - ((ty - t0) / (t1 - t0)) * chartH;
    const txt = isCurrency ? yAxisText(ty, true) : yAxisText(ty, false);
    ctx.fillText(String(txt), pl - 4, y);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '11px "AnCanvasB"';
  ctx.fillStyle = '#1c1917';
  ctx.fillText(caption, 12, 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#5c5348';
  const stepL = n > 24 ? Math.ceil(n / 12) : n > 14 ? 2 : 1;
  for (let i = 0; i < n; i += stepL) {
    const x = n === 1 ? pl + chartW / 2 : pl + (i / (n - 1)) * chartW;
    if (i === 0 || i === n - 1) {
      // ok
    }
    if (i % stepL === 0 || i === 0 || i === n - 1) {
      const lab = String(labels[i] ?? '—');
      const shorted = lab.length > 7 ? lab.slice(0, 6) : lab;
      ctx.save();
      ctx.font = '9px "AnCanvas"';
      ctx.fillText(i === n - 1 ? shorted : shorted, x, h - 34);
      ctx.restore();
    }
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#6b655c';
  ctx.font = '9px "AnCanvas"';
  ctx.fillText(yUnit, w - 12, pt);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const v = values[i] ?? 0;
    const vx = n === 1 ? pl + chartW / 2 : pl + (i / Math.max(1, n - 1)) * chartW;
    const cl = v < t0 ? t0 : v > t1 ? t1 : v;
    const vy = pt + chartH - ((cl - t0) / (t1 - t0)) * chartH;
    pts.push({ x: vx, y: vy });
  }
  if (fillUnder && pts.length) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pt + chartH);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(pts[pts.length - 1].x, pt + chartH);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, pt, 0, pt + chartH);
    g.addColorStop(0, `${color}4d`);
    g.addColorStop(1, `${color}0d`);
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
    else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
  for (const p of pts) {
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  return await canvas.encode('png');
}

/**
 * Два ряда на одной шкале (нормированы по min/max объединения).
 * @param {{ labels: string[], a: number[], b: number[], nameA: string, nameB: string, cap: string, colorA: string, colorB: string }} p
 */
export async function renderDualLineChartPng(p = {}) {
  ensureFonts();
  const {
    width = 920,
    height = 300,
    labels = [],
    a = [],
    b = [],
    nameA = 'лом, г',
    nameB = 'чист., г',
    cap = 'Вес, г — динамика (1-я позиция)',
    colorA = '#34d399',
    colorB = '#8b5cf6',
  } = p;
  const loa = a.filter((x) => Number.isFinite(x)).length ? Math.min(...a) : 0;
  const hia = a.filter((x) => Number.isFinite(x)).length ? Math.max(...a) : 0;
  const lob = b.filter((x) => Number.isFinite(x)).length ? Math.min(...b) : 0;
  const hib = b.filter((x) => Number.isFinite(x)).length ? Math.max(...b) : 0;
  let lo = Math.min(loa, lob);
  let hi = Math.max(hia, hib, 0.01);
  if (lo === hi) {
    lo -= 0.1;
    hi += 0.1;
  } else {
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
  }
  const t0 = lo;
  const t1 = hi;
  const w = width;
  const h = height;
  const pl = 52;
  const pr = 20;
  const pt = 46;
  const pb = 50;
  const n = Math.max(a.length, b.length, 1);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#faf8f4';
  ctx.fillRect(0, 0, w, h);
  const chartW = w - pl - pr;
  const chartH = h - pt - pb;
  const ticks = 5;
  ctx.strokeStyle = '#e2ddd4';
  for (let i = 0; i <= ticks; i++) {
    const ty = t0 + (i * (t1 - t0)) / ticks;
    const y2 = pt + chartH - ((ty - t0) / (t1 - t0)) * chartH;
    ctx.beginPath();
    ctx.moveTo(pl, y2);
    ctx.lineTo(pl + chartW, y2);
    ctx.stroke();
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#5c5348';
  ctx.font = '10px "AnCanvas"';
  for (let i = 0; i <= ticks; i++) {
    const ty = t0 + (i * (t1 - t0)) / ticks;
    const y2 = pt + chartH - ((ty - t0) / (t1 - t0)) * chartH;
    const tt = String(ty < 0.1 ? Number(ty.toFixed(3)) : Number(ty.toFixed(2).replace(/\.?0+$/, '')));
    ctx.fillText(tt, pl - 4, y2);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1c1917';
  ctx.font = '12px "AnCanvasB"';
  ctx.fillText(cap, 12, 6);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = colorA;
  ctx.fillText(`● ${nameA}`, w - 12, 6);
  const la = ctx.measureText(`● ${nameA}`).width;
  ctx.textAlign = 'right';
  ctx.fillStyle = colorB;
  ctx.fillText(`● ${nameB}`, w - 18 - la, 6);

  function oneLine(arr, col) {
    if (!arr || !arr.length) return;
    let started = false;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (!Number.isFinite(v)) continue;
      const vx = n === 1 ? pl + chartW / 2 : pl + (i / (n - 1)) * chartW;
      const cl = v < t0 ? t0 : v > t1 ? t1 : v;
      const vy = pt + chartH - ((cl - t0) / (t1 - t0)) * chartH;
      if (!started) {
        ctx.moveTo(vx, vy);
        started = true;
      } else {
        ctx.lineTo(vx, vy);
      }
    }
    if (started) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (!Number.isFinite(v)) continue;
      const vx = n === 1 ? pl + chartW / 2 : pl + (i / (n - 1)) * chartW;
      const cl = v < t0 ? t0 : v > t1 ? t1 : v;
      const vy = pt + chartH - ((cl - t0) / (t1 - t0)) * chartH;
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.3;
      ctx.arc(vx, vy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  oneLine(a, colorA);
  oneLine(b, colorB);

  const slb = n > 24 ? Math.ceil(n / 10) : n > 12 ? 2 : 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#5c5348';
  ctx.font = '9px "AnCanvas"';
  for (let i = 0; i < n; i += slb) {
    const x = n === 1 ? pl + chartW / 2 : pl + (i / (n - 1)) * chartW;
    const lab = String(labels[i] ?? '—');
    ctx.fillText(lab.length > 8 ? lab.slice(0, 7) : lab, x, h - 30);
  }
  if (n > 1) {
    const i = n - 1;
    if ((i % slb) !== 0) {
      const x = pl + (i / (n - 1)) * chartW;
      const lab = String(labels[i] ?? '—');
      ctx.fillText(lab.length > 8 ? lab.slice(0, 7) : lab, x, h - 30);
    }
  }
  return await canvas.encode('png');
}

/**
 * @param {Array<{probe:number, count: number, sumRub?: number}>} rows
 */
export async function renderBarChartPng({ rows = [], cap = 'Сделок по пробе (1-я позиция)' } = {}) {
  ensureFonts();
  if (!rows.length) return Buffer.alloc(0);
  const w = 920;
  const h = 280;
  const pl = 50;
  const pr = 22;
  const pt = 44;
  const pb = 46;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#faf8f4';
  ctx.fillRect(0, 0, w, h);
  const vals = rows.map((r) => Math.max(0, Number(r.count) || 0));
  const max = Math.max(1, ...vals);
  const t1 = max * 1.12;
  const chartH = h - pt - pb;
  const n = rows.length;
  const gap = 10;
  const barW = (w - pl - pr - (n - 1) * gap) / n;
  ctx.fillStyle = '#1c1917';
  ctx.font = '12px "AnCanvasB"';
  ctx.textAlign = 'left';
  ctx.fillText(cap, 12, 8);
  for (let i = 0; i <= 4; i++) {
    const y = t1 * (1 - i / 4);
    const py = pt + (chartH * i) / 4;
    ctx.strokeStyle = '#e2ddd4';
    ctx.beginPath();
    ctx.moveTo(pl, py);
    ctx.lineTo(w - pr, py);
    ctx.stroke();
    ctx.fillStyle = '#5c5348';
    ctx.font = '10px "AnCanvas"';
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(t1 * (1 - i / 4))), pl - 4, py - 5);
  }
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    const x = pl + i * (barW + gap);
    const bh = (v / t1) * chartH;
    const y0 = pt + chartH - bh;
    const g = ctx.createLinearGradient(x, y0, x, y0 + bh);
    g.addColorStop(0, '#d4a20d');
    g.addColorStop(1, '#7c5a0a');
    ctx.fillStyle = g;
    const bw = barW;
    const barY = y0;
    ctx.beginPath();
    ctx.rect(x, barY, bw, Math.max(1, bh));
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    ctx.font = '12px "AnCanvasB"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(v), x + bw / 2, y0 - 2);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#3d3831';
    ctx.font = '10px "AnCanvas"';
    const p = rows[i].probe;
    const lab = typeof p === 'number' && Number.isFinite(p) ? `${p} пр` : '—';
    ctx.fillText(lab, x + bw / 2, h - 28);
  }
  return await canvas.encode('png');
}
