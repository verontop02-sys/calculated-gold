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

  // Insert space on transition lowercase Cyrillic → uppercase Cyrillic
  // e.g. "РеспубликаАдыгея" → "Республика Адыгея"
  s = s.replace(/([а-яёА-ЯЁ])([А-ЯЁ])/gu, '$1 $2');

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

// ── Crimea polygons (simplified, ~100 m precision) ────────────────────────────
// Republic of Crimea — main peninsula outline
const crimeaCoords = [[
  [33.60, 46.07], [33.88, 46.10], [34.27, 46.10], [34.60, 46.08],
  [35.03, 46.00], [35.47, 45.89], [35.80, 45.75], [36.10, 45.54],
  [36.35, 45.40], [36.63, 45.22], [36.20, 44.92], [35.90, 44.71],
  [35.47, 44.54], [35.00, 44.38], [34.52, 44.41], [34.10, 44.43],
  [33.56, 44.53], [33.12, 44.66], [32.80, 44.87], [32.60, 45.05],
  [32.51, 45.30], [32.53, 45.58], [32.73, 45.82], [33.10, 46.02],
  [33.60, 46.07],
]];

// City of Sevastopol (federal city, SW Crimea — small enclave around city)
const sevCoords = [[
  [33.34, 44.72], [33.36, 44.76], [33.45, 44.79], [33.57, 44.77],
  [33.63, 44.68], [33.56, 44.60], [33.45, 44.58], [33.36, 44.63],
  [33.34, 44.72],
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
