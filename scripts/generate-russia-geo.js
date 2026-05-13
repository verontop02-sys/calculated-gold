/**
 * One-time script: fetch GADM Russia admin-1 GeoJSON, simplify coordinates,
 * strip unused properties, save to client/public/russia-regions.geojson
 *
 * Run: node scripts/generate-russia-geo.js
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'client', 'public', 'russia-regions.geojson');

const GADM_URL = 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_RUS_1.json';
const PRECISION = 3; // decimal places (~100m at Russia latitudes)

// ── Ramer-Douglas-Peucker ────────────────────────────────────────────────────
function sqSegDist(p, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  return (p[0] - x) ** 2 + (p[1] - y) ** 2;
}
function rdpSlice(pts, start, end, sqTol, keep) {
  let maxD = 0, idx = start;
  for (let i = start + 1; i < end; i++) {
    const d = sqSegDist(pts[i], pts[start], pts[end]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > sqTol) {
    rdpSlice(pts, start, idx, sqTol, keep);
    keep.add(idx);
    rdpSlice(pts, idx, end, sqTol, keep);
  }
}
function rdp(pts, tol) {
  if (pts.length <= 3) return pts.slice();
  const sqTol = tol * tol;
  const keep = new Set([0, pts.length - 1]);
  rdpSlice(pts, 0, pts.length - 1, sqTol, keep);
  return [...keep].sort((a, b) => a - b).map(i => pts[i]);
}

// ── coordinate rounding ──────────────────────────────────────────────────────
const M = 10 ** PRECISION;
function roundCoord(c) { return [Math.round(c[0] * M) / M, Math.round(c[1] * M) / M]; }

function simplifyRing(ring, tol) {
  // RDP first, then round coordinates
  const simplified = rdp(ring, tol);
  const rounded = simplified.map(roundCoord);
  // Remove consecutive duplicates
  const deduped = [rounded[0]];
  for (let i = 1; i < rounded.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (rounded[i][0] !== prev[0] || rounded[i][1] !== prev[1]) {
      deduped.push(rounded[i]);
    }
  }
  // Close ring if needed
  const first = deduped[0], last = deduped[deduped.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) deduped.push(first);
  return deduped.length >= 4 ? deduped : ring.map(roundCoord);
}

/** Shoelace formula for ring area (absolute value) */
function ringArea(ring) {
  let area = 0;
  for (let i = 0, n = ring.length - 1; i < ring.length; n = i++) {
    area += (ring[n][0] + ring[i][0]) * (ring[n][1] - ring[i][1]);
  }
  return Math.abs(area) / 2;
}

function simplifyGeometry(geom, tol, minArea) {
  if (!geom) return geom;
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates.map(r => simplifyRing(r, tol));
    return { ...geom, coordinates: rings };
  }
  if (geom.type === 'MultiPolygon') {
    // Filter out tiny sub-polygons by outer ring area
    const polys = geom.coordinates
      .filter(poly => ringArea(poly[0]) >= minArea)
      .map(poly => poly.map(r => simplifyRing(r, tol)));
    if (polys.length === 0) return null;
    return { ...geom, coordinates: polys };
  }
  return geom;
}

// ── fetch ────────────────────────────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const get = (u) =>
      https.get(u, { headers: { 'User-Agent': 'ReactivoGoldIndex/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }).on('error', reject);
    get(url);
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
console.log('Fetching GADM Russia admin-1 GeoJSON…');
const raw = await fetchUrl(GADM_URL);
const orig = JSON.parse(raw);
console.log(`  ${orig.features.length} features, ${(raw.length / 1024).toFixed(0)} KB original`);

const TOL = 0.06;
const MIN_AREA = 0.08; // sq degrees — filter out tiny islands/exclaves
const simplified = {
  type: 'FeatureCollection',
  features: orig.features
    .map((f) => ({
      type: 'Feature',
      properties: {
        hasc: f.properties.HASC_1,       // "RU.AD" → ISO "RU-AD"
        name: f.properties.NAME_1,       // English
        name_ru: f.properties.NL_NAME_1, // Russian (GADM drops spaces)
      },
      geometry: simplifyGeometry(f.geometry, TOL, MIN_AREA),
    }))
    .filter((f) => f.geometry !== null),
};

const out = JSON.stringify(simplified);
fs.writeFileSync(OUT, out, 'utf8');
console.log(`Saved ${(out.length / 1024).toFixed(0)} KB → ${OUT}`);
