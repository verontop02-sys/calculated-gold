/**
 * Post-process the existing russia-regions.geojson:
 *  1. Fix name_ru — add missing spaces (GADM strips them in NL_NAME_1)
 *  2. Add Crimea (Republic of Crimea + Sevastopol) as explicit features
 *
 * Run: node scripts/fix-russia-geo.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEO = path.join(__dirname, '..', 'client', 'public', 'russia-regions.geojson');
const DIST = path.join(__dirname, '..', 'client', 'dist', 'russia-regions.geojson');

// ── Fix name_ru ───────────────────────────────────────────────────────────────
function fixRuName(s) {
  if (!s || s === 'NA') return s;

  // Remove only stress-mark accents (acute U+0301, grave U+0300) — NOT breve U+0306 (used in й)
  s = s.normalize('NFD').replace(/[\u0300\u0301]/g, '').normalize('NFC');

  // "Магадан|Магаданскаяобласть" → take part after last pipe
  if (s.includes('|')) s = s.split('|').pop();

  // Remove bracketed suffixes: "(горсовет)"
  s = s.replace(/\s*\(.*?\)\s*/g, '').trim();

  // Fix Latin-lookalike initial letters (GADM quirk, e.g. "E" instead of "Е")
  s = s.replace(/^E([а-яё])/u, 'Е$1');

  // Insert space on transition lowercase → uppercase Cyrillic only
  // e.g. "РеспубликаАдыгея" → "Республика Адыгея"
  // Do NOT break uppercase abbreviations like "АО", "АОб"
  s = s.replace(/([а-яё])([А-ЯЁ])/gu, '$1 $2');

  // Insert space before suffix words that may have stayed lower-case concatenated
  // e.g. "Алтайскийкрай" → "Алтайский край"
  const suffixes = ['область', 'края', 'край', 'округ'];
  for (const suf of suffixes) {
    const re = new RegExp(`([а-яёА-ЯЁ-])(${suf})`, 'gi');
    s = s.replace(re, (_, p1, p2) => `${p1} ${p2}`);
  }

  // Normalise autonomous okrug abbreviations
  s = s.replace(/\s*АОк\s*/g, ' АО').replace(/\s*АОб\s*/g, ' АО');

  // Trim double spaces
  s = s.replace(/\s{2,}/g, ' ').trim();

  return s;
}

// ── Crimea polygons — accurate simplified outline ─────────────────────────────
// Republic of Crimea: real coastline + Arabat Spit + Kerch Peninsula
const crimeaCoords = [[
  // Perekop isthmus (N, mainland connection)
  [33.72, 46.10], [34.20, 46.14], [34.76, 46.10], [35.12, 46.05],
  // Sivash lake eastern shore / Arabat Spit base
  [35.22, 45.95], [35.42, 45.75], [35.70, 45.55],
  // Kerch Peninsula east coast
  [36.00, 45.35], [36.40, 45.37], [36.65, 45.28],
  // SE Kerch → Feodosiya
  [36.52, 45.10], [36.18, 45.00], [35.92, 44.86], [35.62, 44.72],
  // Cape Meganom → Alushta → Yalta
  [35.15, 44.58], [34.75, 44.48], [34.40, 44.49], [34.10, 44.49],
  // Cape Sarych (southernmost)
  [33.70, 44.39],
  // SW coast → Sevastopol area
  [33.42, 44.55], [33.38, 44.65],
  // Cape Khersones → W coast
  [33.05, 44.82], [32.72, 45.00], [32.52, 45.24],
  // Cape Tarkhankut (westernmost)
  [32.48, 45.52],
  // NW coast back to Perekop
  [32.62, 45.80], [32.95, 46.02], [33.38, 46.09], [33.72, 46.10],
]];

// City of Sevastopol (federal city, SW Crimea)
const sevCoords = [[
  [33.28, 44.68], [33.32, 44.76], [33.44, 44.80], [33.60, 44.78],
  [33.68, 44.70], [33.62, 44.58], [33.48, 44.55], [33.36, 44.60],
  [33.28, 44.68],
]];

const crimeaFeatures = [
  {
    type: 'Feature',
    properties: { hasc: 'RU.CR', name: 'Crimea', name_ru: 'Республика Крым' },
    geometry: { type: 'Polygon', coordinates: crimeaCoords },
  },
  {
    type: 'Feature',
    properties: { hasc: 'RU.SE', name: 'Sevastopol', name_ru: 'Севастополь' },
    geometry: { type: 'Polygon', coordinates: sevCoords },
  },
];

// ── Apply fixes ───────────────────────────────────────────────────────────────
const geo = JSON.parse(fs.readFileSync(GEO, 'utf8'));

// Fix names
let fixedCount = 0;
for (const f of geo.features) {
  const orig = f.properties.name_ru;
  const fixed = fixRuName(orig);
  if (fixed !== orig) {
    console.log(`  Fixed: "${orig}" → "${fixed}"`);
    f.properties.name_ru = fixed;
    fixedCount++;
  }
}
console.log(`Fixed ${fixedCount} name_ru values`);

// Remove existing Crimea features if any (idempotent)
geo.features = geo.features.filter(
  (f) => !['RU.CR', 'RU.SE'].includes(f.properties?.hasc)
);

// Add Crimea
geo.features.push(...crimeaFeatures);
console.log('Added Crimea (RU.CR) and Sevastopol (RU.SE)');

const out = JSON.stringify(geo);
fs.writeFileSync(GEO, out, 'utf8');
console.log(`Saved ${(out.length / 1024).toFixed(0)} KB → ${GEO}`);

// Copy to dist if it exists
if (fs.existsSync(path.dirname(DIST))) {
  fs.writeFileSync(DIST, out, 'utf8');
  console.log(`Copied → ${DIST}`);
}
