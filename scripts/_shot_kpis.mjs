import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'scripts/_shots';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://127.0.0.1:5557';
const pages = [
  ['home', '/ru/'],
  ['prodat', '/ru/prodat/'],
  ['agenty', '/ru/agenty/'],
  ['slitki', '/ru/slitki/'],
  ['resale', '/ru/resale/'],
  ['franshiza', '/ru/franshiza/'],
  ['partneram', '/ru/partneram/'],
];

const browser = await chromium.launch();

async function shootKpis(page, name, suffix) {
  const kpis = page.locator('.rl-kpis').first();
  await kpis.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('.rl-kpis img')];
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, { timeout: 15000 });
  await page.waitForTimeout(900);
  await kpis.screenshot({ path: `${OUT}/kpi-${name}-${suffix}.png` });
  console.log(`OK kpi-${name}-${suffix}`);
}

for (const [name, path] of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await shootKpis(page, name, 'dark');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await shootKpis(page, name, 'light');
  if (errors.length) console.log(`ERRORS ${name}:`, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// мобильная проверка одной страницы в обеих темах
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(BASE + '/ru/prodat/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await shootKpis(page, 'prodat-mobile', theme);
  await ctx.close();
}

await browser.close();
console.log('done');
